import {
  getMealLogsForDate,
  getProfile,
  getSchedule,
  getSnacksForDate,
  getTargetsForDate,
} from "@/lib/db/repos";
import type { MealLog, Profile, ScheduleDay, Snack, Targets } from "@/lib/db/schema";
import type { MealSlot } from "@/lib/nutrition/distribute";
import type { MacroTarget } from "@/lib/nutrition/macros";
import { planRemaining, type MacroOverage } from "@/lib/plan/remaining";
import { postWorkoutMealIndex } from "@/lib/schedule/week";
import { parseYmd } from "@/lib/date";

export type DayPlan = {
  targets: Targets;
  profile: Profile | undefined;
  day: ScheduleDay;
  slots: MealSlot[];
  // Live per-meal targets: what's left of the day after logged meals and
  // snacks, split over the empty meals. null for logged meals (unless it's
  // `openIndex`, which is planned as if empty).
  mealTargets: (MacroTarget | null)[];
  over: MacroOverage;
  logs: MealLog[];
  snacks: Snack[];
};

/**
 * The targets → schedule → logged food → post-workout carb bias → per-meal
 * distribution pipeline shared by the today and meal-detail screens. Returns
 * null until onboarding has produced a targets row.
 */
export async function getDayPlan(
  date: string,
  opts: { openIndex?: number } = {}
): Promise<DayPlan | null> {
  const [targets, sched, profile, logs, snacks] = await Promise.all([
    getTargetsForDate(date),
    getSchedule(),
    getProfile(),
    getMealLogsForDate(date),
    getSnacksForDate(date),
  ]);
  if (!targets) return null;

  const weekday = parseYmd(date).getDay();
  const day: ScheduleDay = sched[weekday] ?? sched[0];
  const pwIdx = postWorkoutMealIndex(day);
  const slots: MealSlot[] = day.mealTimes.map((time, i) => ({
    index: i,
    time,
    postWorkout: i === pwIdx,
  }));
  const carbBias = profile?.enablePostWorkoutCarbBias === false ? 0 : 0.5;
  const { mealTargets, over } = planRemaining({
    daily: { kcal: targets.kcal, proteinG: targets.proteinG, fatG: targets.fatG, carbG: targets.carbG },
    slots,
    // An empty log row is never kept (removing the last food deletes it), but
    // don't let one count as "logged" if it slips through.
    loggedMeals: logs
      .filter((l) => l.items.length > 0)
      .map((l) => ({ index: l.index, macros: l })),
    snacks,
    postWorkoutCarbBias: carbBias,
    openIndex: opts.openIndex,
  });

  return { targets, profile, day, slots, mealTargets, over, logs, snacks };
}
