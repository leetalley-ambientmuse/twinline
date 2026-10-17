import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Dices, RotateCcw } from "lucide-react";
import {
  DEFAULT_PATCHES,
  ENGINES,
  ENGINE_COPY,
  PARAMS,
  VOICES,
  VOICE_LABEL,
  modelFm,
  modelGrain,
  modelPhysical,
  modelSample,
  type DeckId,
  type EngineId,
  type Patch,
  type VoiceId,
} from "@/lib/audio/model";
import { renderVoice } from "@/lib/audio/samples";
import { useApp } from "@/lib/store";
import { Knob } from "@/components/controls";
import { StepGrid } from "@/components/StepGrid";
import { useRack } from "@/components/rack-context";

const NAMES: Record<DeckId, string> = { a: "Amber", b: "Lacquer" };

export function SynthView({ deckId }: { deckId: DeckId }) {
  const [voice, setVoice] = useState<VoiceId>("kick");
  const engine = useApp((state) => state.decks[deckId].engines[voice]);
  const setEngine = useApp((state) => state.setEngine);
  const closeSynth = useApp((state) => state.closeSynth);
  const accent = deckId === "a" ? "deck-a" : "deck-b";

  return (
    <div className={`${accent} flex flex-col gap-4 px-3 pt-3 pb-8`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-panel px-3 text-sm"
          onClick={closeSynth}
        >
          <ChevronLeft className="size-4" />
          Booth
        </button>
        <div className="text-right">
          <p className="text-xs tracking-widest text-muted uppercase">{NAMES[deckId]}</p>
          <h2 className="display text-lg font-semibold">{ENGINE_COPY[engine].label}</h2>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {VOICES.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={voice === id}
            className="min-h-11 rounded-md border border-line text-xs tracking-widest uppercase"
            style={
              voice === id
                ? { background: "var(--deck)", color: "var(--color-ink)", borderColor: "transparent" }
                : { background: "var(--color-panel)" }
            }
            onClick={() => setVoice(id)}
          >
            {VOICE_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ENGINES.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={engine === id}
            className="min-h-14 rounded-lg border border-line bg-panel px-3 text-left"
            style={engine === id ? { boxShadow: "inset 0 -3px 0 var(--deck)" } : undefined}
            onClick={() => setEngine(deckId, voice, id)}
          >
            <span className="block text-sm font-medium">{ENGINE_COPY[id].label}</span>
            <span className="block text-xs text-muted">{ENGINE_COPY[id].kicker}</span>
          </button>
        ))}
      </div>
      <Editor deckId={deckId} engine={engine} voice={voice} />
      <section className="panel p-3 sm:p-4">
        <p className="mb-3 text-xs tracking-widest text-muted uppercase">Pattern</p>
        <StepGrid deckId={deckId} />
      </section>
    </div>
  );
}

function Editor({
  deckId,
  engine,
  voice,
}: {
  deckId: DeckId;
  engine: EngineId;
  voice: VoiceId;
}) {
  const patch = useApp((state) => state.decks[deckId].patches[engine][voice]);
  const setPatch = useApp((state) => state.setPatch);
  const resetVoice = useApp((state) => state.resetVoice);
  const jitterVoice = useApp((state) => state.jitterVoice);
  const { preview } = useRack();
  const defaults = DEFAULT_PATCHES[engine][voice];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="panel flex flex-col gap-4 p-4">
        {engine === "sample" ? <SampleVisual voice={voice} patch={patch} /> : null}
        {engine === "fm" ? <FmVisual voice={voice} patch={patch} /> : null}
        {engine === "physical" ? <PhysicalVisual voice={voice} patch={patch} /> : null}
        {engine === "granular" ? <GrainVisual voice={voice} patch={patch} /> : null}
        <p className="text-sm leading-relaxed text-muted">{ENGINE_COPY[engine].body}</p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg text-sm font-medium"
            style={{ background: "var(--deck)", color: "var(--color-ink)" }}
            onPointerDown={() => preview(deckId, voice)}
          >
            Hit
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-ink text-sm"
            onClick={() => resetVoice(deckId, engine, voice)}
          >
            <RotateCcw className="size-4" />
            Reset
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-ink text-sm"
            onClick={() => jitterVoice(deckId, engine, voice)}
          >
            <Dices className="size-4" />
            Jitter
          </button>
        </div>
      </section>
      <section className="panel grid grid-cols-3 content-start gap-4 p-4">
        {PARAMS[engine].map((param) => (
          <Knob
            key={param.key}
            label={param.label}
            value={patch[param.key]}
            defaultValue={defaults[param.key]}
            onChange={(value) => setPatch(deckId, engine, voice, param.key, value)}
          />
        ))}
      </section>
    </div>
  );
}

