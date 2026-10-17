import { useEffect, useRef } from "react";
import { Circle, Eraser } from "lucide-react";
import { useApp, type MixFrame } from "@/lib/store";
import { Fader, Slider } from "@/components/controls";
import { useRack } from "@/components/rack-context";
import type { DeckId } from "@/lib/audio/model";

function ChannelEq({ deckId, onHold }: { deckId: DeckId; onHold: (held: boolean) => void }) {
  const eqLow = useApp((state) => state.decks[deckId].eqLow);
  const eqMid = useApp((state) => state.decks[deckId].eqMid);
  const eqHigh = useApp((state) => state.decks[deckId].eqHigh);
  const filter = useApp((state) => state.decks[deckId].filter);
  const setEq = useApp((state) => state.setEq);
  const accent = deckId === "a" ? "deck-a" : "deck-b";
  const name = deckId === "a" ? "Amber" : "Lacquer";

  return (
    <div className={accent}>
      <p className="mb-1 text-xs tracking-widest uppercase" style={{ color: "var(--deck)" }}>
        {name}
      </p>
      <Slider label="Hi" value={eqHigh} onHold={onHold} onChange={(value) => setEq(deckId, "eqHigh", value)} />
      <Slider label="Mid" value={eqMid} onHold={onHold} onChange={(value) => setEq(deckId, "eqMid", value)} />
      <Slider label="Lo" value={eqLow} onHold={onHold} onChange={(value) => setEq(deckId, "eqLow", value)} />
      <Slider label="Flt" value={filter} onHold={onHold} onChange={(value) => setEq(deckId, "filter", value)} />
    </div>
  );
}

function Meter() {
  const ref = useRef<HTMLDivElement>(null);
  const { readLevel } = useRack();

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const host = ref.current;
      if (!host) return;
      const level = readLevel();
      const lit = Math.round(level * host.children.length);
      for (let i = 0; i < host.children.length; i++) {
        const seg = host.children[i] as HTMLElement;
        const fromTop = host.children.length - 1 - i;
        seg.dataset.on = fromTop < lit ? "1" : "0";
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [readLevel]);

  return (
    <div ref={ref} className="flex h-44 w-3 flex-col gap-1" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index} className="meter-seg" data-hot={index < 2 ? "1" : "0"} data-on="0" />
      ))}
    </div>
  );
}

export function Mixer() {
  const volumeA = useApp((state) => state.decks.a.volume);
  const volumeB = useApp((state) => state.decks.b.volume);
  const setVolume = useApp((state) => state.setVolume);
  const crossfade = useApp((state) => state.crossfade);
  const setCrossfade = useApp((state) => state.setCrossfade);
  const master = useApp((state) => state.master);
  const setMaster = useApp((state) => state.setMaster);
  const holdMixer = useApp((state) => state.holdMixer);

  return (
    <section className="panel flex flex-col gap-4 p-3 sm:p-4">
      <header>
        <p className="text-xs tracking-widest text-muted uppercase">Booth</p>
        <h2 className="text-xl font-semibold tracking-tight">Mixer</h2>
      </header>
      <div className="flex items-stretch justify-center gap-3">
        <div className="deck-a">
          <Fader label="A" value={volumeA} onHold={holdMixer} onChange={(value) => setVolume("a", value)} />
        </div>
        <Meter />
        <div className="deck-b">
          <Fader label="B" value={volumeB} onHold={holdMixer} onChange={(value) => setVolume("b", value)} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ChannelEq deckId="a" onHold={holdMixer} />
        <div>
          <Slider label="X-fade" value={crossfade} onHold={holdMixer} onChange={setCrossfade} />
          <div className="flex justify-between px-12 text-xs tracking-widest uppercase">
            <span className="text-amber">A</span>
            <span className="text-lacquer">B</span>
          </div>
        </div>
        <ChannelEq deckId="b" onHold={holdMixer} />
      </div>
      <Slider label="Main" value={master} onHold={holdMixer} onChange={setMaster} />
      <div className="lg:hidden">
        <MixTrack />
      </div>
    </section>
  );
}

export function MixTrack() {
  const automation = useApp((state) => state.automation);
  const step = useApp((state) => state.step);
  const armStep = useApp((state) => state.armStep);
  const recording = useApp((state) => state.recording);
  const setRecording = useApp((state) => state.setRecording);
  const focusMixStep = useApp((state) => state.focusMixStep);
  const clearAutomation = useApp((state) => state.clearAutomation);
  const eraseMixStep = useApp((state) => state.eraseMixStep);
  const locks = automation.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Mix track</p>
          <p className="font-mono text-xs text-cream">{locks} locks</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm"
            style={recording ? { background: "var(--color-lacquer)", color: "var(--color-cream)" } : undefined}
            aria-pressed={recording}
            onClick={() => setRecording(!recording)}
          >
            <Circle className={recording ? "size-3 fill-current" : "size-3"} />
            Record
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-ink px-3 text-sm"
            onClick={() => eraseMixStep(step >= 0 ? step : armStep)}
          >
            <Eraser className="size-4" />
            Erase
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line bg-ink px-3 text-sm"
            onClick={clearAutomation}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="step-grid">
        {automation.map((frame, index) => (
          <button
            key={index}
            type="button"
            className="step mix-cell"
            data-on={frame ? "1" : "0"}
            data-play={step === index ? "1" : "0"}
            data-arm={!recording && armStep === index ? "1" : "0"}
            aria-pressed={Boolean(frame)}
            aria-label={`Mix step ${index + 1}${frame ? ", locked" : ""}`}
            onClick={() => focusMixStep(index)}
          >
            {frame ? <MixGlyph frame={frame} /> : null}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        Record while playing. A held fader prints onto each step the playhead crosses. Empty steps hold the last lock.
      </p>
    </div>
  );
}

function MixGlyph({ frame }: { frame: MixFrame }) {
  return (
    <span className="mix-glyph" aria-hidden="true">
      <span className="mix-a" style={{ height: `${Math.max(8, Math.round(frame.aVol * 100))}%` }} />
      <span className="mix-b" style={{ height: `${Math.max(8, Math.round(frame.bVol * 100))}%` }} />
      <span className="mix-x" style={{ left: `${frame.crossfade * 100}%` }} />
    </span>
  );
}
