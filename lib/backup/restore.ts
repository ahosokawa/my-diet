import { db } from "@/lib/db/schema";
import {
  checkVersion,
  parseEnvelope,
  type EnvelopeTables,
} from "./envelope";
import { fetchGist, formatError, isBackupError } from "./gist";
import { getBackupState, getPat } from "./state";

export type RestoreResult =
  | { ok: true; backupVersion: number; exportedAt: number }
  | { ok: false; reason: string };

export async function restoreFromGist(): Promise<RestoreResult> {
  const state = await getBackupState();
  if (!state.gistId) return { ok: false, reason: "No gist configured" };
  const pat = await getPat();
  if (!pat) return { ok: false, reason: "PAT not set" };

  let json: string;
  try {
    json = await fetchGist(pat, state.gistId);
  } catch (err) {
    return {
      ok: false,
      reason: isBackupError(err) ? formatError(err) : (err as Error)?.message ?? "Fetch failed",
    };
  }

  const parsed = parseEnvelope(json);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const vc = checkVersion(parsed.env.schemaVersion);
  if (!vc.ok) return { ok: false, reason: vc.reason };

  const t = parsed.env.tables;
  const dataTables = [
    db.profile,
    db.targets,
    db.foods,
    db.schedule,
    db.mealLogs,
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
      db.weights.bulkPut(t.weights),
      db.combos.bulkPut(t.combos),
      db.prefs.bulkPut(t.prefs),
    ]);
  });

  return { ok: true, backupVersion: parsed.env.schemaVersion, exportedAt: parsed.env.exportedAt };
}
