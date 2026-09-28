"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatDate, formatTime } from "@/lib/ui";
import type { Episode } from "@/lib/sources";
import type { Sermon } from "@/lib/types";

type Row = Episode & { sermonId: string | null };

interface Feed {
  feedUrl: string | null;
  title: string | null;
  episodes: Row[];
}

const PAGE = 25;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lists the church podcast's episodes; each one can be imported with one click. */
export function PodcastBrowser() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [link, setLink] = useState("");
  const [changing, setChanging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async (url?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Feed>(`/api/podcast${url ? `?url=${encodeURIComponent(url)}` : ""}`);
      setFeed(data);
      if (url) setChanging(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // First load (the remembered podcast): state is only set after the request.
  useEffect(() => {
    let alive = true;
    api<Feed>("/api/podcast")
      .then((data) => alive && setFeed(data))
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const all = feed?.episodes ?? [];
    return q ? all.filter((e) => norm(`${e.title} ${e.preacher ?? ""} ${e.series ?? ""}`).includes(q)) : all;
  }, [feed, query]);

  async function importEpisode(e: Row) {
    setImporting(e.audioUrl);
    setError(null);
    try {
      const { sermon } = await api<{ sermon: Sermon }>("/api/sermons", {
        method: "POST",
        body: JSON.stringify({
          title: e.title,
          preacher: e.preacher,
          series: e.series,
          service_date: e.date,
          source_url: e.audioUrl,
        }),
      });
      setFeed((f) => f && { ...f, episodes: f.episodes.map((x) => (x.audioUrl === e.audioUrl ? { ...x, sermonId: sermon.id } : x)) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(null);
    }
  }

  const askForFeed = !loading && (!feed?.feedUrl || changing);

  return (
    <div className="space-y-4">
      {askForFeed ? (
        <form
          className="space-y-2"
          onSubmit={(e) => { e.preventDefault(); if (link.trim()) load(link.trim()); }}
        >
          <label className="label" htmlFor="podcast">Enlace del podcast de la iglesia</label>
          <div className="flex gap-2">
            <input
              id="podcast"
              type="url"
              className="input"
              placeholder="Página de un episodio en Spotify, o el feed RSS"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary shrink-0">Ver episodios</button>
          </div>
          <p className="text-xs text-muted">
            Pega el enlace de cualquier episodio (por ejemplo de Spotify); se recuerda para la próxima vez.
          </p>
          {changing && <button type="button" className="text-xs text-muted underline" onClick={() => setChanging(false)}>Cancelar</button>}
        </form>
      ) : feed?.feedUrl ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-semibold">{feed.title}</h2>
            <p className="text-xs text-muted">{feed.episodes.length} episodios</p>
          </div>
          <button type="button" className="text-xs text-muted underline" onClick={() => setChanging(true)}>Cambiar podcast</button>
        </div>
      ) : null}

      {loading && <p className="text-sm text-muted">Cargando episodios…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!askForFeed && feed && feed.episodes.length > 0 && (
        <>
          <input
            className="input"
            placeholder="Buscar por título, serie o predicador…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
            aria-label="Buscar episodios"
          />
          <ul className="divide-y divide-line rounded-lg border border-line">
            {filtered.slice(0, shown).map((e) => (
              <li key={e.audioUrl} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{e.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[formatDate(e.date), e.durationSec ? formatTime(e.durationSec) : null, e.preacher].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {e.sermonId ? (
                  <Link href={`/predicas/${e.sermonId}`} className="btn-ghost shrink-0 px-3 py-1 text-xs text-ok">
                    ✓ En la biblioteca
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="btn-primary shrink-0 px-3 py-1 text-xs"
                    disabled={importing !== null}
                    onClick={() => importEpisode(e)}
                  >
                    {importing === e.audioUrl ? "Importando…" : "Importar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {filtered.length === 0 && <p className="text-sm text-muted">Ningún episodio coincide con la búsqueda.</p>}
          {filtered.length > shown && (
            <button type="button" className="btn-ghost w-full" onClick={() => setShown((n) => n + PAGE)}>
              Ver más ({filtered.length - shown} restantes)
            </button>
          )}
          <p className="text-xs text-muted">
            Cada episodio importado se descarga y se analiza en segundo plano; después revisa el recorte desde la
            Biblioteca.
          </p>
        </>
      )}
    </div>
  );
}
