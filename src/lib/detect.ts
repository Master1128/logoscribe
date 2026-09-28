/**
 * Speech / music segmentation for a full service recording.
 *
 * Features in the spirit of Scheirer & Slaney (1997), cheap enough to run on
 * a two-hour file in seconds, computed over ~10 s windows of 20 ms frames:
 *  - Low-energy frame ratio: speech has frequent pauses between syllables and
 *    phrases, so many frames fall below the local mean. The threshold is 70%
 *    of the mean (not the classic 50%) so that a preacher speaking over a soft
 *    keyboard pad still counts as speech: the pad fills the pauses, but not up
 *    to the level of the voice.
 *  - Coefficient of variation of frame energy: sustained worship (band plus
 *    congregation) is steady; speech rises and falls.
 *
 * Measured on a real service recording (median per 10 s window):
 *                         low-energy ratio   variation
 *   worship                  0.05 - 0.07       ~0.20
 *   preaching over a pad     0.41 - 0.50     0.55 - 0.68
 *   preaching                0.55 - 0.60       ~1.05
 *
 * The sermon is taken to be the longest run of speech after bridging short
 * gaps (a pause, a verse read over a soft pad). The team always confirms or
 * adjusts the boundaries in the UI before anything is transcribed.
 */
import { decodePcm } from "./audio";
import type { Analysis, Region } from "./types";

const SAMPLE_RATE = 8000;
const FRAME = 160; // 20 ms
const FRAMES_PER_SEC = SAMPLE_RATE / FRAME;
const PEAKS_PER_SEC = 10;

export interface DetectOptions {
  /** Half-width, in seconds, of the window each second is classified with. */
  windowSec?: number;
  /** Non-speech gaps shorter than this are bridged inside a speech run. */
  bridgeGapSec?: number;
  /** A speech run must be at least this long to be proposed as the sermon. */
  minSermonSec?: number;
}

export async function analyzeAudio(
  src: string,
  duration: number,
  onProgress?: (fraction: number) => void,
  opts: DetectOptions = {},
): Promise<{ analysis: Analysis; peaks: number[] }> {
  const windowSec = opts.windowSec ?? 5;
  const bridgeGapSec = opts.bridgeGapSec ?? 40;
  const minSermonSec = opts.minSermonSec ?? 8 * 60;

  const frameRms: number[] = [];
  const peaks: number[] = [];

  const peakSize = SAMPLE_RATE / PEAKS_PER_SEC;
  let frameSumSq = 0, frameN = 0;
  let peakMax = 0, peakN = 0;
  let totalSamples = 0;

  await decodePcm(src, SAMPLE_RATE, (samples) => {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] / 32768;
      frameSumSq += s * s;
      if (++frameN === FRAME) {
        frameRms.push(Math.sqrt(frameSumSq / FRAME));
        frameSumSq = frameN = 0;
      }
      const a = Math.abs(s);
      if (a > peakMax) peakMax = a;
      if (++peakN === peakSize) {
        peaks.push(Math.round(peakMax * 1000) / 1000);
        peakMax = peakN = 0;
      }
    }
    totalSamples += samples.length;
    onProgress?.(Math.min(1, totalSamples / SAMPLE_RATE / duration));
  });

  const seconds = Math.floor(frameRms.length / FRAMES_PER_SEC);
  const energyDb: number[] = [];
  for (let s = 0; s < seconds; s++) {
    let sum = 0;
    for (let f = s * FRAMES_PER_SEC; f < (s + 1) * FRAMES_PER_SEC; f++) sum += frameRms[f] ** 2;
    energyDb.push(Math.round(10 * Math.log10(sum / FRAMES_PER_SEC + 1e-10) * 10) / 10);
  }

  // Silence threshold relative to the recording's own loudness, since church
  // recordings range from line-level desk feeds to a phone in the back row.
  const sorted = [...energyDb].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? -20;
  const silenceDb = Math.max(-60, loud - 30);

  const labels: Region["kind"][] = [];
  for (let s = 0; s < seconds; s++) {
    const from = Math.max(0, (s - windowSec) * FRAMES_PER_SEC);
    const to = Math.min(frameRms.length, (s + windowSec + 1) * FRAMES_PER_SEC);
    let meanRms = 0;
    for (let f = from; f < to; f++) meanRms += frameRms[f];
    const n = to - from;
    meanRms /= n;

    const windowDb = 20 * Math.log10(meanRms + 1e-10);
    if (windowDb < silenceDb) { labels.push("silence"); continue; }

    let low = 0, sumSq = 0;
    for (let f = from; f < to; f++) {
      if (frameRms[f] < 0.7 * meanRms) low++;
      sumSq += (frameRms[f] - meanRms) ** 2;
    }
    const lowRatio = low / n;
    const variation = Math.sqrt(sumSq / n) / meanRms;
    labels.push(lowRatio > 0.25 && variation > 0.35 ? "speech" : "music");
  }

  const smoothed = majorityFilter(labels, 7);
  const regions = toRegions(smoothed, 8);

  // A service recording has long stretches of worship; a podcast or
  // devotional is mostly speech with, at most, music at the start, the end or
  // a song in between.
  const musicSec = regions.filter((r) => r.kind === "music").reduce((n, r) => n + r.end - r.start, 0);
  const kind: Analysis["kind"] = musicSec / duration >= 0.25 ? "service" : "message";
  // Short recordings (a 5-minute devotional) can't meet an 8-minute minimum.
  const minSec = Math.min(minSermonSec, Math.max(60, duration * 0.5));
  const picked =
    kind === "service"
      ? pickSermon(regions, bridgeGapSec, minSec) ?? pickSpokenSpan(regions)
      : pickSpokenSpan(regions) ?? pickSermon(regions, bridgeGapSec, minSec);

  // Smoothing blurs boundaries by a few seconds; better to keep a little music
  // (the recognizer ignores it) than to lose the first or last words.
  const PAD = 4;
  const sermon = picked && { start: Math.max(0, picked.start - PAD), end: Math.min(duration, picked.end + PAD) };

  return { analysis: { duration, energyDb, regions, sermon, kind }, peaks };
}