function Readout({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-md bg-ink px-2 py-2">
          <dt className="text-xs tracking-widest text-muted uppercase">{item.label}</dt>
          <dd className="font-mono text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SampleVisual({ voice, patch }: { voice: VoiceId; patch: Patch }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const model = modelSample(voice, patch);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    drawWave(canvas, renderVoice(voice, 22050));
  }, [voice]);

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={ref} className="h-28 w-full rounded-md bg-ink" style={{ color: "var(--deck)" }} />
      <Readout
        items={[
          { label: "Rate", value: `${model.rate.toFixed(2)}×` },
          { label: "Decay", value: `${Math.round(model.decay * 1000)} ms` },
          { label: "Tone", value: `${Math.round(model.cutoff)} Hz` },
        ]}
      />
    </div>
  );
}

function FmVisual({ voice, patch }: { voice: VoiceId; patch: Patch }) {
  const model = modelFm(voice, patch);
  return (
    <div className="flex flex-col gap-3">
      <svg viewBox="0 0 320 120" className="h-28 w-full" role="img" aria-label="FM operator routing">
        <rect x="16" y="28" width="88" height="64" rx="10" fill="var(--color-ink)" stroke="var(--deck)" />
        <rect x="216" y="28" width="88" height="64" rx="10" fill="var(--color-ink)" stroke="var(--color-cream)" />
        <path d="M104 60 H196" stroke="var(--deck)" strokeWidth="2" />
        <path d="M188 54 L204 60 L188 66" fill="var(--deck)" />
        <text x="60" y="54" textAnchor="middle" fill="var(--color-muted)" fontSize="11">
          MOD
        </text>
        <text x="60" y="74" textAnchor="middle" fill="var(--color-cream)" fontSize="13">
          {model.ratio.toFixed(2)}
        </text>
        <text x="260" y="54" textAnchor="middle" fill="var(--color-muted)" fontSize="11">
          CAR
        </text>
        <text x="260" y="74" textAnchor="middle" fill="var(--color-cream)" fontSize="13">
          {Math.round(model.freq)} Hz
        </text>
        <text x="160" y="48" textAnchor="middle" fill="var(--color-cream)" fontSize="11">
          IDX {model.index.toFixed(1)}
        </text>
      </svg>
      <Readout
        items={[
          { label: "Freq", value: `${Math.round(model.freq)} Hz` },
          { label: "Ratio", value: model.ratio.toFixed(2) },
          { label: "Noise", value: `${Math.round(model.noise * 100)}%` },
        ]}
      />
    </div>
  );
}

function PhysicalVisual({ voice, patch }: { voice: VoiceId; patch: Patch }) {
  const model = modelPhysical(voice, patch);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-28 items-center justify-center rounded-md bg-ink text-cream">
        <Scheme kind={model.kind} />
      </div>
      <Readout
        items={[
          { label: "Tune", value: `${Math.round(model.freq)} Hz` },
          { label: "Ring", value: `${Math.round(model.decay * 1000)} ms` },
          { label: "Body", value: model.kind },
        ]}
      />
    </div>
  );
}

