import { useEffect, useRef } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { VOICES, VOICE_LABEL, type DeckId, type VoiceId } from "@/lib/audio/model";
import { useApp } from "@/lib/store";
import { useRack } from "@/components/rack-context";

export function StepGrid({ deckId }: { deckId: DeckId }) {
  const steps = useApp((state) => state.decks[deckId].steps);
  const mute = useApp((state) => state.decks[deckId].mute);
  const playhead = useApp((state) => state.step);
  const setCell = useApp((state) => state.setCell);
  const toggleMute = useApp((state) => state.toggleMute);
  const { preview } = useRack();
  const paint = useRef<boolean | null>(null);

  useEffect(() => {
    const stop = () => {
      paint.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  function paintAt(x: number, y: number, first: boolean) {
    const el = document.elementFromPoint(x, y);
    const pad = el?.closest("[data-pad]") as HTMLElement | null;
    if (!pad || pad.dataset.deck !== deckId) return;
    const voice = pad.dataset.voice as VoiceId;
    const index = Number(pad.dataset.index);
    if (Number.isNaN(index)) return;
    if (first) {
      paint.current = !useApp.getState().decks[deckId].steps[voice][index];
    }
    if (paint.current === null) return;
    setCell(deckId, voice, index, paint.current);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="hidden lg:grid lg:grid-cols-[7.5rem_minmax(0,1fr)] lg:gap-2">
        <span />
        <div className="led-row" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <span key={index} className="led" data-on={playhead === index ? "1" : "0"} />
          ))}
        </div>
      </div>
      {VOICES.map((voice) => (
        <div key={voice} className="grid grid-cols-1 gap-1 lg:grid-cols-[7.5rem_minmax(0,1fr)] lg:items-center lg:gap-2">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              className="min-h-11 flex-1 text-left text-xs font-medium tracking-widest uppercase"
              onPointerDown={() => preview(deckId, voice)}
            >
              {VOICE_LABEL[voice]}
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted"
              aria-pressed={mute[voice]}
              aria-label={`${mute[voice] ? "Unmute" : "Mute"} ${VOICE_LABEL[voice]}`}
              onClick={() => toggleMute(deckId, voice)}
            >
              {mute[voice] ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>
          <div
            className="step-grid"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              paintAt(event.clientX, event.clientY, true);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              paintAt(event.clientX, event.clientY, false);
            }}
          >
            {steps[voice].map((on, index) => (
              <button
                key={index}
                type="button"
                data-pad="1"
                data-deck={deckId}
                data-voice={voice}
                data-index={index}
                data-on={on ? "1" : "0"}
                data-bar={index % 4 === 0 ? "1" : "0"}
                data-play={playhead === index ? "1" : "0"}
                className="step"
                aria-pressed={on}
                aria-label={`${VOICE_LABEL[voice]} step ${index + 1}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
