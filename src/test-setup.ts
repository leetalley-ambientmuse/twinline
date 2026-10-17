import { OfflineAudioContext as NodeOfflineAudioContext } from "node-web-audio-api";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

globalThis.OfflineAudioContext = NodeOfflineAudioContext as unknown as typeof OfflineAudioContext;

const memory = new Map<string, string>();

const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => {
    memory.clear();
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

const canvas2d = {
  setTransform: () => {},
  clearRect: () => {},
  beginPath: () => {},
  arc: () => {},
  fill: () => {},
  stroke: () => {},
  moveTo: () => {},
  lineTo: () => {},
  globalAlpha: 1,
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
};

if (typeof HTMLCanvasElement !== "undefined" && !HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => canvas2d) as unknown as HTMLCanvasElement["getContext"];
}

if (typeof HTMLElement !== "undefined") {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => true;
}

afterEach(() => {
  cleanup();
  memory.clear();
});
