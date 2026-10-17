import { describe, expect, it } from "vitest";
import { VOICES, type VoiceId } from "@/lib/audio/model";
import { renderNoise, renderTexture, renderVoice } from "@/lib/audio/samples";

function energy(data: Float32Array): number {
  let sum = 0;
  for (const sample of data) sum += sample * sample;
  return Math.sqrt(sum / data.length);
}

describe("rendered drums", () => {
  it("renders a finite one-shot and a texture for every voice", () => {
    for (const voice of VOICES) {
      const hit = renderVoice(voice, 8000);
      const cloud = renderTexture(voice, 8000);
      expect(hit.length).toBeGreaterThan(100);
      expect(cloud.length).toBeGreaterThan(hit.length);
      expect(energy(hit)).toBeGreaterThan(0.01);
      expect(energy(cloud)).toBeGreaterThan(0.01);
      expect(hit.every((sample) => Number.isFinite(sample))).toBe(true);
    }
    expect(renderVoice("tom" as VoiceId, 8000).length).toBeGreaterThan(100);
  });

  it("renders noise for the requested duration", () => {
    const noise = renderNoise(4000, 0.25);
    expect(noise.length).toBe(1000);
    expect(energy(noise)).toBeGreaterThan(0.2);
    expect(renderNoise(1000).length).toBe(1000);
  });
});

