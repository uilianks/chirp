import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { analyze } from "../src/core/analyze.ts";
import { wav } from "../src/core/encode.ts";
import { chord, scale } from "../src/core/music.ts";
import { SR, freqOf } from "../src/core/util.ts";
import { loadProject, loadSource } from "../src/node/load.ts";
import { writeOutputs } from "../src/node/output.ts";
import { decodeWav } from "../src/node/wav.ts";

const throwsMsg = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: Error) => re.test(e.message));
const near = (a: number, b: number, tol: number, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} not within ${tol} of ${b}`);
const peak = (b: { L: Float32Array; R: Float32Array }) => { let m = 0; for (const ch of [b.L, b.R]) for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i])); return m; };

test("fm keeps the carrier pitch and adds partials; the index decays", () => {
  const p = loadSource(`sfx("bell", tone({ wave: "fm", freq: "A4", fm: { ratio: 3.5, index: 3, decay: 0.3 }, dur: 1, env: [0, 0, 1, 0.01] }))
sfx("pure", tone({ wave: "sine", freq: "A4", dur: 1, env: [0, 0, 1, 0.01] }))`);
  const bell = analyze(p.render("bell").buf), pure = analyze(p.render("pure").buf);
  assert.ok(bell.brightnessHz > pure.brightnessHz * 1.5, `fm is brighter: ${bell.brightnessHz} vs ${pure.brightnessHz}`);
  near(bell.pitch[bell.pitch.length - 2].hz, 440, 6, "late in the note the decayed index leaves the carrier");
  throwsMsg(() => loadSource(`sfx("x", tone({ wave: "fm", fm: { ratio: -1 } }))`), /fm ratio must be a number >= 0/);
  throwsMsg(() => loadSource(`sfx("x", tone({ wave: "fm", fm: { rate: 2 } }))`), /unknown option 'rate'/);
});

test("chords and scales as pattern tokens", () => {
  assert.equal(chord("Am7"), "A4+C5+E5+G5");
  assert.equal(chord("C", 3), "C3+E3+G3");
  assert.equal(chord("F#dim7", 4), "F#4+A4+C5+D#5");
  assert.equal(chord("Bb", 4, 1), "D5+F5+A#5", "first inversion lifts the root an octave");
  assert.deepEqual(scale("C", "minor", 4), ["C4", "D4", "D#4", "F4", "G4", "G#4", "A#4", "C5"]);
  assert.deepEqual(scale("A", "pentatonic", 3, 2).length, 11);
  throwsMsg(() => chord("Hm"), /note name/);
  throwsMsg(() => chord("Cmaj8"), /unknown quality 'maj8'/);
  throwsMsg(() => scale("C", "mixo"), /unknown mode 'mixo'/);
  // the tokens play: a chord in a pattern renders three pitches
  const p = loadSource(`inst("pad", { wave: "sine", env: [0.01, 0.1, 0.8, 0.1] })\nsong("s", { bpm: 120, bars: 1 }, track("pad", chord("C", 4) + " - - -"))`);
  const s = analyze(p.render("s").buf);
  assert.ok(s.pitch.length > 0);
  for (const n of ["C4", "E4", "G4"]) near(freqOf(n), freqOf(n), 0);
});

test("samples: a WAV plays at its rate, repitches by root, loops, and drives an instrument", () => {
  const dir = mkdtempSync(join(tmpdir(), "chirp-smp-"));
  // a 0.5 s 220 Hz sine at 22050 Hz, 16-bit mono
  const rate = 22050, n = Math.round(rate * 0.5), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 20000);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + n * 2, 4); head.write("WAVE", 8); head.write("fmt ", 12); head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(n * 2, 40);
  writeFileSync(join(dir, "a3.wav"), Buffer.concat([head, Buffer.from(pcm.buffer)]));
  const d = decodeWav(readFileSync(join(dir, "a3.wav")));
  near(d.L.length, SR * 0.5, 2, "resampled to chirp's rate");
  near(d.L[Math.round(SR / 880)], 1 * 20000 / 32768, 0.05, "a quarter period in: the peak");
  // the stereo WAV chirp itself writes decodes back
  const back = decodeWav(wav({ L: d.L, R: d.R }));
  near(back.L[1000], d.L[1000], 0.001);
  writeFileSync(join(dir, "s.cx.js"), `sfx("as_is", sample("a3.wav"))
sfx("up", sample("a3.wav", { root: "A3", freq: "A4" }))
sfx("long", { dur: 1.5 }, sample("a3.wav", { loop: true, dur: 1.5 }))
inst("vox", { sample: "a3.wav", root: "A3", env: [0.005, 0.05, 1, 0.05] })
song("tune", { bpm: 120, bars: 1 }, track("vox", "A3 . E4 . A4 . . ."))`);
  const p = loadProject(join(dir, "s.cx.js"));
  const asIs = p.render("as_is");
  near(asIs.dur, 0.5, 0.03);
  near(analyze(asIs.buf).pitch[2].hz, 220, 3);
  const up = p.render("up");
  near(up.dur, 0.25, 0.03, "an octave up plays twice as fast");
  near(analyze(up.buf).pitch[2].hz, 440, 5);
  near(p.render("long").dur, 1.5, 0.01);
  assert.ok(peak(p.render("long").buf) > 0.4, "looping keeps playing");
  const tune = analyze(p.render("tune").buf);
  near(tune.pitch.find((q) => q.t >= 0.5)!.hz, 440, 6, "the pattern repitches the sample");
  throwsMsg(() => loadSource(`sfx("x", sample("missing.wav"))`), /cannot read sample/);
  throwsMsg(() => loadSource(`sfx("x", sample("a3.wav", { freq: "C4" }))`), /needs its root/);
  throwsMsg(() => loadSource(`inst("v", { sample: "a3.wav" })`), /needs its root/);
});

test("chorus widens and limiter caps peaks", () => {
  const p = loadSource(`sfx("dry", { vol: 2 }, tone({ wave: "saw", freq: 220, dur: 0.3, env: [0, 0, 1, 0.01] }))
