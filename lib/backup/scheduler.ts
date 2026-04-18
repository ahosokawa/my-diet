import { db } from "@/lib/db/schema";
import {
  buildEnvelope,
  type EnvelopeTables,
} from "./envelope";
import { createGist, formatError, isBackupError, updateGist } from "./gist";
import { getBackupState, getPat, patchBackupState } from "./state";

const DEBOUNCE_MS = 30_000;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

type Decision =
  | { action: "skip"; reason: "no-pat" | "not-enabled" | "not-dirty" }
  | { action: "create" }
  | { action: "update" };

export type DecisionInput = {
  patPresent: boolean;
  autoEnabled: boolean;
  manual: boolean;
  hasGistId: boolean;
  lastBackupAt?: number;
  lastChangeAt?: number;
};

export function decideNextAction(input: DecisionInput): Decision {
  if (!input.patPresent) return { action: "skip", reason: "no-pat" };
  if (!input.manual && !input.autoEnabled) return { action: "skip", reason: "not-enabled" };
  const dirty = (input.lastChangeAt ?? 0) > (input.lastBackupAt ?? 0);
  if (!input.manual && !dirty) return { action: "skip", reason: "not-dirty" };
  return input.hasGistId ? { action: "update" } : { action: "create" };
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

async function readAllTables(): Promise<EnvelopeTables> {
  const [profile, targets, foods, schedule, mealLogs, weights, combos, prefs] = await Promise.all([
    db.profile.toArray(),
    db.targets.toArray(),
    db.foods.toArray(),
    db.schedule.toArray(),
    db.mealLogs.toArray(),
    db.weights.toArray(),
    db.combos.toArray(),
    db.prefs.toArray(),
  ]);
  return { profile, targets, foods, schedule, mealLogs, weights, combos, prefs };
}

async function run(manual: boolean): Promise<void> {
  if (inFlight) {
    pending = true;
    return;
  }
  inFlight = true;
  try {
    const state = await getBackupState();
    const pat = await getPat();
    const decision = decideNextAction({
      patPresent: pat !== null,
      autoEnabled: state.autoEnabled === 1,
      manual,
      hasGistId: !!state.gistId,
      lastBackupAt: state.lastBackupAt,
      lastChangeAt: state.lastChangeAt,
    });
    if (decision.action === "skip") return;
    if (!pat) return;

    const tables = await readAllTables();
    const envelope = buildEnvelope(tables, APP_VERSION);
    const content = JSON.stringify(envelope);

    try {
      if (decision.action === "create") {
        const { id } = await createGist(pat, content);
        await patchBackupState({ gistId: id, lastBackupAt: Date.now(), lastError: null });
      } else {
        await updateGist(pat, state.gistId!, content);
        await patchBackupState({ lastBackupAt: Date.now(), lastError: null });
      }
    } catch (err) {
      const msg = isBackupError(err) ? formatError(err) : (err as Error)?.message ?? "Unknown error";
      await patchBackupState({ lastError: msg });
      if (isBackupError(err) && err.kind === "gone") {
        await patchBackupState({ gistId: undefined });
      }
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
