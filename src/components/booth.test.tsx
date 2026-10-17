import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@/lib/brand";
import { useApp } from "@/lib/store";
import { useRack } from "@/components/rack-context";
import { TwinlineApp } from "@/components/TwinlineApp";

vi.mock("@/lib/audio/engine", () => {
  class Rack {
    ctx = {
      state: "suspended" as string,
      resume: vi.fn(async () => {
        this.ctx.state = "running";
      }),
    };
    start = vi.fn();
    stop = vi.fn();
    sync = vi.fn();
    preview = vi.fn();
    readLevel = vi.fn(() => 0.8);
    bounce = vi.fn(async () => new Blob([Uint8Array.from([82, 73, 70, 70])], { type: "audio/wav" }));
  }
  return { Rack };
});

class FakeAudioContext {
  state = "suspended";
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

function reset() {
  localStorage.clear();
  useApp.setState(useApp.getInitialState(), true);
}

beforeEach(() => {
  reset();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Element.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 80,
      bottom: 160,
      width: 80,
      height: 160,
      toJSON() {
        return {};
      },
    }) as DOMRect;
});

describe("booth", () => {
  it("covers the default rack hook", async () => {
    function Probe() {
      const api = useRack();
      api.arm();
      api.preview("a", "kick");
      api.readLevel();
      void api.bounce(1);
      return <p>probe</p>;
    }
    render(<Probe />);
    expect(screen.getByText("probe")).toBeTruthy();
  });

  it("plays, edits, mixes, and keeps a pattern", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    render(<TwinlineApp />);
    expect(screen.getByRole("heading", { name: APP_NAME })).toBeTruthy();
    expect(screen.getByText(/Press play to arm/)).toBeTruthy();

    const click = (name: string | RegExp, index = 0) => {
      const matches = screen.getAllByRole("button", { name });
      fireEvent.click(matches[index] ?? matches[0]);
    };

    click("Play");
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    fireEvent.keyDown(window, { code: "Space" });
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    click("Faster");
    click("Slower");
    click("Tap");
    click("Tap");

    click("Kick step 1");
    click("Mute Kick");
    click("Unmute Kick");
    click("Clear");
    click("Undo");
    click("Random");
    click("To Lacquer");

    click(/^Sample$/);
    click(/^Hat$/);
    click("Hat");
    click(/FM/);
    click(/^Physical/);
    click(/^Granular/);
    click(/^Sample/);
    click("Hit");
    click("Reset");
    click("Jitter");
    const pitch = screen.getByRole("slider", { name: "Pitch" });
    fireEvent.keyDown(pitch, { key: "ArrowUp" });
    fireEvent.keyDown(pitch, { key: "ArrowLeft" });
    fireEvent.keyDown(pitch, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(pitch, { key: "End" });
    fireEvent.pointerDown(pitch, { clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pitch, { clientY: 40, pointerId: 1, shiftKey: true });
    fireEvent.pointerUp(pitch);
    fireEvent.doubleClick(pitch);
    click("Booth");

    const fader = screen.getByRole("slider", { name: "A" });
    fireEvent.keyDown(fader, { key: "ArrowDown" });
    fireEvent.keyDown(fader, { key: "ArrowUp" });
    fireEvent.pointerDown(fader, { clientY: 10, pointerId: 2 });
    fireEvent.pointerMove(fader, { clientY: 80, pointerId: 2 });
    fireEvent.pointerUp(fader);
    fireEvent.pointerCancel(fader);

    click("Record");
    const hi = screen.getAllByRole("slider", { name: "Hi" })[0];
    fireEvent.pointerDown(hi, { pointerId: 3 });
    fireEvent.pointerUp(hi);
    fireEvent.change(hi, { target: { value: "0.8" } });
    click("Use track");
    click(/Mix step 1/);
    click("Erase");
    const clears = screen.getAllByRole("button", { name: "Clear" });
    fireEvent.click(clears[clears.length - 1]);

    click("Save");
    expect(names).toContain("twinline.json");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify({ bpm: 100, followMix: false, decks: {} })], "twinline.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(useApp.getState().bpm).toBe(100));

    click("Bounce");
    await waitFor(() => expect(names).toContain("twinline.wav"));

    click(/^Mix Cross/);
    click(/^Lacquer/);
    click(/^Amber/);

    const slider = document.createElement("input");
    document.body.appendChild(slider);
    slider.focus();
    fireEvent.keyDown(slider, { code: "Space" });
    slider.remove();

    fireEvent(document, new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    fireEvent(document, new Event("visibilitychange"));
  });
});
