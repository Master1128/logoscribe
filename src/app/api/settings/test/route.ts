import path from "node:path";
import { DATA_DIR } from "@/lib/paths";
import { getSettings } from "@/lib/settings";
import { testEngine } from "@/lib/transcribe";
import type { EngineId } from "@/lib/types";

export async function POST(request: Request) {
  const { engine } = (await request.json()) as { engine: EngineId };
  if (!["openai", "groq", "local"].includes(engine)) return Response.json({ error: "Motor desconocido" }, { status: 400 });
  try {
    return Response.json(await testEngine(engine, getSettings(), path.join(DATA_DIR, "tmp")));
  } catch (err) {
    return Response.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
