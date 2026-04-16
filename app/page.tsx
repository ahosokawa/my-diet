"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db/schema";

export default function IndexPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await db.profile.toCollection().first();
      router.replace(profile ? "/today" : "/intake");
      setReady(true);
    })();
  }, [router]);

  return (
    <main className="p-6">
      <div className="mt-20 text-center text-neutral-500">
        {ready ? "Loading…" : "Starting…"}
      </div>
    </main>
  );
}
