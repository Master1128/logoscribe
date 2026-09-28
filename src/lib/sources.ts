/**
 * Where a sermon's audio can come from besides a local file: YouTube, a
 * podcast (episode page, RSS feed or its media link), a direct audio link, or
 * a OneDrive share. Each can be previewed (title, date, preacher, series) and
 * downloaded into the sermon's folder.
 */
import fs from "node:fs";
import path from "node:path";
import { run } from "./audio";
import { isMedia, saveResponse } from "./download";
import { downloadShared, isOneDriveUrl } from "./onedrive";
import { tool } from "./tools";

export type SourceKind = "youtube" | "podcast" | "audio" | "onedrive";

export interface SourcePreview {
  kind: SourceKind;
  title: string | null;
  /** YYYY-MM-DD */
  date: string | null;
  preacher: string | null;
  series: string | null;
  durationSec: number | null;
  /** Podcast feed this link belongs to, when known. */
  feedUrl: string | null;
}

export interface Episode {
  title: string;
  date: string | null;
  durationSec: number | null;
  audioUrl: string;
  preacher: string | null;
  series: string | null;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Logoscribe";

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const YOUTUBE = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/;
const PODCAST_PAGES = /(^|\.)(podcasters\.spotify\.com|creators\.spotify\.com|anchor\.fm)$/;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|webm|mp4)$/i;

