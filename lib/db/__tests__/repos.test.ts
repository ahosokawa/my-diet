import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../schema";
import {
  deleteMealLog,
  getCurrentTargets,
  getProfile,
  getTargetsForDate,
  listFoods,
  logMeal,
  saveProfile,
  saveTargets,
  syncBuiltinFoods,
} from "../repos";
import seedFoods from "../seed-foods.json";
import type { Profile, Targets } from "../schema";

const baseProfile: Omit<Profile, "id" | "createdAt"> = {
  sex: "male",
  age: 30,
  heightIn: 70,
  weightLb: 180,
  activity: "moderate",
  goal: "maintain",
  goalStartDate: "2026-01-01",
};

function makeTargets(dateEffective: string, kcal: number): Omit<Targets, "id"> {
  return {
    dateEffective,
    kcal,
    proteinG: 180,
    fatG: 72,
    carbG: Math.max(0, Math.round((kcal - 180 * 4 - 72 * 9) / 4)),
    proteinPerLb: 1.0,
    fatPerLb: 0.45,
    source: "auto",
  };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("saveProfile", () => {
  it("fills createdAt when the caller passes undefined", async () => {
    await saveProfile({ ...baseProfile, createdAt: undefined });
    const p = await getProfile();
    expect(typeof p?.createdAt).toBe("number");
    expect(p?.createdAt).toBeGreaterThan(0);
  });

  it("preserves an explicit createdAt", async () => {
    await saveProfile({ ...baseProfile, createdAt: 1234567890 });
    expect((await getProfile())?.createdAt).toBe(1234567890);
  });
});

describe("getTargetsForDate", () => {
  beforeEach(async () => {
    await saveTargets(makeTargets("2026-01-01", 2400));
    await saveTargets(makeTargets("2026-02-01", 2250));
  });

  it("returns the latest row effective on or before the date", async () => {
    expect((await getTargetsForDate("2026-01-15"))?.kcal).toBe(2400);
    expect((await getTargetsForDate("2026-02-01"))?.kcal).toBe(2250);
    expect((await getTargetsForDate("2026-03-01"))?.kcal).toBe(2250);
  });

  it("falls back to the earliest pending row for dates before all targets", async () => {
    expect((await getTargetsForDate("2025-12-01"))?.kcal).toBe(2400);
  });

  it("backs getCurrentTargets", async () => {
    expect((await getCurrentTargets())?.kcal).toBe(2250);
  });
});

describe("saveTargets", () => {
  it("replaces the row for the same effective date instead of duplicating", async () => {
    await saveTargets(makeTargets("2026-02-01", 2250));
    await saveTargets(makeTargets("2026-02-01", 2100));
    const rows = await db.targets.where("dateEffective").equals("2026-02-01").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].kcal).toBe(2100);
  });
});

describe("logMeal", () => {
  const entry = {
    date: "2026-07-08",
    index: 0,
    items: [{ foodId: 1, grams: 150 }],
    kcal: 250,
    proteinG: 45,
    fatG: 5,
    carbG: 2,
  };

  it("upserts by [date+index]", async () => {
    await logMeal(entry);
    await logMeal({ ...entry, items: [{ foodId: 2, grams: 80 }], kcal: 300 });
    const rows = await db.mealLogs.where("[date+index]").equals(["2026-07-08", 0]).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].kcal).toBe(300);
    expect(rows[0].items).toEqual([{ foodId: 2, grams: 80 }]);
  });

  it("keeps separate rows for different meal indexes", async () => {
    await logMeal(entry);
    await logMeal({ ...entry, index: 1 });
    expect(await db.mealLogs.count()).toBe(2);
  });

  it("round-trips locked flags on items", async () => {
    await logMeal({
      ...entry,
      items: [
        { foodId: 1, grams: 150, locked: 1 },
        { foodId: 2, grams: 80, locked: 0 },
      ],
    });
    const row = await db.mealLogs.where("[date+index]").equals(["2026-07-08", 0]).first();
    expect(row?.items).toEqual([
      { foodId: 1, grams: 150, locked: 1 },
      { foodId: 2, grams: 80, locked: 0 },
    ]);
  });
});

describe("deleteMealLog", () => {
  const entry = {
    date: "2026-07-08",
    index: 0,
    items: [{ foodId: 1, grams: 150 }],
    kcal: 250,
    proteinG: 45,
    fatG: 5,
    carbG: 2,
  };

  it("deletes only the [date+index] row", async () => {
    await logMeal(entry);
    await logMeal({ ...entry, index: 1 });
    await deleteMealLog("2026-07-08", 0);
    const rows = await db.mealLogs.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].index).toBe(1);
  });

  it("is a no-op when the row does not exist", async () => {
    await logMeal(entry);
    await deleteMealLog("2026-07-08", 5);
    expect(await db.mealLogs.count()).toBe(1);
  });
});

describe("syncBuiltinFoods", () => {
  it("seeds everything into an empty table", async () => {
    await syncBuiltinFoods();
    expect(await db.foods.count()).toBe(seedFoods.length);
  });

  it("adds only missing builtins and never touches existing rows", async () => {
    await syncBuiltinFoods();
    const all = await listFoods();
    const victim = all[0];
    const kept = all[1];
    await db.foods.delete(victim.id!);
    await db.foods.update(kept.id!, { favorite: 1 });

    await syncBuiltinFoods();
    expect(await db.foods.count()).toBe(seedFoods.length);
    const restored = await db.foods.where("slug").equals(victim.slug).first();
    expect(restored).toBeDefined();
    const keptAfter = await db.foods.get(kept.id!);
    expect(keptAfter?.favorite).toBe(1);
  });

  it("leaves custom foods alone", async () => {
    await syncBuiltinFoods();
    await db.foods.add({
      slug: "custom-1",
      name: "My shake",
      kcalPer100: 100,
      proteinPer100: 10,
      fatPer100: 2,
      carbPer100: 8,
      unit: "ml",
      builtin: 0,
      favorite: 0,
    });
    await syncBuiltinFoods();
    expect(await db.foods.count()).toBe(seedFoods.length + 1);
  });
});
