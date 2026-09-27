/**
 * Locates the command line tools Logoscribe needs. Order: an explicit env var,
 * the project's own tools/bin folder (where the Windows installer puts them),
 * every folder on the PATH, and finally Homebrew's folders, which may be
 * missing from the PATH when the app is started from Finder.
 */
import fs from "node:fs";
import path from "node:path";

export type Tool = "ffmpeg" | "ffprobe" | "whisper-cli";

const ENV: Record<Tool, string> = { ffmpeg: "FFMPEG_PATH", ffprobe: "FFPROBE_PATH", "whisper-cli": "WHISPER_CLI_PATH" };

/** Older whisper.cpp releases (and some Homebrew versions) named the binary differently. */
const NAMES: Record<Tool, string[]> = {
  ffmpeg: ["ffmpeg"],
  ffprobe: ["ffprobe"],
  "whisper-cli": ["whisper-cli", "whisper-cpp"],
};

const EXTRA_DIRS = process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : [];

const found = new Map<Tool, string>();

/** Folders searched for the tools, for diagnostics shown to the user. */
export function searchedDirs(): string[] {
  return [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "tools", "bin"),
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    ...EXTRA_DIRS,
  ].filter((d, i, all) => all.indexOf(d) === i);
}

export function tool(name: Tool): string {
  const cached = found.get(name);
  if (cached) return cached;

  const fromEnv = process.env[ENV[name]];
  if (fromEnv) return remember(name, fromEnv);

  const exe = (n: string) => (process.platform === "win32" ? `${n}.exe` : n);
  for (const dir of searchedDirs()) {
    for (const n of NAMES[name]) {
      const candidate = path.join(dir, exe(n));
      if (isExecutable(candidate)) return remember(name, candidate);
    }
  }
  // Not found: let spawn report it, and look again next time (it may get installed meanwhile).
  return name;
}

function remember(name: Tool, resolved: string) {
  found.set(name, resolved);
  return resolved;
}

function isExecutable(file: string) {
  try {
    fs.accessSync(file, process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