export function detectKind(raw: string): SourceKind | null {
  const url = parseUrl(raw);
  if (!url) return null;
  if (YOUTUBE.test(url.hostname)) return "youtube";
  if (isOneDriveUrl(url.toString())) return "onedrive";
  // anchor.fm/s/<id>/podcast/play/… is the episode's media link itself.
  if (/\/podcast\/play\//.test(url.pathname) || AUDIO_EXT.test(url.pathname)) return "audio";
  if (PODCAST_PAGES.test(url.hostname) || /\/(rss|feed)(\/|$|\.xml)/i.test(url.pathname) || /\.xml$/i.test(url.pathname)) return "podcast";
  return null;
}

// ---------------------------------------------------------------- guesses

/** "Estudio Bíblico de Filipenses No. 24: …" → "Estudio Bíblico de Filipenses". */
export function guessSeries(title: string | null): string | null {
  const m = title?.match(/^(.*?)\s+(?:No\.?|N[º°]|#|Parte)\s*\d+/i);
  return m ? m[1].replace(/[\s:–-]+$/, "").trim() || null : null;
}

const PREACHER = /^(Pastor|Pastora|Pr\.?|Apóstol|Apostol|Evangelista|Profeta|Obispo|Hno\.?|Hna\.?|Hermano|Hermana|Rev\.?)\s+[\p{L}. ]{3,60}$/u;

/** Episode descriptions are often just the preacher: "Pastor Jean Paul López". */
export function guessPreacher(description: string | null): string | null {
  const text = plain(description).split(/\n|\. /)[0]?.trim() ?? "";
  if (!PREACHER.test(text)) return null;
  return text.replace(/^Hno\b\.?/, "Hno.").replace(/^Hna\b\.?/, "Hna.");
}

function plain(html: string | null): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const isoDate = (d: Date) => (Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10));

function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parts = raw.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// ---------------------------------------------------------------- podcast feeds

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>(?:\\s*<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>\\s*)?</${name}>`));
  return m ? m[1].trim() : null;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

const feedCache = new Map<string, { at: number; title: string; episodes: Episode[] }>();

export async function fetchFeed(feedUrl: string): Promise<{ title: string; episodes: Episode[] }> {
  const cached = feedCache.get(feedUrl);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached;
  const res = await fetch(feedUrl, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`El podcast respondió ${res.status}`);
  const xml = await res.text();
  if (!/<rss|<feed/i.test(xml)) throw new Error("Ese enlace no es un feed de podcast");
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)].map((m) => m[0]);
  const episodes: Episode[] = items.flatMap((item) => {
    const audio = item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1];
    const title = tag(item, "title");
    if (!audio || !title) return [];
    const t = decodeEntities(title);
    const pub = tag(item, "pubDate");
    return [{
      title: t,
      date: pub ? isoDate(new Date(pub)) : null,
      durationSec: parseDuration(tag(item, "itunes:duration")),
      audioUrl: decodeEntities(audio),
      preacher: guessPreacher(decodeEntities(tag(item, "description") ?? "")),
      series: guessSeries(t),
    }];
  });
  const result = { title: decodeEntities(tag(xml.split(/<item\b/)[0], "title") ?? "Podcast"), episodes };
  feedCache.set(feedUrl, { at: Date.now(), ...result });
  return result;
}

/** Accepts a feed URL or any page that links to one (e.g. a Spotify for Creators episode). */
export async function resolveFeedUrl(raw: string): Promise<{ feedUrl: string; page: string | null }> {
  const url = parseUrl(raw);
  if (!url) throw new Error("El enlace no es válido");
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`La página respondió ${res.status}`);
  const body = await res.text();
  if (/^\s*(<\?xml|<rss|<feed)/i.test(body)) return { feedUrl: res.url, page: null };
  const found =
    body.match(/https?:\/\/anchor\.fm\/s\/[a-z0-9]+\/podcast\/rss/i)?.[0] ??
    body.match(/<link[^>]+type="application\/(?:rss|atom)\+xml"[^>]+href="([^"]+)"/i)?.[1] ??
    body.match(/"rssUrl"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\u002F/g, "/");
  if (!found) throw new Error("No se encontró el feed del podcast en esa página");
  return { feedUrl: decodeEntities(found), page: body };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function findEpisode(episodes: Episode[], title: string | null, audioUrl?: string | null) {
  if (audioUrl) {
    const byUrl = episodes.find((e) => e.audioUrl === audioUrl || audioUrl.includes(e.audioUrl) || e.audioUrl.includes(audioUrl));
    if (byUrl) return byUrl;
  }
  if (!title) return null;
  const t = norm(title);
  return episodes.find((e) => norm(e.title) === t) ?? episodes.find((e) => norm(e.title).startsWith(t) || t.startsWith(norm(e.title))) ?? null;
}

/** Media URL of a podcast episode page, so it can be downloaded. */
async function episodeAudioUrl(pageUrl: string): Promise<{ audioUrl: string | null; title: string | null; feedUrl: string | null }> {
  const { feedUrl, page } = await resolveFeedUrl(pageUrl);
  const html = page ?? "";
  const audio = html.match(/"audioUrl"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\u002F/g, "/") ?? null;
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] ?? null;
  const title = ogTitle ? decodeEntities(ogTitle).replace(/\s+by\s+[^]+$/i, "").trim() : null;
  return { audioUrl: audio, title, feedUrl };
}

// ---------------------------------------------------------------- preview

async function youtubeInfo(url: string) {
  const out = await run(tool("yt-dlp"), ["--no-warnings", "--no-playlist", "--skip-download", "--dump-single-json", url]);
  return JSON.parse(out) as { title?: string; upload_date?: string; duration?: number; channel?: string };
}

export async function previewSource(raw: string, knownFeed: string | null): Promise<SourcePreview> {
  const kind = detectKind(raw);
  if (!kind) throw new Error("No reconozco ese enlace. Usa un enlace de YouTube, del podcast, de OneDrive o de un archivo de audio.");
  const empty: SourcePreview = { kind, title: null, date: null, preacher: null, series: null, durationSec: null, feedUrl: null };

  if (kind === "onedrive") return empty;

  if (kind === "youtube") {
    const info = await youtubeInfo(raw).catch((err: Error) => {
      if (/ENOENT/.test(err.message)) throw new Error("Falta yt-dlp para descargar de YouTube. Vuelve a ejecutar el instalador de Logoscribe.");
      throw new Error(`YouTube no respondió: ${err.message.split("\n").pop()}`);
    });
    const title = info.title ?? null;
    const d = info.upload_date?.match(/^(\d{4})(\d{2})(\d{2})$/);
    const preview: SourcePreview = {
      ...empty,
      title,
      date: d ? `${d[1]}-${d[2]}-${d[3]}` : null,
      durationSec: info.duration ?? null,
      series: guessSeries(title),
    };
    // The same message is often on the church's podcast, which names the preacher.
    if (knownFeed) {
      const ep = await fetchFeed(knownFeed).then((f) => findEpisode(f.episodes, title)).catch(() => null);
      if (ep) return { ...preview, preacher: ep.preacher, series: ep.series ?? preview.series, feedUrl: knownFeed };
    }
    return preview;
  }

  if (kind === "podcast") {
    const page = await episodeAudioUrl(raw);
    const feed = page.feedUrl ? await fetchFeed(page.feedUrl).catch(() => null) : null;
    const ep = feed ? findEpisode(feed.episodes, page.title, page.audioUrl) : null;
    if (!ep && !page.audioUrl) throw new Error("Ese enlace es de un podcast, pero no de un episodio. Usa la pestaña «Podcast» para elegirlo.");
    return {
      ...empty,
      title: ep?.title ?? page.title,
      date: ep?.date ?? null,
      preacher: ep?.preacher ?? null,
      series: ep?.series ?? guessSeries(page.title),
      durationSec: ep?.durationSec ?? null,
      feedUrl: page.feedUrl,
    };
  }

  // Direct audio: look it up in the known feed for its details.
  if (knownFeed) {
    const ep = await fetchFeed(knownFeed).then((f) => findEpisode(f.episodes, null, raw)).catch(() => null);
    if (ep) return { ...empty, title: ep.title, date: ep.date, preacher: ep.preacher, series: ep.series, durationSec: ep.durationSec, feedUrl: knownFeed };
  }
  const name = decodeURIComponent(parseUrl(raw)!.pathname.split("/").pop() ?? "");
  return { ...empty, title: AUDIO_EXT.test(name) ? name.replace(AUDIO_EXT, "").replace(/[-_]+/g, " ").trim() || null : null };
}

// ---------------------------------------------------------------- download

const OUT_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|mp4|webm)$/i;

/** Downloads the source into `dir` as source.<ext>; returns the saved path. */
export async function downloadSource(
  raw: string,
  dir: string,
  onProgress: (fraction: number, message: string) => void,
  signal?: AbortSignal,
): Promise<{ path: string; fileName: string }> {
  const kind = detectKind(raw);
  const dest = (name: string) => path.join(dir, `source${OUT_EXT.test(name) ? path.extname(name).toLowerCase() : ".mp3"}`);

  if (kind === "onedrive") {
    return downloadShared(raw, dest, (f) => onProgress(f, "Descargando de OneDrive"), signal);
  }

  if (kind === "youtube") {
    onProgress(0, "Descargando el audio de YouTube");
    for (const f of fs.readdirSync(dir).filter((n) => n.startsWith("source."))) fs.rmSync(path.join(dir, f), { force: true });
    await run(
      tool("yt-dlp"),
      ["--no-warnings", "--no-playlist", "--newline", "-f", "bestaudio[ext=m4a]/bestaudio/best", "-o", path.join(dir, "source.%(ext)s"), raw],
      {
        signal,
        onStdout: (line) => {
          const m = line.match(/\[download\]\s+([\d.]+)%/);
          if (m) onProgress(Math.min(1, Number(m[1]) / 100), "Descargando el audio de YouTube");
        },
      },
    ).catch((err: Error) => {
      if (signal?.aborted) throw err;
      throw new Error(`No se pudo descargar de YouTube: ${err.message.split("\n").filter(Boolean).pop()}`);
    });
    const saved = fs.readdirSync(dir).find((n) => n.startsWith("source.") && !n.endsWith(".part"));
    if (!saved) throw new Error("YouTube no entregó el audio");
    return { path: path.join(dir, saved), fileName: saved };
  }

  let audioUrl = raw;
  if (kind === "podcast") {
    const page = await episodeAudioUrl(raw);
    if (!page.audioUrl) throw new Error("No se encontró el audio de ese episodio");
    audioUrl = page.audioUrl;
  }
  onProgress(0, "Descargando el audio");
  const res = await fetch(audioUrl, { headers: { "user-agent": UA }, redirect: "follow", signal });
  if (!isMedia(res)) {
    await res.body?.cancel();
    throw new Error(`El enlace no entregó un archivo de audio (${res.status})`);
  }
  return saveResponse(res, dest, (f) => onProgress(f, "Descargando el audio"), signal);
}
