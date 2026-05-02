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
// Opening without a version returns the IDB at its current cached version,
// which on WebKit can be stale relative to Dexie's most recent upgrade;
// pinning the version forces IDB to hand back the upgraded snapshot.
const SCHEMA_VERSION = 60;

export async function seedEnvelope(page: Page, tables: EnvelopeTables): Promise<void> {
  await page.goto("/");
  // Wait until every expected store both exists AND is transactable. Just
  // checking objectStoreNames is racy: Dexie may publish a store name during
  // an in-flight versionchange transaction before the upgrade actually
  // commits, so a follow-up readwrite transaction can still NotFound.
  await page.waitForFunction(({ storeNames, version }) => {
    return new Promise<boolean>((resolve) => {
      const req = indexedDB.open("my-diet", version);
      req.onsuccess = () => {
        const db = req.result;
        const names = Array.from(db.objectStoreNames);
        if (!storeNames.every((n) => names.includes(n))) {
          db.close();
          resolve(false);
          return;
        }
        try {
          const tx = db.transaction(storeNames, "readonly");
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
          tx.onerror = () => {
            db.close();
            resolve(false);
          };
          tx.onabort = () => {
            db.close();
            resolve(false);
          };
        } catch {
          db.close();
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
      req.onupgradeneeded = () => {
        // Should not happen if Dexie has already opened the DB at this
        // version. If it does, abort by closing — the next poll will retry.
        try {
          req.transaction?.abort();
        } catch {}
      };
    });
  }, { storeNames: STORES, version: SCHEMA_VERSION });

  await page.evaluate(
    async ({ tables, storeNames, version }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("my-diet", version);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      for (const name of storeNames) {
        const rows = (tables as Record<string, unknown[]>)[name];
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(name, "readwrite");
          const store = tx.objectStore(name);
          store.clear();
          for (const row of rows) store.put(row);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      }

      db.close();
    },
    {
      tables: tables as unknown as Record<string, unknown[]>,
      storeNames: STORES,
      version: SCHEMA_VERSION,
    }
  );

  // The root IndexPage fires router.replace() based on profile presence. Wait
  // for that redirect to land so the test's subsequent goto() isn't racing
  // an in-flight navigation from IndexPage.
  await page
    .waitForFunction(() => window.location.pathname !== "/", null, { timeout: 5000 })
    .catch(() => {});
  // Extra settle: give any Strict-Mode double-invoke or Fast-Refresh reload
  // a chance to complete before the test starts navigating.
  await page.waitForLoadState("networkidle").catch(() => {});
}
