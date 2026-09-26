/**
 * Whisper models that run inside each user's browser (transformers.js +
 * WebGPU). Downloaded once per browser from Hugging Face and kept in the
 * browser's cache, so the server never needs a GPU.
 */
export interface BrowserModel {
  id: string;
  repo: string;
  label: string;
  description: string;
  /** Approximate download size in bytes. */
  bytes: number;
  /** Precision per session. transformers.js 4 names the encoder session "model". */
  dtype: Record<string, string>;
  /** Files transformers.js fetches (used to check and clear the cache). */
  files: string[];
  recommended?: boolean;
}

const common = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json"];

export const BROWSER_MODELS: BrowserModel[] = [
  {
    id: "turbo-lite",
    repo: "onnx-community/whisper-large-v3-turbo",
    label: "Large v3 Turbo (liviano)",
    description: "El mismo modelo comprimido: muy buena calidad en español y cabe en la memoria de casi cualquier computador.",
    bytes: 564_000_000,
    dtype: { model: "q4f16", decoder_model_merged: "q4f16" },
    files: [...common, "onnx/encoder_model_q4f16.onnx", "onnx/decoder_model_merged_q4f16.onnx"],
    recommended: true,
  },
  {
    id: "turbo",
    repo: "onnx-community/whisper-large-v3-turbo",
    label: "Large v3 Turbo (máxima calidad)",
    description: "Algo más preciso, pero necesita mucha memoria: en muchos equipos el navegador no logra cargarlo.",
    bytes: 1_608_000_000,
    dtype: { model: "fp16", decoder_model_merged: "q4" },
    files: [...common, "onnx/encoder_model_fp16.onnx", "onnx/decoder_model_merged_q4.onnx"],
  },
  {
    id: "small",
    repo: "onnx-community/whisper-small",
    label: "Small",
    description: "Liviano y rápido, con más errores en nombres y palabras poco comunes. Para computadores modestos.",
    bytes: 410_000_000,
    dtype: { model: "fp16", decoder_model_merged: "q4" },
    files: [...common, "onnx/encoder_model_fp16.onnx", "onnx/decoder_model_merged_q4.onnx"],
  },
];

export const findBrowserModel = (id: string | null) => BROWSER_MODELS.find((m) => m.id === id) ?? null;
