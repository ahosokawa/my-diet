import { describe, it, expect } from "vitest";
import { macrosFromKcal, kcalFromMacros } from "../macros";

describe("macrosFromKcal", () => {
  it("pins protein and fat, fills carbs", () => {
    const result = macrosFromKcal({ kcal: 2500, weightLb: 180 });
    expect(result.proteinG).toBe(180); // 1g/lb
    expect(result.fatG).toBe(81); // 0.45g/lb
    // remaining: 2500 - (180*4 + 81*9) = 2500 - 720 - 729 = 1051 → 1051/4 = 263 (rounded)
    expect(result.carbG).toBe(263);
  });

  it("clamps carbs to 0 when kcal is very low", () => {
    const result = macrosFromKcal({ kcal: 500, weightLb: 200 });
    expect(result.carbG).toBe(0);
  });
});

describe("kcalFromMacros", () => {
  it("computes correctly", () => {
    expect(kcalFromMacros({ proteinG: 180, fatG: 72, carbG: 283 })).toBe(
      180 * 4 + 72 * 9 + 283 * 4
    );
  });
});
