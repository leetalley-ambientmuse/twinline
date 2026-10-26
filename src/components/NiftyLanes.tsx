import { useEffect, useState } from "react";
import { midiSnapshot, noteName, requestMidi, subscribeMidi } from "@/lib/midi/nifty";
import { useApp } from "@/lib/store";

const LANES = [
  { title: "CV 1", hint: "Cre8audio port 1" },
  { title: "CV 2", hint: "Cre8audio port 2" },
] as const;

function openBooth(): void {
  window.open(window.location.href, "_blank", "noopener,noreferrer");
}

export function NiftyLanes() {
  const nifty = useApp((state) => state.nifty);
  const step = useApp((state) => state.step);
  const toggleNifty = useApp((state) => state.toggleNifty);
  const setNiftyNote = useApp((state) => state.setNiftyNote);
  const clearNifty = useApp((state) => state.clearNifty);
  const [pick, setPick] = useState<[number, number]>([0, 0]);
  const [view, setView] = useState(() => midiSnapshot());
  const embedded = typeof window !== "undefined" && window.self !== window.top;

  useEffect(() => subscribeMidi(() => setView(midiSnapshot())), []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Cre8audio</p>
          <p className="font-mono text-xs text-cream">MIDI clock · two CV lanes</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-full border border-line bg-ink px-3 text-sm"
            onClick={openBooth}
          >
            Open window
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-3 text-sm"
            style={view.ready ? { background: "var(--color-cyan)", color: "var(--color-ink)" } : undefined}
            onClick={() => void requestMidi()}
          >
            {view.ready ? "MIDI on" : "Connect MIDI"}
          </button>
        </div>
      </div>
      {LANES.map((lane, laneIndex) => {
        const id = laneIndex as 0 | 1;
        const accent = id === 0 ? "deck-a" : "deck-b";
        return (
          <div key={lane.title} className={`${accent} flex flex-col gap-2`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs tracking-widest uppercase" style={{ color: "var(--deck)" }}>
                  {lane.title}
                </p>
                <p className="font-mono text-xs text-muted">{id === 0 ? view.port1 || lane.hint : view.port2 || lane.hint}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-full border border-line bg-ink text-sm"
                  aria-label={`${lane.title} lower note`}
                  onClick={() => setNiftyNote(id, pick[id], nifty[id][pick[id]].note - 1)}
                >
                  −
                </button>
                <span className="min-w-10 text-center font-mono text-sm">{noteName(nifty[id][pick[id]].note)}</span>
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-full border border-line bg-ink text-sm"
                  aria-label={`${lane.title} raise note`}
                  onClick={() => setNiftyNote(id, pick[id], nifty[id][pick[id]].note + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-ink px-3 text-sm"
                  onClick={() => clearNifty(id)}
                >
                  Clear {lane.title}
                </button>
              </div>
            </div>
            <div className="step-grid">
              {nifty[id].map((cell, index) => (
                <button
                  key={index}
                  type="button"
                  className="step nifty-step"
                  data-on={cell.on ? "1" : "0"}
                  data-play={step === index ? "1" : "0"}
                  data-bar={index % 4 === 0 ? "1" : "0"}
                  data-arm={pick[id] === index ? "1" : "0"}
                  aria-pressed={cell.on}
                  aria-label={`${lane.title} step ${index + 1}, ${noteName(cell.note)}, ${cell.on ? "on" : "off"}`}
                  onClick={() => {
                    setPick((current) => {
                      const next: [number, number] = [current[0], current[1]];
                      next[id] = index;
                      return next;
                    });
                    toggleNifty(id, index);
                  }}
                >
                  {noteName(cell.note)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">
        {view.error
          ? view.error
          : embedded
            ? "Open window first. Chrome only asks for the Cre8audio interface on that page, then press Play."
            : view.ready && (view.port1 || view.port2)
              ? `Hardwired. CV 1 goes to ${view.port1}. CV 2 goes to ${view.port2}. Clock goes with them.`
              : view.ready
                ? "MIDI is on, but Chrome does not see a Cre8audio port yet."
                : "Press Play. CV 1 is hardwired to Cre8audio port 1 and CV 2 to port 2."}
      </p>
    </div>
  );
}
