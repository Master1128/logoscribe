/** Job handlers: analysis, transcription and formatting of a sermon. */
import fs from "node:fs";
import { probeDuration, transcodePreview } from "@/lib/audio";
import { analyzeAudio } from "@/lib/detect";
import { downloadSource } from "@/lib/sources";
import { organize } from "@/lib/format";
import { sermonFiles } from "@/lib/paths";
import {
  enqueue, getSegments, getSermon, saveBlocks, saveSegments, setStatus, updateJob, updateSermon,
} from "@/lib/repo";
import { getSettings } from "@/lib/settings";
import { transcribe } from "@/lib/transcribe";
import type { Job } from "@/lib/types";

function reporter(job: Job) {
  let last = 0;
  return (fraction: number, message?: string) => {
    const now = Date.now();
    if (now - last < 500 && fraction < 1) return;
    last = now;
    updateJob(job.id, { progress: Math.round(fraction * 1000) / 1000, message });
  };
}

async function importAudio(job: Job, signal: AbortSignal) {
  const sermon = getSermon(job.sermon_id)!;
  const files = sermonFiles(sermon.id);
  setStatus(sermon.id, "importing");
  fs.mkdirSync(files.dir, { recursive: true });
  const progress = reporter(job);
  progress(0, "Descargando el audio");
  const { path: dest, fileName } = await downloadSource(sermon.source_url!, files.dir, progress, signal);
  updateSermon(sermon.id, { source_path: dest, source_name: sermon.source_name ?? fileName });
  setStatus(sermon.id, "uploaded");
  enqueue(sermon.id, "analyze");
}

async function analyze(job: Job, signal: AbortSignal) {
  const sermon = getSermon(job.sermon_id)!;
  const files = sermonFiles(sermon.id);
  const progress = reporter(job);
  setStatus(sermon.id, "analyzing");

  const duration = await probeDuration(sermon.source_path!);
  progress(0.01, "Preparando audio para escuchar");
  await transcodePreview(sermon.source_path!, files.preview, duration, (f) => progress(f * 0.5, "Preparando audio para escuchar"), signal);
  signal.throwIfAborted();

  const settings = getSettings();
  const { analysis, peaks } = await analyzeAudio(
    files.preview,
    duration,
    (f) => progress(0.5 + f * 0.5, "Buscando dónde empieza y termina la prédica"),
    { minSermonSec: settings.minSermonMinutes * 60 },
  );
  fs.writeFileSync(files.analysis, JSON.stringify(analysis));
  fs.writeFileSync(files.peaks, JSON.stringify(peaks));

  const start = analysis.sermon?.start ?? 0;
  const end = analysis.sermon?.end ?? duration;
  updateSermon(sermon.id, {
    duration,
    detected_start: analysis.sermon?.start ?? null,
    detected_end: analysis.sermon?.end ?? null,
    trim_start: start,
    trim_end: end,
  });

  if (settings.autoTranscribe && analysis.sermon) {
    updateSermon(sermon.id, { engine: "local" });
    setStatus(sermon.id, "transcribing");
    enqueue(sermon.id, "transcribe");
  } else {
    setStatus(sermon.id, "review");
  }
}

async function runTranscription(job: Job, signal: AbortSignal) {
  const sermon = getSermon(job.sermon_id)!;
  const files = sermonFiles(sermon.id);
  const settings = getSettings();
  setStatus(sermon.id, "transcribing");

  const segments = await transcribe({
    source: sermon.source_path!,
    start: sermon.trim_start ?? 0,
    end: sermon.trim_end ?? sermon.duration!,
    settings,
    workDir: files.work,
    onProgress: reporter(job),
    signal,
  });
  signal.throwIfAborted();
  saveSegments(sermon.id, segments);
  fs.rmSync(files.work, { recursive: true, force: true });
  enqueue(sermon.id, "format");
}

async function runFormat(job: Job) {
  const sermon = getSermon(job.sermon_id)!;
  setStatus(sermon.id, "formatting");
  updateJob(job.id, { progress: 0.1, message: "Organizando párrafos y secciones" });
  const { blocks, note } = await organize(getSegments(sermon.id), getSettings());
  saveBlocks(sermon.id, blocks);
  updateJob(job.id, { message: note ?? "Listo" });
  // A non-fatal note (fallback formatter) is surfaced on the sermon page.
  setStatus(sermon.id, "ready", note);
}

export const HANDLERS: Record<Job["type"], (job: Job, signal: AbortSignal) => Promise<void>> = {
  import: importAudio,
  analyze,
  transcribe: runTranscription,
  format: runFormat,
};

