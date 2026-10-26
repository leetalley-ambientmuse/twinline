import { useApp, type NiftyStep } from "@/lib/store";
import type { MidiPulse } from "@/lib/audio/engine";

export type MidiView = {
  ready: boolean;
  error: string;
  port1: string;
  port2: string;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let access: MIDIAccess | null = null;
let audio: AudioContext | null = null;
let midiError = "";
const listeners = new Set<() => void>();

export function noteName(note: number): string {
  const midi = Math.round(note);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${Math.floor(midi / 12) - 1}`;
}

export function messagesForStep(
  lanes: NiftyStep[][],
  step: number,
  stepDur: number,
): { data: number[]; at: number }[] {
  const clock = stepDur / 6;
  const messages = Array.from({ length: 6 }, (_, index) => ({ data: [0xf8], at: index * clock }));
  lanes.forEach((lane, channel) => {
    const cell = lane[step];
    if (!cell?.on) return;
    const note = Math.max(0, Math.min(127, Math.round(cell.note)));
    messages.push({ data: [0x90 | (channel & 0x0f), note, 104], at: 0 });
    messages.push({ data: [0x80 | (channel & 0x0f), note, 0], at: clock * 4 });
  });
  return messages;
}

export function bindMidiClock(ctx: AudioContext): void {
  audio = ctx;
}

export function subscribeMidi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function listOutputs(): MIDIOutput[] {
  if (!access) return [];
  return [...access.outputs.values()];
}

function isCre8(port: MIDIOutput): boolean {
  return /cre8|nifty/i.test(`${port.manufacturer || ""} ${port.name || ""}`);
}

function portNumber(port: MIDIOutput): number {
  const name = port.name || "";
  const marked = name.match(/(?:port|midi|out)\s*([12])\b/i);
  if (marked) return Number(marked[1]);
  const trailing = name.match(/\b([12])\s*$/);
  return trailing ? Number(trailing[1]) : 9;
}

function cre8Ports(): MIDIOutput[] {
  return listOutputs()
    .filter(isCre8)
    .sort((a, b) => portNumber(a) - portNumber(b) || (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
}

type Wire = {
  clock: MIDIOutput[];
  lanes: [MIDIOutput | null, MIDIOutput | null];
  channels: [number, number];
  port1: string;
  port2: string;
};

function unique(ports: MIDIOutput[]): MIDIOutput[] {
  const seen = new Set<string>();
  return ports.filter((port) => {
    if (seen.has(port.id)) return false;
    seen.add(port.id);
    return true;
  });
}

function wire(): Wire {
  const ports = cre8Ports();
  if (ports.length >= 2) {
    const first = ports.find((port) => portNumber(port) === 1) || ports[0];
    const second = ports.find((port) => port !== first && portNumber(port) === 2) || ports.find((port) => port !== first) || ports[1];
    return {
      clock: unique([first, second]),
      lanes: [first, second],
      channels: [0, 0],
      port1: first.name || "Cre8audio port 1",
      port2: second.name || "Cre8audio port 2",
    };
  }
  if (ports.length === 1) {
    const name = ports[0].name || "Cre8audio";
    return {
      clock: [ports[0]],
      lanes: [ports[0], ports[0]],
      channels: [0, 1],
      port1: `${name} port 1`,
      port2: `${name} port 2`,
    };
  }
  return { clock: [], lanes: [null, null], channels: [0, 1], port1: "", port2: "" };
}

export function midiSnapshot(): MidiView {
  const routed = wire();
  return { ready: Boolean(access), error: midiError, port1: routed.port1, port2: routed.port2 };
}

function sendNow(ports: MIDIOutput[], data: number[]): void {
  for (const port of ports) {
    try {
      port.send(data);
    } catch {
      /* unplugged */
    }
  }
}

function sendAt(ports: MIDIOutput[], data: number[], audioTime: number): void {
  const when = audio ? performance.now() + (audioTime - audio.currentTime) * 1000 : performance.now();
  for (const port of ports) {
    try {
      port.send(data, when);
    } catch {
      /* unplugged */
    }
  }
}

export async function requestMidi(): Promise<void> {
  if (!navigator.requestMIDIAccess) {
    midiError = "Chrome did not expose MIDI.";
    emit();
    return;
  }
  try {
    access = await navigator.requestMIDIAccess();
    midiError = "";
    access.onstatechange = () => emit();
  } catch {
    midiError = "MIDI permission was blocked.";
    access = null;
  }
  emit();
}

export const niftyPulse: MidiPulse = {
  play(audioTime) {
    sendAt(wire().clock, [0xfa], audioTime);
  },
  halt() {
    const routed = wire();
    sendNow(routed.clock, [0xfc]);
    routed.lanes.forEach((port, index) => {
      if (!port) return;
      sendNow([port], [0xb0 | routed.channels[index], 123, 0]);
    });
  },
  step(step, audioTime, stepDur) {
    const routed = wire();
    const clock = stepDur / 6;
    for (let index = 0; index < 6; index += 1) sendAt(routed.clock, [0xf8], audioTime + index * clock);
    const lanes = useApp.getState().nifty;
    lanes.forEach((lane, index) => {
      const port = routed.lanes[index];
      const cell = lane[step];
      if (!port || !cell?.on) return;
      const note = Math.max(0, Math.min(127, Math.round(cell.note)));
      const channel = routed.channels[index] & 0x0f;
      sendAt([port], [0x90 | channel, note, 104], audioTime);
      sendAt([port], [0x80 | channel, note, 0], audioTime + clock * 4);
    });
  },
};
