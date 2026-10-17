export const VOICES = ["kick", "snare", "hat", "perc"] as const;
export type VoiceId = (typeof VOICES)[number];

export const ENGINES = ["sample", "fm", "physical", "granular"] as const;
export type EngineId = (typeof ENGINES)[number];

export type DeckId = "a" | "b";

export type Patch = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  level: number;
};

export type PatchKey = keyof Patch;

export const VOICE_LABEL: Record<VoiceId, string> = {
  kick: "Kick",
  snare: "Snare",
  hat: "Hat",
  perc: "Perc",
};

export const ENGINE_COPY: Record<
  EngineId,
  { label: string; kicker: string; body: string }
> = {
  sample: {
    label: "Sample",
    kicker: "One-shot buffers",
    body: "Each drum is a rendered hit. Pitch shifts playback rate, start trims into the attack, and punch drives a soft clipper.",
  },
  fm: {
    label: "FM",
    kicker: "Two operators",
    body: "A modulator bends a carrier. Low ratios thump. High ratios ring metal. Noise opens the snare and hat.",
  },
  physical: {
    label: "Physical",
    kicker: "Modes and waveguides",
    body: "Kick is a membrane of decaying modes. Snare is a string plus wires. Hat is a cymbal bank. Perc is a mallet bar.",
  },
  granular: {
    label: "Granular",
    kicker: "Clouds of grains",
    body: "The hit is sliced into tiny grains and sprayed across a short cloud. Position picks the source. Density stacks them.",
  },
};

export const PARAMS: Record<EngineId, { key: PatchKey; label: string }[]> = {
  sample: [
    { key: "a", label: "Pitch" },
    { key: "b", label: "Decay" },
    { key: "c", label: "Tone" },
    { key: "d", label: "Start" },
    { key: "e", label: "Punch" },
    { key: "level", label: "Level" },
  ],
  fm: [
    { key: "a", label: "Pitch" },
    { key: "b", label: "Decay" },
    { key: "c", label: "Ratio" },
    { key: "d", label: "Index" },
    { key: "e", label: "Noise" },
    { key: "level", label: "Level" },
  ],
  physical: [
    { key: "a", label: "Tune" },
    { key: "b", label: "Ring" },
    { key: "c", label: "Bright" },
    { key: "d", label: "Strike" },
    { key: "e", label: "Size" },
    { key: "level", label: "Level" },
  ],
  granular: [
    { key: "a", label: "Position" },
    { key: "b", label: "Size" },
    { key: "c", label: "Density" },
    { key: "d", label: "Spray" },
    { key: "e", label: "Pitch" },
    { key: "level", label: "Level" },
  ],
};

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expLerp(a: number, b: number, t: number): number {
  return a * Math.pow(b / a, t);
}

export type SampleModel = {
  rate: number;
  decay: number;
  cutoff: number;
  offset: number;
  drive: number;
  gain: number;
};

const SAMPLE_DECAY: Record<VoiceId, [number, number]> = {
  kick: [0.09, 0.78],
  snare: [0.05, 0.46],
  hat: [0.02, 0.24],
  perc: [0.04, 0.42],
};

const SAMPLE_CENTER: Record<VoiceId, number> = {
  kick: 0.94,
  snare: 1,
  hat: 1.18,
  perc: 1,
};

export function modelSample(voice: VoiceId, p: Patch): SampleModel {
  return {
    rate: SAMPLE_CENTER[voice] * Math.pow(2, (p.a - 0.5) * 2),
    decay: lerp(SAMPLE_DECAY[voice][0], SAMPLE_DECAY[voice][1], p.b),
    cutoff: expLerp(200, 14000, 0.12 + p.c * 0.88),
    offset: p.d * 0.35,
    drive: 0.45 + p.e * 4.2,
    gain: 0.12 + p.level * p.level * 0.9,
  };
}

export type FmModel = {
  freq: number;
  ratio: number;
  index: number;
  decay: number;
  modDecay: number;
  noise: number;
  glide: number;
  gain: number;
  noiseHp: number;
};

