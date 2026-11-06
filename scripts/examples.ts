// Builds every example (examples/*.cx.js -> examples/out, with --ogg) and copies the README media
// (previews and OGGs) to docs/examples. Fails if any example has an error.
// Run: npm run examples (part of npm run check). Needs ffmpeg for the OGGs.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/node/cli.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "examples"), out = join(dir, "out"), media = join(root, "docs", "examples");
const log = console.log;
let failed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith(".cx.js")).sort()) {
  const lines: string[] = [];
  console.log = (s: string) => lines.push(s);
  const code = await main(["build", join(dir, f), "--ogg"]).finally(() => { console.log = log; });
  if (code !== 0) failed++;
  console.log(`${code === 0 ? "ok  " : "FAIL"} ${f}: ${lines.slice(0, -1).map((l) => l.split(":")[0]).join(", ")}`);
}
if (failed) { console.error(`${failed} example(s) failed`); process.exit(1); }

// [sound, folder in out/]: the README shows each preview and links its OGG
const shown: [string, string][] = [["coin", "sfx"], ["explosion", "sfx"], ["loop", "music"], ["cave", "sfx"], ["torch", "sfx"], ["theme", "music"]];
mkdirSync(media, { recursive: true });
for (const [name, sub] of shown) {
  copyFileSync(join(out, "_preview", name + ".png"), join(media, name + ".png"));
  copyFileSync(join(out, sub, name + ".ogg"), join(media, name + ".ogg"));
}
console.log(`README media -> ${media} (${shown.length} sounds)`);
