import { organizerConfig, testOrganizer } from "@/lib/format";
import { getSettings } from "@/lib/settings";

/** Organizes a short sample with the saved provider, key and model. */
export async function POST() {
  const settings = getSettings();
  const cfg = organizerConfig(settings);
  if (!cfg) return Response.json({ ok: true, basic: true });
  try {
    return Response.json({ ok: true, ...(await testOrganizer(cfg, settings)) });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message });
  }
}
