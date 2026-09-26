"use client";

import { useEffect, useState } from "react";
import { ModelManager } from "./ModelManager";
import { api, ENGINE_LABEL } from "@/lib/ui";
import type { Settings } from "@/lib/settings";
import type { EngineId } from "@/lib/types";

interface Payload {
  settings: Settings;
  secrets: { openai: boolean; openaiHost: string | null; groq: boolean; anthropic: boolean };
  localModelFound: boolean;
}


function Key({ ok, name }: { ok: boolean; name: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}`}>
      {ok ? `${name} configurada` : `Falta ${name}`}
    </span>
  );
}

function TestButton({ engine, disabled }: { engine: EngineId; disabled?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; result: string | null; ok?: boolean }>({ busy: false, result: null });
  async function test() {
    setState({ busy: true, result: null });
    type Result = { ok: boolean; ms?: number; error?: string };
    const r: Result = await api<Result>("/api/settings/test", {
      method: "POST",
      body: JSON.stringify({ engine }),
    }).catch((e): Result => ({ ok: false, error: (e as Error).message }));
    setState({ busy: false, ok: r.ok, result: r.ok ? `Funciona${r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : ""}` : r.error ?? "Error" });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={test} disabled={disabled || state.busy}>
        {state.busy ? "Probando…" : "Probar conexión"}
      </button>
      {state.result && <span className={`text-xs break-all ${state.ok ? "text-ok" : "text-danger"}`}>{state.result}</span>}
    </div>
  );
}

export function SettingsForm() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api<Payload>("/api/settings").then((d) => { setData(d); setDraft(d.settings); });
  }, []);

  if (!data || !draft) return <p className="text-sm text-muted">Cargando…</p>;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft({ ...draft, [key]: value });

  async function save() {
    setStatus("Guardando…");
    try {
      const d = await api<Payload>("/api/settings", { method: "PUT", body: JSON.stringify(draft) });
      setData(d);
      setDraft(d.settings);
      setStatus("Guardado");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">Transcripción</h2>
        <div>
          <label className="label" htmlFor="engine">Motor por defecto</label>
          <select id="engine" className="input" value={draft.defaultEngine} onChange={(e) => set("defaultEngine", e.target.value as EngineId)}>
            {(Object.keys(ENGINE_LABEL) as EngineId[]).map((id) => <option key={id} value={id}>{ENGINE_LABEL[id]}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">Se puede cambiar en cada prédica antes de transcribir.</p>
        </div>

        <div className="rounded-lg border-2 border-accent/30 p-4">
          <h3 className="mb-1 text-sm font-semibold">En este computador (recomendado, sin costo)</h3>
          <p className="mb-3 text-xs text-muted">
            Whisper transcribe con el procesador de este computador. El modelo se descarga una sola vez.
          </p>
          <ModelManager onActiveChange={(p) => setDraft((d) => (d ? { ...d, localModelPath: p } : d))} />
          <details className="mt-3 text-sm">
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
              <TestButton engine="local" />
            </div>
          </details>
        </div>

        <div className="rounded-lg border border-line p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">En la nube (de pago)</h3>
            <div className="flex gap-2"><Key ok={data.secrets.openai} name="OPENAI_API_KEY" /><Key ok={data.secrets.groq} name="GROQ_API_KEY" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="oai">Modelo OpenAI / compatible</label>
              <input id="oai" className="input" value={draft.openaiModel} onChange={(e) => set("openaiModel", e.target.value)} />
              <p className="mt-1 text-xs text-muted">Servidor: <code>{data.secrets.openaiHost ?? "api.openai.com"}</code></p>
              <div className="mt-2"><TestButton engine="openai" disabled={!data.secrets.openai} /></div>
            </div>
            <div>
              <label className="label" htmlFor="groq">Modelo Groq</label>
              <input id="groq" className="input" value={draft.groqModel} onChange={(e) => set("groqModel", e.target.value)} />
              <div className="mt-2 pt-5"><TestButton engine="groq" disabled={!data.secrets.groq} /></div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Las claves se configuran en el archivo <code>.env.local</code> del servidor, nunca desde el navegador. Para un
            servidor compatible con OpenAI (por ejemplo LiteLLM), añade también <code>OPENAI_BASE_URL</code>. Guarda los
            ajustes antes de probar un modelo nuevo.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="vocab">Vocabulario de ayuda</label>
          <textarea id="vocab" rows={3} className="input" value={draft.vocabularyPrompt} onChange={(e) => set("vocabularyPrompt", e.target.value)} />
          <p className="mt-1 text-xs text-muted">Nombres de pastores, de la iglesia y palabras frecuentes; mejora cómo se escriben.</p>
        </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Organización del texto</h2>
          <Key ok={data.secrets.anthropic} name="ANTHROPIC_API_KEY" />
        </div>
        <div>
          <label className="label" htmlFor="formatter">Organizador</label>
          <select id="formatter" className="input" value={draft.formatter} onChange={(e) => set("formatter", e.target.value as Settings["formatter"])}>
            <option value="claude">Claude (IA): párrafos por idea y títulos de sección</option>
            <option value="heuristic">Básico: párrafos por pausas y longitud (sin IA)</option>
          </select>
          <p className="mt-1 text-xs text-muted">En ambos casos no se cambia ninguna palabra: solo se decide dónde empiezan los párrafos.</p>
        </div>
        <div>
          <label className="label" htmlFor="cmodel">Modelo de Claude</label>
          <input id="cmodel" className="input" value={draft.claudeModel} onChange={(e) => set("claudeModel", e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.addHeadings} onChange={(e) => set("addHeadings", e.target.checked)} />
          Añadir títulos de sección
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>Guardar ajustes</button>
        {status && <span className="text-sm text-muted">{status}</span>}
      </div>
    </div>
  );
}
