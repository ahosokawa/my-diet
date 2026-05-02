import type { Page } from "@playwright/test";
import type { EnvelopeTables } from "@/lib/backup/envelope";

// Keep in sync with SCHEMA_VERSION in support/seed.ts. Dexie scales the
// user-facing `this.version(N)` by 10 when opening IDB — so version 7 → 70.
const SCHEMA_VERSION = 70;

/**
 * Read all rows from a Dexie object store in the page's IndexedDB.
 * Use to assert post-action persistence (e.g. new targets row after goal change).
 */
export async function readTable<K extends keyof EnvelopeTables>(
  page: Page,
  store: K
): Promise<EnvelopeTables[K]> {
  return page.evaluate(
    async ({ name, version }) => {
      const sleep = (ms: number) =>
        new Promise<void>((r) => setTimeout(r, ms));

      const readOnce = async (): Promise<unknown[]> => {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open("my-diet", version);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error("open failed"));
          req.onblocked = () => reject(new Error("blocked"));
          req.onupgradeneeded = () => {
            try {
              req.transaction?.abort();
            } catch {}
          };
        });
        try {
          if (!Array.from(db.objectStoreNames).includes(name)) {
            throw new Error(`missing store ${name}`);
          }
          return await new Promise<unknown[]>((resolve, reject) => {
            const tx = db.transaction(name, "readonly");
            const s = tx.objectStore(name);
            const req = s.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
        } finally {
          db.close();
        }
      };

      const deadline = Date.now() + 5_000;
      let lastErr: unknown;
      while (Date.now() < deadline) {
        try {
          return await readOnce();
        } catch (e) {
          lastErr = e;
          await sleep(50);
        }
      }
      throw new Error(
        `readTable failed after retries: ${
          lastErr instanceof Error ? lastErr.message : String(lastErr)
        }`
      );
    },
    { name: store, version: SCHEMA_VERSION }
  ) as Promise<EnvelopeTables[K]>;
}

/**
 * Read a `data-*` attribute as a number.
 * Fails loudly if the attribute is missing/non-numeric rather than silently NaN.
 */
export async function readNumberAttr(
  locator: import("@playwright/test").Locator,
  attr: string
): Promise<number> {
  const raw = await locator.getAttribute(attr);
  if (raw == null) throw new Error(`attr ${attr} missing`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`attr ${attr} not numeric: ${raw}`);
  return n;
}
