import { create } from "zustand";
import {
  ENGINES,
  VOICES,
  clonePatches,
  clamp01,
  emptySteps,
  patternAmber,
  patternLacquer,
  randomSteps,
  type DeckId,
  type EngineId,
  type Patch,
  type PatchKey,
  type VoiceId,
} from "@/lib/audio/model";
import type { RackSnapshot } from "@/lib/audio/engine";
import type { CompiledTrack, MixLock } from "@/lib/prompt/arrange";

const KEY = "twinline-v1";

export type DeckState = {
  engines: Record<VoiceId, EngineId>;
  swing: number;
  volume: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  filter: number;
  mute: Record<VoiceId, boolean>;
  steps: Record<VoiceId, boolean[]>;
  patches: Record<EngineId, Record<VoiceId, Patch>>;
};

export type GrooveSnap = {
  deck: DeckId;
  steps: Record<VoiceId, boolean[]>;
  mute: Record<VoiceId, boolean>;
  swing: number;
  engines: Record<VoiceId, EngineId>;
  patches: Record<EngineId, Record<VoiceId, Patch>>;
};

export type MixFrame = {
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

export type SpellNote = {
  title: string;
  blurb: string;
  roles: Record<DeckId, string>;
};

export type AppState = {
  armed: boolean;
  playing: boolean;
  recording: boolean;
  followMix: boolean;
  bpm: number;
  step: number;
  armStep: number;
  mixerHolds: number;
  crossfade: number;
  master: number;
  automation: (MixFrame | null)[];
  mobilePane: "a" | "mix" | "b";
  synthDeck: DeckId | null;
  decks: Record<DeckId, DeckState>;
  history: GrooveSnap[];
  spell: SpellNote | null;
  wizardOpen: boolean;
  setPlaying: (playing: boolean) => void;
  setRecording: (recording: boolean) => void;
  setFollowMix: (followMix: boolean) => void;
  setBpm: (bpm: number) => void;
  setStep: (step: number) => void;
  setArmed: (armed: boolean) => void;
  setCrossfade: (value: number) => void;
  setMaster: (value: number) => void;
  holdMixer: (down: boolean) => void;
  focusMixStep: (index: number) => void;
  clearAutomation: () => void;
  eraseMixStep: (index: number) => void;
  setMobilePane: (pane: "a" | "mix" | "b") => void;
  openSynth: (deck: DeckId) => void;
  closeSynth: () => void;
  setEngine: (deck: DeckId, voice: VoiceId, engine: EngineId) => void;
  setSwing: (deck: DeckId, swing: number) => void;
  setVolume: (deck: DeckId, volume: number) => void;
  setEq: (deck: DeckId, band: "eqLow" | "eqMid" | "eqHigh" | "filter", value: number) => void;
  setCell: (deck: DeckId, voice: VoiceId, index: number, on: boolean) => void;
  toggleMute: (deck: DeckId, voice: VoiceId) => void;
  clearDeck: (deck: DeckId) => void;
  randomizeDeck: (deck: DeckId) => void;
  undoDeck: (deck: DeckId) => void;
  copyPattern: (from: DeckId, to: DeckId) => void;
  setPatch: (deck: DeckId, engine: EngineId, voice: VoiceId, key: PatchKey, value: number) => void;
  resetVoice: (deck: DeckId, engine: EngineId, voice: VoiceId) => void;
  jitterVoice: (deck: DeckId, engine: EngineId, voice: VoiceId) => void;
  snapshot: () => RackSnapshot;
  applyArrangement: (track: CompiledTrack) => void;
  setWizardOpen: (open: boolean) => void;
};

function muteOff(): Record<VoiceId, boolean> {
  return { kick: false, snare: false, hat: false, perc: false };
}

function voiceEngines(engine: EngineId): Record<VoiceId, EngineId> {
  return { kick: engine, snare: engine, hat: engine, perc: engine };
}

function makeDeck(
  engine: EngineId,
  swing: number,
  steps: Record<VoiceId, boolean[]>,
): DeckState {
  return {
    engines: voiceEngines(engine),
    swing,
    volume: 0.86,
    eqLow: 0.5,
    eqMid: 0.5,
    eqHigh: 0.5,
    filter: 0.5,
    mute: muteOff(),
    steps,
    patches: clonePatches(),
  };
}

function factoryDecks(): Record<DeckId, DeckState> {
  return {
    a: makeDeck("sample", 0.14, patternAmber()),
    b: makeDeck("fm", 0.32, patternLacquer()),
  };
}

function isEngine(value: unknown): value is EngineId {
  return typeof value === "string" && (ENGINES as readonly string[]).includes(value);
}

function isSteps(value: unknown): value is Record<VoiceId, boolean[]> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return VOICES.every(
    (voice) =>
      Array.isArray(record[voice]) &&
      record[voice].length === 16 &&
      (record[voice] as unknown[]).every((cell) => typeof cell === "boolean"),
  );
}

