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

export async function seedEnvelope(page: Page, tables: EnvelopeTables): Promise<void> {
  await page.goto("/");
  await page.waitForFunction((storeNames) => {
    return new Promise<boolean>((resolve) => {
      const req = indexedDB.open("my-diet");
      req.onsuccess = () => {
        const names = Array.from(req.result.objectStoreNames);
        req.result.close();
        resolve(storeNames.every((n) => names.includes(n)));
      };
      req.onerror = () => resolve(false);
    });
  }, STORES);

  await page.evaluate(
    async ({ tables, storeNames }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("my-diet");
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
    { tables: tables as unknown as Record<string, unknown[]>, storeNames: STORES }
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
