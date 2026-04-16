import type { MacroTarget } from "../nutrition/macros";
import { KCAL } from "../nutrition/macros";

export type ReviewInput = {
  currentWeek: number[];
  previousWeek: number[];
  currentTargets: MacroTarget;
};

export type ReviewSuggestion = {
  verdict: "maintain" | "decrease" | "increase";
  kcalDelta: number;
  newTargets: MacroTarget;
  avgWeight: number;
  prevAvgWeight: number;
  deltaPct: number;
};

export function computeReview(input: ReviewInput): ReviewSuggestion {
  const avg = mean(input.currentWeek);
  const prev = mean(input.previousWeek);
  const deltaPct = prev > 0 ? (avg - prev) / prev : 0;

  const THRESHOLD = 0.003;
  const ADJUSTMENT = 150;

  let kcalDelta = 0;
  let verdict: ReviewSuggestion["verdict"] = "maintain";

  if (deltaPct > THRESHOLD) {
    verdict = "decrease";
    kcalDelta = -ADJUSTMENT;
  } else if (deltaPct < -THRESHOLD) {
    verdict = "increase";
    kcalDelta = ADJUSTMENT;
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
