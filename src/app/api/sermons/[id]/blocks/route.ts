import { getSermon, saveBlocks } from "@/lib/repo";
import type { Block } from "@/lib/types";

export async function PUT(request: Request, ctx: RouteContext<"/api/sermons/[id]/blocks">) {
  const { id } = await ctx.params;
  if (!getSermon(id)) return Response.json({ error: "No encontrada" }, { status: 404 });
  const body = await request.json();
  if (!Array.isArray(body.blocks)) return Response.json({ error: "Formato inválido" }, { status: 400 });
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const blocks: Block[] = body.blocks
    .filter((b: Block) => (b.kind === "heading" || b.kind === "paragraph") && typeof b.text === "string")
    .map((b: Block) => ({ kind: b.kind, text: b.text.trim(), start: num(b.start), end: num(b.end) }))
    .filter((b: Block) => b.text);
  saveBlocks(id, blocks);
  return Response.json({ ok: true });
}
