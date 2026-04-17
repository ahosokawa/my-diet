"use client";

import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { addWeight, listWeights, todayStr } from "@/lib/db/repos";
import type { WeightEntry } from "@/lib/db/schema";
import { haptic } from "@/lib/ui/haptics";
import { WeightChart } from "./WeightChart";

export default function WeightPage() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

  async function load() {
    setEntries(await listWeights());
  }

  useEffect(() => {
    load();
  }, []);

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

  const todaysEntry = entries.find((e) => e.date === todayStr());
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const delta = todaysEntry && previous ? todaysEntry.lbs - previous.lbs : 0;

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <Header title="Weight" scrollRef={scrollRef} />

        <div className="px-4 pb-4">
          {todaysEntry ? (
            <div className="card mb-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-fg-3">
                Today
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums text-fg-1">
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
            </div>
          ) : (
            <div className="card mb-4">
              <h3 className="mb-2 font-semibold">Log today's weight</h3>
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  className="input flex-1 text-2xl font-semibold tabular-nums"
                  placeholder="185.0"
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
              <h3 className="mb-3 font-semibold">Trend</h3>
              <WeightChart entries={entries} />
            </div>
          )}

          {entries.length > 0 && (
            <div className="card !p-0 overflow-hidden">
              <h3 className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-fg-3">
                History
              </h3>
              <div>
                {[...entries].reverse().map((e, i, arr) => (
                  <div
                    key={e.date}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < arr.length - 1 ? "border-b border-hairline" : ""
                    }`}
                  >
                    <span className="text-sm text-fg-2">{e.date}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {e.lbs} lbs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entries.length === 0 && (
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
