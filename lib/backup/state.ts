import { db, type BackupState } from "@/lib/db/schema";
import { decryptSecret, encryptSecret, generateKey } from "./crypto";

const DEFAULT: BackupState = {
  id: "me",
  autoEnabled: 1,
};

export type Bridge = { url: string; secret: string };

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

// Rows written by the gist-era app also carry patKey/patCiphertext/patIv/
// patTailHint/gistId. Rebuilding the row from known fields drops them.
function knownFields(s: BackupState): BackupState {
  return {
    id: "me",
    autoEnabled: s.autoEnabled ?? 1,
    lastChangeAt: s.lastChangeAt,
    persistGranted: s.persistGranted,
  };
}

export async function setBridge(url: string, secret: string): Promise<void> {
  const current = await getBackupState();
  const key = current.secretKey ?? (await generateKey());
  const { iv, ciphertext } = await encryptSecret(key, secret);
  await db.backup.put({
    ...knownFields(current),
    bridgeUrl: url,
    secretKey: key,
    secretCiphertext: ciphertext,
    secretIv: iv,
    lastError: null,
  });
}

export async function getBridge(): Promise<Bridge | null> {
  const s = await getBackupState();
  if (!s.bridgeUrl || !s.secretKey || !s.secretCiphertext || !s.secretIv) return null;
  try {
    return { url: s.bridgeUrl, secret: await decryptSecret(s.secretKey, s.secretIv, s.secretCiphertext) };
  } catch {
    return null;
  }
}

export async function clearBridge(): Promise<void> {
  const current = await getBackupState();
  await db.backup.put({ ...knownFields(current), lastError: null });
}

export async function markChanged(): Promise<void> {
  await patchBackupState({ lastChangeAt: Date.now() });
}
