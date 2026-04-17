"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
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
          <p className="mt-12 text-center text-neutral-500">Loading…</p>
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
      <main className="flex-1 overflow-y-auto p-4">
        <Header title="Settings" back="/today" />

        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Reminders</h2>
              <p className="text-xs text-neutral-500">
                {!supported
                  ? "Not supported in this browser."
                  : granted
                  ? prefs.enabled
                    ? "On"
                    : "Permission granted — turn on to schedule."
                  : perm === "denied"
                  ? "Blocked in browser/OS settings."
                  : "Tap to request permission."}
              </p>
            </div>
            <button
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                prefs.enabled
                  ? "bg-brand-500 text-white active:bg-brand-600"
                  : "bg-neutral-200 text-neutral-700 active:bg-neutral-300"
              }`}
              disabled={saving || !supported}
              onClick={onToggleEnable}
            >
              {prefs.enabled ? "On" : "Off"}
            </button>
          </div>
          {isIOSLike && prefs.enabled && (
            <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              This device doesn't support scheduled notifications. Reminders
              only fire while the app is open. For reliable alerts, install the
              PWA to your Home Screen and keep it open near your meal times.
            </p>
          )}
        </div>

        <div className={`card mb-4 ${!prefs.enabled ? "opacity-50" : ""}`}>
          <h3 className="mb-3 font-semibold">Meals</h3>
          <label className="block text-sm text-neutral-600">
            Remind me
            <select
              className="input mt-1"
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

        <div className={`card mb-4 ${!prefs.enabled ? "opacity-50" : ""}`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Morning weigh-in</h3>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-500"
              checked={!!prefs.weighInEnabled}
              disabled={!prefs.enabled || saving}
              onChange={(e) =>
                save({ ...prefs, weighInEnabled: e.target.checked ? 1 : 0 })
              }
            />
          </div>
          <label className="block text-sm text-neutral-600">
            Time
            <input
              type="time"
              className="input mt-1"
              value={prefs.weighInTime}
              disabled={!prefs.enabled || !prefs.weighInEnabled || saving}
              onChange={(e) => save({ ...prefs, weighInTime: e.target.value })}
            />
          </label>
        </div>

        <div className={`card mb-4 ${!prefs.enabled ? "opacity-50" : ""}`}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Weekly review (Friday)</h3>
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-500"
              checked={!!prefs.reviewEnabled}
              disabled={!prefs.enabled || saving}
              onChange={(e) =>
                save({ ...prefs, reviewEnabled: e.target.checked ? 1 : 0 })
              }
            />
          </div>
          <label className="block text-sm text-neutral-600">
            Time
            <input
              type="time"
              className="input mt-1"
              value={prefs.reviewTime}
              disabled={!prefs.enabled || !prefs.reviewEnabled || saving}
              onChange={(e) => save({ ...prefs, reviewTime: e.target.value })}
            />
          </label>
        </div>

        {granted && (
          <button className="btn-secondary w-full" onClick={onTest} disabled={saving}>
            Send test notification
          </button>
        )}

        {status && (
          <p className="mt-4 rounded-lg bg-neutral-100 p-3 text-sm text-neutral-700">
            {status}
          </p>
        )}
      </main>
      <TabBar />
    </>
  );
}
