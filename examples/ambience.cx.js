// Ambience loops for a cave level: every sound here loops seamlessly (the tail wraps onto the start)
// and its WAV carries a smpl loop, so Godot imports it looping with no setup.

// Plain JS for placement: a tiny seeded random, so every build is the same.
let seed = 0x9e3779b9
const rnd = () => {                                                  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Cave: a low wind that breathes, a sub rumble, and water drips at uneven times and places.
sfx("cave", { dur: 8, loop: true, vol: 0.8, fx: [reverb({ size: 0.85, damp: 0.5, mix: 0.35 }), limiter()] },
  noise({ color: "pink", dur: 8, env: [0, 0, 1, 0], vol: 0.18, tremolo: { rate: 0.25, depth: 0.6 }, filter: { type: "bp", cutoff: 420, q: 0.7 } }),
  noise({ color: "brown", dur: 8, env: [0, 0, 1, 0], vol: 0.35, filter: { type: "lp", cutoff: 90 } }),
  Array.from({ length: 9 }, () => at(rnd() * 7.8,
    tone({ wave: "sine", freq: 900 + rnd() * 900, to: 2400 + rnd() * 600, slide: 0.03, dur: 0.03, env: [0.001, 0.04, 0, 0.05], vol: 0.35, pan: rnd() * 1.6 - 0.8 }))))

// A torch: crackle pops over a soft roar. Build it with --mono to place it in the level (2D/3D audio).
sfx("torch", { dur: 3, loop: true, vol: 0.7 },
  noise({ color: "brown", dur: 3, env: [0, 0, 1, 0], vol: 0.5, tremolo: { rate: 3.1, depth: 0.3 }, filter: { type: "lp", cutoff: 700 } }),
  Array.from({ length: 22 }, () => at(rnd() * 2.95,
    noise({ dur: 0.006 + rnd() * 0.01, env: [0, 0.01, 0, 0.01], vol: 0.25 + rnd() * 0.4, filter: { type: "hp", cutoff: 2500 } }))))
