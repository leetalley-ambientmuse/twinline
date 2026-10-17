import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Fader, Knob, Slider } from "@/components/controls";

describe("controls", () => {
  it("drags, nudges, and resets a knob", () => {
    const values: number[] = [];
    const { rerender } = render(
      <Knob label="Pitch" value={0.5} size="sm" readout="mid" onChange={(value) => values.push(value)} />,
    );
    const knob = screen.getByRole("slider", { name: "Pitch" });
    expect(knob.getAttribute("data-size")).toBe("sm");
    expect(screen.getByText("mid")).toBeTruthy();

    fireEvent.keyDown(knob, { key: "End" });
    fireEvent.keyDown(knob, { key: "ArrowUp" });
    fireEvent.keyDown(knob, { key: "ArrowLeft", shiftKey: true });
    fireEvent.pointerMove(knob, { clientY: 10, pointerId: 1 });
    fireEvent.pointerDown(knob, { clientY: 20, pointerId: 1 });
    const capture = HTMLElement.prototype.hasPointerCapture;
    HTMLElement.prototype.hasPointerCapture = () => false;
    fireEvent.pointerMove(knob, { clientY: 40, pointerId: 1 });
    HTMLElement.prototype.hasPointerCapture = () => true;
    fireEvent.pointerMove(knob, { clientY: 0, pointerId: 1, shiftKey: true });
    fireEvent.pointerUp(knob);
    fireEvent.doubleClick(knob);
    expect(values.length).toBeGreaterThan(0);

    rerender(<Knob label="Pitch" value={0.2} defaultValue={0.4} onChange={(value) => values.push(value)} />);
    fireEvent.doubleClick(screen.getByRole("slider", { name: "Pitch" }));
    expect(values.at(-1)).toBe(0.4);
    HTMLElement.prototype.hasPointerCapture = capture;
  });

  it("holds a slider, shows a suffix, and prints values above one", () => {
    const held: boolean[] = [];
    const values: number[] = [];
    render(
      <Slider
        label="Tempo"
        value={120}
        min={70}
        max={180}
        step={1}
        suffix="bpm"
        onHold={(next) => held.push(next)}
        onChange={(value) => values.push(value)}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Tempo" });
    expect(screen.getByText("bpm")).toBeTruthy();
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.change(slider, { target: { value: "140" } });
    fireEvent.pointerUp(slider);
    fireEvent.pointerUp(slider);
    fireEvent.pointerCancel(slider);
    expect(held).toEqual([true, false]);
    expect(values).toEqual([140]);

    render(<Slider label="Wide" value={4} min={0} max={10} onChange={() => {}} />);
    expect(screen.getByText("4")).toBeTruthy();
    render(<Slider label="Bare" value={0.25} onChange={() => {}} />);
    expect(screen.getByText("25")).toBeTruthy();
  });

  it("moves a fader from the pointer and the keyboard", () => {
    const values: number[] = [];
    const held: boolean[] = [];
    Element.prototype.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 40,
        bottom: 100,
        width: 40,
        height: 100,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    render(
      <Fader label="A" value={0.5} onHold={(next) => held.push(next)} onChange={(value) => values.push(value)} />,
    );
    const fader = screen.getByRole("slider", { name: "A" });
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = (() => null) as unknown as typeof rect;
    fireEvent.pointerDown(fader, { clientY: 10, pointerId: 2 });
    Element.prototype.getBoundingClientRect = rect;
    fireEvent.pointerDown(fader, { clientY: 25, pointerId: 2 });
    fireEvent.pointerDown(fader, { clientY: 25, pointerId: 2 });
    const capture = HTMLElement.prototype.hasPointerCapture;
    HTMLElement.prototype.hasPointerCapture = () => false;
    fireEvent.pointerMove(fader, { clientY: 80, pointerId: 2 });
    HTMLElement.prototype.hasPointerCapture = () => true;
    fireEvent.pointerMove(fader, { clientY: 80, pointerId: 2 });
    fireEvent.pointerUp(fader);
    fireEvent.pointerCancel(fader);
    fireEvent.keyDown(fader, { key: "Home" });
    fireEvent.keyDown(fader, { key: "ArrowDown" });
    fireEvent.keyDown(fader, { key: "ArrowRight" });
    expect(values.length).toBeGreaterThan(1);
    expect(held[0]).toBe(true);
    expect(held).toContain(false);
    HTMLElement.prototype.hasPointerCapture = capture;

    render(<Fader label="Dry" value={0.5} onChange={() => {}} />);
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Dry" }), { clientY: 10, pointerId: 3 });
  });
});
