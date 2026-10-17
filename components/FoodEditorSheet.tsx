"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DECIMAL_RE } from "@/components/ui/DecimalInput";
import { Trash2 } from "@/components/ui/Icon";
import { haptic } from "@/lib/ui/haptics";
import { addCustomFood, archiveFood, getFoodsByIds, updateCustomFood } from "@/lib/db/repos";
import type { Food } from "@/lib/db/schema";
import { EMPTY_CUSTOM, draftFromFood, inputFromDraft, type CustomDraft } from "@/lib/foods/draft";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Custom food to edit; null creates a new one. */
  food: Food | null;
  /** Prefills the name when creating (e.g. the picker's search text). */
  initialName?: string;
  /** `previousId` is set when a nutrition edit replaced the food with a new row. */
  onSaved: (food: Food, previousId: number | null) => void;
  onArchived?: (id: number) => void;
};

export function FoodEditorSheet({ open, onClose, food, initialName = "", onSaved, onArchived }: Props) {
  const [draft, setDraft] = useState<CustomDraft>(EMPTY_CUSTOM);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [openedFor, setOpenedFor] = useState<number | "new" | null>(null);
  const editing = food !== null;

  // Reset the draft while rendering the open transition, not in an effect: an
  // effect lands a frame late, and a keystroke in that frame would apply to
  // the previous draft. `initialName` follows the search box, so it's only
  // read here.
  const target = open ? (food?.id ?? "new") : null;
  if (target !== openedFor) {
    setOpenedFor(target);
    if (open) {
      setDraft(food ? draftFromFood(food) : { ...EMPTY_CUSTOM, name: initialName.trim() });
      setConfirmingDelete(false);
    }
  }

  function close() {
    if (!saving) onClose();
  }

  async function save() {
    const input = inputFromDraft(draft, food ?? undefined);
    if (!input) return;
    setSaving(true);
    try {
      const id = food ? await updateCustomFood(food.id!, input) : await addCustomFood(input);
      const [saved] = await getFoodsByIds([id]);
      haptic("success");
      onSaved(saved, food && id !== food.id ? food.id! : null);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!food) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      haptic("light");
      return;
    }
    setSaving(true);
    try {
      await archiveFood(food.id!);
      haptic("success");
      onArchived?.(food.id!);
    } finally {
      setSaving(false);
    }
  }

  function numberField(key: keyof CustomDraft, label: string, aria: string, placeholder?: string) {
    return (
      <div>
        <label className="mb-1 block text-xs text-fg-3">{label}</label>
        <input
          inputMode="decimal"
          aria-label={aria}
          className="input"
          placeholder={placeholder}
          value={draft[key]}
          onChange={(e) => {
            const v = e.target.value;
            if (DECIMAL_RE.test(v)) setDraft((d) => ({ ...d, [key]: v }));
          }}
        />
      </div>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={editing ? "Edit food" : "Add custom food"}
      detent="large"
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={close} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary flex-1" disabled={saving} onClick={save}>
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
            autoFocus={!editing}
            aria-label="Food name"
            value={draft.name}
            onChange={(e) => {
              const name = e.target.value;
              setDraft((d) => ({ ...d, name }));
            }}
          />
        </div>
        <div>
          <label className="label">Unit</label>
          <SegmentedControl
            value={draft.unit}
            onChange={(unit) => setDraft((d) => ({ ...d, unit }))}
            options={[
              { value: "g", label: "Grams (g)" },
              { value: "ml", label: "Milliliters (ml)" },
            ]}
            ariaLabel="Unit"
          />
        </div>
        <div>
          <label className="label">Serving size</label>
          <div className="relative">
            <input
              inputMode="decimal"
              aria-label="Serving size"
              className="input pr-10"
              placeholder="e.g. 28"
              value={draft.servingSize}
              onChange={(e) => {
                const servingSize = e.target.value;
                if (DECIMAL_RE.test(servingSize)) setDraft((d) => ({ ...d, servingSize }));
              }}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-3">
              {draft.unit}
            </span>
          </div>
          <p className="mt-1 text-xs text-fg-3">
            Copy this from the nutrition label (e.g. "1 scoop (28g)" → enter 28).
          </p>
        </div>
        <div>
          <label className="label">Per serving</label>
          <div className="grid grid-cols-2 gap-3">
            {numberField("kcalPerServing", "Calories", "Calories per serving")}
            {numberField("proteinPerServing", "Protein (g)", "Protein per serving")}
            {numberField("fatPerServing", "Fat (g)", "Fat per serving")}
            {numberField("carbPerServing", "Carbs (g)", "Carbs per serving")}
            {numberField("fiberPerServing", "Fiber (g)", "Fiber per serving", "Optional")}
          </div>
        </div>
        <div>
          <label className="label">Category</label>
          <input
            className="input"
            aria-label="Category"
            value={draft.category}
            onChange={(e) => {
              const category = e.target.value;
              setDraft((d) => ({ ...d, category }));
            }}
          />
        </div>
        <p className="text-xs text-fg-3">
          {editing
            ? "Meals you've already logged keep the values they were logged with."
            : "Saved to your library — it'll appear in future meal pickers too."}
        </p>
        {editing && (
          <div className="flex gap-2 pt-2">
            {confirmingDelete && (
              <button
                className="btn-secondary flex-1"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Keep
              </button>
            )}
            <button
              className={confirmingDelete ? "btn-danger flex-1" : "btn-danger-ghost"}
              onClick={remove}
              disabled={saving}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {confirmingDelete ? "Confirm delete" : "Delete food"}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
