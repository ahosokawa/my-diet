import { shiftDate } from "../date";
import type { Profile, WeightEntry } from "../db/schema";
import { tdee } from "./mifflin";

/**
 * Which bodyweight the targets math should use. Logged weigh-ins are the
 * source of truth when they exist — `profile.weightLb` is only the seed value
 * captured at onboarding — and they're averaged over a week so day-to-day
 * water swings can't move the calorie target.
 */

export const AVG_WINDOW_DAYS = 7;

/** Mean of weigh-ins in the trailing 7 days (today inclusive). Null if none. */
export function recentAvgWeight(
  entries: WeightEntry[],
  today: string
): number | null {
  const byDate = new Map(entries.map((e) => [e.date, e.lbs]));
  const found: number[] = [];
  for (let i = 0; i < AVG_WINDOW_DAYS; i++) {
    const lbs = byDate.get(shiftDate(today, -i));
    if (lbs !== undefined) found.push(lbs);
  }
  if (found.length === 0) return null;
  const mean = found.reduce((a, b) => a + b, 0) / found.length;
  return Math.round(mean * 100) / 100;
}

export function effectiveWeightLb(
  profile: Pick<Profile, "weightLb">,
  entries: WeightEntry[],
  today: string
): number {
  return recentAvgWeight(entries, today) ?? profile.weightLb;
}

export function maintenanceKcal(
  profile: Pick<Profile, "sex" | "age" | "heightIn" | "activity">,
  weightLb: number
): number {
  return Math.round(
    tdee({
      sex: profile.sex,
      age: profile.age,
      heightIn: profile.heightIn,
      weightLb,
      activity: profile.activity,
    })
  );
}
