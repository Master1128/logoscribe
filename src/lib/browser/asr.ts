"use client";
/** Client-side access to the Whisper Web Worker and the browser's model cache. */
import type { Segment } from "../types";
import { BROWSER_MODELS, findBrowserModel, type BrowserModel } from "./models";

const ACTIVE_KEY = "logoscribe.browserModel";
const CACHE_NAME = "transformers-cache";

export function activeBrowserModel(): BrowserModel | null {
  try {
    return findBrowserModel(localStorage.getItem(ACTIVE_KEY));
  } catch {
    return null;
  }
}

export function setActiveBrowserModel(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

export interface GpuSupport {
  ok: boolean;
  reason?: string;
}

export async function checkWebGpu(): Promise<GpuSupport> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, reason: "Este navegador no tiene WebGPU. Usa Chrome o Edge actualizados." };
  const adapter = await gpu.requestAdapter().catch(() => null);
  if (!adapter) return { ok: false, reason: "No se encontró una tarjeta gráfica compatible con WebGPU." };
  if (!adapter.features.has("shader-f16")) {
    return { ok: false, reason: "La tarjeta gráfica no soporta fp16; usa el modelo liviano o Small." };
  }
  return { ok: true };
}

const fileUrl = (m: BrowserModel, file: string) => `https://huggingface.co/${m.repo}/resolve/main/${file}`;

/** Whether every file of the model is already in this browser's cache. */
export async function isCached(m: BrowserModel): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const f of m.files) if (!(await cache.match(fileUrl(m, f)))) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Streams each file of the model straight into the browser cache, under the
 * same keys transformers.js looks up. Nothing large is held in memory, so the
 * download itself works on any computer; loading afterwards reads the cache.
 */
export async function downloadToCache(
  m: BrowserModel,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
) {
  const cache = await caches.open(CACHE_NAME);
  const missing: string[] = [];
  for (const f of m.files) if (!(await cache.match(fileUrl(m, f)))) missing.push(f);

  // Sizes up front so the bar reflects the whole model.
  const sizes = await Promise.all(
    missing.map(async (f) => {
      const head = await fetch(fileUrl(m, f), { method: "HEAD", signal }).catch(() => null);
      return Number(head?.headers.get("content-length")) || 0;
    }),
  );
  const total = sizes.reduce((a, b) => a + b, 0) || m.bytes;
  let loaded = 0;

  for (const f of missing) {
    const url = fileUrl(m, f);
    const res = await fetch(url, { signal });
    if (!res.ok || !res.body) throw new Error(`No se pudo descargar ${f} (${res.status})`);
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        onProgress(loaded, total);
        controller.enqueue(chunk);
      },
    });
    const headers = new Headers({ "content-type": res.headers.get("content-type") ?? "application/octet-stream" });
    const length = res.headers.get("content-length");
    if (length) headers.set("content-length", length);
    try {
      await cache.put(url, new Response(res.body.pipeThrough(counter), { headers }));
    } catch (err) {
      await cache.delete(url);
      if (signal?.aborted) throw new Error("Cancelado");
      throw new Error(
        /quota/i.test(String(err)) ? "No hay espacio suficiente en el navegador para el modelo." : `No se pudo guardar ${f}: ${(err as Error).message}`,
      );
    }
  }
}

/** Removes the model's weights; shared small files stay if another model uses them. */
export async function deleteCached(m: BrowserModel) {
  const cache = await caches.open(CACHE_NAME);
  const stillUsed = new Set(
    BROWSER_MODELS.filter((o) => o.id !== m.id && o.repo === m.repo).flatMap((o) => o.files),
  );
  for (const f of m.files) if (!stillUsed.has(f)) await cache.delete(fileUrl(m, f));
  if (activeBrowserModel()?.id === m.id) setActiveBrowserModel(null);
}

// ---------------------------------------------------------------- worker

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: { text: string; chunks: { timestamp: [number, number | null]; text: string }[] }) => void; reject: (e: Error) => void }>();
let loadWaiter: { resolve: () => void; reject: (e: Error) => void; onProgress?: (f: number, loaded: number, total: number) => void } | null = null;

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../../workers/asr.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "progress") loadWaiter?.onProgress?.(msg.total ? msg.loaded / msg.total : 0, msg.loaded, msg.total);
    else if (msg.type === "ready") { loadWaiter?.resolve(); loadWaiter = null; }
    else if (msg.type === "result") { pending.get(msg.id)?.resolve(msg); pending.delete(msg.id); }
    else if (msg.type === "error") {
      const err = new Error(msg.message);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)!.reject(err); pending.delete(msg.id); }
      else if (loadWaiter) { loadWaiter.reject(err); loadWaiter = null; }
      else { for (const p of pending.values()) p.reject(err); pending.clear(); }
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || "El motor de transcripción del navegador se detuvo");
    loadWaiter?.reject(err);
    loadWaiter = null;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  return worker;
}

/** Downloads (first time) and loads the model onto the GPU. */
export function loadModel(m: BrowserModel, onProgress?: (fraction: number, loaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    loadWaiter = { resolve, reject, onProgress };
    getWorker().postMessage({ type: "load", repo: m.repo, dtype: m.dtype });
  });
}

/** Stops everything (used to cancel a download or a transcription). */
export function terminateWorker() {
  worker?.terminate();
  worker = null;
  loadWaiter?.reject(new Error("Cancelado"));
  loadWaiter = null;
  for (const p of pending.values()) p.reject(new Error("Cancelado"));
  pending.clear();
}

/** Transcribes 16 kHz mono samples; timestamps are shifted by `offset` seconds. */
export async function transcribeSamples(audio: Float32Array, offset: number): Promise<Segment[]> {
  const id = nextId++;
  const result = await new Promise<{ chunks: { timestamp: [number, number | null]; text: string }[] }>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
  const duration = audio.length / 16000;
  return result.chunks
    .map((c) => ({
      start: offset + c.timestamp[0],
      end: offset + (c.timestamp[1] ?? duration),
      text: c.text.trim(),
    }))
    .filter((s) => s.text);
}

/** Fetches an audio file and decodes it to 16 kHz mono Float32 samples. */
export async function fetchSamples(url: string, signal?: AbortSignal): Promise<Float32Array> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`No se pudo obtener el audio (${res.status})`);
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    return buffer.getChannelData(0).slice();
  } finally {
    ctx.close();
  }
}

/** Asks the browser not to evict the (large) model cache under storage pressure. */
export async function requestPersistence() {
  try {
    await navigator.storage?.persist?.();
  } catch {}
}
