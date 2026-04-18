import { db } from "@/lib/db/schema";
import { scheduleBackup } from "./scheduler";
import { markChanged } from "./state";

let installed = false;

function trigger(): void {
  setTimeout(() => {
    markChanged().catch(() => {});
    scheduleBackup();
  }, 0);
}

export function installBackupHooks(): void {
  if (installed) return;
  installed = true;

  const tables = [
    db.profile,
    db.targets,
    db.foods,
    db.schedule,
    db.mealLogs,
    db.weights,
    db.combos,
    db.prefs,
  ];

  for (const t of tables) {
    t.hook("creating", () => {
      trigger();
    });
    t.hook("updating", () => {
      trigger();
      return undefined;
    });
    t.hook("deleting", () => {
      trigger();
    });
  }
}
