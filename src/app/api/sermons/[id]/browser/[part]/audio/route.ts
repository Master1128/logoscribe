import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { browserParts } from "@/lib/browser-jobs";
import { getSermon } from "@/lib/repo";

/** One part as a small 16 kHz mono MP3, cut on the fly from the original. */
export async function GET(_req: Request, ctx: RouteContext<"/api/sermons/[id]/browser/[part]/audio">) {
  const { id, part } = await ctx.params;
  const sermon = getSermon(id);
  const p = sermon ? browserParts(sermon)[Number(part)] : null;
  if (!sermon?.source_path || !p) return new Response("No encontrado", { status: 404 });
  const ff = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", [
    "-v", "error", "-ss", p.start.toFixed(3), "-to", p.end.toFixed(3), "-i", sermon.source_path,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "-",
  ], { stdio: ["ignore", "pipe", "ignore"] });
  return new Response(Readable.toWeb(ff.stdout) as ReadableStream, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
