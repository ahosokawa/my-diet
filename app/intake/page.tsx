"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ACTIVITY_FACTORS, type ActivityLevel, type Sex, tdee } from "@/lib/nutrition/mifflin";
import { macrosFromKcal } from "@/lib/nutrition/macros";
import { saveProfile, saveTargets, seedFoodsIfEmpty, saveWholeSchedule, todayStr } from "@/lib/db/repos";
import type { ScheduleDay } from "@/lib/db/schema";
import { Header } from "@/components/Header";
import { WEEKDAY_LABELS, defaultMealTimes, toMinutes } from "@/lib/schedule/week";

type Draft = {
  sex: Sex;
  age: number | "";
  heightFt: number | "";
  heightIn: number | "";
  weightLb: number | "";
  activity: ActivityLevel;
};

const INITIAL: Draft = {
  sex: "male",
  age: "",
  heightFt: "",
  heightIn: "",
  weightLb: "",
  activity: "moderate",
};

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary (desk job, little exercise)",
  light: "Light (1–3 workouts/week)",
  moderate: "Moderate (3–5 workouts/week)",
  active: "Active (6–7 workouts/week)",
  very_active: "Very active (physical job + training)",
};

const TOTAL_STEPS = 7;

function minutesToHhmm(min: number): string {
  const h = String(Math.floor(min / 60) % 24).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function makeDefaultSchedule(): ScheduleDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    weekday: i as ScheduleDay["weekday"],
    mealTimes: defaultMealTimes(3),
  }));
}

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

  const kcalOptions = useMemo(() => {
    if (!computedKcal) return null;
    return {
      low: computedKcal - 200,
      rec: computedKcal,
      high: computedKcal + 200,
    };
  }, [computedKcal]);

  const finalKcal = useMemo(() => {
    if (!kcalOptions) return 0;
    if (calChoice === "custom" && typeof customKcal === "number") return customKcal;
    return kcalOptions[calChoice === "custom" ? "rec" : calChoice];
  }, [calChoice, customKcal, kcalOptions]);

  const finalMacros = useMemo(() => {
    if (!finalKcal || typeof d.weightLb !== "number") return null;
    return macrosFromKcal({ kcal: finalKcal, weightLb: d.weightLb });
  }, [finalKcal, d.weightLb]);

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
    if (step === 5) return true; // schedule
    if (step === 6) return calChoice !== "custom" || (typeof customKcal === "number" && customKcal > 0);
    return true;
  })();

  function updateScheduleDay(weekday: number, patch: Partial<ScheduleDay>) {
    setSchedule((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
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

  async function finish() {
    if (!finalMacros || typeof d.age !== "number" || typeof d.heightFt !== "number" || typeof d.heightIn !== "number" || typeof d.weightLb !== "number")
      return;
    setSubmitting(true);
    const heightIn = d.heightFt * 12 + d.heightIn;

    await saveProfile({
      sex: d.sex,
      age: d.age,
      heightIn,
      weightLb: d.weightLb,
      activity: d.activity,
    });
    await saveTargets({
      dateEffective: todayStr(),
      kcal: finalMacros.kcal,
      proteinG: finalMacros.proteinG,
      fatG: finalMacros.fatG,
      carbG: finalMacros.carbG,
      source: calChoice === "rec" ? "auto" : "override",
    });
    await saveWholeSchedule(schedule);
    await seedFoodsIfEmpty();
    router.replace("/today");
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <Header title="Welcome" />
      <div className="mt-4 mb-6 flex gap-1">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand-500" : "bg-neutral-200"}`}
          />
        ))}
      </div>

      <div className="card min-h-[280px]">
        {/* Step 0: Sex */}
        {step === 0 && (
          <>
            <h2 className="mb-4 text-xl font-semibold">What&apos;s your sex?</h2>
            <p className="mb-6 text-sm text-neutral-500">Used for your baseline metabolic rate.</p>
            <div className="grid grid-cols-2 gap-3">
              {(["male", "female"] as Sex[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setD({ ...d, sex: s })}
                  className={`rounded-xl border-2 px-4 py-4 text-base font-medium capitalize ${
                    d.sex === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-neutral-200 bg-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 1: Age */}
        {step === 1 && (
          <>
            <h2 className="mb-4 text-xl font-semibold">How old are you?</h2>
            <label className="label">Age (years)</label>
            <input
              inputMode="numeric"
              className="input"
              value={d.age}
              onChange={(e) => setD({ ...d, age: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </>
        )}

        {/* Step 2: Height */}
        {step === 2 && (
          <>
            <h2 className="mb-4 text-xl font-semibold">How tall are you?</h2>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Feet</label>
                <input
                  inputMode="numeric"
                  className="input"
                  value={d.heightFt}
                  onChange={(e) => setD({ ...d, heightFt: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
              <div className="flex-1">
                <label className="label">Inches</label>
                <input
                  inputMode="numeric"
                  className="input"
                  value={d.heightIn}
                  onChange={(e) => setD({ ...d, heightIn: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
            </div>
          </>
        )}

        {/* Step 3: Weight */}
        {step === 3 && (
          <>
            <h2 className="mb-4 text-xl font-semibold">Current weight?</h2>
            <label className="label">Pounds</label>
            <input
              inputMode="decimal"
              className="input"
              value={d.weightLb}
              onChange={(e) => setD({ ...d, weightLb: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </>
        )}

        {/* Step 4: Activity */}
        {step === 4 && (
          <>
            <h2 className="mb-4 text-xl font-semibold">Activity level</h2>
            <p className="mb-4 text-sm text-neutral-500">Pick what best matches a typical week.</p>
            <div className="space-y-2">
              {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setD({ ...d, activity: k })}
                  className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-medium ${
                    d.activity === k
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  {ACTIVITY_LABELS[k]}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 5: Schedule */}
        {step === 5 && (
          <>
            <h2 className="mb-2 text-xl font-semibold">Weekly schedule</h2>
            <p className="mb-4 text-sm text-neutral-500">
              Set meals per day and workout times. Tap a day to edit, then copy to similar days.
            </p>

            {copyFrom !== null && (
              <div className="mb-3 rounded-xl bg-brand-50 p-3">
                <p className="mb-2 text-sm font-medium">
                  Copy {WEEKDAY_LABELS[copyFrom]} to:
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {schedule.map((sd) => {
                    if (sd.weekday === copyFrom) return null;
                    const selected = copyTargets.has(sd.weekday);
                    return (
                      <button
                        key={sd.weekday}
                        onClick={() => {
                          setCopyTargets((prev) => {
                            const next = new Set(prev);
                            if (next.has(sd.weekday)) next.delete(sd.weekday);
                            else next.add(sd.weekday);
                            return next;
                          });
                        }}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          selected
                            ? "bg-brand-500 text-white"
                            : "bg-white text-neutral-700"
                        }`}
                      >
                        {WEEKDAY_LABELS[sd.weekday]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-secondary flex-1 text-xs"
                    onClick={() => { setCopyFrom(null); setCopyTargets(new Set()); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary flex-1 text-xs"
                    disabled={copyTargets.size === 0}
                    onClick={applyCopy}
                  >
                    Paste
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {schedule.map((sd) => {
                const isEditing = editingDay === sd.weekday;
                return (
                  <div
                    key={sd.weekday}
                    className="rounded-xl border border-neutral-200 bg-white p-3"
                  >
                    <div
                      className="flex cursor-pointer items-center justify-between"
                      onClick={() => setEditingDay(isEditing ? null : sd.weekday)}
                    >
                      <span className="text-sm font-semibold">
                        {WEEKDAY_LABELS[sd.weekday]}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {sd.mealTimes.length} meals
                        {sd.workoutStart ? ` · 🏋️ ${sd.workoutStart}` : ""}
                      </span>
                    </div>

                    {isEditing && (
                      <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <label className="label">Meals</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                              <button
                                key={n}
                                onClick={() => setMealCount(sd.weekday, n)}
                                className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
                                  sd.mealTimes.length === n
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
                                  updateScheduleDay(sd.weekday, { mealTimes: times });
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
                              className="mt-1 text-xs text-red-500"
                              onClick={() =>
                                updateScheduleDay(sd.weekday, {
                                  workoutStart: undefined,
                                  workoutDurationMin: undefined,
                                })
                              }
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <button
                          className="w-full rounded-lg bg-neutral-100 py-2 text-xs font-medium"
                          onClick={() => {
                            setCopyFrom(sd.weekday);
                            setCopyTargets(new Set());
                          }}
                        >
                          Copy this day to…
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Step 6: Calorie review */}
        {step === 6 && kcalOptions && (
          <>
            <h2 className="mb-2 text-xl font-semibold">Daily calorie target</h2>
            <p className="mb-4 text-sm text-neutral-500">
              Based on your info, we recommend <strong>{kcalOptions.rec} kcal</strong> to maintain weight.
              Pick an option or enter a custom amount.
            </p>

            <div className="space-y-2">
              {([
                { key: "low" as const, label: "Slightly under", kcal: kcalOptions.low },
                { key: "rec" as const, label: "Recommended", kcal: kcalOptions.rec },
                { key: "high" as const, label: "Slightly over", kcal: kcalOptions.high },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setCalChoice(opt.key)}
                  className={`w-full rounded-xl border-2 px-4 py-3 text-left ${
                    calChoice === opt.key
                      ? "border-brand-500 bg-brand-50"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-lg font-bold">{opt.kcal} <span className="text-xs font-normal text-neutral-500">kcal</span></span>
                  </div>
                </button>
              ))}

              <button
                onClick={() => setCalChoice("custom")}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left ${
                  calChoice === "custom"
                    ? "border-brand-500 bg-brand-50"
                    : "border-neutral-200 bg-white"
                }`}
              >
                <span className="text-sm font-medium">Custom</span>
              </button>

              {calChoice === "custom" && (
                <div className="mt-2">
                  <label className="label">Calories per day</label>
                  <input
                    inputMode="numeric"
                    className="input"
                    placeholder="e.g. 2400"
                    value={customKcal}
                    onChange={(e) =>
                      setCustomKcal(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
              )}
            </div>

            {finalMacros && (
              <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-neutral-700">Macro breakdown</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-green-600">{finalMacros.proteinG}g</div>
                    <div className="text-xs text-neutral-500">Protein</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-500">{finalMacros.fatG}g</div>
                    <div className="text-xs text-neutral-500">Fat</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-500">{finalMacros.carbG}g</div>
                    <div className="text-xs text-neutral-500">Carbs</div>
                  </div>
                </div>
                <div className="mt-2 text-center text-sm font-medium">{finalMacros.kcal} kcal</div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button className="btn-secondary flex-1" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <button
            disabled={!canContinue}
            className="btn-primary flex-1"
            onClick={() => setStep(step + 1)}
          >
            Continue
          </button>
        ) : (
          <button disabled={submitting || !canContinue} className="btn-primary flex-1" onClick={finish}>
            {submitting ? "Saving…" : "Start tracking"}
          </button>
        )}
      </div>
    </main>
  );
}
