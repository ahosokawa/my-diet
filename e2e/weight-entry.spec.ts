import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

test.describe("Weight entry", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(`${TODAY}T10:00:00`) });
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.clock.resume();
    await page.goto(`/weight`);
    await expect(
      page.getByRole("heading", { name: "Log today's weight" })
    ).toBeVisible();
  });

  test("logs today's weight and persists across reload", async ({ page }) => {
    await page.getByPlaceholder("0.0").fill("181.5");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("181.5").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Log today's weight" })).not.toBeVisible();

    await page.reload();

    await expect(page.getByText("181.5").first()).toBeVisible();
  });
});
