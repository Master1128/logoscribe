/**
 * Turns raw recognizer segments into an organized document.
 *
 * The preacher's words are never rewritten: text is split into sentences
 * locally, and the organizer (an AI provider or the heuristic) only decides *where*
 * paragraphs and sections begin, by sentence index. Section headings are the
 * one addition, and they are rendered as titles, never mixed into the speech.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { z } from "zod";
import { PROVIDERS, type ProviderId } from "./providers";
import { getApiKey, type Settings } from "./settings";
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

// ---------------------------------------------------------------- AI organizer

const StructureSchema = z.object({
  paragraph_starts: z.array(z.number().int()),
  sections: z.array(z.object({ start: z.number().int(), title: z.string() })),
});
type RawStructure = z.infer<typeof StructureSchema>;

const SYSTEM = `Organizas transcripciones de prédicas cristianas en español para que la congregación pueda estudiarlas.

Recibes la prédica dividida en oraciones numeradas. No puedes cambiar ni una palabra: tu único trabajo es decidir la estructura, indicando números de oración.

Párrafos: empieza un párrafo nuevo cuando cambia la idea, cuando el predicador introduce una lectura bíblica, una ilustración o historia, un punto de una lista ("primero", "segundo"...), una aplicación o una oración. Un párrafo suele tener entre 3 y 8 oraciones (unas 60 a 180 palabras); evita párrafos de una sola oración salvo que sea una transición clara, y evita bloques de más de 250 palabras.

Secciones: identifica los grandes movimientos del mensaje (introducción, cada punto principal, aplicación, oración final); normalmente entre 3 y 8. Dales un título breve (2 a 6 palabras) en español, usando en lo posible las propias palabras del predicador. Cada sección empieza en una oración que también es inicio de párrafo.`;

const JSON_FORMAT = `Responde únicamente con un objeto JSON con esta forma, sin texto adicional:
{"paragraph_starts": [0, 5, 12], "sections": [{"start": 0, "title": "Introducción"}]}`;

export interface OrganizerConfig {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/** Resolves the organizer from settings; null means the basic (local) organizer. */
export function organizerConfig(settings: Settings): OrganizerConfig | null {
  if (settings.organizerProvider === "basic") return null;
  const provider = PROVIDERS[settings.organizerProvider];
  return {
    provider: provider.id,
    model: settings.organizerModel.trim() || provider.defaultModel,
    apiKey: getApiKey(provider.id),
    baseUrl: provider.id === "custom" ? settings.organizerBaseUrl.trim() : provider.baseUrl,
  };
}

function checkConfig(cfg: OrganizerConfig) {
  const provider = PROVIDERS[cfg.provider];
  if (provider.keyRequired && !cfg.apiKey) throw new Error(`Falta la clave de ${provider.label}`);
  if (provider.kind === "openai-compatible" && !cfg.baseUrl) throw new Error("Falta la dirección (URL) del servidor");
  if (!cfg.model) throw new Error("Falta elegir el modelo");
}

function openaiClient(cfg: OrganizerConfig) {
  // Local servers such as Ollama accept any key.
  return new OpenAI({ apiKey: cfg.apiKey || "sin-clave", baseURL: cfg.baseUrl });
}

