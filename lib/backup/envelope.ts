import type {
  Combo,
  Food,
  MealLog,
  NotifPrefs,
  Profile,
  ScheduleDay,
  Targets,
  WeightEntry,
} from "@/lib/db/schema";

export const SCHEMA_VERSION = 6;
export const BACKUP_FILENAME = "my-diet-backup.json";

export type EnvelopeTables = {
  profile: Profile[];
  targets: Targets[];
  foods: Food[];
  schedule: ScheduleDay[];
  mealLogs: MealLog[];
  weights: WeightEntry[];
  combos: Combo[];
  prefs: NotifPrefs[];
};

export type Envelope = {
  appVersion: string;
  schemaVersion: number;
  exportedAt: number;
  tables: EnvelopeTables;
};

export type ParseResult =
  | { ok: true; env: Envelope }
  | { ok: false; reason: string };

export function buildEnvelope(tables: EnvelopeTables, appVersion: string, now = Date.now()): Envelope {
  return {
    appVersion,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    tables,
  };
}

const TABLE_KEYS: (keyof EnvelopeTables)[] = [
  "profile",
  "targets",
  "foods",
  "schedule",
  "mealLogs",
  "weights",
  "combos",
  "prefs",
];

export function parseEnvelope(json: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, reason: "Invalid JSON" };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "Backup is not an object" };
  }
  const env = data as Partial<Envelope>;
  if (typeof env.schemaVersion !== "number") {
    return { ok: false, reason: "Missing schemaVersion" };
  }
  if (typeof env.exportedAt !== "number") {
    return { ok: false, reason: "Missing exportedAt" };
  }
  if (!env.tables || typeof env.tables !== "object") {
    return { ok: false, reason: "Missing tables" };
  }
  const tables = env.tables as Record<string, unknown>;
  for (const key of TABLE_KEYS) {
    if (!Array.isArray(tables[key])) {
      return { ok: false, reason: `Missing table: ${key}` };
    }
  }
  return { ok: true, env: env as Envelope };
}

export type VersionCheck =
  | { ok: true; status: "current" | "older"; backupVersion: number }
  | { ok: false; reason: string };

export function checkVersion(backupVersion: number): VersionCheck {
  if (backupVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `Backup is from a newer app version (schema v${backupVersion}). Update the app first.`,
    };
  }
  return {
    ok: true,
    status: backupVersion === SCHEMA_VERSION ? "current" : "older",
    backupVersion,
  };
}
