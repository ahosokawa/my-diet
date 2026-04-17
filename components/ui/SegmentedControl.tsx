"use client";

type Option<T extends string | number> = {
  value: T;
  label: string;
};

type Props<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  ariaLabel?: string;
  size?: "sm" | "md";
};

export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
}: Props<T>) {
  const heightClass = size === "sm" ? "h-9 text-sm" : "h-11 text-base";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex w-full rounded-xl bg-surface-3 p-1 ${heightClass}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-lg px-2 font-medium transition-all ${
              active
                ? "bg-surface-2 text-fg-1 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04)]"
                : "text-fg-2 active:text-fg-1"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
