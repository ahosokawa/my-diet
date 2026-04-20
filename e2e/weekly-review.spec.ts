import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { makeWeek2ReviewReady } from "./support/fixtures";

const TODAY = "2026-04-19";

async function readTargets(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("my-diet");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction("targets", "readonly");
      const store = tx.objectStore("targets");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows as Array<{
      id: number;
      dateEffective: string;
      kcal: number;
      proteinG: number;
      fatG: number;
      carbG: number;
      source: "auto" | "override" | string;
    }>;
  });
}

test.describe("Weekly review", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(`${TODAY}T10:00:00`) });
    await seedEnvelope(page, makeWeek2ReviewReady({ today: TODAY }).tables);
    await page.clock.resume();
    await page.goto(`/review`);
    await expect(page.getByRole("heading", { name: "Cut a bit" })).toBeVisible();
  });

  test("applies the auto verdict", async ({ page }) => {
    await expect(page.getByText(/2250 kcal/)).toBeVisible();

    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page).toHaveURL(/\/today/);

    const targets = await readTargets(page);
    expect(targets.length).toBe(2);
    const latest = targets.sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targets.length - 1];
    expect(latest.kcal).toBe(2250);
    expect(latest.source).toBe("auto");
  });

  test("saves a custom override", async ({ page }) => {
    await page.getByRole("button", { name: "Override" }).click();

    const overrideDialog = page.getByRole("dialog", {
      name: "Custom calorie target",
    });
    await expect(overrideDialog).toBeVisible();

    await overrideDialog.locator("input").first().fill("2300");
    await overrideDialog.getByRole("button", { name: "Save override" }).click();

    await expect(page).toHaveURL(/\/today/);

    const targets = await readTargets(page);
    expect(targets.length).toBe(2);
    const latest = targets.sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targets.length - 1];
    expect(latest.kcal).toBe(2300);
    expect(latest.source).toBe("override");
  });
});
