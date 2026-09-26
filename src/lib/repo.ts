import fs from "node:fs";
import { nanoid } from "nanoid";
import { db, tx } from "./db";
import { sermonDir } from "./paths";
import type { Block, Job, Segment, Sermon, SermonStatus } from "./types";

type Row = Record<string, unknown>;

export function listSermons(): Sermon[] {
  return db().prepare("SELECT * FROM sermons ORDER BY COALESCE(service_date, created_at) DESC").all() as unknown as Sermon[];
}

export function getSermon(id: string): Sermon | null {
  return (db().prepare("SELECT * FROM sermons WHERE id = ?").get(id) as unknown as Sermon) ?? null;
}

/**
 * Text pasted from macOS file names comes decomposed ("i" + combining accent).
 * Store the composed form so search, exports and PDF fonts all see "í".
 */
const nfc = <T,>(v: T): T => (typeof v === "string" ? (v.normalize("NFC") as T) : v);

export function createSermon(
  data: Pick<Sermon, "title" | "preacher" | "series" | "service_date" | "source_name"> & { source_url?: string | null },
): Sermon {
  const id = nanoid(10);
  db().prepare(
    `INSERT INTO sermons (id, title, preacher, series, service_date, source_name, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, nfc(data.title), nfc(data.preacher), nfc(data.series), data.service_date, nfc(data.source_name), data.source_url ?? null);
  reindex(id); // findable by title and preacher before it's transcribed
  return getSermon(id)!;
}

const EDITABLE = ["title", "preacher", "series", "service_date", "trim_start", "trim_end", "engine", "status", "error",
  "duration", "detected_start", "detected_end", "source_path", "source_name"] as const;
type Editable = (typeof EDITABLE)[number];

export function updateSermon(id: string, patch: Partial<Pick<Sermon, Editable>>) {
  const entries = Object.entries(patch).filter(([k, v]) => (EDITABLE as readonly string[]).includes(k) && v !== undefined);
  if (!entries.length) return;
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  db().prepare(`UPDATE sermons SET ${sets}, updated_at = datetime('now') WHERE id = ?`)
    .run(...(entries.map(([k, v]) => (k === "source_path" ? v : nfc(v))) as (string | number | null)[]), id);
  if (entries.some(([k]) => ["title", "preacher", "series"].includes(k))) reindex(id);
}

export function setStatus(id: string, status: SermonStatus, error: string | null = null) {
  updateSermon(id, { status, error });
}

export function deleteSermon(id: string) {
  tx(() => {
    db().prepare("DELETE FROM sermons_fts WHERE sermon_id = ?").run(id);
    db().prepare("DELETE FROM sermons WHERE id = ?").run(id);
  });
  fs.rmSync(sermonDir(id), { recursive: true, force: true });
}

// ---------------------------------------------------------------- jobs

export function enqueue(sermonId: string, type: Job["type"]) {
  db().prepare("INSERT INTO jobs (sermon_id, type) VALUES (?, ?)").run(sermonId, type);
}

export function claimJob(types: Job["type"][]): Job | null {
  return tx(() => {
    const job = db().prepare(
      `SELECT * FROM jobs WHERE status = 'queued' AND type IN (${types.map(() => "?").join(", ")}) ORDER BY id LIMIT 1`,
    ).get(...types) as unknown as Job | undefined;
    if (!job) return null;
    db().prepare("UPDATE jobs SET status = 'running', started_at = datetime('now') WHERE id = ?").run(job.id);
    return { ...job, status: "running" };
  });
}

export function updateJob(id: number, patch: Partial<Pick<Job, "status" | "progress" | "message">>) {
  const finished = patch.status === "done" || patch.status === "failed";
  db().prepare(
    `UPDATE jobs SET status = COALESCE(?, status), progress = COALESCE(?, progress), message = COALESCE(?, message)
     ${finished ? ", finished_at = datetime('now')" : ""} WHERE id = ?`,
  ).run(patch.status ?? null, patch.progress ?? null, patch.message ?? null, id);
}

export function jobStatus(id: number): Job["status"] | null {
  return ((db().prepare("SELECT status FROM jobs WHERE id = ?").get(id) as { status: Job["status"] } | undefined)?.status) ?? null;
}

export function cancelJob(id: number) {
  db().prepare("UPDATE jobs SET status = 'canceled', finished_at = datetime('now') WHERE id = ? AND status IN ('queued', 'running')").run(id);
}

/** Jobs left 'running' by a worker that crashed or was restarted. */
export function requeueStale() {
  db().prepare("UPDATE jobs SET status = 'queued', progress = 0 WHERE status = 'running'").run();
}

export function activeJob(sermonId: string): Job | null {
  return (db().prepare(
    "SELECT * FROM jobs WHERE sermon_id = ? AND status IN ('queued', 'running') ORDER BY id LIMIT 1",
  ).get(sermonId) as unknown as Job) ?? null;
}

export function lastJob(sermonId: string): Job | null {
  return (db().prepare("SELECT * FROM jobs WHERE sermon_id = ? ORDER BY id DESC LIMIT 1").get(sermonId) as unknown as Job) ?? null;
}

// ---------------------------------------------------------------- content

export function saveSegments(sermonId: string, segments: Segment[]) {
  tx(() => {
    db().prepare("DELETE FROM segments WHERE sermon_id = ?").run(sermonId);
    const stmt = db().prepare("INSERT INTO segments (sermon_id, idx, start, end, text) VALUES (?, ?, ?, ?, ?)");
    segments.forEach((s, i) => stmt.run(sermonId, i, s.start, s.end, s.text));
  });
}

export function getSegments(sermonId: string): Segment[] {
  return db().prepare("SELECT start, end, text FROM segments WHERE sermon_id = ? ORDER BY idx").all(sermonId) as unknown as Segment[];
}

export function saveBlocks(sermonId: string, blocks: Block[]) {
  tx(() => {
    db().prepare("DELETE FROM blocks WHERE sermon_id = ?").run(sermonId);
    const stmt = db().prepare("INSERT INTO blocks (sermon_id, idx, kind, text, start, end) VALUES (?, ?, ?, ?, ?, ?)");
    blocks.forEach((b, i) => stmt.run(sermonId, i, b.kind, nfc(b.text), b.start, b.end));
  });
  reindex(sermonId);
}

export function getBlocks(sermonId: string): Block[] {
  return db().prepare("SELECT kind, text, start, end FROM blocks WHERE sermon_id = ? ORDER BY idx").all(sermonId) as unknown as Block[];
}

function reindex(sermonId: string) {
  const s = getSermon(sermonId);
  if (!s) return;
  const body = getBlocks(sermonId).map((b) => b.text).join("\n\n");
  tx(() => {
    db().prepare("DELETE FROM sermons_fts WHERE sermon_id = ?").run(sermonId);
    db().prepare("INSERT INTO sermons_fts (sermon_id, title, preacher, series, body) VALUES (?, ?, ?, ?, ?)")
      .run(sermonId, s.title, s.preacher ?? "", s.series ?? "", body);
  });
}

export interface SearchHit {
  sermon: Sermon;
  snippet: string;
}

/** Full-text search, accent-insensitive; each word is matched as a prefix. */
export function searchSermons(query: string): SearchHit[] {
  const terms = query
    .normalize("NFC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => `"${t}"*`);
  if (!terms.length) return [];
  const rows = db().prepare(
    `SELECT sermon_id, snippet(sermons_fts, 4, char(1), char(2), '…', 24) AS snippet
     FROM sermons_fts WHERE sermons_fts MATCH ? ORDER BY rank LIMIT 50`,
  ).all(terms.join(" ")) as Row[];
  return rows.flatMap((r) => {
    const sermon = getSermon(r.sermon_id as string);
    return sermon ? [{ sermon, snippet: highlight(r.snippet as string) }] : [];
  });
}

/** Escapes the snippet (it is user content) and turns FTS markers into <mark>. */
function highlight(snippet: string) {
  return snippet
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
}

export function distinctValues(column: "preacher" | "series"): string[] {
  return (db().prepare(`SELECT DISTINCT ${column} AS v FROM sermons WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY v`)
    .all() as Row[]).map((r) => r.v as string);
}