function isPatch(value: unknown): value is Patch {
  if (!value || typeof value !== "object") return false;
  const patch = value as Record<string, unknown>;
  return (["a", "b", "c", "d", "e", "level"] as const).every(
    (key) => typeof patch[key] === "number" && Number.isFinite(patch[key]),
  );
}

function readEngines(saved: { engine?: unknown; engines?: unknown }, fallback: Record<VoiceId, EngineId>) {
  const raw = saved.engines;
  if (raw && typeof raw === "object") {
    const next = { ...fallback };
    let found = false;
    for (const voice of VOICES) {
      const value = (raw as Record<string, unknown>)[voice];
      if (isEngine(value)) {
        next[voice] = value;
        found = true;
      }
    }
    if (found) return next;
  }
  if (isEngine(saved.engine)) return voiceEngines(saved.engine);
  return fallback;
}

function mergeDeck(base: DeckState, raw: unknown): DeckState {
  if (!raw || typeof raw !== "object") return base;
  const saved = raw as Partial<DeckState> & { patches?: unknown; engine?: unknown };
  const next: DeckState = {
    ...base,
    engines: readEngines(saved, base.engines),
    swing: typeof saved.swing === "number" ? clamp01(saved.swing) : base.swing,
    volume: typeof saved.volume === "number" ? clamp01(saved.volume) : base.volume,
    eqLow: typeof saved.eqLow === "number" ? clamp01(saved.eqLow) : base.eqLow,
    eqMid: typeof saved.eqMid === "number" ? clamp01(saved.eqMid) : base.eqMid,
    eqHigh: typeof saved.eqHigh === "number" ? clamp01(saved.eqHigh) : base.eqHigh,
    filter: typeof saved.filter === "number" ? clamp01(saved.filter) : base.filter,
    steps: isSteps(saved.steps) ? saved.steps : base.steps,
    mute: base.mute,
    patches: clonePatches(),
  };
  if (saved.mute && typeof saved.mute === "object") {
    for (const voice of VOICES) {
      const flag = (saved.mute as Record<string, unknown>)[voice];
      if (typeof flag === "boolean") next.mute[voice] = flag;
    }
  }
  if (saved.patches && typeof saved.patches === "object") {
    for (const engine of ENGINES) {
      const block = (saved.patches as Record<string, unknown>)[engine];
      if (!block || typeof block !== "object") continue;
      for (const voice of VOICES) {
        const patch = (block as Record<string, unknown>)[voice];
        if (isPatch(patch)) {
          next.patches[engine][voice] = {
            a: clamp01(patch.a),
            b: clamp01(patch.b),
            c: clamp01(patch.c),
            d: clamp01(patch.d),
            e: clamp01(patch.e),
            level: clamp01(patch.level),
          };
        }
      }
    }
  }
  return next;
}

function captureMix(
  decks: Record<DeckId, DeckState>,
  crossfade: number,
  master: number,
): MixFrame {
  return {
    aVol: decks.a.volume,
    bVol: decks.b.volume,
    aLo: decks.a.eqLow,
    aMid: decks.a.eqMid,
    aHi: decks.a.eqHigh,
    aFlt: decks.a.filter,
    bLo: decks.b.eqLow,
    bMid: decks.b.eqMid,
    bHi: decks.b.eqHigh,
    bFlt: decks.b.filter,
    crossfade,
    master,
  };
}

function applyMix(
  decks: Record<DeckId, DeckState>,
  frame: MixFrame,
): Record<DeckId, DeckState> {
  return {
    a: {
      ...decks.a,
      volume: frame.aVol,
      eqLow: frame.aLo,
      eqMid: frame.aMid,
      eqHigh: frame.aHi,
      filter: frame.aFlt,
    },
    b: {
      ...decks.b,
      volume: frame.bVol,
      eqLow: frame.bLo,
      eqMid: frame.bMid,
      eqHigh: frame.bHi,
      filter: frame.bFlt,
    },
  };
}

function blankAutomation(): (MixFrame | null)[] {
  return Array.from({ length: 16 }, () => null);
}

const MIX_FIELDS = [
  "aVol",
  "bVol",
  "aLo",
  "aMid",
  "aHi",
  "aFlt",
  "bLo",
  "bMid",
  "bHi",
  "bFlt",
  "crossfade",
  "master",
] as const;

