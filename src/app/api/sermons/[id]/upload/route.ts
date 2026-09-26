import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { sermonFiles } from "@/lib/paths";
import { enqueue, getSermon, setStatus, updateSermon } from "@/lib/repo";

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|mp4|webm|amr|3gp)$/i;

/** Raw-body upload (PUT) so multi-hundred-MB services stream straight to disk. */
export async function PUT(request: Request, ctx: RouteContext<"/api/sermons/[id]/upload">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon) return Response.json({ error: "No encontrada" }, { status: 404 });
  if (!request.body) return Response.json({ error: "Archivo vacío" }, { status: 400 });

  const name = decodeURIComponent(request.headers.get("x-filename") ?? "audio.mp3");
  const ext = path.extname(name).toLowerCase();
  if (!AUDIO_EXT.test(ext)) return Response.json({ error: "Formato de audio no soportado" }, { status: 400 });

  const files = sermonFiles(id);
  fs.mkdirSync(files.dir, { recursive: true });
  const dest = path.join(files.dir, `source${ext}`);
  await pipeline(Readable.fromWeb(request.body as WebReadableStream), fs.createWriteStream(dest));

  updateSermon(id, { source_path: dest });
  setStatus(id, "uploaded");
  enqueue(id, "analyze");
  return Response.json({ ok: true });
}
