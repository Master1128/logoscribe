import { spawn } from "node:child_process";
import { tool } from "./tools";


export function run(
  cmd: string,
  args: string[],
  opts: { onStderr?: (line: string) => void; onStdout?: (line: string) => void; signal?: AbortSignal } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], signal: opts.signal });
    let stdout = "";
    let stderrTail = "";
    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      // Progress-only callers (yt-dlp) don't need the whole output kept.
      if (opts.onStdout) for (const line of text.split(/\r|\n/)) { if (line.trim()) opts.onStdout(line); }
      else stdout += text;
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      if (opts.onStderr) for (const line of text.split(/\r|\n/)) if (line.trim()) opts.onStderr(line);
    });
    child.on("error", (err: NodeJS.ErrnoException) =>
      reject(err.code === "ENOENT" ? new Error(`ENOENT: no se encontró ${cmd}`) : err));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} terminó con código ${code}: ${stderrTail.trim().split("\n").slice(-5).join("\n")}`));
    });
  });
}

export async function probeDuration(file: string): Promise<number> {
  const out = await run(tool("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const duration = parseFloat(out.trim());
  if (!Number.isFinite(duration)) throw new Error("No se pudo leer la duración del audio");
  return duration;
}

/** Parses ffmpeg's `time=HH:MM:SS.xx` progress lines. */
function ffmpegProgress(total: number, onProgress?: (fraction: number) => void) {
  return (line: string) => {
    const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m && onProgress && total > 0) {
      const t = +m[1] * 3600 + +m[2] * 60 + +m[3];
      onProgress(Math.min(1, t / total));
    }
  };
}

/** Mono MP3 small enough to stream and seek in the browser. */
export function transcodePreview(src: string, dst: string, duration: number, onProgress?: (f: number) => void, signal?: AbortSignal) {
  return run(tool("ffmpeg"), ["-y", "-i", src, "-vn", "-ac", "1", "-ar", "22050", "-b:a", "48k", dst], {
    onStderr: ffmpegProgress(duration, onProgress),
    signal,
  });
}

export type AudioFormat = "wav16k" | "mp3-16k" | "flac16k";

/** Cuts [start, end) out of the source, resampled for speech recognition. */
export function extractClip(src: string, start: number, end: number, dst: string, format: AudioFormat, signal?: AbortSignal) {
  const codec =
    format === "wav16k" ? ["-c:a", "pcm_s16le"]
    : format === "flac16k" ? ["-c:a", "flac"]
    : ["-c:a", "libmp3lame", "-b:a", "32k"];
  return run(tool("ffmpeg"), [
    "-y",
    "-ss", start.toFixed(3),
    "-to", end.toFixed(3),
    "-i", src,
    "-vn", "-ac", "1", "-ar", "16000",
    ...codec,
    dst,
  ], { signal });
}

/**
 * Streams the audio as 16-bit mono PCM, calling `onSamples` with each chunk.
 * Used for analysis without holding the whole decoded service in memory.
 */
export function decodePcm(
  src: string,
  sampleRate: number,
  onSamples: (samples: Int16Array) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool("ffmpeg"), ["-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "-"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let leftover: Buffer | null = null;
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      let buf = leftover ? Buffer.concat([leftover, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      leftover = usable < buf.length ? buf.subarray(usable) : null;
      buf = buf.subarray(0, usable);
      // Copy so the Int16Array is aligned regardless of the Buffer's offset.
      const aligned = new Int16Array(usable / 2);
      for (let i = 0; i < aligned.length; i++) aligned[i] = buf.readInt16LE(i * 2);
      onSamples(aligned);
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${stderr.trim()}`))));
  });
}
