"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/ui";
import type { Sermon } from "@/lib/types";

/** Guesses the service date from names like "2026-09-20 culto.mp3" or "20260920.m4a". */
function dateFromFile(file: File): string {
  const m = file.name.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(file.lastModified);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function UploadForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [form, setForm] = useState({ title: "", preacher: "", series: "", service_date: "" });
  const [facets, setFacets] = useState<{ preachers: string[]; series: string[] }>({ preachers: [], series: [] });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<typeof facets>("/api/facets").then(setFacets).catch(() => {});
  }, []);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setForm((prev) => ({ ...prev, service_date: prev.service_date || dateFromFile(f) }));
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "link") {
      try {
        const { sermon } = await api<{ sermon: Sermon }>("/api/sermons", {
          method: "POST",
          body: JSON.stringify({ ...form, source_url: link.trim() }),
        });
        router.push(`/predicas/${sermon.id}`);
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }
    if (!file) return setError("Selecciona el archivo de audio");
    setProgress(0);
    try {
      const { sermon } = await api<{ sermon: Sermon }>("/api/sermons", {
        method: "POST",
        body: JSON.stringify({ ...form, source_name: file.name }),
      });
      await upload(`/api/sermons/${sermon.id}/upload`, file, setProgress);
      router.push(`/predicas/${sermon.id}`);
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5 p-6">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-paper p-1 text-sm" role="tablist">
        {([["file", "Subir archivo"], ["link", "Enlace de OneDrive"]] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); }}
            className={`rounded-md py-1.5 font-medium transition ${mode === m ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "file" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
          onClick={() => input.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging ? "border-accent bg-accent-soft" : "border-line hover:border-accent/50"
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-accent" strokeWidth={1.6}>
            <path d="M9 18V5l12-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zm12-2a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {file ? (
            <>
              <p className="font-medium">{file.name}</p>
              <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · clic para cambiar</p>
            </>
          ) : (
            <>
              <p className="font-medium">Arrastra aquí el audio del culto</p>
              <p className="text-xs text-muted">MP3, M4A, WAV, OGG… o haz clic para elegirlo</p>
            </>
          )}
          <input ref={input} type="file" accept="audio/*,video/mp4,.m4a,.amr" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="link">Enlace compartido de OneDrive</label>
          <input
            id="link"
            type="url"
            className="input"
            placeholder="https://1drv.ms/u/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-muted">
            En OneDrive: clic derecho sobre el audio → Compartir → «Cualquier persona con el vínculo» → Copiar vínculo.
          </p>
        </div>
      )}

      <div>
        <label className="label" htmlFor="title">Título de la prédica</label>
        <input id="title" className="input" required value={form.title} onChange={set("title")} placeholder="Ej.: El amor que da" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="preacher">Predicador</label>
          <input id="preacher" className="input" list="preachers" value={form.preacher} onChange={set("preacher")} />
          <datalist id="preachers">{facets.preachers.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="date">Fecha del culto</label>
          <input id="date" type="date" className="input" value={form.service_date} onChange={set("service_date")} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="series">Serie (opcional)</label>
        <input id="series" className="input" list="series" value={form.series} onChange={set("series")} />
        <datalist id="series">{facets.series.map((s) => <option key={s} value={s} />)}</datalist>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {progress !== null ? (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Subiendo audio…</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <button type="submit" className="btn-primary w-full" disabled={mode === "file" ? !file : !link.trim()}>
          {mode === "file" ? "Subir y analizar" : "Importar y analizar"}
        </button>
      )}
    </form>
  );
}

function upload(url: string, file: File, onProgress: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status < 300) return resolve();
      let message = `Error ${xhr.status}`;
      try { message = JSON.parse(xhr.responseText).error ?? message; } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Se perdió la conexión durante la subida"));
    xhr.send(file);
  });
}
