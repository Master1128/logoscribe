import { claimLock, saveBrowserPart } from "@/lib/browser-jobs";
import { getSermon } from "@/lib/repo";
import type { Segment } from "@/lib/types";

export async function POST(request: Request, ctx: RouteContext<"/api/sermons/[id]/browser/[part]">) {
  const { id, part } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon || sermon.status !== "transcribing") return Response.json({ error: "La prédica no se está transcribiendo" }, { status: 409 });
  const body = (await request.json()) as { owner: string; segments: Segment[] };
  if (!claimLock(sermon, body.owner)) return Response.json({ error: "Otro navegador está transcribiendo esta prédica" }, { status: 409 });
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const segments = (body.segments ?? []).filter((s) => num(s.start) && num(s.end) && typeof s.text === "string");
  return Response.json(saveBrowserPart(sermon, Number(part), segments));
}
