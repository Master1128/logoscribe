import { findBibleRefs, uniqueRefs, type BibleRef } from "../bible";
import type { Block, Sermon } from "../types";

export interface ExportOptions {
  headings: boolean;
  timestamps: boolean;
  /** Start each section on a new page. */
  sectionPageBreaks: boolean;
  /** Append the list of Bible references mentioned. */
  bibleIndex: boolean;
}

export const DEFAULT_EXPORT: ExportOptions = {
  headings: true,
  timestamps: false,
  sectionPageBreaks: false,
  bibleIndex: true,
};

export function parseExportOptions(params: URLSearchParams): ExportOptions {
  const flag = (k: keyof ExportOptions) => (params.has(k) ? params.get(k) === "1" : DEFAULT_EXPORT[k]);
  return { headings: flag("headings"), timestamps: flag("timestamps"), sectionPageBreaks: flag("sectionPageBreaks"), bibleIndex: flag("bibleIndex") };
}

export function formatTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return "";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function formatDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

/** Splits paragraph text into plain and Bible-reference runs. */
export function runsWithRefs(text: string): { text: string; ref?: BibleRef }[] {
  const out: { text: string; ref?: BibleRef }[] = [];
  let cursor = 0;
  for (const ref of findBibleRefs(text)) {
    if (ref.index > cursor) out.push({ text: text.slice(cursor, ref.index) });
    out.push({ text: text.slice(ref.index, ref.index + ref.length), ref });
    cursor = ref.index + ref.length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

export function documentRefs(blocks: Block[]) {
  return uniqueRefs(blocks.filter((b) => b.kind === "paragraph").map((b) => b.text));
}

export function coverLines(sermon: Sermon) {
  return [sermon.preacher, formatDate(sermon.service_date), sermon.series ? `Serie: ${sermon.series}` : null].filter(
    Boolean,
  ) as string[];
}

export function fileName(sermon: Sermon, ext: string) {
  const base = [sermon.service_date, sermon.title]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${base || "predica"}.${ext}`;
}
