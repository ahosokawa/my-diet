"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import {
  getSchedule,
  saveWholeSchedule,
} from "@/lib/db/repos";
import type { ScheduleDay } from "@/lib/db/schema";
import { WEEKDAY_LABELS, defaultMealTimes, copyTo, toMinutes } from "@/lib/schedule/week";

export default function SchedulePage() {
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSchedule().then(setDays);
  }, []);

  const persist = useCallback(
    async (updated: ScheduleDay[]) => {
      setDays(updated);
      await saveWholeSchedule(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
    []
  );

  function updateDay(weekday: number, patch: Partial<ScheduleDay>) {
    const next = days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d));
    setDays(next);
  }

  function setMealCount(weekday: number, count: number) {
    const day = days.find((d) => d.weekday === weekday);
    const workoutEnd = day?.workoutStart && day.workoutDurationMin
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

  function selectPreset(preset: "weekdays" | "all") {
    const targets = preset === "weekdays" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    setCopyTargets(new Set(targets.filter((d) => d !== copyFrom)));
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
      <main className="flex-1 overflow-y-auto p-4">
        <Header title="Schedule" />

      {copyFrom !== null && (
        <div className="card mb-4">
          <h3 className="mb-2 font-semibold">
            Copy {WEEKDAY_LABELS[copyFrom]} to:
          </h3>
          <div className="mb-3 flex flex-wrap gap-2">
            {days.map((d) => {
              if (d.weekday === copyFrom) return null;
              const selected = copyTargets.has(d.weekday);
              return (
                <button
                  key={d.weekday}
                  onClick={() => toggleCopyTarget(d.weekday)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    selected
                      ? "bg-brand-500 text-white"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {WEEKDAY_LABELS[d.weekday]}
                </button>
              );
            })}
          </div>
          <div className="mb-3 flex gap-2">
            <button
              className="text-xs font-medium text-brand-600"
              onClick={() => selectPreset("weekdays")}
            >
              Mon–Fri
            </button>
            <button
              className="text-xs font-medium text-brand-600"
              onClick={() => selectPreset("all")}
            >
              All days
            </button>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1 text-sm"
              onClick={() => {
                setCopyFrom(null);
                setCopyTargets(new Set());
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1 text-sm"
              disabled={copyTargets.size === 0}
              onClick={applyCopy}
            >
              Paste to {copyTargets.size} day{copyTargets.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {days.map((d) => {
          const isEditing = editing === d.weekday;
          return (
            <div
              key={d.weekday}
              className="card cursor-pointer"
              onClick={() => setEditing(isEditing ? null : d.weekday)}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {WEEKDAY_LABELS[d.weekday]}
                </span>
                <span className="text-sm text-neutral-500">
                  {d.mealTimes.length} meals
                  {d.workoutStart ? ` · 🏋️ ${d.workoutStart}` : ""}
                </span>
              </div>

              {isEditing && (
                <div
                  className="mt-3 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div>
                    <label className="label">Meals per day</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          onClick={() => setMealCount(d.weekday, n)}
                          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                            d.mealTimes.length === n
                              ? "bg-brand-500 text-white"
                              : "bg-neutral-100"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
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
                    <label className="label">Workout time (optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        className="input"
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
                        className="mt-1 text-xs text-red-500"
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
                    className="btn-secondary w-full text-sm"
                    onClick={() => startCopy(d.weekday)}
                  >
                    Copy this day to…
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex">
        <button className="btn-primary flex-1" onClick={save}>
          {saved ? "Saved ✓" : "Save schedule"}
        </button>
      </div>

      </main>
      <TabBar />
    </>
  );
}

function minutesToHhmm(min: number): string {
  const h = String(Math.floor(min / 60) % 24).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}
