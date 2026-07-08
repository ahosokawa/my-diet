"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { ChevronDown, ChevronUp, Dumbbell, Copy, Check } from "@/components/ui/Icon";
import { DayScheduleEditor, CopyDayPicker } from "@/components/DayScheduleEditor";
import { haptic } from "@/lib/ui/haptics";
import { getSchedule, saveWholeSchedule } from "@/lib/db/repos";
import type { ScheduleDay } from "@/lib/db/schema";
import { WEEKDAY_LABELS, copyTo } from "@/lib/schedule/week";

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

  if (days.length === 0) {
    return (
      <>
        <main className="flex-1 overflow-y-auto">
          <Header title="Schedule" back="/today" />
          <div className="space-y-2 px-4">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </main>
        <TabBar />
      </>
    );
  }

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
                          <DayScheduleEditor
                            day={d}
                            onChange={(patch) => updateDay(d.weekday, patch)}
                          />

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
        {copyFrom !== null && (
          <CopyDayPicker
            days={days}
            exclude={copyFrom}
            selected={copyTargets}
            onToggle={toggleCopyTarget}
          />
        )}
      </Sheet>
    </>
  );
}
