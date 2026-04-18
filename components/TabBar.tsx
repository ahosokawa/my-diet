"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { Home, CalendarDays, Scale, LineChart, SlidersHorizontal } from "@/components/ui/Icon";

type Tab = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const TABS: Tab[] = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/weight", label: "Weight", icon: Scale },
  { href: "/review", label: "Review", icon: LineChart },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="flex flex-shrink-0 justify-around border-t border-hairline bg-surface-2/95 px-1 pt-1 backdrop-blur"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-transform active:scale-95 ${
              active ? "text-brand-600" : "text-fg-3"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className="h-[26px] w-[26px]"
              strokeWidth={active ? 2.4 : 1.9}
              fill={active ? "currentColor" : "none"}
              fillOpacity={active ? 0.12 : 0}
            />
            <span className={`text-[10px] font-medium ${active ? "text-brand-600" : "text-fg-3"}`}>
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
