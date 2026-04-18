import { db, type BackupState } from "@/lib/db/schema";
import { decryptPat, encryptPat, generateKey } from "./crypto";

const DEFAULT: BackupState = {
  id: "me",
  autoEnabled: 1,
};

export async function getBackupState(): Promise<BackupState> {
  const row = await db.backup.get("me");
  return row ?? DEFAULT;
}

export function readBackupRow(): Promise<BackupState | undefined> {
  return db.backup.get("me");
}

export async function patchBackupState(patch: Partial<BackupState>): Promise<void> {
  const current = await getBackupState();
  await db.backup.put({ ...current, ...patch, id: "me" });
}

export async function setPat(pat: string): Promise<void> {
  const current = await getBackupState();
  const key = current.patKey ?? (await generateKey());
  const { iv, ciphertext } = await encryptPat(key, pat);
  await db.backup.put({
    ...current,
    id: "me",
    patKey: key,
    patCiphertext: ciphertext,
    patIv: iv,
    patTailHint: pat.slice(-4),
  });
}

export async function getPat(): Promise<string | null> {
  const s = await getBackupState();
  if (!s.patKey || !s.patCiphertext || !s.patIv) return null;
  try {
    return await decryptPat(s.patKey, s.patIv, s.patCiphertext);
  } catch {
    return null;
  }
}

export async function clearPat(): Promise<void> {
  const current = await getBackupState();
  await db.backup.put({
    ...current,
    id: "me",
    patKey: undefined,
    patCiphertext: undefined,
    patIv: undefined,
    patTailHint: undefined,
    gistId: undefined,
    lastBackupAt: undefined,
    lastError: null,
  });
}

export async function markChanged(): Promise<void> {
  await patchBackupState({ lastChangeAt: Date.now() });
}
