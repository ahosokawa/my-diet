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

// The meal autosaves on a debounce; wait for the sync indicator before
// reading IndexedDB or navigating.
async function waitSaved(page: Page) {
  await expect(page.locator("[data-sync-state]")).toHaveAttribute(
    "data-sync-state",
    "saved"
  );
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

  test("adding a food auto-balances and auto-logs; daily totals reflect it", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await expect(page).toHaveURL(/\/meals/);

    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);

    await expect(page.getByText(/Chicken breast \(cooked\)/)).toBeVisible();

    await waitSaved(page);
    await page.getByRole("button", { name: "Done" }).click();

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
    await waitSaved(page);
    await page.getByRole("button", { name: "Done" }).click();

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

  test("custom food form accepts decimal macros typed key-by-key", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 2/ }).click();
    await page.getByRole("button", { name: /Add food/ }).click();

    const picker = page.getByRole("dialog", { name: "Add food" });
    await picker.getByPlaceholder("Search foods…").fill("grandma granola");
    await picker
      .getByRole("button", { name: /Add "grandma granola" as custom food/ })
      .click();

    const customDialog = page.getByRole("dialog", { name: "Add custom food" });
    await expect(customDialog).toBeVisible();

    await customDialog.getByLabel("Serving size").fill("100");
    await customDialog.getByLabel("Calories per serving").fill("98");
    await customDialog.getByLabel("Protein per serving").fill("3");
    // pressSequentially (not fill) so each keystroke re-renders — the partial
    // entry "4." must survive for the decimal to be enterable at all.
    const fat = customDialog.getByLabel("Fat per serving");
    await fat.pressSequentially("4.5");
    await expect(fat).toHaveValue("4.5");
    await customDialog.getByLabel("Carbs per serving").pressSequentially("7.5");

    await customDialog.getByRole("button", { name: "Save" }).click();
    await expect(customDialog).not.toBeVisible();

    const foods = await readTable(page, "foods");
    const saved = foods.find((f: { name?: string }) => f.name === "grandma granola") as
      | { fatPer100: number; carbPer100: number }
      | undefined;
    expect(saved).toBeDefined();
    expect(saved!.fatPer100).toBe(4.5);
    expect(saved!.carbPer100).toBe(7.5);
  });

  test("auto-balance lands unlocked portions within ~5g of target", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();

    // Pick three foods that span the three macros — no Balance tap needed,
    // every add re-solves the meal.
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);
    await addFoodFromPicker(page, "avocado", /^Avocado/);

    // "saved" implies the final auto-balance render has committed — the
    // macro attributes below are read one-shot, without retry.
    await waitSaved(page);

    const targetCard = page.locator("[data-macro-row]");
    for (const macro of ["protein", "fat", "carbs"] as const) {
      const { current, target } = await readMacro(targetCard, macro);
      expect(
        Math.abs(current - target),
        `${macro}: current=${current} target=${target}`
      ).toBeLessThanOrEqual(5);
    }
  });

  test("editing grams auto-locks the food and rebalances the rest", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();

    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);

    const chickenRow = page.locator('[data-food-row][data-food-name="Chicken breast (cooked)"]');

    // Set chicken to 150g (press Enter to commit without a separate blur step).
    const chickenGrams = chickenRow.getByLabel("Grams");
    await chickenGrams.fill("150");
    await chickenGrams.press("Enter");

    // The edit auto-locks the food; the debounced rebalance of the other
    // foods must not touch it.
    await expect(chickenRow.getByRole("button", { name: "Locked" })).toBeVisible();
    await expect(chickenGrams).toHaveValue("150");

    // Poll the DB rather than the sync indicator: the indicator may still
    // read "saved" from the previous write when this save is still pending.
    await expect
      .poll(async () => {
        const logs = await readTable(page, "mealLogs");
        const meal1 = logs.find((l) => l.date === TODAY && l.index === 0);
        return meal1?.items.find((it) => it.grams === 150)?.locked;
      })
      .toBe(1);
    await expect(chickenGrams).toHaveValue("150");

    // Unlock and Balance: the solver is free to move chicken again.
    await chickenRow.getByRole("button", { name: "Locked" }).click();
    await page.getByRole("button", { name: "Balance" }).click();
    await expect(chickenGrams).not.toHaveValue("150");
  });

  test("re-opening a logged meal restores it and live-syncs changes", async ({ page }) => {
    // Build Meal 1 with chicken — it logs itself.
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await waitSaved(page);
    let logs = await readTable(page, "mealLogs");
    expect(logs).toHaveLength(1);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/today/);
    await expect(page.getByText("1 / 3 logged")).toBeVisible();

    // Re-enter Meal 1 — chicken pre-populated; adding rice syncs without any
    // explicit save action.
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await expect(
      page.locator('[data-food-row][data-food-name="Chicken breast (cooked)"]')
    ).toBeVisible();
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);
    await waitSaved(page);

    logs = await readTable(page, "mealLogs");
    const meal1 = logs.find((l) => l.date === TODAY && l.index === 0);
    expect(meal1?.items).toHaveLength(2);
    // Rice was solver-placed, not user-measured — it must not be locked.
    expect(meal1?.items.every((it) => it.locked === 0)).toBe(true);
  });

  test("Clear removes the meal from the log", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await waitSaved(page);
    expect(await readTable(page, "mealLogs")).toHaveLength(1);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect.poll(async () => (await readTable(page, "mealLogs")).length).toBe(0);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("0 / 3 logged")).toBeVisible();
  });

  test("removing the last food deletes the log row", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await waitSaved(page);
    expect(await readTable(page, "mealLogs")).toHaveLength(1);

    await page.getByRole("button", { name: "Remove" }).click();
    await expect.poll(async () => (await readTable(page, "mealLogs")).length).toBe(0);
  });

  test("navigating Back right after a change still persists it", async ({ page }) => {
    await page.getByRole("link", { name: /Meal 1/ }).click();
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);

    // Leave before the autosave debounce fires — the flush-on-exit must land it.
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/today/);
    await expect.poll(async () => (await readTable(page, "mealLogs")).length).toBe(1);
  });

  test("out-of-range meal index shows Meal not found instead of loading forever", async ({ page }) => {
    await page.goto(`/meals?d=${TODAY}&i=9`);
    await expect(page.getByText("Meal not found")).toBeVisible();
    await page.getByRole("button", { name: "Back to day" }).click();
    await expect(page).toHaveURL(/\/today/);
  });

  test("Back from a past day's meal returns to that day", async ({ page }) => {
    const yesterday = "2026-04-18";
    await page.goto(`/meals?d=${yesterday}&i=0`);
    await expect(page.getByRole("button", { name: /Add food/ })).toBeVisible();
    await page.getByRole("link", { name: "Back" }).click();
    // trailingSlash: true → /today/?d=...
    await expect(page).toHaveURL(new RegExp(`/today/?\\?d=${yesterday}`));
  });
});
