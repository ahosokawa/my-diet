"use client";

import { useEffect, useState, useMemo } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import {
  listFoods,
  addCustomFood,
  deleteFood,
  seedFoodsIfEmpty,
  toggleFavoriteFood,
} from "@/lib/db/repos";
import type { Food } from "@/lib/db/schema";

type Draft = {
  name: string;
  kcalPer100: number | "";
  proteinPer100: number | "";
  fatPer100: number | "";
  carbPer100: number | "";
  unit: "g" | "ml";
  category: string;
};

const EMPTY: Draft = {
  name: "",
  kcalPer100: "",
  proteinPer100: "",
  fatPer100: "",
  carbPer100: "",
  unit: "g",
  category: "other",
};

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    await seedFoodsIfEmpty();
    setFoods(await listFoods());
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return foods;
    const q = search.toLowerCase();
    return foods.filter((f) => f.name.toLowerCase().includes(q));
  }, [foods, search]);

  async function handleAdd() {
    if (
      !draft.name ||
      draft.kcalPer100 === "" ||
      draft.proteinPer100 === "" ||
      draft.fatPer100 === "" ||
      draft.carbPer100 === ""
    )
      return;
    setSaving(true);
    await addCustomFood({
      name: draft.name,
      kcalPer100: Number(draft.kcalPer100),
      proteinPer100: Number(draft.proteinPer100),
      fatPer100: Number(draft.fatPer100),
      carbPer100: Number(draft.carbPer100),
      unit: draft.unit,
      category: draft.category,
    });
    setDraft(EMPTY);
    setShowForm(false);
    setSaving(false);
    await load();
  }

  async function handleDelete(id: number) {
    await deleteFood(id);
    await load();
  }

  return (
    <>
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 bg-neutral-50 px-4 pt-4">
          <Header title="Foods" />
          <input
            className="input mb-3"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn-secondary mb-3 w-full"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "+ Add custom food"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {showForm && (
            <div className="card mb-4 space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">kcal / 100</label>
              <input
                inputMode="decimal"
                className="input"
                value={draft.kcalPer100}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kcalPer100: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Protein / 100</label>
              <input
                inputMode="decimal"
                className="input"
                value={draft.proteinPer100}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    proteinPer100: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Fat / 100</label>
              <input
                inputMode="decimal"
                className="input"
                value={draft.fatPer100}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    fatPer100: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className="label">Carbs / 100</label>
              <input
                inputMode="decimal"
                className="input"
                value={draft.carbPer100}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    carbPer100: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div>
              <label className="label">Unit</label>
              <select
                className="input"
                value={draft.unit}
                onChange={(e) =>
                  setDraft({ ...draft, unit: e.target.value as "g" | "ml" })
                }
              >
                <option value="g">Grams (g)</option>
                <option value="ml">Milliliters (ml)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="label">Category</label>
              <input
                className="input"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </div>
          </div>
          <button
            className="btn-primary w-full"
            disabled={saving}
            onClick={handleAdd}
          >
            Save food
          </button>
        </div>
      )}

      <div className="space-y-1">
        {filtered.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 rounded-xl px-2 py-2 active:bg-neutral-50"
          >
            <button
              className="p-1 text-lg leading-none"
              aria-label={f.favorite ? "Unfavorite" : "Favorite"}
              onClick={async () => {
                await toggleFavoriteFood(f.id!);
                await load();
              }}
            >
              <span className={f.favorite ? "text-amber-400" : "text-neutral-300"}>
                ★
              </span>
            </button>
            <div className="flex-1">
              <div className="text-sm font-medium">{f.name}</div>
              <div className="text-xs text-neutral-500">
                {f.kcalPer100} kcal · {f.proteinPer100}P · {f.fatPer100}F ·{" "}
                {f.carbPer100}C / 100{f.unit}
              </div>
            </div>
            {!f.builtin && (
              <button
                className="text-xs text-red-500"
                onClick={() => handleDelete(f.id!)}
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">
            No foods match
          </p>
        )}
      </div>
        </div>
      </main>
      <TabBar />
    </>
  );
}
