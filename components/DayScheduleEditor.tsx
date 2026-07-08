"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Check } from "@/components/ui/Icon";
import type { ScheduleDay } from "@/lib/db/schema";
import { WEEKDAY_LABELS, defaultMealTimes, toMinutes } from "@/lib/schedule/week";
import { minutesToHhmm } from "@/lib/date";

export const SHORT_WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type EditorProps = {
  day: ScheduleDay;
  onChange: (patch: Partial<ScheduleDay>) => void;
  compact?: boolean;
};

/**
 * Per-day schedule editor (meal count, meal times, optional workout window).
 * Controlled: parents own persistence. Used by the schedule screen and the
 * onboarding schedule step.
 */
export function DayScheduleEditor({ day, onChange, compact }: EditorProps) {
  const inputCls = compact ? "input text-sm" : "input";

  function setMealCount(count: number) {
    const workoutEnd =
      day.workoutStart && day.workoutDurationMin
        ? minutesToHhmm(toMinutes(day.workoutStart) + day.workoutDurationMin)
        : undefined;
    onChange({ mealTimes: defaultMealTimes(count, workoutEnd) });
  }

  return (
    <>
      <div>
        <label className="label">Meals per day</label>
        <SegmentedControl
          value={day.mealTimes.length}
          onChange={setMealCount}
          options={[1, 2, 3, 4, 5, 6].map((n) => ({
            value: n,
            label: String(n),
          }))}
          ariaLabel="Meals per day"
        />
      </div>

      <div>
        <label className="label">Meal times</label>
        <div className={compact ? "space-y-1" : "space-y-1.5"}>
          {day.mealTimes.map((t, i) => (
            <input
              key={i}
              type="time"
              className={inputCls}
              value={t}
              onChange={(e) => {
                const times = [...day.mealTimes];
                times[i] = e.target.value;
                onChange({ mealTimes: times });
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="label">Workout (optional)</label>
        <div className="flex gap-2">
          <input
            type="time"
            className={inputCls}
            placeholder="Start"
            value={day.workoutStart ?? ""}
            onChange={(e) =>
              onChange({ workoutStart: e.target.value || undefined })
            }
          />
          <input
            type="number"
            inputMode="numeric"
            placeholder="min"
            className={`${inputCls} ${compact ? "w-20" : "w-24"}`}
            value={day.workoutDurationMin ?? ""}
            onChange={(e) =>
              onChange({
                workoutDurationMin: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
        {day.workoutStart && (
          <button
            className="mt-2 text-xs font-medium text-red-500"
            onClick={() =>
              onChange({ workoutStart: undefined, workoutDurationMin: undefined })
            }
          >
            Remove workout
          </button>
        )}
      </div>
    </>
  );
}

type CopyPickerProps = {
  days: ScheduleDay[];
  exclude: number;
  selected: Set<number>;
  onToggle: (weekday: number) => void;
  compact?: boolean;
};

/** Checkbox day list for "copy this day to…". */
export function CopyDayPicker({ days, exclude, selected, onToggle, compact }: CopyPickerProps) {
  return (
    <div className="space-y-1">
      {days.map((d) => {
        if (d.weekday === exclude) return null;
        const on = selected.has(d.weekday);
        return (
          <button
            key={d.weekday}
            onClick={() => onToggle(d.weekday)}
            className={`flex w-full items-center justify-between rounded-xl active:bg-surface-3 ${
              compact ? "px-2 py-2" : "px-3 py-3"
            }`}
          >
            <span className="flex items-center gap-3">
              <span
                className={`flex items-center justify-center rounded-full font-bold ${
                  compact ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs"
                } ${on ? "bg-brand-500 text-white" : "bg-surface-3 text-fg-2"}`}
              >
                {SHORT_WEEKDAY_LABELS[d.weekday]}
              </span>
              <span className="text-sm font-medium">
                {WEEKDAY_LABELS[d.weekday]}
              </span>
            </span>
            <span
              className={`flex items-center justify-center rounded-md border ${
                compact ? "h-5 w-5" : "h-6 w-6"
              } ${
                on
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-hairline"
              }`}
            >
              {on && (
                <Check
                  className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
                  strokeWidth={3}
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
