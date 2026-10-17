import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySteps, patternAmber } from "@/lib/audio/model";
import {
  downloadProject,
  importProject,
  loadSaved,
  persistState,
  useApp,
} from "@/lib/store";

function reset() {
  localStorage.clear();
  useApp.setState(useApp.getInitialState(), true);
}

beforeEach(reset);

describe("booth state", () => {
  it("starts Amber on samples and Lacquer on FM, and ignores a no-op pad", () => {
    const state = useApp.getState();
    expect(state.decks.a.engines.kick).toBe("sample");
    expect(state.decks.b.engines.kick).toBe("fm");
    expect(state.followMix).toBe(false);
    const before = state.decks.a.steps.kick[0];
    state.setCell("a", "kick", 0, before);
    expect(useApp.getState().decks.a.steps.kick[0]).toBe(before);
    state.setCell("a", "kick", 1, true);
    expect(useApp.getState().decks.a.steps.kick[1]).toBe(true);
  });

  it("restores a cleared or randomized pattern", () => {
    const original = useApp.getState().decks.a.steps.kick.slice();
    useApp.getState().clearDeck("a");
    expect(useApp.getState().decks.a.steps.kick.every((on) => !on)).toBe(true);
    useApp.getState().undoDeck("a");
    expect(useApp.getState().decks.a.steps.kick).toEqual(original);
    useApp.getState().undoDeck("a");

    useApp.getState().randomizeDeck("a");
    expect(useApp.getState().history).toHaveLength(1);
    useApp.getState().undoDeck("a");
    expect(useApp.getState().decks.a.steps.kick).toEqual(original);
  });

  it("copies one machine onto the other and can undo only the target", () => {
    useApp.getState().setEngine("a", "hat", "granular");
    useApp.getState().setCell("a", "perc", 3, true);
    useApp.getState().copyPattern("a", "a");
    useApp.getState().copyPattern("a", "b");
    expect(useApp.getState().decks.b.engines.hat).toBe("granular");
    expect(useApp.getState().decks.b.steps.perc[3]).toBe(true);
    expect(useApp.getState().decks.b.engines.kick).toBe("sample");
    useApp.getState().undoDeck("b");
    expect(useApp.getState().decks.b.engines.kick).toBe("fm");
    expect(useApp.getState().decks.a.engines.hat).toBe("granular");
  });

  it("clamps tempo and mixer throws, and records only while Record is held", () => {
    useApp.getState().setBpm(10);
    expect(useApp.getState().bpm).toBe(70);
    useApp.getState().setBpm(400);
    expect(useApp.getState().bpm).toBe(180);
    useApp.getState().setVolume("a", Number.NaN);
    expect(useApp.getState().decks.a.volume).toBe(0);
    useApp.getState().setSwing("a", 2);
    expect(useApp.getState().decks.a.swing).toBe(1);
    useApp.getState().setEq("a", "eqLow", 0.2);
    useApp.getState().setCrossfade(1);
    useApp.getState().setMaster(0.3);
    expect(useApp.getState().automation.every((frame) => frame === null)).toBe(true);

    useApp.getState().setRecording(true);
    useApp.getState().holdMixer(true);
    useApp.getState().setVolume("b", 0.25);
    expect(useApp.getState().automation[0]?.bVol).toBe(0.25);
    useApp.getState().holdMixer(false);
    useApp.getState().holdMixer(false);
    expect(useApp.getState().mixerHolds).toBe(0);
  });

  it("follows a lock only when Use track is on and the fader is not held", () => {
    useApp.getState().setRecording(true);
    useApp.getState().holdMixer(true);
    useApp.getState().setCrossfade(0.1);
    useApp.getState().setStep(4);
    useApp.getState().setMaster(0.2);
    expect(useApp.getState().automation[4]?.crossfade).toBeCloseTo(0.1);
    useApp.getState().holdMixer(false);
    useApp.getState().setRecording(false);
    useApp.getState().setCrossfade(0.8);
    useApp.getState().setFollowMix(false);
    useApp.getState().setStep(4);
    expect(useApp.getState().crossfade).toBeCloseTo(0.8);

    useApp.getState().setFollowMix(true);
    useApp.getState().setStep(4);
    expect(useApp.getState().crossfade).toBeCloseTo(0.1);

    useApp.getState().holdMixer(true);
    useApp.getState().setCrossfade(0.6);
    useApp.getState().setStep(4);
    expect(useApp.getState().crossfade).toBeCloseTo(0.6);
    useApp.getState().holdMixer(false);
    useApp.getState().setStep(-1);
    expect(useApp.getState().step).toBe(-1);
    useApp.getState().setStep(3);
    expect(useApp.getState().step).toBe(3);
  });

  it("writes, recalls, and erases mix steps", () => {
    useApp.getState().focusMixStep(-1);
    useApp.getState().focusMixStep(2);
    expect(useApp.getState().armStep).toBe(2);
    useApp.getState().setRecording(true);
    useApp.getState().setVolume("a", 0.4);
    useApp.getState().focusMixStep(7);
    expect(useApp.getState().automation[7]?.aVol).toBeCloseTo(0.4);
    useApp.getState().setRecording(false);
    useApp.getState().setPlaying(false);
    useApp.getState().setFollowMix(true);
    useApp.getState().setVolume("a", 1);
    useApp.getState().focusMixStep(7);
    expect(useApp.getState().decks.a.volume).toBeCloseTo(0.4);
    useApp.getState().eraseMixStep(1);
    useApp.getState().eraseMixStep(7);
    expect(useApp.getState().automation[7]).toBeNull();
    useApp.getState().setRecording(true);
    useApp.getState().focusMixStep(8);
    useApp.getState().clearAutomation();
    expect(useApp.getState().automation.every((frame) => frame === null)).toBe(true);
  });

  it("round-trips a project and still reads the old single-engine save", () => {
    useApp.getState().setBpm(100);
    useApp.getState().setEngine("b", "snare", "physical");
    persistState(useApp.getState());
    useApp.setState(useApp.getInitialState(), true);
    const saved = loadSaved();
    expect(saved?.bpm).toBe(100);
    expect(saved?.decks?.b.engines.snare).toBe("physical");
    useApp.setState(saved!);

    localStorage.setItem(
      "twinline-v1",
      JSON.stringify({
        bpm: 90,
        crossfade: 0.2,
        master: 0.5,
        followMix: true,
        decks: {
          a: { engine: "granular", swing: 0.4, steps: patternAmber(), mute: { kick: true } },
          b: { steps: emptySteps() },
        },
        automation: Array.from({ length: 16 }, () => null),
      }),
    );
    const legacy = loadSaved();
    expect(legacy?.decks?.a.engines.kick).toBe("granular");
    expect(legacy?.decks?.a.mute.kick).toBe(true);
    expect(legacy?.followMix).toBe(true);
    expect(legacy?.bpm).toBe(90);

    localStorage.setItem("twinline-v1", "{");
    expect(loadSaved()).toBeNull();
    localStorage.setItem("twinline-v1", JSON.stringify({ bpm: "fast", decks: { a: { patches: { sample: { kick: { a: 0.2 } } } } } }));
    expect(loadSaved()?.decks?.a.engines.kick).toBe("sample");

    expect(importProject("not json")).toBe(false);
    expect(importProject("null")).toBe(false);
    expect(
      importProject(
        JSON.stringify({
          bpm: 111,
          followMix: true,
          decks: { a: { engine: "fm", steps: patternAmber() }, b: { engine: "sample" } },
        }),
      ),
    ).toBe(true);
    expect(useApp.getState().bpm).toBe(111);
    expect(useApp.getState().decks.a.engines.hat).toBe("fm");
    expect(useApp.getState().history).toEqual([]);
  });

  it("downloads the current booth as JSON", () => {
    const clicks: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:twinline");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    useApp.getState().setBpm(132);
    downloadProject();
    expect(clicks).toEqual(["twinline.json"]);
  });

  it("resets and jitters a voice patch and forgets history past 24 takes", () => {
    const original = useApp.getState().decks.a.patches.sample.kick.a;
    useApp.getState().setPatch("a", "sample", "kick", "a", 0.1);
    useApp.getState().resetVoice("a", "sample", "kick");
    expect(useApp.getState().decks.a.patches.sample.kick.a).toBe(original);
    useApp.getState().jitterVoice("a", "fm", "snare");
    expect(useApp.getState().decks.a.patches.fm.snare.level).toBeGreaterThanOrEqual(0);

    for (let i = 0; i < 30; i++) useApp.getState().clearDeck("a");
    expect(useApp.getState().history.length).toBeLessThanOrEqual(24);
    useApp.getState().setMobilePane("mix");
    useApp.getState().openSynth("b");
    useApp.getState().closeSynth();
    useApp.getState().setPlaying(true);
    useApp.getState().setArmed(true);
    expect(useApp.getState().snapshot().decks.b.engines.kick).toBe("fm");
  });

  it("rejects a broken save and keeps a partial one inside range", () => {
    const messy = {
      bpm: "fast",
      crossfade: -2,
      master: 3,
      followMix: "yes",
      decks: {
        a: null,
        b: {
          swing: "wide",
          volume: 2,
          eqLow: -1,
          eqMid: "no",
          eqHigh: 0.2,
          filter: 0.3,
          steps: { kick: [true] },
          mute: "no",
          engines: { kick: "nope", hat: "physical" },
          engine: "granular",
          patches: {
            sample: null,
            fm: {
              kick: { a: 2, b: 0, c: 0, d: 0, e: 0, level: -1 },
              snare: { a: Number.NaN, b: 0, c: 0, d: 0, e: 0, level: 0 },
            },
          },
        },
      },
      automation: Array.from({ length: 16 }, (_, index) => {
        if (index === 0) {
          return {
            aVol: 2,
            bVol: 0,
            aLo: 0,
            aMid: 0,
            aHi: 0,
            aFlt: 0,
            bLo: 0,
            bMid: 0,
            bHi: 0,
            bFlt: 0,
            crossfade: -1,
            master: 0.5,
          };
        }
        if (index === 1) return { bad: true };
        if (index === 2) return { aVol: Number.POSITIVE_INFINITY };
        return null;
      }),
    };
    localStorage.setItem("twinline-v1", JSON.stringify(messy));
    const saved = loadSaved();
    expect(saved?.bpm).toBeUndefined();
    expect(saved?.crossfade).toBe(0);
    expect(saved?.master).toBe(1);
    expect(saved?.followMix).toBe(false);
    expect(saved?.decks?.a.engines.kick).toBe("sample");
    expect(saved?.decks?.b.engines.hat).toBe("physical");
    expect(saved?.decks?.b.engines.kick).toBe("fm");
    expect(saved?.decks?.b.volume).toBe(1);
    expect(saved?.decks?.b.eqLow).toBe(0);
    expect(saved?.automation?.[0]?.aVol).toBe(1);
    expect(saved?.automation?.[0]?.crossfade).toBe(0);
    expect(saved?.automation?.[1]).toBeNull();
    expect(saved?.automation?.[2]).toBeNull();

    localStorage.setItem(
      "twinline-v1",
      JSON.stringify({ decks: { a: { engines: { kick: "later" }, engine: "granular" } }, automation: [null] }),
    );
    expect(loadSaved()?.decks?.a.engines.kick).toBe("granular");
    localStorage.setItem("twinline-v1", JSON.stringify({ decks: { b: { mute: { snare: "yes", hat: false } } } }));
    expect(loadSaved()?.decks?.b.mute.hat).toBe(false);
    expect(loadSaved()?.decks?.b.mute.snare).toBe(false);

    expect(importProject(JSON.stringify(messy))).toBe(true);
    expect(useApp.getState().decks.b.patches.fm.kick.a).toBe(1);
    expect(useApp.getState().followMix).toBe(false);

    useApp.getState().setRecording(true);
    useApp.getState().focusMixStep(1);
    useApp.getState().setRecording(false);
    useApp.getState().setFollowMix(true);
    useApp.getState().setPlaying(true);
    useApp.getState().setVolume("a", 0.2);
    useApp.getState().focusMixStep(1);
    expect(useApp.getState().decks.a.volume).toBeCloseTo(0.2);
    expect(useApp.getState().armStep).toBe(1);
  });

  it("does nothing with storage when there is no window", () => {
    const savedWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(loadSaved()).toBeNull();
    persistState(useApp.getState());
    Object.defineProperty(globalThis, "window", { configurable: true, value: savedWindow });
  });
});
