import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, LEGACY_DATA_DIR } from "./paths";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  preacher TEXT,
  series TEXT,
  service_date TEXT,
  source_name TEXT,
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  duration REAL,
  trim_start REAL,
  trim_end REAL,
  detected_start REAL,
  detected_end REAL,
  engine TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sermon_id TEXT NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, id);

-- Raw engine output, timestamps relative to the original (untrimmed) audio.
CREATE TABLE IF NOT EXISTS segments (
  sermon_id TEXT NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start REAL NOT NULL,
  end REAL NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (sermon_id, idx)
);

-- The organized document the team reviews and exports.
CREATE TABLE IF NOT EXISTS blocks (
  sermon_id TEXT NOT NULL REFERENCES sermons(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('heading', 'paragraph')),
  text TEXT NOT NULL,
  start REAL,
  end REAL,
  PRIMARY KEY (sermon_id, idx)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS sermons_fts USING fts5(
  sermon_id UNINDEXED, title, preacher, series, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

const globalForDb = globalThis as unknown as { __logoscribeDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__logoscribeDb) {
    moveLegacyData();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, "logoscribe.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    migrate(conn);
    rewriteLegacyPaths(conn);
    globalForDb.__logoscribeDb = conn;
  }
  return globalForDb.__logoscribeDb;
}

/** Moves ./data (older versions) into the app data folder, once. */
function moveLegacyData() {
  if (DATA_DIR === LEGACY_DATA_DIR) return;
  if (!fs.existsSync(path.join(LEGACY_DATA_DIR, "logoscribe.db")) || fs.existsSync(path.join(DATA_DIR, "logoscribe.db"))) return;
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  try {
    fs.renameSync(LEGACY_DATA_DIR, DATA_DIR);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return; // the web server and the worker start together; the other one moved it
    if (code === "EXDEV" || code === "ENOTEMPTY" || code === "EEXIST") {
      fs.cpSync(LEGACY_DATA_DIR, DATA_DIR, { recursive: true });
      fs.rmSync(LEGACY_DATA_DIR, { recursive: true, force: true });
    } else throw err;
  }
}

/** Absolute paths saved by older versions still point inside ./data. */
function rewriteLegacyPaths(conn: DatabaseSync) {
  if (DATA_DIR === LEGACY_DATA_DIR) return;
  const prefix = LEGACY_DATA_DIR + path.sep;
  conn.prepare("UPDATE sermons SET source_path = ? || substr(source_path, ?) WHERE source_path LIKE ? || '%'")
    .run(DATA_DIR + path.sep, prefix.length + 1, prefix);
  for (const key of ["localModelPath", "localVadModelPath"]) {
    const row = conn.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    const value = row && (JSON.parse(row.value) as string);
    if (value?.startsWith(prefix)) {
      conn.prepare("UPDATE settings SET value = ? WHERE key = ?").run(JSON.stringify(DATA_DIR + path.sep + value.slice(prefix.length)), key);
    }
  }
}

/** Additive column migrations for databases created by earlier versions. */
function migrate(conn: DatabaseSync) {
  const columns = new Set((conn.prepare("PRAGMA table_info(sermons)").all() as { name: string }[]).map((c) => c.name));
  if (!columns.has("source_url")) conn.exec("ALTER TABLE sermons ADD COLUMN source_url TEXT");
  // The in-browser engine was removed: send its sermons back to review.
  conn.exec(`UPDATE sermons SET status = CASE WHEN status = 'transcribing' THEN 'review' ELSE status END, engine = NULL
             WHERE engine = 'browser'`);
  // Notes from the old Claude-only organizer are obsolete now that the basic one is the default.
  conn.exec(`UPDATE sermons SET error = NULL WHERE status = 'ready' AND error LIKE 'Falta ANTHROPIC_API_KEY%'`);
  normalizeStoredText(conn);
  // Sermons created before titles were indexed on creation.
  conn.exec(`INSERT INTO sermons_fts (sermon_id, title, preacher, series, body)
             SELECT id, title, COALESCE(preacher, ''), COALESCE(series, ''), '' FROM sermons
             WHERE id NOT IN (SELECT sermon_id FROM sermons_fts)`);
}

/** Composes decomposed accents saved by earlier versions (titles pasted from macOS file names). */
function normalizeStoredText(conn: DatabaseSync) {
  const fields = ["title", "preacher", "series", "source_name"] as const;
  const rows = conn.prepare("SELECT id, title, preacher, series, source_name FROM sermons").all() as Record<string, string | null>[];
  for (const row of rows) {
    const fixed = fields.map((f) => row[f]?.normalize("NFC") ?? null);
    if (fields.every((f, i) => fixed[i] === row[f])) continue;
    conn.prepare("UPDATE sermons SET title = ?, preacher = ?, series = ?, source_name = ? WHERE id = ?").run(...fixed, row.id);
    conn.prepare("UPDATE sermons_fts SET title = ?, preacher = ?, series = ? WHERE sermon_id = ?")
      .run(fixed[0], fixed[1] ?? "", fixed[2] ?? "", row.id);
  }
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
