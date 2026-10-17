import { Dices, Eraser, SlidersHorizontal } from "lucide-react";
import { ENGINE_COPY, type DeckId } from "@/lib/audio/model";
import { useApp } from "@/lib/store";
import { Slider } from "@/components/controls";
import { StepGrid } from "@/components/StepGrid";

const NAMES: Record<DeckId, string> = { a: "Amber", b: "Lacquer" };

export function DeckPanel({ deckId }: { deckId: DeckId }) {
  const engine = useApp((state) => state.decks[deckId].engine);
  const swing = useApp((state) => state.decks[deckId].swing);
  const setSwing = useApp((state) => state.setSwing);
  const clearDeck = useApp((state) => state.clearDeck);
  const randomizeDeck = useApp((state) => state.randomizeDeck);
  const openSynth = useApp((state) => state.openSynth);
  const accent = deckId === "a" ? "deck-a" : "deck-b";

  return (
    <section className={`panel ${accent} flex flex-col gap-4 p-3 sm:p-4`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Machine {deckId.toUpperCase()}</p>
          <h2 className="text-xl font-semibold tracking-tight">{NAMES[deckId]}</h2>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-ink px-4 text-sm"
          onClick={() => openSynth(deckId)}
        >
          <SlidersHorizontal className="size-4" style={{ color: "var(--deck)" }} />
          {ENGINE_COPY[engine].label}
        </button>
      </header>
      <StepGrid deckId={deckId} />
      <div className="flex flex-col gap-2">
        <Slider label="Swing" value={swing} onChange={(value) => setSwing(deckId, value)} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-ink text-sm"
            onClick={() => clearDeck(deckId)}
          >
            <Eraser className="size-4" />
            Clear
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-ink text-sm"
            onClick={() => randomizeDeck(deckId)}
          >
            <Dices className="size-4" />
            Random
          </button>
        </div>
      </div>
    </section>
  );
}
