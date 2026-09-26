import fs from "node:fs";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { apiKeyHints, getSettings, saveSettings, setApiKey } from "@/lib/settings";

function payload() {
  const settings = getSettings();
  return { settings, apiKeys: apiKeyHints(), localModelFound: fs.existsSync(settings.localModelPath) };
}

export async function GET() {
  return Response.json(payload());
}

/** Body: settings to change, plus an optional { apiKey: { provider, key } } (key null clears it). */
export async function PUT(request: Request) {
  const { apiKey, ...patch } = await request.json();
  saveSettings(patch);
  if (apiKey && apiKey.provider in PROVIDERS) setApiKey(apiKey.provider as ProviderId, apiKey.key || null);
  return Response.json(payload());
}
