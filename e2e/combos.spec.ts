import { test, expect, type Page } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

async function addFoodFromPicker(page: Page, query: string, nameRegex: RegExp) {
  await page.getByRole("button", { name: /Add food/ }).click();
  const picker = page.getByRole("dialog", { name: "Add food" });
  await picker.getByPlaceholder("Search foods…").fill(query);
  await picker.getByRole("button", { name: nameRegex }).first().click();
  // Close via Escape: on Playwright's Pixel 7 viewport the large-detent Sheet
  // sometimes renders its footer just below viewport, making the Done button
  // unclickable. Escape triggers the same onClose path.
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
}

test.describe("Combos", () => {
  test.beforeEach(async ({ page }) => {
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
  });

  test("save, load into another meal, delete", async ({ page }) => {
    // Build Meal 1 with chicken + rice and save as a combo.
    await page.goto(`/meals?d=${TODAY}&i=0`);
    await expect(page.getByText("Target")).toBeVisible();

    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);

    await page.getByRole("button", { name: /^Save$/ }).click();
    const saveDialog = page.getByRole("dialog", { name: "Save as combo" });
    await expect(saveDialog).toBeVisible();
    await saveDialog.getByLabel("Combo name").fill("Chicken & Rice");
    await saveDialog.getByRole("button", { name: "Save" }).click();
    await expect(saveDialog).not.toBeVisible();

    const combos = await readTable(page, "combos");
    expect(combos).toHaveLength(1);
    expect(combos[0].name).toBe("Chicken & Rice");
    expect(combos[0].items).toHaveLength(2);

    // Open Meal 2 fresh — Load combo button should appear now.
    await page.goto(`/meals?d=${TODAY}&i=1`);
    await page.getByRole("button", { name: /Load combo/ }).click();
    const combosSheet = page.getByRole("dialog", { name: "Combos" });
    await expect(combosSheet).toBeVisible();
    await combosSheet.getByRole("button", { name: /Chicken & Rice/ }).click();
    await expect(combosSheet).not.toBeVisible();

    // Foods land on the meal.
    await expect(
      page.locator('[data-food-row][data-food-name="Chicken breast (cooked)"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-food-row][data-food-name="White rice (cooked)"]')
    ).toBeVisible();

    // Delete the combo — Load combo button disappears when there are none left.
    await page.getByRole("button", { name: /Load combo/ }).click();
    await combosSheet.getByRole("button", { name: "Delete combo" }).click();
    const after = await readTable(page, "combos");
    expect(after).toHaveLength(0);
  });
});
