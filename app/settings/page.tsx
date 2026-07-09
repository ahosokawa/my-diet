"use client";

import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DecimalInput } from "@/components/ui/DecimalInput";
import { Bell, Dumbbell, User } from "@/components/ui/Icon";
import { BackupSection } from "./BackupSection";
import { haptic } from "@/lib/ui/haptics";
import {
  DEFAULT_NOTIF_PREFS,
  getCurrentTargets,
  getNotifPrefs,
  getProfile,
  saveNotifPrefs,
  saveProfile,
  saveTargets,
  todayStr,
} from "@/lib/db/repos";
import type { NotifPrefs, Profile, Targets } from "@/lib/db/schema";
import type { ActivityLevel, Sex } from "@/lib/nutrition/mifflin";
import { ACTIVITY_FACTORS, tdee } from "@/lib/nutrition/mifflin";
import {
  DEFAULT_FAT_PER_LB,
  DEFAULT_PROTEIN_PER_LB,
  kcalForGoal,
  macrosFromKcal,
  type Goal,
} from "@/lib/nutrition/macros";
import { Target as TargetIcon } from "@/components/ui/Icon";
import {
  getPermission,
  requestPermission,
  supportsNotifications,
  supportsTimestampTrigger,
  testNotification,
} from "@/lib/notify/driver";
import { rescheduleNotifications } from "@/lib/notify/reschedule";

const LEAD_OPTIONS = [0, 10, 20, 30, 45];

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very active",
};

const GOAL_LABELS: Record<Goal, string> = {
  cut: "Lose fat",
  maintain: "Maintain",
  bulk: "Gain muscle",
};

