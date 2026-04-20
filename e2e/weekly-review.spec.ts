import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeWeek2ReviewReady } from "./support/fixtures";

const TODAY = "2026-04-19";

test.describe("Weekly review", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeWeek2ReviewReady({ today: TODAY }).tables);
    await page.goto(`/review`);
    await expect(page.getByRole("heading", { name: "Cut a bit" })).toBeVisible();
  });

  test("applies the auto verdict", async ({ page }) => {
    await expect(page.getByText(/2250 kcal/)).toBeVisible();

    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page).toHaveURL(/\/today/);

    const targets = await readTable(page, "targets");
    expect(targets).toHaveLength(2);
    const latest = [...targets].sort((a, b) =>
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

    await overrideDialog.getByRole("textbox").first().fill("2300");
    await overrideDialog.getByRole("button", { name: "Save override" }).click();

    await expect(page).toHaveURL(/\/today/);

    const targets = await readTable(page, "targets");
    expect(targets).toHaveLength(2);
    const latest = [...targets].sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targets.length - 1];
    expect(latest.kcal).toBe(2300);
    expect(latest.source).toBe("override");
  });
});
