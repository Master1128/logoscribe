import { parseExportOptions, fileName } from "@/lib/export/common";
import { buildDocx } from "@/lib/export/docx";
import { buildPdf } from "@/lib/export/pdf";
import { getBlocks, getSermon } from "@/lib/repo";

export async function GET(request: Request, ctx: RouteContext<"/api/sermons/[id]/export">) {
  const { id } = await ctx.params;
  const sermon = getSermon(id);
  if (!sermon) return Response.json({ error: "No encontrada" }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const format = params.get("format") === "pdf" ? "pdf" : "docx";
  const opts = parseExportOptions(params);
  const blocks = getBlocks(id);

  const buffer = format === "pdf" ? await buildPdf(sermon, blocks, opts) : await buildDocx(sermon, blocks, opts);
  const name = fileName(sermon, format);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
