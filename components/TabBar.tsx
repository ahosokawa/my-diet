"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/foods", label: "Foods" },
  { href: "/schedule", label: "Schedule" },
  { href: "/weight", label: "Weight" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 -mx-4 mt-8 flex justify-around border-t border-neutral-200 bg-white/90 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur">
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center px-3 py-1 text-xs font-medium ${
              active ? "text-brand-600" : "text-neutral-500"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
