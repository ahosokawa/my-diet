import { describe, expect, it } from "vitest";
import type { Food, MealLog, Snack, Targets } from "@/lib/db/schema";
import { ANALYSIS_FILENAME, FOOD_LOG_FILENAME, buildAnalysisFiles, targetForDate } from "../analysis";
import type { EnvelopeTables } from "../envelope";

const NOW = new Date("2026-10-14T09:30:00").getTime();

function target(dateEffective: string, kcal: number): Targets {
  return {
    dateEffective,
    kcal,
    proteinG: 180,
    fatG: 80,
    carbG: 200,
    proteinPerLb: 1,
    fatPerLb: 0.45,
    rateLbPerWeek: -1,
    source: "auto",
  };
}

const chicken: Food = {
  id: 1,
  slug: "chicken",
  name: "Chicken breast",
  kcalPer100: 165,
  proteinPer100: 31,
  fatPer100: 3.6,
  carbPer100: 0,
  fiberPer100: 0,
  unit: "g",
  builtin: 1,
  favorite: 0,
};

const rice: Food = {
  id: 2,
  slug: "rice-custom",
  name: 'Rice, "jasmine"',
  kcalPer100: 130,
  proteinPer100: 2.7,
  fatPer100: 0.3,
  carbPer100: 28,
  fiberPer100: 0.4,
  unit: "g",
  builtin: 0,
  favorite: 0,
};

function meal(date: string, index: number, kcal: number, items = [{ foodId: 1, grams: 100 }]): MealLog {
  return { date, index, items, kcal, proteinG: 30, fatG: 10, carbG: 50, fiberG: 2, loggedAt: 0 };
}

function snack(date: string, time: string, kcal: number): Snack {
  return {
    id: 1,
    date,
    time,
    items: [{ foodId: 2, grams: 150 }],
    kcal,
    proteinG: 4,
    fatG: 0.5,
    carbG: 42,
    fiberG: 0.6,
    loggedAt: 0,
  };
}

function tables(over: Partial<EnvelopeTables> = {}): EnvelopeTables {
  return {
    profile: [
      {
        id: "me",
        sex: "male",
        age: 30,
        heightIn: 70,
        weightLb: 185,
        activity: "moderate",
        goal: "cut",
        goalStartDate: "2026-10-01",
        createdAt: 0,
      },
    ],
    targets: [target("2026-10-01", 2400), target("2026-10-10", 2300), target("2026-10-20", 2200)],
    foods: [chicken, rice],
    schedule: [{ weekday: 1, mealTimes: ["08:00", "12:00"], workoutStart: "17:00", workoutDurationMin: 60 }],
    mealLogs: [meal("2026-10-05", 0, 500), meal("2026-10-05", 1, 600), meal("2026-10-12", 0, 700)],
    snacks: [snack("2026-10-05", "15:30", 200)],
    weights: [
      { id: 1, date: "2026-10-05", lbs: 184 },
      { id: 2, date: "2026-10-06", lbs: 183 },
      { id: 3, date: "2026-10-12", lbs: 182 },
    ],
    combos: [],
    prefs: [],
    ...over,
  };
}

function csvBlock(md: string, heading: string): string[] {
  const section = md.split(`## ${heading}`)[1];
  const body = section.split("```csv\n")[1].split("\n```")[0];
  return body.split("\n");
}

describe("targetForDate", () => {
  const ts = [target("2026-10-10", 2300), target("2026-10-01", 2400)];

  it("picks the latest row effective on or before the date", () => {
    expect(targetForDate(ts, "2026-10-09")?.kcal).toBe(2400);
    expect(targetForDate(ts, "2026-10-10")?.kcal).toBe(2300);
  });

  it("falls back to the earliest row before any target", () => {
    expect(targetForDate(ts, "2026-09-01")?.kcal).toBe(2400);
  });
});

describe("buildAnalysisFiles", () => {
  it("sums meals and snacks per day with the target in effect", () => {
    const md = buildAnalysisFiles(tables(), NOW)[ANALYSIS_FILENAME];
    const rows = csvBlock(md, "Daily log");
    expect(rows[0]).toMatch(/^date,weekday,workout,meals_logged,snacks,kcal,/);
    // 500 + 600 + 200 kcal; 30+30+4 protein; target from the 10-01 row.
    expect(rows[1]).toBe("2026-10-05,Mon,17:00 (60 min),2,1,1300,64,142,20.5,4.6,2400,180,200,80,184,184");
    // Weigh-in only: blank intake, 7-day avg of 184 and 183.
    expect(rows[2]).toBe("2026-10-06,Tue,,0,0,,,,,,2400,180,200,80,183,183.5");
    expect(rows[3]).toMatch(/^2026-10-12,Mon,17:00 \(60 min\),1,0,700,.*,2300,180,200,80,182,182.5$/);
  });

  it("rolls weeks up from Monday with week-over-week weight change", () => {
    const rows = csvBlock(buildAnalysisFiles(tables(), NOW)[ANALYSIS_FILENAME], "Weekly summary");
    expect(rows[1]).toBe("2026-10-05,1,1300,64,142,20.5,4.6,2400,2,183.5,");
    expect(rows[2]).toBe("2026-10-12,1,700,30,50,10,2,2300,1,182,-1.5");
  });

  it("marks future-dated targets as pending and reports the current one", () => {
    const md = buildAnalysisFiles(tables(), NOW)[ANALYSIS_FILENAME];
    expect(csvBlock(md, "Targets history")[3]).toBe("2026-10-20,2200,180,200,80,-1,auto,pending");
    expect(md).toContain("Current daily target: 2300 kcal");
    expect(md).toContain(`Height: 5'10"`);
    expect(md).toContain("Latest weigh-in: 182 lb (2026-10-12)");
  });

  it("itemizes the food log with escaped names, scheduled meal times, and deleted foods", () => {
    const t = tables({ mealLogs: [meal("2026-10-05", 1, 0, [{ foodId: 1, grams: 200 }, { foodId: 99, grams: 50 }])] });
    const lines = buildAnalysisFiles(t, NOW)[FOOD_LOG_FILENAME].trim().split("\n");
    expect(lines[0]).toBe("date,slot,time,food,amount,unit,kcal,protein_g,carb_g,fat_g,fiber_g");
    expect(lines[1]).toBe("2026-10-05,meal 2,12:00,Chicken breast,200,g,330,62,0,7.2,0");
    expect(lines[2]).toBe("2026-10-05,meal 2,12:00,food #99 (deleted),50,g,,,,,");
    expect(lines[3]).toBe('2026-10-05,snack,15:30,"Rice, ""jasmine""",150,g,195,4.1,42,0.5,0.6');
  });

  it("handles an empty database", () => {
    const empty: EnvelopeTables = {
      profile: [],
      targets: [],
      foods: [],
      schedule: [],
      mealLogs: [],
      snacks: [],
      weights: [],
      combos: [],
      prefs: [],
    };
    const out = buildAnalysisFiles(empty, NOW);
    expect(out[ANALYSIS_FILENAME]).toContain("No profile yet");
    expect(csvBlock(out[ANALYSIS_FILENAME], "Daily log")).toHaveLength(1);
    expect(out[FOOD_LOG_FILENAME].trim().split("\n")).toHaveLength(1);
  });
});
