"use client";

import { useEffect, useState } from "react";
import { FoodEditorSheet } from "@/components/FoodEditorSheet";
import { BookOpen, ChevronRight, Plus } from "@/components/ui/Icon";
import { listFoods } from "@/lib/db/repos";
import type { Food } from "@/lib/db/schema";

export function MyFoodsSection() {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Food | null>(null);

  async function reload() {
    const all = await listFoods();
    setFoods(all.filter((f) => !f.builtin).sort((a, b) => a.name.localeCompare(b.name)));
  }

  useEffect(() => {
    void reload();
  }, []);

  function openEditor(food: Food | null) {
    setEditing(food);
    setOpen(true);
  }

  async function onDone() {
    await reload();
    setOpen(false);
  }

  return (
    <>
      <div className="card mb-3 mt-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold">My foods</h2>
            <p className="text-xs text-fg-3">
              {foods === null
                ? " "
                : foods.length === 0
                ? "No custom foods yet"
                : `${foods.length} custom food${foods.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
      </div>

      <div className="card !p-0 mb-3 overflow-hidden">
        {(foods ?? []).map((f) => (
          <button
            key={f.id}
            onClick={() => openEditor(f)}
            className="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left active:bg-surface-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{f.name}</div>
              <div className="truncate text-xs tabular-nums text-fg-3">
                {f.kcalPer100} kcal · {f.proteinPer100}P · {f.fatPer100}F · {f.carbPer100}C / 100{f.unit}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-fg-3" />
          </button>
        ))}
        <button
          onClick={() => openEditor(null)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-600 active:bg-surface-3 dark:text-brand-300"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          Add custom food
        </button>
      </div>

      <FoodEditorSheet
        open={open}
        onClose={() => setOpen(false)}
        food={editing}
        onSaved={onDone}
        onArchived={onDone}
      />
    </>
  );
}
