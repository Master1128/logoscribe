import { claimLock } from "@/lib/browser-jobs";
import { getSermon } from "@/lib/repo";

/** Heartbeat from the browser doing the transcription. */
export async function POST(request: Request, ctx: RouteContext<"/api/sermons/[id]/browser/lock">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon || sermon.status !== "transcribing") return Response.json({ ok: false, reason: "not-transcribing" });
  const { owner } = await request.json();
  return Response.json({ ok: claimLock(sermon, String(owner)) });
}
