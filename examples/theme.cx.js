// A short theme with real harmony: a chord progression by name, a melody indexed from a scale,
// an FM electric piano with chorus, and a limiter so the mix never clips. Songs also export MIDI.
const prog = ["Dm9", "G7", "Cmaj7", "Am7"]
const S = scale("D", "dorian", 5)                                   // D5 E5 F5 G5 A5 B5 C6 D6

inst("keys", { wave: "fm", fm: { ratio: 1, index: 2, decay: 0.35 }, env: [0.004, 0.4, 0.35, 0.3], vol: 0.18 })
inst("bass", { wave: "triangle", env: [0.004, 0.08, 0.8, 0.06], vol: 0.55 })
inst("lead", { wave: "square", duty: 0.125, env: [0.006, 0.12, 0.55, 0.12], vol: 0.16, vibrato: { rate: 5.5, depth: 0.12, delay: 0.15 } })

// One chord per bar (16 steps), held; the bass walks root, fifth, octave.
const keys = prog.map((c) => chord(c, 3) + " -".repeat(7) + " " + chord(c, 3) + " -".repeat(7)).join(" | ")
const roots = { Dm9: ["D2", "A2", "D3"], G7: ["G2", "D3", "G3"], Cmaj7: ["C2", "G2", "C3"], Am7: ["A1", "E2", "A2"] }
const bass = prog.map((c) => { const [r, f, o] = roots[c]; return `${r} . . . ${f} . . . ${o} . . . ${f} . ${r} .` }).join(" | ")
const m = (idx) => idx.map((i) => (i === null ? "." : i === "-" ? "-" : S[i])).join(" ")
const lead = [
  m([4, "-", 3, 2, 0, "-", "-", null, 2, 3, 4, "-", 6, "-", 5, null]),
  m([3, "-", "-", 2, 1, "-", 3, null, 4, "-", 3, null, 1, "-", "-", null]),
  m([2, "-", 4, "-", 6, "-", 7, "-", 6, 4, 2, null, 4, "-", "-", null]),
  m([0, "-", 2, "-", 4, "-", 3, 2, 0, "-", "-", "-", null, null, null, null]),
].join(" | ")

song("theme", { bpm: 96, swing: 0.12, vol: 0.8, fx: [chorus({ mix: 0.35 }), reverb({ size: 0.5, mix: 0.18 }), limiter()] },
  track("keys", keys), track("bass", bass), track("lead", lead),
  track("kick", "x . . . . . . . x . x . . . . . "),
  track("snare", ". . . . x . . . . . . . x . . ."),
  track("hat", "x . x . x . x x x . x . x . x .", { vol: 0.6 }))
