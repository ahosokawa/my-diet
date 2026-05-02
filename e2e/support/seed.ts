import type { Page } from "@playwright/test";
import type { EnvelopeTables } from "@/lib/backup/envelope";

const STORES: (keyof EnvelopeTables)[] = [
  "profile",
  "targets",
  "foods",
  "schedule",
  "mealLogs",
  "weights",
  "combos",
  "prefs",
];

// Must match the highest `this.version(N)` block in `lib/db/schema.ts`,
// multiplied by 10 — Dexie internally scales the user-facing version by 10
// when opening the underlying IDB (see Dexie source: `Math.round(db.verno * 10)`).
const SCHEMA_VERSION = 60;

export async function seedEnvelope(page: Page, tables: EnvelopeTables): Promise<void> {
  await page.goto("/");

  // Let the IndexPage's `router.replace()` redirect land and the app's
  // initial Dexie open complete before we touch IDB. Seeding mid-redirect
  // races Dexie's onupgradeneeded transaction and can yield a connection
  // whose objectStoreNames is incomplete.
  await page
    .waitForFunction(() => window.location.pathname !== "/", null, { timeout: 5000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});

  // Combined wait-and-seed in a single evaluate with retry.
  //
  // Two opens (probe + writer) is racy on WebKit: even when the probe verifies
  // every store exists and a readonly transaction commits, a follow-up
  // `indexedDB.open(name, version)` can hand back a connection whose
  // `objectStoreNames` is incomplete during the brief window when Dexie's
  // versionchange transaction is still settling on disk. Retrying inside one
  // page context lets a transient stale snapshot recover on the next attempt.
  await page.evaluate(
    async ({ tables, storeNames, version }) => {
      const sleep = (ms: number) =>
        new Promise<void>((r) => setTimeout(r, ms));

      const seedOnce = async (): Promise<void> => {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open("my-diet", version);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error("open failed"));
          req.onblocked = () =>
            reject(new Error("open blocked by another connection"));
          req.onupgradeneeded = () => {
            // Reaching here means Dexie hasn't yet upgraded the DB to this
            // version. Abort so we don't create a half-baked schema, and let
            // the retry loop pick it up on the next pass.
            try {
              req.transaction?.abort();
            } catch {}
          };
        });
        try {
          const names = Array.from(db.objectStoreNames);
          for (const n of storeNames) {
            if (!names.includes(n)) throw new Error(`missing store ${n}`);
          }
          for (const name of storeNames) {
            const rows = (tables as Record<string, unknown[]>)[name];
            await new Promise<void>((resolve, reject) => {
              const tx = db.transaction(name, "readwrite");
              const store = tx.objectStore(name);
              store.clear();
              for (const row of rows) store.put(row);
              tx.oncomplete = () => resolve();
              tx.onerror = () =>
                reject(tx.error ?? new Error("tx error"));
              tx.onabort = () =>
                reject(tx.error ?? new Error("tx aborted"));
            });
          }
        } finally {
          db.close();
        }
      };

      const deadline = Date.now() + 15_000;
      let lastErr: unknown;
      while (Date.now() < deadline) {
        try {
          await seedOnce();
          return;
        } catch (e) {
          lastErr = e;
          await sleep(100);
        }
      }
      throw new Error(
        `Failed to seed IDB after retries: ${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`
      );
    },
    {
      tables: tables as unknown as Record<string, unknown[]>,
      storeNames: STORES,
      version: SCHEMA_VERSION,
    }
  );
}