function Scheme({ kind }: { kind: "membrane" | "snare" | "cymbal" | "mallet" }) {
  if (kind === "membrane") {
    return (
      <svg viewBox="0 0 120 90" className="h-24 w-32" aria-hidden="true">
        <ellipse cx="60" cy="46" rx="48" ry="28" fill="none" stroke="currentColor" strokeWidth="3" />
        <ellipse cx="60" cy="46" rx="28" ry="16" fill="none" stroke="var(--deck)" strokeWidth="2" />
        <circle cx="60" cy="46" r="4" fill="var(--deck)" />
      </svg>
    );
  }
  if (kind === "snare") {
    return (
      <svg viewBox="0 0 120 90" className="h-24 w-32" aria-hidden="true">
        <ellipse cx="60" cy="34" rx="46" ry="16" fill="none" stroke="currentColor" strokeWidth="3" />
        <path d="M14 34 V62 M106 34 V62" stroke="currentColor" strokeWidth="3" />
        <path d="M18 48 H102 M18 56 H102 M18 64 H102" stroke="var(--deck)" strokeWidth="2" />
      </svg>
    );
  }
  if (kind === "cymbal") {
    return (
      <svg viewBox="0 0 120 90" className="h-24 w-32" aria-hidden="true">
        <ellipse cx="60" cy="38" rx="50" ry="14" fill="none" stroke="currentColor" strokeWidth="3" />
        <ellipse cx="60" cy="54" rx="42" ry="12" fill="none" stroke="var(--deck)" strokeWidth="2" />
        <circle cx="60" cy="46" r="3" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 90" className="h-24 w-32" aria-hidden="true">
      <path d="M28 70 H92" stroke="currentColor" strokeWidth="3" />
      <path d="M36 70 V28 M84 70 V36" stroke="var(--deck)" strokeWidth="3" />
      <circle cx="36" cy="24" r="6" fill="var(--deck)" />
      <circle cx="84" cy="32" r="5" fill="currentColor" />
    </svg>
  );
}

function GrainVisual({ voice, patch }: { voice: VoiceId; patch: Patch }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const model = modelGrain(voice, patch);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 112;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const color = getComputedStyle(canvas).color || "#ffb020";
    const count = Math.max(model.count * 3, 12);
    for (let i = 0; i < count; i++) {
      const n = hash(voice.length * 13 + i * 17 + Math.round(patch.a * 40) + Math.round(patch.d * 20));
      const x = (model.position + (n - 0.5) * model.spray) * width;
      const y = hash(i * 31 + 4) * height;
      const r = 2 + model.grain * 46 * (0.6 + hash(i + 9));
      ctx.globalAlpha = 0.35 + hash(i + 3) * 0.65;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(Math.max(4, Math.min(width - 4, x)), y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [voice, patch, model.position, model.spray, model.grain, model.count]);

  return (
    <div className="flex flex-col gap-3">
      <canvas ref={ref} className="h-28 w-full rounded-md bg-ink" style={{ color: "var(--deck)" }} />
      <Readout
        items={[
          { label: "Grains", value: String(model.count) },
          { label: "Size", value: `${Math.round(model.grain * 1000)} ms` },
          { label: "Cloud", value: `${Math.round(model.cloud * 1000)} ms` },
        ]}
      />
    </div>
  );
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function drawWave(canvas: HTMLCanvasElement, data: Float32Array): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 112;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = getComputedStyle(canvas).color || "#ffb020";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  const step = Math.max(1, Math.floor(data.length / width));
  for (let x = 0; x < width; x++) {
    let min = 1;
    let max = -1;
    const start = x * step;
    for (let i = 0; i < step; i += 4) {
      const sample = data[start + i] ?? 0;
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    ctx.moveTo(x + 0.5, (0.5 - max * 0.46) * height);
    ctx.lineTo(x + 0.5, (0.5 - min * 0.46) * height);
  }
  ctx.stroke();
}
