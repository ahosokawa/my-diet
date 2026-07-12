import type { Goal, MacroTarget } from "../nutrition/macros";
import { KCAL, RATE_BANDS } from "../nutrition/macros";
import type { WeightEntry } from "../db/schema";
import { shiftDate } from "../date";

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
  // True when either week has fewer than MIN_SAMPLES weigh-ins — the weekly
  // averages are too noisy to act on, so the verdict is forced to "maintain".
  lowData: boolean;
};

const ADJUSTMENT = 150;
export const MIN_SAMPLES = 3;

// Buckets recent weigh-ins into the current week (today back 6 days) and the
// previous week (7–13 days back). Entries outside 14 days are ignored.
export function splitWeights(
  entries: WeightEntry[],
  today: string
): { current: number[]; previous: number[] } {
  const byDate = new Map(entries.map((e) => [e.date, e.lbs]));
  const current: number[] = [];
  const previous: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDate(today, -i);
    const lbs = byDate.get(d);
    if (lbs !== undefined) current.push(lbs);
  }
  for (let i = 7; i < 14; i++) {
    const d = shiftDate(today, -i);
    const lbs = byDate.get(d);
    if (lbs !== undefined) previous.push(lbs);
  }
  return { current, previous };
}

// The minimum data computeReview needs: at least one weigh-in in each week.
export function hasReviewData(current: number[], previous: number[]): boolean {
  return current.length > 0 && previous.length > 0;
}

export function computeReview(input: ReviewInput): ReviewSuggestion {
  const avg = mean(input.currentWeek);
  const prev = mean(input.previousWeek);
  const deltaPct = prev > 0 ? (avg - prev) / prev : 0;
  const band = RATE_BANDS[input.goal];
  const lowData =
    input.currentWeek.length < MIN_SAMPLES ||
    input.previousWeek.length < MIN_SAMPLES;

  if (lowData) {
    return {
      verdict: "maintain",
      kcalDelta: 0,
      newTargets: { ...input.currentTargets },
      avgWeight: round2(avg),
      prevAvgWeight: round2(prev),
      deltaPct: round4(deltaPct),
      rateFlag: null,
      lowData: true,
    };
  }

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

  const carbDelta = Math.round(kcalDelta / KCAL.carb);
  const newCarbG = Math.max(0, input.currentTargets.carbG + carbDelta);
  const clamped = newCarbG !== input.currentTargets.carbG + carbDelta;
  // When the carb floor bites, derive kcal from the carbs actually applied so
  // kcal can't drift out of sync with the macros.
  const newKcal = clamped
    ? Math.round(input.currentTargets.kcal + (newCarbG - input.currentTargets.carbG) * KCAL.carb)
    : Math.round(input.currentTargets.kcal + kcalDelta);

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
    lowData: false,
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
