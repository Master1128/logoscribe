"use client";

import { useEffect, useState } from "react";
import { ModelManager } from "./ModelManager";
import { api } from "@/lib/ui";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import type { Settings } from "@/lib/settings";

interface Payload {
  settings: Settings;
  apiKeys: Record<ProviderId, string | null>;
  localModelFound: boolean;
}

type Result = { ok: boolean; text: string } | null;

function LocalTestButton() {
  const [result, setResult] = useState<Result>(null);
  async function test() {
    const r = await api<{ ok: boolean; error?: string }>("/api/settings/test", { method: "POST" })
      .catch((e): { ok: boolean; error?: string } => ({ ok: false, error: (e as Error).message }));
    setResult({ ok: r.ok, text: r.ok ? "Todo listo para transcribir" : r.error ?? "Error" });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={test}>Comprobar</button>
      {result && <span className={`text-xs ${result.ok ? "text-ok" : "text-danger"}`}>{result.text}</span>}
    </div>
  );
}

export function SettingsForm() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [newKey, setNewKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [aiResult, setAiResult] = useState<Result>(null);
  const [busy, setBusy] = useState<"models" | "test" | null>(null);

  useEffect(() => {
    api<Payload>("/api/settings").then((d) => { setData(d); setDraft(d.settings); });
  }, []);

  if (!data || !draft) return <p className="text-sm text-muted">Cargando…</p>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });
  const provider = draft.organizerProvider === "basic" ? null : PROVIDERS[draft.organizerProvider];
  const savedKey = provider ? data.apiKeys[provider.id] : null;

  async function save(extra: Record<string, unknown> = {}) {
    setStatus("Guardando…");
    try {
      const body: Record<string, unknown> = { ...draft, ...extra };
      if (provider && newKey.trim()) body.apiKey = { provider: provider.id, key: newKey.trim() };
      const d = await api<Payload>("/api/settings", { method: "PUT", body: JSON.stringify(body) });
      setData(d);
      setDraft(d.settings);
      setNewKey("");
      setStatus("Guardado");
      return true;
    } catch (e) {
      setStatus((e as Error).message);
      return false;
    }
  }

  function chooseProvider(id: Settings["organizerProvider"]) {
    setModels([]);
    setAiResult(null);
    setNewKey("");
    // A model name only makes sense for its own provider.
    setDraft((d) => d && { ...d, organizerProvider: id, organizerModel: "" });
  }

  async function loadModels() {
    setBusy("models");
    setAiResult(null);
    if (await save()) {
      const r = await api<{ models: string[]; error?: string }>("/api/organizer/models");
      setModels(r.models);
      if (r.error) setAiResult({ ok: false, text: r.error });
      else if (!r.models.length) setAiResult({ ok: false, text: "El proveedor no devolvió modelos." });
    }
    setBusy(null);
  }

  async function testAi() {
    setBusy("test");
    setAiResult(null);
    if (await save()) {
      const r = await api<{ ok: boolean; error?: string; ms?: number; paragraphs?: number; sections?: string[] }>(
        "/api/organizer/test",
        { method: "POST" },
      );
      setAiResult(
        r.ok
          ? {
              ok: true,
              text: `Funciona (${((r.ms ?? 0) / 1000).toFixed(1)} s): ${r.paragraphs} párrafos${
                r.sections?.length ? `, secciones: ${r.sections.join(" · ")}` : ""
              }.`,
            }
          : { ok: false, text: r.error ?? "Error" },
      );
    }
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Transcripción</h2>
          <p className="mt-1 text-xs text-muted">
            Whisper transcribe con este computador, sin internet y sin costo. El modelo se descarga una sola vez.
          </p>
        </div>
        <ModelManager onActiveChange={(p) => setDraft((d) => (d ? { ...d, localModelPath: p } : d))} />
        <div>
          <label className="label" htmlFor="vocab">Vocabulario de ayuda</label>
          <textarea id="vocab" rows={3} className="input" value={draft.vocabularyPrompt} onChange={(e) => set("vocabularyPrompt", e.target.value)} />
          <p className="mt-1 text-xs text-muted">Nombres de pastores, de la iglesia y palabras frecuentes; mejora cómo se escriben.</p>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted">Opciones avanzadas</summary>
          <div className="mt-2 space-y-3">
            <div>
              <label className="label" htmlFor="model">Ruta de un modelo propio (ggml)</label>
              <input id="model" className="input font-mono text-xs" value={draft.localModelPath} onChange={(e) => set("localModelPath", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="threads">Hilos de CPU</label>
              <input id="threads" type="number" min={1} max={32} className="input w-28" value={draft.localThreads} onChange={(e) => set("localThreads", +e.target.value)} />
            </div>
            <LocalTestButton />
          </div>
        </details>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Detección de la prédica</h2>
        <div>
          <label className="label" htmlFor="min">Duración mínima de una prédica (minutos)</label>
          <input id="min" type="number" min={1} max={120} className="input w-28" value={draft.minSermonMinutes} onChange={(e) => set("minSermonMinutes", +e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={draft.autoTranscribe} onChange={(e) => set("autoTranscribe", e.target.checked)} />
          <span>Transcribir automáticamente con el recorte detectado, sin esperar revisión.<br /><span className="text-xs text-muted">Útil cuando la detección ya funciona bien con las grabaciones de tu iglesia.</span></span>
        </label>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Organización del texto</h2>
          <p className="mt-1 text-xs text-muted">
            Decide dónde empieza cada párrafo y, con IA, agrega títulos de sección. Nunca cambia lo que dijo el
            predicador. Con IA se envía el texto transcrito (no el audio) al proveedor elegido.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="provider">Organizador</label>
          <select
            id="provider"
            className="input"
            value={draft.organizerProvider}
            onChange={(e) => chooseProvider(e.target.value as Settings["organizerProvider"])}
          >
            <option value="basic">Básico, en este computador (sin IA): párrafos por pausas y longitud</option>
            {Object.values(PROVIDERS).map((p) => (
              <option key={p.id} value={p.id}>IA: {p.label}</option>
            ))}
          </select>
        </div>

        {provider && (
          <div className="space-y-4 rounded-lg border border-line p-4">
            {provider.id === "custom" && (
              <div>
                <label className="label" htmlFor="baseurl">Dirección del servidor</label>
                <input
                  id="baseurl"
                  className="input font-mono text-xs"
                  placeholder="http://localhost:11434/v1"
                  value={draft.organizerBaseUrl}
                  onChange={(e) => set("organizerBaseUrl", e.target.value)}
                />
                <p className="mt-1 text-xs text-muted">Ollama usa <code>http://localhost:11434/v1</code>.</p>
              </div>
            )}

            <div>
              <label className="label" htmlFor="apikey">Clave de API{provider.keyRequired ? "" : " (opcional)"}</label>
              {savedKey && !newKey ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-ok/10 px-1.5 py-0.5 text-xs font-medium text-ok">Clave guardada {savedKey}</span>
                  <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setNewKey(" ")}>Cambiar</button>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1 text-xs text-danger"
                    onClick={() => confirm("¿Borrar la clave guardada?") && save({ apiKey: { provider: provider.id, key: null } })}
                  >
                    Borrar
                  </button>
                </div>
              ) : (
                <input
                  id="apikey"
                  type="password"
                  autoComplete="off"
                  className="input font-mono text-xs"
                  placeholder="Pega aquí la clave"
                  value={newKey.trim() ? newKey : ""}
                  onChange={(e) => setNewKey(e.target.value)}
                />
              )}
              <p className="mt-1 text-xs text-muted">
                Se guarda solo en este computador.
                {provider.keyUrl && (
                  <> Consíguela en <a className="underline" href={provider.keyUrl} target="_blank" rel="noreferrer">{new URL(provider.keyUrl).host}</a>.</>
                )}
              </p>
            </div>

            <div>
              <label className="label" htmlFor="aimodel">Modelo</label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="aimodel"
                  className="input min-w-48 flex-1"
                  list="ai-models"
                  placeholder={provider.defaultModel || "nombre del modelo"}
                  value={draft.organizerModel}
                  onChange={(e) => set("organizerModel", e.target.value)}
                />
                <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
                <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={loadModels} disabled={busy !== null}>
                  {busy === "models" ? "Consultando…" : "Ver modelos disponibles"}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">
                {provider.defaultModel ? <>Si lo dejas vacío se usa <code>{provider.defaultModel}</code>. </> : null}
                {models.length > 0 && `${models.length} modelos disponibles: escribe para filtrar.`}
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.addHeadings} onChange={(e) => set("addHeadings", e.target.checked)} />
              Añadir títulos de sección
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={testAi} disabled={busy !== null}>
                {busy === "test" ? "Probando…" : "Probar con un texto de ejemplo"}
              </button>
              {aiResult && <span className={`text-xs break-all ${aiResult.ok ? "text-ok" : "text-danger"}`}>{aiResult.text}</span>}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={() => save()}>Guardar ajustes</button>
        {status && <span className="text-sm text-muted">{status}</span>}
      </div>
      {process.env.NEXT_PUBLIC_BUILD_DATE && (
        <p className="text-xs text-muted">
          Versión instalada:{" "}
          {new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleString("es", { dateStyle: "long", timeStyle: "short" })}
        </p>
      )}
    </div>
  );
}
