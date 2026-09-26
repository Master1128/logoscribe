/** Worker lane that downloads whisper.cpp models requested from Ajustes. */
import fs from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
  claimDownload, findModel, getDownload, isDownloaded, modelPath, MODELS_DIR, queueDownload, requeueStaleDownloads,
  updateDownload, VAD,
} from "@/lib/models";
import { getSettings, saveSettings } from "@/lib/settings";

const POLL_MS = 1500;

/** Network hiccups (and flaky CDN edges) are common on church connections. */
async function fetchWithRetry(url: string, signal: AbortSignal, attempts = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, { redirect: "follow", signal });
    } catch (err) {
      if (signal.aborted || i >= attempts) {
        const cause = (err as { cause?: { code?: string; message?: string } }).cause;
        throw new Error(cause?.code ? `${(err as Error).message} (${cause.code})` : (err as Error).message);
      }
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function download(modelId: string) {
  const model = findModel(modelId);
  if (!model) throw new Error("Modelo desconocido");
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const dest = modelPath(model);
  const part = `${dest}.part`;

  const controller = new AbortController();
  const res = await fetchWithRetry(model.url, controller.signal);
  if (!res.ok || !res.body) throw new Error(`El servidor de modelos respondió ${res.status}`);
  const total = Number(res.headers.get("content-length")) || model.bytes;
  updateDownload(modelId, { total, received: 0 });

  const out = fs.createWriteStream(part);
  let received = 0;
  let lastReport = 0;
  try {
    for await (const chunk of Readable.fromWeb(res.body as WebReadableStream)) {
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
      received += (chunk as Buffer).length;
      if (Date.now() - lastReport > 1000) {
        lastReport = Date.now();
        // Cancel is requested from the API by flipping the row's status.
        if (getDownload(modelId)?.status === "canceled") {
          controller.abort();
          throw new Error("Cancelado");
        }
        updateDownload(modelId, { received });
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw err;
  }

  if (received !== total) {
    fs.rmSync(part, { force: true });
    throw new Error(`Descarga incompleta (${received} de ${total} bytes). Intenta de nuevo.`);
  }
  fs.renameSync(part, dest);
  updateDownload(modelId, { received, status: "done" });

  if (model.id !== VAD.id) {
    // First usable model: activate it so transcription works right away.
    const settings = getSettings();
    if (!fs.existsSync(settings.localModelPath)) saveSettings({ localModelPath: dest });
    if (!isDownloaded(VAD) && getDownload(VAD.id)?.status !== "queued") queueDownload(VAD.id);
  }
}

export async function downloadLane() {
  requeueStaleDownloads();
  for (;;) {
    const job = claimDownload();
    if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    console.log(`[worker] descargando modelo ${job.model_id}`);
    try {
      await download(job.model_id);
      console.log(`[worker] modelo ${job.model_id} listo`);
    } catch (err) {
      if (getDownload(job.model_id)?.status === "canceled") { console.log(`[worker] descarga ${job.model_id} cancelada`); continue; }
      console.error(`[worker] descarga ${job.model_id} falló:`, err);
      updateDownload(job.model_id, { status: "failed", error: (err as Error).message });
    }
  }
}
