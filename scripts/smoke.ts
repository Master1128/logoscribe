// End-to-end smoke test (analyze → transcribe → organize → export) in an isolated data dir:
//   LOGOSCRIBE_DATA_DIR=/tmp/ls pnpm tsx scripts/smoke.ts <audio> <ggml-model>
import fs from "node:fs";
import path from "node:path";
import { createSermon, updateSermon, claimJob, enqueue, getBlocks, getSermon, updateJob } from "@/lib/repo";
import { saveSettings } from "@/lib/settings";
import { HANDLERS } from "@/worker/jobs";
import { sermonFiles } from "@/lib/paths";
import { buildDocx } from "@/lib/export/docx";
import { buildPdf } from "@/lib/export/pdf";
import { DEFAULT_EXPORT } from "@/lib/export/common";

async function drain() {
  const all = ["import", "analyze", "transcribe", "format"] as const;
  for (let job = claimJob([...all]); job; job = claimJob([...all])) {
    await HANDLERS[job.type](job, new AbortController().signal);
    updateJob(job.id, { status: "done", progress: 1 });
    console.log("done", job.type, getSermon(job.sermon_id)?.status);
  }
}

async function main() {
  const [audio, model] = process.argv.slice(2);
  saveSettings({ localModelPath: model, organizerProvider: "basic", minSermonMinutes: 0.5 });
  const s = createSermon({ title: "El amor de Dios", preacher: "Pastor de prueba", series: "Fundamentos", service_date: "2026-09-20", source_name: path.basename(audio) });
  fs.mkdirSync(sermonFiles(s.id).dir, { recursive: true });
  const src = path.join(sermonFiles(s.id).dir, "source" + path.extname(audio));
  fs.copyFileSync(audio, src);
  updateSermon(s.id, { source_path: src, engine: "local" });
  enqueue(s.id, "analyze");
  await drain();
  console.log(getSermon(s.id));
  enqueue(s.id, "transcribe");
  await drain();
  const blocks = getBlocks(s.id);
  console.log(JSON.stringify(blocks, null, 1));
  const sermon = getSermon(s.id)!;
  fs.writeFileSync(path.join(process.env.LOGOSCRIBE_DATA_DIR!, "out.docx"), await buildDocx(sermon, blocks, { ...DEFAULT_EXPORT, timestamps: true }));
  fs.writeFileSync(path.join(process.env.LOGOSCRIBE_DATA_DIR!, "out.pdf"), await buildPdf(sermon, blocks, { ...DEFAULT_EXPORT, timestamps: true }));
}
main();
