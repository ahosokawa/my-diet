import { parseYmd, shiftDate } from "@/lib/date";

const FRIDAY = 5;

export function isReviewWindowOpen(today: string): boolean {
  const dow = parseYmd(today).getDay();
  return dow === FRIDAY || dow === 6 || dow === 0;
}

export function currentReviewWeekStart(today: string): string {
  const dow = parseYmd(today).getDay();
  // Most recent Friday (today if Friday). Sun=0 → 2 days back; Sat=6 → 1; Fri=5 → 0; else Thu=4 → 6 back.
  const back = (dow - FRIDAY + 7) % 7;
  return shiftDate(today, -back);
}

export function wasReviewedThisWeek(
  lastReviewedDate: string | undefined,
  today: string
): boolean {
  if (!lastReviewedDate) return false;
  return lastReviewedDate >= currentReviewWeekStart(today);
}
