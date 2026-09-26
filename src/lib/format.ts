/**
 * Turns raw recognizer segments into an organized document.
 *
 * The preacher's words are never rewritten: text is split into sentences
 * locally, and the organizer (Claude or the heuristic) only decides *where*
 * paragraphs and sections begin, by sentence index. Section headings are the
 * one addition, and they are rendered as titles, never mixed into the speech.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { secrets, type Settings } from "./settings";
import type { Block, Segment } from "./types";

export interface Sentence {
  text: string;
  start: number;
  end: number;
}

const ABBREVIATIONS = new Set(["sr", "sra", "srta", "dr", "dra", "pr", "ap", "lic", "ing", "núm", "no", "vs", "cap", "vers"]);

export function splitSentences(segments: Segment[]): Sentence[] {
  // Spread each segment's duration across its words, weighted by length.
  const words: { w: string; start: number; end: number }[] = [];
  for (const seg of segments) {
    const parts = seg.text.split(/\s+/).filter(Boolean);
    const totalChars = parts.reduce((n, p) => n + p.length + 1, 0);
    let cursor = seg.start;
    for (const p of parts) {
      const dur = ((seg.end - seg.start) * (p.length + 1)) / totalChars;
      words.push({ w: p, start: cursor, end: cursor + dur });
      cursor += dur;
    }
  }

  const sentences: Sentence[] = [];
  let current: typeof words = [];
  words.forEach((word, i) => {
    current.push(word);
    const next = words[i + 1];
    const endsWithStop = /[.?!…]["»”')\]]*$/.test(word.w);
    const bare = word.w.replace(/[.?!…"»”')\]]+$/, "").toLowerCase();
    const nextStartsSentence = !next || /^[¿¡"«“(]*[\p{Lu}\d]/u.test(next.w);
    if (!next || (endsWithStop && nextStartsSentence && !ABBREVIATIONS.has(bare))) {
      sentences.push({
        text: current.map((c) => c.w).join(" "),
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [];
    }
  });
  return sentences;
}

export interface Structure {
  /** Sentence indices where a new paragraph begins (always includes 0). */
  paragraphStarts: number[];
  sections: { start: number; title: string }[];
}

// ---------------------------------------------------------------- heuristic

const TRANSITIONS =
  /^(ahora bien|ahora|en primer lugar|en segundo lugar|en tercer lugar|primero|segundo|tercero|cuarto|por último|finalmente|entonces|hermanos|iglesia|amados|vamos a|oremos|pongámonos|quiero que|la biblia dice|dice la palabra|miren)\b/i;

