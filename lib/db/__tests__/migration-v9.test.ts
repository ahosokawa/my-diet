import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

// Build a v8 database the way an existing install has it, then open it with
// the real schema so the v9 fiber upgrade runs.
describe("v9 fiber migration", () => {
  it("backfills builtin food fiber and every meal log's fiberG", async () => {
    const old = new Dexie("my-diet");
    old.version(8).stores({
      profile: "id",
      targets: "++id, dateEffective",
      foods: "++id, &slug, name, builtin, favorite, category",
      schedule: "weekday",
      mealLogs: "++id, [date+index], date",
      weights: "++id, &date",
      combos: "++id, name, createdAt",
      prefs: "id",
      backup: "id",
    });
    await old.open();
    const base = { proteinPer100: 0, fatPer100: 0, unit: "g", favorite: 0 };
    await old.table("foods").bulkAdd([
      { ...base, id: 1, slug: "oats-dry", name: "Rolled oats (dry)", kcalPer100: 379, carbPer100: 67.7, builtin: 1 },
      { ...base, id: 2, slug: "custom-1", name: "My bar", kcalPer100: 400, carbPer100: 40, builtin: 0 },
    ]);
    await old.table("mealLogs").add({
      date: "2026-10-01",
      index: 0,
      items: [
        { foodId: 1, grams: 80 },
        { foodId: 2, grams: 50 },
        { foodId: 99, grams: 100 }, // deleted food
      ],
      kcal: 0,
      proteinG: 0,
      fatG: 0,
      carbG: 0,
      loggedAt: 0,
    });
    old.close();

    const { db } = await import("../schema");
    const oats = await db.foods.get(1);
    const custom = await db.foods.get(2);
    expect(oats?.fiberPer100).toBe(10.1);
    expect(custom?.fiberPer100).toBeUndefined();

    const [log] = await db.mealLogs.toArray();
    expect(log.fiberG).toBe(8.1); // 80g oats × 10.1/100; custom & deleted count as 0
  });
});
