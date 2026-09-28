/**
 * Download a service recording from a OneDrive / SharePoint sharing link
 * ("Cualquier persona con el vínculo"). No Microsoft login is needed for
 * links shared that way.
 */
import { isMedia, saveResponse } from "./download";

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

  return saveResponse(res, dest, onProgress, signal);
}
