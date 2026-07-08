import type { MacroTarget } from "./macros";
import { kcalFromMacros } from "./macros";

export type MealSlot = {
  index: number;
  time: string;
  postWorkout: boolean;
};

/**
 * Split a daily macro target across N meals. On workout days, shift a portion
 * of the carbs to the post-workout meal. Protein and fat stay even.
 */
export function distributeMeals(
  daily: MacroTarget,
  slots: MealSlot[],
  opts: { postWorkoutCarbBias?: number } = {}
): MacroTarget[] {
  const n = slots.length;
  if (n === 0) return [];
  const bias = opts.postWorkoutCarbBias ?? 0.5;

  const evenP = daily.proteinG / n;
  const evenF = daily.fatG / n;

  const pwIndex = slots.findIndex((s) => s.postWorkout);
  const hasPw = pwIndex >= 0;

  let carbs: number[];
  if (!hasPw) {
    carbs = Array(n).fill(daily.carbG / n);
  } else {
    const evenC = daily.carbG / n;
    const boost = evenC * bias;
    const othersReduction = boost / (n - 1);
    carbs = Array(n)
      .fill(0)
      .map((_, i) => (i === pwIndex ? evenC + boost : evenC - othersReduction));
  }

  const proteinPerMeal = largestRemainderRound(Array(n).fill(evenP), daily.proteinG);
  const fatPerMeal = largestRemainderRound(Array(n).fill(evenF), daily.fatG);
  const carbPerMeal = largestRemainderRound(carbs, daily.carbG);

  return slots.map((_, i) => {
    const proteinG = proteinPerMeal[i];
    const fatG = fatPerMeal[i];
    const carbG = carbPerMeal[i];
    return {
      proteinG,
      fatG,
      carbG,
      // Per-meal kcal follows the rounded grams, so Σ(meal kcal) equals
      // kcalFromMacros(daily) — not necessarily daily.kcal itself.
      kcal: Math.round(kcalFromMacros({ proteinG, fatG, carbG })),
    };
  });
}

/**
 * Round fractional per-meal grams to integers that sum exactly to the daily
 * total: floor everything, then hand out the leftover grams to the meals with
 * the largest fractional parts.
 */
function largestRemainderRound(values: number[], total: number): number[] {
  const out = values.map(Math.floor);
  let remainder = Math.round(total) - out.reduce((a, b) => a + b, 0);
  const byFrac = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < byFrac.length && remainder > 0; k++, remainder--) {
    out[byFrac[k].i] += 1;
  }
  return out;
}
