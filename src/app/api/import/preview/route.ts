import { getSettings, saveSettings } from "@/lib/settings";
import { previewSource } from "@/lib/sources";

/** What a pasted link is, and the details to prefill (title, date, preacher, series). */
export async function POST(request: Request) {
  const { url } = await request.json();
  if (typeof url !== "string" || !url.trim()) return Response.json({ error: "Falta el enlace" }, { status: 400 });
  const settings = getSettings();
  try {
    const preview = await previewSource(url, settings.podcastFeedUrl || null);
    if (preview.feedUrl && !settings.podcastFeedUrl) saveSettings({ podcastFeedUrl: preview.feedUrl });
    return Response.json({ preview });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
