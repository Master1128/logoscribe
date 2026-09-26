/**
 * Server side of in-browser transcription: the sermon is split into ~5 min
 * parts (cut in pauses); a user's browser fetches each part, transcribes it
 * on its own GPU and posts the segments back. Finished parts are kept, so a
 * closed tab resumes where it left off.
 */
import fs from "node:fs";
import path from "node:path";
import { sermonFiles } from "./paths";
import { enqueue, saveSegments, setStatus } from "./repo";
import { cleanSegments, planChunks } from "./transcribe";
import type { Analysis, Segment, Sermon } from "./types";

const PART_SEC = 300;
/** A browser that stops sending heartbeats for this long loses the sermon. */
const LOCK_TTL_MS = 45_000;

export interface BrowserPart {
  index: number;
  start: number;
  end: number;
  done: boolean;
}

function partFile(sermon: Sermon, p: { index: number; start: number; end: number }) {
  return path.join(sermonFiles(sermon.id).work, `browser-${p.index}-${p.start.toFixed(1)}-${p.end.toFixed(1)}.json`);
}

export function browserParts(sermon: Sermon): BrowserPart[] {
  const analysis = JSON.parse(fs.readFileSync(sermonFiles(sermon.id).analysis, "utf8")) as Analysis;
  return planChunks(sermon.trim_start ?? 0, sermon.trim_end ?? sermon.duration!, analysis.energyDb, PART_SEC).map((c, index) => {
    const part = { index, start: c.start, end: c.end };
    return { ...part, done: fs.existsSync(partFile(sermon, part)) };
  });
}

/** Stores one part; when it was the last one, hands the sermon to the formatter. */
export function saveBrowserPart(sermon: Sermon, index: number, segments: Segment[]): { complete: boolean } {
  const parts = browserParts(sermon);
  const part = parts[index];
  if (!part) throw new Error("Parte inexistente");
  fs.mkdirSync(sermonFiles(sermon.id).work, { recursive: true });
  // Keep only segments inside this part's range (guards against clock drift).
  const inside = segments.filter((s) => s.start >= part.start - 1 && s.start < part.end + 1);
  fs.writeFileSync(partFile(sermon, part), JSON.stringify(inside));

  if (!parts.every((p) => p.done || p.index === index)) return { complete: false };
  const all = parts.flatMap((p) => JSON.parse(fs.readFileSync(partFile(sermon, p), "utf8")) as Segment[]);
  saveSegments(sermon.id, cleanSegments(all.sort((a, b) => a.start - b.start)));
  fs.rmSync(sermonFiles(sermon.id).work, { recursive: true, force: true });
  setStatus(sermon.id, "formatting");
  enqueue(sermon.id, "format");
  return { complete: true };
}

// ---------------------------------------------------------------- lock

interface Lock { owner: string; at: number }

const lockFile = (sermon: Sermon) => path.join(sermonFiles(sermon.id).work, "browser-lock.json");

export function readLock(sermon: Sermon): Lock | null {
  try {
    const lock = JSON.parse(fs.readFileSync(lockFile(sermon), "utf8")) as Lock;
    return Date.now() - lock.at < LOCK_TTL_MS ? lock : null;
  } catch {
    return null;
  }
}

/** Claims (or refreshes) the right to transcribe; false if another browser is on it. */
export function claimLock(sermon: Sermon, owner: string): boolean {
  const lock = readLock(sermon);
  if (lock && lock.owner !== owner) return false;
  fs.mkdirSync(sermonFiles(sermon.id).work, { recursive: true });
  fs.writeFileSync(lockFile(sermon), JSON.stringify({ owner, at: Date.now() }));
  return true;
}

export function releaseLock(sermon: Sermon) {
  fs.rmSync(lockFile(sermon), { force: true });
}
