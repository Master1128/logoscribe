import { listModels, organizerConfig } from "@/lib/format";
import { getSettings } from "@/lib/settings";

/** The saved provider's current models, so the team can pick one from a list. */
export async function GET() {
  const cfg = organizerConfig(getSettings());
  if (!cfg) return Response.json({ models: [] });
  try {
    return Response.json({ models: await listModels(cfg) });
  } catch (err) {
    return Response.json({ models: [], error: (err as Error).message });
  }
}
