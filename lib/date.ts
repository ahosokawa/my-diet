export function todayStr(): string {
  return formatYmd(new Date());
}

export function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Noon parse avoids DST edge cases shifting a YYYY-MM-DD into the previous day.
export function parseYmd(s: string): Date {
  return new Date(s + "T12:00:00");
}

export function shiftDate(s: string, days: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + days);
  return formatYmd(d);
}

export function minutesToHhmm(min: number): string {
  const h = String(Math.floor(min / 60) % 24).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}
