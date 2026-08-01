import type { WeightEntry } from "../db/schema";
import { shiftDate } from "../date";

export const TREND_WINDOW_DAYS = 7;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Mean of weigh-ins dated within the 7-day window ending at `endDate`
// (inclusive). Windows go by date, not sample count, so missed days
// shrink the sample rather than reaching further back.
export function trailingAvg(
  entries: WeightEntry[],
  endDate: string,
): number | undefined {
  const from = shiftDate(endDate, -(TREND_WINDOW_DAYS - 1));
  const inWindow = entries.filter((e) => e.date >= from && e.date <= endDate);
  return inWindow.length ? mean(inWindow.map((e) => e.lbs)) : undefined;
}

// Anchor weight for the goal-rate corridor. A single weigh-in is too noisy
// to hang the whole band from (a water-weight spike on goal-start day shifts
// every projected week by the same offset), so anchor to the 7-day average
// ending at goal start; fall back to the week after when the goal predates
// the first weigh-ins.
export function goalAnchorWeightLb(
  entries: WeightEntry[],
  goalStartDate: string,
): number | undefined {
  const before = trailingAvg(entries, goalStartDate);
  if (before !== undefined) return before;
  const to = shiftDate(goalStartDate, TREND_WINDOW_DAYS - 1);
  const after = entries.filter((e) => e.date >= goalStartDate && e.date <= to);
  return after.length ? mean(after.map((e) => e.lbs)) : undefined;
}
