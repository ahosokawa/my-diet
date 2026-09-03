import { describe, expect, it } from "vitest";
import type { WeightEntry } from "@/lib/db/schema";
import {
  effectiveWeightLb,
  maintenanceKcal,
  recentAvgWeight,
} from "../maintenance";

const profile = {
  sex: "male" as const,
  age: 30,
  heightIn: 70,
  weightLb: 180,
  activity: "moderate" as const,
};

function w(date: string, lbs: number): WeightEntry {
  return { date, lbs };
}

describe("recentAvgWeight", () => {
  it("averages the trailing 7 days, today inclusive", () => {
    const entries = [
      w("2026-09-02", 180),
      w("2026-09-01", 182),
      w("2026-08-27", 184),
    ];
    expect(recentAvgWeight(entries, "2026-09-02")).toBe(182);
  });

  it("ignores weigh-ins older than the window", () => {
    const entries = [w("2026-09-02", 180), w("2026-08-20", 200)];
    expect(recentAvgWeight(entries, "2026-09-02")).toBe(180);
  });

  it("ignores future weigh-ins", () => {
    const entries = [w("2026-09-03", 200), w("2026-09-02", 180)];
    expect(recentAvgWeight(entries, "2026-09-02")).toBe(180);
  });

  it("is null with no weigh-ins in the window", () => {
    expect(recentAvgWeight([], "2026-09-02")).toBeNull();
    expect(recentAvgWeight([w("2026-01-01", 180)], "2026-09-02")).toBeNull();
  });
});

describe("effectiveWeightLb", () => {
  it("prefers the 7-day average over the profile seed", () => {
    const entries = [w("2026-09-02", 175), w("2026-09-01", 177)];
    expect(effectiveWeightLb(profile, entries, "2026-09-02")).toBe(176);
  });

  it("falls back to the profile weight before any weigh-ins", () => {
    expect(effectiveWeightLb(profile, [], "2026-09-02")).toBe(180);
  });
});

describe("maintenanceKcal", () => {
  it("is the profile's TDEE at the supplied weight", () => {
    const at180 = maintenanceKcal(profile, 180);
    const at170 = maintenanceKcal(profile, 170);
    expect(at180).toBeGreaterThan(2600);
    expect(at180).toBeLessThan(2900);
    expect(at170).toBeLessThan(at180);
  });
});
