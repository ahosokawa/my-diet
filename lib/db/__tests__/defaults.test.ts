import { describe, expect, it } from "vitest";
import { mealLogFiberG, normalizeTables, withFoodDefaults, withProfileDefaults, withTargetsDefaults } from "../defaults";
import type { EnvelopeTables } from "@/lib/backup/envelope";
import type { Food, MealLog, Profile, Targets } from "../schema";

// Rows as they'd appear in a pre-v6 backup: fields added by later schema
// versions are absent at runtime even though the TS types require them.
const v1Profile = {
  id: "me",
  sex: "male",
  age: 30,
  heightIn: 70,
  weightLb: 180,
  activity: "moderate",
  createdAt: Date.parse("2025-06-01T12:00:00Z"),
} as Profile;

const v1Targets = {
  id: 1,
  dateEffective: "2025-06-01",
  kcal: 2400,
  proteinG: 180,
  fatG: 81,
  carbG: 238,
  source: "auto",
} as Targets;

const v1Food = {
  id: 1,
  slug: "olive-oil",
  name: "Olive oil",
  kcalPer100: 884,
  proteinPer100: 0,
  fatPer100: 100,
  carbPer100: 0,
  unit: "ml",
  builtin: 1,
} as Food;

describe("withProfileDefaults", () => {
  it("fills v6/v7 fields from a v1 profile", () => {
    const p = withProfileDefaults(v1Profile);
    expect(p.goal).toBe("maintain");
    expect(p.goalStartDate).toBe("2025-06-01");
    expect(p.enablePostWorkoutCarbBias).toBe(true);
  });

  it("preserves existing values (idempotent)", () => {
    const modern: Profile = {
      ...v1Profile,
      goal: "cut",
      goalStartDate: "2026-01-15",
      enablePostWorkoutCarbBias: false,
    };
    expect(withProfileDefaults(modern)).toEqual(modern);
    expect(withProfileDefaults(withProfileDefaults(v1Profile))).toEqual(
      withProfileDefaults(v1Profile)
    );
  });
});

describe("withTargetsDefaults", () => {
  it("fills v6 ratio fields", () => {
    const t = withTargetsDefaults(v1Targets);
    expect(t.proteinPerLb).toBe(1.0);
    expect(t.fatPerLb).toBe(0.45);
  });

  it("preserves existing ratios", () => {
    const t = withTargetsDefaults({ ...v1Targets, proteinPerLb: 0.8, fatPerLb: 0.3 });
    expect(t.proteinPerLb).toBe(0.8);
    expect(t.fatPerLb).toBe(0.3);
  });
});

describe("withFoodDefaults", () => {
  it("fills v2 favorite and applies the v3 oil-unit fix", () => {
    const f = withFoodDefaults(v1Food);
    expect(f.favorite).toBe(0);
    expect(f.unit).toBe("g");
  });

  it("leaves non-oil units alone and keeps favorites", () => {
    const milk = withFoodDefaults({ ...v1Food, slug: "milk", unit: "ml", favorite: 1 });
    expect(milk.unit).toBe("ml");
    expect(milk.favorite).toBe(1);
  });

  it("fills v9 fiber for builtins from the seed list, not for custom foods", () => {
    const oats = withFoodDefaults({ ...v1Food, slug: "oats-dry", unit: "g" });
    expect(oats.fiberPer100).toBe(10.1);
    const custom = withFoodDefaults({ ...v1Food, slug: "custom-1", builtin: 0 });
    expect(custom.fiberPer100).toBeUndefined();
    const kept = withFoodDefaults({ ...v1Food, slug: "oats-dry", fiberPer100: 9 });
    expect(kept.fiberPer100).toBe(9);
  });
});

describe("mealLogFiberG", () => {
  it("counts foods without fiber, and deleted foods, as 0", () => {
    const foods = [
      { ...v1Food, id: 1, fiberPer100: 10 },
      { ...v1Food, id: 2 },
    ];
    expect(
      mealLogFiberG(
        [
          { foodId: 1, grams: 55 },
          { foodId: 2, grams: 100 },
          { foodId: 3, grams: 100 },
        ],
        foods
      )
    ).toBe(5.5);
  });
});

describe("normalizeTables", () => {
  it("normalizes every row and passes other tables through untouched", () => {
    const tables: EnvelopeTables = {
      profile: [v1Profile],
      targets: [v1Targets],
      foods: [v1Food],
      schedule: [{ weekday: 0, mealTimes: ["08:00"] }],
      mealLogs: [],
      weights: [{ id: 1, date: "2025-06-01", lbs: 180 }],
      combos: [],
      prefs: [],
    };
    const out = normalizeTables(tables);
    expect(out.profile[0].goal).toBe("maintain");
    expect(out.targets[0].proteinPerLb).toBe(1.0);
    expect(out.foods[0].favorite).toBe(0);
    expect(out.schedule).toBe(tables.schedule);
    expect(out.weights).toBe(tables.weights);
    // Sorting by favorite must not NaN-compare after normalization.
    expect(out.foods[0].favorite - out.foods[0].favorite).toBe(0);
  });

  it("backfills meal log fiber from the normalized builtin foods", () => {
    const oats = { ...v1Food, id: 7, slug: "oats-dry", unit: "g" } as Food;
    const log = {
      id: 1,
      date: "2025-06-01",
      index: 0,
      items: [{ foodId: 7, grams: 50 }],
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbG: 0,
      loggedAt: 0,
    } as MealLog;
    const out = normalizeTables({
      profile: [],
      targets: [],
      foods: [oats],
      schedule: [],
      mealLogs: [log, { ...log, id: 2, fiberG: 3 }],
      weights: [],
      combos: [],
      prefs: [],
    });
    expect(out.mealLogs[0].fiberG).toBe(5.1);
    expect(out.mealLogs[1].fiberG).toBe(3);
  });
});