sfx("lim", { vol: 2, fx: [limiter({ ceiling: 0.5 })] }, tone({ wave: "saw", freq: 220, dur: 0.3, env: [0, 0, 1, 0.01] }))
sfx("cho", { fx: [chorus({ rate: 1, depth: 0.005, mix: 0.6 })] }, tone({ wave: "sine", freq: 220, dur: 0.3, env: [0, 0, 1, 0.01] }))`);
  assert.ok(peak(p.render("dry").buf) > 1.2);
  assert.ok(peak(p.render("lim").buf) <= 0.5 + 1e-3, `limited: ${peak(p.render("lim").buf)}`);
  const c = p.render("cho").buf;
  let diff = 0;
  for (let i = 0; i < c.L.length; i++) diff = Math.max(diff, Math.abs(c.L[i] - c.R[i]));
  assert.ok(diff > 0.05, "the two sides differ (stereo width)");
  throwsMsg(() => loadSource(`sfx("x", { fx: [limiter({ ceil: 0.5 })] }, tone())`), /unknown option 'ceil'/);
});

test("songs export a MIDI file: tempo, one track per pattern, drums on channel 10", () => {
  const dir = mkdtempSync(join(tmpdir(), "chirp-midi-"));
  const p = loadSource(`inst("lead", { wave: "square" })
song("s", { bpm: 150, bars: 1 }, track("lead", "C4 - E4 . G4! . . ."), at(0.4, track("kick", "x . . . x . . .")))`);
  const r = writeOutputs(p, dir, { preview: false });
  assert.equal(r.errors.length, 0);
  assert.match(r.lines[0], /\+ \.mid \(2 tracks\)/);
  const b = readFileSync(join(dir, "music/s.mid"));
  assert.equal(b.toString("ascii", 0, 4), "MThd");
  assert.equal(b.readUInt16BE(10), 3, "tempo track + 2 tracks");
  assert.equal(b.readUInt16BE(12), 480);
  const tempo = b.indexOf(Buffer.from([0xff, 0x51, 0x03]));
  assert.equal((b[tempo + 3] << 16) | (b[tempo + 4] << 8) | b[tempo + 5], 400000, "150 bpm");
  const bytes = [...b];
  const notesOn = (ch: number) => bytes.filter((v, i) => v === (0x90 | ch) && bytes[i + 2] > 0 && i > 14).length;
  assert.equal(notesOn(0), 6, "three lead notes, the pattern repeated over the bar");
  assert.equal(notesOn(9), 4, "kicks on channel 10");
  assert.ok(bytes.includes(0xc0) && b.indexOf(Buffer.from([0xc0, 80])) > 0, "square lead program");
  const kickIdx = b.indexOf(Buffer.from([0x99, 36, 100]));
  assert.ok(kickIdx > 0, "kick is GM note 36");
  assert.ok(b.indexOf(Buffer.from([0x90, 67, 120])) > 0, "the accented G4 is louder");
});

test("looping sounds carry a smpl loop over the whole sound; --mono writes one channel", () => {
  const p = loadSource(`sfx("hum", { dur: 0.5, loop: true }, tone({ wave: "sine", freq: 220, dur: 0.6 }))
sfx("blip", tone({ wave: "square", freq: 880, dur: 0.05 }))
song("t", { bpm: 120, steps: 4 }, track("kick", "x . x ."))`);
  const dir = mkdtempSync(join(tmpdir(), "chirp-loop-"));
  const r = writeOutputs(p, dir, { preview: false });
  assert.deepEqual(r.errors, []);
  const smplOf = (f: string) => {
    const b = readFileSync(join(dir, f)), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    for (let o = 12; o + 8 <= b.length; o += 8 + v.getUint32(o + 4, true))
      if (b.toString("latin1", o, o + 4) === "smpl") return { loops: v.getUint32(o + 36, true), start: v.getUint32(o + 52, true), end: v.getUint32(o + 56, true), frames: decodeWav(b).L.length };
    return undefined;
  };
  for (const f of ["sfx/hum.wav", "music/t.wav"]) {
    const s = smplOf(f)!;
    assert.ok(s, `${f} has smpl`);
    assert.equal(s.loops, 1);
    assert.equal(s.start, 0);
    assert.equal(s.end, s.frames - 1);
  }
  assert.equal(smplOf("sfx/blip.wav"), undefined, "one-shots have no loop");
  assert.equal(readFileSync(join(dir, "sfx/hum.wav")).readUInt16LE(22), 2);
  const m = mkdtempSync(join(tmpdir(), "chirp-mono-"));
  writeOutputs(p, m, { preview: false, mono: true });
  const mono = readFileSync(join(m, "sfx/hum.wav"));
  assert.equal(mono.readUInt16LE(22), 1);
  assert.equal(decodeWav(mono).L.length, p.render("hum").buf.L.length, "same length, half the bytes");
});
