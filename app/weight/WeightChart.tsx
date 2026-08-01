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
import { trailingAvg } from "@/lib/weight/trend";
import { useDarkMode } from "@/lib/ui/useDarkMode";
import { formatYmd, parseYmd } from "@/lib/date";

type Props = {
  entries: WeightEntry[];
  goal?: Goal;
  goalStartDate?: string;
  goalStartWeightLb?: number;
};

export const MAINTAIN_DRIFT = 0.015; // ±1.5% drift zone around goal-start weight

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

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
  const goalStartTs = goalStartDate ? parseYmd(goalStartDate).getTime() : 0;

  type Row = {
    ts: number;
    lbs: number;
    avg?: number;
    bandRange?: [number, number];
  };
  const data: Row[] = entries.map((e) => {
    const ts = parseYmd(e.date).getTime();
    const row: Row = { ts, lbs: e.lbs, avg: trailingAvg(entries, e.date) };
    if (showBand && goalStartWeightLb) {
      if (goal === "maintain") {
        const lo = goalStartWeightLb * (1 - MAINTAIN_DRIFT);
        const hi = goalStartWeightLb * (1 + MAINTAIN_DRIFT);
        row.bandRange = [lo, hi];
      } else if (band) {
        const weeks = (ts - goalStartTs) / MS_PER_WEEK;
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

  const grid = dark ? "#27272a" : "#ececec";
  const tick = dark ? "#a1a1aa" : "#71717a";
  const tooltipBg = dark ? "#18181b" : "#ffffff";
  const tooltipBorder = dark ? "#27272a" : "#e5e5e5";
  const green = "#26a55e";
  const bandFill = dark ? "#3b82f6" : "#60a5fa";

  const mmdd = (ts: number) => formatYmd(new Date(ts)).slice(5);

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data}>
          <CartesianGrid stroke={grid} />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={mmdd}
            tick={{ fontSize: 11, fill: tick }}
            stroke={grid}
            minTickGap={28}
          />
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
            labelFormatter={(ts) => formatYmd(new Date(Number(ts)))}
            formatter={(value, name) => {
              if (Array.isArray(value)) {
                const [lo, hi] = value as [number, number];
                return [`${lo.toFixed(1)} – ${hi.toFixed(1)} lbs`, name];
              }
              return [`${Number(value).toFixed(1)} lbs`, name];
            }}
          />
          {showBand && (
            <Area
              type="linear"
              dataKey="bandRange"
              name={goal === "maintain" ? "Drift zone" : "Goal pace"}
              stroke={bandFill}
              strokeWidth={1}
              strokeOpacity={0.5}
              fill={bandFill}
              fillOpacity={0.12}
              connectNulls
              isAnimationActive={false}
              activeDot={false}
            />
          )}
          <Line
            type="linear"
            dataKey="lbs"
            name="Weight"
            stroke="none"
            dot={{ r: 2.5, fill: green, fillOpacity: 0.35, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: green }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="avg"
            name="7-day avg"
            stroke={green}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full bg-brand-500" />
          7-day avg
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500/40" />
          Daily
        </span>
        {!!showBand && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-[3px] bg-[#3b82f6]/25" />
            {goal === "maintain" ? "Drift zone" : "Goal pace"}
          </span>
        )}
      </div>
    </div>
  );
}
