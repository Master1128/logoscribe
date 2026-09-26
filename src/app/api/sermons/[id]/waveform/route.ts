import fs from "node:fs";
import { sermonFiles } from "@/lib/paths";
import type { Analysis } from "@/lib/types";

/** Peaks and speech/music regions for the trim editor (energy curve omitted). */
export async function GET(_req: Request, ctx: RouteContext<"/api/sermons/[id]/waveform">) {
  const { id } = await ctx.params;
  const files = sermonFiles(id);
  if (!fs.existsSync(files.analysis)) return Response.json({ error: "Análisis pendiente" }, { status: 404 });
  const analysis = JSON.parse(fs.readFileSync(files.analysis, "utf8")) as Analysis;
  const peaks = JSON.parse(fs.readFileSync(files.peaks, "utf8")) as number[];
  return Response.json({ duration: analysis.duration, regions: analysis.regions, sermon: analysis.sermon, peaks });
}
