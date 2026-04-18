"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { MacroRow } from "@/components/MacroBar";
import { GramsStepper } from "@/components/GramsStepper";
import { Sheet } from "@/components/ui/Sheet";
import { IconButton } from "@/components/ui/IconButton";
import { Lock, LockOpen, X, Plus, Sparkles, Star, Search, Trash2, Copy, Check } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
import {
  getCurrentTargets,
  getSchedule,
  listFoods,
  logMeal,
  listCombos,
  saveCombo,
  deleteCombo,
  toggleFavoriteFood,
  getFoodsByIds,
} from "@/lib/db/repos";
import type { Combo, Food, Targets } from "@/lib/db/schema";
import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";
import { postWorkoutMealIndex } from "@/lib/schedule/week";
import { solvePortions, macrosFor, type FoodMacros } from "@/lib/nutrition/solver";
import { parseYmd, todayStr } from "@/lib/date";
import { rankFoods } from "@/lib/ui/food-search";

type Selection = { food: Food; grams: number; locked: boolean };

function MealDetail() {
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get("d") ?? todayStr();
  const mealIndex = Number(params.get("i") ?? "0");

  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [target, setTarget] = useState<{ kcal: number; proteinG: number; fatG: number; carbG: number } | null>(null);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [showCombos, setShowCombos] = useState(false);
  const [showSaveCombo, setShowSaveCombo] = useState(false);
  const [comboName, setComboName] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [foods, cs] = await Promise.all([listFoods(), listCombos()]);
    setAllFoods(foods);
    setCombos(cs);
  }

  useEffect(() => {
    (async () => {
      const [t, sched, foods, cs] = await Promise.all([
        getCurrentTargets(),
        getSchedule(),
        listFoods(),
        listCombos(),
      ]);
      setAllFoods(foods);
      setCombos(cs);
      if (!t) return;

      const weekday = parseYmd(date).getDay();
      const day = sched[weekday] ?? sched[0];
      const pwIdx = postWorkoutMealIndex(day);
      const slots: MealSlot[] = day.mealTimes.map((time, i) => ({
        index: i,
        time,
        postWorkout: i === pwIdx,
      }));
      const dist = distributeMeals(
        { kcal: t.kcal, proteinG: t.proteinG, fatG: t.fatG, carbG: t.carbG },
        slots
      );
      if (dist[mealIndex]) setTarget(dist[mealIndex]);
    })();
  }, [date, mealIndex]);

  const filteredFoods = useMemo(() => {
    const q = search.trim();
    if (!q) return allFoods.slice(0, 60);
    return rankFoods(allFoods, q);
  }, [allFoods, search]);

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.food.id)),
    [selected]
  );

  const togglePickFood = useCallback((food: Food) => {
    setSelected((prev) => {
      const exists = prev.some((s) => s.food.id === food.id);
      if (exists) return prev.filter((s) => s.food.id !== food.id);
      return [...prev, { food, grams: 100, locked: false }];
    });
    haptic("light");
  }, []);

  const removeFood = useCallback((foodId: number) => {
    setSelected((prev) => prev.filter((s) => s.food.id !== foodId));
    haptic("light");
  }, []);

  const setGrams = useCallback((foodId: number, grams: number) => {
    setSelected((prev) =>
      prev.map((s) => (s.food.id === foodId ? { ...s, grams } : s))
    );
  }, []);

  const toggleLock = useCallback((foodId: number) => {
    setSelected((prev) =>
      prev.map((s) => (s.food.id === foodId ? { ...s, locked: !s.locked } : s))
    );
    haptic("light");
  }, []);

  async function toggleFav(foodId: number) {
    await toggleFavoriteFood(foodId);
    await reload();
  }

  function balance(sel: Selection[]): Selection[] {
    if (!target || sel.length === 0) return sel;
    const unlocked = sel.filter((s) => !s.locked);
    if (unlocked.length === 0) return sel;
    const foods: FoodMacros[] = sel.map((s) => ({
      proteinPer100: s.food.proteinPer100,
      fatPer100: s.food.fatPer100,
      carbPer100: s.food.carbPer100,
    }));
    const result = solvePortions(
      foods,
      { proteinG: target.proteinG, fatG: target.fatG, carbG: target.carbG },
      { locked: sel.map((s) => ({ grams: s.grams, locked: s.locked })) }
    );
    return sel.map((s, i) => ({ ...s, grams: result.grams[i] }));
  }

  function autoBalance() {
    setSelected((prev) => balance(prev));
    haptic("medium");
  }

  async function loadCombo(combo: Combo) {
    const ids = combo.items.map((it) => it.foodId);
    const foods = await getFoodsByIds(ids);
    const sel: Selection[] = combo.items
      .map((it) => {
        const f = foods.find((x) => x.id === it.foodId);
        if (!f) return null;
        return { food: f, grams: it.grams, locked: it.locked === 1 };
      })
      .filter((s): s is Selection => s !== null);
    setSelected(balance(sel));
    setShowCombos(false);
    haptic("light");
  }

  async function handleSaveCombo() {
    if (!comboName.trim() || selected.length === 0) return;
    await saveCombo(
      comboName.trim(),
      selected.map((s) => ({
        foodId: s.food.id!,
        grams: s.grams,
        locked: s.locked ? 1 : 0,
      }))
    );
    setComboName("");
    setShowSaveCombo(false);
    haptic("success");
    await reload();
  }

  async function handleDeleteCombo(id: number) {
    await deleteCombo(id);
    await reload();
  }

  const actual = useMemo(() => {
    if (selected.length === 0) return { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
    return macrosFor(
      selected.map((s) => ({
        proteinPer100: s.food.proteinPer100,
        fatPer100: s.food.fatPer100,
        carbPer100: s.food.carbPer100,
      })),
      selected.map((s) => s.grams)
    );
  }, [selected]);

  async function handleLog() {
    if (selected.length === 0) return;
    setSaving(true);
    const items = selected.map((s) => ({
      foodId: s.food.id!,
      grams: s.grams,
    }));
    await logMeal({
      date,
      index: mealIndex,
      items,
      kcal: actual.kcal,
      proteinG: actual.proteinG,
      fatG: actual.fatG,
      carbG: actual.carbG,
    });
    haptic("success");
    router.push(date === todayStr() ? "/today" : `/today?d=${date}`);
  }

  if (!target) {
    return (
      <main className="flex-1 overflow-y-auto">
        <Header title="Meal" back="/today" />
        <p className="mt-12 text-center text-fg-3">Loading…</p>
      </main>
    );
  }

  return (
    <>
      <main className="relative flex-1 overflow-y-auto">
        <Header title={`Meal ${mealIndex + 1}`} back="/today" />

        <div className="px-4 pb-40 pt-2">
          <div className="card mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">Target</h3>
            <MacroRow target={target} current={actual} />
          </div>

          {selected.length > 0 && (
            <div className="card mb-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Foods</h3>
                <div className="flex items-center gap-1">
                  <button
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 active:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300"
                    onClick={autoBalance}
                  >
                    <Sparkles className="h-4 w-4" /> Balance
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-fg-2 active:bg-surface-3"
                    onClick={() => setShowSaveCombo(true)}
                  >
                    <Copy className="h-4 w-4" /> Save
                  </button>
                </div>
              </div>
              {selected.map((s) => (
                <div key={s.food.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{s.food.name}</div>
                      <div className="truncate text-xs tabular-nums text-fg-3">
                        {s.food.kcalPer100} kcal / 100{s.food.unit}
                      </div>
                    </div>
                    <IconButton
                      label="Remove"
                      tone="neutral"
                      variant="ghost"
                      onClick={() => removeFood(s.food.id!)}
                    >
                      <X className="h-[18px] w-[18px]" />
                    </IconButton>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <GramsStepper
                        value={s.grams}
                        onChange={(v) => setGrams(s.food.id!, v)}
                        unit={s.food.unit}
                      />
                    </div>
                    <button
                      aria-pressed={s.locked}
                      onClick={() => toggleLock(s.food.id!)}
                      title={
                        s.locked
                          ? "Locked — auto-balance will not change"
                          : "Tap to lock portion"
                      }
                      className={`inline-flex h-11 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors ${
                        s.locked
                          ? "bg-amber-100 text-amber-700 active:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
                          : "text-fg-3 active:bg-surface-3"
                      }`}
                    >
                      {s.locked ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <LockOpen className="h-4 w-4" />
                      )}
                      {s.locked ? "Locked" : "Lock"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selected.length === 0 && (
            <div className="card mb-4 text-center text-sm text-fg-3">
              Add a food or load a combo to start building this meal.
            </div>
          )}
        </div>
      </main>

      <div
        className="border-t border-hairline bg-surface-2/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2">
          <button
            className="btn-secondary flex flex-1 items-center justify-center gap-1 text-sm"
            onClick={() => setShowPicker(true)}
          >
            <Plus className="h-4 w-4" /> Add food
          </button>
          {combos.length > 0 && (
            <button
              className="btn-secondary flex flex-1 items-center justify-center gap-1 text-sm"
              onClick={() => setShowCombos(true)}
            >
              <Copy className="h-4 w-4" /> Load combo
            </button>
          )}
        </div>
        {selected.length > 0 && (
          <button
            className="btn-primary mt-2 w-full"
            disabled={saving}
            onClick={handleLog}
          >
            {saving ? "Saving…" : "Log meal"}
          </button>
        )}
      </div>

      <Sheet
        open={showPicker}
        onClose={() => {
          setShowPicker(false);
          setSearch("");
        }}
        title="Add food"
        detent="large"
        footer={
          <button
            className="btn-primary w-full"
            onClick={() => {
              setShowPicker(false);
              setSearch("");
            }}
          >
            Done{selected.length > 0 ? ` · ${selected.length} selected` : ""}
          </button>
        }
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus
            className="input pl-9 pr-11"
            placeholder="Search foods…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-fg-3 active:bg-surface-3"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="space-y-1">
          {filteredFoods.map((f) => {
            const picked = selectedIds.has(f.id!);
            return (
              <div
                key={f.id}
                className="flex items-center gap-1 rounded-xl active:bg-surface-3"
              >
                <IconButton
                  label={f.favorite ? "Unfavorite" : "Favorite"}
                  tone={f.favorite ? "warning" : "neutral"}
                  variant="ghost"
                  onClick={() => toggleFav(f.id!)}
                >
                  <Star
                    className="h-[18px] w-[18px]"
                    fill={f.favorite ? "currentColor" : "none"}
                  />
                </IconButton>
                <button
                  className="min-w-0 flex-1 py-2 text-left"
                  onClick={() => togglePickFood(f)}
                  aria-pressed={picked}
                >
                  <div className="truncate text-sm font-semibold">{f.name}</div>
                  <div className="truncate text-xs tabular-nums text-fg-3">
                    {f.kcalPer100} kcal · {f.proteinPer100}P · {f.fatPer100}F ·{" "}
                    {f.carbPer100}C / 100{f.unit}
                  </div>
                </button>
                <span
                  className={`mr-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                    picked
                      ? "bg-brand-500 text-white"
                      : "border border-hairline text-fg-3"
                  }`}
                  aria-hidden
                >
                  {picked ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </span>
              </div>
            );
          })}
          {filteredFoods.length === 0 && (
            <p className="py-8 text-center text-sm text-fg-3">No foods found</p>
          )}
        </div>
      </Sheet>

      <Sheet
        open={showCombos}
        onClose={() => setShowCombos(false)}
        title="Combos"
        detent="large"
      >
        <div className="space-y-1">
          {combos.map((c) => (
            <div key={c.id} className="flex items-center gap-1">
              <button
                className="min-w-0 flex-1 rounded-xl py-3 text-left active:bg-surface-3"
                onClick={() => loadCombo(c)}
              >
                <div className="truncate text-sm font-semibold">{c.name}</div>
                <div className="text-xs text-fg-3">
                  {c.items.length} food{c.items.length !== 1 ? "s" : ""}
                </div>
              </button>
              <IconButton
                label="Delete combo"
                tone="danger"
                variant="ghost"
                onClick={() => handleDeleteCombo(c.id!)}
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </IconButton>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={showSaveCombo}
        onClose={() => {
          setShowSaveCombo(false);
          setComboName("");
        }}
        title="Save as combo"
        detent="medium"
        footer={
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => {
                setShowSaveCombo(false);
                setComboName("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
              disabled={!comboName.trim()}
              onClick={handleSaveCombo}
            >
              Save
            </button>
          </div>
        }
      >
        <input
          autoFocus
          className="input"
          placeholder="Combo name (e.g. 'Chicken & Rice')"
          value={comboName}
          onChange={(e) => setComboName(e.target.value)}
        />
        <p className="mt-2 text-xs text-fg-3">
          Saves the current foods and grams. Locked status is preserved.
        </p>
      </Sheet>
    </>
  );
}

export default function MealPage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 overflow-y-auto">
          <Header title="Meal" back="/today" />
        </main>
      }
    >
      <MealDetail />
    </Suspense>
  );
}