export function heuristicStructure(sentences: Sentence[]): Structure {
  const starts = [0];
  let words = 0;
  sentences.forEach((s, i) => {
    if (i === 0) { words = wordCount(s.text); return; }
    const gap = s.start - sentences[i - 1].end;
    const breakHere =
      words >= 150 ||
      (words >= 40 && gap > 1.2) ||
      (words >= 30 && TRANSITIONS.test(s.text.replace(/^[¿¡"«“]+/, "")));
    if (breakHere) { starts.push(i); words = 0; }
    words += wordCount(s.text);
  });
  return { paragraphStarts: starts, sections: [] };
}

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

// ---------------------------------------------------------------- claude

const StructureSchema = z.object({
  paragraph_starts: z.array(z.number().int()),
  sections: z.array(z.object({ start: z.number().int(), title: z.string() })),
});

const SYSTEM = `Organizas transcripciones de prédicas cristianas en español para que la congregación pueda estudiarlas.

Recibes la prédica dividida en oraciones numeradas. No puedes cambiar ni una palabra: tu único trabajo es decidir la estructura, indicando números de oración.

Párrafos: empieza un párrafo nuevo cuando cambia la idea, cuando el predicador introduce una lectura bíblica, una ilustración o historia, un punto de una lista ("primero", "segundo"...), una aplicación o una oración. Un párrafo suele tener entre 3 y 8 oraciones (unas 60 a 180 palabras); evita párrafos de una sola oración salvo que sea una transición clara, y evita bloques de más de 250 palabras.

Secciones: identifica los grandes movimientos del mensaje (introducción, cada punto principal, aplicación, oración final); normalmente entre 3 y 8. Dales un título breve (2 a 6 palabras) en español, usando en lo posible las propias palabras del predicador. Cada sección empieza en una oración que también es inicio de párrafo.`;

async function claudeStructure(sentences: Sentence[], settings: Settings): Promise<Structure> {
  const client = new Anthropic({
    apiKey: secrets.anthropic(),
    baseURL: process.env.LOGOSCRIBE_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
  });
  const CHUNK = 600;
  const result: Structure = { paragraphStarts: [], sections: [] };

  for (let offset = 0; offset < sentences.length; offset += CHUNK) {
    const slice = sentences.slice(offset, offset + CHUNK);
    const numbered = slice.map((s, i) => `[${offset + i}] ${s.text}`).join("\n");
    const headingNote = settings.addHeadings
      ? ""
      : "\n\nNo se desean títulos de sección: devuelve `sections` vacío.";
    const partNote =
      sentences.length > CHUNK
        ? `\n\nEsta es la parte que va de la oración ${offset} a la ${offset + slice.length - 1} de una prédica de ${sentences.length} oraciones.`
        : "";

    const stream = client.messages.stream({
      model: settings.claudeModel,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(StructureSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `${numbered}${partNote}${headingNote}` }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("El modelo no procesó el texto (refusal)");
    if (message.stop_reason === "max_tokens") throw new Error("La respuesta del modelo quedó incompleta");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = StructureSchema.parse(JSON.parse(text));

    const inRange = (n: number) => n >= offset && n < offset + slice.length;
    result.paragraphStarts.push(offset, ...parsed.paragraph_starts.filter(inRange));
    for (const s of parsed.sections) {
      if (inRange(s.start) && s.title.trim()) result.sections.push({ start: s.start, title: s.title.trim() });
    }
  }

  result.paragraphStarts.push(...result.sections.map((s) => s.start));
  result.paragraphStarts = [...new Set(result.paragraphStarts)].sort((a, b) => a - b);
  result.sections.sort((a, b) => a.start - b.start);
  return result;
}

// ---------------------------------------------------------------- assemble

export function buildBlocks(sentences: Sentence[], structure: Structure): Block[] {
  const starts = new Set(structure.paragraphStarts);
  const titles = new Map(structure.sections.map((s) => [s.start, s.title]));
  const blocks: Block[] = [];
  let para: Sentence[] = [];

  const flush = () => {
    if (!para.length) return;
    blocks.push({
      kind: "paragraph",
      text: para.map((s) => s.text).join(" "),
      start: para[0].start,
      end: para[para.length - 1].end,
    });
    para = [];
  };

  sentences.forEach((s, i) => {
    if (i > 0 && starts.has(i)) flush();
    const title = titles.get(i);
    if (title) blocks.push({ kind: "heading", text: title, start: s.start, end: null });
    para.push(s);
  });
  flush();
  return blocks;
}

export async function organize(
  segments: Segment[],
  settings: Settings,
): Promise<{ blocks: Block[]; note: string | null }> {
  const sentences = splitSentences(segments);
  if (!sentences.length) return { blocks: [], note: "La transcripción quedó vacía" };

  let structure: Structure;
  let note: string | null = null;
  if (settings.formatter === "claude" && secrets.anthropic()) {
    try {
      structure = await claudeStructure(sentences, settings);
    } catch (err) {
      note = `No se pudo organizar con Claude (${(err as Error).message}); se usó el organizador básico.`;
      structure = heuristicStructure(sentences);
    }
  } else {
    if (settings.formatter === "claude") note = "Falta ANTHROPIC_API_KEY; se usó el organizador básico.";
    structure = heuristicStructure(sentences);
  }
  return { blocks: buildBlocks(sentences, structure), note };
}
