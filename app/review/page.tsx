"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import {
  getCurrentTargets,
  getProfile,
  listWeights,
  saveTargets,
  todayStr,
} from "@/lib/db/repos";
import type { Targets, WeightEntry } from "@/lib/db/schema";
import { computeReview, type ReviewSuggestion } from "@/lib/review/engine";
import { KCAL } from "@/lib/nutrition/macros";

function parseDate(s: string): Date {
  return new Date(s + "T12:00:00");
}

function shiftDate(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextMonday(fromStr: string): string {
  const d = parseDate(fromStr);
  const dow = d.getDay(); // 0 Sun – 6 Sat
  const add = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  return shiftDate(fromStr, add);
}

function splitWeights(
  entries: WeightEntry[],
  today: string
): { current: number[]; previous: number[] } {
  const byDate = new Map(entries.map((e) => [e.date, e.lbs]));
  const current: number[] = [];
  const previous: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDate(today, -i);
    const lbs = byDate.get(d);
    if (lbs !== undefined) current.push(lbs);
  }
  for (let i = 7; i < 14; i++) {
    const d = shiftDate(today, -i);
    const lbs = byDate.get(d);
    if (lbs !== undefined) previous.push(lbs);
  }
  return { current, previous };
}

function targetsFromKcal(
  current: Targets,
  newKcal: number
): { kcal: number; proteinG: number; fatG: number; carbG: number } {
  const remaining = newKcal - current.proteinG * KCAL.protein - current.fatG * KCAL.fat;
  const carbG = Math.max(0, Math.round(remaining / KCAL.carb));
  return {
    kcal: Math.round(newKcal),
    proteinG: current.proteinG,
    fatG: current.fatG,
    carbG,
  };
}

