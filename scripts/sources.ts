// Prints what Logoscribe detects for a link: pnpm tsx scripts/sources.ts <url> [feed]
import { previewSource } from "@/lib/sources";
async function main() {
  const [url, feed] = process.argv.slice(2);
  console.log(JSON.stringify(await previewSource(url, feed ?? null), null, 1));
}
main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
