import {
  ENGINES,
  VOICES,
  clamp01,
  type EngineId,
  type Patch,
  type VoiceId,
} from "@/lib/audio/model";

export type MixLock = {
  aVol: number;
  bVol: number;
  aLo: number;
  aMid: number;
  aHi: number;
  aFlt: number;
  bLo: number;
  bMid: number;
  bHi: number;
  bFlt: number;
  crossfade: number;
  master: number;
};

export type CompiledDeck = {
  role: string;
  swing: number;
  engines: Record<VoiceId, EngineId>;
  mute: Record<VoiceId, boolean>;
  steps: Record<VoiceId, boolean[]>;
  patches: Record<VoiceId, Patch>;
};

export type CompiledTrack = {
  title: string;
  blurb: string;
  bpm: number;
  followMix: boolean;
  automation: MixLock[];
  decks: Record<"a" | "b", CompiledDeck>;
};

const FALLBACK_GRID: Record<VoiceId, string> = {
  kick: "x---x---x---x---",
  snare: "----x-------x---",
  hat: "--x---x---x---x-",
  perc: "-------x--------",
};

const PATCH_KEYS = ["a", "b", "c", "d", "e", "level"] as const;

export function parseArrangement(raw: unknown): { ok: true; track: CompiledTrack } | { ok: false; error: string } {
  const root = unwrap(raw);
  if (!root) return { ok: false, error: "The score came back empty." };

  const mix = asRecord(root.mix) ?? root;
  const followMix = root.mix && typeof asRecord(root.mix)?.follow === "boolean" ? Boolean(asRecord(root.mix)?.follow) : false;
  const automation = buildAutomation(mix, followMix);
  const deckA = compileDeck(root.a ?? root.amber, "Foundation");
  const deckB = compileDeck(root.b ?? root.lacquer, "Answer");
  if (!deckA || !deckB) return { ok: false, error: "The score was missing a machine." };

  const hits = VOICES.reduce(
    (sum, voice) => sum + deckA.steps[voice].filter(Boolean).length + deckB.steps[voice].filter(Boolean).length,
    0,
  );
  if (hits < 2) return { ok: false, error: "The score had no groove to play." };

  const title = clip(root.title, 42) || "Untitled";
  const blurb = clip(root.blurb ?? root.note ?? root.summary, 180) || "Both machines scored from the prompt.";

  return {
    ok: true,
    track: {
      title,
      blurb,
      bpm: readBpm(root.bpm),
      followMix: automation.follow,
      automation: automation.frames,
      decks: { a: deckA, b: deckB },
    },
  };
}

export function mixCaption(track: CompiledTrack): string {
  const start = track.automation[0];
  const end = track.automation[15];
  const moved = (["crossfade", "aVol", "bVol", "aFlt", "bFlt", "master"] as const).some(
    (key) => Math.abs(end[key] - start[key]) > 0.04,
  );
  if (track.followMix) {
    return moved
      ? "Use track turns on, so the mixer moves across the 16 steps."
      : "Use track turns on. The mixer holds this balance.";
  }
  if (moved) return "The motion is stored on the mix track. Use track stays off until you turn it on.";
  return "The mixer is set, and the mix track holds that balance.";
}

function unwrap(raw: unknown): Record<string, unknown> | null {
  const record = asRecord(raw);
  if (!record) return null;
  if (record.a || record.b || record.amber) return record;
  const nested = asRecord(record.track) ?? asRecord(record.arrangement) ?? asRecord(record.score);
  return nested ?? record;
}

