/**
 * Food portion solver.
 *
 * Given foods with per-100g macros and a target (P, F, C), find grams x_i >= 0
 * minimizing weighted squared error:
 *   w_p (sum P_i x_i - P*)^2 + w_f (...) + w_c (...)
 *
 * Protein is weighted most, then carbs, then fat. Solved via projected
 * gradient descent on the quadratic — small N so a few hundred steps converge.
 */

import { KCAL } from "./macros";

export type FoodMacros = {
  proteinPer100: number;
  fatPer100: number;
  carbPer100: number;
};

export type SolverTarget = {
  proteinG: number;
  fatG: number;
  carbG: number;
};

export type SolverResult = {
  grams: number[];
  achieved: SolverTarget & { kcal: number };
};

const WEIGHTS = { protein: 3, fat: 1, carb: 2 };

export function solvePortions(
  foods: FoodMacros[],
  target: SolverTarget,
  opts: { maxGramsPerFood?: number; locked?: { grams: number; locked: boolean }[] } = {}
): SolverResult {
  const n = foods.length;
  const maxG = opts.maxGramsPerFood ?? 1500;

  if (n === 0) {
    return {
      grams: [],
      achieved: { proteinG: 0, fatG: 0, carbG: 0, kcal: 0 },
    };
  }

  const P = foods.map((f) => f.proteinPer100 / 100);
  const F = foods.map((f) => f.fatPer100 / 100);
  const C = foods.map((f) => f.carbPer100 / 100);

  const wP = WEIGHTS.protein;
  const wF = WEIGHTS.fat;
  const wC = WEIGHTS.carb;

  const locks = opts.locked ?? foods.map(() => ({ grams: 0, locked: false }));

  const x = new Array<number>(n);
  let lockedP = 0,
    lockedF = 0,
    lockedC = 0;
  const unlockedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (locks[i].locked) {
      x[i] = locks[i].grams;
      lockedP += P[i] * x[i];
      lockedF += F[i] * x[i];
      lockedC += C[i] * x[i];
    } else {
      unlockedIdx.push(i);
    }
  }

  const adjTarget = {
    proteinG: Math.max(0, target.proteinG - lockedP),
    fatG: Math.max(0, target.fatG - lockedF),
    carbG: Math.max(0, target.carbG - lockedC),
  };

  const uN = unlockedIdx.length;

  if (uN > 0) {
    const uP = mean(unlockedIdx.map((i) => P[i]));
    const initialGuess = adjTarget.proteinG / uN / Math.max(0.01, uP);
    for (const i of unlockedIdx) x[i] = initialGuess;

    const lMax =
      2 * (wP * sq(maxOf(unlockedIdx, P)) + wF * sq(maxOf(unlockedIdx, F)) + wC * sq(maxOf(unlockedIdx, C)));
    const step = 1 / Math.max(lMax * uN, 1e-3);

    for (let iter = 0; iter < 800; iter++) {
      let sumP = lockedP,
        sumF = lockedF,
        sumC = lockedC;
      for (const i of unlockedIdx) {
        sumP += P[i] * x[i];
        sumF += F[i] * x[i];
        sumC += C[i] * x[i];
      }
      const dP = sumP - target.proteinG;
      const dF = sumF - target.fatG;
      const dC = sumC - target.carbG;

      let maxGrad = 0;
      for (const i of unlockedIdx) {
        const grad = 2 * wP * P[i] * dP + 2 * wF * F[i] * dF + 2 * wC * C[i] * dC;
        if (Math.abs(grad) > maxGrad) maxGrad = Math.abs(grad);
        x[i] -= step * grad;
        if (x[i] < 0) x[i] = 0;
        if (x[i] > maxG) x[i] = maxG;
      }
      if (maxGrad < 1e-4) break;
    }
  }

  const rounded = x.map((g, i) => (locks[i].locked ? g : Math.round(g)));
  const proteinG = sumProd(P, rounded);
  const fatG = sumProd(F, rounded);
  const carbG = sumProd(C, rounded);
  return {
    grams: rounded,
    achieved: {
      proteinG: round1(proteinG),
      fatG: round1(fatG),
      carbG: round1(carbG),
      kcal: Math.round(proteinG * KCAL.protein + fatG * KCAL.fat + carbG * KCAL.carb),
    },
  };
}

function maxOf(idx: number[], arr: number[]): number {
  let m = 0;
  for (const i of idx) if (arr[i] > m) m = arr[i];
  return m;
}

export function macrosFor(foods: FoodMacros[], grams: number[]) {
  let p = 0,
    f = 0,
    c = 0;
  for (let i = 0; i < foods.length; i++) {
    p += (foods[i].proteinPer100 * grams[i]) / 100;
    f += (foods[i].fatPer100 * grams[i]) / 100;
    c += (foods[i].carbPer100 * grams[i]) / 100;
  }
  return {
    proteinG: round1(p),
    fatG: round1(f),
    carbG: round1(c),
    kcal: Math.round(p * KCAL.protein + f * KCAL.fat + c * KCAL.carb),
  };
}

function sumProd(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function mean(a: number[]): number {
  if (a.length === 0) return 0;
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function sq(x: number): number {
  return x * x;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
