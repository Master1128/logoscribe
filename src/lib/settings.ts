import path from "node:path";
import { db } from "./db";
import { DATA_DIR } from "./paths";
import type { EngineId } from "./types";

/** Non-secret preferences, editable from the Ajustes page. API keys stay in env vars. */
export interface Settings {
  defaultEngine: EngineId;
  openaiModel: string;
  groqModel: string;
  localModelPath: string;
  /** Silero VAD model; when present, Whisper only decodes detected speech. */
  localVadModelPath: string;
  localThreads: number;
  /** Vocabulary hint given to the recognizer (names, biblical terms). */
  vocabularyPrompt: string;
  formatter: "claude" | "heuristic";
  claudeModel: string;
  addHeadings: boolean;
  autoTranscribe: boolean;
  /** Shortest speech run proposed as the sermon by the detector. */
  minSermonMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultEngine: "local",
  openaiModel: "whisper-1",
  groqModel: "whisper-large-v3",
  localModelPath: path.join(DATA_DIR, "models", "ggml-large-v3-turbo.bin"),
  localVadModelPath: path.join(DATA_DIR, "models", "ggml-silero-v5.1.2.bin"),
  localThreads: 6,
  vocabularyPrompt:
    "Prédica cristiana en español. Jesucristo, Espíritu Santo, Dios Padre, aleluya, amén, gloria a Dios, " +
    "versículo, capítulo, Génesis, Éxodo, Salmos, Proverbios, Isaías, Mateo, Marcos, Lucas, Juan, Hechos, " +
    "Romanos, Corintios, Gálatas, Efesios, Filipenses, Hebreos, Apocalipsis.",
  formatter: "claude",
  claudeModel: "claude-opus-5",
  addHeadings: true,
  autoTranscribe: false,
  minSermonMinutes: 8,
};

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) {
    if (key in DEFAULT_SETTINGS && value !== undefined) stmt.run(key, JSON.stringify(value));
  }
}

export const secrets = {
  openai: () => process.env.OPENAI_API_KEY,
  openaiBaseUrl: () => process.env.OPENAI_BASE_URL || undefined,
  groq: () => process.env.GROQ_API_KEY,
  anthropic: () => process.env.ANTHROPIC_API_KEY,
};

export function secretStatus() {
  return {
    openai: Boolean(secrets.openai()),
    /** Host only, so the page can say which server is used without exposing anything else. */
    openaiHost: (() => { try { return new URL(secrets.openaiBaseUrl() ?? "https://api.openai.com").host; } catch { return null; } })(),
    groq: Boolean(secrets.groq()),
    anthropic: Boolean(secrets.anthropic()),
  };
}
