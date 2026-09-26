/**
 * Finds Bible references in Spanish sermon text, both written ("Juan 3:16",
 * "1 Co 13") and spoken as the recognizer transcribes them ("Juan capítulo
 * tres, versículo dieciséis", "primera de Corintios trece").
 */

interface BookDef {
  name: string;
  aliases: string[];
  numbered?: boolean;
}

const BOOKS: BookDef[] = [
  { name: "Génesis", aliases: ["Génesis", "Genesis"] },
  { name: "Éxodo", aliases: ["Éxodo", "Exodo"] },
  { name: "Levítico", aliases: ["Levítico", "Levitico"] },
  { name: "Números", aliases: ["Números", "Numeros"] },
  { name: "Deuteronomio", aliases: ["Deuteronomio"] },
  { name: "Josué", aliases: ["Josué", "Josue"] },
  { name: "Jueces", aliases: ["Jueces"] },
  { name: "Rut", aliases: ["Rut", "Ruth"] },
  { name: "Samuel", aliases: ["Samuel"], numbered: true },
  { name: "Reyes", aliases: ["Reyes"], numbered: true },
  { name: "Crónicas", aliases: ["Crónicas", "Cronicas"], numbered: true },
  { name: "Esdras", aliases: ["Esdras"] },
  { name: "Nehemías", aliases: ["Nehemías", "Nehemias"] },
  { name: "Ester", aliases: ["Ester"] },
  { name: "Job", aliases: ["Job"] },
  { name: "Salmos", aliases: ["Salmos", "Salmo", "Sal"] },
  { name: "Proverbios", aliases: ["Proverbios", "Prov"] },
  { name: "Eclesiastés", aliases: ["Eclesiastés", "Eclesiastes"] },
  { name: "Cantares", aliases: ["Cantar de los Cantares", "Cantares"] },
  { name: "Isaías", aliases: ["Isaías", "Isaias", "Is"] },
  { name: "Jeremías", aliases: ["Jeremías", "Jeremias"] },
  { name: "Lamentaciones", aliases: ["Lamentaciones"] },
  { name: "Ezequiel", aliases: ["Ezequiel"] },
  { name: "Daniel", aliases: ["Daniel"] },
  { name: "Oseas", aliases: ["Oseas"] },
  { name: "Joel", aliases: ["Joel"] },
  { name: "Amós", aliases: ["Amós", "Amos"] },
  { name: "Abdías", aliases: ["Abdías", "Abdias"] },
  { name: "Jonás", aliases: ["Jonás", "Jonas"] },
  { name: "Miqueas", aliases: ["Miqueas"] },
  { name: "Nahúm", aliases: ["Nahúm", "Nahum"] },
  { name: "Habacuc", aliases: ["Habacuc"] },
  { name: "Sofonías", aliases: ["Sofonías", "Sofonias"] },
  { name: "Hageo", aliases: ["Hageo"] },
  { name: "Zacarías", aliases: ["Zacarías", "Zacarias"] },
  { name: "Malaquías", aliases: ["Malaquías", "Malaquias"] },
  { name: "Mateo", aliases: ["Mateo", "Mt"] },
  { name: "Marcos", aliases: ["Marcos", "Mr", "Mc"] },
  { name: "Lucas", aliases: ["Lucas", "Lc"] },
  { name: "Juan", aliases: ["Juan", "Jn"], numbered: true },
  { name: "Hechos", aliases: ["Hechos"] },
  { name: "Romanos", aliases: ["Romanos", "Ro", "Rom"] },
  { name: "Corintios", aliases: ["Corintios", "Co", "Cor"], numbered: true },
  { name: "Gálatas", aliases: ["Gálatas", "Galatas", "Gá", "Gal"] },
  { name: "Efesios", aliases: ["Efesios", "Ef"] },
  { name: "Filipenses", aliases: ["Filipenses", "Fil"] },
  { name: "Colosenses", aliases: ["Colosenses", "Col"] },
  { name: "Tesalonicenses", aliases: ["Tesalonicenses", "Ts", "Tes"], numbered: true },
  { name: "Timoteo", aliases: ["Timoteo", "Ti", "Tim"], numbered: true },
  { name: "Tito", aliases: ["Tito", "Tit"] },
  { name: "Filemón", aliases: ["Filemón", "Filemon"] },
  { name: "Hebreos", aliases: ["Hebreos", "He", "Heb"] },
  { name: "Santiago", aliases: ["Santiago", "Stg"] },
  { name: "Pedro", aliases: ["Pedro", "P", "Pe"], numbered: true },
  { name: "Judas", aliases: ["Judas"] },
  { name: "Apocalipsis", aliases: ["Apocalipsis", "Ap"] },
];

// Books that exist only with a number (Samuel, Reyes...) still match without
// one, since preachers say "en Samuel" — but they then need a chapter.

const UNITS: Record<string, number> = {
  un: 1, uno: 1, una: 1, primero: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
};
const TEENS: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiún: 21, veintiuna: 21, veintidós: 22, veintidos: 22, veintitrés: 23, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};

