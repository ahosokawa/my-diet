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

  it("honors postWorkoutCarbBias=0 (option disabled)", () => {
    const slots: MealSlot[] = [
      { index: 0, time: "08:00", postWorkout: false },
      { index: 1, time: "12:00", postWorkout: false },
      { index: 2, time: "18:00", postWorkout: true },
    ];
    const result = distributeMeals(daily, slots, { postWorkoutCarbBias: 0 });
    // With bias=0 the post-workout meal gets no boost; rounding may differ by 1g.
    for (const meal of result) {
      expect(Math.abs(meal.carbG - result[0].carbG)).toBeLessThanOrEqual(1);
    }
  });

  it("honors a custom postWorkoutCarbBias value", () => {
    const slots: MealSlot[] = [
      { index: 0, time: "08:00", postWorkout: false },
      { index: 1, time: "12:00", postWorkout: false },
      { index: 2, time: "18:00", postWorkout: true },
    ];
    const stronger = distributeMeals(daily, slots, { postWorkoutCarbBias: 1.0 });
    const defaultBias = distributeMeals(daily, slots);
    expect(stronger[2].carbG).toBeGreaterThan(defaultBias[2].carbG);
  });

  it("per-meal grams sum exactly to the daily target for every macro", () => {
    const makeSlots = (n: number, pwIndex: number | null): MealSlot[] =>
      Array.from({ length: n }, (_, i) => ({
        index: i,
        time: `${String(8 + i * 3).padStart(2, "0")}:00`,
        postWorkout: i === pwIndex,
      }));

    // Deliberately awkward grams that don't divide evenly.
    const dailies = [
      { kcal: 2500, proteinG: 181, fatG: 71, carbG: 283 },
      { kcal: 2000, proteinG: 170, fatG: 65, carbG: 197 },
      { kcal: 3100, proteinG: 200, fatG: 90, carbG: 313 },
    ];
    for (const d of dailies) {
      for (const n of [3, 4, 5]) {
        for (const pw of [null, 0, n - 1]) {
          const meals = distributeMeals(d, makeSlots(n, pw));
          const sum = (k: "proteinG" | "fatG" | "carbG") =>
            meals.reduce((s, m) => s + m[k], 0);
          const label = `n=${n} pw=${pw} daily=${JSON.stringify(d)}`;
          expect(sum("proteinG"), label).toBe(d.proteinG);
          expect(sum("fatG"), label).toBe(d.fatG);
          expect(sum("carbG"), label).toBe(d.carbG);
          for (const m of meals) {
            expect(m.proteinG, label).toBeGreaterThanOrEqual(0);
            expect(m.carbG, label).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("keeps the post-workout carb boost after exact rounding", () => {
    const slots: MealSlot[] = [
      { index: 0, time: "08:00", postWorkout: false },
      { index: 1, time: "12:00", postWorkout: true },
      { index: 2, time: "18:00", postWorkout: false },
    ];
    const meals = distributeMeals(daily, slots);
    expect(meals[1].carbG).toBeGreaterThan(meals[0].carbG);
    expect(meals[1].carbG).toBeGreaterThan(meals[2].carbG);
    expect(meals.reduce((s, m) => s + m.carbG, 0)).toBe(daily.carbG);
  });
});
