/// <reference lib="webworker" />
/**
 * Runs Whisper in a Web Worker so the page stays responsive while a sermon is
 * transcribed on the user's own GPU.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline, type ProgressInfo } from "@huggingface/transformers";

env.allowLocalModels = false;

type Request =
  | { type: "load"; repo: string; dtype: Record<string, string> }
  | { type: "transcribe"; id: number; audio: Float32Array };

let current: { key: string; asr: AutomaticSpeechRecognitionPipeline } | null = null;

async function load(repo: string, dtype: Record<string, string>) {
  const key = `${repo}:${JSON.stringify(dtype)}`;
  if (current?.key === key) return current.asr;
  await current?.asr.dispose();
  current = null;
  const asr = (await pipeline("automatic-speech-recognition", repo, {
    device: "webgpu",
    dtype: dtype as never,
    progress_callback: (p: ProgressInfo) => {
      if (p.status === "progress_total") postMessage({ type: "progress", loaded: p.loaded, total: p.total });
    },
  })) as AutomaticSpeechRecognitionPipeline;
  current = { key, asr };
  return asr;
}

// Failures inside transformers.js (e.g. not enough memory for the model) can
// surface as unhandled rejections; report them so the page doesn't wait forever.
const friendly = (message: string) =>
  /Array buffer allocation failed|out of memory|OOM/i.test(message)
    ? "No hay memoria suficiente en este navegador para este modelo. Cierra otras pestañas o usa el modelo liviano."
    : message;
self.addEventListener("unhandledrejection", (e) => postMessage({ type: "error", message: friendly(String(e.reason?.message ?? e.reason)) }));
self.addEventListener("error", (e) => postMessage({ type: "error", message: friendly(e.message) }));

self.onmessage = async (e: MessageEvent<Request>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load(msg.repo, msg.dtype);
      postMessage({ type: "ready" });
    } else if (msg.type === "transcribe") {
      if (!current) throw new Error("El modelo no está cargado");
      const out = await current.asr(msg.audio, {
        language: "spanish",
        task: "transcribe",
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const result = Array.isArray(out) ? out[0] : out;
      postMessage({ type: "result", id: msg.id, text: result.text, chunks: result.chunks ?? [] });
    }
  } catch (err) {
    postMessage({ type: "error", id: "id" in msg ? msg.id : undefined, message: friendly((err as Error).message ?? String(err)) });
  }
};
