import { OfflineAudioContext } from "node-web-audio-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySteps, type EngineId, type VoiceId } from "@/lib/audio/model";
import { Rack, type RackSnapshot } from "@/lib/audio/engine";
import { useApp } from "@/lib/store";

function energy(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  return Math.sqrt(sum / data.length);
}

async function renderHit(prepare: (snapshot: RackSnapshot) => void, voice: VoiceId = "kick"): Promise<number> {
  const ctx = new OfflineAudioContext(2, 24000, 48000);
  const snapshot = structuredClone(useApp.getState().snapshot()) as RackSnapshot;
  prepare(snapshot);
  const rack = new Rack(ctx as unknown as AudioContext, () => snapshot, () => {});
  rack.sync();
  rack.preview("a", voice);
  rack.readLevel();
  const buffer = await ctx.startRendering();
  return energy(buffer);
}

beforeEach(() => {
  localStorage.clear();
  useApp.setState(useApp.getInitialState(), true);
});

describe("rack", () => {
  it("puts a hit through the mixer and silences it when the fader is down", async () => {
    const loud = await renderHit((snapshot) => {
      snapshot.master = 1;
      snapshot.crossfade = 0;
      snapshot.decks.a.volume = 1;
      snapshot.decks.a.engines.kick = "sample";
    });
    const quiet = await renderHit((snapshot) => {
      snapshot.master = 0;
      snapshot.crossfade = 0;
      snapshot.decks.a.volume = 0;
    });
    expect(loud).toBeGreaterThan(0.01);
    expect(quiet).toBeLessThan(loud / 20);
  });

  it("plays each engine on each voice", async () => {
    const engines: EngineId[] = ["sample", "fm", "physical", "granular"];
    const voices: VoiceId[] = ["kick", "snare", "hat", "perc"];
    for (const engine of engines) {
      for (const voice of voices) {
        const level = await renderHit((snapshot) => {
          snapshot.master = 1;
          snapshot.crossfade = 0;
          snapshot.decks.a.volume = 1;
          snapshot.decks.a.engines[voice] = engine;
          snapshot.decks.a.filter = engine === "fm" ? 0 : engine === "physical" ? 1 : 0.5;
          snapshot.decks.a.patches[engine][voice].e = voice === "kick" ? 0 : 1;
        }, voice);
        expect(level).toBeGreaterThan(0);
      }
    }
  });

  it("skips a muted voice and stops cleanly", async () => {
    const steps: number[] = [];
    const ctx = new OfflineAudioContext(2, 8000, 48000);
    const snapshot = structuredClone(useApp.getState().snapshot()) as RackSnapshot;
    snapshot.master = 1;
    snapshot.decks.a.volume = 1;
    snapshot.decks.b.volume = 0;
    snapshot.decks.a.steps = emptySteps();
    snapshot.decks.b.steps = emptySteps();
    snapshot.decks.a.mute.kick = true;
    snapshot.decks.a.steps.kick[0] = true;
    snapshot.decks.a.swing = 1;
    const rack = new Rack(ctx as unknown as AudioContext, () => snapshot, (step) => steps.push(step));
    rack.stop();
    rack.start();
    rack.start();
    await new Promise((resolve) => setTimeout(resolve, 40));
    rack.stop();
    expect(steps.at(-1)).toBe(-1);
    const buffer = await ctx.startRendering();
    expect(energy(buffer)).toBeLessThan(0.01);
  });

  it("still cleans up if a node is already gone", () => {
    const ctx = new OfflineAudioContext(2, 4000, 48000);
    const snapshot = structuredClone(useApp.getState().snapshot()) as RackSnapshot;
    snapshot.master = 1;
    snapshot.decks.a.volume = 1;
    const rack = new Rack(ctx as unknown as AudioContext, () => snapshot, () => {});
    const source = ctx.createBufferSource();
    const proto = Object.getPrototypeOf(source) as { disconnect: () => void };
    const original = proto.disconnect;
    proto.disconnect = () => {
      throw new Error("gone");
    };
    const spy = vi.spyOn(window, "setTimeout").mockImplementation((handler: TimerHandler) => {
      if (typeof handler === "function") handler();
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    rack.preview("a", "kick");
    const fm = structuredClone(snapshot);
    fm.decks.a.engines.kick = "fm";
    fm.decks.a.patches.fm.kick.e = 1;
    const noisy = new Rack(ctx as unknown as AudioContext, () => fm, () => {});
    noisy.preview("a", "kick");
    spy.mockRestore();
    proto.disconnect = original;
  });

  it("bounces a short loop to a wav file", async () => {
    const ctx = new OfflineAudioContext(2, 8000, 48000);
    const snapshot = structuredClone(useApp.getState().snapshot()) as RackSnapshot;
    snapshot.bpm = 180;
    snapshot.master = 1;
    snapshot.decks.a.volume = 1;
    snapshot.decks.b.volume = 0;
    snapshot.decks.a.swing = 1;
    const rack = new Rack(ctx as unknown as AudioContext, () => snapshot, () => {});
    const blob = await rack.bounce(1);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(bytes.length).toBeGreaterThan(1000);
    const view = new DataView(bytes.buffer);
    let negative = false;
    let positive = false;
    for (let offset = 44; offset < bytes.length; offset += 4) {
      const sample = view.getInt16(offset, true);
      if (sample < 0) negative = true;
      if (sample > 0) positive = true;
    }
    expect(negative && positive).toBe(true);
  });

  it("catches a late clock and paints the playhead once", async () => {
    const ctx = new OfflineAudioContext(2, 16000, 48000);
    let now = 0;
    Object.defineProperty(ctx, "currentTime", { configurable: true, get: () => now });
    const steps: number[] = [];
    const snapshot = structuredClone(useApp.getState().snapshot()) as RackSnapshot;
    snapshot.bpm = 70;
    snapshot.master = 0;
    snapshot.decks.a.volume = 0;
    snapshot.decks.b.volume = 0;
    const rack = new Rack(ctx as unknown as AudioContext, () => snapshot, (step) => steps.push(step));
    const pending: Array<() => void> = [];
    const orig = window.setTimeout.bind(window);
    const spy = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, ms?: number) => {
      if (ms === 25 && typeof handler === "function") {
        pending.push(handler as () => void);
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }
      return orig(handler, ms);
    }) as typeof setTimeout);
    rack.start();
    await new Promise((resolve) => orig(resolve, 20));
    expect(steps).toEqual([]);
    now = 2;
    pending[0]?.();
    await new Promise((resolve) => orig(resolve, 40));
    expect(steps).toContain(0);
    const marked = steps.length;
    await new Promise((resolve) => orig(resolve, 20));
    rack.stop();
    pending.at(-1)?.();
    expect(steps.at(-1)).toBe(-1);
    expect(marked).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
