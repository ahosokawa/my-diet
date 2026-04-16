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

  return slots.map((_, i) => {
    const proteinG = Math.round(evenP);
    const fatG = Math.round(evenF);
    const carbG = Math.round(carbs[i]);
    return {
      proteinG,
      fatG,
      carbG,
      kcal: Math.round(kcalFromMacros({ proteinG, fatG, carbG })),
    };
  });
}
