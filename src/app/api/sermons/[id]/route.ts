import { uniqueRefs } from "@/lib/bible";
import { activeJob, deleteSermon, getBlocks, getSermon, updateSermon } from "@/lib/repo";

export async function GET(_req: Request, ctx: RouteContext<"/api/sermons/[id]">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon) return Response.json({ error: "No encontrada" }, { status: 404 });
  const blocks = getBlocks(id);
  const refs = uniqueRefs(blocks.filter((b) => b.kind === "paragraph").map((b) => b.text));
  return Response.json({ sermon, job: activeJob(id), blocks, refs });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/sermons/[id]">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon) return Response.json({ error: "No encontrada" }, { status: 404 });
  const body = await request.json();
  const patch: Parameters<typeof updateSermon>[1] = {};
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if ("title" in body) {
    const title = text(body.title);
    if (!title) return Response.json({ error: "El título es obligatorio" }, { status: 400 });
    patch.title = title;
  }
  for (const key of ["preacher", "series", "service_date"] as const) {
    if (key in body) patch[key] = text(body[key]);
  }
  if ("engine" in body && ["browser", "openai", "groq", "local"].includes(body.engine)) patch.engine = body.engine;
  if ("trim_start" in body || "trim_end" in body) {
    const start = Number(body.trim_start ?? sermon.trim_start);
    const end = Number(body.trim_end ?? sermon.trim_end);
    if (!(start >= 0 && end > start && end <= (sermon.duration ?? Infinity) + 1)) {
      return Response.json({ error: "Rango de recorte inválido" }, { status: 400 });
    }
    patch.trim_start = start;
    patch.trim_end = end;
  }
  updateSermon(id, patch);
  return Response.json({ sermon: getSermon(id) });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/sermons/[id]">) {
  const { id } = await ctx.params;
  deleteSermon(id);
  return new Response(null, { status: 204 });
}
