import { db } from "@/lib/db/schema";
import { normalizeTables } from "@/lib/db/defaults";
import {
  BACKUP_FILENAME,
  checkVersion,
  parseEnvelope,
  type EnvelopeTables,
} from "./envelope";
import { formatError, isBackupError, readFile } from "./drive";
import { getBridge } from "./state";

export type RestoreResult =
  | { ok: true; backupVersion: number; exportedAt: number }
  | { ok: false; reason: string };

export async function restoreFromDrive(): Promise<RestoreResult> {
  const bridge = await getBridge();
  if (!bridge) return { ok: false, reason: "Google Drive sync is not set up" };

  let json: string;
  try {
    json = await readFile(bridge.url, bridge.secret, BACKUP_FILENAME);
  } catch (err) {
    return {
      ok: false,
      reason: isBackupError(err) ? formatError(err) : (err as Error)?.message ?? "Fetch failed",
    };
  }

  return restoreFromEnvelopeJson(json);
}

export async function restoreFromEnvelopeJson(json: string): Promise<RestoreResult> {
  const parsed = parseEnvelope(json);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const vc = checkVersion(parsed.env.schemaVersion);
  if (!vc.ok) return { ok: false, reason: vc.reason };

  // Unconditional normalization replaces per-version migration replay: every
  // applier is a `?? default`, so rows from any accepted backup version — and
  // already-current rows — come out the same.
  const t = normalizeTables(parsed.env.tables);
  const dataTables = [
    db.profile,
    db.targets,
    db.foods,
    db.schedule,
    db.mealLogs,
    db.snacks,
    db.weights,
    db.combos,
    db.prefs,
  ];

  await db.transaction("rw", dataTables, async () => {
    await Promise.all(dataTables.map((tbl) => tbl.clear()));
    await Promise.all([
      db.profile.bulkPut(t.profile as EnvelopeTables["profile"]),
      db.targets.bulkPut(t.targets),
      db.foods.bulkPut(t.foods),
      db.schedule.bulkPut(t.schedule),
      db.mealLogs.bulkPut(t.mealLogs),
      db.snacks.bulkPut(t.snacks),
      db.weights.bulkPut(t.weights),
      db.combos.bulkPut(t.combos),
      db.prefs.bulkPut(t.prefs),
    ]);
  });

  return { ok: true, backupVersion: parsed.env.schemaVersion, exportedAt: parsed.env.exportedAt };
}

