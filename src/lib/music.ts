import type { Region } from "./types";

/** Shorter music (a pad under the preacher, a jingle) is never left out. */
export const SKIP_MUSIC_MIN_SEC = 45;

/**
 * Music passages of at least `minSec` inside [start, end): songs to leave out
 * of the transcript. Music separated by under `minSec` of "speech" is one song
 * (sung verses over a quiet accompaniment read as speech).
 */
export function musicInside(regions: Region[], start: number, end: number, minSec = SKIP_MUSIC_MIN_SEC) {
  const merged: { start: number; end: number }[] = [];
  for (const r of regions) {
    if (r.kind !== "music") continue;
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < minSec) last.end = r.end;
    else merged.push({ start: r.start, end: r.end });
  }
  return merged.filter((m) => m.end - m.start >= minSec && m.start >= start - 1 && m.end <= end + 1);
}

/** Whether most of a transcript segment falls inside one of the songs. */
export function mostlyInside(seg: { start: number; end: number }, songs: { start: number; end: number }[]) {
  const len = Math.max(0.1, seg.end - seg.start);
  const overlap = songs.reduce((n, m) => n + Math.max(0, Math.min(seg.end, m.end) - Math.max(seg.start, m.start)), 0);
  return overlap / len >= 0.5;
}
