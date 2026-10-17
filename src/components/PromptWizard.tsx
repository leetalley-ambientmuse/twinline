import { useEffect, useId, useState } from "react";
import { Wand2 } from "lucide-react";
import { ENGINE_COPY, VOICES, VOICE_LABEL, type VoiceId } from "@/lib/audio/model";
import { mixCaption, type CompiledTrack } from "@/lib/prompt/arrange";
import { composeTrack } from "@/lib/prompt/compose";
import { useApp } from "@/lib/store";
import { useRack } from "@/components/rack-context";

const EXAMPLES = [
  {
    label: "Warehouse",
    prompt:
      "Straight 128 techno. Amber is a dry sample kit: four on the floor, a short clap, offbeat hats. Lacquer is sparse FM percussion and a metallic hat only on the last beat. No swing. Lacquer's filter starts closed and opens across the bar.",
  },
  {
    label: "Half-time",
    prompt:
      "96 bpm half-time. Amber is a dusty sample kit with the kick on 1 and the snare on 3, a little swing. Lacquer is a granular cloud: soft hats and a perc answer in the gaps. Keep Lacquer quieter.",
  },
  {
    label: "Break",
    prompt:
      "Broken electro around 112. Amber uses physical drums, a syncopated kick, and snare ghosts. Lacquer is FM sixteenth hats plus a high clave. Even crossfade, no shuffle.",
  },
  {
    label: "Dub",
    prompt:
      "Slow dub stepper at 78. Amber is a deep FM kick and a dry snare on the backbeat. Lacquer stays mostly quiet except a granular perc splash. Heavy low end, highs pulled back, mix stays on Amber.",
  },
];

export function WizardButton() {
  const setWizardOpen = useApp((state) => state.setWizardOpen);
  return (
    <button
      type="button"
      className="spell-btn inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium"
      onClick={() => setWizardOpen(true)}
    >
      <Wand2 className="size-4" />
      Wizard
    </button>
  );
}

export function PromptWizard() {
  const open = useApp((state) => state.wizardOpen);
  const setWizardOpen = useApp((state) => state.setWizardOpen);
  const applyArrangement = useApp((state) => state.applyArrangement);
  const { arm } = useRack();
  const titleId = useId();
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"write" | "wait" | "score">("write");
  const [error, setError] = useState("");
  const [track, setTrack] = useState<CompiledTrack | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "wait") setWizardOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, setWizardOpen]);

  if (!open) return null;

  async function score() {
    const text = prompt.trim();
    if (text.length < 3 || phase === "wait") return;
    setPhase("wait");
    setError("");
    try {
      const result = await composeTrack({ data: { prompt: text }, signal: AbortSignal.timeout(65000) });
      if (!result.ok) {
        setError(result.error);
        setPhase("write");
        return;
      }
      setTrack(result.track);
      setPhase("score");
    } catch {
      setError("The wizard took too long. Try again.");
      setPhase("write");
    }
  }

  function load() {
    if (!track) return;
    arm();
    applyArrangement(track);
    useApp.getState().setPlaying(true);
    setWizardOpen(false);
  }

  return (
    <div className="wizard-shade" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && phase !== "wait" && setWizardOpen(false)}>
      <div
        className="panel wizard-card text-cream"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-widest text-muted uppercase">Both machines</p>
            <h2 id={titleId} className="display text-lg font-semibold">
              Track wizard
            </h2>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-full border border-line px-4 text-sm disabled:opacity-40"
            disabled={phase === "wait"}
            onClick={() => setWizardOpen(false)}
          >
            Close
          </button>
        </header>

        {phase !== "score" ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-sm text-muted" htmlFor="spell-prompt">
              Describe the groove. Amber carries it. Lacquer answers.
            </label>
            <textarea
              id="spell-prompt"
              className="min-h-32 w-full resize-y rounded-md border border-line bg-ink px-3 py-3 text-base text-cream"
              maxLength={600}
              placeholder="A slow neon break. Amber is dry and swung. Lacquer is a granular cloud on the off-beats."
              value={prompt}
              disabled={phase === "wait"}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void score();
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-ink px-3 text-sm"
                  disabled={phase === "wait"}
                  onClick={() => {
                    setPrompt(example.prompt);
                    setError("");
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted" aria-live="polite">
                {phase === "wait" ? "Scoring Amber and Lacquer…" : error || `${prompt.trim().length}/600`}
              </p>
              <button
                type="button"
                className="play-btn inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium disabled:opacity-40"
                disabled={phase === "wait" || prompt.trim().length < 3}
                onClick={() => void score()}
              >
                {phase === "wait" ? "Scoring" : "Write the track"}
              </button>
            </div>
          </div>
        ) : track ? (
          <ScoreCard
            track={track}
            onBack={() => setPhase("write")}
            onRewrite={() => void score()}
            onLoad={load}
          />
        ) : null}
      </div>
    </div>
  );
}

function ScoreCard({
  track,
  onBack,
  onRewrite,
  onLoad,
}: {
  track: CompiledTrack;
  onBack: () => void;
  onRewrite: () => void;
  onLoad: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <h3 className="display text-base">{track.title}</h3>
        <p className="mt-1 text-sm text-cream">{track.blurb}</p>
        <p className="mt-2 font-mono text-sm text-cyan">{track.bpm} BPM</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DeckScore name="Amber" accent="deck-a" deck={track.decks.a} />
        <DeckScore name="Lacquer" accent="deck-b" deck={track.decks.b} />
      </div>
      <div>
        <p className="text-xs tracking-widest text-muted uppercase">Mix</p>
        <div className="mini-row mt-2" aria-hidden="true">
          {track.automation.map((frame, index) => (
            <span
              key={index}
              className="mini-mix"
              style={{
                background: `color-mix(in oklab, var(--color-lacquer) ${Math.round(frame.crossfade * 100)}%, var(--color-amber))`,
              }}
            />
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">{mixCaption(track)}</p>
      </div>
      <p className="text-sm text-muted">Loading replaces both patterns, the tempo, and the mixer. Undo on each machine restores its previous groove.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onBack}>
          Edit prompt
        </button>
        <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm" onClick={onRewrite}>
          Rewrite
        </button>
        <button type="button" className="play-btn inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium" onClick={onLoad}>
          Load into the booth
        </button>
      </div>
    </div>
  );
}

function DeckScore({
  name,
  accent,
  deck,
}: {
  name: string;
  accent: string;
  deck: CompiledTrack["decks"]["a"];
}) {
  return (
    <section className={`panel ${accent} p-3`}>
      <p className="text-xs tracking-widest text-muted uppercase">{name}</p>
      <h3 className="display text-sm">{deck.role}</h3>
      <p className="mt-1 font-mono text-xs text-muted">Swing {Math.round(deck.swing * 100)}</p>
      <div className="mt-3 flex flex-col gap-2">
        {VOICES.map((voice) => (
          <VoiceRow key={voice} voice={voice} deck={deck} />
        ))}
      </div>
    </section>
  );
}

function VoiceRow({ voice, deck }: { voice: VoiceId; deck: CompiledTrack["decks"]["a"] }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <div>
        <p className="text-xs">{VOICE_LABEL[voice]}</p>
        <p className="text-xs text-muted">{deck.mute[voice] ? "Mute" : ENGINE_COPY[deck.engines[voice]].label}</p>
      </div>
      <div className="mini-row" aria-label={`${VOICE_LABEL[voice]} pattern`}>
        {deck.steps[voice].map((on, index) => (
          <span key={index} className={on && !deck.mute[voice] ? "mini-on" : "mini-off"} />
        ))}
      </div>
    </div>
  );
}
