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
import { useDarkMode } from "@/lib/ui/useDarkMode";

export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const dark = useDarkMode();
  const data = entries.map((e) => ({
    date: e.date.slice(5),
    lbs: e.lbs,
  }));

  const lbs = entries.map((e) => e.lbs);
  const min = Math.floor(Math.min(...lbs) - 2);
  const max = Math.ceil(Math.max(...lbs) + 2);

  const grid = dark ? "#27272a" : "#e5e5e5";
  const tick = dark ? "#a1a1aa" : "#71717a";
  const tooltipBg = dark ? "#18181b" : "#ffffff";
  const tooltipBorder = dark ? "#27272a" : "#e5e5e5";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: tick }} stroke={grid} />
        <YAxis
          domain={[min, max]}
          tick={{ fontSize: 11, fill: tick }}
          width={40}
          stroke={grid}
        />
        <Tooltip
          contentStyle={{
            background: tooltipBg,
            border: `1px solid ${tooltipBorder}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: tick }}
        />
        <Line
          type="monotone"
          dataKey="lbs"
          stroke="#26a55e"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#26a55e", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
