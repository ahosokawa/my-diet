import { describe, it, expect } from "vitest";
import { solvePortions, macrosFor } from "../solver";

describe("solvePortions", () => {
  it("finds reasonable portions for chicken + rice + broccoli", () => {
    const foods = [
      { proteinPer100: 31, fatPer100: 3.6, carbPer100: 0 }, // chicken
      { proteinPer100: 2.7, fatPer100: 0.3, carbPer100: 28 }, // white rice
      { proteinPer100: 2.8, fatPer100: 0.4, carbPer100: 6.6 }, // broccoli
    ];
    const target = { proteinG: 45, fatG: 15, carbG: 60 };
    const result = solvePortions(foods, target);

    expect(result.grams[0]).toBeGreaterThan(50);
    expect(result.grams[1]).toBeGreaterThan(50);
    expect(result.achieved.proteinG).toBeCloseTo(target.proteinG, -1);
    expect(result.achieved.carbG).toBeCloseTo(target.carbG, -1);
  });

  it("handles single food", () => {
    const foods = [{ proteinPer100: 85, fatPer100: 1, carbPer100: 6 }]; // whey
    const target = { proteinG: 40, fatG: 0, carbG: 0 };
    const result = solvePortions(foods, target);
    expect(result.grams[0]).toBeGreaterThan(40);
    expect(result.grams[0]).toBeLessThan(60);
  });

  it("returns empty for no foods", () => {
    const result = solvePortions([], { proteinG: 40, fatG: 10, carbG: 50 });
    expect(result.grams).toEqual([]);
  });

  it("respects locked foods", () => {
    const foods = [
      { proteinPer100: 2.8, fatPer100: 0.4, carbPer100: 6.6 }, // cabbage
      { proteinPer100: 31, fatPer100: 3.6, carbPer100: 0 }, // chicken
      { proteinPer100: 2.7, fatPer100: 0.3, carbPer100: 28 }, // rice
    ];
    const target = { proteinG: 45, fatG: 15, carbG: 60 };
    const result = solvePortions(foods, target, {
      locked: [
        { grams: 100, locked: true },
        { grams: 0, locked: false },
        { grams: 0, locked: false },
      ],
    });
    expect(result.grams[0]).toBe(100);
    expect(result.grams[1]).toBeGreaterThan(50);
    expect(result.grams[2]).toBeGreaterThan(50);
    expect(result.achieved.proteinG).toBeCloseTo(target.proteinG, -1);
    expect(result.achieved.carbG).toBeCloseTo(target.carbG, -1);
  });
});

describe("macrosFor", () => {
  it("computes totals from grams", () => {
    const foods = [{ proteinPer100: 31, fatPer100: 3.6, carbPer100: 0 }];
    const result = macrosFor(foods, [200]);
    expect(result.proteinG).toBe(62);
    expect(result.fatG).toBe(7.2);
    expect(result.carbG).toBe(0);
    expect(result.kcal).toBe(Math.round(62 * 4 + 7.2 * 9 + 0));
  });
});
