"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { WeightEntry } from "@/lib/db/schema";
import { type Goal, RATE_BANDS } from "@/lib/nutrition/macros";
import { useDarkMode } from "@/lib/ui/useDarkMode";
import { parseYmd } from "@/lib/date";

type Props = {
  entries: WeightEntry[];
  goal?: Goal;
  goalStartDate?: string;
  goalStartWeightLb?: number;
};

export const MAINTAIN_DRIFT = 0.015; // ±1.5% drift zone around goal-start weight

function daysBetween(a: string, b: string): number {
  const ms = parseYmd(a).getTime() - parseYmd(b).getTime();
  return ms / (24 * 60 * 60 * 1000);
}

export function WeightChart({
  entries,
  goal,
  goalStartDate,
  goalStartWeightLb,
}: Props) {
  const dark = useDarkMode();
  const showBand =
    goal && goalStartDate && goalStartWeightLb && entries.length > 0;
  const band = goal && goal !== "maintain" ? RATE_BANDS[goal] : null;

  type Row = {
    date: string;
    lbs: number;
    bandRange?: [number, number];
  };
  const data: Row[] = entries.map((e) => {
    const row: Row = { date: e.date.slice(5), lbs: e.lbs };
    if (showBand && goalStartWeightLb && goalStartDate) {
      if (goal === "maintain") {
        const lo = goalStartWeightLb * (1 - MAINTAIN_DRIFT);
        const hi = goalStartWeightLb * (1 + MAINTAIN_DRIFT);
        row.bandRange = [lo, hi];
      } else if (band) {
        const weeks = daysBetween(e.date, goalStartDate) / 7;
        if (weeks >= 0) {
          const lo = goalStartWeightLb * (1 + band.min * weeks);
          const hi = goalStartWeightLb * (1 + band.max * weeks);
          row.bandRange = [Math.min(lo, hi), Math.max(lo, hi)];
        }
      }
    }
    return row;
  });

  const lbs = entries.map((e) => e.lbs);
  const bandValues = data.flatMap((d) => d.bandRange ?? []);
  const allValues = [...lbs, ...bandValues];
  const min = Math.floor(Math.min(...allValues) - 2);
  const max = Math.ceil(Math.max(...allValues) + 2);

  const grid = dark ? "#27272a" : "#e5e5e5";
  const tick = dark ? "#a1a1aa" : "#71717a";
  const tooltipBg = dark ? "#18181b" : "#ffffff";
  const tooltipBorder = dark ? "#27272a" : "#e5e5e5";
  const bandFill = dark ? "#3b82f6" : "#60a5fa";

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data}>
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
          formatter={(value, name) => {
            if (name === "bandRange" && Array.isArray(value)) {
              const [lo, hi] = value as [number, number];
              return [`${lo.toFixed(1)} – ${hi.toFixed(1)} lbs`, "Target zone"];
            }
            if (name === "lbs") {
              return [`${Number(value).toFixed(1)} lbs`, "Weight"];
            }
            return [value as number, name];
          }}
        />
        {showBand && (
          <Area
            type="monotone"
            dataKey="bandRange"
            stroke={bandFill}
            strokeWidth={1}
            strokeOpacity={0.6}
            fill={bandFill}
            fillOpacity={0.15}
            connectNulls
            isAnimationActive={false}
            activeDot={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="lbs"
          stroke="#26a55e"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#26a55e", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
