"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, type PanInfo } from "framer-motion";
import { Header } from "@/components/Header";
import { MacroRow } from "@/components/MacroBar";
import { TabBar } from "@/components/TabBar";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { Settings, ChevronLeft, ChevronRight, Check, Dumbbell } from "@/components/ui/Icon";
import {
  getCurrentTargets,
  getSchedule,
  getMealLogsForDate,
  hasPendingTargetChange,
  isReviewEligible,
} from "@/lib/db/repos";
import type { Targets, ScheduleDay, MealLog } from "@/lib/db/schema";
import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";
import { postWorkoutMealIndex } from "@/lib/schedule/week";
import { parseYmd, shiftDate, todayStr } from "@/lib/date";

type MealCard = {
  index: number;
  time: string;
  postWorkout: boolean;
  target: { kcal: number; proteinG: number; fatG: number; carbG: number };
  logged?: MealLog;
};

function formatDate(s: string): string {
  const today = todayStr();
  if (s === today) return "Today";
  if (s === shiftDate(today, -1)) return "Yesterday";
  if (s === shiftDate(today, 1)) return "Tomorrow";
  return parseYmd(s).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function TodayView() {
  const router = useRouter();
  const search = useSearchParams();
  const dateParam = search.get("d");
  const date = useMemo(() => dateParam ?? todayStr(), [dateParam]);
  const isToday = date === todayStr();

  const scrollRef = useRef<HTMLElement>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [meals, setMeals] = useState<MealCard[]>([]);
  const [reviewPending, setReviewPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [t, sched, logs] = await Promise.all([
        getCurrentTargets(),
        getSchedule(),
        getMealLogsForDate(date),
      ]);
      if (cancelled) return;
      if (!t) {
        setLoading(false);
        return;
      }
      setTargets(t);

      const weekday = parseYmd(date).getDay();
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
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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
  const loggedCount = meals.filter((m) => m.logged).length;

  function go(d: string) {
    if (d === todayStr()) router.replace("/today");
    else router.replace(`/today?d=${d}`);
  }

  function onSwipeEnd(_: unknown, info: PanInfo) {
    const threshold = 60;
    if (info.offset.x < -threshold || info.velocity.x < -400) go(shiftDate(date, 1));
    else if (info.offset.x > threshold || info.velocity.x > 400) go(shiftDate(date, -1));
  }

  const settingsBtn = (
    <Link
      href="/settings"
      aria-label="Settings"
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-2 transition-transform active:scale-[0.92] active:bg-surface-3"
    >
      <Settings className="h-[22px] w-[22px]" strokeWidth={2} />
    </Link>
  );

  return (
    <>
      <main ref={scrollRef} className="relative flex-1 overflow-y-auto overflow-x-hidden">
        <Header title={formatDate(date)} right={settingsBtn} scrollRef={scrollRef} />

        <div className="px-4 pb-28 pt-2">
          <div className="mb-3 flex items-center justify-between">
            <IconButton
              label="Previous day"
              variant="tinted"
              onClick={() => go(shiftDate(date, -1))}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
            </IconButton>
            {!isToday ? (
              <button
                className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-95 active:bg-brand-600"
                onClick={() => go(todayStr())}
              >
                Jump to today
              </button>
            ) : (
              <span className="text-sm text-fg-3 tabular-nums">{date}</span>
            )}
            <IconButton
              label="Next day"
              variant="tinted"
              onClick={() => go(shiftDate(date, 1))}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.4} />
            </IconButton>
          </div>

          {isToday && reviewPending && (
            <Link
              href="/review"
              className="card mb-4 flex items-center justify-between bg-brand-50 active:bg-brand-100 dark:bg-brand-900/30 dark:active:bg-brand-900/50"
            >
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  Weekly check-in
                </div>
                <div className="text-sm text-fg-1">Review this week's trend</div>
              </div>
              <ChevronRight className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            </Link>
          )}

          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={onSwipeEnd}
          >
            {loading || !targets ? (
              <>
                <Skeleton className="mb-4 h-32" />
                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              </>
            ) : (
              <>
                <div className="card mb-4">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="font-semibold">Daily totals</h2>
                    <span className="text-xs font-medium text-fg-3 tabular-nums">
                      {loggedCount} / {meals.length} logged
                    </span>
                  </div>
                  <MacroRow target={totalTarget} current={totalActual} />
                </div>

                <div className="space-y-3">
                  {meals.map((m) => {
                    const logged = !!m.logged;
                    return (
                      <Link
                        key={m.index}
                        href={`/meals?d=${date}&i=${m.index}`}
                        className="card block transition-transform active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">Meal {m.index + 1}</span>
                            {m.postWorkout && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                                <Dumbbell className="h-3 w-3" /> Post-workout
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-fg-3 tabular-nums">{m.time}</span>
                            {logged && (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                                <Check className="h-4 w-4" strokeWidth={3} />
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex gap-3 text-xs text-fg-2 tabular-nums">
                          <span className="font-medium text-fg-1">{m.target.kcal}</span>
                          <span>{m.target.proteinG}P</span>
                          <span>{m.target.fatG}F</span>
                          <span>{m.target.carbG}C</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
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
