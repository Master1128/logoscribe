import { isOneDriveUrl } from "@/lib/onedrive";
import { createSermon, enqueue, listSermons, searchSermons, setStatus } from "@/lib/repo";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (q) return Response.json({ results: searchSermons(q) });
  return Response.json({ results: listSermons().map((sermon) => ({ sermon, snippet: null })) });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  if (!title) return Response.json({ error: "El título es obligatorio" }, { status: 400 });
  const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const sourceUrl = clean(body.source_url);
  if (sourceUrl && !isOneDriveUrl(sourceUrl)) {
    return Response.json({ error: "Pega un enlace compartido de OneDrive o SharePoint (https://1drv.ms/…)" }, { status: 400 });
  }
  const sermon = createSermon({
    title,
    preacher: clean(body.preacher),
    series: clean(body.series),
    service_date: clean(body.service_date),
    source_name: clean(body.source_name),
    source_url: sourceUrl,
  });
  if (sourceUrl) {
    setStatus(sermon.id, "importing");
    enqueue(sermon.id, "import");
  }
  return Response.json({ sermon }, { status: 201 });
}
