import { describe, expect, it } from "vitest";
import { upcomingEvents } from "../schedule";
import type { NotifPrefs, ScheduleDay } from "@/lib/db/schema";

const basePrefs: NotifPrefs = {
  id: "me",
  enabled: 1,
  mealLeadMin: 20,
  weighInEnabled: 1,
  weighInTime: "07:00",
  reviewEnabled: 1,
  reviewTime: "08:00",
};

function mkSchedule(overrides: Partial<Record<number, Partial<ScheduleDay>>> = {}): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  for (let w = 0; w < 7; w++) {
    days.push({
      weekday: w as ScheduleDay["weekday"],
      mealTimes: ["08:00", "12:00", "18:00"],
      ...(overrides[w] ?? {}),
    });
  }
  return days;
}

describe("upcomingEvents", () => {
  it("returns [] when disabled", () => {
    const now = new Date(2026, 3, 16, 6, 0); // Thu Apr 16 06:00
    const events = upcomingEvents({
      now,
      horizonDays: 7,
      schedule: mkSchedule(),
      prefs: { ...basePrefs, enabled: 0 },
    });
    expect(events).toEqual([]);
  });

  it("generates meal, weigh-in, and review events for the horizon", () => {
    const now = new Date(2026, 3, 16, 6, 0); // Thu 06:00 — weigh-in still ahead at 07:00
    const events = upcomingEvents({
      now,
      horizonDays: 7,
      schedule: mkSchedule(),
      prefs: basePrefs,
    });

    const byKind = events.reduce<Record<string, number>>((acc, e) => {
      acc[e.kind] = (acc[e.kind] ?? 0) + 1;
      return acc;
    }, {});

    // 3 meals * 7 days = 21, minus any past; weigh-in 7 days; review 1 (Friday 17th)
    expect(byKind.meal).toBe(21);
    expect(byKind.weighIn).toBe(7);
    expect(byKind.review).toBe(1);
  });

  it("skips past events on current day", () => {
    const now = new Date(2026, 3, 16, 9, 0); // Thu 09:00 — past 07:40 meal & 07:00 weigh-in
    const events = upcomingEvents({
      now,
      horizonDays: 1,
      schedule: mkSchedule(),
      prefs: basePrefs,
    });

    // First meal (lead 20min → 07:40) and weigh-in (07:00) have passed.
    expect(events.find((e) => e.tag === "meal-2026-04-16-0")).toBeUndefined();
    expect(events.find((e) => e.tag === "weighin-2026-04-16")).toBeUndefined();
    // But 12:00 meal (reminder at 11:40) and 18:00 meal (17:40) are future.
    expect(events.find((e) => e.tag === "meal-2026-04-16-1")).toBeDefined();
    expect(events.find((e) => e.tag === "meal-2026-04-16-2")).toBeDefined();
  });

  it("fires meal reminder at mealTime - leadMin", () => {
    const now = new Date(2026, 3, 16, 6, 0);
    const events = upcomingEvents({
      now,
      horizonDays: 1,
      schedule: mkSchedule(),
      prefs: { ...basePrefs, mealLeadMin: 30 },
    });
    const first = events.find((e) => e.tag === "meal-2026-04-16-0")!;
    // 08:00 - 30min = 07:30
    expect(new Date(first.fireAt).getHours()).toBe(7);
    expect(new Date(first.fireAt).getMinutes()).toBe(30);
  });

  it("omits review when reviewEligibleAt is after the firing time", () => {
    const now = new Date(2026, 3, 16, 6, 0); // Thursday
    // User signed up today → eligible at now+7d = Thursday Apr 23. Fri Apr 17 review should be skipped.
    const reviewEligibleAt = now.getTime() + 7 * 24 * 60 * 60 * 1000;
    const events = upcomingEvents({
      now,
      horizonDays: 7,
      schedule: mkSchedule(),
      prefs: basePrefs,
      reviewEligibleAt,
    });
    expect(events.find((e) => e.kind === "review" && e.tag === "review-2026-04-17")).toBeUndefined();
  });

  it("honors weighInEnabled=0 and reviewEnabled=0 toggles", () => {
    const now = new Date(2026, 3, 16, 6, 0);
    const events = upcomingEvents({
      now,
      horizonDays: 7,
      schedule: mkSchedule(),
      prefs: { ...basePrefs, weighInEnabled: 0, reviewEnabled: 0 },
    });
    expect(events.some((e) => e.kind === "weighIn")).toBe(false);
    expect(events.some((e) => e.kind === "review")).toBe(false);
  });

  it("emits sorted by fireAt", () => {
    const now = new Date(2026, 3, 16, 6, 0);
    const events = upcomingEvents({
      now,
      horizonDays: 3,
      schedule: mkSchedule(),
      prefs: basePrefs,
    });
    for (let i = 1; i < events.length; i++) {
      expect(events[i].fireAt).toBeGreaterThanOrEqual(events[i - 1].fireAt);
    }
  });

  it("uses deterministic tags", () => {
    const now = new Date(2026, 3, 16, 6, 0);
    const ev = upcomingEvents({
      now,
      horizonDays: 1,
      schedule: mkSchedule(),
      prefs: basePrefs,
    });
    const tags = ev.map((e) => e.tag).sort();
    expect(tags).toContain("meal-2026-04-16-0");
    expect(tags).toContain("meal-2026-04-16-2");
    expect(tags).toContain("weighin-2026-04-16");
  });
});
