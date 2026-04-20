import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

test.describe("Day navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
  });

  test("prev/next buttons move between days; Jump to today returns", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
    await expect(page).toHaveURL(/d=2026-04-18/);

    await page.getByRole("button", { name: "Jump to today" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page).not.toHaveURL(/d=/);

    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.getByRole("heading", { name: "Tomorrow" })).toBeVisible();
    await expect(page).toHaveURL(/d=2026-04-20/);
  });

  test("deep link to past date renders that day's meal list", async ({ page }) => {
    // 4 days ago — not today/yesterday/tomorrow — should render a weekday date.
    await page.goto("/today?d=2026-04-15");
    await expect(page.getByText("Daily totals")).toBeVisible();
    await expect(page.getByText("Meal 1", { exact: false })).toBeVisible();
    // Jump to today button is visible since we're not on today.
    await expect(page.getByRole("button", { name: "Jump to today" })).toBeVisible();
  });
});
