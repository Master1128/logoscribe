"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteSermonButton } from "./DeleteSermonButton";
import { StatusBadge } from "./StatusBadge";
import { TrimEditor } from "./TrimEditor";
import { TranscriptEditor } from "./TranscriptEditor";
import { api, formatDate, PROCESSING, type SermonPayload } from "@/lib/ui";

export function SermonView({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<SermonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () => api<SermonPayload>(`/api/sermons/${id}`).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)),
    [id],
  );

  useEffect(() => { load(); }, [load]);

  const busy = data ? PROCESSING.includes(data.sermon.status) || Boolean(data.job) : false;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [busy, load]);

  if (error && !data) return <p className="mx-auto max-w-6xl px-4 py-8 text-danger">{error}</p>;
  if (!data) return <p className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted">Cargando…</p>;

  const { sermon } = data;
  const action = (name: string) =>
    api(`/api/sermons/${id}/actions`, { method: "POST", body: JSON.stringify({ action: name }) }).then(load).catch((e) => setError(e.message));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-muted hover:text-ink">← Biblioteca</Link>
        {sermon.status !== "ready" && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-semibold">{sermon.title}</h1>
            <StatusBadge status={sermon.status} />
            <DeleteSermonButton sermon={sermon} onDeleted={() => router.push("/")} className="ml-auto px-3 py-1 text-xs" />
          </div>
        )}
        {sermon.status !== "ready" && (
          <p className="mt-1 text-sm text-muted">
            {[sermon.preacher, formatDate(sermon.service_date), sermon.series, sermon.source_name].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {busy ? (
        <Processing
          data={data}
          onCancel={() => confirm("¿Cancelar el proceso en curso?") && action("cancel")}
        />
      ) : sermon.status === "review" ? (
        <TrimEditor sermon={sermon} onChange={load} />
      ) : sermon.status === "failed" ? (
        <div className="card p-6">
          <h2 className="font-semibold text-danger">Algo salió mal</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{sermon.error}</p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => action("retry")}>Reintentar</button>
            {sermon.duration && <button className="btn-ghost" onClick={() => action("reanalyze")}>Volver a analizar el audio</button>}
          </div>
        </div>
      ) : (
        <TranscriptEditor data={data} onReload={load} onAction={action} />
      )}
    </div>
  );
}

const STEPS = [
  { status: "importing", label: "Descargar el audio" },
  { status: "analyzing", label: "Analizar el audio" },
  { status: "review", label: "Confirmar el recorte" },
  { status: "transcribing", label: "Transcribir la prédica" },
  { status: "formatting", label: "Organizar párrafos" },
] as const;

function Processing({ data, onCancel }: { data: SermonPayload; onCancel: () => void }) {
  const { sermon, job } = data;
  const steps = sermon.source_url ? STEPS : STEPS.slice(1);
  const current = sermon.status === "uploaded" ? steps.findIndex((s) => s.status === "analyzing") : steps.findIndex((s) => s.status === sermon.status);
  const pct = Math.round((job?.progress ?? 0) * 100);
  return (
    <div className="card mx-auto max-w-xl p-6">
      <ol className="mb-6 space-y-2">
        {steps.map((step, i) => (
          <li key={step.status} className={`flex items-center gap-3 text-sm ${i === current ? "font-medium text-ink" : i < current ? "text-ok" : "text-muted"}`}>
            <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i < current ? "bg-ok/15" : i === current ? "bg-accent text-surface" : "bg-accent-soft"}`}>
              {i < current ? "✓" : i + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{job?.status === "queued" ? "Esperando turno… (asegúrate de que el worker esté corriendo)" : job?.message ?? "Trabajando…"}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
        <div className="h-full bg-accent transition-all duration-700" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {sermon.status === "transcribing" && sermon.engine === "local" && (
        <p className="mt-4 text-xs text-muted">
          Con Whisper local una prédica de 45 minutos puede tardar varios minutos, según el equipo. Puedes cerrar esta
          página: el proceso sigue en segundo plano.
        </p>
      )}
      {data.job && (
        <div className="mt-4 text-right">
          <button className="btn-ghost px-3 py-1 text-xs" onClick={onCancel}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
