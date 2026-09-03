import type { Goal, MacroTarget } from "../nutrition/macros";
import { KCAL, RATE_BANDS } from "../nutrition/macros";
import type { WeightEntry } from "../db/schema";
import { shiftDate } from "../date";

export type ReviewInput = {
  currentWeek: number[];
  previousWeek: number[];
  currentTargets: MacroTarget;
  goal: Goal;
  /**
   * The weekly rate the user actually chose (lb/week, signed) — the target the
   * observed change is judged against. Judging against the goal's default band
   * instead would make the review fight anyone who deliberately picked a
   * gentler or steeper pace than the default.
   */
  targetRateLbPerWeek: number;
};

export type ReviewVerdict = "maintain" | "decrease" | "increase";

export type ReviewSuggestion = {
  verdict: ReviewVerdict;
  kcalDelta: number;
  newTargets: MacroTarget;
  avgWeight: number;
  prevAvgWeight: number;
  deltaPct: number;
  // Flags how the observed rate compares to the chosen one.
  // For cut: "too_fast" means losing faster than intended → raise kcal.
  rateFlag: "too_slow" | "in_band" | "too_fast" | null;
  // The chosen rate as a fraction of bodyweight per week, for display.
  targetPct: number;
  // True when an adjustment was withheld because weight is already moving
  // faster than the goal's healthy band, even though the chosen rate is
  // steeper still. The verdict is forced to "maintain".
  safetyHold: boolean;
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
  const targetPct = prev > 0 ? input.targetRateLbPerWeek / prev : 0;
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
      targetPct: round4(targetPct),
      safetyHold: false,
      lowData: true,
    };
  }

  let verdict: ReviewVerdict = "maintain";
  let kcalDelta = 0;
  let rateFlag: ReviewSuggestion["rateFlag"] = null;

  // How far off the chosen pace this week landed. Positive means gaining more
  // (or losing less) than intended, whatever the goal.
  const gap = deltaPct - targetPct;
  // Same sensitivity the fixed bands had — half a band's width — but recentred
  // on the chosen rate instead of the goal's default.
  const tolerance = (band.max - band.min) / 2;

  if (gap > tolerance) {
    verdict = "decrease";
    kcalDelta = -ADJUSTMENT;
    rateFlag = input.goal === "cut" ? "too_slow" : "too_fast";
  } else if (gap < -tolerance) {
    verdict = "increase";
    kcalDelta = ADJUSTMENT;
    rateFlag = input.goal === "bulk" ? "too_slow" : "too_fast";
  } else {
    rateFlag = "in_band";
  }

  // Chasing a chosen rate is one thing; deepening a deficit that is already
  // past the healthy rail is another. Hold instead, whatever the rate says.
  const safetyHold =
    (input.goal === "cut" &&
      verdict === "decrease" &&
      deltaPct <= RATE_BANDS.cut.min) ||
    (input.goal === "bulk" &&
      verdict === "increase" &&
      deltaPct >= RATE_BANDS.bulk.max);
  if (safetyHold) {
    verdict = "maintain";
    kcalDelta = 0;
    rateFlag = "too_fast";
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
    targetPct: round4(targetPct),
    safetyHold,
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
