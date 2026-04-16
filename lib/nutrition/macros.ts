export type MacroTarget = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};

export const KCAL = { protein: 4, fat: 9, carb: 4 } as const;

export function macrosFromKcal(params: {
  kcal: number;
  weightLb: number;
}): MacroTarget {
  const proteinG = Math.round(params.weightLb * 1);
  const fatG = Math.round(params.weightLb * 0.45);
  const remaining = params.kcal - proteinG * KCAL.protein - fatG * KCAL.fat;
  const carbG = Math.max(0, Math.round(remaining / KCAL.carb));
  return {
    kcal: Math.round(params.kcal),
    proteinG,
    fatG,
    carbG,
  };
}

export function kcalFromMacros(m: Omit<MacroTarget, "kcal">): number {
  return m.proteinG * KCAL.protein + m.fatG * KCAL.fat + m.carbG * KCAL.carb;
}
