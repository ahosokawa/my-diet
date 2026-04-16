"use client";

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { MacroRow } from "@/components/MacroBar";
import { GramsStepper } from "@/components/GramsStepper";
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
  todayStr,
} from "@/lib/db/repos";
import type { Combo, Food, Targets } from "@/lib/db/schema";
import { distributeMeals, type MealSlot } from "@/lib/nutrition/distribute";
import { postWorkoutMealIndex } from "@/lib/schedule/week";
import { solvePortions, macrosFor, type FoodMacros } from "@/lib/nutrition/solver";

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

      const weekday = new Date(date + "T12:00:00").getDay();
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
    const q = search.toLowerCase();
    const base = q ? allFoods.filter((f) => f.name.toLowerCase().includes(q)) : allFoods;
    return base.slice(0, 40);
  }, [allFoods, search]);

  const addFood = useCallback(
    (food: Food) => {
      if (selected.some((s) => s.food.id === food.id)) return;
      setSelected((prev) => [...prev, { food, grams: 100, locked: false }]);
      setShowPicker(false);
      setSearch("");
    },
    [selected]
  );

  const removeFood = useCallback((foodId: number) => {
    setSelected((prev) => prev.filter((s) => s.food.id !== foodId));
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
    router.push(date === todayStr() ? "/today" : `/today?d=${date}`);
  }

  if (!target) {
    return (
      <main className="p-4">
        <Header title="Meal" back="/today" />
        <p className="mt-12 text-center text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh p-4">
      <Header title={`Meal ${mealIndex + 1}`} back="/today" />

      <div className="card mb-4">
        <h3 className="mb-2 text-sm font-medium text-neutral-500">Target</h3>
        <MacroRow target={target} current={actual} />
      </div>

      {selected.length > 0 && (
        <div className="card mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Foods</h3>
            <div className="flex gap-3">
              <button
                className="text-sm font-medium text-brand-600"
                onClick={() => setShowSaveCombo(true)}
              >
                Save combo
              </button>
              <button
                className="text-sm font-medium text-brand-600"
                onClick={autoBalance}
              >
                Auto-balance
              </button>
            </div>
          </div>
          {selected.map((s) => (
            <div key={s.food.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  aria-label={s.locked ? "Unlock" : "Lock"}
                  onClick={() => toggleLock(s.food.id!)}
                  className={`flex h-8 w-8 items-center justify-center rounded-md ${
                    s.locked
                      ? "bg-amber-100 text-amber-700"
                      : "bg-neutral-100 text-neutral-400"
                  }`}
                  title={s.locked ? "Locked — auto-balance will not change" : "Unlocked"}
                >
                  {s.locked ? "🔒" : "🔓"}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.food.name}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {s.food.kcalPer100} kcal · {s.food.proteinPer100}P ·{" "}
                    {s.food.fatPer100}F · {s.food.carbPer100}C
                  </div>
                </div>
                <button
                  aria-label="Remove"
                  className="flex h-8 w-8 items-center justify-center text-neutral-400 active:text-neutral-600"
                  onClick={() => removeFood(s.food.id!)}
                >
                  ✕
                </button>
              </div>
              <div className="pl-10">
                <GramsStepper
                  value={s.grams}
                  onChange={(v) => setGrams(s.food.id!, v)}
                  unit={s.food.unit}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {showSaveCombo && (
        <div className="card mb-4">
          <h3 className="mb-2 font-semibold">Save as combo</h3>
          <input
            autoFocus
            className="input mb-3"
            placeholder="Combo name (e.g. 'Chicken & Rice')"
            value={comboName}
            onChange={(e) => setComboName(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1 text-sm"
              onClick={() => { setShowSaveCombo(false); setComboName(""); }}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1 text-sm"
              disabled={!comboName.trim()}
              onClick={handleSaveCombo}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {!showPicker && !showCombos && !showSaveCombo && (
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setShowPicker(true)}>
            + Add food
          </button>
          {combos.length > 0 && (
            <button className="btn-secondary flex-1" onClick={() => setShowCombos(true)}>
              Load combo
            </button>
          )}
        </div>
      )}

      {showCombos && (
        <div className="card mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Combos</h3>
            <button
              className="text-sm text-neutral-500"
              onClick={() => setShowCombos(false)}
            >
              Cancel
            </button>
          </div>
          <div className="space-y-1">
            {combos.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-neutral-50">
                <button
                  className="flex-1 text-left"
                  onClick={() => loadCombo(c)}
                >
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-neutral-500">
                    {c.items.length} food{c.items.length !== 1 ? "s" : ""}
                  </div>
                </button>
                <button
                  className="text-xs text-red-500"
                  onClick={() => handleDeleteCombo(c.id!)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPicker && (
        <div className="card mt-3">
          <input
            autoFocus
            className="input mb-3"
            placeholder="Search foods…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {filteredFoods.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded-lg p-2 hover:bg-neutral-50"
              >
                <button
                  className="p-1 text-base leading-none"
                  aria-label={f.favorite ? "Unfavorite" : "Favorite"}
                  onClick={() => toggleFav(f.id!)}
                >
                  <span className={f.favorite ? "text-amber-400" : "text-neutral-300"}>
                    ★
                  </span>
                </button>
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => addFood(f)}
                >
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {f.kcalPer100} kcal · {f.proteinPer100}P · {f.fatPer100}F ·{" "}
                    {f.carbPer100}C / 100{f.unit}
                  </div>
                </button>
              </div>
            ))}
            {filteredFoods.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral-500">
                No foods found
              </p>
            )}
          </div>
          <button
            className="mt-2 w-full text-center text-sm text-neutral-500"
            onClick={() => {
              setShowPicker(false);
              setSearch("");
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {selected.length > 0 && !showSaveCombo && (
        <button
          className="btn-primary mt-4 w-full"
          disabled={saving}
          onClick={handleLog}
        >
          {saving ? "Saving…" : "Log meal"}
        </button>
      )}
    </main>
  );
}

export default function MealPage() {
  return (
    <Suspense fallback={<main className="p-4"><Header title="Meal" back="/today" /></main>}>
      <MealDetail />
    </Suspense>
  );
}
