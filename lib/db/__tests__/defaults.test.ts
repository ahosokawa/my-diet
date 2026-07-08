import { describe, expect, it } from "vitest";
import { normalizeTables, withFoodDefaults, withProfileDefaults, withTargetsDefaults } from "../defaults";
import type { EnvelopeTables } from "@/lib/backup/envelope";
import type { Food, Profile, Targets } from "../schema";

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
});
