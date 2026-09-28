// Prints the speech/music timeline the detector proposes for a file.
//   pnpm tsx scripts/detect.ts <audio> [minSermonMinutes]
import { probeDuration } from "@/lib/audio";
import { analyzeAudio, musicInside } from "@/lib/detect";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
async function main() {
  const [file, min = "8"] = process.argv.slice(2);
  const { analysis } = await analyzeAudio(file, await probeDuration(file), undefined, { minSermonSec: +min * 60 });
  for (const r of analysis.regions) console.log(r.kind.padEnd(8), fmt(r.start).padStart(7), "→", fmt(r.end).padStart(7));
  console.log(`tipo: ${analysis.kind} | prédica:`, analysis.sermon ? `${fmt(analysis.sermon.start)} → ${fmt(analysis.sermon.end)}` : "no detectada");
  if (analysis.sermon) {
    const inside = musicInside(analysis.regions, analysis.sermon.start, analysis.sermon.end);
    if (inside.length) console.log("música omitida:", inside.map((r) => `${fmt(r.start)}–${fmt(r.end)}`).join(", "));
  }
}
main();
