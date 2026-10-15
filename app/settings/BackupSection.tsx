"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sheet } from "@/components/ui/Sheet";
import { Toggle } from "@/components/ui/Toggle";
import { Check, Cloud, Copy, ExternalLink } from "@/components/ui/Icon";
import { clearBridge, patchBackupState, readBackupRow, setBridge } from "@/lib/backup/state";
import { buildSyncFiles, flushBackupNow, readAllTables } from "@/lib/backup/scheduler";
import { restoreFromEnvelopeJson, restoreFromDrive } from "@/lib/backup/restore";
import { buildEnvelope } from "@/lib/backup/envelope";
import { ANALYSIS_FILENAME, FOOD_LOG_FILENAME } from "@/lib/backup/analysis";
import { DRIVE_FOLDER, bridgeScript, generateSecret, isBridgeUrl } from "@/lib/backup/bridge-script";
import { formatError, isBackupError, pushFiles } from "@/lib/backup/drive";
import { todayStr } from "@/lib/db/repos";
import { haptic } from "@/lib/ui/haptics";

// The setup secret must survive the trip to script.google.com and back (iOS
// may evict a backgrounded PWA), so it waits in localStorage until connected.
const PENDING_SECRET_KEY = "my-diet:pending-bridge-secret";

function loadPendingSecret(): string | null {
  try {
    return localStorage.getItem(PENDING_SECRET_KEY);
  } catch {
    return null;
  }
}

function savePendingSecret(secret: string | null): void {
  try {
    if (secret) localStorage.setItem(PENDING_SECRET_KEY, secret);
    else localStorage.removeItem(PENDING_SECRET_KEY);
  } catch {
    // ignore: the secret still lives in component state for this session
  }
}

