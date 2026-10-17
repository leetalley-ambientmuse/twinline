import { useCallback, useEffect, useMemo, useRef } from "react";
import { APP_NAME, APP_TAG } from "@/lib/brand";
import { Rack } from "@/lib/audio/engine";
import type { DeckId, VoiceId } from "@/lib/audio/model";
import { loadSaved, persistState, useApp } from "@/lib/store";
import { RackProvider } from "@/components/rack-context";
import { Transport } from "@/components/Transport";
import { DeckPanel } from "@/components/DeckPanel";
import { Mixer, MixTrack } from "@/components/Mixer";
import { SynthView } from "@/components/SynthView";

export function TwinlineApp() {
  const rackRef = useRef<Rack | null>(null);
  const playing = useApp((state) => state.playing);
  const armed = useApp((state) => state.armed);
  const synthDeck = useApp((state) => state.synthDeck);
  const mobilePane = useApp((state) => state.mobilePane);
  const setMobilePane = useApp((state) => state.setMobilePane);

  const arm = useCallback(() => {
    const existing = rackRef.current;
    if (existing) {
      if (existing.ctx.state === "suspended") void existing.ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext;
    const ctx = new AudioCtx({ latencyHint: "interactive" });
    void ctx.resume();
    const rack = new Rack(
      ctx,
      () => useApp.getState().snapshot(),
      (step) => {
        if (useApp.getState().step !== step) useApp.getState().setStep(step);
      },
    );
    rackRef.current = rack;
    useApp.getState().setArmed(true);
  }, []);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) useApp.setState(saved);
    let timer = 0;
    const unsubscribe = useApp.subscribe((state, previous) => {
      const audioChanged =
        state.bpm !== previous.bpm ||
        state.master !== previous.master ||
        state.crossfade !== previous.crossfade ||
        state.decks !== previous.decks;
      const stored =
        audioChanged ||
        state.automation !== previous.automation ||
        state.followMix !== previous.followMix;
      if (!stored) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => persistState(state), 200);
      if (audioChanged) rackRef.current?.sync();
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const rack = rackRef.current;
    if (!rack) return;
    if (playing) rack.start();
    else rack.stop();
  }, [playing, armed]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        const ctx = rackRef.current?.ctx;
        if (ctx && ctx.state === "suspended") void ctx.resume();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("role") === "slider") {
        return;
      }
      event.preventDefault();
      arm();
      useApp.getState().setPlaying(!useApp.getState().playing);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("keydown", onKey);
    };
  }, [arm]);

  const api = useMemo(
    () => ({
      arm,
      preview: (deck: DeckId, voice: VoiceId) => {
        arm();
        rackRef.current?.preview(deck, voice);
      },
      readLevel: () => rackRef.current?.readLevel() ?? 0,
    }),
    [arm],
  );

  return (
    <RackProvider value={api}>
      <div className="night min-h-screen text-cream" onPointerDownCapture={arm}>
        <div className="night-sky" aria-hidden="true">
          <div className="night-sun" />
          <div className="night-grid" />
          <div className="night-scan" />
        </div>
        <div className="relative z-10">
        <header className="chrome-bar flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
              <rect x="2" y="8" width="14" height="14" fill="var(--color-amber)" />
              <rect x="16" y="8" width="14" height="14" fill="var(--color-lacquer)" />
              <path d="M2 26 H30 M16 18 V30" stroke="var(--color-cyan)" strokeWidth="1.2" />
            </svg>
            <div>
              <h1 className="display text-lg leading-none font-semibold">{APP_NAME}</h1>
              <p className="mt-1 text-xs tracking-widest text-muted uppercase">{APP_TAG}</p>
            </div>
          </div>
          <Transport />
        </header>
        {armed ? null : (
          <p className="chrome-bar border-b px-4 py-2 text-sm text-muted">
            Press play to arm the engines. Patterns stay in this browser.
          </p>
        )}
        {synthDeck ? (
          <SynthView deckId={synthDeck} />
        ) : (
          <>
            <div className="booth p-2 pb-24 lg:p-3 lg:pb-4">
              <div className={mobilePane === "a" ? "block" : "hidden lg:block"}>
                <DeckPanel deckId="a" />
              </div>
              <div className={mobilePane === "mix" ? "block" : "hidden lg:block"}>
                <Mixer />
              </div>
              <div className={mobilePane === "b" ? "block" : "hidden lg:block"}>
                <DeckPanel deckId="b" />
              </div>
            </div>
            <section className="panel mx-3 mb-4 hidden p-4 lg:block">
              <MixTrack />
            </section>
            <nav className="chrome-bar fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t lg:hidden">
              <PaneButton
                active={mobilePane === "a"}
                label="Amber"
                hint="Machine A"
                onClick={() => setMobilePane("a")}
              />
              <PaneButton
                active={mobilePane === "mix"}
                label="Mix"
                hint="Crossfader"
                onClick={() => setMobilePane("mix")}
              />
              <PaneButton
                active={mobilePane === "b"}
                label="Lacquer"
                hint="Machine B"
                onClick={() => setMobilePane("b")}
              />
            </nav>
          </>
        )}
        </div>
      </div>
    </RackProvider>
  );
}

function PaneButton({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className="min-h-14 px-2"
      style={active ? { boxShadow: "inset 0 -2px 0 var(--color-cyan)", color: "var(--color-cyan)" } : undefined}
      onClick={onClick}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-muted">{hint}</span>
    </button>
  );
}
