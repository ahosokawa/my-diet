import { describe, it, expect } from "vitest";
import {
  currentReviewWeekStart,
  isReviewWindowOpen,
  wasReviewedThisWeek,
} from "../window";

// 2026-05-01 is a Friday. Use this as an anchor for week-aware tests.
const FRI = "2026-05-01";
const SAT = "2026-05-02";
const SUN = "2026-05-03";
const MON = "2026-05-04";
const TUE = "2026-05-05";
const WED = "2026-05-06";
const THU = "2026-05-07";
const NEXT_FRI = "2026-05-08";

describe("isReviewWindowOpen", () => {
  it("is open Friday through Sunday", () => {
    expect(isReviewWindowOpen(FRI)).toBe(true);
    expect(isReviewWindowOpen(SAT)).toBe(true);
    expect(isReviewWindowOpen(SUN)).toBe(true);
  });

  it("is closed Monday through Thursday", () => {
    expect(isReviewWindowOpen(MON)).toBe(false);
    expect(isReviewWindowOpen(TUE)).toBe(false);
    expect(isReviewWindowOpen(WED)).toBe(false);
    expect(isReviewWindowOpen(THU)).toBe(false);
  });
});

describe("currentReviewWeekStart", () => {
  it("returns today when today is Friday", () => {
    expect(currentReviewWeekStart(FRI)).toBe(FRI);
  });

  it("walks back to the Friday for Sat/Sun", () => {
    expect(currentReviewWeekStart(SAT)).toBe(FRI);
    expect(currentReviewWeekStart(SUN)).toBe(FRI);
  });

  it("walks back to the prior Friday for Mon-Thu", () => {
    expect(currentReviewWeekStart(MON)).toBe(FRI);
    expect(currentReviewWeekStart(TUE)).toBe(FRI);
    expect(currentReviewWeekStart(WED)).toBe(FRI);
    expect(currentReviewWeekStart(THU)).toBe(FRI);
  });
});

describe("wasReviewedThisWeek", () => {
  it("is false when never reviewed", () => {
    expect(wasReviewedThisWeek(undefined, FRI)).toBe(false);
  });

  it("is true when reviewed today (Friday)", () => {
    expect(wasReviewedThisWeek(FRI, FRI)).toBe(true);
  });

  it("is true through the following Thursday once reviewed", () => {
    expect(wasReviewedThisWeek(FRI, SAT)).toBe(true);
    expect(wasReviewedThisWeek(FRI, MON)).toBe(true);
    expect(wasReviewedThisWeek(FRI, THU)).toBe(true);
  });

  it("is false the next Friday onward", () => {
    expect(wasReviewedThisWeek(FRI, NEXT_FRI)).toBe(false);
  });

  it("is false when last review was two Fridays ago", () => {
    const TWO_FRI_AGO = "2026-04-24";
    expect(wasReviewedThisWeek(TWO_FRI_AGO, FRI)).toBe(false);
    expect(wasReviewedThisWeek(TWO_FRI_AGO, MON)).toBe(false);
  });
});