function compileDeck(raw: unknown, fallbackRole: string): CompiledDeck | null {
  const record = asRecord(raw);
  if (!record) return null;
  const bag = asRecord(record.voices) ?? record;
  const deckEngine = typeof record.engine === "string" ? readEngine(record.engine) : null;
  const engines = {} as Record<VoiceId, EngineId>;
  const mute = {} as Record<VoiceId, boolean>;
  const steps = {} as Record<VoiceId, boolean[]>;
  const patches = {} as Record<VoiceId, Patch>;
  for (const voice of VOICES) {
    const voiceRaw = asRecord(bag[voice]) ?? {};
    const grid = readGrid(voiceRaw.grid ?? voiceRaw.pattern ?? voiceRaw.steps) ?? readGrid(FALLBACK_GRID[voice])!;
    engines[voice] = typeof voiceRaw.engine === "string" ? readEngine(voiceRaw.engine) : (deckEngine ?? "sample");
    steps[voice] = grid;
    const silent = grid.every((hit) => !hit);
    mute[voice] = typeof voiceRaw.mute === "boolean" ? voiceRaw.mute : silent;
    patches[voice] = readPatch(voiceRaw);
  }
  return {
    role: clip(record.role ?? record.name, 36) || fallbackRole,
    swing: Math.min(0.55, unit(record.swing, 0.08)),
    engines,
    mute,
    steps,
    patches,
  };
}

function buildAutomation(mix: Record<string, unknown>, requested: boolean): { follow: boolean; frames: MixLock[] } {
  const master = pair(mix.master, 0.78);
  const crossfade = pair(mix.cross ?? mix.crossfade, 0.5);
  const aVol = pair(mix.aVol ?? mix.aVolume, 0.84);
  const bVol = pair(mix.bVol ?? mix.bVolume, 0.74);
  const aLo = pair(mix.aLow ?? mix.aLo, 0.56);
  const aMid = pair(mix.aMid, 0.5);
  const aHi = pair(mix.aHigh ?? mix.aHi, 0.5);
  const aFlt = pair(mix.aFilter ?? mix.aFlt, 0.5);
  const bLo = pair(mix.bLow ?? mix.bLo, 0.48);
  const bMid = pair(mix.bMid, 0.5);
  const bHi = pair(mix.bHigh ?? mix.bHi, 0.58);
  const bFlt = pair(mix.bFilter ?? mix.bFlt, 0.5);
  const frames = Array.from({ length: 16 }, (_, index) => ({
    aVol: ramp(aVol, index),
    bVol: ramp(bVol, index),
    aLo: ramp(aLo, index),
    aMid: ramp(aMid, index),
    aHi: ramp(aHi, index),
    aFlt: ramp(aFlt, index),
    bLo: ramp(bLo, index),
    bMid: ramp(bMid, index),
    bHi: ramp(bHi, index),
    bFlt: ramp(bFlt, index),
    crossfade: ramp(crossfade, index),
    master: ramp(master, index),
  }));
  return { follow: requested, frames };
}

function readPatch(raw: Record<string, unknown>): Patch {
  const patch = {} as Patch;
  for (const key of PATCH_KEYS) {
    const alias =
      key === "level"
        ? raw.level
        : raw[key];
    patch[key] = unit(alias, key === "level" ? 0.72 : 0.5);
  }
  return patch;
}

function readEngine(value: unknown): EngineId {
  if (typeof value === "string") {
    const name = value.toLowerCase();
    if (name.startsWith("phys")) return "physical";
    if (name.startsWith("gran")) return "granular";
    if ((ENGINES as readonly string[]).includes(name)) return name as EngineId;
  }
  return "sample";
}

function readGrid(value: unknown): boolean[] | null {
  if (Array.isArray(value) && value.length >= 16) {
    return value.slice(0, 16).map((cell) => cell === true || cell === 1 || cell === "x" || cell === "X");
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[\s|]/g, "");
  if (cleaned.length < 16) return null;
  return [...cleaned.slice(0, 16)].map((ch) => ch === "x" || ch === "X" || ch === "1" || ch === "*");
}

function readBpm(value: unknown): number {
  const bpm = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(bpm)) return 120;
  return Math.min(180, Math.max(70, Math.round(bpm)));
}

function pair(value: unknown, fallback: number): [number, number] {
  if (Array.isArray(value) && value.length >= 2) return [unit(value[0], fallback), unit(value[1], fallback)];
  if (typeof value === "number" || typeof value === "string") {
    const next = unit(value, fallback);
    return [next, next];
  }
  return [fallback, fallback];
}

function ramp(ends: [number, number], index: number): number {
  if (index <= 0) return ends[0];
  return clamp01(ends[0] + ((ends[1] - ends[0]) * index) / 15);
}

function unit(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  const scaled = number > 1 ? number / 100 : number;
  return clamp01(scaled);
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
