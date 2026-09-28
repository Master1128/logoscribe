"use client";

import { useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { Region as WsRegion } from "wavesurfer.js/dist/plugins/regions.esm.js";
import Link from "next/link";
import { musicInside } from "@/lib/music";
import { api, formatTime } from "@/lib/ui";
import type { Region, Sermon } from "@/lib/types";

interface Waveform {
  duration: number;
  peaks: number[];
  regions: Region[];
  sermon: { start: number; end: number } | null;
  kind: "service" | "message";
}

interface Readiness {
  ok: boolean;
  error?: string;
}

const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const niceStep = (minSeconds: number) => NICE_STEPS.find((s) => s >= minSeconds) ?? 3600;

/** Tick and label spacing that stay readable from a 5-minute clip to a 2-hour service, at any zoom. */
function timelineOptions(pxPerSec: number, container: HTMLElement) {
  const label = niceStep(80 / pxPerSec);
  return {
    container,
    timeInterval: niceStep(10 / pxPerSec),
    primaryLabelInterval: label,
    secondaryLabelInterval: label,
    secondaryLabelOpacity: 0,
    formatTimeCallback: (t: number) => formatTime(t),
    style: { color: cssVar("--muted"), fontSize: "11px" },
  };
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function TrimEditor({ sermon, onChange }: { sermon: Sermon; onChange: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const region = useRef<WsRegion | null>(null);
  const stopAt = useRef<number | null>(null);
  const timelinePlugin = useRef<{ destroy: () => void } | null>(null);
  const makeTimeline = useRef<((pxPerSec: number) => void) | null>(null);

  const [wave, setWave] = useState<Waveform | null>(null);
  const [range, setRange] = useState({ start: sermon.trim_start ?? 0, end: sermon.trim_end ?? sermon.duration ?? 0 });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [skipChoice, setSkipChoice] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Readiness>("/api/settings/test", { method: "POST" }).then(setReady);
  }, []);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const [{ default: WaveSurferLib }, { default: RegionsPlugin }, { default: TimelinePlugin }, data] = await Promise.all([
        import("wavesurfer.js"),
        import("wavesurfer.js/dist/plugins/regions.esm.js"),
        import("wavesurfer.js/dist/plugins/timeline.esm.js"),
        api<Waveform>(`/api/sermons/${sermon.id}/waveform`),
      ]);
      if (destroyed || !container.current) return;
      setWave(data);

      const regions = RegionsPlugin.create();
      const instance = WaveSurferLib.create({
        container: container.current,
        url: `/api/sermons/${sermon.id}/audio`,
        peaks: [data.peaks],
        duration: data.duration,
        height: 128,
        normalize: true,
        waveColor: cssVar("--muted"),
        progressColor: cssVar("--accent"),
        cursorColor: cssVar("--gold"),
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        dragToSeek: true,
        plugins: [regions],
      });
      ws.current = instance;

      makeTimeline.current = (pxPerSec: number) => {
        timelinePlugin.current?.destroy();
        timelinePlugin.current = instance.registerPlugin(TimelinePlugin.create(timelineOptions(pxPerSec, timeline.current!)));
      };
      makeTimeline.current(container.current.clientWidth / data.duration);

      // Regions need the waveform laid out first, or they collapse to zero width.
      instance.once("decode", () => {
        // Music/silence bands from the analysis, for orientation only.
        for (const r of data.regions) {
          if (r.kind === "speech") continue;
          regions.addRegion({ start: r.start, end: r.end, drag: false, resize: false, color: r.kind === "music" ? "rgba(168,122,42,0.18)" : "rgba(120,120,120,0.10)" });
        }
        region.current = regions.addRegion({
          id: "sermon",
          start: sermon.trim_start ?? 0,
          end: sermon.trim_end ?? data.duration,
          drag: true,
          resize: true,
          color: "rgba(43,58,85,0.22)",
          content: "Prédica",
        });
      });
      regions.on("region-updated", (r) => {
        if (r.id === "sermon") setRange({ start: r.start, end: r.end });
      });

      instance.on("play", () => setPlaying(true));
      instance.on("pause", () => setPlaying(false));
      instance.on("timeupdate", (t) => {
        setTime(t);
        if (stopAt.current !== null && t >= stopAt.current) {
          stopAt.current = null;
          instance.pause();
        }
      });
    })().catch((e) => setError(e.message));
    return () => {
      destroyed = true;
      ws.current?.destroy();
      ws.current = null;
    };
  }, [sermon.id, sermon.trim_start, sermon.trim_end]);

  useEffect(() => {
    region.current?.setOptions({ start: range.start, end: range.end });
  }, [range]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        ws.current?.playPause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const duration = wave?.duration ?? sermon.duration ?? 0;
  const clamp = (v: number) => Math.max(0, Math.min(duration, v));
  const nudge = (edge: "start" | "end", delta: number) =>
    setRange((r) => {
      const next = { ...r, [edge]: clamp(r[edge] + delta) };
      return next.end - next.start >= 5 ? next : r;
    });

  const songs = wave ? musicInside(wave.regions, range.start, range.end) : [];
  const skipMusic = skipChoice ?? (sermon.skip_music === null ? wave?.kind === "message" : sermon.skip_music === 1);
  const setSkipMusic = (v: boolean) => setSkipChoice(v);

  const listen = (from: number, seconds: number) => {
    const w = ws.current;
    if (!w) return;
    stopAt.current = from + seconds;
    w.setTime(clamp(from));
    w.play();
  };

  async function transcribe() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/sermons/${sermon.id}`, {
        method: "PATCH",
        body: JSON.stringify({ trim_start: range.start, trim_end: range.end, skip_music: songs.length ? skipMusic : null }),
      });
      await api(`/api/sermons/${sermon.id}/actions`, { method: "POST", body: JSON.stringify({ action: "transcribe" }) });
      onChange();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }


  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="mb-3 text-sm">
          {wave?.sermon && wave.kind === "message" ? (
            <>Parece un <strong>podcast o devocional</strong>: se marcó desde la primera hasta la última palabra, sin la música de entrada y de cierre. <strong>Escucha el inicio y el final</strong> y ajusta si hace falta.</>
          ) : wave?.sermon ? (
            <>Parece un <strong>culto con alabanza</strong>: la app marcó la prédica. <strong>Escucha el inicio y el final</strong> y ajusta si hace falta: arrastra los bordes del recuadro azul o usa los botones.</>
          ) : wave ? (
            <>No se pudo detectar la prédica automáticamente. <strong>Arrastra los bordes del recuadro azul</strong> hasta el inicio y el final de la prédica.</>
          ) : (
            "Cargando la forma de onda…"
          )}
        </p>
        <div ref={container} className="overflow-hidden rounded-lg bg-paper" />
        <div ref={timeline} />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <button className="btn-primary w-32 whitespace-nowrap" onClick={() => ws.current?.playPause()} disabled={!wave}>
            {playing ? "❚❚ Pausa" : "▶ Reproducir"}
          </button>
          <span className="font-mono text-xs text-muted tabular-nums">{formatTime(time)} / {formatTime(duration)}</span>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            Zoom
            <input
              type="range" min={0} max={40} value={zoom}
              onChange={(e) => {
                const v = +e.target.value;
                setZoom(v);
                ws.current?.zoom(v);
                const fit = (container.current?.clientWidth ?? 800) / duration;
                makeTimeline.current?.(Math.max(v, fit));
              }}
            />
          </label>
          <span className="flex items-center gap-3 text-xs text-muted">
            <span className="inline-block h-3 w-3 rounded-sm bg-[rgba(43,58,85,0.35)]" /> Prédica
            <span className="inline-block h-3 w-3 rounded-sm bg-[rgba(168,122,42,0.35)]" /> Música
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <EdgeControl
          label="Inicio de la prédica"
          value={range.start}
          onNudge={(d) => nudge("start", d)}
          onListen={() => listen(range.start, 15)}
          onSetHere={() => setRange((r) => (time < r.end - 5 ? { ...r, start: time } : r))}
          listenLabel="Escuchar 15 s desde el inicio"
        />
        <EdgeControl
          label="Final de la prédica"
          value={range.end}
          onNudge={(d) => nudge("end", d)}
          onListen={() => listen(Math.max(range.start, range.end - 15), 15)}
          onSetHere={() => setRange((r) => (time > r.start + 5 ? { ...r, end: time } : r))}
          listenLabel="Escuchar los últimos 15 s"
        />
      </div>

      {songs.length > 0 && (
        <div className="card space-y-2 p-4 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={skipMusic} onChange={(e) => setSkipMusic(e.target.checked)} />
            <span>
              <strong>Omitir la música dentro del recorte</strong> ({songs.length === 1 ? "1 tramo" : `${songs.length} tramos`}):
              no se transcribe, para que la letra de una canción no aparezca como parte del mensaje.
              {wave?.kind === "service" && (
                <span className="block text-xs text-muted">
                  En los cultos viene desactivado: a veces el predicador habla sobre la música. Escucha los tramos antes de activarlo.
                </span>
              )}
            </span>
          </label>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {songs.map((m) => (
              <button key={m.start} type="button" className="btn-ghost px-2.5 py-1 text-xs tabular-nums" onClick={() => listen(m.start, 15)}>
                ▶ {formatTime(m.start)}–{formatTime(m.end)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-4 p-4">
        {ready && !ready.ok && (
          <p className="w-full rounded-lg bg-gold-soft px-3 py-2 text-sm text-gold">
            {ready.error} <Link href="/ajustes" className="underline">Ir a Ajustes</Link>
          </p>
        )}
        <div className="flex-1 text-sm text-muted">
          Duración a transcribir: <strong className="text-ink">{formatTime(range.end - range.start)}</strong>
        </div>
        <button className="btn-primary" onClick={transcribe} disabled={saving || !wave || ready?.ok === false}>
          {saving ? "Enviando…" : "Transcribir esta parte"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function EdgeControl(props: {
  label: string;
  value: number;
  listenLabel: string;
  onNudge: (delta: number) => void;
  onListen: () => void;
  onSetHere: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <span className="label">{props.label}</span>
        <span className="font-mono text-lg tabular-nums">{formatTime(props.value)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[-30, -5, -1, 1, 5, 30].map((d) => (
          <button key={d} className="btn-ghost px-2.5 py-1 text-xs tabular-nums" onClick={() => props.onNudge(d)}>
            {d > 0 ? `+${d}` : d} s
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn-ghost px-3 py-1 text-xs" onClick={props.onListen}>▶ {props.listenLabel}</button>
        <button className="btn-ghost px-3 py-1 text-xs" onClick={props.onSetHere}>Poner donde está el cursor</button>
      </div>
    </div>
  );
}
