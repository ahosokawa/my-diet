"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { motion, useMotionValue, animate, type PanInfo } from "framer-motion";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { Sheet } from "@/components/ui/Sheet";
import { IconButton } from "@/components/ui/IconButton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Star, Search, X, Plus, Trash2, BookOpen } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
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

function FoodRow({
  food,
  open,
  onOpen,
  onClose,
  onToggleFav,
  onDelete,
}: {
  food: Food;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggleFav: () => void;
  onDelete: () => void;
}) {
  const x = useMotionValue(0);
  const swipeable = !food.builtin;
  const REVEAL = 80;

  function handleDragEnd(_: unknown, info: PanInfo) {
    const shouldOpen = info.offset.x < -REVEAL / 2 || info.velocity.x < -300;
    if (shouldOpen) {
      animate(x, -REVEAL, { type: "spring", stiffness: 400, damping: 36 });
      onOpen();
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 36 });
      onClose();
    }
  }

  useEffect(() => {
    if (!open) animate(x, 0, { type: "spring", stiffness: 400, damping: 36 });
  }, [open, x]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {swipeable && (
        <button
          onClick={() => {
            haptic("warning");
            onDelete();
          }}
          className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-red-500 text-white"
          aria-label={`Delete ${food.name}`}
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}
      <motion.div
        style={{ x: swipeable ? x : 0 }}
        drag={swipeable ? "x" : false}
        dragConstraints={{ left: -REVEAL, right: 0 }}
        dragElastic={{ left: 0.05, right: 0 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className="relative flex items-center gap-1 bg-surface-2 pr-2"
      >
        <IconButton
          label={food.favorite ? "Unfavorite" : "Favorite"}
          tone={food.favorite ? "warning" : "neutral"}
          variant="ghost"
          onClick={onToggleFav}
        >
          <Star
            className="h-[18px] w-[18px]"
            fill={food.favorite ? "currentColor" : "none"}
          />
        </IconButton>
        <button
          className="min-w-0 flex-1 py-3 text-left"
          onClick={() => (open ? onClose() : undefined)}
        >
          <div className="truncate text-sm font-semibold">{food.name}</div>
          <div className="truncate text-xs tabular-nums text-fg-3">
            {food.kcalPer100} kcal · {food.proteinPer100}P · {food.fatPer100}F ·{" "}
            {food.carbPer100}C / 100{food.unit}
          </div>
        </button>
      </motion.div>
    </div>
  );
}

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const scrollRef = useRef<HTMLElement>(null);

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
    haptic("success");
    await load();
  }

  async function handleDelete(id: number) {
    await deleteFood(id);
    setOpenRow(null);
    await load();
  }

  return (
    <>
      <main ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto">
        <Header
          title="Foods"
          right={
            <IconButton
              label="Add custom food"
              tone="brand"
              variant="ghost"
              onClick={() => setShowForm(true)}
            >
              <Plus className="h-[22px] w-[22px]" strokeWidth={2.4} />
            </IconButton>
          }
          scrollRef={scrollRef}
        />

        <div className="px-4 pb-4">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
            <input
              className="input pl-9 pr-9"
              placeholder="Search foods…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-fg-3 active:bg-surface-3"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="space-y-1">
            {filtered.map((f) => (
              <FoodRow
                key={f.id}
                food={f}
                open={openRow === f.id}
                onOpen={() => setOpenRow(f.id ?? null)}
                onClose={() => openRow === f.id && setOpenRow(null)}
                onToggleFav={async () => {
                  await toggleFavoriteFood(f.id!);
                  await load();
                }}
                onDelete={() => handleDelete(f.id!)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <BookOpen className="h-8 w-8 text-fg-3" />
                <p className="text-sm text-fg-3">
                  {search ? "No foods match your search" : "No foods yet"}
                </p>
              </div>
            )}
          </div>

          {!search && filtered.some((f) => !f.builtin) && (
            <p className="mt-4 text-center text-xs text-fg-3">
              Swipe a custom food left to delete
            </p>
          )}
        </div>
      </main>
      <TabBar />

      <Sheet
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Add custom food"
        detent="large"
        footer={
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
              disabled={saving}
              onClick={handleAdd}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              autoFocus
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
          <div>
            <label className="label">Unit</label>
            <SegmentedControl
              value={draft.unit}
              onChange={(v) => setDraft({ ...draft, unit: v })}
              options={[
                { value: "g", label: "Grams (g)" },
                { value: "ml", label: "Milliliters (ml)" },
              ]}
              ariaLabel="Unit"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <input
              className="input"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}
