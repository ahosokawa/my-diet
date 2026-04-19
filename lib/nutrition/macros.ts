export type Goal = "cut" | "maintain" | "bulk";

export type MacroTarget = {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
};

export const KCAL = { protein: 4, fat: 9, carb: 4 } as const;

export const DEFAULT_PROTEIN_PER_LB = 1.0;
export const DEFAULT_FAT_PER_LB = 0.45;

// Healthy weekly bodyweight-change rates (fraction/wk).
// Sources: ACSM position stand on weight loss (0.5–1%/wk); Helms/Aragon/Schoenfeld natural-lifter reviews on lean bulking (~0.25–0.5%/wk).
export const RATE_BANDS: Record<Goal, { min: number; max: number; target: number }> = {
  cut: { min: -0.010, max: -0.005, target: -0.0075 },
  maintain: { min: -0.003, max: 0.003, target: 0 },
  bulk: { min: 0.0025, max: 0.005, target: 0.00375 },
};

const KCAL_PER_LB_FAT = 3500;

export function macrosFromKcal(params: {
  kcal: number;
  weightLb: number;
  proteinPerLb?: number;
  fatPerLb?: number;
}): MacroTarget {
  const proteinPerLb = params.proteinPerLb ?? DEFAULT_PROTEIN_PER_LB;
  const fatPerLb = params.fatPerLb ?? DEFAULT_FAT_PER_LB;
  const proteinG = Math.round(params.weightLb * proteinPerLb);
  const fatG = Math.round(params.weightLb * fatPerLb);
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

export function kcalForGoal(params: {
  tdee: number;
  weightLb: number;
  goal: Goal;
}): number {
  const rate = RATE_BANDS[params.goal].target;
  const dailyDelta = (params.weightLb * rate * KCAL_PER_LB_FAT) / 7;
  return Math.round((params.tdee + dailyDelta) / 10) * 10;
}
