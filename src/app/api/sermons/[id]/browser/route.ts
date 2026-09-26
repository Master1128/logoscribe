import { browserParts, readLock } from "@/lib/browser-jobs";
import { getSermon } from "@/lib/repo";

/** The parts of the sermon and which ones are already transcribed. */
export async function GET(_req: Request, ctx: RouteContext<"/api/sermons/[id]/browser">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon?.duration) return Response.json({ error: "No encontrada" }, { status: 404 });
  return Response.json({ parts: browserParts(sermon), locked: Boolean(readLock(sermon)) });
}
