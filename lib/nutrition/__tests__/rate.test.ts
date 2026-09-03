import { describe, expect, it } from "vitest";
import {
  KCAL_PER_LB_PER_WEEK,
  clampRate,
  classifyRate,
  goalForRate,
  kcalForRate,
  rateForKcal,
  recommendedRate,
  RATE_SLIDER,
} from "../rate";

describe("kcalForRate / rateForKcal", () => {
  it("costs 500 kcal/day per lb/week", () => {
    expect(KCAL_PER_LB_PER_WEEK).toBe(500);
    expect(kcalForRate(2500, -1)).toBe(2000);
    expect(kcalForRate(2500, 0.5)).toBe(2750);
  });

  it("holds maintenance at a zero rate", () => {
    expect(kcalForRate(2540, 0)).toBe(2540);
  });

  it("rounds the target to 10 kcal", () => {
    expect(kcalForRate(2543, 0)).toBe(2540);
    expect(kcalForRate(2547, 0)).toBe(2550);
  });

  it("round-trips a rate through calories, within the 10 kcal grain", () => {
    for (const rate of [-1.5, -0.8, -0.25, 0, 0.3, 1]) {
      expect(rateForKcal(2500, kcalForRate(2500, rate))).toBeCloseTo(rate, 1);
    }
  });

  it("is idempotent on the calorie number", () => {
    for (const kcal of [1800, 2140, 2370, 2540, 3000]) {
      expect(kcalForRate(2500, rateForKcal(2500, kcal))).toBe(kcal);
    }
  });

  it("snaps a hand-typed number onto the 10 kcal grid", () => {
    expect(kcalForRate(2500, rateForKcal(2500, 2375))).toBe(2380);
  });

  it("recovers the rate a hand-set calorie number implies", () => {
    expect(rateForKcal(2540, 2140)).toBe(-0.8);
    expect(rateForKcal(2540, 2540)).toBe(0);
    expect(rateForKcal(2540, 2790)).toBe(0.5);
  });
});

describe("recommendedRate", () => {
  it("uses the goal's target band at the given bodyweight", () => {
    expect(recommendedRate("cut", 200)).toBe(-1.5); // -0.75%/wk
    expect(recommendedRate("maintain", 200)).toBe(0);
    expect(recommendedRate("bulk", 200)).toBe(0.76); // +0.375%/wk, on the 0.02 grid
  });

  it("scales with bodyweight, snapped to the slider step", () => {
    expect(recommendedRate("cut", 150)).toBe(-1.12); // -1.125 snapped to 0.02
    expect(recommendedRate("bulk", 160)).toBe(0.6);
  });
});

describe("classifyRate", () => {
  const W = 200;

  it("derives the goal from the direction of the rate", () => {
    expect(goalForRate(-1, W)).toBe("cut");
    expect(goalForRate(1, W)).toBe("bulk");
    expect(goalForRate(0, W)).toBe("maintain");
  });

  it("treats only a near-flat rate as maintenance", () => {
    expect(goalForRate(-0.05, W)).toBe("maintain");
    expect(goalForRate(0.05, W)).toBe("maintain");
    // A deliberate half-pound a week is a direction, not maintenance.
    expect(goalForRate(-0.5, W)).toBe("cut");
    expect(goalForRate(0.5, W)).toBe("bulk");
  });

  it("flags cuts outside the 0.5–1.0%/wk band", () => {
    expect(classifyRate(-1.5, W).status).toBe("in_band"); // -0.75%/wk
    expect(classifyRate(-2.5, W).status).toBe("aggressive"); // -1.25%/wk
    expect(classifyRate(-0.8, W).status).toBe("conservative"); // -0.4%/wk
    expect(classifyRate(-0.8, W).goal).toBe("cut");
  });

  it("flags bulks outside the 0.25–0.5%/wk band", () => {
    expect(classifyRate(0.75, W).status).toBe("in_band");
    expect(classifyRate(1.5, W).status).toBe("aggressive");
    expect(classifyRate(0.4, W).status).toBe("conservative");
  });

  it("never flags maintenance", () => {
    expect(classifyRate(0, W).status).toBe("in_band");
    expect(classifyRate(0.05, W).status).toBe("in_band");
  });

  it("reports the rate as a fraction of bodyweight", () => {
    expect(classifyRate(-1.5, 200).pctPerWeek).toBeCloseTo(-0.0075, 5);
  });

  it("survives a zero bodyweight", () => {
    expect(classifyRate(-1, 0)).toEqual({
      goal: "maintain",
      pctPerWeek: 0,
      status: "in_band",
    });
  });

  it("keeps the goal label in step with the slider's own defaults", () => {
    for (const goal of ["cut", "maintain", "bulk"] as const) {
      const rate = recommendedRate(goal, W);
      expect(goalForRate(rate, W)).toBe(goal);
      expect(classifyRate(rate, W).status).toBe("in_band");
    }
  });
});

describe("slider grid", () => {
  it("steps the slider in whole 10 kcal increments", () => {
    const maintenance = 2500;
    for (let i = 0; i < 20; i++) {
      const rate = Number((RATE_SLIDER.min + i * RATE_SLIDER.step).toFixed(2));
      expect(kcalForRate(maintenance, rate) % 10).toBe(0);
      // Adjacent slider positions are exactly one calorie step apart.
      const next = Number((rate + RATE_SLIDER.step).toFixed(2));
      expect(kcalForRate(maintenance, next) - kcalForRate(maintenance, rate)).toBe(10);
    }
  });

  it("puts every recommended rate on a slider step", () => {
    for (const weightLb of [140, 150, 165, 180, 210]) {
      for (const goal of ["cut", "maintain", "bulk"] as const) {
        const rate = recommendedRate(goal, weightLb);
        expect(Math.abs(rate / RATE_SLIDER.step - Math.round(rate / RATE_SLIDER.step))).
          toBeLessThan(1e-9);
      }
    }
  });
});

describe("clampRate", () => {
  it("holds the slider domain", () => {
    expect(clampRate(-5)).toBe(RATE_SLIDER.min);
    expect(clampRate(5)).toBe(RATE_SLIDER.max);
    expect(clampRate(-0.8)).toBe(-0.8);
  });
});
