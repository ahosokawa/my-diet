"use client";

import { useState, useEffect } from "react";

export function GramsStepper({
  value,
  onChange,
  step = 5,
  unit = "g",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(next: number) {
    const clamped = Math.max(0, Math.round(next));
    onChange(clamped);
    setDraft(String(clamped));
  }

  return (
    <div className="flex items-center rounded-xl border border-hairline bg-surface-2">
      <button
        type="button"
        aria-label="Decrease"
        className="flex h-11 w-11 items-center justify-center text-xl font-semibold text-fg-1 active:bg-surface-3"
        onClick={() => commit(value - step)}
      >
        −
      </button>
      <div className="flex flex-1 items-baseline justify-center gap-0.5 px-1">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Grams"
          className="w-14 bg-transparent text-center text-base font-semibold tabular-nums text-fg-1 outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => commit(Number(draft) || 0)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <span className="text-xs text-fg-3">{unit}</span>
      </div>
      <button
        type="button"
        aria-label="Increase"
        className="flex h-11 w-11 items-center justify-center text-xl font-semibold text-fg-1 active:bg-surface-3"
        onClick={() => commit(value + step)}
      >
        +
      </button>
    </div>
  );
}
