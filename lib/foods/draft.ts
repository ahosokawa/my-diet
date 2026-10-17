import type { Food } from "@/lib/db/schema";

export type CustomFoodInput = Pick<
  Food,
  "name" | "kcalPer100" | "proteinPer100" | "fatPer100" | "carbPer100" | "fiberPer100" | "unit" | "category" | "servingSize"
>;

export type CustomDraft = {
  name: string;
  // Numeric fields hold the raw input string so partial entries like "4."
  // survive re-render; they're parsed on save.
  servingSize: string;
  kcalPerServing: string;
  proteinPerServing: string;
  fatPerServing: string;
  carbPerServing: string;
  fiberPerServing: string; // optional; blank means unknown, counted as 0
  unit: "g" | "ml";
  category: string;
};

export const EMPTY_CUSTOM: CustomDraft = {
  name: "",
  servingSize: "",
  kcalPerServing: "",
  proteinPerServing: "",
  fatPerServing: "",
  carbPerServing: "",
  fiberPerServing: "",
  unit: "g",
  category: "other",
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmt(n: number): string {
  return String(round1(n));
}

// Foods saved before serving sizes were stored open at a 100 g serving.
export function draftFromFood(f: Food): CustomDraft {
  const size = f.servingSize ?? 100;
  const k = size / 100;
  return {
    name: f.name,
    servingSize: fmt(size),
    kcalPerServing: fmt(f.kcalPer100 * k),
    proteinPerServing: fmt(f.proteinPer100 * k),
    fatPerServing: fmt(f.fatPer100 * k),
    carbPerServing: fmt(f.carbPer100 * k),
    fiberPerServing: f.fiberPer100 === undefined ? "" : fmt(f.fiberPer100 * k),
    unit: f.unit,
    category: f.category ?? "other",
  };
}

const NUTRITION_FIELDS = [
  "servingSize",
  "kcalPerServing",
  "proteinPerServing",
  "fatPerServing",
  "carbPerServing",
  "fiberPerServing",
  "unit",
] as const;

/**
 * Parse a draft into per-100 values, or null if it's incomplete/invalid.
 * When editing, an untouched nutrition block keeps `original`'s exact per-100
 * values — re-deriving them from the rounded per-serving strings could drift
 * by 0.1 and fork a new food version for a rename.
 */
export function inputFromDraft(d: CustomDraft, original?: Food): CustomFoodInput | null {
  const size = Number(d.servingSize);
  const kcal = Number(d.kcalPerServing);
  const protein = Number(d.proteinPerServing);
  const fat = Number(d.fatPerServing);
  const carb = Number(d.carbPerServing);
  const hasFiber = d.fiberPerServing.trim() !== "";
  const fiber = Number(d.fiberPerServing);
  if (
    !d.name.trim() ||
    !d.servingSize.trim() ||
    !Number.isFinite(size) ||
    size <= 0 ||
    [d.kcalPerServing, d.proteinPerServing, d.fatPerServing, d.carbPerServing].some((v) => !v.trim()) ||
    [kcal, protein, fat, carb].some((n) => !Number.isFinite(n) || n < 0) ||
    (hasFiber && (!Number.isFinite(fiber) || fiber < 0))
  )
    return null;
  const meta = { name: d.name.trim(), category: d.category };
  if (original) {
    const initial = draftFromFood(original);
    if (NUTRITION_FIELDS.every((k) => d[k] === initial[k])) {
      return {
        ...meta,
        kcalPer100: original.kcalPer100,
        proteinPer100: original.proteinPer100,
        fatPer100: original.fatPer100,
        carbPer100: original.carbPer100,
        ...(original.fiberPer100 !== undefined ? { fiberPer100: original.fiberPer100 } : {}),
        unit: original.unit,
        ...(original.servingSize !== undefined ? { servingSize: original.servingSize } : {}),
      };
    }
  }
  const factor = 100 / size;
  return {
    ...meta,
    kcalPer100: round1(kcal * factor),
    proteinPer100: round1(protein * factor),
    fatPer100: round1(fat * factor),
    carbPer100: round1(carb * factor),
    ...(hasFiber ? { fiberPer100: round1(fiber * factor) } : {}),
    unit: d.unit,
    servingSize: size,
  };
}

/** Whether going from `f` to `input` changes what a gram of the food is. */
export function nutritionChanged(f: Food, input: CustomFoodInput): boolean {
  return (
    f.kcalPer100 !== input.kcalPer100 ||
    f.proteinPer100 !== input.proteinPer100 ||
    f.fatPer100 !== input.fatPer100 ||
    f.carbPer100 !== input.carbPer100 ||
    f.fiberPer100 !== input.fiberPer100 ||
    f.unit !== input.unit
  );
}