function anthropicClient(cfg: OrganizerConfig) {
  return new Anthropic({ apiKey: cfg.apiKey, baseURL: process.env.LOGOSCRIBE_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com" });
}

/** Pulls the JSON object out of a reply, tolerating code fences or extra prose. */
function parseStructure(text: string): RawStructure {
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from < 0 || to <= from) throw new Error("El modelo no devolvió JSON");
  return StructureSchema.parse(JSON.parse(text.slice(from, to + 1)));
}

async function requestStructure(cfg: OrganizerConfig, prompt: string): Promise<RawStructure> {
  if (PROVIDERS[cfg.provider].kind === "anthropic") {
    const stream = anthropicClient(cfg).messages.stream({
      model: cfg.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: zodOutputFormat(StructureSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("El modelo no procesó el texto");
    if (message.stop_reason === "max_tokens") throw new Error("La respuesta del modelo quedó incompleta");
    return parseStructure(message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(""));
  }

  const client = openaiClient(cfg);
  const messages = [
    { role: "system" as const, content: `${SYSTEM}\n\n${JSON_FORMAT}` },
    { role: "user" as const, content: prompt },
  ];
  let completion;
  try {
    completion = await client.chat.completions.create({ model: cfg.model, messages, response_format: { type: "json_object" } });
  } catch (err) {
    // Some servers don't implement JSON mode; the prompt already asks for JSON.
    if ((err as { status?: number }).status !== 400) throw err;
    completion = await client.chat.completions.create({ model: cfg.model, messages });
  }
  return parseStructure(completion.choices[0]?.message?.content ?? "");
}

async function aiStructure(sentences: Sentence[], settings: Settings, cfg: OrganizerConfig): Promise<Structure> {
  const CHUNK = 600;
  const result: Structure = { paragraphStarts: [], sections: [] };

  for (let offset = 0; offset < sentences.length; offset += CHUNK) {
    const slice = sentences.slice(offset, offset + CHUNK);
    const numbered = slice.map((s, i) => `[${offset + i}] ${s.text}`).join("\n");
    const headingNote = settings.addHeadings ? "" : "\n\nNo se desean títulos de sección: devuelve `sections` vacío.";
    const partNote =
      sentences.length > CHUNK
        ? `\n\nEsta es la parte que va de la oración ${offset} a la ${offset + slice.length - 1} de una prédica de ${sentences.length} oraciones.`
        : "";
    const parsed = await requestStructure(cfg, `${numbered}${partNote}${headingNote}`);

    const inRange = (n: number) => n >= offset && n < offset + slice.length;
    result.paragraphStarts.push(offset, ...parsed.paragraph_starts.filter(inRange));
    if (settings.addHeadings) {
      for (const sec of parsed.sections) {
        if (inRange(sec.start) && sec.title.trim()) result.sections.push({ start: sec.start, title: sec.title.trim() });
      }
    }
  }

  result.paragraphStarts.push(...result.sections.map((s) => s.start));
  result.paragraphStarts = [...new Set(result.paragraphStarts)].sort((a, b) => a - b);
  result.sections.sort((a, b) => a.start - b.start);
  return result;
}

/** Lists the provider's available models, for the Ajustes page. */
export async function listModels(cfg: OrganizerConfig): Promise<string[]> {
  const ids: string[] = [];
  if (PROVIDERS[cfg.provider].kind === "anthropic") {
    for await (const m of anthropicClient(cfg).models.list()) ids.push(m.id);
  } else {
    for await (const m of openaiClient(cfg).models.list()) ids.push(m.id.replace(/^models\//, ""));
  }
  return ids.sort();
}

const SAMPLE = [
  "Buenos días, iglesia. Pueden tomar asiento.",
  "Hoy vamos a abrir nuestras Biblias en Juan capítulo tres, versículo dieciséis.",
  "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.",
  "Lo primero que vemos es que el amor de Dios no es una idea, es una acción.",
  "Dios amó, y porque amó, dio.",
  "En segundo lugar, miren lo que dice Romanos ocho, veintiocho.",
  "A los que aman a Dios, todas las cosas les ayudan a bien.",
  "Vamos a ponernos de pie para orar. Señor, gracias por tu amor. Amén.",
].map((text, i) => ({ text, start: i * 10, end: i * 10 + 9 }));

/** Organizes a short sample sermon to check the provider, key and model work. */
export async function testOrganizer(cfg: OrganizerConfig, settings: Settings) {
  checkConfig(cfg);
  const t0 = Date.now();
  const structure = await aiStructure(SAMPLE, settings, cfg);
  return { ms: Date.now() - t0, paragraphs: structure.paragraphStarts.length, sections: structure.sections.map((s) => s.title) };
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

  const cfg = organizerConfig(settings);
  if (!cfg) return { blocks: buildBlocks(sentences, heuristicStructure(sentences)), note: null };
  try {
    checkConfig(cfg);
    return { blocks: buildBlocks(sentences, await aiStructure(sentences, settings, cfg)), note: null };
  } catch (err) {
    const label = PROVIDERS[cfg.provider].label;
    return {
      blocks: buildBlocks(sentences, heuristicStructure(sentences)),
      note: `No se pudo organizar con ${label} (${(err as Error).message}); se usó el organizador básico.`,
    };
  }
}
