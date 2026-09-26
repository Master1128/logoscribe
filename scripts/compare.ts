// Compares a sermon's current transcription with a saved reference.
//   pnpm tsx scripts/compare.ts <sermonId> data/benchmarks/<reference>.json
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const norm = (t: string) =>
  t.toLowerCase().normalize("NFC").replace(/[¿¡.,;:!?"«»“”()…-]/g, " ").split(/\s+/).filter(Boolean);

/** Word-level edit distance (substitutions + insertions + deletions). */
function wordErrors(ref: string[], hyp: string[]) {
  let prev = new Int32Array(hyp.length + 1).map((_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = new Int32Array(hyp.length + 1);
    cur[0] = i;
    for (let j = 1; j <= hyp.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[hyp.length];
}

const [id, refFile] = process.argv.slice(2);
const db = new DatabaseSync("data/logoscribe.db");
const hyp = (db.prepare("SELECT text FROM segments WHERE sermon_id = ? ORDER BY idx").all(id) as { text: string }[]).map((r) => r.text).join(" ");
const ref = (JSON.parse(fs.readFileSync(refFile, "utf8")) as { text: string }[]).map((r) => r.text).join(" ");
const r = norm(ref), h = norm(hyp);
const errors = wordErrors(r, h);
console.log(`referencia: ${r.length} palabras · actual: ${h.length} palabras`);
console.log(`diferencia (WER aprox.): ${((errors / r.length) * 100).toFixed(1)}%`);
for (const w of ["fama", "más difícil", "ofrecérselos", "Efesios", "Epafrodito", "Filadelfia", "amor fraternal"]) {
  process.stdout.write(`${w}: ${hyp.includes(w) ? "sí" : "NO"}  `);
}
console.log();
