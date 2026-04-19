import type { Goal, MacroTarget } from "../nutrition/macros";
import { KCAL, RATE_BANDS } from "../nutrition/macros";

export type ReviewInput = {
  currentWeek: number[];
  previousWeek: number[];
  currentTargets: MacroTarget;
  goal: Goal;
};

export type ReviewVerdict = "maintain" | "decrease" | "increase";

export type ReviewSuggestion = {
  verdict: ReviewVerdict;
  kcalDelta: number;
  newTargets: MacroTarget;
  avgWeight: number;
  prevAvgWeight: number;
  deltaPct: number;
  // Flags when observed rate is outside the healthy band for the current goal.
  // For cut: true when losing faster than max (health guard) → raise kcal.
  rateFlag: "too_slow" | "in_band" | "too_fast" | null;
};

const ADJUSTMENT = 150;

export function computeReview(input: ReviewInput): ReviewSuggestion {
  const avg = mean(input.currentWeek);
  const prev = mean(input.previousWeek);
  const deltaPct = prev > 0 ? (avg - prev) / prev : 0;
  const band = RATE_BANDS[input.goal];

  let verdict: ReviewVerdict = "maintain";
  let kcalDelta = 0;
  let rateFlag: ReviewSuggestion["rateFlag"] = null;

  if (input.goal === "maintain") {
    // Existing maintain logic: nudge kcal when weight drifts > 0.3%.
    if (deltaPct > band.max) {
      verdict = "decrease";
      kcalDelta = -ADJUSTMENT;
      rateFlag = "too_fast";
    } else if (deltaPct < band.min) {
      verdict = "increase";
      kcalDelta = ADJUSTMENT;
      rateFlag = "too_fast";
    } else {
      rateFlag = "in_band";
    }
  } else if (input.goal === "cut") {
    // Band is negative: min = -1.0%/wk (cap), max = -0.5%/wk (floor).
    if (deltaPct > band.max) {
      // Losing too slowly (or gaining) — deepen deficit.
      verdict = "decrease";
      kcalDelta = -ADJUSTMENT;
      rateFlag = "too_slow";
    } else if (deltaPct < band.min) {
      // Losing too fast — raise kcal (health guard).
      verdict = "increase";
      kcalDelta = ADJUSTMENT;
      rateFlag = "too_fast";
    } else {
      rateFlag = "in_band";
    }
  } else {
    // bulk — band positive: min = +0.25%/wk (floor), max = +0.5%/wk (cap).
    if (deltaPct < band.min) {
      // Gaining too slowly — raise kcal.
      verdict = "increase";
      kcalDelta = ADJUSTMENT;
      rateFlag = "too_slow";
    } else if (deltaPct > band.max) {
      // Gaining too fast — trim surplus (fat-gain guard).
      verdict = "decrease";
      kcalDelta = -ADJUSTMENT;
      rateFlag = "too_fast";
    } else {
      rateFlag = "in_band";
    }
  }

  const newKcal = Math.round(input.currentTargets.kcal + kcalDelta);
  const carbDelta = Math.round(kcalDelta / KCAL.carb);
  const newCarbG = Math.max(0, input.currentTargets.carbG + carbDelta);

  return {
    verdict,
    kcalDelta,
    newTargets: {
      kcal: newKcal,
      proteinG: input.currentTargets.proteinG,
      fatG: input.currentTargets.fatG,
      carbG: newCarbG,
    },
    avgWeight: round2(avg),
    prevAvgWeight: round2(prev),
    deltaPct: round4(deltaPct),
    rateFlag,
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
