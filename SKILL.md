---
name: chirp-game-audio
description: Create game sound effects and music (jumps, coins, hits, explosions, UI sounds, ambience loops, chiptune themes, jingles, audio-sprite banks) with chirp, a compact JavaScript DSL that synthesizes WAV/OGG and lets the user listen live in a browser. Use when asked to make, design or iterate on sounds or music for a game.
---

# chirp: game audio as code

You write a small `.cx.js` file; chirp synthesizes WAV (and OGG with `--ogg`) for every sound,
songs that loop seamlessly, audio-sprite banks with Howler-style JSON, and previews you can
read. Needs Node ≥ 22.18 and `npm install` once in this skill's directory.

`CHIRP` below means `node <this skill's directory>/bin/chirp.js`.

## Workflow (you can't hear: read instead)

1. Write `sounds.cx.js` (template below; more in `examples/` and `showcase/`).
2. Build: `CHIRP build sounds.cx.js --only coin,jump`. Each line prints length, peak, RMS and
   brightness. **Fix anything that says CLIPPED** (lower `vol`). Keep SFX peaks around -6 to -12 dBFS
   and similar sounds at similar levels.
3. Check it: `CHIRP info sounds.cx.js coin` prints the pitch over time (notes + Hz), so you can confirm
   slides, arpeggios and melodies. Read `out/_preview/<name>.png` (waveform + log spectrogram) for
   envelopes, filter sweeps, noise color and timing.
4. Let the user listen: start `CHIRP serve sounds.cx.js` in the background and give them the URL.
   It rebuilds on save and plays the edited sound; layers can be soloed. Ask what they hear and iterate.
   **Feedback**: the player's annotate mode (`a`) lets the user drag spans over the waveform or the
   spectrogram (a band) and pin notes to moments, then send them. When they say "check the feedback",
   read `out/_feedback/<sound>.json`: each span has `t0`/`t1` in seconds, `band` in Hz (or null),
   `color` (magenta = fix, cyan = keep, yellow = check), their `text`, the song position (`from`/`to`:
   bar, beat, step) and `loudest`: the layers playing there with their source `loc` and level. Start
   with the loudest layer's line. Comments persist between sends: check `time`.

Errors name file:line:col and suggest fixes. One broken sound doesn't stop the others.

## Template

```js
sfx("coin", { vol: 0.45 },
  tone({ wave: "square", freq: "B5", dur: 0.055, duty: 0.25, env: [0.001, 0.02, 0.6, 0.02] }),
  at(0.055, tone({ wave: "square", freq: "E6", dur: 0.18, duty: 0.25, env: [0.001, 0.05, 0.5, 0.16] })))
sfx("coin_big", { base: "coin", pitch: -5 })                              // variant: semitones

sfx("jump", { vol: 0.45 }, tone({ wave: "square", freq: 220, to: 660, slide: 0.13, dur: 0.13 }))
sfx("explosion", { vol: 0.8, fx: [crush({ bits: 8 }), drive({ amount: 1.6 })] },
  noise({ color: "brown", dur: 0.5, env: [0.002, 0.2, 0.5, 0.6], filter: { type: "lp", from: 4000, to: 150 } }),
  tone({ wave: "sine", freq: 110, to: 35, dur: 0.4 }))
sfx("rain", { dur: 8, loop: true }, noise({ color: "pink", dur: 8.5, filter: { type: "lp", cutoff: 5000 }, vol: 0.3 }))

inst("lead", { wave: "square", duty: 0.25, env: [0.004, 0.1, 0.55, 0.07], vol: 0.25 })
inst("bass", { wave: "triangle", env: [0.003, 0.06, 0.85, 0.04], vol: 0.5 })
song("theme", { bpm: 140, vol: 0.7, fx: [reverb({ mix: 0.12 })] },
  track("lead", "E5 . G5 . C6 - B5 . | A5 . G5 . E5 - - ."),
  track("bass", "C2 . C3 . C2 . C3 . | F2 . F3 . F2 . F3 ."),
  track("kick", "x . . . x . . ."), track("snare", ". . x . . . x ."), track("hat", ". x . x . x . x"))

bank("game_sfx", ["coin*", "jump", "explosion"])
```

## Essentials

- **Voices**: `tone({ wave, freq, to, slide, curve, dur, env, vol, pan, duty, arp, vibrato, tremolo, filter })`
  and `noise({ color, freq, dur, env, filter, ... })`. Pitches are Hz or notes (`"A4"`, `"C#5"`, `"Eb3"`).
  `env: [attack, decay, sustain, release]`; `dur` is the gate, the release rings after it.
  `wave: "fm", fm: { ratio: 3.5, index: 4, decay: 0.4 }` gives bells, electric pianos, brass and metal.
- **Samples**: `sample("hit.wav", { root: "C4", freq: "G4", start, dur, loop })` plays a recording
  (voice, foley, drum hits), repitched by `freq / root`; `inst("vox", { sample: "ah.wav", root: "C4" })`
  makes it an instrument the patterns play. Paths are relative to the sound file.
- **Harmony**: `chord("Am7", 3)` → `"A3+C4+E4+G4"` as a pattern token; `scale("D", "dorian", 4)` → note
  names to index for melodies. Progressions are JS: `["Am", "F", "C", "G"].map((c) => chord(c, 3) + " - - -")`.
- **Time**: items start together; `at(seconds, ...items)` shifts them. `play("other", { pitch, vol, pan })`
  layers another sound.
- **Effects** (sound-level `fx: [...]`): `delay reverb crush drive filter chorus limiter`. End a dense
  song's chain with `limiter({ ceiling: 0.95 })` and it never clips.
- **Music**: `inst(name, voiceOpts)` or `inst(name, (freq, dur, accent) => items)`; drums built in:
  `kick snare hat openhat clap tom`. Patterns: one token per step (`steps` per beat, default 4):
  note, chord `C4+E4+G4`, `x` hit, `.` rest, `-` hold, `!` accent, `|` bar (ignored). Patterns repeat to
  the song length; build long arrangements with plain JS string joins.
- **Loops**: songs loop by default; `sfx(..., { dur, loop: true })` for ambience. Tails wrap onto
  the start, so the seam is inaudible. Non-loops trim their silent tail. Looping WAVs carry a `smpl`
  loop, so Godot imports them looping; `--mono` writes one channel for positional sounds.
- **Game output**: `out/sfx/*.wav`, `out/music/*.wav`, `bank()` → one WAV + `{ src, sprite: { name: [ms, ms] } }`
  JSON for Howler.js / Phaser audio sprites. Songs also write `out/music/*.mid` (tracks, drums on
  channel 10) for a DAW.

Full API: [reference.md](reference.md).

## Habits that make better game audio

- Short and punchy: most SFX are 50–400 ms. Fast attacks (0.001–0.005) for hits, slower for magic.
- Pitch tells meaning: up = gain (coin, jump, power-up), down = loss (hurt, game over).
- Layer a tonal body + a noise transient for impacts (hits, landings, explosions).
- Make variants (`base` + `pitch`, different `seed`s / filters) for anything that repeats: footsteps,
  hits. Players notice identical repeats.
- Keep a family consistent: same waves and envelopes across UI sounds, same reverb across music.
- Leave headroom: music peaks ≤ -2 dBFS, SFX lower, because the game mixes them together.
