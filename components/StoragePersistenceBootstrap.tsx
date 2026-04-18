"use client";

import { useEffect } from "react";
import { getBackupState, patchBackupState } from "@/lib/backup/state";

async function currentPersistState(): Promise<0 | 1 | 2> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return 0;
  let granted = await navigator.storage.persisted();
  if (!granted && navigator.storage.persist) granted = await navigator.storage.persist();
  return granted ? 2 : 1;
}

async function check(): Promise<void> {
  const desired = await currentPersistState();
  const state = await getBackupState();
  if (state.persistGranted === desired) return;
  await patchBackupState({ persistGranted: desired });
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
