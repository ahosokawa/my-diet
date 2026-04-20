"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ACTIVITY_FACTORS, type ActivityLevel, type Sex, tdee } from "@/lib/nutrition/mifflin";
import {
  DEFAULT_FAT_PER_LB,
  DEFAULT_PROTEIN_PER_LB,
  kcalForGoal,
  macrosFromKcal,
  type Goal,
} from "@/lib/nutrition/macros";
import {
  saveProfile,
  saveTargets,
  seedFoodsIfEmpty,
  saveWholeSchedule,
  todayStr,
} from "@/lib/db/repos";
import type { ScheduleDay } from "@/lib/db/schema";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Check, Dumbbell, ChevronDown, ChevronUp, Copy } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
import { WEEKDAY_LABELS, defaultMealTimes, toMinutes } from "@/lib/schedule/week";
import { minutesToHhmm } from "@/lib/date";

type Draft = {
  sex: Sex;
  age: number | "";
  heightFt: number | "";
  heightIn: number | "";
  weightLb: number | "";
  activity: ActivityLevel;
  goal: Goal;
};

const INITIAL: Draft = {
  sex: "male",
  age: "",
  heightFt: "",
  heightIn: "",
  weightLb: "",
  activity: "moderate",
  goal: "maintain",
};

const GOAL_LABELS: Record<Goal, string> = {
  cut: "Lose fat",
  maintain: "Maintain",
  bulk: "Gain muscle",
};

const GOAL_HINTS: Record<Goal, string> = {
  cut: "0.5–1%/wk loss",
  maintain: "Hold current weight",
  bulk: "0.25–0.5%/wk gain",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very active",
};

const ACTIVITY_HINTS: Record<ActivityLevel, string> = {
  sedentary: "Desk job, little exercise",
  light: "1–3 workouts/week",
  moderate: "3–5 workouts/week",
  active: "6–7 workouts/week",
  very_active: "Physical job + training",
};

const SHORT_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const TOTAL_STEPS = 8;

function makeDefaultSchedule(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    weekday: i as ScheduleDay["weekday"],
    mealTimes: defaultMealTimes(3),
  }));
}

const STEP_TITLES = [
  "What's your sex?",
  "How old are you?",
  "How tall are you?",
  "Current weight?",
  "Activity level",
  "What's your goal?",
  "Weekly schedule",
  "Daily calorie target",
];

