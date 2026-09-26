"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  activeBrowserModel, checkWebGpu, deleteCached, downloadToCache, isCached, loadModel, requestPersistence,
  setActiveBrowserModel, terminateWorker, transcribeSamples, type GpuSupport,
} from "@/lib/browser/asr";
import { BROWSER_MODELS, type BrowserModel } from "@/lib/browser/models";

const size = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace(".", ",")} GB` : `${Math.round(bytes / 1e6)} MB`;

/** Per-browser model management: each user downloads the model to their own computer. */
export function BrowserModelManager() {
  const [gpu, setGpu] = useState<GpuSupport | null>(null);
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<{ id: string; fraction: number; loaded: number; total: number; phase: "download" | "gpu" } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; suggestLite?: boolean } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(BROWSER_MODELS.map(async (m) => [m.id, await isCached(m)] as const));
    setCached(Object.fromEntries(entries));
    setActive(activeBrowserModel()?.id ?? null);
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) setStorage({ usage: est.usage ?? 0, quota: est.quota });
  }, []);

  useEffect(() => {
    (async () => {
      const support = await checkWebGpu();
      setGpu(support);
      await refresh();
    })();
  }, [refresh]);

  async function download(m: BrowserModel) {
    setMessage(null);
    if (storage && storage.quota - storage.usage < m.bytes * 1.1) {
      setMessage({ ok: false, text: `No hay espacio suficiente en este navegador (quedan ${size(storage.quota - storage.usage)}).` });
      return;
    }
    await requestPersistence();
    abort.current = new AbortController();
    setDownloading({ id: m.id, fraction: 0, loaded: 0, total: m.bytes, phase: "download" });
    try {
      await downloadToCache(
        m,
        (loaded, total) => setDownloading({ id: m.id, fraction: total ? loaded / total : 0, loaded, total, phase: "download" }),
        abort.current.signal,
      );
      // Load once to confirm this computer can actually run it.
      setDownloading((d) => (d ? { ...d, fraction: 1, phase: "gpu" } : d));
      await loadModel(m);
      setActiveBrowserModel(m.id);
      setMessage({ ok: true, text: `${m.label} quedó listo y activo en este navegador.` });
    } catch (e) {
      const text = (e as Error).message;
      if (text !== "Cancelado" && !abort.current?.signal.aborted) {
        const memory = /memoria/i.test(text);
        setMessage({ ok: false, text: `No se pudo preparar el modelo: ${text}`, suggestLite: memory && m.id !== "turbo-lite" && m.id !== "small" });
      }
    } finally {
      abort.current = null;
      setDownloading(null);
      refresh();
    }
  }

  function cancel() {
    abort.current?.abort();
    terminateWorker();
    setDownloading(null);
    refresh();
  }

  async function test(m: BrowserModel) {
    setMessage({ ok: true, text: "Probando… (la primera vez carga el modelo en la tarjeta gráfica)" });
    try {
      await loadModel(m);
      // 5 s of a quiet tone: checks the full pipeline without needing a recording.
      const audio = new Float32Array(16000 * 5).map((_, i) => 0.05 * Math.sin((2 * Math.PI * 220 * i) / 16000));
      const t0 = performance.now();
      await transcribeSamples(audio, 0);
      setMessage({ ok: true, text: `Funciona en este navegador (${((performance.now() - t0) / 1000).toFixed(1)} s para 5 s de audio).` });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      {gpu && !gpu.ok && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{gpu.reason}</p>}
      {gpu?.ok && !active && (
        <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-gold">
          Descarga un modelo para transcribir con tu computador. Se descarga una sola vez y queda guardado en este navegador.
        </p>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {BROWSER_MODELS.map((m) => {
          const isDownloading = downloading?.id === m.id;
          return (
            <li key={m.id} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-xs text-muted">{size(m.bytes)}</span>
                    {m.recommended && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">Recomendado</span>}
                    {active === m.id && cached[m.id] && <span className="rounded bg-ok/10 px-1.5 py-0.5 text-[11px] font-medium text-ok">Activo</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{m.description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {isDownloading ? (
                    <button className="btn-ghost px-3 py-1 text-xs" onClick={cancel}>Cancelar</button>
                  ) : cached[m.id] ? (
                    <>
                      {active !== m.id && (
                        <button className="btn-primary px-3 py-1 text-xs" onClick={() => { setActiveBrowserModel(m.id); refresh(); }}>Activar</button>
                      )}
                      <button className="btn-ghost px-3 py-1 text-xs" onClick={() => test(m)}>Probar</button>
                      <button
                        className="btn-ghost px-3 py-1 text-xs text-danger"
                        onClick={async () => {
                          if (!confirm(`¿Borrar ${m.label} de este navegador?`)) return;
                          terminateWorker();
                          await deleteCached(m);
                          refresh();
                        }}
                      >
                        Borrar
                      </button>
                    </>
                  ) : (
                    <button className="btn-ghost px-3 py-1 text-xs" disabled={Boolean(downloading) || gpu?.ok === false} onClick={() => download(m)}>
                      Descargar
                    </button>
                  )}
                </div>
              </div>
              {isDownloading && (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[11px] text-muted">
                    <span>
                      {downloading.phase === "gpu"
                        ? "Cargando en la tarjeta gráfica para comprobar que funciona…"
                        : `Descargando ${size(downloading.loaded)} de ${size(downloading.total || m.bytes)}`}
                    </span>
                    <span>{Math.floor(downloading.fraction * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
                    <div className="h-full bg-accent transition-all duration-500" style={{ width: `${downloading.fraction * 100}%` }} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {message && (
        <div className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
          <p>{message.text}</p>
          {message.suggestLite && (
            <button
              className="btn-primary mt-2 px-3 py-1 text-xs"
              onClick={async () => {
                const turbo = BROWSER_MODELS.find((b) => b.id === "turbo");
                if (turbo) await deleteCached(turbo); // free the space the failed model used
                const lite = BROWSER_MODELS.find((b) => b.id === "turbo-lite");
                if (lite) download(lite);
              }}
            >
              Usar el modelo liviano
            </button>
          )}
        </div>
      )}
      {storage && (
        <p className="text-xs text-muted">
          Espacio usado por Logoscribe en este navegador: {size(storage.usage)} de {size(storage.quota)} disponibles.
        </p>
      )}
    </div>
  );
}
