import { describe, it, expect } from "vitest";
import { computeReview, MIN_SAMPLES } from "../engine";

const targets = { kcal: 2500, proteinG: 180, fatG: 72, carbG: 283 };

describe("computeReview — low-data guard", () => {
  it("forces maintain when the current week has too few weigh-ins", () => {
    const result = computeReview({
      currentWeek: [184], // one noisy sample that would otherwise flip the verdict
      previousWeek: [180, 180, 180, 180],
      currentTargets: targets,
      goal: "maintain",
    });
    expect(result.lowData).toBe(true);
    expect(result.verdict).toBe("maintain");
    expect(result.kcalDelta).toBe(0);
    expect(result.newTargets).toEqual(targets);
    expect(result.rateFlag).toBeNull();
  });

  it("forces maintain when the previous week has too few weigh-ins", () => {
    const result = computeReview({
      currentWeek: [180, 180, 180, 180],
      previousWeek: Array(MIN_SAMPLES - 1).fill(184),
      currentTargets: targets,
      goal: "cut",
    });
    expect(result.lowData).toBe(true);
    expect(result.verdict).toBe("maintain");
  });

  it("adjusts normally at exactly MIN_SAMPLES per week", () => {
    const result = computeReview({
      currentWeek: Array(MIN_SAMPLES).fill(183),
      previousWeek: Array(MIN_SAMPLES).fill(180),
      currentTargets: targets,
      goal: "maintain",
    });
    expect(result.lowData).toBe(false);
    expect(result.verdict).toBe("decrease");
  });
});

describe("computeReview — carb floor clamp", () => {
  it("keeps kcal in sync with macros when carbs clamp to 0", () => {
    const lowCarb = { kcal: 1800, proteinG: 180, fatG: 104, carbG: 20 };
    const result = computeReview({
      currentWeek: [183, 183, 183, 183],
      previousWeek: [180, 180, 180, 180],
      currentTargets: lowCarb,
      goal: "maintain",
    });
    expect(result.verdict).toBe("decrease");
    expect(result.newTargets.carbG).toBe(0);
    // kcal drops only by the carbs actually removed (20g × 4), not the full 150.
    expect(result.newTargets.kcal).toBe(1800 - 20 * 4);
  });
});

describe("computeReview — maintain goal", () => {
  it("maintains when weight is stable", () => {
    const result = computeReview({
      currentWeek: [180, 180.2, 179.8, 180.1, 180, 179.9, 180],
      previousWeek: [180, 180.1, 179.9, 180, 180.2, 179.8, 180],
      currentTargets: targets,
      goal: "maintain",
    });
    expect(result.verdict).toBe("maintain");
    expect(result.kcalDelta).toBe(0);
    expect(result.rateFlag).toBe("in_band");
    expect(result.newTargets.proteinG).toBe(targets.proteinG);
  });

  it("suggests decrease when gaining weight", () => {
    const result = computeReview({
      currentWeek: [183, 183.5, 184, 183, 184, 183.5, 184],
      previousWeek: [180, 180, 180, 180, 180, 180, 180],
      currentTargets: targets,
      goal: "maintain",
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
      goal: "maintain",
    });
    expect(result.verdict).toBe("increase");
    expect(result.kcalDelta).toBe(150);
    expect(result.newTargets.carbG).toBeGreaterThan(targets.carbG);
  });
});

describe("computeReview — cut goal", () => {
  it("holds steady when losing in the 0.5–1.0%/wk band", () => {
    // ~0.75%/wk loss: 200 → 198.5
    const result = computeReview({
      currentWeek: [198.5, 198.5, 198.5, 198.5, 198.5, 198.5, 198.5],
      previousWeek: [200, 200, 200, 200, 200, 200, 200],
      currentTargets: targets,
      goal: "cut",
    });
    expect(result.verdict).toBe("maintain");
    expect(result.rateFlag).toBe("in_band");
    expect(result.kcalDelta).toBe(0);
  });

  it("deepens deficit when losing too slowly", () => {
    // ~0.2%/wk loss: 200 → 199.6
    const result = computeReview({
      currentWeek: [199.6, 199.6, 199.6, 199.6, 199.6, 199.6, 199.6],
      previousWeek: [200, 200, 200, 200, 200, 200, 200],
      currentTargets: targets,
      goal: "cut",
    });
    expect(result.verdict).toBe("decrease");
    expect(result.rateFlag).toBe("too_slow");
    expect(result.kcalDelta).toBe(-150);
  });

  it("raises kcal when losing too fast (health guard)", () => {
    // ~1.5%/wk loss: 200 → 197
    const result = computeReview({
      currentWeek: [197, 197, 197, 197, 197, 197, 197],
      previousWeek: [200, 200, 200, 200, 200, 200, 200],
      currentTargets: targets,
      goal: "cut",
    });
    expect(result.verdict).toBe("increase");
    expect(result.rateFlag).toBe("too_fast");
    expect(result.kcalDelta).toBe(150);
  });

  it("deepens deficit when gaining (way off goal)", () => {
    const result = computeReview({
      currentWeek: [201, 201, 201, 201, 201, 201, 201],
      previousWeek: [200, 200, 200, 200, 200, 200, 200],
      currentTargets: targets,
      goal: "cut",
    });
    expect(result.verdict).toBe("decrease");
    expect(result.rateFlag).toBe("too_slow");
  });
});

describe("computeReview — bulk goal", () => {
  it("holds steady when gaining in the 0.25–0.5%/wk band", () => {
    // ~0.375%/wk gain: 180 → 180.675
    const result = computeReview({
      currentWeek: [180.7, 180.7, 180.7, 180.7, 180.7, 180.7, 180.7],
      previousWeek: [180, 180, 180, 180, 180, 180, 180],
      currentTargets: targets,
      goal: "bulk",
    });
    expect(result.verdict).toBe("maintain");
    expect(result.rateFlag).toBe("in_band");
  });

  it("raises kcal when gaining too slowly", () => {
    // ~0.1%/wk gain
    const result = computeReview({
      currentWeek: [180.18, 180.18, 180.18, 180.18, 180.18, 180.18, 180.18],
      previousWeek: [180, 180, 180, 180, 180, 180, 180],
      currentTargets: targets,
      goal: "bulk",
    });
    expect(result.verdict).toBe("increase");
    expect(result.rateFlag).toBe("too_slow");
    expect(result.kcalDelta).toBe(150);
  });

  it("trims surplus when gaining too fast", () => {
    // ~1%/wk gain
    const result = computeReview({
      currentWeek: [181.8, 181.8, 181.8, 181.8, 181.8, 181.8, 181.8],
      previousWeek: [180, 180, 180, 180, 180, 180, 180],
      currentTargets: targets,
      goal: "bulk",
    });
    expect(result.verdict).toBe("decrease");
    expect(result.rateFlag).toBe("too_fast");
    expect(result.kcalDelta).toBe(-150);
  });
});