const alt = (words: string[]) => words.sort((a, b) => b.length - a.length).join("|");
const UNIT_RE = alt(Object.keys(UNITS));
const SUB_HUNDRED = `(?:(?:${alt(Object.keys(TENS))})(?:\\s+y\\s+(?:${UNIT_RE}))?|${alt(Object.keys(TEENS))}|${UNIT_RE})`;
const NUMBER_WORDS = `(?:ciento\\s+${SUB_HUNDRED}|cien|${SUB_HUNDRED})`;
const NUM = `(\\d{1,3}|${NUMBER_WORDS})`;

export function parseNumber(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  let total = 0;
  let rest = t;
  if (rest === "cien") return 100;
  if (rest.startsWith("ciento ")) { total = 100; rest = rest.slice(7); }
  const parts = rest.split(/\s+y\s+/);
  if (parts.length === 2 && TENS[parts[0]] && UNITS[parts[1]]) return total + TENS[parts[0]] + UNITS[parts[1]];
  const v = TENS[rest] ?? TEENS[rest] ?? UNITS[rest];
  return v === undefined ? null : total + v;
}

const ORDINAL_PREFIX =
  "(?:(1|2|3|I{1,3}|1ra|2da|3ra|1a|2a|3a|1ª|2ª|3ª|[Pp]rimera|[Ss]egunda|[Tt]ercera|[Pp]rimer|[Ss]egundo|[Tt]ercer)\\.?\\s+(?:(?:carta\\s+)?(?:de|a)\\s+(?:los\\s+)?)?)";

const ALIAS_TO_BOOK = new Map<string, BookDef>();
for (const b of BOOKS) for (const a of b.aliases) ALIAS_TO_BOOK.set(a, b);
const BOOK_RE = alt([...ALIAS_TO_BOOK.keys()].map((a) => a.replace(/\s+/g, "\\s+")));

// Book, then either "capítulo N (versículo N (al N))" or "N:N(-N)" or "N".
// A range end must not be the ordinal of the next reference ("13:4 y 2 Timoteo").
const NOT_NEXT_BOOK = `(?!\\s+(?:${BOOK_RE})(?!\\p{L}))`;

const REF_RE = new RegExp(
  `${ORDINAL_PREFIX}?(?<![\\p{L}\\d])(${BOOK_RE})\\.?` +
    `(?:` +
    `,?\\s+cap[ií]tulo\\s+${NUM}(?:,?\\s+(?:desde\\s+el\\s+)?vers[ií]culos?\\s+${NUM}(?:\\s*(?:-|–|al|hasta\\s+el|y)\\s*${NUM}${NOT_NEXT_BOOK})?)?` +
    `|` +
    `\\s+(\\d{1,3})(?:(?:\\s*[:.,]\\s*|\\s+y\\s+|\\s+)(\\d{1,3})(?:\\s*(?:-|–|al|y)\\s*(\\d{1,3})${NOT_NEXT_BOOK})?)?` +
    `|` +
    `\\s+${NUM}(?![\\p{L}\\d])` +
    `)`,
  "gu",
);

export interface BibleRef {
  index: number;
  length: number;
  match: string;
  book: string;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  label: string;
  url: string;
}

function ordinalValue(raw: string | undefined): number | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (/^(1|i|1ra|1a|1ª|primera|primer)$/.test(r)) return 1;
  if (/^(2|ii|2da|2a|2ª|segunda|segundo)$/.test(r)) return 2;
  if (/^(3|iii|3ra|3a|3ª|tercera|tercer)$/.test(r)) return 3;
  return null;
}

export function findBibleRefs(text: string): BibleRef[] {
  const refs: BibleRef[] = [];
  for (const m of text.matchAll(REF_RE)) {
    const [whole, ordinal, alias, capCh, capV1, capV2, numCh, numV1, numV2, wordCh] = m;
    const def = ALIAS_TO_BOOK.get(alias.replace(/\s+/g, " "));
    if (!def) continue;
    // Short abbreviations ("Is", "Ro", "P") only count in the compact written form.
    if (alias.length <= 3 && !numV1) continue;
    const chapter = parseNumber(capCh ?? numCh ?? wordCh ?? "");
    if (!chapter || chapter > 150) continue;
    const verseStart = parseNumber(capV1 ?? numV1 ?? "") ?? null;
    let verseEnd = parseNumber(capV2 ?? numV2 ?? "") ?? null;
    if (verseEnd !== null && verseStart !== null && verseEnd <= verseStart) verseEnd = null;

    const n = def.numbered ? ordinalValue(ordinal) : null;
    const book = n ? `${n} ${def.name}` : def.name;
    const label = `${book} ${chapter}${verseStart ? `:${verseStart}${verseEnd ? `-${verseEnd}` : ""}` : ""}`;
    // Drop the ordinal from the highlighted span when the book doesn't take one.
    const offset = !def.numbered && ordinal ? whole.indexOf(alias) : 0;
    refs.push({
      index: m.index! + offset,
      length: whole.length - offset,
      match: whole.slice(offset),
      book,
      chapter,
      verseStart,
      verseEnd,
      label,
      url: `https://www.biblegateway.com/passage/?search=${encodeURIComponent(label)}&version=RVR1960`,
    });
  }
  return refs;
}

/** Unique references in order of first mention. */
export function uniqueRefs(texts: string[]): BibleRef[] {
  const seen = new Map<string, BibleRef>();
  for (const t of texts) for (const r of findBibleRefs(t)) if (!seen.has(r.label)) seen.set(r.label, r);
  return [...seen.values()];
}
