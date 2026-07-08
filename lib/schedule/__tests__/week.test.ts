import { describe, expect, it } from "vitest";
import { copyTo, defaultMealTimes, postWorkoutMealIndex, toMinutes } from "../week";
import type { ScheduleDay } from "@/lib/db/schema";

function day(overrides: Partial<ScheduleDay> = {}): ScheduleDay {
  return {
    weekday: 1,
    mealTimes: ["08:00", "12:30", "18:30"],
    ...overrides,
  };
}

describe("defaultMealTimes", () => {
  it("returns the preset for each supported count", () => {
    expect(defaultMealTimes(1)).toEqual(["12:00"]);
    expect(defaultMealTimes(3)).toEqual(["08:00", "12:30", "18:30"]);
    expect(defaultMealTimes(6)).toHaveLength(6);
  });

  it("falls back to the 3-meal preset for unknown counts", () => {
    expect(defaultMealTimes(0)).toEqual(["08:00", "12:30", "18:30"]);
    expect(defaultMealTimes(9)).toEqual(["08:00", "12:30", "18:30"]);
  });

  it("keeps the preset when a meal already lands after workout end", () => {
    // 12:30 >= 12:00, so no recovery meal is inserted.
    expect(defaultMealTimes(3, "12:00")).toEqual(["08:00", "12:30", "18:30"]);
  });

  it("inserts a recovery meal 30 min after workout end when none exists", () => {
    expect(defaultMealTimes(3, "20:00")).toEqual(["08:00", "12:30", "18:30", "20:30"]);
  });

  it("keeps inserted recovery meals sorted", () => {
    const times = defaultMealTimes(2, "21:00"); // preset ["09:00","18:00"]
    expect(times).toEqual(["09:00", "18:00", "21:30"]);
    expect([...times].sort()).toEqual(times);
  });
});

describe("postWorkoutMealIndex", () => {
  it("is null without a workout", () => {
    expect(postWorkoutMealIndex(day())).toBeNull();
    expect(postWorkoutMealIndex(day({ workoutStart: "10:00" }))).toBeNull();
    expect(postWorkoutMealIndex(day({ workoutDurationMin: 60 }))).toBeNull();
  });

  it("returns the first meal at or after workout end", () => {
    // Ends 11:00 → first meal >= 11:00 is 12:30 (index 1).
    expect(
      postWorkoutMealIndex(day({ workoutStart: "10:00", workoutDurationMin: 60 }))
    ).toBe(1);
    // Meal exactly at workout end counts.
    expect(
      postWorkoutMealIndex(day({ workoutStart: "11:30", workoutDurationMin: 60 }))
    ).toBe(1);
  });

  it("is null when the workout ends after the last meal", () => {
    expect(
      postWorkoutMealIndex(day({ workoutStart: "19:00", workoutDurationMin: 60 }))
    ).toBeNull();
  });
});

describe("copyTo", () => {
  const week: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
    weekday: i as ScheduleDay["weekday"],
    mealTimes: i === 1 ? ["07:00", "13:00", "19:00"] : ["08:00", "12:30", "18:30"],
    ...(i === 1 ? { workoutStart: "17:00", workoutDurationMin: 60 } : {}),
  }));

  it("copies the source day's schedule to the given weekdays", () => {
    const out = copyTo(week, 1, [2, 4]);
    for (const wd of [2, 4]) {
      const d = out.find((x) => x.weekday === wd)!;
      expect(d.mealTimes).toEqual(["07:00", "13:00", "19:00"]);
      expect(d.workoutStart).toBe("17:00");
      expect(d.weekday).toBe(wd);
    }
    // Untouched days keep their schedule.
    expect(out.find((x) => x.weekday === 3)!.mealTimes).toEqual(["08:00", "12:30", "18:30"]);
  });

  it("never overwrites the source day itself", () => {
    const out = copyTo(week, 1, [1, 2]);
    expect(out.find((x) => x.weekday === 1)).toEqual(week.find((x) => x.weekday === 1));
  });

  it("is a no-op when the source weekday is missing", () => {
    expect(copyTo(week.slice(0, 3), 6, [0])).toEqual(week.slice(0, 3));
  });
});

describe("toMinutes", () => {
  it("parses HH:mm", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("08:05")).toBe(485);
    expect(toMinutes("23:59")).toBe(1439);
  });
});
