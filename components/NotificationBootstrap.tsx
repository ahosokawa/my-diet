"use client";

import { useEffect } from "react";
import { getProfile, getSchedule, getNotifPrefs } from "@/lib/db/repos";
import { upcomingEvents } from "@/lib/notify/schedule";
import { scheduleEvents, supportsNotifications } from "@/lib/notify/driver";

const HORIZON_DAYS = 7;
const REVIEW_ELIGIBLE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

async function runOnce() {
  if (!supportsNotifications()) return;
  if (Notification.permission !== "granted") return;
  const [prefs, schedule, profile] = await Promise.all([
    getNotifPrefs(),
    getSchedule(),
    getProfile(),
  ]);
  if (!prefs.enabled) return;
  const reviewEligibleAt = profile ? profile.createdAt + REVIEW_ELIGIBLE_AFTER_MS : undefined;
  const events = upcomingEvents({
    now: new Date(),
    horizonDays: HORIZON_DAYS,
    schedule,
    prefs,
    reviewEligibleAt,
  });
  await scheduleEvents(events);
}

export function NotificationBootstrap() {
  useEffect(() => {
    runOnce().catch(() => {});
    const onVis = () => {
      if (document.visibilityState === "visible") runOnce().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return null;
}
