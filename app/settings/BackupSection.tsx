"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sheet } from "@/components/ui/Sheet";
import { Toggle } from "@/components/ui/Toggle";
import { Cloud, ExternalLink, Eye, EyeOff } from "@/components/ui/Icon";
import { clearPat, patchBackupState, readBackupRow, setPat } from "@/lib/backup/state";
import { flushBackupNow, readAllTables } from "@/lib/backup/scheduler";
import { restoreFromEnvelopeJson, restoreFromGist } from "@/lib/backup/restore";
import { buildEnvelope } from "@/lib/backup/envelope";
import { todayStr } from "@/lib/db/repos";

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
  const hasPat = !!backup?.patCiphertext;
  const [patInput, setPatInput] = useState("");
  const [patVisible, setPatVisible] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [restoreSource, setRestoreSource] = useState<
    null | { kind: "gist" } | { kind: "file"; json: string; name: string }
  >(null);
  const [restoreInput, setRestoreInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  async function onSavePat() {
    const val = patInput.trim();
    if (!val) return;
    await setPat(val);
    setPatInput("");
  }

  async function onClearPat() {
    await clearPat();
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
      restoreSource.kind === "gist"
        ? await restoreFromGist()
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
              {hasPat ? lastBackupLabel : "Not configured"}
              {backup?.lastError ? ` · ${backup.lastError}` : ""}
            </p>
          </div>
        </div>
      </div>

      <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
        GitHub Gist
      </h3>
      <div className="card !p-0 mb-3 overflow-hidden">
        {hasPat ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm">Token</div>
              <div className="truncate text-xs text-fg-3">
                ghp_••••{backup?.patTailHint ?? ""}
              </div>
            </div>
            <button className="btn-secondary" onClick={onClearPat}>
              Replace
            </button>
          </div>
        ) : (
          <div className="px-4 py-3">
            <label className="text-sm">Personal access token</label>
            <div className="mt-2 flex items-center gap-2">
              <input
                type={patVisible ? "text" : "password"}
                className="min-w-0 flex-1 rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none"
                placeholder="ghp_…"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                aria-label={patVisible ? "Hide token" : "Show token"}
                className="rounded-lg bg-surface-3 p-2 text-fg-2"
                onClick={() => setPatVisible((v) => !v)}
              >
                {patVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                className="btn-secondary"
                onClick={onSavePat}
                disabled={!patInput.trim()}
              >
                Save
              </button>
            </div>
            <p className="mt-2 text-xs text-fg-3">
              Classic PAT with <code>gist</code> scope from{" "}
              <a
                className="underline"
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer noopener"
              >
                github.com/settings/tokens
              </a>
              . Encrypted on this device.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
          <span className="text-sm">Auto-backup</span>
          <Toggle
            label="Auto-backup"
            checked={backup?.autoEnabled !== 0}
            onChange={onToggleAuto}
            disabled={!hasPat}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
          <span className="text-sm">{lastBackupLabel}</span>
          <button
            className="btn-secondary"
            onClick={onBackupNow}
            disabled={!hasPat || backingUp}
          >
            {backingUp ? "Backing up…" : "Back up now"}
          </button>
        </div>
        {backup?.gistId && (
          <a
            className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-sm text-brand-600 dark:text-brand-300"
            href={`https://gist.github.com/${backup.gistId}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span>Open gist on GitHub</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

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
          setRestoreSource({ kind: "gist" });
        }}
        disabled={!hasPat || !backup?.gistId}
      >
        Restore from Gist…
      </button>

      <Sheet
        open={restoreSource !== null}
        onClose={() => (restoring ? null : setRestoreSource(null))}
        title={restoreSource?.kind === "file" ? "Import backup file" : "Restore from Gist"}
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
            "your gist"
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
