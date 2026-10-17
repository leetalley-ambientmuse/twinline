import type { VoiceId } from "@/lib/audio/model";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function soft(x: number): number {
  return Math.tanh(x);
}

export function renderKick(sr: number): Float32Array {
  const rand = mulberry32(0x51c0);
  const dur = 0.62;
  const len = Math.floor(sr * dur);
  const data = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = 46 + 168 * Math.exp(-t * 24);
    phase += (2 * Math.PI * f) / sr;
    const body = Math.sin(phase) * Math.exp(-t * 5.2);
    const sub = Math.sin(2 * Math.PI * 42 * t) * Math.exp(-t * 7.5);
    const click = (rand() * 2 - 1) * Math.exp(-t * 220);
    data[i] = soft(body * 0.92 + sub * 0.38 + click * 0.55);
  }
  return data;
}

export function renderSnare(sr: number): Float32Array {
  const rand = mulberry32(0x5aae);
  const dur = 0.42;
  const len = Math.floor(sr * dur);
  const data = new Float32Array(len);
  let phase = 0;
  let low = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = 188 + 90 * Math.exp(-t * 36);
    phase += (2 * Math.PI * f) / sr;
    const tone = Math.sin(phase) * Math.exp(-t * 26);
    const n = rand() * 2 - 1;
    low += (n - low) * 0.28;
    const noise = (n - low) * Math.exp(-t * 14);
    data[i] = soft(tone * 0.62 + noise * 0.78);
  }
  return data;
}

export function renderHat(sr: number): Float32Array {
  const rand = mulberry32(0x4a7);
  const dur = 0.28;
  const len = Math.floor(sr * dur);
  const data = new Float32Array(len);
  const freqs = [317, 412, 536, 691, 842, 1040];
  const phases = freqs.map((_, i) => rand() * Math.PI * 2 + i);
  let prev = 0;
  let hp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      phases[k] += (2 * Math.PI * freqs[k]) / sr;
      s += Math.sin(phases[k]) > 0 ? 1 : -1;
    }
    s /= freqs.length;
    const n = rand() * 2 - 1;
    const mixed = s * 0.72 + n * 0.28;
    const out = mixed - prev + 0.94 * hp;
    prev = mixed;
    hp = out;
    const env = Math.exp(-t * 28);
    data[i] = soft(out * env * 0.85);
  }
  return data;
}

export function renderPerc(sr: number): Float32Array {
  const rand = mulberry32(0xc0be);
  const dur = 0.36;
  const len = Math.floor(sr * dur);
  const data = new Float32Array(len);
  let p1 = 0.2;
  let p2 = 1.1;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    p1 += (2 * Math.PI * 326) / sr;
    p2 += (2 * Math.PI * 489) / sr;
    const env = Math.exp(-t * 11);
    const click = (rand() * 2 - 1) * Math.exp(-t * 90);
    data[i] = soft((Math.sin(p1) * 0.62 + Math.sin(p2) * 0.42) * env + click * 0.25);
  }
  return data;
}

/** Longer sources so granular position has somewhere to travel. */
export function renderTexture(voice: VoiceId, sr: number): Float32Array {
  const rand = mulberry32(0x61a100 + voice.length * 97);
  const dur = 1.35;
  const len = Math.floor(sr * dur);
  const data = new Float32Array(len);
  const hit =
    voice === "kick"
      ? renderKick(sr)
      : voice === "snare"
        ? renderSnare(sr)
        : voice === "hat"
          ? renderHat(sr)
          : renderPerc(sr);
  const copy = Math.min(hit.length, len);
  data.set(hit.subarray(0, copy));
  let p = 0;
  const base =
    voice === "kick" ? 52 : voice === "snare" ? 190 : voice === "hat" ? 860 : 280;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    p += (2 * Math.PI * base) / sr;
    const n = rand() * 2 - 1;
    const bed =
      voice === "hat"
        ? n * (0.35 + 0.25 * Math.sin(t * 40))
        : Math.sin(p) * 0.25 + n * (voice === "snare" ? 0.35 : 0.12);
    const tail = Math.exp(-t * (voice === "kick" ? 1.4 : 2.2));
    data[i] = soft(data[i] + bed * tail * 0.85);
  }
  return data;
}

export function renderNoise(sr: number, seconds = 1): Float32Array {
  const rand = mulberry32(0x1015e);
  const len = Math.floor(sr * seconds);
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
  return data;
}

export function renderVoice(voice: VoiceId, sr: number): Float32Array {
  if (voice === "kick") return renderKick(sr);
  if (voice === "snare") return renderSnare(sr);
  if (voice === "hat") return renderHat(sr);
  return renderPerc(sr);
}
