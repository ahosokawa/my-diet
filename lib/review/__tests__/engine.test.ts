import { describe, it, expect } from "vitest";
import { computeReview } from "../engine";

describe("computeReview", () => {
  const targets = { kcal: 2500, proteinG: 180, fatG: 72, carbG: 283 };

  it("maintains when weight is stable", () => {
    const result = computeReview({
      currentWeek: [180, 180.2, 179.8, 180.1, 180, 179.9, 180],
      previousWeek: [180, 180.1, 179.9, 180, 180.2, 179.8, 180],
      currentTargets: targets,
    });
    expect(result.verdict).toBe("maintain");
    expect(result.kcalDelta).toBe(0);
    expect(result.newTargets.proteinG).toBe(targets.proteinG);
  });

  it("suggests decrease when gaining weight", () => {
    const result = computeReview({
      currentWeek: [183, 183.5, 184, 183, 184, 183.5, 184],
      previousWeek: [180, 180, 180, 180, 180, 180, 180],
      currentTargets: targets,
    });
    expect(result.verdict).toBe("decrease");
    expect(result.kcalDelta).toBe(-150);
    expect(result.newTargets.carbG).toBeLessThan(targets.carbG);
    expect(result.newTargets.proteinG).toBe(targets.proteinG);
    expect(result.newTargets.fatG).toBe(targets.fatG);
  });

  it("suggests increase when losing weight", () => {
    const result = computeReview({
      currentWeek: [176, 175.5, 176, 175, 175.5, 175, 175],
      previousWeek: [180, 180, 180, 180, 180, 180, 180],
      currentTargets: targets,
    });
    expect(result.verdict).toBe("increase");
    expect(result.kcalDelta).toBe(150);
    expect(result.newTargets.carbG).toBeGreaterThan(targets.carbG);
  });
});
