import path from "node:path";
import { db } from "./db";
import { DATA_DIR } from "./paths";
import { PROVIDERS, type ProviderId } from "./providers";

/** Preferences editable from the Ajustes page. */
export interface Settings {
  localModelPath: string;
  /** Silero VAD model; when present, Whisper only decodes detected speech. */
  localVadModelPath: string;
  localThreads: number;
  /** Vocabulary hint given to the recognizer (names, biblical terms). */
  vocabularyPrompt: string;
  /** "basic" organizes paragraphs locally; any other value is an AI provider. */
  organizerProvider: "basic" | ProviderId;
  organizerModel: string;
  /** Only used by the "custom" provider (Ollama, LiteLLM, …). */
  organizerBaseUrl: string;
  addHeadings: boolean;
  /** RSS feed of the church's podcast, remembered from the first podcast link. */
  podcastFeedUrl: string;
  autoTranscribe: boolean;
  /** Shortest speech run proposed as the sermon by the detector. */
  minSermonMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  localModelPath: path.join(DATA_DIR, "models", "ggml-large-v3-turbo.bin"),
  localVadModelPath: path.join(DATA_DIR, "models", "ggml-silero-v5.1.2.bin"),
  localThreads: 6,
  vocabularyPrompt:
    "Prédica cristiana en español. Jesucristo, Espíritu Santo, Dios Padre, aleluya, amén, gloria a Dios, " +
    "versículo, capítulo, Génesis, Éxodo, Salmos, Proverbios, Isaías, Mateo, Marcos, Lucas, Juan, Hechos, " +
    "Romanos, Corintios, Gálatas, Efesios, Filipenses, Hebreos, Apocalipsis.",
  organizerProvider: "basic",
  organizerModel: "",
  organizerBaseUrl: "",
  addHeadings: true,
  podcastFeedUrl: "",
  autoTranscribe: false,
  minSermonMinutes: 8,
};

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'apiKey:%'").all() as { key: string; value: string }[];
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  const settings = { ...DEFAULT_SETTINGS, ...stored } as Settings;
  if (settings.organizerProvider !== "basic" && !PROVIDERS[settings.organizerProvider]) settings.organizerProvider = "basic";
  return settings;
}

export function saveSettings(patch: Partial<Settings>) {
  const stmt = db().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) {
    if (key in DEFAULT_SETTINGS && value !== undefined) stmt.run(key, JSON.stringify(value));
  }
}

// ---------------------------------------------------------------- API keys

/**
 * Each provider's key lives in this computer's local database (Logoscribe
 * runs only on localhost), so volunteers can paste it in Ajustes instead of
 * editing files. An environment variable still works as a fallback.
 */
export function getApiKey(provider: ProviderId): string | undefined {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(`apiKey:${provider}`) as { value: string } | undefined;
  const stored = row ? (JSON.parse(row.value) as string) : "";
  return stored || process.env[PROVIDERS[provider].envVar] || undefined;
}

export function setApiKey(provider: ProviderId, key: string | null) {
  if (key) {
    db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(`apiKey:${provider}`, JSON.stringify(key.trim()));
  } else {
    db().prepare("DELETE FROM settings WHERE key = ?").run(`apiKey:${provider}`);
  }
}

/** What the page may know about saved keys: whether there is one, and its last characters. */
export function apiKeyHints(): Record<ProviderId, string | null> {
  return Object.fromEntries(
    (Object.keys(PROVIDERS) as ProviderId[]).map((p) => {
      const key = getApiKey(p);
      return [p, key ? `…${key.slice(-4)}` : null];
    }),
  ) as Record<ProviderId, string | null>;
}
