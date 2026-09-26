import fs from "node:fs";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import { extractClip, run } from "./audio";
import { quietPoint } from "./detect";
import { whisperCliAvailable } from "./models";
import { tool } from "./tools";
import { secrets, type Settings } from "./settings";
import type { EngineId, Region, Segment } from "./types";

export interface TranscribeInput {
  source: string;
  start: number;
  end: number;
  engine: EngineId;
  settings: Settings;
  /** Per-second energy from the analysis, used to cut chunks in pauses. */
  energyDb: number[];
  /** Speech/music regions from the analysis, used to spot skipped speech. */
  regions: Region[];
  workDir: string;
  onProgress: (fraction: number, message?: string) => void;
  /** Aborted when the team cancels the job. */
  signal?: AbortSignal;
}

export async function transcribe(input: TranscribeInput): Promise<Segment[]> {
  fs.mkdirSync(input.workDir, { recursive: true });
  const raw = input.engine === "local" ? await transcribeLocal(input) : await transcribeCloud(input);
  return cleanSegments(raw);
}

// ---------------------------------------------------------------- local

async function transcribeLocal({ source, start, end, settings, workDir, onProgress, signal }: TranscribeInput) {
  if (!fs.existsSync(settings.localModelPath)) {
    throw new Error(
      `No se encontró el modelo de Whisper en ${settings.localModelPath}. Descárgalo desde Ajustes o cambia la ruta.`,
    );
  }
  onProgress(0, "Recortando audio");
  const wav = path.join(workDir, "sermon.wav");
  await extractClip(source, start, end, wav, "wav16k", signal);

  onProgress(0.02, "Transcribiendo con Whisper local");
  const outBase = path.join(workDir, "whisper");
  // VAD keeps Whisper from decoding silence and background music, where it
  // invents text or gets stuck repeating a line.
  const vad = fs.existsSync(settings.localVadModelPath) ? ["--vad", "-vm", settings.localVadModelPath] : [];
  await run(
    tool("whisper-cli"),
    [
      "-m", settings.localModelPath,
      "-f", wav,
      "-l", "es",
      "-t", String(settings.localThreads),
      "-oj", "-of", outBase,
      "-pp",
      ...vad,
      "--prompt", settings.vocabularyPrompt,
    ],
    {
      signal,
      onStderr: (line) => {
        const m = line.match(/progress\s*=\s*(\d+)%/);
        if (m) onProgress(0.02 + 0.98 * (+m[1] / 100), "Transcribiendo con Whisper local");
      },
    },
  );

  const json = JSON.parse(fs.readFileSync(`${outBase}.json`, "utf8")) as {
    transcription: { offsets: { from: number; to: number }; text: string }[];
  };
  return json.transcription.map((s) => ({
    start: start + s.offsets.from / 1000,
    end: start + s.offsets.to / 1000,
    text: s.text.trim(),
  }));
}

// ---------------------------------------------------------------- cloud

const CHUNK_SEC = 600;

function cloudClient(engine: EngineId) {
  if (engine === "groq") {
    const apiKey = secrets.groq();
    if (!apiKey) throw new Error("Falta GROQ_API_KEY en el archivo .env.local");
    return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
  }
  const apiKey = secrets.openai();
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY en el archivo .env.local");
  // OPENAI_BASE_URL points at any OpenAI-compatible server (e.g. a LiteLLM proxy).
  return new OpenAI({ apiKey, baseURL: secrets.openaiBaseUrl() });
}

