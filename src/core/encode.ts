// WAV (16-bit PCM) and PNG (RGBA) encoders. zlib comes from the host, passed in.
import type { Stereo } from "./synth.ts";
import { SR } from "./util.ts";

export interface WavOptions {
  /** Add a `smpl` chunk with one forward loop over the whole sound, so Godot, FMOD and samplers loop it. */
  loop?: boolean;
  /** One channel (L and R averaged) instead of two: half the size, for positional (3D / 2D-panned) sounds. */
  mono?: boolean;
}

export function wav(b: Stereo, opts: WavOptions = {}): Uint8Array {
  const n = b.L.length, ch = opts.mono ? 1 : 2, data = n * ch * 2;
  const smpl = opts.loop ? 8 + 36 + 24 : 0;
  const out = new Uint8Array(44 + data + smpl), v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  const s16 = (o: number, x: number) => v.setInt16(o, Math.round(Math.max(-1, Math.min(1, x)) * 32767), true);
  str(0, "RIFF"); v.setUint32(4, 36 + data + smpl, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, data, true);
  for (let i = 0; i < n; i++) {
    if (ch === 1) s16(44 + i * 2, (b.L[i] + b.R[i]) / 2);
    else { s16(44 + i * 4, b.L[i]); s16(46 + i * 4, b.R[i]); }
  }
  if (opts.loop) {
    // smpl: sampler header (9 × u32) + one loop (6 × u32). Loop end is the last sample, inclusive.
    const o = 44 + data;
    str(o, "smpl"); v.setUint32(o + 4, 36 + 24, true);
    v.setUint32(o + 16, Math.round(1e9 / SR), true);   // sample period in ns
    v.setUint32(o + 20, 60, true);                      // MIDI unity note (middle C)
    v.setUint32(o + 36, 1, true);                       // one sample loop
    const l = o + 44;                                   // cue id 0, type 0 (forward), start 0
    v.setUint32(l + 12, Math.max(0, n - 1), true);
  }
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function png(w: number, h: number, rgba: Uint8Array, deflate: (b: Uint8Array) => Uint8Array): Uint8Array {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, w); hv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflate(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
