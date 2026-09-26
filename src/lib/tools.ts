/**
 * Locates the command line tools Logoscribe needs. Order: an explicit env var,
 * then the project's own tools/bin folder (where the Windows installer puts
 * them), then whatever is on the PATH (Homebrew on Mac).
 */
import fs from "node:fs";
import path from "node:path";

const ENV: Record<Tool, string> = { ffmpeg: "FFMPEG_PATH", ffprobe: "FFPROBE_PATH", "whisper-cli": "WHISPER_CLI_PATH" };

export type Tool = "ffmpeg" | "ffprobe" | "whisper-cli";

const cache = new Map<Tool, string>();

export function tool(name: Tool): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const fromEnv = process.env[ENV[name]];
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const local = path.join(/*turbopackIgnore: true*/ process.cwd(), "tools", "bin", exe);
  const resolved = fromEnv || (fs.existsSync(local) ? local : name);
  cache.set(name, resolved);
  return resolved;
}
