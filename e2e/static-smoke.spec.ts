import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { makeDay3MidWeek } from "./support/fixtures";

// Runs against the production static export via playwright.static.config.ts
// (baseURL http://localhost:<port>/my-diet/). All paths must be relative so
// they resolve under the basePath.
const TODAY = "2026-04-19";

test.describe("Static export smoke", () => {
  test("serves the app under the basePath with working navigation", async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables, { gotoPath: "./" });

    await page.goto("./today/");
    await expect(page).toHaveURL(/\/my-diet\/today\//);
    await expect(page.getByText("Daily totals")).toBeVisible();

    // Client-side navigation respects the basePath.
    await page.getByRole("link", { name: "Weight" }).click();
    await expect(page).toHaveURL(/\/my-diet\/weight\//);
    await expect(page.getByRole("heading", { name: "Weight" }).first()).toBeVisible();
  });

  test("service worker precaches the shell; unvisited routes work offline", async ({
    page,
    context,
  }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables, { gotoPath: "./" });

    await page.goto("./today/");
    await expect(page.getByText("Daily totals")).toBeVisible();

    // Wait for the SW to activate and take control (skipWaiting + clients.claim).
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        return !!reg?.active && !!navigator.serviceWorker.controller;
      },
      null,
      { timeout: 15_000 }
    );
    // Give the install-time precache a moment to finish writing.
    await page.waitForFunction(
      async () => {
        const keys = await caches.keys();
        if (keys.length === 0) return false;
        const cache = await caches.open(keys[0]);
        return (await cache.keys()).length > 1;
      },
      null,
      { timeout: 15_000 }
    );

    await context.setOffline(true);
    // /review was never visited — offline load must come from the precache.
    await page.goto("./review/");
    await expect(page.getByRole("heading", { name: "Weekly check-in" }).first()).toBeVisible({
      timeout: 10_000,
    });
    await context.setOffline(false);
  });
});