export default function ReviewPage() {
  const router = useRouter();
  const [targets, setTargets] = useState<Targets | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [daysUntilEligible, setDaysUntilEligible] = useState(0);
  const [overrideKcal, setOverrideKcal] = useState<number | "">("");
  const [showOverride, setShowOverride] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, w, p] = await Promise.all([
        getCurrentTargets(),
        listWeights(30),
        getProfile(),
      ]);
      if (t) setTargets(t);
      setWeights(w);
      if (p) {
        const daysSince = (Date.now() - p.createdAt) / (24 * 60 * 60 * 1000);
        setDaysUntilEligible(Math.max(0, Math.ceil(7 - daysSince)));
      }
      setLoaded(true);
    })();
  }, []);

  const today = todayStr();
  const effectiveDate = useMemo(() => nextMonday(today), [today]);

  const { current, previous } = useMemo(
    () => splitWeights(weights, today),
    [weights, today]
  );

  const suggestion: ReviewSuggestion | null = useMemo(() => {
    if (!targets || current.length === 0 || previous.length === 0) return null;
    return computeReview({
      currentWeek: current,
      previousWeek: previous,
      currentTargets: {
        kcal: targets.kcal,
        proteinG: targets.proteinG,
        fatG: targets.fatG,
        carbG: targets.carbG,
      },
    });
  }, [targets, current, previous]);

  async function apply(kcal: number, source: Targets["source"]) {
    if (!targets) return;
    setSaving(true);
    const t = targetsFromKcal(targets, kcal);
    await saveTargets({
      dateEffective: effectiveDate,
      kcal: t.kcal,
      proteinG: t.proteinG,
      fatG: t.fatG,
      carbG: t.carbG,
      source,
    });
    setSaving(false);
    router.push("/today");
  }

  if (!loaded) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Weekly check-in" />
          <p className="mt-12 text-center text-neutral-500">Loading…</p>
        </main>
        <TabBar />
      </>
    );
  }

  if (!targets) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Weekly check-in" />
          <p className="mt-12 text-center text-neutral-500">
            Finish onboarding first.
          </p>
        </main>
        <TabBar />
      </>
    );
  }

  if (daysUntilEligible > 0) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Weekly check-in" />
          <div className="card mt-4">
            <h2 className="mb-2 font-semibold">Come back in {daysUntilEligible} day{daysUntilEligible !== 1 ? "s" : ""}</h2>
            <p className="text-sm text-neutral-600">
              Check-ins start after your first full week. Keep logging daily
              weights and we'll have something to compare.
            </p>
          </div>
        </main>
        <TabBar />
      </>
    );
  }

  if (!suggestion) {
    const needed = current.length === 0 ? "this week" : "the prior week";
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Weekly check-in" />
          <div className="card mt-4">
            <h2 className="mb-2 font-semibold">Not enough data yet</h2>
            <p className="text-sm text-neutral-600">
              Log at least one weight in {needed} to see a suggestion. Keep a
              daily weigh-in going and we'll have something to compare next
              Friday.
            </p>
          </div>
        </main>
        <TabBar />
      </>
    );
  }

  const verdictLabel = {
    maintain: "Hold steady",
    decrease: "Cut a bit",
    increase: "Bump it up",
  }[suggestion.verdict];

  const verdictColor = {
    maintain: "text-neutral-700 bg-neutral-100",
    decrease: "text-amber-700 bg-amber-50",
    increase: "text-brand-700 bg-brand-50",
  }[suggestion.verdict];

  const deltaPctDisplay = (suggestion.deltaPct * 100).toFixed(2);

  return (
    <>
      <main className="flex-1 overflow-y-auto p-4">
        <Header title="Weekly check-in" />

      <div className="card mb-4">
        <h2 className="mb-3 font-semibold">Weight trend</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-neutral-500">This week avg</div>
            <div className="text-lg font-semibold">
              {suggestion.avgWeight} <span className="text-xs font-normal text-neutral-500">lbs</span>
            </div>
            <div className="text-xs text-neutral-400">
              {current.length} day{current.length !== 1 ? "s" : ""} logged
            </div>
          </div>
          <div>
            <div className="text-neutral-500">Previous week</div>
            <div className="text-lg font-semibold">
              {suggestion.prevAvgWeight} <span className="text-xs font-normal text-neutral-500">lbs</span>
            </div>
            <div className="text-xs text-neutral-400">
              {previous.length} day{previous.length !== 1 ? "s" : ""} logged
            </div>
          </div>
        </div>
        <div className="mt-3 text-sm text-neutral-600">
          Change: <span className="font-medium">{deltaPctDisplay}%</span>
        </div>
      </div>

      <div className={`card mb-4 ${verdictColor}`}>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide opacity-70">
          Suggestion
        </div>
        <h2 className="text-xl font-semibold">{verdictLabel}</h2>
        <p className="mt-1 text-sm">
          {suggestion.verdict === "maintain"
            ? "Weight is stable. Keep current targets."
            : suggestion.verdict === "decrease"
            ? `Trending up. Drop ${Math.abs(suggestion.kcalDelta)} kcal (mostly carbs).`
            : `Trending down. Add ${suggestion.kcalDelta} kcal (mostly carbs).`}
        </p>
      </div>

      <div className="card mb-4">
        <h3 className="mb-3 text-sm font-medium text-neutral-500">
          Targets starting {effectiveDate}
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="mb-1 text-xs uppercase text-neutral-400">Current</div>
            <div className="font-semibold">{targets.kcal} kcal</div>
            <div className="text-xs text-neutral-500">
              {targets.proteinG}P · {targets.fatG}F · {targets.carbG}C
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs uppercase text-neutral-400">Proposed</div>
            <div className="font-semibold text-brand-700">
              {suggestion.newTargets.kcal} kcal
            </div>
            <div className="text-xs text-neutral-500">
              {suggestion.newTargets.proteinG}P · {suggestion.newTargets.fatG}F ·{" "}
              {suggestion.newTargets.carbG}C
            </div>
          </div>
        </div>
      </div>

      {showOverride && (
        <div className="card mb-4">
          <h3 className="mb-2 font-semibold">Custom calorie target</h3>
          <p className="mb-3 text-xs text-neutral-500">
            Protein and fat stay pinned at {targets.proteinG}P / {targets.fatG}F.
            Carbs adjust to match kcal.
          </p>
          <input
            inputMode="numeric"
            className="input mb-3"
            placeholder={String(targets.kcal)}
            value={overrideKcal}
            onChange={(e) =>
              setOverrideKcal(
                e.target.value === "" ? "" : Number(e.target.value.replace(/[^0-9]/g, ""))
              )
            }
          />
          {typeof overrideKcal === "number" && overrideKcal > 0 && (
            <div className="mb-3 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">
              Preview: {overrideKcal} kcal ·{" "}
              {targetsFromKcal(targets, overrideKcal).proteinG}P ·{" "}
              {targetsFromKcal(targets, overrideKcal).fatG}F ·{" "}
              {targetsFromKcal(targets, overrideKcal).carbG}C
            </div>
          )}
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1 text-sm"
              onClick={() => {
                setShowOverride(false);
                setOverrideKcal("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1 text-sm"
              disabled={
                saving ||
                typeof overrideKcal !== "number" ||
                overrideKcal <= 0
              }
              onClick={() =>
                typeof overrideKcal === "number" && apply(overrideKcal, "override")
              }
            >
              Save override
            </button>
          </div>
        </div>
      )}

      {!showOverride && (
        <div className="flex gap-2">
          <button
            className="btn-secondary flex-1"
            onClick={() => setShowOverride(true)}
          >
            Override
          </button>
          <button
            className="btn-primary flex-1"
            disabled={saving}
            onClick={() => apply(suggestion.newTargets.kcal, "auto")}
          >
            {saving
              ? "Saving…"
              : suggestion.verdict === "maintain"
              ? "Confirm"
              : "Apply"}
          </button>
        </div>
      )}

      </main>
      <TabBar />
    </>
  );
}
