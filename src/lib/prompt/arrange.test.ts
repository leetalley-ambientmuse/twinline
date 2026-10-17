import { describe, expect, it } from "vitest";
import { mixCaption, parseArrangement } from "@/lib/prompt/arrange";

const score = {
  title: "Night market",
  blurb: "A dry kit against a granular answer.",
  bpm: 118,
  a: {
    role: "Dry foundation",
    swing: 12,
    kick: { engine: "sample", grid: "x---x---x---x---", mute: false, a: 46, b: 40, c: 35, d: 10, e: 62, level: 90 },
    snare: { engine: "sample", grid: "----x-------x---", mute: false, a: 50, b: 36, c: 55, d: 20, e: 40, level: 74 },
    hat: { engine: "fm", grid: "--x---x---x---x-", mute: false, a: 58, b: 18, c: 70, d: 30, e: 20, level: 42 },
    perc: { engine: "physical", grid: "-------x-------x", mute: false, a: 52, b: 30, c: 48, d: 40, e: 10, level: 50 },
  },
  b: {
    role: "Cloud answer",
    swing: 0,
    engine: "granular",
    kick: { grid: "----------------", mute: true, a: 40, b: 50, c: 40, d: 20, e: 10, level: 0 },
    snare: { grid: "--------x-------", a: 50, b: 40, c: 60, d: 30, e: 20, level: 60 },
    hat: { grid: "x-x-x-x-x-x-x-x-", a: 60, b: 20, c: 70, d: 40, e: 30, level: 40 },
    perc: { grid: "--x---------x---", a: 48, b: 36, c: 44, d: 28, e: 16, level: 55 },
  },
  mix: {
    follow: true,
    master: [78, 78],
    cross: [30, 70],
    aVol: [84, 60],
    bVol: [40, 86],
    aFilter: [40, 70],
    bFilter: [30, 55],
  },
};

describe("prompt arrangement", () => {
  it("parses a score into both machines", () => {
    const parsed = parseArrangement(score);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.track.title).toBe("Night market");
    expect(parsed.track.bpm).toBe(118);
    expect(parsed.track.followMix).toBe(true);
    expect(parsed.track.decks.a.steps.kick.filter(Boolean)).toHaveLength(4);
    expect(parsed.track.decks.a.engines.hat).toBe("fm");
    expect(parsed.track.decks.b.engines.hat).toBe("granular");
    expect(parsed.track.decks.b.mute.kick).toBe(true);
    expect(parsed.track.automation).toHaveLength(16);
    expect(parsed.track.automation[15].crossfade).toBeGreaterThan(parsed.track.automation[0].crossfade);
    expect(mixCaption(parsed.track)).toMatch(/Use track turns on/);
  });

  it("rejects a score with no machines", () => {
    expect(parseArrangement({ title: "Empty", bpm: 100 }).ok).toBe(false);
  });
});
