// Writes renders to disk: WAV (+ OGG via ffmpeg), audio-sprite banks + JSON, previews.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { analyze, statsText } from "../core/analyze.ts";
import { wav } from "../core/encode.ts";
import { ChirpError, didYouMean, wrap } from "../core/errors.ts";
import { midi } from "../core/midi.ts";
import { type Project, midiTracks } from "../core/project.ts";
import { stereo } from "../core/synth.ts";
import { SR } from "../core/util.ts";
import { previewPng } from "./preview.ts";

export interface OutputOptions {
  only?: string[];
  preview?: boolean;
  /** Also write .ogg next to every .wav (needs ffmpeg on PATH). */
  ogg?: boolean;
  /** Write mono WAV / OGG (L and R averaged). */
  mono?: boolean;
}

export interface OutputResult {
  lines: string[];
  errors: ChirpError[];
}

function write(path: string, data: Uint8Array | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

function toOgg(wavPath: string): void {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wavPath, "-fflags", "+bitexact", "-flags:a", "+bitexact", "-c:a", "libvorbis", "-q:a", "5", wavPath.replace(/\.wav$/, ".ogg")]);
  if (r.error) throw new ChirpError("--ogg needs ffmpeg on PATH");
  if (r.status !== 0) throw new ChirpError(`ffmpeg failed: ${String(r.stderr).trim()}`);
}

export function writeOutputs(p: Project, out: string, opts: OutputOptions = {}): OutputResult {
  const lines: string[] = [], errors: ChirpError[] = [];
  const bankNames = new Set(p.banks.map((b) => b.name));
  if (opts.only)
    for (const n of opts.only)
      if (!p.sounds.has(n) && !bankNames.has(n)) errors.push(new ChirpError(`unknown sound or bank '${n}'${didYouMean(n, [...p.order, ...bankNames])}`));
  const want = opts.only ? new Set(opts.only) : undefined;

  for (const name of want ? p.order.filter((n) => want.has(n)) : p.exported()) {
    try {
      const r = p.render(name);
      const path = join(out, r.kind === "song" ? "music" : "sfx", name + ".wav");
      write(path, wav(r.buf, { loop: r.loop, mono: opts.mono }));
      if (opts.ogg) toOgg(path);
      // songs also go out as MIDI, so they can be arranged with real instruments in a DAW
      let extra = "";
      if (r.kind === "song") {
        const m = midiTracks(p, name);
        if (m.tracks.length) { write(join(out, "music", name + ".mid"), midi(m.tracks, m.bpm, m.steps, name)); extra = `  + .mid (${m.tracks.length} tracks)`; }
      }
      const s = analyze(r.buf);
      if (opts.preview !== false) {
        write(join(out, "_preview", name + ".png"), previewPng(name, r.buf, s, r.loop));
        write(join(out, "_preview", ".gdignore"), "");   // keep previews out of a Godot project's imports
      }
      lines.push(statsText(`${r.kind} ${name}`, s).split("\n")[0] + extra);
    } catch (e) {
      errors.push(wrap(e));
    }
  }

  for (const b of p.banks) {
    if (want && !want.has(b.name)) continue;
    try {
      // Audio sprite: every sound back to back with a silent gap, offsets in JSON (Howler format).
      const names = p.bankNames(b);
      if (!names.length) throw new ChirpError("bank is empty (no entries matched)");
      const gap = Math.round((b.opts.gap ?? 0.1) * SR);
      const rs = names.map((n) => p.render(n));
      const buf = stereo(rs.reduce((a, r) => a + r.buf.L.length + gap, 0));
      const sprite: Record<string, [number, number] | [number, number, boolean]> = {};
      let at = 0;
      rs.forEach((r, i) => {
        buf.L.set(r.buf.L, at);
        buf.R.set(r.buf.R, at);
        const start = Math.round((at / SR) * 1000), len = Math.round((r.buf.L.length / SR) * 1000);
        sprite[names[i]] = r.loop ? [start, len, true] : [start, len];
        at += r.buf.L.length + gap;
      });
      const path = join(out, b.name + ".wav");
      write(path, wav(buf, { mono: opts.mono }));
      if (opts.ogg) toOgg(path);
      write(join(out, b.name + ".json"), JSON.stringify({ src: [...(opts.ogg ? [b.name + ".ogg"] : []), b.name + ".wav"], sprite }, null, 2) + "\n");
      lines.push(`bank ${b.name} ${(buf.L.length / SR).toFixed(2)}s (${names.length} sounds)`);
    } catch (e) {
      errors.push(wrap(e).within(`bank '${b.name}'`, b.loc));
    }
  }
  return { lines, errors };
}
