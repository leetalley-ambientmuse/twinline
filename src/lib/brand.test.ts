import { describe, expect, it } from "vitest";
import { APP_NAME, APP_TAG } from "@/lib/brand";

describe("brand", () => {
  it("names the booth", () => {
    expect(APP_NAME).toBe("Twinline");
    expect(APP_TAG.length).toBeGreaterThan(0);
  });
});
