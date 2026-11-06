# chirp reference

Sound files are plain JavaScript (or TypeScript) evaluated with the DSL as globals. Nothing
renders at definition time; sounds may reference each other in any order. 44.1 kHz stereo.

Pitches are Hz (`440`) or notes (`"A4"`, `"C#5"`, `"Eb3"`). Times are seconds. Volumes 0..1.

## Sounds

```js
sfx(name, opts?, ...items)
song(name, opts?, ...items)          // tracks + any other items
inst(name, voiceOpts | (freq, dur, accent) => items)
bank(name, ["coin*", "jump"], { gap = 0.1 })
include("other.cx.js")
```

Names starting with `_` are parts: playable with `play()`, never exported.

| Option | Sound | Meaning |
|---|---|---|
| `vol` | both | Master volume. |
| `fx` | both | List of effects applied to the whole sound, in order. |
| `pitch` | both | Semitones for everything inside. |
| `base` | sfx | Start from another sound (variant). |
| `dur` | sfx | Fixed length; extra is cut (or wrapped, with `loop`). |
| `loop` | both | Seamless loop (songs default to `true`): the tail wraps onto the start. |
| `bpm` | song | Tempo (default 120). |
| `steps` | song | Steps per beat (default 4 = 16th notes). |
| `bars` | song | Length in 4-beat bars (default: the longest track). |
| `swing` | song | 0..0.5: delay every other step by this fraction of a step. |

Non-looping sounds trim their inaudible tail (below about -66 dBFS).

## Items

| Item | Meaning |
|---|---|
| `tone({ ... })` | Oscillator voice. |
| `noise({ ... })` | Noise voice. |
| `sample("file.wav", { ... })` | A recorded sound (WAV: PCM 8/16/24/32-bit or float, mono or stereo, any rate; path relative to the sound file). Options: `root` (the note it was recorded at) + `freq` to repitch it (`freq / root` changes the speed), `start` (seconds into the file), `dur` (default: the rest of the file), `loop` (repeat for `dur`), `env` (default `[0, 0, 1, 0.005]`), `vol`, `pan`, `filter`. Voice, foley, found sounds, drum hits. |
| `at(t, ...items)` | Shift items by `t` seconds. |
| `play(name, { pitch, vol, pan })` | Another sound (with its own effects) placed here. |
| `track(inst, pattern, { vol, pan, transpose, gate })` | Songs only. |
| lists, `null`, `false` | Flattened / skipped. |

### Voice options

| Option | Meaning |
|---|---|
| `wave` | `sine`, `square` (default), `saw`, `triangle`, `fm` (tones). Square and saw are band-limited. |
| `fm` | With `wave: "fm"`: `{ ratio: 2, index: 2, decay: 0 }`. A sine modulator at `ratio` × the pitch pushes the carrier's phase by `index`; `decay` (seconds) lets the index fade so the note starts bright and mellows (bells: ratio 3.5, index 4, decay 0.4; electric piano: ratio 1, index 2, decay 0.3; brass: ratio 1, index 3; basses: ratio 0.5). |
| `color` | `white` (default), `pink`, `brown` (noise). |
| `freq` | Start pitch (tones, default 440). On noise: sample-and-hold rate, giving crunchy chip noise. |
| `to`, `slide`, `curve` | Slide to `to` over `slide` seconds (default: the gate); `curve: "exp"` (default) or `"lin"`. |
| `dur` | Gate in seconds (default 0.2). The release rings on after it. |
| `env` | `[attack, decay, sustain 0..1, release]` (default `[0.005, 0.05, 0.7, 0.08]`). |
| `vol`, `pan` | Level, stereo position -1..1. |
| `duty` | Square pulse width (0.125 / 0.25 / 0.5 for classic chip timbres). |
| `arp` | `{ notes: [0, 4, 7], rate: 0.04 }`: semitone offsets cycled every `rate` seconds. |
| `vibrato` | `{ rate, depth (semitones), delay }`. |
| `tremolo` | `{ rate, depth 0..1 }`. |
| `filter` | `{ type: "lp" \| "hp" \| "bp", cutoff \| from + to (sweep), q }`. |
| `seed` | Noise seed (default: derived from the sound name and position, so builds repeat). |

## Effects

