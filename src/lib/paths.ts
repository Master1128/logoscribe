import os from "node:os";
import path from "node:path";

/**
 * App data (library database, audio, models) lives in the OS's per-user app
 * data folder, never next to the code: Documents and Desktop are often synced
 * by iCloud or OneDrive, which duplicates files mid-write and can corrupt the
 * SQLite database.
 */
function defaultDataDir() {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Logoscribe");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Logoscribe");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "logoscribe");
}

export const DATA_DIR = path.resolve(process.env.LOGOSCRIBE_DATA_DIR ?? defaultDataDir());

/** Where versions before 2026-09-26 kept their data; moved to DATA_DIR on first run. */
export const LEGACY_DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "data");

export function sermonDir(id: string) {
  return path.join(DATA_DIR, "sermons", id);
}

export const sermonFiles = (id: string) => {
  const dir = sermonDir(id);
  return {
    dir,
    /** Browser-friendly transcode used for playback and trimming UI. */
    preview: path.join(dir, "preview.mp3"),
    peaks: path.join(dir, "peaks.json"),
    analysis: path.join(dir, "analysis.json"),
    work: path.join(dir, "work"),
  };
};
