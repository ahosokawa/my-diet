"use client";

import { useEffect, useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { Toggle } from "@/components/ui/Toggle";
import { Sheet } from "@/components/ui/Sheet";
import { Bell, Cloud, ExternalLink, Eye, EyeOff } from "@/components/ui/Icon";
import {
  DEFAULT_NOTIF_PREFS,
  getNotifPrefs,
  saveNotifPrefs,
} from "@/lib/db/repos";
import type { NotifPrefs } from "@/lib/db/schema";
import {
  getPermission,
  requestPermission,
  supportsNotifications,
  supportsTimestampTrigger,
  testNotification,
} from "@/lib/notify/driver";
import { rescheduleNotifications } from "@/lib/notify/reschedule";
import { clearPat, patchBackupState, readBackupRow, setPat } from "@/lib/backup/state";
import { flushBackupNow } from "@/lib/backup/scheduler";
import { restoreFromGist } from "@/lib/backup/restore";

const LEAD_OPTIONS = [0, 10, 20, 30, 45];

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

type PermState = NotificationPermission | "unsupported" | "unknown";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [perm, setPerm] = useState<PermState>("unknown");
  const [hasTrigger, setHasTrigger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const p = await getNotifPrefs();
      setPrefs(p);
      setLoaded(true);
      setPerm(getPermission());
      setHasTrigger(supportsTimestampTrigger());
    })();
  }, []);

  async function save(next: NotifPrefs) {
    setSaving(true);
    setPrefs(next);
    await saveNotifPrefs(next);
    await rescheduleNotifications(next);
    setSaving(false);
  }

  async function onToggleEnable() {
    if (!supportsNotifications()) {
      setStatus("Notifications not supported in this browser.");
      return;
    }
    if (prefs.enabled) {
      await save({ ...prefs, enabled: 0 });
      setStatus("Notifications off. Scheduled reminders cleared.");
      return;
    }
    const result = await requestPermission();
    setPerm(result);
    if (result !== "granted") {
      setStatus(
        result === "denied"
          ? "Permission denied. Enable notifications in your browser/OS settings and try again."
          : "Permission not granted."
      );
      return;
    }
    await save({ ...prefs, enabled: 1 });
    setStatus("Notifications on. Reminders scheduled for the next 7 days.");
  }

  async function onTest() {
    const ok = await testNotification();
    setStatus(ok ? "Test notification sent." : "Couldn't send test — check permission.");
  }

  const backup = useLiveQuery(readBackupRow, [], undefined);
  const hasPat = !!backup?.patCiphertext;
  const [patInput, setPatInput] = useState("");
  const [patVisible, setPatVisible] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreInput, setRestoreInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);

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
    if (restoreInput !== "REPLACE") return;
    setRestoring(true);
    setRestoreErr(null);
    const result = await restoreFromGist();
    if (!result.ok) {
      setRestoreErr(result.reason);
      setRestoring(false);
      return;
    }
    location.reload();
  }

  const persistLabel = backup?.persistGranted === 2 ? "granted" : backup?.persistGranted === 1 ? "best-effort" : "unsupported";
  const lastBackupLabel = backup?.lastBackupAt ? relativeTime(backup.lastBackupAt) : "Never backed up";

  if (!loaded) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Settings" back="/today" />
          <p className="mt-12 text-center text-fg-3">Loading…</p>
        </main>
        <TabBar />
      </>
    );
  }

  const supported = perm !== "unsupported";
  const granted = perm === "granted";
  const isIOSLike = supported && !hasTrigger;

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <Header title="Settings" back="/today" scrollRef={scrollRef} />

        <div className="px-4 pb-4">
          <div className="card mb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <Bell className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h2 className="font-semibold">Reminders</h2>
                <p className="text-xs text-fg-3">
                  {!supported
                    ? "Not supported in this browser"
                    : granted
                    ? prefs.enabled
                      ? "Active"
                      : "Permission granted"
                    : perm === "denied"
                    ? "Blocked in OS settings"
                    : "Tap to request permission"}
                </p>
              </div>
              <Toggle
                label="Enable reminders"
                checked={!!prefs.enabled}
                onChange={onToggleEnable}
                disabled={saving || !supported}
              />
            </div>
            {isIOSLike && !!prefs.enabled && (
              <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                This device doesn't support scheduled notifications. Reminders only fire while the app is open. For reliable alerts, install the PWA to your Home Screen and keep it open near your meal times.
              </p>
            )}
          </div>

          <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Meals
          </h3>
          <div className={`card !p-0 mb-3 overflow-hidden ${!prefs.enabled ? "opacity-50" : ""}`}>
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">Remind me</span>
              <select
                className="rounded-lg bg-surface-3 px-2 py-1.5 text-sm font-medium text-fg-1 outline-none"
                value={prefs.mealLeadMin}
                disabled={!prefs.enabled || saving}
                onChange={(e) =>
                  save({ ...prefs, mealLeadMin: Number(e.target.value) })
                }
              >
                {LEAD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "At meal time" : `${m} min before`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Morning weigh-in
          </h3>
          <div className={`card !p-0 mb-3 overflow-hidden ${!prefs.enabled ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">Enabled</span>
              <Toggle
                label="Morning weigh-in"
                checked={!!prefs.weighInEnabled}
                disabled={!prefs.enabled || saving}
                onChange={(v) => save({ ...prefs, weighInEnabled: v ? 1 : 0 })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
              <span className="text-sm">Time</span>
              <input
                type="time"
                className="rounded-lg bg-surface-3 px-2 py-1.5 text-sm font-medium text-fg-1 outline-none"
                value={prefs.weighInTime}
                disabled={!prefs.enabled || !prefs.weighInEnabled || saving}
                onChange={(e) => save({ ...prefs, weighInTime: e.target.value })}
              />
            </div>
          </div>

          <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Weekly review (Friday)
          </h3>
          <div className={`card !p-0 mb-3 overflow-hidden ${!prefs.enabled ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">Enabled</span>
              <Toggle
                label="Weekly review"
                checked={!!prefs.reviewEnabled}
                disabled={!prefs.enabled || saving}
                onChange={(v) => save({ ...prefs, reviewEnabled: v ? 1 : 0 })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
              <span className="text-sm">Time</span>
              <input
                type="time"
                className="rounded-lg bg-surface-3 px-2 py-1.5 text-sm font-medium text-fg-1 outline-none"
                value={prefs.reviewTime}
                disabled={!prefs.enabled || !prefs.reviewEnabled || saving}
                onChange={(e) => save({ ...prefs, reviewTime: e.target.value })}
              />
            </div>
          </div>

          {granted && (
            <button
              className="btn-secondary mt-4 w-full"
              onClick={onTest}
              disabled={saving}
            >
              Send test notification
            </button>
          )}

          {status && (
            <p className="mt-4 rounded-xl bg-surface-3 p-3 text-sm text-fg-2">
              {status}
            </p>
          )}

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
              setRestoreOpen(true);
            }}
            disabled={!hasPat || !backup?.gistId}
          >
            Restore from Gist…
          </button>
        </div>
      </main>
      <TabBar />

      <Sheet
        open={restoreOpen}
        onClose={() => (restoring ? null : setRestoreOpen(false))}
        title="Restore from Gist"
        footer={
          <div className="flex gap-2 pb-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => setRestoreOpen(false)}
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
          This will replace <strong>all local data</strong> on this device with the contents of your gist. This cannot be undone.
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
