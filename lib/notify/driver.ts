import type { NotifEvent } from "./schedule";

const TAG_PREFIXES = ["meal-", "weighin-", "review-"] as const;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function supportsNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function supportsTimestampTrigger(): boolean {
  if (!supportsNotifications()) return false;
  try {
    return "showTrigger" in Notification.prototype;
  } catch {
    return false;
  }
}

export function getPermission(): NotificationPermission | "unsupported" {
  if (!supportsNotifications()) return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!supportsNotifications()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function clearAll(): Promise<void> {
  for (const id of timers.values()) clearTimeout(id);
  timers.clear();

  const reg = await getRegistration();
  if (!reg) return;
  try {
    const notifs = await reg.getNotifications();
    for (const n of notifs) {
      if (n.tag && TAG_PREFIXES.some((p) => n.tag.startsWith(p))) n.close();
    }
  } catch {}
}

export async function scheduleEvents(events: NotifEvent[]): Promise<{ scheduled: number; mode: "trigger" | "timeout" | "none" }> {
  if (!supportsNotifications() || Notification.permission !== "granted") {
    return { scheduled: 0, mode: "none" };
  }
  const reg = await getRegistration();
  if (!reg) return { scheduled: 0, mode: "none" };

  await clearAll();

  const useTrigger = supportsTimestampTrigger();
  const scope = reg.scope;
  const icon = `${scope}icons/icon-192.png`;

  let scheduled = 0;
  for (const ev of events) {
    const data = { kind: ev.kind, tag: ev.tag, fireAt: ev.fireAt };
    const opts: NotificationOptions & { showTrigger?: unknown } = {
      body: ev.body,
      tag: ev.tag,
      icon,
      badge: icon,
      data,
    };

    if (useTrigger) {
      const TT = (window as unknown as { TimestampTrigger: new (t: number) => unknown }).TimestampTrigger;
      opts.showTrigger = new TT(ev.fireAt);
      try {
        await reg.showNotification(ev.title, opts as NotificationOptions);
        scheduled++;
      } catch {}
    } else {
      const delay = ev.fireAt - Date.now();
      if (delay <= 0) continue;
      const id = setTimeout(() => {
        timers.delete(ev.tag);
        reg.showNotification(ev.title, opts as NotificationOptions).catch(() => {});
      }, delay);
      timers.set(ev.tag, id);
      scheduled++;
    }
  }

  return { scheduled, mode: useTrigger ? "trigger" : "timeout" };
}

export async function testNotification(): Promise<boolean> {
  if (!supportsNotifications() || Notification.permission !== "granted") return false;
  const reg = await getRegistration();
  if (!reg) return false;
  try {
    const scope = reg.scope;
    const icon = `${scope}icons/icon-192.png`;
    await reg.showNotification("my-diet test", {
      body: "Notifications are working.",
      tag: "test",
      icon,
      badge: icon,
    });
    return true;
  } catch {
    return false;
  }
}
