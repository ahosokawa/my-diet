import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

test.describe("Meal logging", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(`${TODAY}T10:00:00`) });
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.clock.resume();
    await page.goto(`/today?d=${TODAY}`);
    await expect(page.getByText("Daily totals")).toBeVisible();
  });

  test("logs a meal via search and balance", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await expect(page).toHaveURL(/\/meals/);

    await page.getByRole("button", { name: /Add food/ }).click();
    const picker = page.getByRole("dialog", { name: "Add food" });
    await picker.getByPlaceholder("Search foods…").fill("chicken breast");
    await picker
      .getByRole("button", { name: /^Chicken breast \(cooked\)/ })
      .first()
      .click();
    await picker.getByRole("button", { name: /^Done/ }).click();
    await expect(picker).not.toBeVisible();

    await expect(page.getByText(/Chicken breast \(cooked\)/)).toBeVisible();

    await page.getByRole("button", { name: "Balance" }).click();
    await page.getByRole("button", { name: "Log meal" }).click();

    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("1 / 3 logged")).toBeVisible();
  });

  test("creates a custom food inline and logs it", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 2/ }).click();
    await page.getByRole("button", { name: /Add food/ }).click();

    const picker = page.getByRole("dialog", { name: "Add food" });
    await picker.getByPlaceholder("Search foods…").fill("homemade shake");
    await picker
      .getByRole("button", { name: /Add "homemade shake" as custom food/ })
      .click();

    const customDialog = page.getByRole("dialog", { name: "Add custom food" });
    await expect(customDialog).toBeVisible();

    const inputs = customDialog.locator("input");
    // 0: Name (pre-filled from search), 1: Serving size, 2: Calories, 3: Protein, 4: Fat, 5: Carbs, 6: Category
    await expect(inputs.nth(0)).toHaveValue("homemade shake");
    await inputs.nth(1).fill("200");
    await inputs.nth(2).fill("300");
    await inputs.nth(3).fill("25");
    await inputs.nth(4).fill("10");
    await inputs.nth(5).fill("30");

    await customDialog.getByRole("button", { name: "Save" }).click();
    await expect(customDialog).not.toBeVisible();

    await picker.getByRole("button", { name: /^Done/ }).click();
    await expect(picker).not.toBeVisible();

    await expect(page.getByText(/homemade shake/)).toBeVisible();
    await page.getByRole("button", { name: "Log meal" }).click();

    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("1 / 3 logged")).toBeVisible();

    // Custom food persists in the library — reopen picker on another meal
    await page.getByRole("link", { name: /Meal 3/ }).click();
    await page.getByRole("button", { name: /Add food/ }).click();
    const picker2 = page.getByRole("dialog", { name: "Add food" });
    await picker2.getByPlaceholder("Search foods…").fill("homemade");
    await expect(
      picker2.getByRole("button", { name: /homemade shake/i })
    ).toBeVisible();
  });
});
