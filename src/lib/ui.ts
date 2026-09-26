import type { Block, Job, Sermon, SermonStatus } from "./types";
import type { BibleRef } from "./bible";

export { formatTime, formatDate } from "./export/common";

export const STATUS_LABEL: Record<SermonStatus, string> = {
  importing: "Descargando de OneDrive",
  uploaded: "En cola",
  analyzing: "Analizando audio",
  review: "Revisar recorte",
  transcribing: "Transcribiendo",
  formatting: "Organizando texto",
  ready: "Lista",
  failed: "Con error",
};

export const PROCESSING: SermonStatus[] = ["importing", "uploaded", "analyzing", "transcribing", "formatting"];

export interface SermonPayload {
  sermon: Sermon;
  job: Job | null;
  blocks: Block[];
  refs: BibleRef[];
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body && typeof init.body === "string" ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
