import type { ScheduleDay } from "../db/schema";

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function defaultMealTimes(count: number, workoutEnd?: string): string[] {
  const presets: Record<number, string[]> = {
    1: ["12:00"],
    2: ["09:00", "18:00"],
    3: ["08:00", "12:30", "18:30"],
    4: ["08:00", "12:00", "15:30", "19:00"],
    5: ["07:30", "10:30", "13:00", "16:00", "19:00"],
    6: ["07:00", "10:00", "12:30", "15:30", "18:00", "20:30"],
  };
  let times = presets[count] ?? presets[3];

  if (workoutEnd) {
    const endMin = toMinutes(workoutEnd);
    const hasPostWorkout = times.some((t) => toMinutes(t) >= endMin);
    if (!hasPostWorkout) {
      const recoveryMin = endMin + 30;
      const hh = String(Math.floor(recoveryMin / 60) % 24).padStart(2, "0");
      const mm = String(recoveryMin % 60).padStart(2, "0");
      times = [...times, `${hh}:${mm}`].sort();
    }
  }
  return times;
}

export function copyTo(days: ScheduleDay[], from: number, toWeekdays: number[]): ScheduleDay[] {
  const src = days.find((d) => d.weekday === from);
  if (!src) return days;
  return days.map((d) =>
    toWeekdays.includes(d.weekday) && d.weekday !== from
      ? { ...src, weekday: d.weekday as ScheduleDay["weekday"] }
      : d
  );
}

/**
 * Decide which meal (if any) is the post-workout meal for a day. The
 * post-workout meal is the first meal that starts AFTER workout end time.
 */
export function postWorkoutMealIndex(day: ScheduleDay): number | null {
  if (!day.workoutStart || !day.workoutDurationMin) return null;
  const endMin = toMinutes(day.workoutStart) + day.workoutDurationMin;
  for (let i = 0; i < day.mealTimes.length; i++) {
    if (toMinutes(day.mealTimes[i]) >= endMin) return i;
  }
  return null;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
