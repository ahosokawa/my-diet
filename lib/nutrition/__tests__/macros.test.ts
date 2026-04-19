import { describe, it, expect } from "vitest";
import { macrosFromKcal, kcalFromMacros, kcalForGoal } from "../macros";

describe("macrosFromKcal", () => {
  it("pins protein and fat at defaults, fills carbs", () => {
    const result = macrosFromKcal({ kcal: 2500, weightLb: 180 });
    expect(result.proteinG).toBe(180); // 1g/lb
    expect(result.fatG).toBe(81); // 0.45g/lb
    // remaining: 2500 - (180*4 + 81*9) = 2500 - 720 - 729 = 1051 → 1051/4 = 263 (rounded)
    expect(result.carbG).toBe(263);
  });

  it("respects custom g/lb multipliers", () => {
    const result = macrosFromKcal({
      kcal: 2500,
      weightLb: 180,
      proteinPerLb: 0.8,
      fatPerLb: 0.35,
    });
    expect(result.proteinG).toBe(144);
    expect(result.fatG).toBe(63);
    // remaining: 2500 - (144*4 + 63*9) = 2500 - 576 - 567 = 1357 → 339
    expect(result.carbG).toBe(339);
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

describe("kcalForGoal", () => {
  it("returns TDEE (rounded to 10) for maintain", () => {
    expect(kcalForGoal({ tdee: 2487, weightLb: 180, goal: "maintain" })).toBe(2490);
  });

  it("subtracts for cut at target rate (0.75%/wk loss)", () => {
    // 180 lb × -0.0075 × 3500 / 7 ≈ -675/day → 2500 - 675 = 1825 → rounds to 1830
    const result = kcalForGoal({ tdee: 2500, weightLb: 180, goal: "cut" });
    expect(result).toBe(1830);
  });

  it("adds for bulk at target rate (0.375%/wk gain)", () => {
    // 180 × 0.00375 × 3500 / 7 ≈ +337.5/day → 2500 + 337.5 = 2837.5 → rounds to 2840
    const result = kcalForGoal({ tdee: 2500, weightLb: 180, goal: "bulk" });
    expect(result).toBe(2840);
  });
});
