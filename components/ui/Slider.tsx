"use client";

const THUMB_PX = 28;

type Props = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  /** Where the filled portion starts. Defaults to `min`; pass 0 for signed scales. */
  origin?: number;
  ariaLabel: string;
  ariaValueText?: string;
};

/**
 * Native range input with a custom track so the fill reads outward from an
 * origin (a deficit fills left of zero, a surplus right) instead of always
 * from the left edge. Positions are corrected for thumb inset: the thumb
 * centre travels between THUMB_PX/2 and width - THUMB_PX/2, not 0% to 100%.
 */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  origin,
  ariaLabel,
  ariaValueText,
}: Props) {
  const span = max - min || 1;
  const pct = (n: number) => ((Math.min(max, Math.max(min, n)) - min) / span) * 100;
  const at = (p: number) => `calc(${p}% + ${(0.5 - p / 100) * THUMB_PX}px)`;

  const valuePct = pct(value);
  const originPct = pct(origin ?? min);
  const lo = Math.min(valuePct, originPct);
  const hi = Math.max(valuePct, originPct);

  return (
    <div className="relative h-7">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3" />
      <div
        className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand-500"
        style={{ left: at(lo), right: `calc(100% - ${at(hi)})` }}
      />
      <div
        className="pointer-events-none absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-3/50"
        style={{ left: at(originPct) }}
      />
      <input
        type="range"
        className="slider-bare absolute inset-0 h-7"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={ariaValueText}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
