import { useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { downloadProject, importProject, useApp } from "@/lib/store";
import { useRack } from "@/components/rack-context";
import { WizardButton } from "@/components/PromptWizard";

export function Transport() {
  const playing = useApp((state) => state.playing);
  const bpm = useApp((state) => state.bpm);
  const step = useApp((state) => state.step);
  const setBpm = useApp((state) => state.setBpm);
  const setPlaying = useApp((state) => state.setPlaying);
  const { arm, bounce } = useRack();
  const taps = useRef<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bouncing, setBouncing] = useState(false);

  function toggle() {
    arm();
    setPlaying(!useApp.getState().playing);
  }

  async function bounceLoop() {
    if (bouncing) return;
    setBouncing(true);
    try {
      const blob = await bounce(4);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "twinline.wav";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      /* The context never pulled a buffer. Leave the button ready. */
    } finally {
      setBouncing(false);
    }
  }

  async function loadFile(file: File) {
    const text = await file.text();
    importProject(text);
  }

  function tapTempo() {
    arm();
    const now = performance.now();
    const recent = taps.current.filter((tap) => now - tap < 2000);
    recent.push(now);
    taps.current = recent.slice(-6);
    if (taps.current.length < 2) return;
    let total = 0;
    for (let i = 1; i < taps.current.length; i++) total += taps.current[i] - taps.current[i - 1];
    const avg = total / (taps.current.length - 1);
    setBpm(Math.round(60000 / avg));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <WizardButton />
      <button
        type="button"
        className="play-btn inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-4 font-medium"
        aria-pressed={playing}
        onClick={toggle}
      >
        {playing ? <Square className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
        {playing ? "Stop" : "Play"}
      </button>
      <div className="flex items-center gap-1 rounded-full border border-line bg-panel px-2">
        <button
          type="button"
          className="min-h-11 min-w-11 font-mono text-lg"
          aria-label="Slower"
          onClick={() => setBpm(bpm - 1)}
        >
          −
        </button>
        <div className="min-w-16 text-center">
          <p className="font-mono text-lg leading-none">{bpm}</p>
          <p className="text-xs tracking-widest text-muted uppercase">BPM</p>
        </div>
        <button
          type="button"
          className="min-h-11 min-w-11 font-mono text-lg"
          aria-label="Faster"
          onClick={() => setBpm(bpm + 1)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        className="min-h-11 rounded-full border border-line bg-panel px-4 text-sm"
        onClick={tapTempo}
      >
        Tap
      </button>
      <button
        type="button"
        className="min-h-11 rounded-full border border-line bg-panel px-4 text-sm"
        onClick={downloadProject}
      >
        Save
      </button>
      <button
        type="button"
        className="min-h-11 rounded-full border border-line bg-panel px-4 text-sm"
        onClick={() => fileRef.current!.click()}
      >
        Load
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadFile(file);
        }}
      />
      <button
        type="button"
        className="min-h-11 rounded-full border border-line bg-panel px-4 text-sm disabled:opacity-40"
        disabled={bouncing}
        onClick={() => void bounceLoop()}
      >
        {bouncing ? "Bouncing" : "Bounce"}
      </button>
      <p className="hidden font-mono text-sm text-muted sm:block" aria-live="off">
        {step >= 0 ? String(step + 1).padStart(2, "0") : "—"}
      </p>
    </div>
  );
}
