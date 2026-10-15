import type { EnvelopeTables } from "@/lib/backup/envelope";
import { maintenanceKcal } from "@/lib/nutrition/maintenance";
import { rateForKcal } from "@/lib/nutrition/rate";
import type { Food, MealLog, MealLogItem, Profile, Targets } from "./schema";
import seedFoods from "./seed-foods.json";

// Idempotent per-table default appliers. Restoring a backup replays these
// unconditionally instead of mirroring the Dexie `.upgrade()` chain in
// lib/db/schema.ts — every `version(N)` migration there must have a matching
// `?? fallback` here so backups from any older schema normalize cleanly.

// v3: oils were reclassified from ml to g.
const OIL_SLUGS = ["olive-oil", "avocado-oil", "coconut-oil"];

// v9: builtin foods gained fiber from the seed list.
const SEED_FIBER = new Map(
  (seedFoods as Food[]).map((f) => [f.slug, f.fiberPer100 ?? 0])
);

export function builtinFiberPer100(slug: string): number | undefined {
  return SEED_FIBER.get(slug);
}

// Fiber for a logged meal, from current food rows. Foods without a fiber
// value (or since deleted) count as 0.
export function mealLogFiberG(items: MealLogItem[], foods: Food[]): number {
  const fiberById = new Map(foods.map((f) => [f.id, f.fiberPer100 ?? 0]));
  const total = items.reduce(
    (sum, it) => sum + ((fiberById.get(it.foodId) ?? 0) * it.grams) / 100,
    0
  );
  return Math.round(total * 10) / 10;
}

export function withFoodDefaults(f: Food): Food {
  const out: Food = {
    ...f,
    builtin: f.builtin ?? 0,
    favorite: f.favorite ?? 0, // v2
    unit: OIL_SLUGS.includes(f.slug) ? "g" : f.unit,
  };
  // v9
  if (out.fiberPer100 === undefined && out.builtin === 1) {
    const fiber = builtinFiberPer100(out.slug);
    if (fiber !== undefined) out.fiberPer100 = fiber;
  }
  return out;
}

// Needs the already-normalized foods so builtin fiber is in place.
export function withMealLogDefaults(m: MealLog, foods: Food[]): MealLog {
  return { ...m, fiberG: m.fiberG ?? mealLogFiberG(m.items, foods) }; // v9
}

export function withProfileDefaults(p: Profile): Profile {
  return {
    ...p,
    // v6
    goal: p.goal ?? "maintain",
    goalStartDate:
      p.goalStartDate ??
      new Date(p.createdAt ?? Date.now()).toISOString().slice(0, 10),
    // v7
    enablePostWorkoutCarbBias: p.enablePostWorkoutCarbBias ?? true,
  };
}

export function withTargetsDefaults(t: Targets, profile?: Profile): Targets {
  return {
    ...t,
    // v6
    proteinPerLb: t.proteinPerLb ?? 1.0,
    fatPerLb: t.fatPerLb ?? 0.45,
    // v8: recover the anchor from the kcal the row already carries, so a
    // restored backup keeps the exact target it was taken with.
    rateLbPerWeek:
      t.rateLbPerWeek ??
      (profile ? rateForKcal(maintenanceKcal(profile, profile.weightLb), t.kcal) : 0),
  };
}

export function normalizeTables(tables: EnvelopeTables): EnvelopeTables {
  const profile = tables.profile.map(withProfileDefaults);
  const foods = tables.foods.map(withFoodDefaults);
  return {
    ...tables,
    profile,
    targets: tables.targets.map((t) => withTargetsDefaults(t, profile[0])),
    foods,
    mealLogs: tables.mealLogs.map((m) => withMealLogDefaults(m, foods)),
  };
}
