import { listSermons } from "@/lib/repo";
import { getSettings, saveSettings } from "@/lib/settings";
import { fetchFeed, resolveFeedUrl } from "@/lib/sources";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Episodes of the church's podcast. `?url=` accepts the feed or any page that
 * links to it (a Spotify episode, the show page); it's remembered for next time.
 */
export async function GET(request: Request) {
  const given = new URL(request.url).searchParams.get("url")?.trim();
  const settings = getSettings();
  try {
    const feedUrl = given ? (await resolveFeedUrl(given)).feedUrl : settings.podcastFeedUrl;
    if (!feedUrl) return Response.json({ feedUrl: null, title: null, episodes: [] });
    const feed = await fetchFeed(feedUrl);
    if (feedUrl !== settings.podcastFeedUrl) saveSettings({ podcastFeedUrl: feedUrl });

    // Mark what's already in the library (same audio link or same title).
    const sermons = listSermons();
    const byUrl = new Map(sermons.filter((s) => s.source_url).map((s) => [s.source_url!, s.id]));
    const titled = sermons.map((s) => ({ id: s.id, title: norm(s.title) })).filter((s) => s.title.length >= 8);
    // The podcast often adds a subtitle: "… No. 24: La Disposición de …" matches "… No. 24".
    const sameTitle = (episode: string) => {
      const t = norm(episode);
      return titled.find((s) => t === s.title || (t.startsWith(s.title) && /^[\s:(–-]/.test(t.slice(s.title.length))))?.id ?? null;
    };
    const episodes = feed.episodes.map((e) => ({ ...e, sermonId: byUrl.get(e.audioUrl) ?? sameTitle(e.title) }));
    return Response.json({ feedUrl, title: feed.title, episodes });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
