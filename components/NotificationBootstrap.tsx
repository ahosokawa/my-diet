"use client";

import { useEffect, useRef } from "react";
import { rescheduleNotifications, reschedulingSignature } from "@/lib/notify/reschedule";

export function NotificationBootstrap() {
  const lastSigRef = useRef<string | null>(null);

  useEffect(() => {
    async function runIfChanged() {
      try {
        const sig = await reschedulingSignature();
        if (sig === lastSigRef.current) return;
        lastSigRef.current = sig;
        await rescheduleNotifications();
      } catch {}
    }
    runIfChanged();
    const onVis = () => {
      if (document.visibilityState === "visible") runIfChanged();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return null;
}
