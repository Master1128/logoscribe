import fs from "node:fs";
import { Readable } from "node:stream";
import { sermonFiles } from "@/lib/paths";

/** Serves the playback transcode with Range support so the browser can seek. */
export async function GET(request: Request, ctx: RouteContext<"/api/sermons/[id]/audio">) {
  const { id } = await ctx.params;
  const file = sermonFiles(id).preview;
  if (!fs.existsSync(file)) return new Response("Audio no disponible aún", { status: 404 });
  const size = fs.statSync(file).size;
  const headers = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };

  const range = request.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (!range) {
    return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, {
      headers: { ...headers, "Content-Length": String(size) },
    });
  }
  const start = range[1] ? parseInt(range[1], 10) : Math.max(0, size - parseInt(range[2], 10));
  const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, {
    status: 206,
    headers: { ...headers, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}
