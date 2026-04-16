"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { WeightEntry } from "@/lib/db/schema";

export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const data = entries.map((e) => ({
    date: e.date.slice(5),
    lbs: e.lbs,
  }));

  const lbs = entries.map((e) => e.lbs);
  const min = Math.floor(Math.min(...lbs) - 2);
  const max = Math.ceil(Math.max(...lbs) + 2);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis domain={[min, max]} tick={{ fontSize: 11 }} width={40} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="lbs"
          stroke="#26a55e"
          strokeWidth={2}
          dot={{ r: 3, fill: "#26a55e" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