type PermState = NotificationPermission | "unsupported" | "unknown";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [perm, setPerm] = useState<PermState>("unknown");
  const [hasTrigger, setHasTrigger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<{
    sex: Sex;
    age: number | "";
    heightFt: number | "";
    heightIn: number | "";
    weightLb: number | "";
    activity: ActivityLevel;
  } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState<{
    goal: Goal;
    proteinPerLb: number;
    fatPerLb: number;
  } | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    (async () => {
      const [p, prof, t] = await Promise.all([
        getNotifPrefs(),
        getProfile(),
        getCurrentTargets(),
      ]);
      setPrefs(p);
      if (prof) setProfile(prof);
      if (t) setTargets(t);
      setLoaded(true);
      setPerm(getPermission());
      setHasTrigger(supportsTimestampTrigger());
    })();
  }, []);

  function startEditProfile() {
    if (!profile) return;
    setProfileDraft({
      sex: profile.sex,
      age: profile.age,
      heightFt: Math.floor(profile.heightIn / 12),
      heightIn: profile.heightIn % 12,
      weightLb: profile.weightLb,
      activity: profile.activity,
    });
    setEditingProfile(true);
  }

  async function commitProfile() {
    if (!profile || !profileDraft) return;
    const { sex, age, heightFt, heightIn, weightLb, activity } = profileDraft;
    if (
      typeof age !== "number" ||
      typeof heightFt !== "number" ||
      typeof heightIn !== "number" ||
      typeof weightLb !== "number"
    )
      return;
    setSavingProfile(true);
    const next: Profile = {
      ...profile,
      sex,
      age,
      heightIn: heightFt * 12 + heightIn,
      weightLb,
      activity,
    };
    await saveProfile(next);
    setProfile(next);
    setEditingProfile(false);
    setProfileDraft(null);
    setSavingProfile(false);
  }

  function startEditGoal() {
    if (!profile || !targets) return;
    setGoalDraft({
      goal: profile.goal,
      proteinPerLb: targets.proteinPerLb,
      fatPerLb: targets.fatPerLb,
    });
    setEditingGoal(true);
  }

  async function commitGoal() {
    if (!profile || !targets || !goalDraft) return;
    setSavingGoal(true);
    const today = todayStr();
    const goalChanged = goalDraft.goal !== profile.goal;
    const macrosChanged =
      goalDraft.proteinPerLb !== targets.proteinPerLb ||
      goalDraft.fatPerLb !== targets.fatPerLb;

    if (goalChanged) {
      const nextProfile: Profile = {
        ...profile,
        goal: goalDraft.goal,
        goalStartDate: today,
      };
      await saveProfile(nextProfile);
      setProfile(nextProfile);
    }

    if (goalChanged || macrosChanged) {
      const baseKcal = goalChanged
        ? kcalForGoal({
            tdee: tdee({
              sex: profile.sex,
              age: profile.age,
              heightIn: profile.heightIn,
              weightLb: profile.weightLb,
              activity: profile.activity,
            }),
            weightLb: profile.weightLb,
            goal: goalDraft.goal,
          })
        : targets.kcal;
      const m = macrosFromKcal({
        kcal: baseKcal,
        weightLb: profile.weightLb,
        proteinPerLb: goalDraft.proteinPerLb,
        fatPerLb: goalDraft.fatPerLb,
      });
      const newTargets: Omit<Targets, "id"> = {
        dateEffective: today,
        kcal: m.kcal,
        proteinG: m.proteinG,
        fatG: m.fatG,
        carbG: m.carbG,
        proteinPerLb: goalDraft.proteinPerLb,
        fatPerLb: goalDraft.fatPerLb,
        source: goalChanged ? "auto" : "override",
      };
      await saveTargets(newTargets);
      setTargets({ ...newTargets });
    }

    setEditingGoal(false);
    setGoalDraft(null);
    setSavingGoal(false);
  }

  async function save(next: NotifPrefs) {
    setSaving(true);
    setPrefs(next);
    await saveNotifPrefs(next);
    await rescheduleNotifications(next);
    setSaving(false);
  }

  async function onToggleCarbBias(v: boolean) {
    if (!profile) return;
    const next: Profile = { ...profile, enablePostWorkoutCarbBias: v };
    setProfile(next);
    await saveProfile(next);
    haptic("success");
  }

  async function onToggleEnable() {
    if (!supportsNotifications()) {
      setStatus("Notifications not supported in this browser.");
      return;
    }
    if (prefs.enabled) {
      await save({ ...prefs, enabled: 0 });
      setStatus("Notifications off. Scheduled reminders cleared.");
      return;
    }
    const result = await requestPermission();
    setPerm(result);
    if (result !== "granted") {
      setStatus(
        result === "denied"
          ? "Permission denied. Enable notifications in your browser/OS settings and try again."
          : "Permission not granted."
      );
      return;
    }
    await save({ ...prefs, enabled: 1 });
    setStatus("Notifications on. Reminders scheduled for the next 7 days.");
  }

  async function onTest() {
    const ok = await testNotification();
    setStatus(ok ? "Test notification sent." : "Couldn't send test — check permission.");
  }

  if (!loaded) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Settings" />
          <p className="mt-12 text-center text-fg-3">Loading…</p>
        </main>
        <TabBar />
      </>
    );
  }

  const supported = perm !== "unsupported";
  const granted = perm === "granted";
  const isIOSLike = supported && !hasTrigger;

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <Header title="Settings" scrollRef={scrollRef} />

        <div className="px-4 pb-4">
          {profile && (
            <>
              <div className="card mb-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                    <User className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">Profile</h2>
                    <p className="truncate text-xs text-fg-3">
                      {profile.sex === "male" ? "Male" : "Female"} ·{" "}
                      {profile.age}y · {Math.floor(profile.heightIn / 12)}'
                      {profile.heightIn % 12}" · {profile.weightLb} lb ·{" "}
                      {ACTIVITY_LABELS[profile.activity]}
                    </p>
                  </div>
                  {!editingProfile && (
                    <button
                      aria-label="Edit profile"
                      className="rounded-full bg-surface-3 px-3 py-1.5 text-xs font-semibold text-fg-2 active:bg-hairline"
                      onClick={startEditProfile}
                    >
                      Edit
                    </button>
                  )}
                </div>
                {editingProfile && profileDraft && (
                  <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                    <div>
                      <label className="label">Sex</label>
                      <SegmentedControl
                        value={profileDraft.sex}
                        onChange={(v) =>
                          setProfileDraft({ ...profileDraft, sex: v })
                        }
                        options={[
                          { value: "male", label: "Male" },
                          { value: "female", label: "Female" },
                        ]}
                        ariaLabel="Sex"
                      />
                    </div>
                    <div>
                      <label className="label">Age</label>
                      <input
                        inputMode="numeric"
                        aria-label="Age"
                        className="input text-lg font-semibold tabular-nums"
                        value={profileDraft.age}
                        onChange={(e) =>
                          setProfileDraft({
                            ...profileDraft,
                            age:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="label">Feet</label>
                        <input
                          inputMode="numeric"
                          aria-label="Feet"
                          className="input text-lg font-semibold tabular-nums"
                          value={profileDraft.heightFt}
                          onChange={(e) =>
                            setProfileDraft({
                              ...profileDraft,
                              heightFt:
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <label className="label">Inches</label>
                        <input
                          inputMode="numeric"
                          aria-label="Inches"
                          className="input text-lg font-semibold tabular-nums"
                          value={profileDraft.heightIn}
                          onChange={(e) =>
                            setProfileDraft({
                              ...profileDraft,
                              heightIn:
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label">Weight (lb)</label>
                      <DecimalInput
                        ariaLabel="Weight pounds"
                        className="input text-lg font-semibold tabular-nums"
                        value={profileDraft.weightLb}
                        onValueChange={(n) =>
                          setProfileDraft({ ...profileDraft, weightLb: n })
                        }
                        onClear={() =>
                          setProfileDraft({ ...profileDraft, weightLb: "" })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Activity</label>
                      <div className="space-y-1">
                        {(Object.keys(ACTIVITY_FACTORS) as ActivityLevel[]).map(
                          (k) => {
                            const active = profileDraft.activity === k;
                            return (
                              <button
                                key={k}
                                onClick={() =>
                                  setProfileDraft({ ...profileDraft, activity: k })
                                }
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
                                  active
                                    ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                                    : "text-fg-2"
                                }`}
                              >
                                {ACTIVITY_LABELS[k]}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-fg-3">
                      Editing here does not retroactively update calorie targets.
                      To recompute targets, use the Weekly review.
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary flex-1"
                        onClick={() => {
                          setEditingProfile(false);
                          setProfileDraft(null);
                        }}
                        disabled={savingProfile}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-primary flex-1"
                        aria-label="Save profile"
                        onClick={commitProfile}
                        disabled={savingProfile}
                      >
                        {savingProfile ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </>
          )}

          {profile && targets && (
            <div className="card mb-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <TargetIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">Goal & macros</h2>
                  <p className="truncate text-xs text-fg-3 tabular-nums">
                    {GOAL_LABELS[profile.goal]} · {targets.proteinPerLb.toFixed(2)}P ·{" "}
                    {targets.fatPerLb.toFixed(2)}F /lb
                  </p>
                </div>
                {!editingGoal && (
                  <button
                    aria-label="Edit goal"
                    className="rounded-full bg-surface-3 px-3 py-1.5 text-xs font-semibold text-fg-2 active:bg-hairline"
                    onClick={startEditGoal}
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingGoal && goalDraft && (
                <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                  <div>
                    <label className="label">Goal</label>
                    <div className="space-y-1">
                      {(["cut", "maintain", "bulk"] as Goal[]).map((g) => {
                        const active = goalDraft.goal === g;
                        return (
                          <button
                            key={g}
                            onClick={() => setGoalDraft({ ...goalDraft, goal: g })}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${
                              active
                                ? "bg-brand-50 font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                                : "text-fg-2"
                            }`}
                          >
                            {GOAL_LABELS[g]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="label">Protein g/lb</label>
                      <DecimalInput
                        ariaLabel="Protein per lb"
                        className="input text-lg font-semibold tabular-nums"
                        value={goalDraft.proteinPerLb}
                        onValueChange={(n) =>
                          setGoalDraft({ ...goalDraft, proteinPerLb: n })
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <label className="label">Fat g/lb</label>
                      <DecimalInput
                        ariaLabel="Fat per lb"
                        className="input text-lg font-semibold tabular-nums"
                        value={goalDraft.fatPerLb}
                        onValueChange={(n) =>
                          setGoalDraft({ ...goalDraft, fatPerLb: n })
                        }
                      />
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setGoalDraft({
                        ...goalDraft,
                        proteinPerLb: DEFAULT_PROTEIN_PER_LB,
                        fatPerLb: DEFAULT_FAT_PER_LB,
                      })
                    }
                    className="text-xs font-medium text-brand-600 dark:text-brand-400"
                  >
                    Reset macros to defaults
                  </button>
                  <p className="text-xs text-fg-3">
                    Changing these creates a new targets entry effective today. Changing
                    your goal also resets the rate-tracking baseline.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="btn-secondary flex-1"
                      onClick={() => {
                        setEditingGoal(false);
                        setGoalDraft(null);
                      }}
                      disabled={savingGoal}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary flex-1"
                      aria-label="Save goal"
                      onClick={commitGoal}
                      disabled={savingGoal}
                    >
                      {savingGoal ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {profile && (
            <div className="card mb-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <Dumbbell className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <h2 className="font-semibold">Boost post-workout carbs</h2>
                  <p className="text-xs text-fg-3">
                    Shifts more carbs into the first meal after your workout.
                  </p>
                </div>
                <Toggle
                  label="Boost post-workout carbs"
                  checked={profile.enablePostWorkoutCarbBias !== false}
                  onChange={onToggleCarbBias}
                />
              </div>
            </div>
          )}

          <div className="card mb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <Bell className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h2 className="font-semibold">Reminders</h2>
                <p className="text-xs text-fg-3">
                  {!supported
                    ? "Not supported in this browser"
                    : granted
                    ? prefs.enabled
                      ? "Active"
                      : "Permission granted"
                    : perm === "denied"
                    ? "Blocked in OS settings"
                    : "Tap to request permission"}
                </p>
              </div>
              <Toggle
                label="Enable reminders"
                checked={!!prefs.enabled}
                onChange={onToggleEnable}
                disabled={saving || !supported}
              />
            </div>
            {isIOSLike && !!prefs.enabled && (
              <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                This device doesn't support scheduled notifications. Reminders only fire while the app is open. For reliable alerts, install the PWA to your Home Screen and keep it open near your meal times.
              </p>
            )}
          </div>

          <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Meals
          </h3>
          <div className={`card !p-0 mb-3 overflow-hidden ${!prefs.enabled ? "opacity-50" : ""}`}>
            <label className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">Remind me</span>
              <select
                className="rounded-lg bg-surface-3 px-2 py-1.5 text-sm font-medium text-fg-1 outline-none"
                value={prefs.mealLeadMin}
                disabled={!prefs.enabled || saving}
                onChange={(e) =>
                  save({ ...prefs, mealLeadMin: Number(e.target.value) })
                }
              >
                {LEAD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "At meal time" : `${m} min before`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Morning weigh-in
          </h3>
          <div className={`card !p-0 mb-3 overflow-hidden ${!prefs.enabled ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">Enabled</span>
              <Toggle
                label="Morning weigh-in"
                checked={!!prefs.weighInEnabled}
                disabled={!prefs.enabled || saving}
                onChange={(v) => save({ ...prefs, weighInEnabled: v ? 1 : 0 })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
              <span className="text-sm">Time</span>
              <input
                type="time"
                className="rounded-lg bg-surface-3 px-2 py-1.5 text-sm font-medium text-fg-1 outline-none"
                value={prefs.weighInTime}
                disabled={!prefs.enabled || !prefs.weighInEnabled || saving}
                onChange={(e) => save({ ...prefs, weighInTime: e.target.value })}
              />
            </div>
          </div>

          <h3 className="mx-2 mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-fg-3">
            Weekly review (Friday)
          </h3>
          <div className={`card !p-0 mb-3 overflow-hidden ${!prefs.enabled ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm">Enabled</span>
              <Toggle
                label="Weekly review"
                checked={!!prefs.reviewEnabled}
                disabled={!prefs.enabled || saving}
                onChange={(v) => save({ ...prefs, reviewEnabled: v ? 1 : 0 })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
              <span className="text-sm">Time</span>
              <input
                type="time"
                className="rounded-lg bg-surface-3 px-2 py-1.5 text-sm font-medium text-fg-1 outline-none"
                value={prefs.reviewTime}
                disabled={!prefs.enabled || !prefs.reviewEnabled || saving}
                onChange={(e) => save({ ...prefs, reviewTime: e.target.value })}
              />
            </div>
          </div>

          {granted && (
            <button
              className="btn-secondary mt-4 w-full"
              onClick={onTest}
              disabled={saving}
            >
              Send test notification
            </button>
          )}

          {status && (
            <p className="mt-4 rounded-xl bg-surface-3 p-3 text-sm text-fg-2">
              {status}
            </p>
          )}

          <BackupSection />

        </div>
      </main>
      <TabBar />

    </>
  );
}
