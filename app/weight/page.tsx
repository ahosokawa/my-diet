"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { TabBar } from "@/components/TabBar";
import { addWeight, listWeights, todayStr } from "@/lib/db/repos";
import type { WeightEntry } from "@/lib/db/schema";
import { WeightChart } from "./WeightChart";

export default function WeightPage() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

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
    await load();
  }

  const todaysEntry = entries.find((e) => e.date === todayStr());

  return (
    <>
      <main className="flex-1 overflow-y-auto p-4">
        <Header title="Weight" />

      <div className="card mb-4">
        <h3 className="mb-2 font-semibold">
          {todaysEntry ? "Today's weight" : "Log today's weight"}
        </h3>
        {todaysEntry ? (
          <p className="text-2xl font-bold text-brand-600">
            {todaysEntry.lbs} <span className="text-sm font-normal text-neutral-500">lbs</span>
          </p>
        ) : (
          <div className="flex gap-3">
            <input
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              className="input flex-1"
              placeholder="e.g. 185.0"
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
        )}
      </div>

      {entries.length > 1 && (
        <div className="card mb-4">
          <h3 className="mb-3 font-semibold">Trend</h3>
          <WeightChart entries={entries} />
        </div>
      )}

      <div className="space-y-1">
        {[...entries].reverse().map((e) => (
          <div
            key={e.date}
            className="flex justify-between px-3 py-2 text-sm"
          >
            <span className="text-neutral-500">{e.date}</span>
            <span className="font-medium">{e.lbs} lbs</span>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="py-8 text-center text-sm text-neutral-500">
            No entries yet
          </p>
        )}
      </div>

      </main>
      <TabBar />
    </>
  );
}
