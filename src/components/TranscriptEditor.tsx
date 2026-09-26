"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { findBibleRefs, uniqueRefs } from "@/lib/bible";
import { api, formatTime, type SermonPayload } from "@/lib/ui";
import type { Block, Sermon } from "@/lib/types";

type EditableBlock = Block & { key: string };

const withKeys = (blocks: Block[]): EditableBlock[] => blocks.map((b) => ({ ...b, key: crypto.randomUUID() }));

export function TranscriptEditor({
  data,
  onReload,
  onAction,
}: {
  data: SermonPayload;
  onReload: () => void;
  onAction: (action: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const { sermon } = data;
  const [blocks, setBlocks] = useState<EditableBlock[]>(() => withKeys(data.blocks));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editing, setEditing] = useState<string | null>(null);
  const [caret, setCaret] = useState<{ key: string; pos: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [follow, setFollow] = useState(true);
  const audio = useRef<HTMLAudioElement>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      api(`/api/sermons/${sermon.id}/blocks`, {
        method: "PUT",
        body: JSON.stringify({ blocks: blocks.map((b) => ({ kind: b.kind, text: b.text, start: b.start, end: b.end })) }),
      })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 900);
    return () => clearTimeout(t);
  }, [blocks, sermon.id]);

  const update = (fn: (prev: EditableBlock[]) => EditableBlock[]) => {
    dirty.current = true;
    setBlocks(fn);
  };

  const refs = useMemo(() => uniqueRefs(blocks.filter((b) => b.kind === "paragraph").map((b) => b.text)), [blocks]);
  const headings = blocks.filter((b) => b.kind === "heading");

  const activeKey = useMemo(() => {
    let key: string | null = null;
    for (const b of blocks) if (b.kind === "paragraph" && b.start !== null && b.start <= currentTime + 0.3) key = b.key;
    return key;
  }, [blocks, currentTime]);

  useEffect(() => {
    if (!follow || !activeKey || audio.current?.paused || editing) return;
    document.getElementById(`b-${activeKey}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeKey, follow, editing]);

  const playFrom = (t: number | null) => {
    if (t === null || !audio.current) return;
    audio.current.currentTime = t;
    audio.current.play();
  };

  // ---- structural edits

  // Edits read the current blocks directly (not an updater) so the new keys
  // used for focus are the same ones stored.
  const splitAt = (index: number, pos: number) => {
    const b = blocks[index];
    const before = b.text.slice(0, pos).trim();
    const after = b.text.slice(pos).trim();
    if (!before || !after) return;
    const mid = b.start !== null && b.end !== null ? b.start + ((b.end - b.start) * pos) / b.text.length : null;
    const key = crypto.randomUUID();
    const next = [...blocks];
    next.splice(index, 1, { ...b, text: before, end: mid }, { ...b, key, text: after, start: mid });
    update(() => next);
    setEditing(key);
    setCaret({ key, pos: 0 });
  };

  const mergeWithPrevious = (index: number) => {
    const a = blocks[index - 1];
    const b = blocks[index];
    if (!a || a.kind !== "paragraph") return;
    const next = [...blocks];
    next.splice(index - 1, 2, { ...a, text: `${a.text} ${b.text}`, end: b.end ?? a.end });
    update(() => next);
    setEditing(a.key);
    setCaret({ key: a.key, pos: a.text.length + 1 });
  };

  const insertHeading = (index: number) => {
    const key = crypto.randomUUID();
    const next = [...blocks];
    next.splice(index, 0, { key, kind: "heading", text: "Nuevo título", start: blocks[index]?.start ?? null, end: null });
    update(() => next);
    setEditing(key);
  };

  const remove = (index: number) => update((prev) => prev.filter((_, i) => i !== index));

  const setText = (index: number, text: string) =>
    update((prev) => prev.map((b, i) => (i === index ? { ...b, text } : b)));

  // ---- export

  const [exportOpts, setExportOpts] = useState({ headings: true, timestamps: false, sectionPageBreaks: false, bibleIndex: true });
  const exportUrl = (format: "docx" | "pdf") => {
    const p = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(exportOpts)) p.set(k, v ? "1" : "0");
    return `/api/sermons/${sermon.id}/export?${p}`;
  };

  return (
    <div className="pb-28">
      <MetadataHeader sermon={sermon} onSaved={onReload} saveState={saveState} />

      {sermon.error && (
        <p className="mb-4 rounded-lg bg-gold-soft px-4 py-2 text-sm text-gold">{sermon.error}</p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="card px-5 py-8 sm:px-12">
          {blocks.length === 0 && <p className="text-muted">La transcripción está vacía.</p>}
          {blocks.map((b, i) =>
            b.kind === "heading" ? (
              <div key={b.key} id={`b-${b.key}`} className="group relative mt-10 mb-4 first:mt-0">
                <input
                  className="w-full border-b border-transparent bg-transparent font-sans text-xl font-semibold text-accent outline-none focus:border-line"
                  value={b.text}
                  autoFocus={editing === b.key}
                  onFocus={() => setEditing(b.key)}
                  onBlur={() => setEditing(null)}
                  onChange={(e) => setText(i, e.target.value)}
                  aria-label="Título de sección"
                />
                <button
                  onClick={() => remove(i)}
                  className="absolute top-1 -right-2 hidden rounded px-2 text-xs text-muted group-hover:block hover:text-danger sm:-right-10"
                  title="Quitar título"
                >
                  ✕
                </button>
              </div>
            ) : (
              <Paragraph
                key={b.key}
                block={b}
                active={activeKey === b.key}
                editing={editing === b.key}
                caret={caret?.key === b.key ? caret.pos : null}
                onEdit={(pos) => { setEditing(b.key); setCaret({ key: b.key, pos }); }}
                onDone={() => { setEditing(null); setCaret(null); }}
                onChange={(t) => setText(i, t)}
                onSplit={(pos) => splitAt(i, pos)}
                onMergeUp={() => mergeWithPrevious(i)}
                onPlay={() => playFrom(b.start)}
                onInsertHeading={() => insertHeading(i)}
                onDelete={() => remove(i)}
              />
            ),
          )}
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="card p-4">
            <h3 className="label">Exportar</h3>
            <div className="mt-2 space-y-1.5 text-sm">
              {([
                ["headings", "Títulos de sección"],
                ["timestamps", "Marcas de tiempo"],
                ["sectionPageBreaks", "Cada sección en página nueva"],
                ["bibleIndex", "Índice de citas bíblicas"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={exportOpts[k]} onChange={(e) => setExportOpts((o) => ({ ...o, [k]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a className="btn-primary" href={exportUrl("docx")}>Word</a>
              <a className="btn-ghost" href={exportUrl("pdf")}>PDF</a>
            </div>
            {saveState === "saving" && <p className="mt-2 text-xs text-muted">Espera a que se guarden los cambios antes de exportar.</p>}
          </section>

          {headings.length > 0 && (
            <section className="card p-4">
              <h3 className="label">Secciones</h3>
              <ol className="mt-2 space-y-1 text-sm">
                {headings.map((h) => (
                  <li key={h.key}>
                    <button className="text-left hover:text-accent" onClick={() => document.getElementById(`b-${h.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                      {h.text}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card p-4">
            <h3 className="label">Citas bíblicas ({refs.length})</h3>
            {refs.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No se detectaron citas.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {refs.map((r) => (
                  <li key={r.label}>
                    <a href={r.url} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold hover:underline">
                      {r.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-2 p-4 text-sm">
            <h3 className="label">Proceso</h3>
            <p className="text-muted">
              Recorte {formatTime(sermon.trim_start)} – {formatTime(sermon.trim_end)}
              <br />Whisper en este computador
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                className="btn-ghost justify-start py-1.5 text-xs"
                onClick={() => confirm("Se volverán a organizar los párrafos y secciones. Se perderán las ediciones manuales. ¿Continuar?") && onAction("reformat")}
              >
                Reorganizar párrafos
              </button>
              <button
                className="btn-ghost justify-start py-1.5 text-xs"
                onClick={() => confirm("Vas a ajustar el recorte y transcribir de nuevo. Se perderán las ediciones manuales. ¿Continuar?") && onAction("retrim")}
              >
                Ajustar recorte y transcribir de nuevo
              </button>
              <button
                className="btn-ghost justify-start py-1.5 text-xs text-danger"
                onClick={async () => {
                  if (!confirm(`¿Eliminar "${sermon.title}" con su audio y transcripción? No se puede deshacer.`)) return;
                  await api(`/api/sermons/${sermon.id}`, { method: "DELETE" });
                  router.push("/");
                }}
              >
                Eliminar prédica
              </button>
            </div>
          </section>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <audio
            ref={audio}
            src={`/api/sermons/${sermon.id}/audio`}
            controls
            preload="metadata"
            className="h-10 flex-1"
            onLoadedMetadata={(e) => {
              if (sermon.trim_start && e.currentTarget.currentTime === 0) e.currentTarget.currentTime = sermon.trim_start;
            }}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Seguir el audio
          </label>
        </div>
      </div>
    </div>
  );
}

function Paragraph(props: {
  block: EditableBlock;
  active: boolean;
  editing: boolean;
  caret: number | null;
  onEdit: (caret: number) => void;
  onDone: () => void;
  onChange: (text: string) => void;
  onSplit: (pos: number) => void;
  onMergeUp: () => void;
  onPlay: () => void;
  onInsertHeading: () => void;
  onDelete: () => void;
}) {
  const { block } = props;
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = area.current;
    if (!props.editing || !el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.editing, block.text]);

  useEffect(() => {
    const el = area.current;
    if (props.editing && el) {
      el.focus();
      const pos = props.caret ?? el.value.length;
      el.setSelectionRange(pos, pos);
    }
  }, [props.editing, props.caret]);

  return (
    <div
      id={`b-${block.key}`}
      className={`group relative -mx-3 mb-5 rounded-lg border-l-2 px-3 transition-colors ${
        props.active ? "border-gold bg-gold-soft/40" : "border-transparent"
      }`}
    >
      <div className="absolute top-1 -left-12 hidden w-11 flex-col items-end gap-1 sm:flex">
        {block.start !== null && (
          <button onClick={props.onPlay} className="rounded px-1 font-mono text-[11px] whitespace-nowrap text-muted opacity-60 group-hover:opacity-100 hover:text-accent" title="Escuchar desde aquí">
            ▶ {formatTime(block.start)}
          </button>
        )}
      </div>

      {props.editing ? (
        <textarea
          ref={area}
          className="reading block w-full resize-none rounded-md bg-accent-soft/50 p-0 outline-none"
          value={block.text}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onDone}
          onKeyDown={(e) => {
            const el = e.currentTarget;
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              props.onSplit(el.selectionStart);
            } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
              e.preventDefault();
              props.onMergeUp();
            } else if (e.key === "Escape") {
              el.blur();
            }
          }}
        />
      ) : (
        <p className="reading cursor-text" onClick={(e) => props.onEdit(caretOffset(e.currentTarget))}>
          <RefText text={block.text} />
        </p>
      )}

      <div className="absolute -top-3 right-0 hidden gap-1 group-hover:flex">
        {block.start !== null && (
          <button onMouseDown={(e) => e.preventDefault()} onClick={props.onPlay} className="rounded border border-line bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-accent sm:hidden">
            ▶ {formatTime(block.start)}
          </button>
        )}
        <button onMouseDown={(e) => e.preventDefault()} onClick={props.onInsertHeading} className="rounded border border-line bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-accent">
          + Título
        </button>
        <button onMouseDown={(e) => e.preventDefault()} onClick={props.onMergeUp} className="rounded border border-line bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-accent" title="Unir con el párrafo anterior">
          ↑ Unir
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => confirm("¿Eliminar este párrafo?") && props.onDelete()}
          className="rounded border border-line bg-surface px-2 py-0.5 text-[11px] text-muted hover:text-danger"
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

/** Character offset of the click inside `el`, so editing starts where the user clicked. */
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.anchorNode || !el.contains(sel.anchorNode)) return el.textContent?.length ?? 0;
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  return range.toString().length;
}

function RefText({ text }: { text: string }) {
  const refs = findBibleRefs(text);
  if (!refs.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of refs) {
    if (r.index > cursor) parts.push(text.slice(cursor, r.index));
    parts.push(
      <a
        key={r.index}
        href={r.url}
        target="_blank"
        rel="noreferrer"
        title={`Abrir ${r.label} (RVR1960)`}
        onClick={(e) => e.stopPropagation()}
        className="rounded bg-gold-soft px-0.5 font-semibold text-gold decoration-gold/40 underline-offset-2 hover:underline"
      >
        {text.slice(r.index, r.index + r.length)}
      </a>,
    );
    cursor = r.index + r.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function MetadataHeader({ sermon, onSaved, saveState }: { sermon: Sermon; onSaved: () => void; saveState: string }) {
  const [form, setForm] = useState({
    title: sermon.title,
    preacher: sermon.preacher ?? "",
    service_date: sermon.service_date ?? "",
    series: sermon.series ?? "",
  });
  const save = (key: keyof typeof form) => {
    const original = key === "title" ? sermon.title : sermon[key] ?? "";
    if (form[key] === original) return;
    if (key === "title" && !form.title.trim()) return setForm((f) => ({ ...f, title: sermon.title }));
    api(`/api/sermons/${sermon.id}`, { method: "PATCH", body: JSON.stringify({ [key]: form[key] }) }).then(onSaved);
  };
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => save(key),
  });

  return (
    <div className="mb-6">
      <input
        {...field("title")}
        aria-label="Título"
        className="w-full rounded-md bg-transparent font-serif text-3xl font-semibold outline-none hover:bg-surface focus:bg-surface"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <input {...field("preacher")} placeholder="Predicador" aria-label="Predicador" className="w-44 rounded-md bg-transparent px-1 py-0.5 outline-none hover:bg-surface focus:bg-surface" />
        <span>·</span>
        <input {...field("service_date")} type="date" aria-label="Fecha" className="rounded-md bg-transparent px-1 py-0.5 outline-none hover:bg-surface focus:bg-surface" />
        <span>·</span>
        <input {...field("series")} placeholder="Serie" aria-label="Serie" className="w-44 rounded-md bg-transparent px-1 py-0.5 outline-none hover:bg-surface focus:bg-surface" />
        <span className="ml-auto text-xs">
          {saveState === "saving" ? "Guardando…" : saveState === "saved" ? "Cambios guardados" : saveState === "error" ? "No se pudo guardar" : "Haz clic en un párrafo para editarlo · Enter divide · Retroceso al inicio une"}
        </span>
      </div>
    </div>
  );
}