const FM_FREQ: Record<VoiceId, [number, number]> = {
  kick: [34, 88],
  snare: [140, 360],
  hat: [480, 1600],
  perc: [170, 720],
};

const FM_RATIO: Record<VoiceId, [number, number]> = {
  kick: [0.25, 1.7],
  snare: [0.5, 3.8],
  hat: [2.5, 15],
  perc: [1.15, 6.8],
};

const FM_DECAY: Record<VoiceId, [number, number]> = {
  kick: [0.14, 0.75],
  snare: [0.06, 0.4],
  hat: [0.02, 0.16],
  perc: [0.05, 0.38],
};

export function modelFm(voice: VoiceId, p: Patch): FmModel {
  const decay = lerp(FM_DECAY[voice][0], FM_DECAY[voice][1], p.b);
  const indexScale = voice === "kick" ? 7.5 : voice === "hat" ? 3.4 : 5;
  return {
    freq: expLerp(FM_FREQ[voice][0], FM_FREQ[voice][1], p.a),
    ratio: expLerp(FM_RATIO[voice][0], FM_RATIO[voice][1], p.c),
    index: p.d * indexScale,
    decay,
    modDecay: Math.max(0.012, decay * (voice === "kick" ? 0.2 : 0.42)),
    noise: p.e * (voice === "kick" ? 0.22 : voice === "perc" ? 0.35 : 0.8),
    glide: voice === "kick" ? 4.6 : voice === "perc" ? 1.55 : 1,
    gain: 0.1 + p.level * p.level * 0.72,
    noiseHp: voice === "hat" ? 4500 : 700,
  };
}

export type PhysicalKind = "membrane" | "snare" | "cymbal" | "mallet";

export type PhysicalModel = {
  kind: PhysicalKind;
  freq: number;
  decay: number;
  brightness: number;
  strike: number;
  gain: number;
};

export function modelPhysical(voice: VoiceId, p: Patch): PhysicalModel {
  const kind: PhysicalKind =
    voice === "kick"
      ? "membrane"
      : voice === "snare"
        ? "snare"
        : voice === "hat"
          ? "cymbal"
          : "mallet";
  const freqRange: Record<VoiceId, [number, number]> = {
    kick: [32, 76],
    snare: [130, 270],
    hat: [2000, 7400],
    perc: [150, 580],
  };
  const decayRange: Record<VoiceId, [number, number]> = {
    kick: [0.16, 0.95],
    snare: [0.08, 0.48],
    hat: [0.03, 0.3],
    perc: [0.08, 0.6],
  };
  const size = p.e;
  return {
    kind,
    freq: expLerp(freqRange[voice][0], freqRange[voice][1], p.a) * (1 - size * 0.07),
    decay: lerp(decayRange[voice][0], decayRange[voice][1], p.b) * (0.72 + size * 0.55),
    brightness: p.c,
    strike: 0.22 + p.d * 0.95,
    gain: 0.12 + p.level * p.level * 0.85,
  };
}

export type GrainModel = {
  position: number;
  grain: number;
  count: number;
  spray: number;
  rate: number;
  cloud: number;
  gain: number;
};

export function modelGrain(voice: VoiceId, p: Patch): GrainModel {
  const center = SAMPLE_CENTER[voice];
  const density = p.c;
  return {
    position: p.a,
    grain: lerp(0.014, voice === "hat" ? 0.055 : 0.095, p.b),
    count: Math.round(lerp(4, 12, density)),
    spray: p.d,
    rate: center * Math.pow(2, (p.e - 0.5) * 2),
    cloud: lerp(0.045, voice === "hat" ? 0.16 : 0.4, 0.3 + density * 0.45 + p.b * 0.25),
    gain: 0.16 + p.level * p.level * 0.8,
  };
}

