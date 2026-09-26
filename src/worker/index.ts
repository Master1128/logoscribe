/**
 * Background worker: imports, analyzes, transcribes and formats sermons from
 * the jobs table. Start with `pnpm worker` (or `pnpm dev` alongside the web).
 */
import { claimJob, getSermon, jobStatus, requeueStale, setStatus, updateJob } from "@/lib/repo";
import { downloadLane } from "./downloads";
import { HANDLERS } from "./jobs";
import type { Job } from "@/lib/types";

const POLL_MS = 1500;

/**
 * Two lanes: transcription (heavy, and may sit waiting on a provider's rate
 * limit) and everything else, so a rate-limited sermon never blocks imports,
 * analysis or formatting of the others.
 */
const LANES: { name: string; types: Job["type"][] }[] = [
  { name: "transcripción", types: ["transcribe"] },
  { name: "general", types: ["import", "analyze", "format"] },
];

async function lane(types: Job["type"][]) {
  for (;;) {
    const job = claimJob(types);
    if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    if (!getSermon(job.sermon_id)) { updateJob(job.id, { status: "failed", message: "Prédica eliminada" }); continue; }
    const t0 = Date.now();
    console.log(`[worker] ${job.type} ${job.sermon_id}`);
    // The API marks a job 'canceled'; abort its ffmpeg/whisper/HTTP work.
    const controller = new AbortController();
    const watch = setInterval(() => { if (jobStatus(job.id) === "canceled") controller.abort(); }, 1000);
    try {
      await HANDLERS[job.type](job, controller.signal);
      if (controller.signal.aborted) continue;
      updateJob(job.id, { status: "done", progress: 1 });
      console.log(`[worker] ${job.type} ${job.sermon_id} listo en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (err) {
      if (controller.signal.aborted) { console.log(`[worker] ${job.type} ${job.sermon_id} cancelado`); continue; }
      const message = (err as Error).message;
      console.error(`[worker] ${job.type} ${job.sermon_id} falló:`, err);
      updateJob(job.id, { status: "failed", message });
      if (getSermon(job.sermon_id)) setStatus(job.sermon_id, "failed", message);
    } finally {
      clearInterval(watch);
    }
  }
}

requeueStale();
console.log(`[worker] esperando trabajos (carriles: ${LANES.map((l) => l.name).join(", ")}, descargas)…`);
for (const l of LANES) lane(l.types);
downloadLane();
