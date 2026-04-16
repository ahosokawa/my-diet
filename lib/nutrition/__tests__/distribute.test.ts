import { describe, it, expect } from "vitest";
import { distributeMeals, type MealSlot } from "../distribute";

describe("distributeMeals", () => {
  const daily = { kcal: 2500, proteinG: 180, fatG: 72, carbG: 283 };

  it("splits evenly when no workout", () => {
    const slots: MealSlot[] = [
      { index: 0, time: "08:00", postWorkout: false },
      { index: 1, time: "12:00", postWorkout: false },
      { index: 2, time: "18:00", postWorkout: false },
    ];
    const result = distributeMeals(daily, slots);
    expect(result).toHaveLength(3);
    const totalP = result.reduce((s, m) => s + m.proteinG, 0);
    expect(totalP).toBeCloseTo(daily.proteinG, 0);
  });

  it("shifts carbs to post-workout meal", () => {
    const slots: MealSlot[] = [
      { index: 0, time: "08:00", postWorkout: false },
      { index: 1, time: "12:00", postWorkout: false },
      { index: 2, time: "18:00", postWorkout: true },
    ];
    const result = distributeMeals(daily, slots);
    expect(result[2].carbG).toBeGreaterThan(result[0].carbG);
  });

  it("returns empty for no slots", () => {
    expect(distributeMeals(daily, [])).toEqual([]);
  });
});