/**
 * From the first to the last spoken passage of at least 20 s. Intro or outro
 * music under 45 s is kept: hosts often greet over it, and Whisper skips music.
 */
function pickSpokenSpan(regions: Region[]) {
  const spoken = regions.filter((r) => r.kind === "speech" && r.end - r.start >= 20);
  if (!spoken.length) return null;
  const duration = regions[regions.length - 1].end;
  const start = spoken[0].start <= 45 ? 0 : spoken[0].start;
  const lastEnd = spoken[spoken.length - 1].end;
  return { start, end: duration - lastEnd <= 45 ? duration : lastEnd };
}

export { musicInside, SKIP_MUSIC_MIN_SEC } from "./music";

function majorityFilter(labels: Region["kind"][], half: number): Region["kind"][] {
  return labels.map((_, i) => {
    const counts = { speech: 0, music: 0, silence: 0 };
    for (let j = Math.max(0, i - half); j <= Math.min(labels.length - 1, i + half); j++) counts[labels[j]]++;
    return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as Region["kind"];
  });
}

/** Collapses per-second labels into regions, absorbing blips shorter than `minSec`. */
function toRegions(labels: Region["kind"][], minSec: number): Region[] {
  const raw: Region[] = [];
  labels.forEach((kind, s) => {
    const last = raw[raw.length - 1];
    if (last && last.kind === kind) last.end = s + 1;
    else raw.push({ start: s, end: s + 1, kind });
  });
  const merged: Region[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && (r.end - r.start < minSec || last.kind === r.kind)) last.end = r.end;
    else merged.push({ ...r });
  }
  return merged;
}

function pickSermon(regions: Region[], bridgeGapSec: number, minSec: number) {
  const runs: { start: number; end: number; speech: number }[] = [];
  for (const r of regions) {
    const len = r.end - r.start;
    const last = runs[runs.length - 1];
    if (r.kind === "speech") {
      if (last && r.start - last.end <= bridgeGapSec) { last.end = r.end; last.speech += len; }
      else runs.push({ start: r.start, end: r.end, speech: len });
    }
  }
  const best = runs.sort((a, b) => b.speech - a.speech)[0];
  return best && best.end - best.start >= minSec ? { start: best.start, end: best.end } : null;
}

/** The quietest second within `radius` of `target` — a safe place to cut. */
export function quietPoint(energyDb: number[], target: number, radius: number): number {
  let best = Math.round(target);
  let bestDb = Infinity;
  for (let s = Math.max(0, Math.round(target - radius)); s <= Math.min(energyDb.length - 1, Math.round(target + radius)); s++) {
    if (energyDb[s] < bestDb) { bestDb = energyDb[s]; best = s; }
  }
  return best;
}
