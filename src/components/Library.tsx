"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SetupNotice } from "./SetupNotice";
import { StatusBadge } from "./StatusBadge";
import { api, formatDate, formatTime } from "@/lib/ui";
import type { Sermon } from "@/lib/types";

interface Hit {
  sermon: Sermon;
  snippet: string | null;
}

export function Library() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [preacher, setPreacher] = useState("");
  const [series, setSeries] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(
      () =>
        api<{ results: Hit[] }>(`/api/sermons${q ? `?q=${encodeURIComponent(q)}` : ""}`)
          .then((r) => { setHits(r.results); setError(null); })
          .catch((e) => setError(e.message)),
      q ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [query]);

  // Keep the list fresh while anything is still processing.
  useEffect(() => {
    if (!hits?.some((h) => !["ready", "review", "failed"].includes(h.sermon.status)) || query) return;
    const t = setInterval(() => api<{ results: Hit[] }>("/api/sermons").then((r) => setHits(r.results)), 4000);
    return () => clearInterval(t);
  }, [hits, query]);

  const preachers = useMemo(() => unique(hits?.map((h) => h.sermon.preacher)), [hits]);
  const seriesList = useMemo(() => unique(hits?.map((h) => h.sermon.series)), [hits]);
  const visible = (hits ?? []).filter(
    (h) => (!preacher || h.sermon.preacher === preacher) && (!series || h.sermon.series === series),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Biblioteca de prédicas</h1>
          <p className="mt-1 text-sm text-muted">Busca por cualquier palabra dicha en la prédica, el título o el predicador.</p>
        </div>
      </div>

      <SetupNotice />

      <div className="card mb-6 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 fill-muted">
            <path d="M8.5 3a5.5 5.5 0 014.38 8.83l3.65 3.64-1.06 1.06-3.64-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          <input
            className="input pl-9"
            placeholder="Ej.: gracia, Romanos 8, perdón…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en las prédicas"
          />
        </div>
        <select className="input w-auto" value={preacher} onChange={(e) => setPreacher(e.target.value)} aria-label="Predicador">
          <option value="">Todos los predicadores</option>
          {preachers.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="input w-auto" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Serie">
          <option value="">Todas las series</option>
          {seriesList.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {hits === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : visible.length === 0 ? (
        <EmptyState searching={Boolean(query || preacher || series)} />
      ) : (
        <ul className="grid gap-3">
          {visible.map(({ sermon, snippet }) => (
            <li key={sermon.id}>
              <Link href={`/predicas/${sermon.id}`} className="card block p-4 transition hover:border-accent/40 hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-serif text-lg font-semibold">{sermon.title}</h2>
                    <p className="mt-0.5 text-sm text-muted">
                      {[sermon.preacher, formatDate(sermon.service_date), sermon.series].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    {sermon.trim_start !== null && sermon.trim_end !== null && sermon.status === "ready" && (
                      <span>{formatTime(sermon.trim_end - sermon.trim_start)}</span>
                    )}
                    <StatusBadge status={sermon.status} />
                  </div>
                </div>
                {snippet && (
                  <p className="reading mt-2 text-base text-ink/80" dangerouslySetInnerHTML={{ __html: snippet }} />
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  if (searching) return <p className="py-12 text-center text-sm text-muted">No hay prédicas que coincidan con la búsqueda.</p>;
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      <h2 className="font-serif text-xl font-semibold">Todavía no hay prédicas</h2>
      <p className="max-w-md text-sm text-muted">
        Sube la grabación completa del culto. La app encuentra dónde empieza la prédica, la transcribe y la deja lista
        para leer, buscar y exportar a Word o PDF.
      </p>
      <Link href="/nueva" className="btn-primary mt-2">Subir la primera</Link>
    </div>
  );
}

function unique(values: (string | null | undefined)[] | undefined) {
  return [...new Set((values ?? []).filter((v): v is string => Boolean(v)))].sort();
}
