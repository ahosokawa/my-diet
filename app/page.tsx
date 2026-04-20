"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/db/repos";

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getProfile().then((profile) => {
      if (cancelled) return;
      router.replace(profile ? "/today" : "/intake");
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mt-20 text-center text-neutral-500">Starting…</div>
    </main>
  );
}
