"use client";

import { useEffect } from "react";
import { installBackupHooks } from "@/lib/backup/hooks";
import { registerRetryListeners, scheduleBackup } from "@/lib/backup/scheduler";
import { getBackupState } from "@/lib/backup/state";

export function BackupBootstrap() {
  useEffect(() => {
    installBackupHooks();
    registerRetryListeners();
    (async () => {
      const s = await getBackupState();
      if ((s.lastChangeAt ?? 0) > (s.lastBackupAt ?? 0)) scheduleBackup(0);
    })().catch(() => {});
  }, []);
  return null;
}
