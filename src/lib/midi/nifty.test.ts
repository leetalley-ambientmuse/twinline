import { describe, expect, it } from "vitest";
import { defaultNifty, useApp } from "@/lib/store";
import { messagesForStep, noteName } from "@/lib/midi/nifty";

describe("cre8audio lanes", () => {
  it("names notes and builds clock plus two gates", () => {
    expect(noteName(36)).toBe("C2");
    expect(noteName(67)).toBe("G4");
    const lanes = defaultNifty();
    const messages = messagesForStep(lanes, 0, 0.12);
    expect(messages.filter((message) => message.data[0] === 0xf8)).toHaveLength(6);
    expect(messages.find((message) => message.data[0] === 0x90)?.data[1]).toBe(36);
    expect(messages.some((message) => message.data[0] === 0x91)).toBe(false);
    const later = messagesForStep(lanes, 2, 0.12);
    expect(later.find((message) => message.data[0] === 0x91)?.data[1]).toBe(55);
  });

  it("toggles a step, nudges the note, and clears the lane", () => {
    useApp.getState().toggleNifty(0, 1);
    expect(useApp.getState().nifty[0][1].on).toBe(true);
    useApp.getState().setNiftyNote(0, 1, 200);
    expect(useApp.getState().nifty[0][1].note).toBe(108);
    useApp.getState().setNiftyNote(0, 1, 3);
    expect(useApp.getState().nifty[0][1].note).toBe(24);
    useApp.getState().clearNifty(0);
    expect(useApp.getState().nifty[0].every((step) => !step.on)).toBe(true);
    useApp.getState().toggleNifty(0, 40);
    expect(useApp.getState().nifty[0][0].on).toBe(false);
  });
});
