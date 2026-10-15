import type { MealLogItem, ScheduleDay, Targets } from "@/lib/db/schema";
import { normalizeTables } from "@/lib/db/defaults";
import { formatYmd, parseYmd, shiftDate } from "@/lib/date";
import { trailingAvg } from "@/lib/weight/trend";
import type { EnvelopeTables } from "./envelope";

// Claude-facing export: a compact Markdown summary with CSV tables, plus an
// itemized food log. Written to Drive next to the raw backup so analysis
// sessions read pre-joined, human-unit data instead of the Dexie dump.

export const ANALYSIS_FILENAME = "my-diet-analysis.md";
export const FOOD_LOG_FILENAME = "my-diet-food-log.csv";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Cell = string | number | undefined;

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

function csvCell(v: Cell): string {
  if (v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

function fence(body: string): string {
  return "```csv\n" + body + "\n```";
}

// Pure mirror of getTargetsForDate (lib/db/repos.ts): the latest row
// effective on or before `date`, else the earliest row.
export function targetForDate(targets: Targets[], date: string): Targets | undefined {
  const sorted = [...targets].sort((a, b) => a.dateEffective.localeCompare(b.dateEffective));
  let active: Targets | undefined;
  for (const t of sorted) {
    if (t.dateEffective <= date) active = t;
    else break;
  }
  return active ?? sorted[0];
}

function weekStart(date: string): string {
  const dow = parseYmd(date).getDay();
  return shiftDate(date, -((dow + 6) % 7));
}

function workoutLabel(day: ScheduleDay | undefined): string {
  if (!day?.workoutStart) return "";
  return day.workoutDurationMin ? `${day.workoutStart} (${day.workoutDurationMin} min)` : day.workoutStart;
}

function formatHeight(inches: number): string {
  const ft = Math.floor(inches / 12);
  return `${ft}'${r1(inches - ft * 12)}"`;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatYmd(d)} ${hh}:${mm}`;
}

type Day = {
  date: string;
  meals: number;
  snacks: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  fiberG: number;
  weightLb?: number;
};

export function buildAnalysisFiles(
  raw: EnvelopeTables,
  now: number = Date.now()
): Record<typeof ANALYSIS_FILENAME | typeof FOOD_LOG_FILENAME, string> {
  const t = normalizeTables(raw);
  const today = formatYmd(new Date(now));
  const profile = t.profile[0];
  const scheduleByDow = new Map(t.schedule.map((d) => [d.weekday, d]));
  const foodsById = new Map(t.foods.map((f) => [f.id, f]));
  const weights = [...t.weights].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0)
  );

  // ---- Daily rollup -------------------------------------------------------
  const days = new Map<string, Day>();
  const day = (date: string): Day => {
    let d = days.get(date);
    if (!d) {
      d = { date, meals: 0, snacks: 0, kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };
      days.set(date, d);
    }
    return d;
  };
  for (const m of t.mealLogs) {
    if (!m.items.length) continue;
    const d = day(m.date);
    d.meals += 1;
    d.kcal += m.kcal;
    d.proteinG += m.proteinG;
    d.carbG += m.carbG;
    d.fatG += m.fatG;
    d.fiberG += m.fiberG ?? 0;
  }
  for (const s of t.snacks) {
    if (!s.items.length) continue;
    const d = day(s.date);
    d.snacks += 1;
    d.kcal += s.kcal;
    d.proteinG += s.proteinG;
    d.carbG += s.carbG;
    d.fatG += s.fatG;
    d.fiberG += s.fiberG;
  }
  // Later weigh-ins on the same date win.
  for (const w of weights) day(w.date).weightLb = w.lbs;

  const dayList = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const logged = (d: Day) => d.meals + d.snacks > 0;

  const dailyRows: Cell[][] = dayList.map((d) => {
    const dow = parseYmd(d.date).getDay();
    const tgt = targetForDate(t.targets, d.date);
    const avg = d.weightLb !== undefined ? trailingAvg(weights, d.date) : undefined;
    const ate = logged(d);
    return [
      d.date,
      WEEKDAYS[dow],
      workoutLabel(scheduleByDow.get(dow as ScheduleDay["weekday"])),
      d.meals,
      d.snacks,
      ate ? Math.round(d.kcal) : undefined,
      ate ? r1(d.proteinG) : undefined,
      ate ? r1(d.carbG) : undefined,
      ate ? r1(d.fatG) : undefined,
      ate ? r1(d.fiberG) : undefined,
      tgt?.kcal,
      tgt?.proteinG,
      tgt?.carbG,
      tgt?.fatG,
      d.weightLb,
      avg !== undefined ? r1(avg) : undefined,
    ];
  });

  // ---- Weekly rollup (Mon-start) -----------------------------------------
  const weeks = new Map<string, Day[]>();
  for (const d of dayList) {
    const k = weekStart(d.date);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  let prevAvgWeight: number | undefined;
  const weeklyRows: Cell[][] = [...weeks.entries()].map(([start, ds]) => {
    const ate = ds.filter(logged);
    const mean = (f: (d: Day) => number, xs: Day[]) =>
      xs.length ? xs.reduce((s, d) => s + f(d), 0) / xs.length : undefined;
    const weighed = ds.filter((d) => d.weightLb !== undefined);
    const avgWeight = mean((d) => d.weightLb!, weighed);
    const targetKcal = mean((d) => targetForDate(t.targets, d.date)?.kcal ?? 0, ate);
    const change =
      avgWeight !== undefined && prevAvgWeight !== undefined ? r1(avgWeight - prevAvgWeight) : undefined;
    if (avgWeight !== undefined) prevAvgWeight = avgWeight;
    const round = (n: number | undefined, f: (n: number) => number) => (n === undefined ? undefined : f(n));
    return [
      start,
      ate.length,
      round(mean((d) => d.kcal, ate), Math.round),
      round(mean((d) => d.proteinG, ate), r1),
      round(mean((d) => d.carbG, ate), r1),
      round(mean((d) => d.fatG, ate), r1),
      round(mean((d) => d.fiberG, ate), r1),
      round(targetKcal, Math.round),
      weighed.length,
      round(avgWeight, r1),
      change,
    ];
  });

  // ---- Food log -----------------------------------------------------------
  type Entry = { date: string; slot: string; time: string; items: MealLogItem[] };
  const entries: Entry[] = [
    ...t.mealLogs.map((m) => ({
      date: m.date,
      slot: `meal ${m.index + 1}`,
      time:
        scheduleByDow.get(parseYmd(m.date).getDay() as ScheduleDay["weekday"])?.mealTimes[m.index] ?? "",
      items: m.items,
    })),
    ...t.snacks.map((s) => ({ date: s.date, slot: "snack", time: s.time, items: s.items })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.slot.localeCompare(b.slot));

  const foodRows: Cell[][] = [];
  for (const e of entries) {
    for (const it of e.items) {
      const f = foodsById.get(it.foodId);
      const per = (v: number | undefined) => (f ? r1(((v ?? 0) * it.grams) / 100) : undefined);
      foodRows.push([
        e.date,
        e.slot,
        e.time,
        f?.name ?? `food #${it.foodId} (deleted)`,
        r1(it.grams),
        f?.unit ?? "g",
        per(f?.kcalPer100),
        per(f?.proteinPer100),
        per(f?.carbPer100),
        per(f?.fatPer100),
        per(f?.fiberPer100),
      ]);
    }
  }
  const foodLog = csv(
    ["date", "slot", "time", "food", "amount", "unit", "kcal", "protein_g", "carb_g", "fat_g", "fiber_g"],
    foodRows
  );

  // ---- Markdown -----------------------------------------------------------
  const lines: string[] = [];
  lines.push("# my-diet export", "");
  lines.push(`Generated ${formatTimestamp(now)} (device local time) by the my-diet app. Auto-synced after every change.`, "");
  lines.push(
    "## How to read this file",
    "",
    "- Units: body weight in lb; food amounts in grams (or ml where the unit says so); energy in kcal; macros in grams.",
    "- Dates are YYYY-MM-DD in local time. Weeks start Monday.",
    "- `fiber_g` is part of `carb_g` (already counted in carbs and kcal).",
    "- Daily targets are the target row in effect that day (see Targets history). Blank intake = nothing logged; a partially logged day undercounts.",
    "- `weight_7d_avg` = mean of weigh-ins dated within the 7 days ending that date.",
    `- Itemized foods per meal and snack: \`${FOOD_LOG_FILENAME}\` (same folder; meal times there are scheduled times, snack times are actual). Raw app backup: \`my-diet-backup.json\`.`,
    ""
  );

  lines.push("## Profile", "");
  if (profile) {
    const latest = weights[weights.length - 1];
    const cur = targetForDate(t.targets, today);
    lines.push(
      `- Sex: ${profile.sex} · Age: ${profile.age} · Height: ${formatHeight(profile.heightIn)}`,
      latest
        ? `- Latest weigh-in: ${latest.lbs} lb (${latest.date})`
        : `- Weight at intake: ${profile.weightLb} lb`,
      `- Activity level: ${profile.activity} · Goal: ${profile.goal} since ${profile.goalStartDate}`
    );
    if (cur) {
      lines.push(
        `- Current daily target: ${cur.kcal} kcal · protein ${cur.proteinG} g · carbs ${cur.carbG} g · fat ${cur.fatG} g · anchored to ${cur.rateLbPerWeek >= 0 ? "+" : ""}${cur.rateLbPerWeek} lb/week`
      );
    }
  } else {
    lines.push("No profile yet (onboarding not completed).");
  }
  lines.push("");

  lines.push("## Targets history", "");
  lines.push(
    fence(
      csv(
        ["date_effective", "kcal", "protein_g", "carb_g", "fat_g", "rate_lb_per_week", "source", "status"],
        [...t.targets]
          .sort((a, b) => a.dateEffective.localeCompare(b.dateEffective))
          .map((x) => [
            x.dateEffective,
            x.kcal,
            x.proteinG,
            x.carbG,
            x.fatG,
            x.rateLbPerWeek,
            x.source,
            x.dateEffective > today ? "pending" : "",
          ])
      )
    ),
    ""
  );

  lines.push("## Weekly schedule", "");
  if (t.schedule.length) {
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const d = scheduleByDow.get(dow as ScheduleDay["weekday"]);
      if (!d) continue;
      const w = workoutLabel(d);
      lines.push(`- ${WEEKDAYS[dow]}: meals ${d.mealTimes.join(", ") || "none"}${w ? ` · workout ${w}` : ""}`);
    }
  } else {
    lines.push("No schedule set.");
  }
  lines.push("");

  lines.push("## Weekly summary", "", "Averages are over days with any food logged.", "");
  lines.push(
    fence(
      csv(
        [
          "week_start",
          "days_logged",
          "avg_kcal",
          "avg_protein_g",
          "avg_carb_g",
          "avg_fat_g",
          "avg_fiber_g",
          "avg_target_kcal",
          "weigh_ins",
          "avg_weight_lb",
          "change_lb",
        ],
        weeklyRows
      )
    ),
    ""
  );

  lines.push("## Daily log", "");
  lines.push(
    fence(
      csv(
        [
          "date",
          "weekday",
          "workout",
          "meals_logged",
          "snacks",
          "kcal",
          "protein_g",
          "carb_g",
          "fat_g",
          "fiber_g",
          "target_kcal",
          "target_protein_g",
          "target_carb_g",
          "target_fat_g",
          "weight_lb",
          "weight_7d_avg",
        ],
        dailyRows
      )
    ),
    ""
  );

  return {
    [ANALYSIS_FILENAME]: lines.join("\n"),
    [FOOD_LOG_FILENAME]: foodLog + "\n",
  };
}
