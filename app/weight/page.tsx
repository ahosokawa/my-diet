"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import {
  addWeight,
  deleteWeight,
  getProfile,
  listWeights,
  todayStr,
  updateWeight,
} from "@/lib/db/repos";
import type { Profile, WeightEntry } from "@/lib/db/schema";
import { RATE_BANDS } from "@/lib/nutrition/macros";
import { MAINTAIN_DRIFT } from "./WeightChart";
import { haptic } from "@/lib/ui/haptics";
import { SwipeRow } from "@/components/ui/SwipeRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { WeightChart } from "./WeightChart";

export default function WeightPage() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(
    null,
  );
  const [swipeOpenId, setSwipeOpenId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLElement>(null);

  async function load() {
    const [ws, prof] = await Promise.all([listWeights(), getProfile()]);
    setEntries(ws);
    if (prof) setProfile(prof);
    setLoaded(true);
  }

  useEffect(() => {
    load();
  }, []);

  const goalStartWeightLb = useMemo(() => {
    if (!profile) return undefined;
    // Earliest entry on or after goalStartDate → best anchor for the corridor.
    const startAnchored = [...entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .find((e) => e.date >= profile.goalStartDate);
    return startAnchored?.lbs ?? profile.weightLb;
  }, [entries, profile]);

  useEffect(() => {
    if (editingId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingId]);

  async function handleAdd() {
    const lbs = Number(value);
    if (!value || !isFinite(lbs) || lbs <= 0) return;
    setSaving(true);
    await addWeight({ date: todayStr(), lbs });
    setValue("");
    setSaving(false);
    haptic("success");
    await load();
  }

  function startEdit(entry: WeightEntry) {
    if (entry.id == null) return;
    setSwipeOpenId(null);
    setEditingId(entry.id);
    setEditValue(String(entry.lbs));
    setConfirmingDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
    setConfirmingDeleteId(null);
  }

  async function saveEdit(entry: WeightEntry) {
    if (entry.id == null) return;
    const lbs = Number(editValue);
    if (!editValue || !isFinite(lbs) || lbs <= 0) return;
    if (lbs === entry.lbs) {
      cancelEdit();
      return;
    }
    await updateWeight(entry.id, lbs);
    haptic("success");
    cancelEdit();
    await load();
  }

  async function handleDelete(entry: WeightEntry) {
    if (entry.id == null) return;
    setSwipeOpenId(null);
    if (editingId === entry.id) cancelEdit();
    await deleteWeight(entry.id);
    haptic("warning");
    await load();
  }

  const todaysEntry = entries.find((e) => e.date === todayStr());
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const delta = todaysEntry && previous ? todaysEntry.lbs - previous.lbs : 0;
  const editingToday = !!todaysEntry && todaysEntry.id === editingId;

  const history = useMemo(
    () => entries.filter((e) => e.date !== todayStr()).reverse(),
    [entries],
  );

  const editDirty = (entry: WeightEntry) =>
    editValue !== "" &&
    editValue !== "." &&
    Number(editValue) > 0 &&
    Number(editValue) !== entry.lbs;

  function renderEditor(entry: WeightEntry) {
    const confirming = confirmingDeleteId === entry.id;
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            pattern="[0-9]*\.?[0-9]*"
            autoFocus
            className="input flex-1 text-2xl font-semibold tabular-nums"
            value={editValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d*\.?\d*$/.test(v)) setEditValue(v);
            }}
          />
          <button className="btn-secondary" onClick={cancelEdit}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!editDirty(entry)}
            onClick={() => saveEdit(entry)}
          >
            Save
          </button>
        </div>
        {confirming ? (
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={() => setConfirmingDeleteId(null)}
            >
              Keep
            </button>
            <button
              className="btn-danger flex-1"
              onClick={() => handleDelete(entry)}
            >
              Confirm delete
            </button>
          </div>
        ) : (
          <button
            className="btn-danger-ghost"
            onClick={() => setConfirmingDeleteId(entry.id ?? null)}
          >
            Delete entry
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <Header title="Weight" scrollRef={scrollRef} />

        <div className="px-4 pb-4">
          {!loaded ? (
            <Skeleton className="mb-4 h-[120px]" />
          ) : todaysEntry ? (
            editingToday ? (
              <div className="card mb-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">
                  Today · editing
                </div>
                {renderEditor(todaysEntry)}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEdit(todaysEntry)}
                className="card mb-4 w-full text-left transition active:scale-[0.99]"
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-fg-3">
                  Today
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span
                    aria-label="Today's weight"
                    className="text-4xl font-bold tabular-nums text-fg-1"
                  >
                    {todaysEntry.lbs}
                  </span>
                  <span className="text-base text-fg-3">lbs</span>
                </div>
                {previous && Math.abs(delta) > 0 && (
                  <div
                    className={`mt-1 text-sm font-medium tabular-nums ${
                      delta < 0 ? "text-brand-600" : "text-amber-600"
                    }`}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)} lbs since {previous.date.slice(5)}
                  </div>
                )}
              </button>
            )
          ) : (
            <div className="card mb-4">
              <h3 className="mb-2 font-semibold">Log today's weight</h3>
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  aria-label="Weight pounds"
                  className="input flex-1 text-2xl font-semibold tabular-nums"
                  placeholder="0.0"
                  value={value}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d*\.?\d*$/.test(v)) setValue(v);
                  }}
                />
                <button
                  className="btn-primary"
                  disabled={saving || value === "" || value === "."}
                  onClick={handleAdd}
                >
                  Save
                </button>
              </div>
              <p className="mt-2 text-xs text-fg-3">Imperial pounds (lb)</p>
            </div>
          )}

          {entries.length > 1 && (
            <div className="card mb-4">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="font-semibold">Trend</h3>
                {profile && (
                  <span className="text-xs text-fg-3 tabular-nums">
                    {profile.goal === "maintain"
                      ? `±${(MAINTAIN_DRIFT * 100).toFixed(1)}% drift zone`
                      : `${Math.abs(RATE_BANDS[profile.goal].min * 100).toFixed(1)}–${Math.abs(RATE_BANDS[profile.goal].max * 100).toFixed(1)}%/wk ${profile.goal === "cut" ? "loss" : "gain"} band`}
                  </span>
                )}
              </div>
              <WeightChart
                entries={entries}
                goal={profile?.goal}
                goalStartDate={profile?.goalStartDate}
                goalStartWeightLb={goalStartWeightLb}
              />
            </div>
          )}

          {history.length > 0 && (
            <div className="card !p-0 overflow-hidden">
              <h3 className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fg-3">
                History
              </h3>
              <div>
                {history.map((e, i) => {
                  const isEditing = editingId === e.id;
                  const border =
                    i < history.length - 1 ? "border-b border-hairline" : "";
                  if (isEditing) {
                    return (
                      <div key={e.date} className={`px-4 py-3 ${border}`}>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">
                          {e.date} · editing
                        </div>
                        {renderEditor(e)}
                      </div>
                    );
                  }
                  return (
                    <SwipeRow
                      key={e.date}
                      className={border}
                      open={swipeOpenId === e.id}
                      onOpenChange={(o) =>
                        setSwipeOpenId(o ? (e.id ?? null) : null)
                      }
                      onDelete={() => handleDelete(e)}
                    >
                      <button
                        type="button"
                        onClick={() => startEdit(e)}
                        className="flex w-full items-center justify-between bg-surface-2 px-4 py-3 text-left active:bg-surface-3"
                      >
                        <span className="text-sm text-fg-2">{e.date}</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {e.lbs} lbs
                        </span>
                      </button>
                    </SwipeRow>
                  );
                })}
              </div>
              <p className="px-4 py-2 text-center text-xs text-fg-3">
                Tap to edit · swipe left to delete
              </p>
            </div>
          )}

          {loaded && entries.length === 0 && (
            <div className="card text-center text-sm text-fg-3">
              No entries yet. Log your first weight above.
            </div>
          )}
        </div>
      </main>
      <TabBar />
    </>
  );
}
