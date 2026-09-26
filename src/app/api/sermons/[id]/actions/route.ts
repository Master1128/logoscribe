import { releaseLock } from "@/lib/browser-jobs";
import { activeJob, cancelJob, enqueue, getBlocks, getSegments, getSermon, lastJob, setStatus, updateSermon } from "@/lib/repo";
import { getSettings } from "@/lib/settings";

/** transcribe | reformat | retrim | reanalyze | retry | cancel */
export async function POST(request: Request, ctx: RouteContext<"/api/sermons/[id]/actions">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon) return Response.json({ error: "No encontrada" }, { status: 404 });
  const { action } = await request.json();
  const running = activeJob(id);

  if (action === "cancel" && !running && sermon.status === "transcribing" && sermon.engine === "browser") {
    // In-browser transcription has no server job; finished parts are kept for later.
    releaseLock(sermon);
    setStatus(id, "review");
    return Response.json({ sermon: getSermon(id) });
  }
  if (action === "cancel") {
    if (!running) return Response.json({ error: "No hay ningún proceso en curso" }, { status: 400 });
    cancelJob(running.id);
    // Return to the last state the team can act on.
    if (running.type === "transcribe") setStatus(id, "review");
    else if (running.type === "format") setStatus(id, getBlocks(id).length ? "ready" : "review");
    else setStatus(id, "failed", "Proceso cancelado");
    return Response.json({ sermon: getSermon(id) });
  }
  if (running) return Response.json({ error: "Ya hay un proceso en curso" }, { status: 409 });

  switch (action) {
    case "transcribe":
      if (sermon.trim_start === null || sermon.trim_end === null) {
        return Response.json({ error: "Primero confirma el inicio y el final de la prédica" }, { status: 400 });
      }
      if (!sermon.engine) updateSermon(id, { engine: getSettings().defaultEngine });
      setStatus(id, "transcribing");
      // The browser engine is driven by the user's page, not the worker.
      if ((getSermon(id)!.engine ?? "browser") !== "browser") enqueue(id, "transcribe");
      break;
    case "reformat":
      if (!getSegments(id).length) return Response.json({ error: "Aún no hay transcripción" }, { status: 400 });
      setStatus(id, "formatting");
      enqueue(id, "format");
      break;
    case "retrim":
      if (!sermon.duration) return Response.json({ error: "El audio aún no está analizado" }, { status: 400 });
      setStatus(id, "review");
      break;
    case "reanalyze":
      setStatus(id, "uploaded");
      enqueue(id, "analyze");
      break;
    case "retry": {
      // Repeat the step that failed (finished transcription chunks are cached).
      const failed = lastJob(id)?.type;
      if (failed === "transcribe") { setStatus(id, "transcribing"); enqueue(id, "transcribe"); }
      else if (failed === "format" && getSegments(id).length) { setStatus(id, "formatting"); enqueue(id, "format"); }
      else if (failed === "import" && sermon.source_url) { setStatus(id, "importing"); enqueue(id, "import"); }
      else if (sermon.source_path) { setStatus(id, "uploaded"); enqueue(id, "analyze"); }
      else return Response.json({ error: "Falta el archivo de audio" }, { status: 400 });
      break;
    }
    default:
      return Response.json({ error: "Acción desconocida" }, { status: 400 });
  }
  return Response.json({ sermon: getSermon(id) });
}
