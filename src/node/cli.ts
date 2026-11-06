// chirp command line.
import { dirname, join, resolve } from "node:path";
import { analyze, statsText } from "../core/analyze.ts";
import { ChirpError, wrap } from "../core/errors.ts";
import { loadProject } from "./load.ts";
import { writeOutputs } from "./output.ts";
import { serve } from "./server.ts";

const USAGE = `chirp — game sound effects and music as code

  chirp build <sounds.cx.js> [--out DIR] [--only a,b] [--ogg] [--mono] [--no-preview]
      Write WAV per sound (out/sfx, out/music), audio-sprite banks + JSON, and previews
      (out/_preview: waveform + spectrogram). --ogg also writes .ogg (needs ffmpeg).
      Looping sounds and songs carry a WAV smpl loop (Godot imports them looping).
      --mono writes one channel (L+R averaged), for positional sounds.
  chirp info  <sounds.cx.js> <name> [--layer N]
      Print length, levels, clipping and the pitch over time: read a sound without hearing it.
  chirp serve <sounds.cx.js> [--port 4330] [--out DIR | --no-out]
      Live player: rebuilds on save, plays the edited sound, solos layers.
  chirp list  <sounds.cx.js>
      List sounds, instruments and banks with their source locations.

Sound files may be .js or .ts. Default out dir: <sound file dir>/out.`;

interface Args {
  cmd?: string;
  file?: string;
  rest: string[];
  out?: string | false;
  only?: string[];
  ogg?: boolean;
  mono?: boolean;
  preview?: boolean;
  port?: number;
  layer?: number;
}

function parse(argv: string[]): Args {
  const a: Args = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const val = () => {
      const x = argv[++i];
      if (x === undefined) throw new ChirpError(`${v} needs a value`);
      return x;
    };
    if (v === "--out") a.out = val();
    else if (v === "--no-out") a.out = false;
    else if (v === "--only") a.only = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "--ogg") a.ogg = true;
    else if (v === "--mono") a.mono = true;
    else if (v === "--no-preview") a.preview = false;
    else if (v === "--port") a.port = Number(val());
    else if (v === "--layer") a.layer = Number(val());
    else if (v === "-h" || v === "--help") a.cmd = "help";
    else if (v.startsWith("--")) throw new ChirpError(`unknown flag ${v}\n\n${USAGE}`);
    else if (!a.cmd) a.cmd = v;
    else if (!a.file) a.file = v;
    else a.rest.push(v);
  }
  return a;
}

export async function main(argv: string[]): Promise<number> {
  let a: Args;
  try { a = parse(argv); } catch (e) { console.error(wrap(e).message); return 2; }
  if (!a.cmd || a.cmd === "help" || !a.file) {
    console.log(USAGE);
    return a.cmd === "help" ? 0 : 2;
  }
  const file = resolve(a.file);
  const outDir = typeof a.out === "string" ? resolve(a.out) : join(dirname(file), "out");
  try {
    switch (a.cmd) {
      case "build": {
        const r = writeOutputs(loadProject(file), outDir, { only: a.only, ogg: a.ogg, mono: a.mono, preview: a.preview });
        for (const l of r.lines) console.log(l);
        for (const e of r.errors) console.error("error: " + e.message);
        console.log(`-> ${outDir}${r.errors.length ? ` (${r.errors.length} error${r.errors.length > 1 ? "s" : ""})` : ""}`);
        return r.errors.length ? 1 : 0;
      }
      case "info": {
        const name = a.rest[0];
        if (!name) throw new ChirpError("info needs a sound name: chirp info <file> <name>");
        const p = loadProject(file);
        const r = p.render(name, 1, a.layer);
        console.log(statsText(`${r.kind} ${name}${a.layer !== undefined ? ` (layer ${a.layer}: ${r.layers[a.layer]?.label})` : ""}`, analyze(r.buf)));
        console.log("layers: " + r.layers.map((l, i) => `${i} ${l.label}`).join(" · "));
        return 0;
      }
      case "list": {
        const p = loadProject(file);
        for (const n of p.order) {
          const d = p.sounds.get(n)!;
          console.log(`${d.kind.padEnd(6)} ${n.padEnd(24)} ${d.loc ?? ""}`);
        }
        for (const i of p.insts.values()) console.log(`${"inst".padEnd(6)} ${i.name.padEnd(24)} ${i.loc ?? ""}`);
        for (const b of p.banks) console.log(`${"bank".padEnd(6)} ${b.name.padEnd(24)} ${b.loc ?? ""}`);
        return 0;
      }
      case "serve": {
        const s = await serve(file, { port: a.port, out: a.out === false ? false : outDir });
        console.log(`chirp live player: ${s.url}  (watching ${file}; Ctrl+C to stop)`);
        return await new Promise<number>(() => {});
      }
      default:
        console.error(`unknown command '${a.cmd}'\n\n${USAGE}`);
        return 2;
    }
  } catch (e) {
    console.error("error: " + wrap(e).message);
    return 1;
  }
}