const CLAUDE_INSTRUCTIONS = `My diet tracking data syncs automatically to my Google Drive, folder "${DRIVE_FOLDER}". Read ${ANALYSIS_FILENAME} there first (profile, targets history, weekly summary, daily log). Use ${FOOD_LOG_FILENAME} for food-level questions. Always re-read the files at the start of an analysis; they update after every change.`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function BackupSection() {
  const backup = useLiveQuery(readBackupRow, [], undefined);
  const connected = !!backup?.bridgeUrl && !!backup?.secretCiphertext;
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState<null | "script" | "claude">(null);
  const [scriptFallback, setScriptFallback] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [restoreSource, setRestoreSource] = useState<
    null | { kind: "drive" } | { kind: "file"; json: string; name: string }
  >(null);
  const [restoreInput, setRestoreInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  async function onCopyScript() {
    const secret = pendingSecret ?? loadPendingSecret() ?? generateSecret();
    setPendingSecret(secret);
    savePendingSecret(secret);
    const script = bridgeScript(secret);
    if (await copyText(script)) {
      setScriptFallback(null);
      setCopied("script");
      haptic("success");
    } else {
      setScriptFallback(script);
    }
  }

  async function onCopyClaude() {
    if (await copyText(CLAUDE_INSTRUCTIONS)) {
      setCopied("claude");
      haptic("success");
    }
  }

  async function onConnect() {
    const url = urlInput.trim();
    const secret = pendingSecret ?? loadPendingSecret();
    if (!secret) {
      setConnectErr("Copy the setup script first (step 1), deploy it, then paste the URL.");
      return;
    }
    if (!isBridgeUrl(url)) {
      setConnectErr("That doesn't look like a web app URL — it should end in /exec.");
      return;
    }
    setConnecting(true);
    setConnectErr(null);
    try {
      // First write doubles as the connection test.
      const startedAt = Date.now();
      await pushFiles(url, secret, await buildSyncFiles());
      await setBridge(url, secret);
      await patchBackupState({ lastBackupAt: startedAt });
      savePendingSecret(null);
      setPendingSecret(null);
      setUrlInput("");
      setCopied(null);
      haptic("success");
    } catch (err) {
      setConnectErr(isBackupError(err) ? formatError(err) : (err as Error)?.message ?? "Connection failed");
      haptic("error");
    } finally {
      setConnecting(false);
    }
  }

  async function onDisconnect() {
    await clearBridge();
  }

  async function onBackupNow() {
    setBackingUp(true);
    try {
      await flushBackupNow();
    } finally {
      setBackingUp(false);
    }
  }

  async function onToggleAuto(v: boolean) {
    await patchBackupState({ autoEnabled: v ? 1 : 0 });
  }

  async function onRestore() {
    if (restoreInput !== "REPLACE" || !restoreSource) return;
    setRestoring(true);
    setRestoreErr(null);
    const result =
      restoreSource.kind === "drive"
        ? await restoreFromDrive()
        : await restoreFromEnvelopeJson(restoreSource.json);
    if (!result.ok) {
      setRestoreErr(result.reason);
      setRestoring(false);
      return;
    }
    location.reload();
  }

  async function onExport() {
    const tables = await readAllTables();
    const envelope = buildEnvelope(tables, process.env.NEXT_PUBLIC_APP_VERSION ?? "dev");
    const blob = new Blob([JSON.stringify(envelope)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-diet-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNote("Backup file downloaded.");
  }

  async function onImportFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const json = await file.text();
    setRestoreInput("");
    setRestoreErr(null);
    setRestoreSource({ kind: "file", json, name: file.name });
  }

  const persistLabel =
    backup?.persistGranted === 2 ? "granted" : backup?.persistGranted === 1 ? "best-effort" : "unsupported";
  const lastBackupLabel = backup?.lastBackupAt ? relativeTime(backup.lastBackupAt) : "Never backed up";

  return (
    <>
      <div className="card mb-3 mt-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
            <Cloud className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">Data & backup</h2>
            <p className="text-xs text-fg-3">
              {connected ? lastBackupLabel : "Not configured"}
              {backup?.lastError ? ` · ${backup.lastError}` : ""}
            </p>
          </div>
        </div>
      </div>

      <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
        Google Drive
      </h3>
      {connected ? (
        <div className="card !p-0 mb-3 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm">Connected</div>
              <div className="truncate text-xs text-fg-3">Syncing to the “{DRIVE_FOLDER}” folder</div>
            </div>
            <button className="btn-secondary" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <span className="text-sm">Auto-sync</span>
            <Toggle
              label="Auto-sync"
              checked={backup?.autoEnabled !== 0}
              onChange={onToggleAuto}
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <span className="text-sm">{lastBackupLabel}</span>
            <button className="btn-secondary" onClick={onBackupNow} disabled={backingUp}>
              {backingUp ? "Syncing…" : "Sync now"}
            </button>
          </div>
          <button
            className="flex w-full items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-left text-sm text-brand-600 dark:text-brand-300"
            onClick={onCopyClaude}
          >
            <span>Copy instructions for Claude</span>
            {copied === "claude" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <a
            className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-sm text-brand-600 dark:text-brand-300"
            href={`https://drive.google.com/drive/search?q=${encodeURIComponent(DRIVE_FOLDER)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span>Open in Google Drive</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ) : (
        <div className="card !p-0 mb-3 overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-xs text-fg-3">
              Syncs your data to a “{DRIVE_FOLDER}” folder in your Drive that Claude can read. A small
              Google Apps Script you deploy does the writing, so there&apos;s nothing to re-authorize later.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <span className="text-sm">1. Copy the setup script</span>
            <button className="btn-secondary flex items-center gap-1.5" onClick={onCopyScript}>
              {copied === "script" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === "script" ? "Copied" : "Copy"}
            </button>
          </div>
          {scriptFallback && (
            <div className="border-t border-hairline px-4 py-3">
              <p className="mb-2 text-xs text-fg-3">Couldn&apos;t copy automatically. Select all and copy:</p>
              <textarea
                readOnly
                className="h-32 w-full rounded-lg bg-surface-3 p-2 font-mono text-xs outline-none"
                value={scriptFallback}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
          <div className="border-t border-hairline px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">2. Deploy it</span>
              <a
                className="btn-secondary flex items-center gap-1.5"
                href="https://script.google.com/home/projects/create"
                target="_blank"
                rel="noreferrer noopener"
              >
                Apps Script
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <p className="mt-2 text-xs text-fg-3">
              Replace the editor contents with the script, then Deploy → New deployment → Web app. Set
              Execute as <strong>Me</strong> and Who has access <strong>Anyone</strong>, authorize, and
              copy the web app URL.
            </p>
          </div>
          <div className="border-t border-hairline px-4 py-3">
            <label className="text-sm" htmlFor="bridge-url">
              3. Paste the web app URL
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="bridge-url"
                type="url"
                inputMode="url"
                className="min-w-0 flex-1 rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none"
                placeholder="https://script.google.com/macros/s/…/exec"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={connecting}
              />
              <button
                className="btn-secondary"
                onClick={onConnect}
                disabled={!urlInput.trim() || connecting}
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
            </div>
            {connectErr && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{connectErr}</p>
            )}
          </div>
        </div>
      )}

      <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
        Local file
      </h3>
      <div className="card !p-0 mb-3 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm">Export all data</span>
          <button className="btn-secondary" onClick={onExport}>
            Download backup
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
          <span className="text-sm">Restore from a file</span>
          <button
            className="btn-secondary"
            onClick={() => importFileRef.current?.click()}
          >
            Import…
          </button>
        </div>
      </div>
      {exportNote && (
        <p className="mb-3 rounded-xl bg-surface-3 p-3 text-sm text-fg-2">{exportNote}</p>
      )}
      <input
        ref={importFileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={onImportFilePicked}
      />

      <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
        Device
      </h3>
      <div className="card !p-0 mb-3 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm">Persistent storage</span>
          <span className="text-sm text-fg-3">{persistLabel}</span>
        </div>
      </div>

      <button
        className="mt-4 w-full rounded-xl border border-hairline bg-surface-2 p-3 text-sm font-medium text-red-600 dark:text-red-400"
        onClick={() => {
          setRestoreInput("");
          setRestoreErr(null);
          setRestoreSource({ kind: "drive" });
        }}
        disabled={!connected}
      >
        Restore from Google Drive…
      </button>

      <Sheet
        open={restoreSource !== null}
        onClose={() => (restoring ? null : setRestoreSource(null))}
        title={restoreSource?.kind === "file" ? "Import backup file" : "Restore from Google Drive"}
        detent="medium"
        footer={
          <div className="flex gap-2 pb-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => setRestoreSource(null)}
              disabled={restoring}
            >
              Cancel
            </button>
            <button
              className="flex-1 rounded-xl bg-red-600 p-3 text-sm font-medium text-white disabled:opacity-50"
              onClick={onRestore}
              disabled={restoring || restoreInput !== "REPLACE"}
            >
              {restoring ? "Restoring…" : "Replace local data"}
            </button>
          </div>
        }
      >
        <p className="text-sm text-fg-2">
          This will replace <strong>all local data</strong> on this device with the contents of{" "}
          {restoreSource?.kind === "file" ? (
            <>the file <strong className="break-all">{restoreSource.name}</strong></>
          ) : (
            "your Google Drive backup"
          )}
          . This cannot be undone.
        </p>
        <p className="mt-3 text-sm text-fg-2">
          Type <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs">REPLACE</code> to confirm:
        </p>
        <input
          type="text"
          className="mt-2 w-full rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none"
          value={restoreInput}
          onChange={(e) => setRestoreInput(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={restoring}
        />
        {restoreErr && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {restoreErr}
          </p>
        )}
      </Sheet>
    </>
  );
}
