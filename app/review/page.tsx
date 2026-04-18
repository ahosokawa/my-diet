"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { Sheet } from "@/components/ui/Sheet";
import { TrendingDown, TrendingUp, Minus } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
import {
  getCurrentTargets,
  getProfile,
  listWeights,
  saveTargets,
} from "@/lib/db/repos";
import type { Targets, WeightEntry } from "@/lib/db/schema";
import { computeReview, type ReviewSuggestion } from "@/lib/review/engine";
import { KCAL } from "@/lib/nutrition/macros";
import { parseYmd, shiftDate, todayStr } from "@/lib/date";

function nextMonday(fromStr: string): string {
  const dow = parseYmd(fromStr).getDay();
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
  const scrollRef = useRef<HTMLElement>(null);
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
    haptic("success");
    setSaving(false);
    router.push("/today");
  }

  if (!loaded) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-4">
          <Header title="Weekly check-in" />
          <p className="mt-12 text-center text-fg-3">Loading…</p>
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
          <p className="mt-12 text-center text-fg-3">Finish onboarding first.</p>
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
            <h2 className="mb-2 font-semibold">
              Come back in {daysUntilEligible} day{daysUntilEligible !== 1 ? "s" : ""}
            </h2>
            <p className="text-sm text-fg-2">
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
            <p className="text-sm text-fg-2">
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

  const verdictMeta = {
    maintain: {
      label: "Hold steady",
      Icon: Minus,
      tint: "bg-surface-3 text-fg-1",
      iconTint: "bg-surface-2 text-fg-2",
    },
    decrease: {
      label: "Cut a bit",
      Icon: TrendingDown,
      tint: "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100",
      iconTint: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    },
    increase: {
      label: "Bump it up",
      Icon: TrendingUp,
      tint: "bg-brand-50 text-brand-900 dark:bg-brand-900/30 dark:text-brand-100",
      iconTint: "bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300",
    },
  }[suggestion.verdict];

  const VerdictIcon = verdictMeta.Icon;
  const deltaPctDisplay = (suggestion.deltaPct * 100).toFixed(2);

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <Header title="Weekly check-in" scrollRef={scrollRef} />

        <div className="px-4 pb-4">
          <div className={`card mb-4 ${verdictMeta.tint}`}>
            <div className="flex items-start gap-3">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${verdictMeta.iconTint}`}
              >
                <VerdictIcon className="h-6 w-6" strokeWidth={2.5} />
              </span>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-70">
                  Suggestion
                </div>
                <h2 className="text-2xl font-bold">{verdictMeta.label}</h2>
                <p className="mt-1 text-sm opacity-90">
                  {suggestion.verdict === "maintain"
                    ? "Weight is stable. Keep current targets."
                    : suggestion.verdict === "decrease"
                    ? `Trending up. Drop ${Math.abs(suggestion.kcalDelta)} kcal (mostly carbs).`
                    : `Trending down. Add ${suggestion.kcalDelta} kcal (mostly carbs).`}
                </p>
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <h2 className="mb-3 font-semibold">Weight trend</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-fg-3">This week avg</div>
                <div className="text-lg font-semibold tabular-nums">
                  {suggestion.avgWeight}{" "}
                  <span className="text-xs font-normal text-fg-3">lbs</span>
                </div>
                <div className="text-xs text-fg-3">
                  {current.length} day{current.length !== 1 ? "s" : ""} logged
                </div>
              </div>
              <div>
                <div className="text-fg-3">Previous week</div>
                <div className="text-lg font-semibold tabular-nums">
                  {suggestion.prevAvgWeight}{" "}
                  <span className="text-xs font-normal text-fg-3">lbs</span>
                </div>
                <div className="text-xs text-fg-3">
                  {previous.length} day{previous.length !== 1 ? "s" : ""} logged
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm text-fg-2">
              Change:{" "}
              <span className="font-semibold tabular-nums">
                {deltaPctDisplay}%
              </span>
            </div>
          </div>

          <div className="card mb-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-3">
              Targets starting {effectiveDate}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mb-1 text-xs uppercase text-fg-3">Current</div>
                <div className="font-semibold tabular-nums">{targets.kcal} kcal</div>
                <div className="text-xs text-fg-3 tabular-nums">
                  {targets.proteinG}P · {targets.fatG}F · {targets.carbG}C
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs uppercase text-fg-3">Proposed</div>
                <div className="font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                  {suggestion.newTargets.kcal} kcal
                </div>
                <div className="text-xs text-fg-3 tabular-nums">
                  {suggestion.newTargets.proteinG}P · {suggestion.newTargets.fatG}F ·{" "}
                  {suggestion.newTargets.carbG}C
                </div>
              </div>
            </div>
          </div>

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
        </div>
      </main>
      <TabBar />

      <Sheet
        open={showOverride}
        onClose={() => {
          setShowOverride(false);
          setOverrideKcal("");
        }}
        title="Custom calorie target"
        detent="medium"
        footer={
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                setShowOverride(false);
                setOverrideKcal("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
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
        }
      >
        <p className="mb-3 text-sm text-fg-2">
          Protein and fat stay pinned at {targets.proteinG}P / {targets.fatG}F.
          Carbs adjust to match kcal.
        </p>
        <input
          autoFocus
          inputMode="numeric"
          className="input text-2xl font-semibold tabular-nums"
          placeholder={String(targets.kcal)}
          value={overrideKcal}
          onChange={(e) =>
            setOverrideKcal(
              e.target.value === ""
                ? ""
                : Number(e.target.value.replace(/[^0-9]/g, ""))
            )
          }
        />
        {typeof overrideKcal === "number" && overrideKcal > 0 && (
          <div className="mt-3 rounded-xl bg-surface-3 p-3 text-sm text-fg-2 tabular-nums">
            Preview: <span className="font-semibold text-fg-1">{overrideKcal}</span> kcal ·{" "}
            {targetsFromKcal(targets, overrideKcal).proteinG}P ·{" "}
            {targetsFromKcal(targets, overrideKcal).fatG}F ·{" "}
            {targetsFromKcal(targets, overrideKcal).carbG}C
          </div>
        )}
      </Sheet>
    </>
  );
}
