import type { NotifPrefs, ScheduleDay } from "../db/schema";

export type NotifKind = "meal" | "weighIn" | "review";

export type NotifEvent = {
  kind: NotifKind;
  fireAt: number;
  tag: string;
  title: string;
  body: string;
};

type Args = {
  now: Date;
  horizonDays: number;
  schedule: ScheduleDay[];
  prefs: NotifPrefs;
  reviewEligibleAt?: number;
};

export function upcomingEvents({
  now,
  horizonDays,
  schedule,
  prefs,
  reviewEligibleAt,
}: Args): NotifEvent[] {
  if (!prefs.enabled) return [];

  const byDay = new Map<number, ScheduleDay>();
  for (const d of schedule) byDay.set(d.weekday, d);

  const nowMs = now.getTime();
  const out: NotifEvent[] = [];

  for (let offset = 0; offset < horizonDays; offset++) {
    const date = addDays(startOfDay(now), offset);
    const weekday = date.getDay();
    const day = byDay.get(weekday);
    if (!day) continue;

    const ymd = ymdLocal(date);

    for (let i = 0; i < day.mealTimes.length; i++) {
      const fireAt = atTime(date, day.mealTimes[i]) - prefs.mealLeadMin * 60_000;
      if (fireAt <= nowMs) continue;
      const lead = prefs.mealLeadMin;
      out.push({
        kind: "meal",
        fireAt,
        tag: `meal-${ymd}-${i}`,
        title: `Meal ${i + 1} in ${lead} min`,
        body: `Scheduled for ${fmt12h(day.mealTimes[i])}. Tap to open.`,
      });
    }

    if (prefs.weighInEnabled) {
      const fireAt = atTime(date, prefs.weighInTime);
      if (fireAt > nowMs) {
        out.push({
          kind: "weighIn",
          fireAt,
          tag: `weighin-${ymd}`,
          title: "Morning weigh-in",
          body: "Step on the scale and log today's weight.",
        });
      }
    }

    if (prefs.reviewEnabled && weekday === 5) {
      const fireAt = atTime(date, prefs.reviewTime);
      const pastEligibility =
        reviewEligibleAt === undefined || fireAt >= reviewEligibleAt;
      if (fireAt > nowMs && pastEligibility) {
        out.push({
          kind: "review",
          fireAt,
          tag: `review-${ymd}`,
          title: "Weekly check-in",
          body: "Review your week and adjust targets.",
        });
      }
    }
  }

  out.sort((a, b) => a.fireAt - b.fireAt);
  return out;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function atTime(day: Date, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmt12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
