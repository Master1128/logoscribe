"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { activeBrowserModel, checkWebGpu, fetchSamples, isCached, loadModel, terminateWorker, transcribeSamples } from "@/lib/browser/asr";
import { api, formatTime } from "@/lib/ui";
import type { Sermon } from "@/lib/types";

interface Part { index: number; start: number; end: number; done: boolean }

type Phase =
  | { kind: "starting" }
  | { kind: "loading"; fraction: number }
  | { kind: "working"; part: number; total: number; done: number }
  | { kind: "busy-elsewhere" }
  | { kind: "no-model" }
  | { kind: "error"; message: string };

/** Drives an in-browser transcription: one part at a time, resumable. */
export function BrowserTranscriber({ sermon, onFinished, onCancel }: { sermon: Sermon; onFinished: () => void; onCancel: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [elapsed, setElapsed] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // Identifies this tab in the server-side lock; set once on mount.
  const owner = useRef("");

  useEffect(() => {
    let stopped = false;
    if (!owner.current) owner.current = crypto.randomUUID();
    const t0 = Date.now();
    const clock = setInterval(() => setElapsed((Date.now() - t0) / 1000), 1000);
    const beat = () => api<{ ok: boolean }>(`/api/sermons/${sermon.id}/browser/lock`, { method: "POST", body: JSON.stringify({ owner: owner.current }) });
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    (async () => {
      const model = activeBrowserModel();
      if (!model || !(await isCached(model))) return setPhase({ kind: "no-model" });
      const gpu = await checkWebGpu();
      if (!gpu.ok && model.dtype.model === "fp16") return setPhase({ kind: "error", message: gpu.reason! });

      if (!(await beat()).ok) return setPhase({ kind: "busy-elsewhere" });
      heartbeat = setInterval(() => beat().catch(() => {}), 15_000);

      setPhase({ kind: "loading", fraction: 0 });
      await loadModel(model);

      const { parts } = await api<{ parts: Part[] }>(`/api/sermons/${sermon.id}/browser`);
      const pending = parts.filter((p) => !p.done);
      let done = parts.length - pending.length;
      for (const part of pending) {
        if (stopped) return;
        setPhase({ kind: "working", part: part.index, total: parts.length, done });
        const audio = await fetchSamples(`/api/sermons/${sermon.id}/browser/${part.index}/audio`);
        const segments = await transcribeSamples(audio, part.start);
        if (stopped) return;
        const res = await api<{ complete: boolean }>(`/api/sermons/${sermon.id}/browser/${part.index}`, {
          method: "POST",
          body: JSON.stringify({ owner: owner.current, segments }),
        });
        done++;
        if (res.complete) { onFinished(); return; }
      }
      onFinished();
    })().catch((err) => {
      if (!stopped) setPhase({ kind: "error", message: (err as Error).message });
    });

    return () => {
      stopped = true;
      clearInterval(clock);
      clearInterval(heartbeat);
    };
  }, [sermon.id, attempt, onFinished]);

  const cancel = () => {
    if (!confirm("¿Detener la transcripción? Lo ya transcrito se conserva para retomarlo después.")) return;
    terminateWorker();
    onCancel();
  };

  const pct =
    phase.kind === "working" ? phase.done / phase.total : phase.kind === "loading" ? phase.fraction : 0;

  return (
    <div className="card mx-auto max-w-xl p-6">
      <h2 className="font-semibold">Transcribiendo en este navegador</h2>
      <p className="mt-1 text-sm text-muted">
        Tu computador hace el trabajo; <strong>no cierres esta pestaña</strong> hasta que termine. Si se cierra, lo ya
        transcrito se conserva y continúa al volver a abrir la prédica.
      </p>

      {phase.kind === "no-model" ? (
        <p className="mt-4 rounded-lg bg-gold-soft px-3 py-2 text-sm text-gold">
          Este navegador aún no tiene un modelo. Descárgalo en <Link href="/ajustes" className="underline">Ajustes</Link> y vuelve aquí.
        </p>
      ) : phase.kind === "busy-elsewhere" ? (
        <p className="mt-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
          Esta prédica se está transcribiendo en otro navegador. Puedes cerrar esta página; se actualizará cuando termine.
        </p>
      ) : phase.kind === "error" ? (
        <div className="mt-4 space-y-2">
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm whitespace-pre-wrap text-danger">{phase.message}</p>
          <button className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>Reintentar</button>
        </div>
      ) : (
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>
              {phase.kind === "starting" && "Preparando…"}
              {phase.kind === "loading" && "Cargando el modelo en la tarjeta gráfica…"}
              {phase.kind === "working" && `Parte ${phase.done + 1} de ${phase.total}`}
            </span>
            <span>{Math.round(pct * 100)}% · {formatTime(elapsed)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full bg-accent transition-all duration-700" style={{ width: `${Math.max(2, pct * 100)}%` }} />
          </div>
        </div>
      )}

      <div className="mt-4 text-right">
        <button className="btn-ghost px-3 py-1 text-xs" onClick={cancel}>Detener</button>
      </div>
    </div>
  );
}
