import { getProfile, getSchedule, getTargetsForDate } from "@/lib/db/repos";
import type { Profile, ScheduleDay, Targets } from "@/lib/db/schema";
import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";
import type { MacroTarget } from "@/lib/nutrition/macros";
import { postWorkoutMealIndex } from "@/lib/schedule/week";
import { parseYmd } from "@/lib/date";

export type DayPlan = {
  targets: Targets;
  profile: Profile | undefined;
  day: ScheduleDay;
  slots: MealSlot[];
  mealTargets: MacroTarget[];
};

/**
 * The targets → schedule → post-workout carb bias → per-meal distribution
 * pipeline shared by the today and meal-detail screens. Returns null until
 * onboarding has produced a targets row.
 */
export async function getDayPlan(date: string): Promise<DayPlan | null> {
  const [targets, sched, profile] = await Promise.all([
    getTargetsForDate(date),
    getSchedule(),
    getProfile(),
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
  const mealTargets = distributeMeals(
    { kcal: targets.kcal, proteinG: targets.proteinG, fatG: targets.fatG, carbG: targets.carbG },
    slots,
    { postWorkoutCarbBias: carbBias }
  );

  return { targets, profile, day, slots, mealTargets };
}
