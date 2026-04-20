import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeDay3MidWeek, makeWeek2ReviewReady } from "./support/fixtures";

// Use real current date so server-rendered HTML (dev mode) matches the client
// clock — otherwise page.clock produces a hydration mismatch that our pageerror
// listener would (correctly) flag.
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Smoke test that the app renders every route without uncaught errors,
 * reloads don't corrupt IndexedDB, and seeded data stays intact across
 * navigation. Meant to catch Dexie/schema regressions pre-launch.
 */
test.describe("Corruption smoke", () => {
  test("all routes survive reloads with seeded data intact", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    await seedEnvelope(page, makeWeek2ReviewReady({ today: TODAY }).tables);

    const profileBefore = (await readTable(page, "profile"))[0];
    const targetsBefore = await readTable(page, "targets");
    const foodsBefore = await readTable(page, "foods");
    const weightsBefore = await readTable(page, "weights");

    const routes = ["/today", "/schedule", "/weight", "/review", "/settings"];
    for (const r of routes) {
      await page.goto(r);
      // Each route renders a <main>; prove render actually completed.
      await expect(page.locator("main")).toBeVisible();
      await page.reload();
      await expect(page.locator("main")).toBeVisible();
    }

    expect(errors, errors.join("\n")).toHaveLength(0);

    // Data parity after all that navigation/reloading.
    const profileAfter = (await readTable(page, "profile"))[0];
    const targetsAfter = await readTable(page, "targets");
    const foodsAfter = await readTable(page, "foods");
    const weightsAfter = await readTable(page, "weights");

    expect(profileAfter).toEqual(profileBefore);
    expect(targetsAfter).toEqual(targetsBefore);
    expect(foodsAfter).toHaveLength(foodsBefore.length);
    expect(weightsAfter).toEqual(weightsBefore);
  });

  test("day-3 mid-week seed survives a navigation loop", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);

    // Loop: today → meal 1 detail → back → weight → today. 3x.
    for (let i = 0; i < 3; i++) {
      await page.goto(`/today?d=${TODAY}`);
      await expect(page.getByText("Daily totals")).toBeVisible();
      await page.getByRole("link", { name: /Meal 1/ }).click();
      await expect(page.getByText("Target")).toBeVisible();
      await page.goto("/weight");
      await expect(page.getByRole("heading", { level: 1, name: "Weight" })).toBeVisible();
    }

    expect(errors, errors.join("\n")).toHaveLength(0);
  });
});
