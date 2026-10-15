import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";
import type { MacroTarget } from "@/lib/nutrition/macros";

export type Eaten = { proteinG: number; fatG: number; carbG: number };

export type MacroOverage = { proteinG: number; fatG: number; carbG: number };

export type RemainingPlan = {
  // Per slot: the live target for empty (or `openIndex`) meals; null for
  // meals that are already logged.
  mealTargets: (MacroTarget | null)[];
  // Grams eaten past the daily target, per macro (0 when under).
  over: MacroOverage;
};

/**
 * Live per-meal targets: the daily target minus everything already eaten
 * (logged meals + snacks), clamped at 0 per macro, re-split across the meals
 * still empty with the normal distribution (post-workout carb bias intact).
 *
 * `openIndex` treats that meal as empty even if it's logged — the meal being
 * edited solves toward the share it would get without its own foods, so its
 * target doesn't jump when the first food goes in.
 */
export function planRemaining(params: {
  daily: MacroTarget;
  slots: MealSlot[];
  loggedMeals: { index: number; macros: Eaten }[];
  snacks: Eaten[];
  postWorkoutCarbBias: number;
  openIndex?: number;
}): RemainingPlan {
  const { daily, slots, loggedMeals, snacks, postWorkoutCarbBias, openIndex } = params;
  const loggedByIndex = new Map(loggedMeals.map((m) => [m.index, m.macros]));
  const isOpen = (i: number) => i === openIndex || !loggedByIndex.has(i);

  const eaten: Eaten = { proteinG: 0, fatG: 0, carbG: 0 };
  const add = (m: Eaten) => {
    eaten.proteinG += m.proteinG;
    eaten.fatG += m.fatG;
    eaten.carbG += m.carbG;
  };
  // Logs for slots the schedule no longer has are ignored, matching the
  // daily totals on /today (which only shows scheduled meals).
  for (const s of slots) {
    const m = loggedByIndex.get(s.index);
    if (m && !isOpen(s.index)) add(m);
  }
  snacks.forEach(add);

  // Logged grams carry a decimal; distribution works in whole grams.
  const left = (target: number, used: number) => Math.round(target - used);
  const rem = {
    proteinG: left(daily.proteinG, eaten.proteinG),
    fatG: left(daily.fatG, eaten.fatG),
    carbG: left(daily.carbG, eaten.carbG),
  };
  const over: MacroOverage = {
    proteinG: Math.max(0, -rem.proteinG),
    fatG: Math.max(0, -rem.fatG),
    carbG: Math.max(0, -rem.carbG),
  };

  const openSlots = slots.filter((s) => isOpen(s.index));
  const split = distributeMeals(
    {
      // distributeMeals derives per-meal kcal from grams; this is unused.
      kcal: 0,
      proteinG: Math.max(0, rem.proteinG),
      fatG: Math.max(0, rem.fatG),
      carbG: Math.max(0, rem.carbG),
    },
    openSlots,
    { postWorkoutCarbBias }
  );
  const byIndex = new Map(openSlots.map((s, k) => [s.index, split[k]]));

  return {
    mealTargets: slots.map((s) => byIndex.get(s.index) ?? null),
    over,
  };
}
