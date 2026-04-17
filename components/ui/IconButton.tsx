"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  variant?: "ghost" | "tinted" | "filled";
  tone?: "neutral" | "brand" | "danger" | "warning";
};

const toneClass: Record<NonNullable<Props["tone"]>, Record<NonNullable<Props["variant"]>, string>> = {
  neutral: {
    ghost: "text-fg-2 active:bg-surface-3",
    tinted: "bg-surface-3 text-fg-1 active:bg-hairline",
    filled: "bg-fg-1 text-surface active:opacity-90",
  },
  brand: {
    ghost: "text-brand-600 active:bg-brand-50 dark:active:bg-brand-900/30",
    tinted: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 active:bg-brand-100 dark:active:bg-brand-900/50",
    filled: "bg-brand-500 text-white active:bg-brand-600",
  },
  danger: {
    ghost: "text-red-600 active:bg-red-50 dark:active:bg-red-900/30",
    tinted: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 active:bg-red-100",
    filled: "bg-red-500 text-white active:bg-red-600",
  },
  warning: {
    ghost: "text-amber-600 active:bg-amber-50 dark:active:bg-amber-900/30",
    tinted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 active:bg-amber-200",
    filled: "bg-amber-500 text-white active:bg-amber-600",
  },
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, variant = "ghost", tone = "neutral", className, ...rest },
  ref
) {
  const v = toneClass[tone][variant];
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.92] ${v} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
});
