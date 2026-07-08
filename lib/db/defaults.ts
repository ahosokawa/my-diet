import type { EnvelopeTables } from "@/lib/backup/envelope";
import type { Food, Profile, Targets } from "./schema";

// Idempotent per-table default appliers. Restoring a backup replays these
// unconditionally instead of mirroring the Dexie `.upgrade()` chain in
// lib/db/schema.ts — every `version(N)` migration there must have a matching
// `?? fallback` here so backups from any older schema normalize cleanly.

// v3: oils were reclassified from ml to g.
const OIL_SLUGS = ["olive-oil", "avocado-oil", "coconut-oil"];

export function withFoodDefaults(f: Food): Food {
  return {
    ...f,
    builtin: f.builtin ?? 0,
    favorite: f.favorite ?? 0, // v2
    unit: OIL_SLUGS.includes(f.slug) ? "g" : f.unit,
  };
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

export function withTargetsDefaults(t: Targets): Targets {
  return {
    ...t,
    // v6
    proteinPerLb: t.proteinPerLb ?? 1.0,
    fatPerLb: t.fatPerLb ?? 0.45,
  };
}

export function normalizeTables(tables: EnvelopeTables): EnvelopeTables {
  return {
    ...tables,
    profile: tables.profile.map(withProfileDefaults),
    targets: tables.targets.map(withTargetsDefaults),
    foods: tables.foods.map(withFoodDefaults),
  };
}
