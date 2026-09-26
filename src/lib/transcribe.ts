import fs from "node:fs";
import path from "node:path";
import { extractClip, run } from "./audio";
import { whisperCliAvailable } from "./models";
import { tool } from "./tools";
import type { Settings } from "./settings";
import type { Segment } from "./types";

export interface TranscribeInput {
  source: string;
  start: number;
  end: number;
  settings: Settings;
  workDir: string;
  onProgress: (fraction: number, message?: string) => void;
  /** Aborted when the team cancels the job. */
  signal?: AbortSignal;
}

/** Transcribes [start, end) of the recording with whisper.cpp on this computer. */
export async function transcribe(input: TranscribeInput): Promise<Segment[]> {
  fs.mkdirSync(input.workDir, { recursive: true });
  return cleanSegments(await transcribeLocal(input));
}

/** Checks that whisper.cpp and the active model are in place. */
export function checkLocalEngine(settings: Settings) {
  if (!whisperCliAvailable()) throw new Error("No se encontró whisper.cpp. Vuelve a ejecutar el instalador de Logoscribe.");
  if (!fs.existsSync(settings.localModelPath)) throw new Error(`No se encontró el modelo en ${settings.localModelPath}`);
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