function isMixFrame(value: unknown): value is MixFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Record<string, unknown>;
  return MIX_FIELDS.every((key) => typeof frame[key] === "number" && Number.isFinite(frame[key] as number));
}

function parseAutomation(value: unknown): (MixFrame | null)[] | null {
  if (!Array.isArray(value) || value.length !== 16) return null;
  const steps = value.map((frame) => {
    if (frame === null) return null;
    if (!isMixFrame(frame)) return null;
    const next = { ...frame };
    for (const key of MIX_FIELDS) next[key] = clamp01(frame[key]);
    return next;
  });
  return steps;
}

function writeLock(
  state: AppState,
  decks: Record<DeckId, DeckState>,
  crossfade: number,
  master: number,
): (MixFrame | null)[] {
  if (!state.recording) return state.automation;
  const index = state.step >= 0 ? state.step : state.armStep;
  const automation = state.automation.slice();
  automation[index] = captureMix(decks, crossfade, master);
  return automation;
}

export function loadSaved(): Partial<
  Pick<AppState, "bpm" | "crossfade" | "master" | "decks" | "automation" | "followMix" | "spell">
> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      bpm?: unknown;
      crossfade?: unknown;
      master?: unknown;
      decks?: { a?: unknown; b?: unknown };
      automation?: unknown;
      followMix?: unknown;
      spell?: unknown;
    };
    const base = factoryDecks();
    const automation = parseAutomation(data.automation);
    return {
      bpm: typeof data.bpm === "number" ? Math.min(180, Math.max(70, data.bpm)) : undefined,
      crossfade: typeof data.crossfade === "number" ? clamp01(data.crossfade) : undefined,
      master: typeof data.master === "number" ? clamp01(data.master) : undefined,
      decks: {
        a: mergeDeck(base.a, data.decks?.a),
        b: mergeDeck(base.b, data.decks?.b),
      },
      ...(automation ? { automation } : {}),
      followMix: data.followMix === true,
      spell: readSpell(data.spell),
    };
  } catch {
    return null;
  }
}

export function persistState(state: AppState): void {
  if (typeof window === "undefined") return;
  const payload = {
    bpm: state.bpm,
    crossfade: state.crossfade,
    master: state.master,
    decks: state.decks,
    automation: state.automation,
    followMix: state.followMix,
    spell: state.spell,
  };
  window.localStorage.setItem(KEY, JSON.stringify(payload));
}

function cloneSteps(steps: Record<VoiceId, boolean[]>): Record<VoiceId, boolean[]> {
  return {
    kick: steps.kick.slice(),
    snare: steps.snare.slice(),
    hat: steps.hat.slice(),
    perc: steps.perc.slice(),
  };
}

function remember(state: AppState, deck: DeckId): GrooveSnap[] {
  const current = state.decks[deck];
  const snap: GrooveSnap = {
    deck,
    steps: cloneSteps(current.steps),
    mute: { ...current.mute },
    swing: current.swing,
    engines: { ...current.engines },
    patches: structuredClone(current.patches),
  };
  return [...state.history, snap].slice(-24);
}

export function downloadProject(): void {
  const state = useApp.getState();
  const payload = {
    version: 2,
    bpm: state.bpm,
    crossfade: state.crossfade,
    master: state.master,
    decks: state.decks,
    automation: state.automation,
    followMix: state.followMix,
    spell: state.spell,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "twinline.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function importProject(raw: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!data || typeof data !== "object") return false;
  const record = data as {
    bpm?: unknown;
    crossfade?: unknown;
    master?: unknown;
    decks?: { a?: unknown; b?: unknown };
    automation?: unknown;
    followMix?: unknown;
    spell?: unknown;
  };
  const base = factoryDecks();
  const automation = parseAutomation(record.automation);
  useApp.setState({
    bpm: typeof record.bpm === "number" ? Math.min(180, Math.max(70, record.bpm)) : useApp.getState().bpm,
    crossfade: typeof record.crossfade === "number" ? clamp01(record.crossfade) : useApp.getState().crossfade,
    master: typeof record.master === "number" ? clamp01(record.master) : useApp.getState().master,
    decks: {
      a: mergeDeck(base.a, record.decks?.a),
      b: mergeDeck(base.b, record.decks?.b),
    },
    ...(automation ? { automation } : {}),
    followMix: record.followMix === true,
    spell: readSpell(record.spell),
    history: [],
  });
  return true;
}

function updateDeck(
  decks: Record<DeckId, DeckState>,
  id: DeckId,
  patch: (deck: DeckState) => DeckState,
): Record<DeckId, DeckState> {
  return { ...decks, [id]: patch(decks[id]) };
}

function readSpell(value: unknown): SpellNote | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { title?: unknown; blurb?: unknown; roles?: { a?: unknown; b?: unknown } };
  if (typeof record.title !== "string" || typeof record.blurb !== "string") return null;
  return {
    title: record.title.slice(0, 42),
    blurb: record.blurb.slice(0, 180),
    roles: {
      a: typeof record.roles?.a === "string" ? record.roles.a.slice(0, 36) : "",
      b: typeof record.roles?.b === "string" ? record.roles.b.slice(0, 36) : "",
    },
  };
}

