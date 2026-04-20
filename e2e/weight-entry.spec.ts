import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

test.describe("Weight entry", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.goto(`/weight`);
    await expect(
      page.getByRole("heading", { name: "Log today's weight" })
    ).toBeVisible();
  });

  test("logs today's weight and persists across reload", async ({ page }) => {
    await page.getByLabel("Weight pounds").fill("181.5");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByLabel("Today's weight")).toHaveText("181.5");
    await expect(
      page.getByRole("heading", { name: "Log today's weight" })
    ).not.toBeVisible();

    const afterSave = await readTable(page, "weights");
    expect(afterSave.filter((w) => w.date === TODAY)).toHaveLength(1);
    expect(afterSave.find((w) => w.date === TODAY)?.lbs).toBe(181.5);

    await page.reload();
    await expect(page.getByLabel("Today's weight")).toHaveText("181.5");
  });
});
