import { getSettings } from "@/lib/settings";
import { checkLocalEngine } from "@/lib/transcribe";

/** Checks whisper.cpp and the active model are ready on this computer. */
export async function POST() {
  try {
    checkLocalEngine(getSettings());
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message });
  }
}
