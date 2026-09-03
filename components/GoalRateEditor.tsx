"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/Slider";
import { AlertTriangle, Check, Minus as MinusIcon, Plus } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
import { macrosFromKcal, type Goal } from "@/lib/nutrition/macros";
import {
  classifyRate,
  clampRate,
  kcalForRate,
  rateForKcal,
  MIN_SAFE_KCAL,
  RATE_SLIDER,
  type RateStatus,
} from "@/lib/nutrition/rate";

const KCAL_STEP = 10;
const MINUS = "−"; // typographic minus, aligns with tabular figures

const GOAL_LABEL: Record<Goal, string> = {
  cut: "Lose fat",
  maintain: "Maintain",
  bulk: "Gain muscle",
};

function statusCopy(goal: Goal, status: RateStatus): string {
  if (goal === "maintain") return "Holding your current weight";
  if (status === "in_band") return "Sustainable pace for this goal";
  if (goal === "cut")
    return status === "aggressive"
      ? "Faster than recommended — harder to hold on to muscle"
      : "Gentler than recommended — progress will be slow";
  return status === "aggressive"
    ? "Faster than recommended — more of the gain will be fat"
    : "Slower than recommended for building muscle";
}

function fmtKcal(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtRate(rate: number): string {
  const abs = Math.abs(rate).toFixed(2);
  if (Math.abs(rate) < 0.005) return "0.00";
  return `${rate < 0 ? MINUS : "+"}${abs}`;
}

function fmtPct(pct: number): string {
  return `${Math.abs(pct * 100).toFixed(2)}%`;
}

type Props = {
  /** TDEE at the bodyweight currently in effect. */
  maintenanceKcal: number;
  weightLb: number;
  rateLbPerWeek: number;
  onRateChange: (next: number) => void;
  proteinPerLb: number;
  fatPerLb: number;
};

/**
 * The one control for "what am I eating and why". The weekly rate is the real
 * setting — calories are what that rate costs at today's maintenance — but the
 * two are edited interchangeably: the slider is for choosing a pace, the
 * stepper for landing on a specific number. Both write back a rate, which is
 * what gets stored, so the target keeps meaning the same thing as weight moves.
 */
export function GoalRateEditor({
  maintenanceKcal,
  weightLb,
  rateLbPerWeek,
  onRateChange,
  proteinPerLb,
  fatPerLb,
}: Props) {
  const kcal = kcalForRate(maintenanceKcal, rateLbPerWeek);
  const { goal, pctPerWeek, status } = classifyRate(rateLbPerWeek, weightLb);
  const delta = kcal - maintenanceKcal;
  const macros = macrosFromKcal({ kcal, weightLb, proteinPerLb, fatPerLb });
  const tooLow = kcal < MIN_SAFE_KCAL;

  function setKcal(next: number) {
    onRateChange(rateForKcal(maintenanceKcal, next));
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="label mb-0">Weekly rate</span>
          <span className="text-xl font-semibold tabular-nums">
            {fmtRate(rateLbPerWeek)}{" "}
            <span className="text-sm font-medium text-fg-3">lb/wk</span>
          </span>
        </div>
        <Slider
          value={clampRate(rateLbPerWeek)}
          min={RATE_SLIDER.min}
          max={RATE_SLIDER.max}
          step={RATE_SLIDER.step}
          origin={0}
          onChange={(v) => {
            onRateChange(v);
            haptic("light");
          }}
          ariaLabel="Weekly rate of weight change"
          ariaValueText={`${fmtRate(rateLbPerWeek)} pounds per week`}
        />
        <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-fg-3">
          <span>{MINUS}2.0</span>
          <span>0</span>
          <span>+1.5</span>
        </div>
        <p className="mt-2 text-sm font-medium text-fg-2">
          {GOAL_LABEL[goal]}
          {goal !== "maintain" && (
            <span className="font-normal text-fg-3">
              {" · "}
              {fmtPct(pctPerWeek)} of bodyweight per week
            </span>
          )}
        </p>
        {/* Only the aggressive rail is a caution — going gentler than the
            band is a legitimate choice, not something to warn about. */}
        <p
          className={`mt-1 flex items-center gap-1.5 text-xs ${
            status === "in_band"
              ? "text-brand-600 dark:text-brand-400"
              : status === "aggressive"
              ? "text-amber-700 dark:text-amber-400"
              : "text-fg-3"
          }`}
        >
          {status === "in_band" ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : status === "aggressive" ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          ) : null}
          {statusCopy(goal, status)}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="label mb-0">Daily calories</span>
          <span className="text-xs tabular-nums text-fg-3">
            Maintenance {fmtKcal(maintenanceKcal)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StepButton
            label={`Decrease calories by ${KCAL_STEP}`}
            onPress={() => setKcal(kcal - KCAL_STEP)}
          >
            <MinusIcon className="h-5 w-5" />
          </StepButton>
          <KcalField kcal={kcal} onCommit={setKcal} />
          <StepButton
            label={`Increase calories by ${KCAL_STEP}`}
            onPress={() => setKcal(kcal + KCAL_STEP)}
          >
            <Plus className="h-5 w-5" />
          </StepButton>
        </div>
        <p className="mt-2 text-center text-xs tabular-nums text-fg-3">
          {delta === 0
            ? "Even with maintenance"
            : `${delta < 0 ? MINUS : "+"}${fmtKcal(Math.abs(delta))} vs maintenance`}
        </p>
        {tooLow && (
          <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Under {fmtKcal(MIN_SAFE_KCAL)} kcal it's hard to hit your protein and
            micronutrients. Consider a gentler rate.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-4 text-center">
        <MacroCell label="Protein" grams={macros.proteinG} />
        <MacroCell label="Fat" grams={macros.fatG} />
        <MacroCell label="Carbs" grams={macros.carbG} />
      </div>
    </div>
  );
}

function MacroCell({ label, grams }: { label: string; grams: number }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">
        {grams}
        <span className="text-xs font-medium text-fg-3">g</span>
      </p>
      <p className="text-xs text-fg-3">{label}</p>
    </div>
  );
}

function StepButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-fg-1 transition-transform active:scale-95 active:bg-hairline"
      onClick={() => {
        onPress();
        haptic("light");
      }}
    >
      {children}
    </button>
  );
}

/**
 * Buffers typing locally so partial entries ("21") don't momentarily re-anchor
 * the rate to something absurd; commits on blur or Enter. Stepper taps bypass
 * the buffer and land immediately.
 */
function KcalField({
  kcal,
  onCommit,
}: {
  kcal: number;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);

  return (
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label="Daily calories"
      className="input flex-1 text-center text-2xl font-semibold tabular-nums"
      // Unformatted while editable: a controlled value that reformats itself
      // fights any programmatic fill, and a comma has to be stripped anyway.
      value={text ?? String(kcal)}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d]/g, "");
        if (v.length > 5) return;
        setText(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={() => {
        const n = Number(text);
        if (text !== null && text !== "" && Number.isFinite(n) && n > 0) onCommit(n);
        setText(null);
      }}
    />
  );
}
