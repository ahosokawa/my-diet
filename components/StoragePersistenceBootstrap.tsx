"use client";

import { useEffect } from "react";
import { patchBackupState } from "@/lib/backup/state";

async function check(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) {
    await patchBackupState({ persistGranted: 0 });
    return;
  }
  let granted = await navigator.storage.persisted();
  if (!granted && navigator.storage.persist) {
    granted = await navigator.storage.persist();
  }
  await patchBackupState({ persistGranted: granted ? 2 : 1 });
}

export function StoragePersistenceBootstrap() {
  useEffect(() => {
    check().catch(() => {});
    const onVis = () => {
      if (document.visibilityState === "visible") check().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return null;
}
