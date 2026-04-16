export type Sex = "male" | "female";

export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const;

export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

const LB_PER_KG = 2.20462;
const IN_PER_CM = 0.393701;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function inToCm(inches: number): number {
  return inches / IN_PER_CM;
}

export function mifflinStJeorBmr(params: {
  sex: Sex;
  age: number;
  weightLb: number;
  heightIn: number;
}): number {
  const { sex, age, weightLb, heightIn } = params;
  const kg = lbToKg(weightLb);
  const cm = inToCm(heightIn);
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function tdee(params: {
  sex: Sex;
  age: number;
  weightLb: number;
  heightIn: number;
  activity: ActivityLevel;
}): number {
  return mifflinStJeorBmr(params) * ACTIVITY_FACTORS[params.activity];
}
