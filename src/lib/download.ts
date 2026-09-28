/** Streams an HTTP response to disk with progress, without holding it in memory. */
import fs from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

export function isMedia(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  return res.ok && !type.includes("text/html") && !type.includes("application/json") && !type.includes("xml");
}

export function fileNameFrom(res: Response): string | null {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1]);
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1];
  try {
    const last = decodeURIComponent(new URL(res.url).pathname.split("/").pop() ?? "");
    return last || null;
  } catch {
    return null;
  }
}

export async function saveResponse(
  res: Response,
  dest: (fileName: string) => string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ path: string; fileName: string }> {
  if (!res.body) throw new Error("La descarga llegó vacía");
  const fileName = fileNameFrom(res) ?? "audio.mp3";
  const path = dest(fileName);
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let last = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (total && Date.now() - last > 500) { last = Date.now(); onProgress(received / total); }
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), counter, fs.createWriteStream(path), { signal });
  return { path, fileName };
}