/** Transcribes a few seconds of generated audio to check the engine is reachable and configured. */
export async function testEngine(engine: EngineId, settings: Settings, workDir: string): Promise<{ ok: true; ms: number }> {
  if (engine === "local") {
    if (!whisperCliAvailable()) throw new Error("Falta instalar whisper.cpp (whisper-cli) en el servidor");
    if (!fs.existsSync(settings.localModelPath)) throw new Error(`No se encontró el modelo en ${settings.localModelPath}`);
    return { ok: true, ms: 0 };
  }
  fs.mkdirSync(workDir, { recursive: true });
  const file = path.join(workDir, `test-${Date.now()}.mp3`);
  await run(tool("ffmpeg"), ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-ac", "1", "-ar", "16000", "-b:a", "32k", file]);
  const t0 = Date.now();
  try {
    await cloudRequest(cloudClient(engine), engine === "groq" ? settings.groqModel : settings.openaiModel, file, 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
  return { ok: true, ms: Date.now() - t0 };
}

/** Splits [start, end) into ~10 minute pieces, each cut at the quietest nearby second. */
export function planChunks(start: number, end: number, energyDb: number[], chunkSec = CHUNK_SEC) {
  const cuts = [start];
  while (end - cuts[cuts.length - 1] > chunkSec * 1.2) {
    cuts.push(quietPoint(energyDb, cuts[cuts.length - 1] + chunkSec, 20) + 0.5);
  }
  cuts.push(end);
  return cuts.slice(0, -1).map((s, i) => ({ start: s, end: cuts[i + 1] }));
}

async function transcribeCloud(input: TranscribeInput) {
  const { source, start, end, engine, settings, energyDb, workDir, onProgress, signal } = input;
  const client = cloudClient(engine);
  const model = engine === "groq" ? settings.groqModel : settings.openaiModel;
  const chunks = planChunks(start, end, energyDb);
  const segments: Segment[] = [];

  for (const [i, chunk] of chunks.entries()) {
    const label = `Transcribiendo parte ${i + 1} de ${chunks.length}`;
    onProgress((i / chunks.length) * 0.9, label);
    // Finished chunks are kept on disk so a retry (after a rate limit or a
    // crash) doesn't spend quota on them again.
    const cache = path.join(workDir, `chunk-${i}-${model}-${chunk.start.toFixed(1)}-${chunk.end.toFixed(1)}.json`);
    if (fs.existsSync(cache)) {
      segments.push(...(JSON.parse(fs.readFileSync(cache, "utf8")) as Segment[]));
      continue;
    }
    const file = path.join(workDir, `chunk-${i}.mp3`);
    await extractClip(source, chunk.start, chunk.end, file, "mp3-16k", signal);
    const result = await withRateLimit(
      () => cloudRequest(client, model, file, chunk.start, settings.vocabularyPrompt, signal),
      (wait) => onProgress((i / chunks.length) * 0.9, `Límite de uso de ${engine === "groq" ? "Groq" : "OpenAI"} alcanzado; se reanuda ${formatWait(wait)}`),
      signal,
    );
    fs.writeFileSync(cache, JSON.stringify(result));
    segments.push(...result);
  }

  return repairCloud(segments, input, client, model);
}

async function cloudRequest(client: OpenAI, model: string, file: string, offset: number, prompt?: string, signal?: AbortSignal) {
  const result = await client.audio.transcriptions.create(
    {
    file: await toFile(fs.createReadStream(file), path.basename(file)),
    model,
    language: "es",
    ...(prompt ? { prompt } : {}),
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    },
    { signal },
  );
  return (result.segments ?? []).map((s) => ({ start: offset + s.start, end: offset + s.end, text: s.text.trim() }));
}

/**
 * Whisper in the cloud has two failure modes seen on real sermons:
 *  - Skipping 20-35 s of clear speech (more likely with a prompt).
 *  - A "flat" decoding mode where Groq drops every accented letter and the
 *    rest of the word ("se hace m dif de detectar"), with no punctuation.
 * Both go away when the span is transcribed on its own, so suspicious spans
 * are re-requested without a prompt and replaced only if the result is better.
 */
async function repairCloud(segments: Segment[], input: TranscribeInput, client: OpenAI, model: string) {
  const spans: { start: number; end: number; kind: "broken" | "gap"; replaces: Segment[] }[] = [];
  segments.forEach((seg, i) => {
    if (looksBroken(seg.text)) spans.push({ start: seg.start, end: seg.end, kind: "broken", replaces: [seg] });
    const next = segments[i + 1];
    if (next && next.start - seg.end >= 6 && speechSeconds(input.regions, seg.end, next.start) >= (next.start - seg.end) * 0.6) {
      spans.push({ start: seg.end, end: next.start, kind: "gap", replaces: [] });
    }
  });
  if (!spans.length) return segments;

  let result = [...segments];
  for (const [i, span] of spans.entries()) {
    input.onProgress(0.9 + (0.1 * i) / spans.length, `Revisando tramos dudosos (${i + 1} de ${spans.length})`);
    const file = path.join(input.workDir, `repair-${i}.flac`);
    await extractClip(input.source, span.start, span.end, file, "flac16k", input.signal);
    let fresh: Segment[];
    try {
      fresh = cleanSegments(
        await withRateLimit(
          () => cloudRequest(client, model, file, span.start, undefined, input.signal),
          (wait) => input.onProgress(0.9 + (0.1 * i) / spans.length, `Límite de uso alcanzado; se reanuda ${formatWait(wait)}`),
          input.signal,
        ),
      );
    } catch (err) {
      if (input.signal?.aborted) throw err;
      continue; // keep the original text rather than fail the whole sermon
    }
    const text = fresh.map((s) => s.text).join(" ");
    const better = span.kind === "gap" ? text.split(/\s+/).length >= 3 : text && !looksBroken(text);
    if (!better) continue;
    result = result.filter((s) => !span.replaces.includes(s));
    result.push(...fresh);
  }
  return result.sort((a, b) => a.start - b.start);
}

const MAX_WAIT_SEC = 30 * 60;

/**
 * Free tiers cap audio per hour (Groq: 7200 s/h). Instead of failing the
 * sermon, wait for the window the provider asks for and carry on.
 */
async function withRateLimit<T>(fn: () => Promise<T>, onWait: (seconds: number) => void, signal?: AbortSignal): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { status?: number; message?: string; headers?: Headers };
      if (e.status !== 429) throw err;
      const header = Number(e.headers?.get?.("retry-after"));
      const m = e.message?.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
      const parsed = m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) : NaN;
      const wait = Math.ceil((Number.isFinite(header) && header > 0 ? header : Number.isFinite(parsed) && parsed > 0 ? parsed : 60) + 3);
      if (wait > MAX_WAIT_SEC) throw new Error(`Se alcanzó el límite de uso del servicio de transcripción. Intenta de nuevo ${formatWait(wait)}.`);
      onWait(wait);
      await sleep(wait * 1000, signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Cancelado"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("Cancelado")); }, { once: true });
  });
}

