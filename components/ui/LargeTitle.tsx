"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "./Icon";

type Props = {
  title: string;
  back?: string;
  backLabel?: string;
  right?: ReactNode;
  scrollRef?: React.RefObject<HTMLElement | null>;
};

export function LargeTitle({ title, back, backLabel = "Back", right, scrollRef }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = scrollRef?.current ?? fallbackRef.current?.parentElement;
    if (!target) return;
    const onScroll = () => setCollapsed(target.scrollTop > 18);
    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  return (
    <div ref={fallbackRef}>
      <div
        className={`sticky top-0 z-20 flex items-center justify-between gap-2 bg-surface/85 px-2 backdrop-blur transition-[padding,border-color] ${
          collapsed
            ? "border-b border-hairline py-2"
            : "border-b border-transparent py-2"
        }`}
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-[44px] items-center">
          {back ? (
            <Link
              href={back}
              aria-label={backLabel}
              className="-ml-1 inline-flex h-11 items-center gap-0.5 rounded-full px-2 text-brand-600 active:bg-surface-3"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
              <span className="text-base font-medium">{backLabel}</span>
            </Link>
          ) : null}
        </div>
        <h1
          className={`flex-1 truncate text-center font-semibold transition-all ${
            collapsed ? "text-base opacity-100" : "text-base opacity-0"
          }`}
        >
          {title}
        </h1>
        <div className="flex min-w-[44px] items-center justify-end">{right ?? null}</div>
      </div>
      <h1
        className={`px-4 pb-3 pt-2 text-3xl font-bold tracking-tight transition-all ${
          collapsed ? "h-0 -translate-y-2 overflow-hidden p-0 opacity-0" : "h-auto opacity-100"
        }`}
      >
        {title}
      </h1>
    </div>
  );
}
