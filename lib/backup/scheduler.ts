import { db } from "@/lib/db/schema";
import { buildAnalysisFiles } from "./analysis";
import {
  BACKUP_FILENAME,
  buildEnvelope,
  type EnvelopeTables,
} from "./envelope";
import { formatError, isBackupError, pushFiles } from "./drive";
import { getBackupState, getBridge, patchBackupState } from "./state";

const DEBOUNCE_MS = 30_000;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

type Decision =
  | { action: "skip"; reason: "not-configured" | "not-enabled" | "not-dirty" }
  | { action: "sync" };

export type DecisionInput = {
  configured: boolean;
  autoEnabled: boolean;
  manual: boolean;
  lastBackupAt?: number;
  lastChangeAt?: number;
};

export function decideNextAction(input: DecisionInput): Decision {
  if (!input.configured) return { action: "skip", reason: "not-configured" };
  if (!input.manual && !input.autoEnabled) return { action: "skip", reason: "not-enabled" };
  const dirty = (input.lastChangeAt ?? 0) > (input.lastBackupAt ?? 0);
  if (!input.manual && !dirty) return { action: "skip", reason: "not-dirty" };
  return { action: "sync" };
}

let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let pending = false;
let listenersRegistered = false;

export function scheduleBackup(ms: number = DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void run(false);
  }, ms);
}

export function flushBackupNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return run(true);
}

export async function readAllTables(): Promise<EnvelopeTables> {
  const [profile, targets, foods, schedule, mealLogs, snacks, weights, combos, prefs] = await Promise.all([
    db.profile.toArray(),
    db.targets.toArray(),
    db.foods.toArray(),
    db.schedule.toArray(),
    db.mealLogs.toArray(),
    db.snacks.toArray(),
    db.weights.toArray(),
    db.combos.toArray(),
    db.prefs.toArray(),
  ]);
  return { profile, targets, foods, schedule, mealLogs, snacks, weights, combos, prefs };
}

// Everything written to the Drive folder in one bridge call: the raw restore
// envelope plus the Claude-facing analysis files.
export async function buildSyncFiles(): Promise<Record<string, string>> {
  const tables = await readAllTables();
  return {
    [BACKUP_FILENAME]: JSON.stringify(buildEnvelope(tables, APP_VERSION)),
    ...buildAnalysisFiles(tables),
  };
}

async function run(manual: boolean): Promise<void> {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  try {
    const state = await getBackupState();
    const bridge = await getBridge();
    const decision = decideNextAction({
      configured: bridge !== null,
      autoEnabled: state.autoEnabled === 1,
      manual,
      lastBackupAt: state.lastBackupAt,
      lastChangeAt: state.lastChangeAt,
    });
    if (decision.action === "skip" || !bridge) return;

    const startedAt = Date.now();
    const files = await buildSyncFiles();
    try {
      await pushFiles(bridge.url, bridge.secret, files);
      // Stamp the read time, not the finish time: an edit that lands while
      // the upload is in flight must still leave the state dirty.
      await patchBackupState({ lastBackupAt: startedAt, lastError: null });
    } catch (err) {
      const msg = isBackupError(err) ? formatError(err) : (err as Error)?.message ?? "Unknown error";
      await patchBackupState({ lastError: msg });
    }
  } finally {
    inFlight = false;
    if (pending) {
      pending = false;
      scheduleBackup(0);
    }
  }
}

export function registerRetryListeners(): void {
  if (listenersRegistered) return;
  if (typeof window === "undefined") return;
  listenersRegistered = true;

  const onOnline = async () => {
    const s = await getBackupState();
    if ((s.lastChangeAt ?? 0) > (s.lastBackupAt ?? 0)) scheduleBackup(0);
  };
  const onVisible = async () => {
    if (document.visibilityState !== "visible") return;
    const s = await getBackupState();
    if ((s.lastChangeAt ?? 0) > (s.lastBackupAt ?? 0)) scheduleBackup(0);
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
}