export default function IntakePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(INITIAL);
  const [schedule, setSchedule] = useState<ScheduleDay[]>(makeDefaultSchedule);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set());
  const [calChoice, setCalChoice] = useState<"low" | "rec" | "high" | "custom">("rec");
  const [customKcal, setCustomKcal] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [proteinPerLb, setProteinPerLb] = useState<number>(DEFAULT_PROTEIN_PER_LB);
  const [fatPerLb, setFatPerLb] = useState<number>(DEFAULT_FAT_PER_LB);

  const computedKcal = useMemo(() => {
    if (
      typeof d.age !== "number" ||
      typeof d.heightFt !== "number" ||
      typeof d.heightIn !== "number" ||
      typeof d.weightLb !== "number"
    )
      return null;
    return Math.round(
      tdee({
        sex: d.sex,
        age: d.age,
        heightIn: d.heightFt * 12 + d.heightIn,
        weightLb: d.weightLb,
        activity: d.activity,
      })
    );
  }, [d]);

  const goalKcal = useMemo(() => {
    if (!computedKcal || typeof d.weightLb !== "number") return null;
    return kcalForGoal({ tdee: computedKcal, weightLb: d.weightLb, goal: d.goal });
  }, [computedKcal, d.weightLb, d.goal]);

  const kcalOptions = useMemo(() => {
    if (!goalKcal) return null;
    return {
      low: goalKcal - 200,
      rec: goalKcal,
      high: goalKcal + 200,
    };
  }, [goalKcal]);

  const finalKcal = useMemo(() => {
    if (!kcalOptions) return 0;
    if (calChoice === "custom" && typeof customKcal === "number") return customKcal;
    return kcalOptions[calChoice === "custom" ? "rec" : calChoice];
  }, [calChoice, customKcal, kcalOptions]);

  const finalMacros = useMemo(() => {
    if (!finalKcal || typeof d.weightLb !== "number") return null;
    return macrosFromKcal({
      kcal: finalKcal,
      weightLb: d.weightLb,
      proteinPerLb,
      fatPerLb,
    });
  }, [finalKcal, d.weightLb, proteinPerLb, fatPerLb]);

  const canContinue = (() => {
    if (step === 0) return true;
    if (step === 1) return typeof d.age === "number" && d.age > 10 && d.age < 100;
    if (step === 2)
      return (
        typeof d.heightFt === "number" &&
        typeof d.heightIn === "number" &&
        d.heightFt > 0 &&
        d.heightIn >= 0 &&
        d.heightIn < 12
      );
    if (step === 3) return typeof d.weightLb === "number" && d.weightLb > 40;
    if (step === 4) return true;
    if (step === 5) return true;
    if (step === 6) return true;
    if (step === 7)
      return calChoice !== "custom" || (typeof customKcal === "number" && customKcal > 0);
    return true;
  })();

  function updateScheduleDay(weekday: number, patch: Partial<ScheduleDay>) {
    setSchedule((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d))
    );
  }

  function setMealCount(weekday: number, count: number) {
    const day = schedule.find((d) => d.weekday === weekday);
    const workoutEnd =
      day?.workoutStart && day.workoutDurationMin
        ? minutesToHhmm(toMinutes(day.workoutStart) + day.workoutDurationMin)
        : undefined;
    updateScheduleDay(weekday, { mealTimes: defaultMealTimes(count, workoutEnd) });
  }

  function applyCopy() {
    if (copyFrom === null || copyTargets.size === 0) return;
    const src = schedule.find((d) => d.weekday === copyFrom);
    if (!src) return;
    setSchedule((prev) =>
      prev.map((d) =>
        copyTargets.has(d.weekday) && d.weekday !== copyFrom
          ? { ...src, weekday: d.weekday as ScheduleDay["weekday"] }
          : d
      )
    );
    setCopyFrom(null);
    setCopyTargets(new Set());
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    haptic("light");
  }
  function back() {
    if (step > 0) setStep(step - 1);
  }

  async function finish() {
    if (
      !finalMacros ||
      typeof d.age !== "number" ||
      typeof d.heightFt !== "number" ||
      typeof d.heightIn !== "number" ||
      typeof d.weightLb !== "number"
    )
      return;
    setSubmitting(true);
    const heightIn = d.heightFt * 12 + d.heightIn;

    await saveProfile({
      sex: d.sex,
      age: d.age,
      heightIn,
      weightLb: d.weightLb,
      activity: d.activity,
      goal: d.goal,
      goalStartDate: todayStr(),
    });
    await saveTargets({
      dateEffective: todayStr(),
      kcal: finalMacros.kcal,
      proteinG: finalMacros.proteinG,
      fatG: finalMacros.fatG,
      carbG: finalMacros.carbG,
      proteinPerLb,
      fatPerLb,
      source: calChoice === "rec" ? "auto" : "override",
    });
    await saveWholeSchedule(schedule);
    await seedFoodsIfEmpty();
    haptic("success");
    router.replace("/today");
  }

  return (
    <main className="flex flex-1 flex-col">
      <div
        className="px-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-brand-500" : "bg-surface-3"
                }`}
              />
            ))}
          </div>
          <span className="text-xs font-medium tabular-nums text-fg-3">
            {step + 1} / {TOTAL_STEPS}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">
          {STEP_TITLES[step]}
        </h1>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className="mt-4"
          >
            {step === 0 && (
              <>
                <p className="mb-4 text-sm text-fg-2">
                  Used for your baseline metabolic rate.
                </p>
                <SegmentedControl
                  value={d.sex}
                  onChange={(v) => setD({ ...d, sex: v })}
                  options={[
                    { value: "male", label: "Male" },
                    { value: "female", label: "Female" },
                  ]}
                  ariaLabel="Sex"
                />
              </>
            )}

            {step === 1 && (
              <>
                <label className="label">Age (years)</label>
                <input
                  inputMode="numeric"
                  autoFocus
                  aria-label="Age"
                  className="input text-2xl font-semibold tabular-nums"
                  value={d.age}
                  onChange={(e) =>
                    setD({
                      ...d,
                      age: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </>
            )}

            {step === 2 && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="label">Feet</label>
                  <input
                    inputMode="numeric"
                    autoFocus
                    aria-label="Feet"
                    className="input text-2xl font-semibold tabular-nums"
                    value={d.heightFt}
                    onChange={(e) =>
                      setD({
                        ...d,
                        heightFt: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="label">Inches</label>
                  <input
                    inputMode="numeric"
                    aria-label="Inches"
                    className="input text-2xl font-semibold tabular-nums"
                    value={d.heightIn}
                    onChange={(e) =>
                      setD({
                        ...d,
                        heightIn: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <label className="label">Pounds</label>
                <input
                  inputMode="decimal"
                  autoFocus
                  aria-label="Weight pounds"
                  className="input text-2xl font-semibold tabular-nums"
                  value={d.weightLb}
                  onChange={(e) =>
                    setD({
                      ...d,
                      weightLb: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </>
            )}

            {step === 4 && (
              <div className="space-y-2">
                {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((k) => {
                  const active = d.activity === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setD({ ...d, activity: k })}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                          : "border-hairline bg-surface-2"
                      }`}
                    >
                      <div>
                        <div
                          className={`text-base font-semibold ${active ? "text-brand-700 dark:text-brand-300" : "text-fg-1"}`}
                        >
                          {ACTIVITY_LABELS[k]}
                        </div>
                        <div className="text-xs text-fg-3">{ACTIVITY_HINTS[k]}</div>
                      </div>
                      {active && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 5 && (
              <div className="space-y-2">
                <p className="mb-2 text-sm text-fg-2">
                  We'll adjust your starting calories to match.
                </p>
                {(["cut", "maintain", "bulk"] as Goal[]).map((g) => {
                  const active = d.goal === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setD({ ...d, goal: g })}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                          : "border-hairline bg-surface-2"
                      }`}
                    >
                      <div>
                        <div
                          className={`text-base font-semibold ${active ? "text-brand-700 dark:text-brand-300" : "text-fg-1"}`}
                        >
                          {GOAL_LABELS[g]}
                        </div>
                        <div className="text-xs text-fg-3">{GOAL_HINTS[g]}</div>
                      </div>
                      {active && (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 6 && (
              <>
                <p className="mb-4 text-sm text-fg-2">
                  Set meals per day and workout times. Tap a day to edit, then copy to similar days.
                </p>
                <div className="space-y-2">
                  {schedule.map((sd) => {
                    const isEditing = editingDay === sd.weekday;
                    return (
                      <div
                        key={sd.weekday}
                        className="overflow-hidden rounded-2xl border border-hairline bg-surface-2"
                      >
                        <button
                          className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-surface-3"
                          onClick={() => {
                            if (isEditing && copyFrom === sd.weekday) {
                              setCopyFrom(null);
                              setCopyTargets(new Set());
                            }
                            setEditingDay(isEditing ? null : sd.weekday);
                          }}
                          aria-expanded={isEditing}
                        >
                          <span className="text-sm font-semibold">
                            {WEEKDAY_LABELS[sd.weekday]}
                          </span>
                          <span className="flex items-center gap-2 text-xs text-fg-3">
                            <span className="tabular-nums">
                              {sd.mealTimes.length} meals
                            </span>
                            {sd.workoutStart && (
                              <span className="inline-flex items-center gap-1 text-fg-2">
                                <Dumbbell className="h-3 w-3" /> {sd.workoutStart}
                              </span>
                            )}
                            {isEditing ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </span>
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
                              <div className="space-y-3 border-t border-hairline px-4 py-4">
                                <div>
                                  <label className="label">Meals</label>
                                  <SegmentedControl
                                    value={sd.mealTimes.length}
                                    onChange={(v) => setMealCount(sd.weekday, v)}
                                    options={[1, 2, 3, 4, 5, 6].map((n) => ({
                                      value: n,
                                      label: String(n),
                                    }))}
                                    ariaLabel="Meals"
                                  />
                                </div>
                                <div>
                                  <label className="label">Meal times</label>
                                  <div className="space-y-1">
                                    {sd.mealTimes.map((t, i) => (
                                      <input
                                        key={i}
                                        type="time"
                                        className="input text-sm"
                                        value={t}
                                        onChange={(e) => {
                                          const times = [...sd.mealTimes];
                                          times[i] = e.target.value;
                                          updateScheduleDay(sd.weekday, {
                                            mealTimes: times,
                                          });
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
                                      className="input text-sm"
                                      value={sd.workoutStart ?? ""}
                                      onChange={(e) =>
                                        updateScheduleDay(sd.weekday, {
                                          workoutStart: e.target.value || undefined,
                                        })
                                      }
                                    />
                                    <input
                                      type="number"
                                      inputMode="numeric"
                                      placeholder="min"
                                      className="input w-20 text-sm"
                                      value={sd.workoutDurationMin ?? ""}
                                      onChange={(e) =>
                                        updateScheduleDay(sd.weekday, {
                                          workoutDurationMin: e.target.value
                                            ? Number(e.target.value)
                                            : undefined,
                                        })
                                      }
                                    />
                                  </div>
                                  {sd.workoutStart && (
                                    <button
                                      className="mt-2 text-xs font-medium text-red-500"
                                      onClick={() =>
                                        updateScheduleDay(sd.weekday, {
                                          workoutStart: undefined,
                                          workoutDurationMin: undefined,
                                        })
                                      }
                                    >
                                      Remove workout
                                    </button>
                                  )}
                                </div>
                                {copyFrom === sd.weekday ? (
                                  <div className="rounded-xl border border-hairline bg-surface-1 p-3">
                                    <div className="mb-2 text-xs font-semibold text-fg-2">
                                      Copy {WEEKDAY_LABELS[sd.weekday]} to…
                                    </div>
                                    <div className="space-y-1">
                                      {schedule.map((other) => {
                                        if (other.weekday === sd.weekday) return null;
                                        const on = copyTargets.has(other.weekday);
                                        return (
                                          <button
                                            key={other.weekday}
                                            onClick={() => {
                                              setCopyTargets((prev) => {
                                                const n = new Set(prev);
                                                if (n.has(other.weekday)) n.delete(other.weekday);
                                                else n.add(other.weekday);
                                                return n;
                                              });
                                            }}
                                            className="flex w-full items-center justify-between rounded-lg px-2 py-2 active:bg-surface-3"
                                          >
                                            <span className="flex items-center gap-3">
                                              <span
                                                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                                                  on
                                                    ? "bg-brand-500 text-white"
                                                    : "bg-surface-3 text-fg-2"
                                                }`}
                                              >
                                                {SHORT_LABELS[other.weekday]}
                                              </span>
                                              <span className="text-sm font-medium">
                                                {WEEKDAY_LABELS[other.weekday]}
                                              </span>
                                            </span>
                                            <span
                                              className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                                                on
                                                  ? "border-brand-500 bg-brand-500 text-white"
                                                  : "border-hairline"
                                              }`}
                                            >
                                              {on && (
                                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                              )}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                      <button
                                        className="flex-1 rounded-lg bg-surface-3 py-2 text-xs font-semibold text-fg-2 active:bg-hairline"
                                        onClick={() => {
                                          setCopyFrom(null);
                                          setCopyTargets(new Set());
                                        }}
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        disabled={copyTargets.size === 0}
                                        className="flex-1 rounded-lg bg-brand-500 py-2 text-xs font-semibold text-white active:bg-brand-600 disabled:opacity-50"
                                        onClick={applyCopy}
                                      >
                                        Paste to {copyTargets.size}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-3 py-2 text-xs font-medium text-fg-1 active:bg-hairline"
                                    onClick={() => {
                                      setCopyFrom(sd.weekday);
                                      setCopyTargets(new Set());
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" /> Copy this day to…
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {step === 7 && kcalOptions && (
              <>
                <p className="mb-4 text-sm text-fg-2">
                  Based on your info, we recommend{" "}
                  <strong className="text-fg-1">{kcalOptions.rec} kcal</strong>{" "}
                  {d.goal === "cut"
                    ? "to lose fat at a healthy rate."
                    : d.goal === "bulk"
                    ? "to gain weight at a lean-bulk pace."
                    : "to maintain weight."}
                </p>
                <div className="space-y-2">
                  {(
                    [
                      { key: "low" as const, label: "Slightly under", kcal: kcalOptions.low },
                      { key: "rec" as const, label: "Recommended", kcal: kcalOptions.rec },
                      { key: "high" as const, label: "Slightly over", kcal: kcalOptions.high },
                    ]
                  ).map((opt) => {
                    const active = calChoice === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setCalChoice(opt.key)}
                        className={`flex w-full items-baseline justify-between rounded-2xl border-2 px-4 py-3 ${
                          active
                            ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                            : "border-hairline bg-surface-2"
                        }`}
                      >
                        <span
                          className={`text-sm font-semibold ${active ? "text-brand-700 dark:text-brand-300" : "text-fg-1"}`}
                        >
                          {opt.label}
                        </span>
                        <span className="text-lg font-bold tabular-nums">
                          {opt.kcal}{" "}
                          <span className="text-xs font-normal text-fg-3">kcal</span>
                        </span>
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCalChoice("custom")}
                    className={`w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold ${
                      calChoice === "custom"
                        ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : "border-hairline bg-surface-2 text-fg-1"
                    }`}
                  >
                    Custom
                  </button>

                  {calChoice === "custom" && (
                    <div className="mt-2">
                      <label className="label">Calories per day</label>
                      <input
                        autoFocus
                        inputMode="numeric"
                        aria-label="Custom calories per day"
                        className="input text-2xl font-semibold tabular-nums"
                        placeholder="2400"
                        value={customKcal}
                        onChange={(e) =>
                          setCustomKcal(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                      />
                    </div>
                  )}
                </div>

                {finalMacros && (
                  <div className="mt-4 rounded-2xl bg-surface-3 p-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-3">
                      Macro breakdown
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-xl font-bold tabular-nums" style={{ color: "#26a55e" }}>
                          {finalMacros.proteinG}g
                        </div>
                        <div className="text-xs text-fg-3">Protein</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold tabular-nums" style={{ color: "#f59e0b" }}>
                          {finalMacros.fatG}g
                        </div>
                        <div className="text-xs text-fg-3">Fat</div>
                      </div>
                      <div>
                        <div className="text-xl font-bold tabular-nums" style={{ color: "#3b82f6" }}>
                          {finalMacros.carbG}g
                        </div>
                        <div className="text-xs text-fg-3">Carbs</div>
                      </div>
                    </div>
                    <div className="mt-3 text-center text-sm font-medium tabular-nums">
                      {finalMacros.kcal} kcal
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="mt-4 flex w-full items-center justify-between rounded-2xl border border-hairline bg-surface-2 px-4 py-3 text-left"
                  aria-expanded={showAdvanced}
                >
                  <span className="text-sm font-semibold text-fg-1">Advanced</span>
                  <span className="flex items-center gap-2 text-xs text-fg-3">
                    <span className="tabular-nums">
                      {proteinPerLb.toFixed(2)} P · {fatPerLb.toFixed(2)} F /lb
                    </span>
                    {showAdvanced ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-3 rounded-2xl border border-hairline bg-surface-2 p-4">
                        <p className="text-xs text-fg-3">
                          Grams per pound of bodyweight. Carbs fill remaining kcal.
                        </p>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="label">Protein g/lb</label>
                            <input
                              inputMode="decimal"
                              className="input text-lg font-semibold tabular-nums"
                              value={proteinPerLb}
                              onChange={(e) =>
                                setProteinPerLb(Number(e.target.value) || 0)
                              }
                            />
                          </div>
                          <div className="flex-1">
                            <label className="label">Fat g/lb</label>
                            <input
                              inputMode="decimal"
                              className="input text-lg font-semibold tabular-nums"
                              value={fatPerLb}
                              onChange={(e) =>
                                setFatPerLb(Number(e.target.value) || 0)
                              }
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setProteinPerLb(DEFAULT_PROTEIN_PER_LB);
                            setFatPerLb(DEFAULT_FAT_PER_LB);
                          }}
                          className="text-xs font-medium text-brand-600 dark:text-brand-400"
                        >
                          Reset to defaults
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="border-t border-hairline bg-surface-2/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-3">
          {step > 0 && (
            <button className="btn-secondary flex-1" onClick={back}>
              Back
            </button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <button
              disabled={!canContinue}
              className="btn-primary flex-1"
              onClick={next}
            >
              Continue
            </button>
          ) : (
            <button
              disabled={submitting || !canContinue}
              className="btn-primary flex-1"
              onClick={finish}
            >
              {submitting ? "Saving…" : "Start tracking"}
            </button>
          )}
        </div>
      </div>

    </main>
  );
}
