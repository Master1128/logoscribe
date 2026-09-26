"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/ui";

interface ModelState {
  id: string;
  label: string;
  description: string;
  bytes: number;
  recommended: boolean;
  downloaded: boolean;
  active: boolean;
  download: { status: "queued" | "downloading" | "failed"; received: number; total: number; error: string | null } | null;
}

interface Payload {
  whisperCli: boolean;
  activePath: string;
  models: ModelState[];
  vad: ModelState;
  customModel: string | null;
  customModelFound: boolean;
}

const size = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace(".", ",")} GB` : `${Math.round(bytes / 1e6)} MB`;

/** Download, activate and delete local Whisper models on the server. */
export function ModelManager({ onActiveChange }: { onActiveChange: (path: string) => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api<Payload>("/api/models").then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const busy = data ? [...data.models, data.vad].some((m) => m.download && m.download.status !== "failed") : false;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [busy, load]);

  useEffect(() => {
    if (data) onActiveChange(data.activePath);
  }, [data?.activePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id: string, action: string) => {
    setError(null);
    try {
      setData(await api<Payload>("/api/models", { method: "POST", body: JSON.stringify({ id, action }) }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!data) return <p className="text-sm text-muted">Cargando modelos…</p>;
  const hasActive = data.models.some((m) => m.active && m.downloaded) || (data.customModel && data.customModelFound);

  return (
    <div className="space-y-3">
      {!data.whisperCli && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          Falta instalar whisper.cpp en el servidor (en Mac: <code>brew install whisper-cpp</code>). Sin él no se puede
          transcribir localmente.
        </p>
      )}
      {!hasActive && (
        <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-gold">
          No hay ningún modelo activo. Descarga uno (recomendado: Large v3 Turbo); se activa solo al terminar.
        </p>
      )}

      <ul className="divide-y divide-line rounded-lg border border-line">
        {data.models.map((m) => (
          <ModelRow key={m.id} model={m} onAction={(a) => act(m.id, a)} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
        <div>
          <span className="font-medium">{data.vad.label}</span>
          <span className="ml-2 text-xs text-muted">{data.vad.description}</span>
        </div>
        {data.vad.downloaded ? (
          <span className="rounded bg-ok/10 px-1.5 py-0.5 text-xs font-medium text-ok">Activo</span>
        ) : data.vad.download && data.vad.download.status !== "failed" ? (
          <span className="text-xs text-muted">Descargando…</span>
        ) : (
          <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act("vad", "download")}>Descargar ({size(data.vad.bytes)})</button>
        )}
      </div>

      {data.customModel && (
        <p className="text-xs text-muted">
          Modelo activo personalizado: <code className="break-all">{data.customModel}</code>
          {!data.customModelFound && <span className="text-danger"> (no encontrado)</span>}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function ModelRow({ model: m, onAction }: { model: ModelState; onAction: (action: string) => void }) {
  const d = m.download;
  const downloading = d && d.status !== "failed";
  const pct = d && d.total ? Math.floor((d.received / d.total) * 100) : 0;

  return (
    <li className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.label}</span>
            <span className="text-xs text-muted">{size(m.bytes)}</span>
            {m.recommended && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">Recomendado</span>}
            {m.active && m.downloaded && <span className="rounded bg-ok/10 px-1.5 py-0.5 text-[11px] font-medium text-ok">Activo</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{m.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {downloading ? (
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => onAction("cancel")}>Cancelar</button>
          ) : m.downloaded ? (
            <>
              {!m.active && <button className="btn-primary px-3 py-1 text-xs" onClick={() => onAction("activate")}>Activar</button>}
              <button
                className="btn-ghost px-3 py-1 text-xs text-danger"
                onClick={() => confirm(`¿Eliminar el modelo ${m.label} (${size(m.bytes)}) de este equipo?`) && onAction("delete")}
              >
                Eliminar
              </button>
            </>
          ) : (
            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => onAction("download")}>Descargar</button>
          )}
        </div>
      </div>
      {downloading && (
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[11px] text-muted">
            <span>{d.status === "queued" ? "En cola…" : `Descargando ${size(d.received)} de ${size(d.total || m.bytes)}`}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {d?.status === "failed" && <p className="mt-1 text-xs text-danger">No se pudo descargar: {d.error}</p>}
    </li>
  );
}
