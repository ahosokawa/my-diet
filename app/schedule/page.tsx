"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet } from "@/components/ui/Sheet";
import { ChevronDown, ChevronUp, Dumbbell, Copy, Check } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
import { getSchedule, saveWholeSchedule } from "@/lib/db/repos";
import type { ScheduleDay } from "@/lib/db/schema";
import { WEEKDAY_LABELS, defaultMealTimes, copyTo, toMinutes } from "@/lib/schedule/week";
import { minutesToHhmm } from "@/lib/date";

const SHORT_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function SchedulePage() {
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    getSchedule().then(setDays);
  }, []);

  const persist = useCallback(async (updated: ScheduleDay[]) => {
    setDays(updated);
    await saveWholeSchedule(updated);
    setSaved(true);
    haptic("success");
    setTimeout(() => setSaved(false), 1500);
  }, []);

  function updateDay(weekday: number, patch: Partial<ScheduleDay>) {
    const next = days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d));
    setDays(next);
  }

  function setMealCount(weekday: number, count: number) {
    const day = days.find((d) => d.weekday === weekday);
    const workoutEnd =
      day?.workoutStart && day.workoutDurationMin
        ? minutesToHhmm(toMinutes(day.workoutStart) + day.workoutDurationMin)
        : undefined;
    updateDay(weekday, { mealTimes: defaultMealTimes(count, workoutEnd) });
  }

  function startCopy(from: number) {
    setCopyFrom(from);
    setCopyTargets(new Set());
  }

  function toggleCopyTarget(weekday: number) {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(weekday)) next.delete(weekday);
      else next.add(weekday);
      return next;
    });
  }

  function applyCopy() {
    if (copyFrom === null || copyTargets.size === 0) return;
    persist(copyTo(days, copyFrom, Array.from(copyTargets)));
    setCopyFrom(null);
    setCopyTargets(new Set());
    setEditing(null);
  }

  async function save() {
    await persist(days);
  }

  if (days.length === 0) return null;

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <Header title="Schedule" back="/today" scrollRef={scrollRef} />

        <div className="px-4 pb-4">
          <div className="space-y-2">
            {days.map((d) => {
              const isEditing = editing === d.weekday;
              return (
                <div key={d.weekday} className="card !p-0 overflow-hidden">
                  <button
                    className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-surface-3"
                    onClick={() => setEditing(isEditing ? null : d.weekday)}
                    aria-expanded={isEditing}
                  >
                    <span className="font-semibold">{WEEKDAY_LABELS[d.weekday]}</span>
                    <div className="flex items-center gap-2 text-sm text-fg-3">
                      <span className="tabular-nums">
                        {d.mealTimes.length} meal{d.mealTimes.length !== 1 ? "s" : ""}
                      </span>
                      {d.workoutStart && (
                        <span className="inline-flex items-center gap-1 text-fg-2">
                          <Dumbbell className="h-3.5 w-3.5" /> {d.workoutStart}
                        </span>
                      )}
                      {isEditing ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {isEditing && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 border-t border-hairline px-4 py-4">
                          <div>
                            <label className="label">Meals per day</label>
                            <SegmentedControl
                              value={d.mealTimes.length}
                              onChange={(v) => setMealCount(d.weekday, v)}
                              options={[1, 2, 3, 4, 5, 6].map((n) => ({
                                value: n,
                                label: String(n),
                              }))}
                              ariaLabel="Meals per day"
                            />
                          </div>

                          <div>
                            <label className="label">Meal times</label>
                            <div className="space-y-1.5">
                              {d.mealTimes.map((t, i) => (
                                <input
                                  key={i}
                                  type="time"
                                  className="input"
                                  value={t}
                                  onChange={(e) => {
                                    const times = [...d.mealTimes];
                                    times[i] = e.target.value;
                                    updateDay(d.weekday, { mealTimes: times });
                                  }}
                                />
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="label">Workout (optional)</label>
                            <div className="flex gap-2">
                              <input
                                type="time"
                                className="input"
                                placeholder="Start"
                                value={d.workoutStart ?? ""}
                                onChange={(e) =>
                                  updateDay(d.weekday, {
                                    workoutStart: e.target.value || undefined,
                                  })
                                }
                              />
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder="min"
                                className="input w-24"
                                value={d.workoutDurationMin ?? ""}
                                onChange={(e) =>
                                  updateDay(d.weekday, {
                                    workoutDurationMin: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  })
                                }
                              />
                            </div>
                            {d.workoutStart && (
                              <button
                                className="mt-2 text-xs font-medium text-red-500"
                                onClick={() =>
                                  updateDay(d.weekday, {
                                    workoutStart: undefined,
                                    workoutDurationMin: undefined,
                                  })
                                }
                              >
                                Remove workout
                              </button>
                            )}
                          </div>

                          <button
                            className="btn-secondary flex w-full items-center justify-center gap-2 text-sm"
                            onClick={() => startCopy(d.weekday)}
                          >
                            <Copy className="h-4 w-4" /> Copy this day to…
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <button className="btn-primary w-full" onClick={save}>
              {saved ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-4 w-4" /> Saved
                </span>
              ) : (
                "Save schedule"
              )}
            </button>
          </div>
        </div>
      </main>
      <TabBar />

      <Sheet
        open={copyFrom !== null}
        onClose={() => {
          setCopyFrom(null);
          setCopyTargets(new Set());
        }}
        title={
          copyFrom !== null ? `Copy ${WEEKDAY_LABELS[copyFrom]} to…` : ""
        }
        detent="medium"
        footer={
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                setCopyFrom(null);
                setCopyTargets(new Set());
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
              disabled={copyTargets.size === 0}
              onClick={applyCopy}
            >
              Paste to {copyTargets.size}
            </button>
          </div>
        }
      >
        <div className="space-y-1">
          {days.map((d) => {
            if (d.weekday === copyFrom) return null;
            const selected = copyTargets.has(d.weekday);
            return (
              <button
                key={d.weekday}
                onClick={() => toggleCopyTarget(d.weekday)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 active:bg-surface-3"
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      selected
                        ? "bg-brand-500 text-white"
                        : "bg-surface-3 text-fg-2"
                    }`}
                  >
                    {SHORT_LABELS[d.weekday]}
                  </span>
                  <span className="text-sm font-medium">
                    {WEEKDAY_LABELS[d.weekday]}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                    selected
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-hairline"
                  }`}
                >
                  {selected && <Check className="h-4 w-4" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
