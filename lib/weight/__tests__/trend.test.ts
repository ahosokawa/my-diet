import { describe, expect, it } from "vitest";
import { goalAnchorWeightLb, trailingAvg } from "../trend";
import type { WeightEntry } from "../../db/schema";

function e(date: string, lbs: number): WeightEntry {
  return { date, lbs };
}

describe("trailingAvg", () => {
  it("averages entries in the 7-day window ending at the date", () => {
    const entries = [
      e("2026-07-07", 180),
      e("2026-07-10", 182),
      e("2026-07-13", 184),
    ];
    expect(trailingAvg(entries, "2026-07-13")).toBeCloseTo(182);
  });

  it("excludes entries outside the window", () => {
    const entries = [
      e("2026-07-06", 100), // 8 days before → out
      e("2026-07-14", 100), // after endDate → out
      e("2026-07-13", 184),
    ];
    expect(trailingAvg(entries, "2026-07-13")).toBe(184);
  });

  it("returns undefined when the window is empty", () => {
    expect(trailingAvg([e("2026-07-01", 180)], "2026-07-13")).toBeUndefined();
  });
});

describe("goalAnchorWeightLb", () => {
  it("uses the 7-day average, not a single spike on goal-start day", () => {
    const entries = [
      e("2026-07-10", 181.6),
      e("2026-07-11", 182.5),
      e("2026-07-12", 183.6),
      e("2026-07-13", 184.9), // spike
    ];
    const anchor = goalAnchorWeightLb(entries, "2026-07-13");
    expect(anchor).toBeCloseTo((181.6 + 182.5 + 183.6 + 184.9) / 4);
    expect(anchor).toBeLessThan(184.9);
  });

  it("falls back to the week after goal start when no prior entries exist", () => {
    const entries = [e("2026-07-14", 181), e("2026-07-16", 183)];
    expect(goalAnchorWeightLb(entries, "2026-07-13")).toBeCloseTo(182);
  });

  it("returns undefined when no entries are within a week either side", () => {
    const entries = [e("2026-08-01", 181)];
    expect(goalAnchorWeightLb(entries, "2026-07-13")).toBeUndefined();
  });
});
