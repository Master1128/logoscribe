/**
 * AI providers that can organize a transcript into paragraphs and sections.
 * Claude uses the Anthropic API; the rest speak the OpenAI-compatible chat
 * API, so one client covers them (and any local server such as Ollama).
 */
export type ProviderId = "anthropic" | "openai" | "deepseek" | "gemini" | "glm" | "custom";

export interface Provider {
  id: ProviderId;
  label: string;
  kind: "anthropic" | "openai-compatible";
  /** OpenAI-compatible endpoint; the "custom" provider takes it from settings. */
  baseUrl?: string;
  /** Suggested model; the Ajustes page can list the provider's current models. */
  defaultModel: string;
  envVar: string;
  keyRequired: boolean;
  /** Where to create an API key. */
  keyUrl?: string;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    kind: "anthropic",
    defaultModel: "claude-opus-5",
    envVar: "ANTHROPIC_API_KEY",
    keyRequired: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5-mini",
    envVar: "OPENAI_API_KEY",
    keyRequired: true,
    keyUrl: "https://platform.openai.com/api-keys",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    envVar: "DEEPSEEK_API_KEY",
    keyRequired: true,
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  gemini: {
    id: "gemini",
    label: "Gemini (Google)",
    kind: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    envVar: "GEMINI_API_KEY",
    keyRequired: true,
    keyUrl: "https://aistudio.google.com/apikey",
  },
  glm: {
    id: "glm",
    label: "GLM (Z.ai / Zhipu)",
    kind: "openai-compatible",
    baseUrl: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-4.6",
    envVar: "ZAI_API_KEY",
    keyRequired: true,
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
  },
  custom: {
    id: "custom",
    label: "Otro compatible con OpenAI (Ollama, LiteLLM…)",
    kind: "openai-compatible",
    defaultModel: "",
    envVar: "CUSTOM_LLM_API_KEY",
    keyRequired: false,
  },
};
