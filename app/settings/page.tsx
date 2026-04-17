"use client";

import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { Toggle } from "@/components/ui/Toggle";
import { Bell } from "@/components/ui/Icon";
import {
  DEFAULT_NOTIF_PREFS,
  getNotifPrefs,
  getProfile,
  getSchedule,
  saveNotifPrefs,
} from "@/lib/db/repos";
import type { NotifPrefs } from "@/lib/db/schema";
import {
  getPermission,
  requestPermission,
  scheduleEvents,
  clearAll,
  supportsNotifications,
  supportsTimestampTrigger,
  testNotification,
} from "@/lib/notify/driver";
import { upcomingEvents } from "@/lib/notify/schedule";

const LEAD_OPTIONS = [0, 10, 20, 30, 45];
const REVIEW_ELIGIBLE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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

  async function reschedule(next: NotifPrefs) {
    if (!supportsNotifications() || Notification.permission !== "granted") return;
    if (!next.enabled) {
      await clearAll();
      return;
    }
    const [schedule, profile] = await Promise.all([getSchedule(), getProfile()]);
    const reviewEligibleAt = profile ? profile.createdAt + REVIEW_ELIGIBLE_AFTER_MS : undefined;
    const events = upcomingEvents({
      now: new Date(),
      horizonDays: 7,
      schedule,
      prefs: next,
      reviewEligibleAt,
    });
    await scheduleEvents(events);
  }

  async function save(next: NotifPrefs) {
    setSaving(true);
    setPrefs(next);
    await saveNotifPrefs(next);
    await reschedule(next);
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
          {/* Reminders header card */}
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
            {isIOSLike && prefs.enabled && (
              <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                This device doesn't support scheduled notifications. Reminders only fire while the app is open. For reliable alerts, install the PWA to your Home Screen and keep it open near your meal times.
              </p>
            )}
          </div>

          {/* Grouped list */}
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
        </div>
      </main>
      <TabBar />
    </>
  );
}
