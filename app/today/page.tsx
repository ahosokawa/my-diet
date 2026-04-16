"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { MacroRow } from "@/components/MacroBar";
import { TabBar } from "@/components/TabBar";
import {
  getCurrentTargets,
  getSchedule,
  getMealLogsForDate,
  hasPendingTargetChange,
  isReviewEligible,
  todayStr,
} from "@/lib/db/repos";
import type { Targets, ScheduleDay, MealLog } from "@/lib/db/schema";
import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";
import { postWorkoutMealIndex } from "@/lib/schedule/week";

type MealCard = {
  index: number;
  time: string;
  postWorkout: boolean;
  target: { kcal: number; proteinG: number; fatG: number; carbG: number };
  logged?: MealLog;
};

function parseDate(s: string): Date {
  return new Date(s + "T12:00:00");
}

function formatDate(s: string): string {
  const d = parseDate(s);
  const today = todayStr();
  if (s === today) return "Today";
  const yesterday = shiftDate(today, -1);
  const tomorrow = shiftDate(today, 1);
  if (s === yesterday) return "Yesterday";
  if (s === tomorrow) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shiftDate(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function TodayView() {
  const router = useRouter();
  const search = useSearchParams();
  const dateParam = search.get("d");
  const date = useMemo(() => dateParam ?? todayStr(), [dateParam]);
  const isToday = date === todayStr();

  const [targets, setTargets] = useState<Targets | null>(null);
  const [meals, setMeals] = useState<MealCard[]>([]);
  const [reviewPending, setReviewPending] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, sched, logs] = await Promise.all([
        getCurrentTargets(),
        getSchedule(),
        getMealLogsForDate(date),
      ]);
      if (!t) return;
      setTargets(t);

      const weekday = parseDate(date).getDay();
      const day: ScheduleDay = sched[weekday] ?? sched[0];
      const pwIdx = postWorkoutMealIndex(day);
      const slots: MealSlot[] = day.mealTimes.map((time, i) => ({
        index: i,
        time,
        postWorkout: i === pwIdx,
      }));

      const mealTargets = distributeMeals(
        { kcal: t.kcal, proteinG: t.proteinG, fatG: t.fatG, carbG: t.carbG },
        slots
      );

      const cards: MealCard[] = slots.map((s, i) => ({
        index: i,
        time: s.time,
        postWorkout: s.postWorkout,
        target: mealTargets[i],
        logged: logs.find((l) => l.index === i),
      }));
      setMeals(cards);
    })();
  }, [date]);

  useEffect(() => {
    (async () => {
      const [eligible, pending] = await Promise.all([
        isReviewEligible(),
        hasPendingTargetChange(),
      ]);
      setReviewPending(eligible && !pending);
    })();
  }, [date]);

  const totalTarget = targets
    ? { kcal: targets.kcal, proteinG: targets.proteinG, fatG: targets.fatG, carbG: targets.carbG }
    : { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };

  const totalActual = meals.reduce(
    (acc, m) => {
      if (!m.logged) return acc;
      return {
        kcal: acc.kcal + m.logged.kcal,
        proteinG: acc.proteinG + m.logged.proteinG,
        fatG: acc.fatG + m.logged.fatG,
        carbG: acc.carbG + m.logged.carbG,
      };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }
  );

  function go(d: string) {
    if (d === todayStr()) router.replace("/today");
    else router.replace(`/today?d=${d}`);
  }

  if (!targets) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Today" />
          <p className="mt-12 text-center text-neutral-500">Loading…</p>
        </main>
        <TabBar />
      </>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-4">
        <Header title={formatDate(date)} />

      <div className="mb-4 flex items-center justify-between">
        <button
          aria-label="Previous day"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-neutral-700 shadow-sm active:bg-neutral-100"
          onClick={() => go(shiftDate(date, -1))}
        >
          ‹
        </button>
        {!isToday ? (
          <button
            className="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-medium text-white active:bg-brand-600"
            onClick={() => go(todayStr())}
          >
            Today
          </button>
        ) : (
          <span className="text-sm text-neutral-400">{date}</span>
        )}
        <button
          aria-label="Next day"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-neutral-700 shadow-sm active:bg-neutral-100"
          onClick={() => go(shiftDate(date, 1))}
        >
          ›
        </button>
      </div>

      {isToday && reviewPending && (
        <Link
          href="/review"
          className="card mb-4 block bg-brand-50 active:bg-brand-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-brand-700">
                Weekly check-in
              </div>
              <div className="text-sm text-neutral-700">
                Review this week's trend →
              </div>
            </div>
          </div>
        </Link>
      )}

      <div className="card mb-4">
        <h2 className="mb-3 font-semibold">Daily totals</h2>
        <MacroRow target={totalTarget} current={totalActual} />
      </div>

      <div className="space-y-3">
        {meals.map((m) => {
          const logged = !!m.logged;
          return (
            <Link
              key={m.index}
              href={`/meals?d=${date}&i=${m.index}`}
              className={`card block ${logged ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  Meal {m.index + 1}
                  {m.postWorkout && (
                    <span className="ml-2 text-xs text-brand-600">post-workout</span>
                  )}
                </span>
                <span className="text-sm text-neutral-500">{m.time}</span>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-neutral-500">
                <span>{m.target.kcal} kcal</span>
                <span>{m.target.proteinG}P</span>
                <span>{m.target.fatG}F</span>
                <span>{m.target.carbG}C</span>
              </div>
              {logged && (
                <div className="mt-1 text-xs font-medium text-brand-600">
                  Logged ✓
                </div>
              )}
            </Link>
          );
        })}
      </div>

      </main>
      <TabBar />
    </>
  );
}

export default function TodayPage() {
  return (
    <Suspense
      fallback={
        <>
          <main className="flex-1 overflow-y-auto p-4">
            <Header title="Today" />
          </main>
          <TabBar />
        </>
      }
    >
      <TodayView />
    </Suspense>
  );
}