function applyDeckPlan(current: DeckState, plan: CompiledTrack["decks"]["a"], frame: MixLock, id: DeckId): DeckState {
  const patches = structuredClone(current.patches);
  for (const voice of VOICES) {
    patches[plan.engines[voice]][voice] = { ...plan.patches[voice] };
  }
  const amber = id === "a";
  return {
    ...current,
    swing: plan.swing,
    volume: amber ? frame.aVol : frame.bVol,
    eqLow: amber ? frame.aLo : frame.bLo,
    eqMid: amber ? frame.aMid : frame.bMid,
    eqHigh: amber ? frame.aHi : frame.bHi,
    filter: amber ? frame.aFlt : frame.bFlt,
    engines: { ...plan.engines },
    mute: { ...plan.mute },
    steps: cloneSteps(plan.steps),
    patches,
  };
}

export const useApp = create<AppState>((set, get) => ({
  armed: false,
  playing: false,
  recording: false,
  followMix: false,
  bpm: 124,
  step: -1,
  armStep: 0,
  mixerHolds: 0,
  crossfade: 0.5,
  master: 0.78,
  automation: blankAutomation(),
  mobilePane: "a",
  synthDeck: null,
  decks: factoryDecks(),
  history: [],
  spell: null,
  wizardOpen: false,
  setPlaying: (playing) => set({ playing }),
  setRecording: (recording) => set({ recording }),
  setFollowMix: (followMix) => set({ followMix }),
  setBpm: (bpm) => set({ bpm: Math.min(180, Math.max(70, Math.round(bpm))) }),
  setStep: (step) => {
    const state = get();
    if (step < 0) {
      set({ step });
      return;
    }
    if (state.recording && state.mixerHolds > 0) {
      const automation = state.automation.slice();
      automation[step] = captureMix(state.decks, state.crossfade, state.master);
      set({ step, automation });
      return;
    }
    if (state.followMix && state.mixerHolds === 0) {
      const lock = state.automation[step];
      if (lock) {
        set({
          step,
          crossfade: lock.crossfade,
          master: lock.master,
          decks: applyMix(state.decks, lock),
        });
        return;
      }
    }
    set({ step });
  },
  setArmed: (armed) => set({ armed }),
  setCrossfade: (value) =>
    set((state) => {
      const crossfade = clamp01(value);
      return { crossfade, automation: writeLock(state, state.decks, crossfade, state.master) };
    }),
  setMaster: (value) =>
    set((state) => {
      const master = clamp01(value);
      return { master, automation: writeLock(state, state.decks, state.crossfade, master) };
    }),
  holdMixer: (down) =>
    set((state) => ({ mixerHolds: Math.max(0, state.mixerHolds + (down ? 1 : -1)) })),
  focusMixStep: (index) => {
    const state = get();
    if (index < 0 || index > 15) return;
    if (state.recording) {
      const automation = state.automation.slice();
      automation[index] = captureMix(state.decks, state.crossfade, state.master);
      set({ armStep: index, automation });
      return;
    }
    const lock = state.automation[index];
    if (lock && state.followMix && !state.playing) {
      set({
        armStep: index,
        crossfade: lock.crossfade,
        master: lock.master,
        decks: applyMix(state.decks, lock),
      });
      return;
    }
    set({ armStep: index });
  },
  clearAutomation: () => set({ automation: blankAutomation() }),
  eraseMixStep: (index) => {
    const state = get();
    if (!state.automation[index]) return;
    const automation = state.automation.slice();
    automation[index] = null;
    set({ automation, armStep: index });
  },
  setMobilePane: (mobilePane) => set({ mobilePane }),
  openSynth: (synthDeck) => set({ synthDeck }),
  closeSynth: () => set({ synthDeck: null }),
  setEngine: (deck, voice, engine) =>
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => ({
        ...current,
        engines: { ...current.engines, [voice]: engine },
      })),
    })),
  setSwing: (deck, swing) =>
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => ({ ...current, swing: clamp01(swing) })),
    })),
  setVolume: (deck, volume) =>
    set((state) => {
      const decks = updateDeck(state.decks, deck, (current) => ({
        ...current,
        volume: clamp01(volume),
      }));
      return { decks, automation: writeLock(state, decks, state.crossfade, state.master) };
    }),
  setEq: (deck, band, value) =>
    set((state) => {
      const decks = updateDeck(state.decks, deck, (current) => ({
        ...current,
        [band]: clamp01(value),
      }));
      return { decks, automation: writeLock(state, decks, state.crossfade, state.master) };
    }),
  setCell: (deck, voice, index, on) => {
    if (get().decks[deck].steps[voice][index] === on) return;
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => {
        const steps = current.steps[voice].slice();
        steps[index] = on;
        return { ...current, steps: { ...current.steps, [voice]: steps } };
      }),
    }));
  },
  toggleMute: (deck, voice) =>
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => ({
        ...current,
        mute: { ...current.mute, [voice]: !current.mute[voice] },
      })),
    })),
  clearDeck: (deck) =>
    set((state) => ({
      history: remember(state, deck),
      decks: updateDeck(state.decks, deck, (current) => ({ ...current, steps: emptySteps() })),
    })),
  randomizeDeck: (deck) =>
    set((state) => ({
      history: remember(state, deck),
      decks: updateDeck(state.decks, deck, (current) => ({ ...current, steps: randomSteps() })),
    })),
  undoDeck: (deck) => {
    const state = get();
    let index = -1;
    for (let i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].deck === deck) {
        index = i;
        break;
      }
    }
    if (index < 0) return;
    const snap = state.history[index];
    set({
      history: state.history.filter((_, i) => i !== index),
      decks: updateDeck(state.decks, deck, (current) => ({
        ...current,
        steps: cloneSteps(snap.steps),
        mute: { ...snap.mute },
        swing: snap.swing,
        engines: { ...snap.engines },
        patches: structuredClone(snap.patches),
      })),
    });
  },
  copyPattern: (from, to) => {
    if (from === to) return;
    set((state) => {
      const source = state.decks[from];
      return {
        history: remember(state, to),
        decks: updateDeck(state.decks, to, (current) => ({
          ...current,
          steps: cloneSteps(source.steps),
          mute: { ...source.mute },
          swing: source.swing,
          engines: { ...source.engines },
          patches: structuredClone(source.patches),
        })),
      };
    });
  },
  setPatch: (deck, engine, voice, key, value) =>
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => ({
        ...current,
        patches: {
          ...current.patches,
          [engine]: {
            ...current.patches[engine],
            [voice]: { ...current.patches[engine][voice], [key]: clamp01(value) },
          },
        },
      })),
    })),
  resetVoice: (deck, engine, voice) =>
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => ({
        ...current,
        patches: {
          ...current.patches,
          [engine]: {
            ...current.patches[engine],
            [voice]: { ...clonePatches()[engine][voice] },
          },
        },
      })),
    })),
  jitterVoice: (deck, engine, voice) =>
    set((state) => ({
      decks: updateDeck(state.decks, deck, (current) => {
        const patch = current.patches[engine][voice];
        const next = { ...patch };
        (Object.keys(next) as PatchKey[]).forEach((key) => {
          next[key] = clamp01(next[key] + (Math.random() - 0.5) * 0.28);
        });
        return {
          ...current,
          patches: {
            ...current.patches,
            [engine]: { ...current.patches[engine], [voice]: next },
          },
        };
      }),
    })),
  snapshot: () => {
    const state = get();
    return {
      bpm: state.bpm,
      master: state.master,
      crossfade: state.crossfade,
      decks: state.decks,
    };
  },
  applyArrangement: (track) => {
    const state = get();
    const remembered = remember({ ...state, history: remember(state, "a") }, "b");
    const index = state.playing && state.step >= 0 ? state.step : 0;
    const frame = track.automation[index] ?? track.automation[0];
    const decks = applyMix(
      {
        a: applyDeckPlan(state.decks.a, track.decks.a, frame, "a"),
        b: applyDeckPlan(state.decks.b, track.decks.b, frame, "b"),
      },
      frame,
    );
    set({
      history: remembered,
      bpm: track.bpm,
      followMix: track.followMix,
      crossfade: frame.crossfade,
      master: frame.master,
      automation: track.automation,
      decks,
      synthDeck: null,
      spell: {
        title: track.title,
        blurb: track.blurb,
        roles: { a: track.decks.a.role, b: track.decks.b.role },
      },
    });
  },
  setWizardOpen: (wizardOpen) => set({ wizardOpen }),
}));
