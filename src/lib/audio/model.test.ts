import { describe, expect, it, vi } from "vitest";
import {
  ENGINES,
  VOICES,
  clamp01,
  clonePatches,
  emptySteps,
  modelFm,
  modelGrain,
  modelPhysical,
  modelSample,
  patternAmber,
  patternLacquer,
  randomSteps,
} from "@/lib/audio/model";

describe("patch models", () => {
  it("keeps every knob inside a musically usable range", () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(3)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);

    for (const voice of VOICES) {
      const low = { a: 0, b: 0, c: 0, d: 0, e: 0, level: 0 };
      const high = { a: 1, b: 1, c: 1, d: 1, e: 1, level: 1 };
      const sampleLow = modelSample(voice, low);
      const sampleHigh = modelSample(voice, high);
      expect(sampleHigh.rate).toBeGreaterThan(sampleLow.rate);
      expect(sampleHigh.decay).toBeGreaterThan(sampleLow.decay);
      expect(sampleHigh.cutoff).toBeGreaterThan(sampleLow.cutoff);
      expect(sampleHigh.drive).toBeGreaterThan(sampleLow.drive);
      expect(sampleHigh.gain).toBeGreaterThan(0);

      const fm = modelFm(voice, high);
      expect(fm.freq).toBeGreaterThan(20);
      expect(fm.ratio).toBeGreaterThan(0);
      expect(fm.decay).toBeGreaterThan(fm.modDecay);

      const physical = modelPhysical(voice, high);
      expect(physical.freq).toBeGreaterThan(20);
      expect(physical.strike).toBeGreaterThan(0);
      expect(["membrane", "snare", "cymbal", "mallet"]).toContain(physical.kind);

      const grain = modelGrain(voice, high);
      expect(grain.count).toBeGreaterThanOrEqual(4);
      expect(grain.count).toBeLessThanOrEqual(12);
      expect(grain.grain).toBeGreaterThan(0);
      expect(grain.cloud).toBeGreaterThan(0);
    }
  });

  it("gives the kick a pitch drop and the hat a noise path", () => {
    const kick = modelFm("kick", { a: 0.4, b: 0.6, c: 0.2, d: 0.8, e: 0, level: 0.9 });
    const hat = modelFm("hat", { a: 0.6, b: 0.2, c: 0.7, d: 0.5, e: 1, level: 0.5 });
    const snare = modelFm("snare", { a: 0.5, b: 0.4, c: 0.5, d: 0.4, e: 0, level: 0.7 });
    expect(kick.glide).toBeGreaterThan(1.05);
    expect(snare.glide).toBe(1);
    expect(hat.noise).toBeGreaterThan(kick.noise);
    expect(hat.noiseHp).toBeGreaterThan(700);
  });

  it("ships two different 16-step patterns and a clone of the factory patches", () => {
    for (const pattern of [patternAmber(), patternLacquer(), randomSteps(), emptySteps()]) {
      for (const voice of VOICES) expect(pattern[voice]).toHaveLength(16);
    }
    expect(patternAmber().kick.filter(Boolean).length).toBe(4);
    expect(patternLacquer().snare[14]).toBe(true);
    expect(emptySteps().kick.every((step) => step === false)).toBe(true);
    expect(randomSteps().snare[4]).toBe(true);
    for (let i = 0; i < 40; i++) randomSteps();
    const random = vi.spyOn(Math, "random");
    random.mockReturnValue(0);
    randomSteps();
    random.mockReturnValue(0.99);
    randomSteps();
    random.mockRestore();

    const first = clonePatches();
    first.sample.kick.a = 0;
    expect(clonePatches().sample.kick.a).not.toBe(0);
    expect(ENGINES).toEqual(["sample", "fm", "physical", "granular"]);
  });
});
