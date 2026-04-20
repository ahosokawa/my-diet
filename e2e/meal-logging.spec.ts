import { test, expect, type Page, type Locator } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable, readNumberAttr } from "./support/db";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

async function addFoodFromPicker(page: Page, query: string, nameRegex: RegExp) {
  await page.getByRole("button", { name: /Add food/ }).click();
  const picker = page.getByRole("dialog", { name: "Add food" });
  await picker.getByPlaceholder("Search foods…").fill(query);
  await picker.getByRole("button", { name: nameRegex }).first().click();
  // Close via Escape: on Playwright's Pixel 7 viewport the large-detent Sheet
  // sometimes renders its footer just below viewport, making Done unclickable.
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
}

async function readMacro(row: Locator, macro: "protein" | "fat" | "carbs") {
  const bar = row.locator(`[data-macro="${macro}"]`);
  await expect(bar).toBeVisible();
  return {
    current: await readNumberAttr(bar, "data-current"),
    target: await readNumberAttr(bar, "data-target"),
  };
}

test.describe("Meal logging", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.goto(`/today?d=${TODAY}`);
    await expect(page.getByText("Daily totals")).toBeVisible();
  });

  test("logs a meal via search and balance; daily totals reflect it", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await expect(page).toHaveURL(/\/meals/);

    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);

    await expect(page.getByText(/Chicken breast \(cooked\)/)).toBeVisible();

    await page.getByRole("button", { name: "Balance" }).click();
    await page.getByRole("button", { name: "Log meal" }).click();

    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("1 / 3 logged")).toBeVisible();

    // Daily totals reflect the logged macros (kcal > 0, protein > 0).
    const dailyTotals = page.locator("[data-macro-row]");
    expect(await readNumberAttr(dailyTotals, "data-kcal-current")).toBeGreaterThan(0);
    const protein = await readMacro(dailyTotals, "protein");
    expect(protein.current).toBeGreaterThan(0);
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

    await expect(customDialog.getByLabel("Food name")).toHaveValue("homemade shake");
    await customDialog.getByLabel("Serving size").fill("200");
    await customDialog.getByLabel("Calories per serving").fill("300");
    await customDialog.getByLabel("Protein per serving").fill("25");
    await customDialog.getByLabel("Fat per serving").fill("10");
    await customDialog.getByLabel("Carbs per serving").fill("30");

    await customDialog.getByRole("button", { name: "Save" }).click();
    await expect(customDialog).not.toBeVisible();

    // Same viewport-clipping workaround as addFoodFromPicker.
    await page.keyboard.press("Escape");
    await expect(picker).not.toBeVisible();

    await expect(page.getByText(/homemade shake/)).toBeVisible();
    await page.getByRole("button", { name: "Log meal" }).click();

    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("1 / 3 logged")).toBeVisible();

    // Custom food persists in the library — reopen picker on another meal.
    await page.getByRole("link", { name: /Meal 3/ }).click();
    await page.getByRole("button", { name: /Add food/ }).click();
    const picker2 = page.getByRole("dialog", { name: "Add food" });
    await picker2.getByPlaceholder("Search foods…").fill("homemade");
    await expect(
      picker2.getByRole("button", { name: /homemade shake/i })
    ).toBeVisible();
  });

  test("Balance lands unlocked portions within ~5g of target", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();

    // Pick three foods that span the three macros.
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);
    await addFoodFromPicker(page, "avocado", /^Avocado/);

    await page.getByRole("button", { name: "Balance" }).click();

    const targetCard = page.locator("[data-macro-row]");
    for (const macro of ["protein", "fat", "carbs"] as const) {
      const { current, target } = await readMacro(targetCard, macro);
      expect(
        Math.abs(current - target),
        `${macro}: current=${current} target=${target}`
      ).toBeLessThanOrEqual(5);
    }
  });

  test("locked food keeps its grams after Balance", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();

    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);

    const chickenRow = page.locator('[data-food-row][data-food-name="Chicken breast (cooked)"]');
    const riceRow = page.locator('[data-food-row][data-food-name="White rice (cooked)"]');

    // Set chicken to 150g (press Enter to commit without a separate blur step), then lock.
    const chickenGrams = chickenRow.getByLabel("Grams");
    await chickenGrams.fill("150");
    await chickenGrams.press("Enter");
    await expect(chickenGrams).toHaveValue("150");
    await chickenRow.getByRole("button", { name: /Lock|Locked/ }).click();
    await expect(chickenRow.getByRole("button", { name: "Locked" })).toBeVisible();

    // Rice starts at the default 100g. Balance should move it to hit the carbs target
    // (meal 1 protein/fat is already near-exceeded by 150g chicken → solver maxes carbs).
    await expect(riceRow.getByLabel("Grams")).toHaveValue("100");
    await page.getByRole("button", { name: "Balance" }).click();

    // Chicken stays at 150 (locked); rice moved somewhere other than 100.
    await expect(chickenRow.getByLabel("Grams")).toHaveValue("150");
    await expect(riceRow.getByLabel("Grams")).not.toHaveValue("100");
  });

  test("re-opening a logged meal shows Update meal and persists changes", async ({ page }) => {
    // Log Meal 1 with chicken.
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await page.getByRole("button", { name: "Log meal" }).click();
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("1 / 3 logged")).toBeVisible();

    // Re-enter Meal 1 — should be in "update" mode with chicken pre-populated.
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await expect(
      page.locator('[data-food-row][data-food-name="Chicken breast (cooked)"]')
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Update meal" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log meal" })).not.toBeVisible();

    // Add rice and persist.
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);
    await page.getByRole("button", { name: "Update meal" }).click();
    await expect(page).toHaveURL(/\/today/);

    // Still 1/3 logged, but the single log now holds two items.
    await expect(page.getByText("1 / 3 logged")).toBeVisible();
    const logs = await readTable(page, "mealLogs");
    const meal1 = logs.find((l) => l.date === TODAY && l.index === 0);
    expect(meal1?.items).toHaveLength(2);
  });
});