| Effect | Options |
|---|---|
| `delay({ ... })` | `time` 0.25, `feedback` 0.35, `mix` 0.3, `pingpong` false |
| `reverb({ ... })` | `size` 0.6, `damp` 0.4, `mix` 0.25 |
| `crush({ ... })` | `bits` 8, `rate` 11025 |
| `drive({ ... })` | `amount` 2 (tanh saturation) |
| `filter({ ... })` | `type`, `cutoff` or `from` + `to` (sweep over the sound), `q` |
| `chorus({ ... })` | `rate` 0.8 Hz, `depth` 0.004 s, `mix` 0.5, `voices` 2: modulated delays, the right side offset, for width and ensemble detune (pads, strings, leads) |
| `limiter({ ... })` | `ceiling` 0.95, `release` 0.05 s: a peak limiter that keeps the final output (after `vol`, after a loop's tails wrap onto its start) under the ceiling, so dense mixes never clip. It always runs last, wherever it sits in the list. |

## Patterns

One token per step, separated by spaces:

| Token | Meaning |
|---|---|
| `C4`, `F#3`, `Bb5` | Note |
| `C4+E4+G4` | Chord |
| `x`, `X` | Hit (drums; `X` accented) |
| `.` | Rest |
| `-` | Hold the previous note one more step |
| `!` suffix | Accent (`C5!`) |
| `\|` | Bar line, ignored |

Each track repeats its pattern until the song ends. Built-in drum instruments: `kick`, `snare`,
`hat`, `openhat`, `clap`, `tom`. Patterns are strings, so arrangements are JS: `[A, A, B, A].join(" | ")`.

Instruments can be samples: `inst("vox", { sample: "ah.wav", root: "C4", env: [0.01, 0.1, 0.8, 0.2] })`
plays the recording repitched to every note of the pattern (the same options as `sample()`).

### Chords and scales

| Call | Gives |
|---|---|
| `chord("Am7", octave = 4, inversion = 0)` | A pattern token: `"A4+C5+E5+G5"`. Qualities: major (none), `m`, `dim`, `aug`, `5`, `sus2`, `sus4`, `6`, `m6`, `7`, `m7`, `maj7`, `mmaj7`, `dim7`, `m7b5`, `9`, `m9`, `maj9`, `add9`, `madd9`, `11`, `13`. Inversions lift the lowest notes an octave. |
| `scale("C", "minor", octave = 4, octaves = 1)` | Note names, one octave plus the octave note: `["C4", "D4", "D#4", ...]`. Modes: `major minor dorian phrygian lydian mixolydian locrian harmonicMinor melodicMinor pentatonic minorPentatonic blues wholeTone chromatic japanese egyptian`. Index it for melodies: `const S = scale("A", "minorPentatonic", 4); track("lead", [0, 2, 4, 2].map((i) => S[i]).join(" "))`. |

```js
const prog = ["Am", "F", "C", "G"].map((c) => chord(c, 3) + " - - - - - - -")   // one chord per half bar
song("verse", { bpm: 96, bars: 4 }, track("pad", prog.join(" | ")), track("bass", prog.map((p) => p.split("+")[0]).join(" | ")))
```

## Output and commands

`chirp build file.cx.js [--out DIR] [--only a,b] [--ogg] [--mono] [--no-preview]`

| Path | Content |
|---|---|
| `out/sfx/<name>.wav` / `out/music/<name>.wav` | 16-bit 44.1 kHz stereo (`--mono`: one channel, L and R averaged, for positional sounds). Looping sounds (songs, `loop: true` sfx) carry a RIFF `smpl` chunk with one forward loop over the whole file, so Godot (import loop mode "Detect from WAV", the default), FMOD and samplers loop them without setup. `--ogg` adds Vorbis `.ogg` (needs ffmpeg; set Loop in Godot's import dock, OGG has no loop points). |
| `out/music/<name>.mid` | Every song as a standard MIDI file: one track per `track()`, tempo, notes with accents as velocity, the built-in drums as General MIDI percussion on channel 10, a GM program per wave (square / saw / triangle / sine leads, FM as electric piano). Open it in a DAW to arrange the composition with real instruments. |
| `out/<bank>.wav` + `.json` | Audio sprite: `{ src, sprite: { name: [startMs, durMs] \| [startMs, durMs, true] } }` (Howler.js format). |
| `out/_preview/<name>.png` | Waveform + log-frequency spectrogram with time and Hz axes. The folder holds a `.gdignore`, so a build inside a Godot project does not import the previews. |

`chirp info file.cx.js <name> [--layer N]` prints levels, clipping, brightness and the pitch over time.
`chirp serve file.cx.js [--port 4330] [--no-out]` runs the live player. Its **annotate** mode (`a`)
marks spans (drag on the waveform for all frequencies, on the spectrogram for a band) and notes
(click a moment), colored fix / keep / check, with labels and a comment. **send to Claude** writes
`<out>/_feedback/<sound>.json` (`spans`: `t0, t1, band, color, text, from, to, loudest`; `notes`:
`t, f, text, at, loudest`; for songs `from`/`to`/`at` are `{ bar, beat, step }`, and `loudest` lists the
layers by RMS in that window with their source location), `<sound>.annotated.png` and
`<sound>.current.png`. `chirp list file.cx.js` lists everything.
