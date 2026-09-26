/**
 * Catalog of whisper.cpp models the team can download and activate from
 * Ajustes. Files come from the official whisper.cpp repositories on Hugging Face.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { db } from "./db";
import { DATA_DIR } from "./paths";
import { tool } from "./tools";

export interface ModelDef {
  id: string;
  file: string;
  label: string;
  description: string;
  /** Approximate size, for display before the download starts. */
  bytes: number;
  url: string;
  recommended?: boolean;
}

const HF = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export const MODELS: ModelDef[] = [
  {
    id: "large-v3-turbo",
    file: "ggml-large-v3-turbo.bin",
    label: "Large v3 Turbo",
    description: "La mejor opción para prédicas en español. Muy rápido en Mac con chip M; en Windows funciona con el procesador (más lento).",
    bytes: 1_624_555_275,
    url: `${HF}/ggml-large-v3-turbo.bin`,
    recommended: true,
  },
  {
    id: "large-v3-turbo-q5_0",
    file: "ggml-large-v3-turbo-q5_0.bin",
    label: "Large v3 Turbo (comprimido)",
    description: "Casi la misma calidad ocupando un tercio y algo más rápido. Recomendado para computadores con 8 GB de memoria o menos.",
    bytes: 574_041_195,
    url: `${HF}/ggml-large-v3-turbo-q5_0.bin`,
  },
  {
    id: "large-v3",
    file: "ggml-large-v3.bin",
    label: "Large v3",
    description: "Máxima precisión, pero bastante más lento. Solo para equipos potentes.",
    bytes: 3_095_033_483,
    url: `${HF}/ggml-large-v3.bin`,
  },
  {
    id: "small",
    file: "ggml-small.bin",
    label: "Small",
    description: "Rápido y liviano, con más errores en nombres y palabras poco comunes.",
    bytes: 487_601_967,
    url: `${HF}/ggml-small.bin`,
  },
];

/** Silero VAD: skips silence and music so Whisper doesn't invent text there. */
export const VAD: ModelDef = {
  id: "vad",
  file: "ggml-silero-v5.1.2.bin",
  label: "Detector de voz (Silero VAD)",
  description: "Evita texto inventado en silencios y música.",
  bytes: 885_098,
  url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
};

export const MODELS_DIR = path.join(DATA_DIR, "models");

export const modelPath = (m: ModelDef) => path.join(MODELS_DIR, m.file);

export function findModel(id: string): ModelDef | undefined {
  return id === VAD.id ? VAD : MODELS.find((m) => m.id === id);
}

// ---------------------------------------------------------------- downloads

export interface Download {
  model_id: string;
  status: "queued" | "downloading" | "done" | "failed" | "canceled";
  received: number;
  total: number;
  error: string | null;
}

function ensureTable() {
  db().exec(`CREATE TABLE IF NOT EXISTS model_downloads (
    model_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    received INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

export function getDownloads(): Download[] {
  ensureTable();
  return db().prepare("SELECT model_id, status, received, total, error FROM model_downloads").all() as unknown as Download[];
}

export function getDownload(id: string): Download | null {
  ensureTable();
  return (db().prepare("SELECT model_id, status, received, total, error FROM model_downloads WHERE model_id = ?").get(id) as unknown as Download) ?? null;
}

export function queueDownload(id: string) {
  ensureTable();
  db().prepare(
    `INSERT INTO model_downloads (model_id, status, received, total, error) VALUES (?, 'queued', 0, 0, NULL)
     ON CONFLICT(model_id) DO UPDATE SET status = 'queued', received = 0, total = 0, error = NULL, updated_at = datetime('now')`,
  ).run(id);
}

export function updateDownload(id: string, patch: Partial<Omit<Download, "model_id">>) {
  const entries = Object.entries(patch);
  if (!entries.length) return;
  db().prepare(`UPDATE model_downloads SET ${entries.map(([k]) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE model_id = ?`)
    .run(...(entries.map(([, v]) => v) as (string | number | null)[]), id);
}

export function claimDownload(): Download | null {
  ensureTable();
  const row = db().prepare("SELECT model_id, status, received, total, error FROM model_downloads WHERE status = 'queued' LIMIT 1").get() as unknown as Download | undefined;
  if (!row) return null;
  updateDownload(row.model_id, { status: "downloading" });
  return { ...row, status: "downloading" };
}

/** Downloads left mid-way by a worker restart start over. */
export function requeueStaleDownloads() {
  ensureTable();
  db().prepare("UPDATE model_downloads SET status = 'queued', received = 0 WHERE status = 'downloading'").run();
}

// ---------------------------------------------------------------- environment

let whisperCache: { ok: boolean; at: number } | null = null;

/** Whether the whisper.cpp command line tool is installed on the server. */
export function whisperCliAvailable(): boolean {
  if (whisperCache && Date.now() - whisperCache.at < 60_000) return whisperCache.ok;
  const res = spawnSync(tool("whisper-cli"), ["--help"], { stdio: "ignore", timeout: 10_000 });
  whisperCache = { ok: !res.error, at: Date.now() };
  return whisperCache.ok;
}

export function isDownloaded(m: ModelDef) {
  return fs.existsSync(modelPath(m));
}
