"use client";

import { useState } from "react";

/** Digits with at most one decimal point (also matches "" and partials like "4."). */
export const DECIMAL_RE = /^\d*\.?\d*$/;

type Props = {
  value: number | "";
  onValueChange: (next: number) => void;
  /**
   * Called when the field is emptied. Provide it when the parent state models
   * "empty" (e.g. `number | ""`); omit it to keep the last valid value and
   * restore it on blur.
   */
  onClear?: () => void;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * Controlled decimal input backed by a `number`. Buffers the raw text locally
 * so partial entries like "4." survive re-render; only finite parses are
 * propagated, and the buffer resyncs when the value changes externally (e.g.
 * a reset-to-defaults button).
 */
export function DecimalInput({
  value,
  onValueChange,
  onClear,
  className,
  ariaLabel,
  placeholder,
  autoFocus,
}: Props) {
  const [text, setText] = useState(() => String(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <input
      inputMode="decimal"
      pattern="[0-9]*\.?[0-9]*"
      aria-label={ariaLabel}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        if (!DECIMAL_RE.test(v)) return;
        setText(v);
        if (v === "") {
          if (onClear) {
            setSynced("");
            onClear();
          }
          return;
        }
        const n = Number(v);
        if (Number.isFinite(n)) {
          setSynced(n);
          onValueChange(n);
        }
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
