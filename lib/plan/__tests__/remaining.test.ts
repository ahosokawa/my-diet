import { describe, expect, it } from "vitest";
import { planRemaining } from "../remaining";
import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";

const daily = { kcal: 2400, proteinG: 180, fatG: 72, carbG: 258 };

const slots: MealSlot[] = [
  { index: 0, time: "08:00", postWorkout: false },
  { index: 1, time: "12:00", postWorkout: false },
  { index: 2, time: "15:30", postWorkout: true },
  { index: 3, time: "19:00", postWorkout: false },
];

const base = { daily, slots, postWorkoutCarbBias: 0.5, loggedMeals: [], snacks: [] };

describe("planRemaining", () => {
  it("matches the static split when nothing is eaten", () => {
    const plan = planRemaining(base);
    expect(plan.mealTargets).toEqual(distributeMeals(daily, slots));
    expect(plan.over).toEqual({ proteinG: 0, fatG: 0, carbG: 0 });
  });

  it("deducts snacks from the empty meals, keeping the totals exact", () => {
    const plan = planRemaining({
      ...base,
      snacks: [{ proteinG: 20, fatG: 8, carbG: 30.4 }],
    });
    const sum = (k: "proteinG" | "fatG" | "carbG") =>
      plan.mealTargets.reduce((s, m) => s + (m?.[k] ?? 0), 0);
    expect(sum("proteinG")).toBe(160);
    expect(sum("fatG")).toBe(64);
    expect(sum("carbG")).toBe(228);
  });

  it("re-splits the remainder over empty meals only, keeping post-workout bias", () => {
    const plan = planRemaining({
      ...base,
      loggedMeals: [{ index: 0, macros: { proteinG: 60, fatG: 20, carbG: 50 } }],
    });
    expect(plan.mealTargets[0]).toBeNull();
    const rest = plan.mealTargets.slice(1);
    expect(rest.reduce((s, m) => s + m!.proteinG, 0)).toBe(120);
    expect(rest.reduce((s, m) => s + m!.carbG, 0)).toBe(208);
    expect(rest[1]!.carbG).toBeGreaterThan(rest[0]!.carbG);
    expect(rest[1]!.carbG).toBeGreaterThan(rest[2]!.carbG);
  });

  it("treats openIndex as empty so the edited meal's target ignores its own foods", () => {
    const loggedMeals = [{ index: 1, macros: { proteinG: 80, fatG: 30, carbG: 100 } }];
    const asEmpty = planRemaining(base);
    const editing = planRemaining({ ...base, loggedMeals, openIndex: 1 });
    expect(editing.mealTargets[1]).toEqual(asEmpty.mealTargets[1]);
  });

  it("clamps overshoot to 0 and reports how far over", () => {
    const plan = planRemaining({
      ...base,
      snacks: [{ proteinG: 10, fatG: 80, carbG: 20 }],
    });
    expect(plan.over).toEqual({ proteinG: 0, fatG: 8, carbG: 0 });
    for (const m of plan.mealTargets) {
      expect(m!.fatG).toBe(0);
      expect(m!.kcal).toBe(m!.proteinG * 4 + m!.carbG * 4);
    }
  });

  it("gives a lone remaining post-workout meal all that's left", () => {
    const plan = planRemaining({
      ...base,
      loggedMeals: [0, 1, 3].map((index) => ({
        index,
        macros: { proteinG: 40, fatG: 15, carbG: 50 },
      })),
    });
    expect(plan.mealTargets[2]).toMatchObject({ proteinG: 60, fatG: 27, carbG: 108 });
  });

  it("reports overage even when every meal is logged", () => {
    const plan = planRemaining({
      ...base,
      loggedMeals: slots.map((s) => ({
        index: s.index,
        macros: { proteinG: 50, fatG: 18, carbG: 60 },
      })),
    });
    expect(plan.mealTargets.every((m) => m === null)).toBe(true);
    expect(plan.over).toEqual({ proteinG: 20, fatG: 0, carbG: 0 });
  });
});
