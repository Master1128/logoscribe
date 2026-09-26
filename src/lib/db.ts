import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths";

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
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, "logoscribe.db"));
    conn.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    conn.exec(SCHEMA);
    migrate(conn);
    globalForDb.__logoscribeDb = conn;
  }
  return globalForDb.__logoscribeDb;
}

/** Additive column migrations for databases created by earlier versions. */
function migrate(conn: DatabaseSync) {
  const columns = new Set((conn.prepare("PRAGMA table_info(sermons)").all() as { name: string }[]).map((c) => c.name));
  if (!columns.has("source_url")) conn.exec("ALTER TABLE sermons ADD COLUMN source_url TEXT");
  // The in-browser engine was removed: send its sermons back to review.
  conn.exec(`UPDATE sermons SET status = CASE WHEN status = 'transcribing' THEN 'review' ELSE status END, engine = NULL
             WHERE engine = 'browser'`);
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
