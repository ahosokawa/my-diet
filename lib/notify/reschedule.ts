import { getNotifPrefs, getProfile, getSchedule, REVIEW_ELIGIBLE_AFTER_MS } from "@/lib/db/repos";
import type { NotifPrefs } from "@/lib/db/schema";
import { clearAll, scheduleEvents, supportsNotifications } from "./driver";
import { upcomingEvents } from "./schedule";
import { todayStr } from "@/lib/date";

const HORIZON_DAYS = 7;

export async function rescheduleNotifications(override?: NotifPrefs): Promise<void> {
  if (!supportsNotifications() || Notification.permission !== "granted") return;
  const prefs = override ?? (await getNotifPrefs());
  if (!prefs.enabled) {
    await clearAll();
    return;
  }
  const [schedule, profile] = await Promise.all([getSchedule(), getProfile()]);
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

// Returns a string signature of the inputs that determine the schedule. Used
// by NotificationBootstrap to skip redundant reschedules on every tab focus.
export async function reschedulingSignature(): Promise<string> {
  const [prefs, schedule, profile] = await Promise.all([
    getNotifPrefs(),
    getSchedule(),
    getProfile(),
  ]);
  const eligible = profile ? profile.createdAt + REVIEW_ELIGIBLE_AFTER_MS : 0;
  return JSON.stringify({ day: todayStr(), prefs, schedule, eligible });
}
