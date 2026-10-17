import { Copy, Dices, Eraser, SlidersHorizontal, Undo2 } from "lucide-react";
import { ENGINE_COPY, VOICES, type DeckId, type EngineId } from "@/lib/audio/model";
import { useApp } from "@/lib/store";
import { Slider } from "@/components/controls";
import { StepGrid } from "@/components/StepGrid";

const NAMES: Record<DeckId, string> = { a: "Amber", b: "Lacquer" };
const OTHER: Record<DeckId, DeckId> = { a: "b", b: "a" };

function engineLabel(engines: Record<string, EngineId>): string {
  const values = VOICES.map((voice) => engines[voice]);
  if (values.every((engine) => engine === values[0])) return ENGINE_COPY[values[0]].label;
  return "Mixed";
}

export function DeckPanel({ deckId }: { deckId: DeckId }) {
  const engines = useApp((state) => state.decks[deckId].engines);
  const swing = useApp((state) => state.decks[deckId].swing);
  const role = useApp((state) => state.spell?.roles[deckId] ?? "");
  const canUndo = useApp((state) => state.history.some((snap) => snap.deck === deckId));
  const setSwing = useApp((state) => state.setSwing);
  const clearDeck = useApp((state) => state.clearDeck);
  const randomizeDeck = useApp((state) => state.randomizeDeck);
  const undoDeck = useApp((state) => state.undoDeck);
  const copyPattern = useApp((state) => state.copyPattern);
  const openSynth = useApp((state) => state.openSynth);
  const accent = deckId === "a" ? "deck-a" : "deck-b";
  const other = OTHER[deckId];

  return (
    <section className={`panel ${accent} flex flex-col gap-4 p-3 sm:p-4`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Machine {deckId.toUpperCase()}</p>
          <h2 className="display text-xl font-semibold">{NAMES[deckId]}</h2>
          {role ? <p className="mt-1 text-sm text-muted">{role}</p> : null}
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-ink px-4 text-sm"
          onClick={() => openSynth(deckId)}
        >
          <SlidersHorizontal className="size-4" style={{ color: "var(--deck)" }} />
          {engineLabel(engines)}
        </button>
      </header>
      <StepGrid deckId={deckId} />
      <div className="flex flex-col gap-2">
        <Slider label="Swing" value={swing} onChange={(value) => setSwing(deckId, value)} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-ink text-sm disabled:opacity-40"
            disabled={!canUndo}
            onClick={() => undoDeck(deckId)}
          >
            <Undo2 className="size-4" />
            Undo
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-ink text-sm"
            onClick={() => copyPattern(deckId, other)}
          >
            <Copy className="size-4" />
            To {NAMES[other]}
          </button>
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