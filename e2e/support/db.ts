import type { Page } from "@playwright/test";
import type { EnvelopeTables } from "@/lib/backup/envelope";

/**
 * Read all rows from a Dexie object store in the page's IndexedDB.
 * Use to assert post-action persistence (e.g. new targets row after goal change).
 */
export async function readTable<K extends keyof EnvelopeTables>(
  page: Page,
  store: K
): Promise<EnvelopeTables[K]> {
  return page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("my-diet");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(name, "readonly");
      const s = tx.objectStore(name);
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows as never;
  }, store) as Promise<EnvelopeTables[K]>;
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
