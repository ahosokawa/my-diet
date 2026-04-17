import Link from "next/link";
import type { ReactNode } from "react";

export function Header({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between bg-neutral-50/80 px-4 py-3 backdrop-blur">
      {back ? (
        <Link href={back} className="text-brand-600 font-medium">
          ← Back
        </Link>
      ) : (
        <span className="w-12" />
      )}
      <h1 className="text-lg font-semibold">{title}</h1>
      <span className="flex w-12 justify-end">{right ?? null}</span>
    </header>
  );
}