export const DEFAULT_PATCHES: Record<EngineId, Record<VoiceId, Patch>> = {
  sample: {
    kick: { a: 0.47, b: 0.64, c: 0.36, d: 0, e: 0.4, level: 0.92 },
    snare: { a: 0.52, b: 0.5, c: 0.6, d: 0, e: 0.26, level: 0.78 },
    hat: { a: 0.55, b: 0.26, c: 0.74, d: 0, e: 0.16, level: 0.5 },
    perc: { a: 0.5, b: 0.42, c: 0.52, d: 0.02, e: 0.2, level: 0.66 },
  },
  fm: {
    kick: { a: 0.4, b: 0.6, c: 0.26, d: 0.72, e: 0.06, level: 0.9 },
    snare: { a: 0.5, b: 0.44, c: 0.48, d: 0.36, e: 0.74, level: 0.76 },
    hat: { a: 0.58, b: 0.24, c: 0.68, d: 0.5, e: 0.6, level: 0.48 },
    perc: { a: 0.52, b: 0.42, c: 0.56, d: 0.48, e: 0.16, level: 0.64 },
  },
  physical: {
    kick: { a: 0.42, b: 0.58, c: 0.32, d: 0.74, e: 0.48, level: 0.9 },
    snare: { a: 0.5, b: 0.42, c: 0.64, d: 0.82, e: 0.34, level: 0.76 },
    hat: { a: 0.56, b: 0.28, c: 0.8, d: 0.68, e: 0.42, level: 0.5 },
    perc: { a: 0.48, b: 0.48, c: 0.46, d: 0.58, e: 0.4, level: 0.68 },
  },
  granular: {
    kick: { a: 0.03, b: 0.58, c: 0.38, d: 0.1, e: 0.46, level: 0.86 },
    snare: { a: 0.08, b: 0.34, c: 0.55, d: 0.26, e: 0.5, level: 0.72 },
    hat: { a: 0.1, b: 0.22, c: 0.72, d: 0.42, e: 0.56, level: 0.5 },
    perc: { a: 0.16, b: 0.4, c: 0.5, d: 0.3, e: 0.5, level: 0.66 },
  },
};

export function clonePatches(): Record<EngineId, Record<VoiceId, Patch>> {
  return structuredClone(DEFAULT_PATCHES);
}

function row(hits: number[]): boolean[] {
  const steps = Array<boolean>(16).fill(false);
  for (const hit of hits) steps[hit] = true;
  return steps;
}

export function patternAmber(): Record<VoiceId, boolean[]> {
  return {
    kick: row([0, 4, 8, 12]),
    snare: row([4, 12]),
    hat: row([2, 6, 10, 14]),
    perc: row([7, 14]),
  };
}

export function patternLacquer(): Record<VoiceId, boolean[]> {
  return {
    kick: row([0, 3, 8, 11]),
    snare: row([4, 12, 14]),
    hat: row([0, 2, 4, 6, 8, 10, 12, 15]),
    perc: row([6, 10, 13]),
  };
}

export function randomSteps(): Record<VoiceId, boolean[]> {
  const blank = (): boolean[] => Array<boolean>(16).fill(false);
  const kick = blank();
  const snare = blank();
  const hat = blank();
  const perc = blank();
  kick[0] = true;
  for (let i = 0; i < 16; i++) {
    if (i % 4 === 0) kick[i] = Math.random() < 0.84;
    else if (i % 2 === 0) kick[i] = Math.random() < 0.14;
    else kick[i] = Math.random() < 0.05;
    if (i % 8 === 4) snare[i] = true;
    else if (i % 2 === 1) snare[i] = Math.random() < 0.14;
    hat[i] = Math.random() < (i % 2 === 1 ? 0.8 : 0.4);
    perc[i] = Math.random() < 0.16;
  }
  snare[4] = true;
  if (Math.random() < 0.88) snare[12] = true;
  return { kick, snare, hat, perc };
}

export function emptySteps(): Record<VoiceId, boolean[]> {
  return {
    kick: Array<boolean>(16).fill(false),
    snare: Array<boolean>(16).fill(false),
    hat: Array<boolean>(16).fill(false),
    perc: Array<boolean>(16).fill(false),
  };
}
