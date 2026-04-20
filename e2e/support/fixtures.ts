import type { Envelope, EnvelopeTables } from "@/lib/backup/envelope";
import { SCHEMA_VERSION } from "@/lib/backup/envelope";
import type {
  Food,
  MealLog,
  NotifPrefs,
  Profile,
  ScheduleDay,
  Targets,
  WeightEntry,
} from "@/lib/db/schema";
import { shiftDate, parseYmd } from "@/lib/date";
import seedFoods from "@/lib/db/seed-foods.json";

const APP_VERSION = "e2e";

function emptyTables(): EnvelopeTables {
  return {
    profile: [],
    targets: [],
    foods: [],
    schedule: [],
    mealLogs: [],
    weights: [],
    combos: [],
    prefs: [],
  };
}

export function defaultPrefs(): NotifPrefs {
  return {
    id: "me",
    enabled: 0,
    mealLeadMin: 20,
    weighInEnabled: 1,
    weighInTime: "07:00",
    reviewEnabled: 1,
    reviewTime: "08:00",
  };
}

export function seededFoods(): Food[] {
  const rows = seedFoods as Array<Omit<Food, "id" | "builtin" | "favorite">>;
  return rows.map((f, i) => ({
    ...f,
    id: i + 1,
    builtin: 1,
    favorite: 0,
  }));
}

export function defaultSchedule(): ScheduleDay[] {
  const times = ["08:00", "12:30", "18:30"];
  return Array.from({ length: 7 }, (_, i) => ({
    weekday: i as ScheduleDay["weekday"],
    mealTimes: times,
  }));
}

function envelope(tables: EnvelopeTables): Envelope {
  return {
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    tables,
  };
}

export function makeFresh(): Envelope {
  return envelope(emptyTables());
}

export type MidWeekOpts = {
  today: string;
  weightLb?: number;
  kcal?: number;
};

export function makeDay3MidWeek({ today, weightLb = 180, kcal = 2400 }: MidWeekOpts): Envelope {
  const createdAt = parseYmd(shiftDate(today, -3)).getTime();
  const goalStartDate = shiftDate(today, -3);

  const profile: Profile = {
    id: "me",
    sex: "male",
    age: 30,
    heightIn: 70,
    weightLb,
    activity: "moderate",
    goal: "maintain",
    goalStartDate,
    createdAt,
  };

  const proteinG = Math.round(weightLb * 1.0);
  const fatG = Math.round(weightLb * 0.45);
  const remaining = kcal - proteinG * 4 - fatG * 9;
  const carbG = Math.max(0, Math.round(remaining / 4));

  const targets: Targets = {
    id: 1,
    dateEffective: goalStartDate,
    kcal,
    proteinG,
    fatG,
    carbG,
    proteinPerLb: 1.0,
    fatPerLb: 0.45,
    source: "auto",
  };

  const weights: WeightEntry[] = [
    { id: 1, date: shiftDate(today, -3), lbs: weightLb },
    { id: 2, date: shiftDate(today, -2), lbs: weightLb - 0.2 },
    { id: 3, date: shiftDate(today, -1), lbs: weightLb + 0.1 },
  ];

  return envelope({
    profile: [profile],
    targets: [targets],
    foods: seededFoods(),
    schedule: defaultSchedule(),
    mealLogs: [],
    weights,
    combos: [],
    prefs: [defaultPrefs()],
  });
}

export type ReviewOpts = {
  today: string;
  weightLb?: number;
  kcal?: number;
};

/**
 * 10 days in on a maintain goal, trending up by ~0.4%/wk → produces a
 * "decrease" verdict (-150 kcal).
 */
export function makeWeek2ReviewReady({ today, weightLb = 180, kcal = 2400 }: ReviewOpts): Envelope {
  const daysAgo = 10;
  const createdAt = parseYmd(shiftDate(today, -daysAgo)).getTime();
  const goalStartDate = shiftDate(today, -daysAgo);

  const profile: Profile = {
    id: "me",
    sex: "male",
    age: 30,
    heightIn: 70,
    weightLb,
    activity: "moderate",
    goal: "maintain",
    goalStartDate,
    createdAt,
  };

  const proteinG = Math.round(weightLb * 1.0);
  const fatG = Math.round(weightLb * 0.45);
  const remaining = kcal - proteinG * 4 - fatG * 9;
  const carbG = Math.max(0, Math.round(remaining / 4));

  const targets: Targets = {
    id: 1,
    dateEffective: goalStartDate,
    kcal,
    proteinG,
    fatG,
    carbG,
    proteinPerLb: 1.0,
    fatPerLb: 0.45,
    source: "auto",
  };

  const weights: WeightEntry[] = [
    { id: 1, date: shiftDate(today, -9), lbs: weightLb + 0.0 },
    { id: 2, date: shiftDate(today, -7), lbs: weightLb + 0.2 },
    { id: 3, date: shiftDate(today, -5), lbs: weightLb + 0.6 },
    { id: 4, date: shiftDate(today, -2), lbs: weightLb + 1.0 },
  ];

  const mealLogs: MealLog[] = [];

  return envelope({
    profile: [profile],
    targets: [targets],
    foods: seededFoods(),
    schedule: defaultSchedule(),
    mealLogs,
    weights,
    combos: [],
    prefs: [defaultPrefs()],
  });
}
