import Dexie, { type Table } from "dexie";
import type { ActivityLevel, Sex } from "../nutrition/mifflin";
import type { Goal } from "../nutrition/macros";

export type { Goal };

export type Profile = {
  id: "me";
  sex: Sex;
  age: number;
  heightIn: number;
  weightLb: number;
  activity: ActivityLevel;
  goal: Goal;
  goalStartDate: string; // YYYY-MM-DD — anchor for rate-band corridor & review baseline
  createdAt: number;
  lastReviewedDate?: string; // YYYY-MM-DD of most recently completed weekly review
  enablePostWorkoutCarbBias?: boolean; // default true; when false, carbs split evenly even on workout days
};

export type Targets = {
  id?: number;
  dateEffective: string; // YYYY-MM-DD
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  proteinPerLb: number;
  fatPerLb: number;
  source: "auto" | "override" | "stay";
};

export type Food = {
  id?: number;
  slug: string;
  name: string;
  kcalPer100: number;
  proteinPer100: number;
  fatPer100: number;
  carbPer100: number;
  unit: "g" | "ml";
  builtin: 0 | 1;
  favorite: 0 | 1;
  category?: string;
};

export type ComboItem = { foodId: number; grams: number; locked: 0 | 1 };

export type Combo = {
  id?: number;
  name: string;
  items: ComboItem[];
  createdAt: number;
};

export type ScheduleDay = {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  mealTimes: string[]; // e.g. ["08:00","12:00","15:30","19:00"]
  workoutStart?: string; // "HH:mm"
  workoutDurationMin?: number;
};

export type MealLogItem = { foodId: number; grams: number };

export type MealLog = {
  id?: number;
  date: string;
  index: number;
  items: MealLogItem[];
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  loggedAt: number;
};

export type WeightEntry = {
  id?: number;
  date: string;
  lbs: number;
};

export type NotifPrefs = {
  id: "me";
  enabled: 0 | 1;
  mealLeadMin: number;
  weighInEnabled: 0 | 1;
  weighInTime: string;
  reviewEnabled: 0 | 1;
  reviewTime: string;
};

export type BackupState = {
  id: "me";
  patKey?: CryptoKey;
  patCiphertext?: Uint8Array;
  patIv?: Uint8Array;
  patTailHint?: string;
  gistId?: string;
  autoEnabled: 0 | 1;
  lastBackupAt?: number;
  lastChangeAt?: number;
  lastError?: string | null;
  persistGranted?: 0 | 1 | 2;
};

class MyDietDb extends Dexie {
  profile!: Table<Profile, "me">;
  targets!: Table<Targets, number>;
  foods!: Table<Food, number>;
  schedule!: Table<ScheduleDay, number>;
  mealLogs!: Table<MealLog, number>;
  weights!: Table<WeightEntry, number>;
  combos!: Table<Combo, number>;
  prefs!: Table<NotifPrefs, "me">;
  backup!: Table<BackupState, "me">;

  constructor() {
    super("my-diet");
    this.version(1).stores({
      profile: "id",
      targets: "++id, dateEffective",
      foods: "++id, &slug, name, builtin, category",
      schedule: "weekday",
      mealLogs: "++id, [date+index], date",
      weights: "++id, &date",
    });
    this.version(2)
      .stores({
        foods: "++id, &slug, name, builtin, favorite, category",
        combos: "++id, name, createdAt",
      })
      .upgrade(async (tx) => {
        await tx.table("foods").toCollection().modify((f) => {
          if (f.favorite === undefined) f.favorite = 0;
        });
      });
    this.version(3).upgrade(async (tx) => {
      const oilSlugs = ["olive-oil", "avocado-oil", "coconut-oil"];
      for (const slug of oilSlugs) {
        await tx.table("foods").where("slug").equals(slug).modify({ unit: "g" });
      }
    });
    this.version(4).stores({
      prefs: "id",
    });
    this.version(5).stores({
      backup: "id",
    });
    this.version(6).upgrade(async (tx) => {
      await tx.table("profile").toCollection().modify((p) => {
        if (p.goal === undefined) p.goal = "maintain";
        if (p.goalStartDate === undefined) {
          p.goalStartDate = new Date(p.createdAt ?? Date.now())
            .toISOString()
            .slice(0, 10);
        }
      });
      await tx.table("targets").toCollection().modify((t) => {
        if (t.proteinPerLb === undefined) t.proteinPerLb = 1.0;
        if (t.fatPerLb === undefined) t.fatPerLb = 0.45;
      });
    });
    this.version(7).upgrade(async (tx) => {
      await tx.table("profile").toCollection().modify((p) => {
        if (p.enablePostWorkoutCarbBias === undefined) {
          p.enablePostWorkoutCarbBias = true;
        }
      });
    });
  }
}

export const db = new MyDietDb();