/** "a las 10:42 p. m. (en 3 min)" — a fixed countdown would look frozen in the UI. */
function formatWait(seconds: number) {
  const at = new Date(Date.now() + seconds * 1000).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });
  const m = Math.round(seconds / 60);
  return `a las ${at} (en ${m ? `${m} min` : `${seconds} s`})`;
}

/** Long segment with no accented letter and almost no punctuation. */
export function looksBroken(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const punctuation = (text.match(/[.,;:?!]/g) ?? []).length;
  return words >= 15 && !/[áéíóúüñ¿¡]/i.test(text) && punctuation <= 1;
}

function speechSeconds(regions: Region[], from: number, to: number) {
  return regions
    .filter((r) => r.kind === "speech")
    .reduce((sum, r) => sum + Math.max(0, Math.min(r.end, to) - Math.max(r.start, from)), 0);
}

// ---------------------------------------------------------------- cleanup

/**
 * Whisper was trained on subtitled video, so on music or silence it tends to
 * emit subtitle credits and outros. These never come from the preacher.
 */
const HALLUCINATIONS = [
  /subt[ií]tulos (realizados )?por la comunidad de amara\.org/i,
  /amara\.org/i,
  /^¡?suscr[ií]bete/i,
  /gracias por ver el v[ií]deo/i,
  /^\[?\(?m[uú]sica\)?\]?\.?$/i,
  /^[♪♫\s.]+$/,
];

export function cleanSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  let repeats = 0;
  for (const s of segments) {
    const text = s.text.replace(/\s+/g, " ").trim();
    if (!text || HALLUCINATIONS.some((re) => re.test(text))) continue;
    const last = out[out.length - 1];
    // Decoder loops repeat the same line many times; keep at most two.
    if (last && last.text === text) {
      if (++repeats >= 2) { last.end = s.end; continue; }
    } else repeats = 0;
    out.push({ ...s, text });
  }
  return out;
}
