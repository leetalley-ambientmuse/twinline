import { useRef } from "react";
import { clamp01 } from "@/lib/audio/model";

type KnobProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  defaultValue?: number;
  size?: "md" | "sm";
  readout?: string;
};

export function Knob({ label, value, onChange, defaultValue, size = "md", readout }: KnobProps) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const angle = -140 + value * 280;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        data-size={size}
        className="knob"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, v: value };
        }}
        onPointerMove={(event) => {
          if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const dy = drag.current.y - event.clientY;
          const scale = event.shiftKey ? 0.0015 : 0.005;
          onChange(clamp01(drag.current.v + dy * scale));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={() => {
          if (defaultValue !== undefined) onChange(defaultValue);
        }}
        onKeyDown={(event) => {
          const dir =
            event.key === "ArrowUp" || event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowDown" || event.key === "ArrowLeft"
                ? -1
                : 0;
          if (!dir) return;
          event.preventDefault();
          onChange(clamp01(value + dir * (event.shiftKey ? 0.01 : 0.03)));
        }}
      >
        <span className="knob-rotor" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-pointer" />
        </span>
      </div>
      <span className="text-xs tracking-widest text-muted uppercase">{label}</span>
      <span className="font-mono text-xs text-cream">{readout ?? String(Math.round(value * 100))}</span>
    </div>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onHold?: (held: boolean) => void;
  suffix?: string;
};

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.001,
  onChange,
  onHold,
  suffix,
}: SliderProps) {
  const shown =
    suffix ??
    (max <= 1 ? String(Math.round(value * 100)) : String(Math.round(value)));
  const held = useRef(false);
  function grab(next: boolean) {
    if (held.current === next) return;
    held.current = next;
    onHold?.(next);
  }
  return (
    <label className="flex min-h-11 items-center gap-3">
      <span className="w-10 shrink-0 text-xs tracking-widest text-muted uppercase">{label}</span>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          grab(true);
        }}
        onPointerUp={() => grab(false)}
        onPointerCancel={() => grab(false)}
      />
      <span className="w-10 shrink-0 text-right font-mono text-xs text-cream">{shown}</span>
    </label>
  );
}

type FaderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onHold?: (held: boolean) => void;
};

export function Fader({ label, value, onChange, onHold }: FaderProps) {
  const track = useRef<HTMLDivElement>(null);
  const held = useRef(false);

  function grab(next: boolean) {
    if (held.current === next) return;
    held.current = next;
    onHold?.(next);
  }

  function setFromY(clientY: number) {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return;
    const next = 1 - (clientY - rect.top) / rect.height;
    onChange(clamp01(next));
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        className="fader"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          grab(true);
          setFromY(event.clientY);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          setFromY(event.clientY);
        }}
        onPointerUp={() => grab(false)}
        onPointerCancel={() => grab(false)}
        onKeyDown={(event) => {
          const dir =
            event.key === "ArrowUp" || event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowDown" || event.key === "ArrowLeft"
                ? -1
                : 0;
          if (!dir) return;
          event.preventDefault();
          onChange(clamp01(value + dir * 0.04));
        }}
      >
        <span className="fader-track" />
        <span className="fader-fill" style={{ top: `${(1 - value) * 100}%`, bottom: "0.4rem" }} />
        <span className="fader-cap" style={{ top: `${(1 - value) * 100}%` }} />
      </div>
      <span className="text-xs tracking-widest text-muted uppercase">{label}</span>
    </div>
  );
}
