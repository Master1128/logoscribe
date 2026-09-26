/**
 * Download a service recording from a OneDrive / SharePoint sharing link
 * ("Cualquier persona con el vínculo"). No Microsoft login is needed for
 * links shared that way.
 */
import fs from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

const ALLOWED_HOSTS = [/(^|\.)1drv\.ms$/, /(^|\.)onedrive\.live\.com$/, /(^|\.)sharepoint\.com$/, /(^|\.)onedrive\.com$/];

export function isOneDriveUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

/** Candidate direct-download URLs for a sharing link, most reliable first. */
export function downloadCandidates(shareUrl: string): string[] {
  const url = new URL(shareUrl);
  const withDownload = new URL(shareUrl);
  withDownload.searchParams.set("download", "1");
  // Graph "shares" API: encode the sharing URL as u!<base64url>.
  const encoded = "u!" + Buffer.from(shareUrl).toString("base64url");
  const shares = [
    `https://api.onedrive.com/v1.0/shares/${encoded}/root/content`,
    `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/content`,
  ];
  return url.hostname.endsWith("sharepoint.com") ? [withDownload.toString(), ...shares] : [...shares, withDownload.toString()];
}

function isMedia(res: Response) {
  const type = res.headers.get("content-type") ?? "";
  return res.ok && !type.includes("text/html") && !type.includes("application/json");
}

function fileNameFrom(res: Response): string | null {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1]);
  const plain = cd.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

export async function downloadShared(
  shareUrl: string,
  dest: (fileName: string) => string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ path: string; fileName: string }> {
  if (!isOneDriveUrl(shareUrl)) throw new Error("El enlace no es de OneDrive o SharePoint");

  let res: Response | null = null;
  for (const candidate of downloadCandidates(shareUrl)) {
    const attempt = await fetch(candidate, { redirect: "follow", signal }).catch((err) => {
      if (signal?.aborted) throw err;
      return null;
    });
    if (attempt && isMedia(attempt)) { res = attempt; break; }
    await attempt?.body?.cancel();
  }
  if (!res?.body) {
    throw new Error(
      "No se pudo descargar el archivo. En OneDrive, usa Compartir → «Cualquier persona con el vínculo» y copia ese enlace.",
    );
  }

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
