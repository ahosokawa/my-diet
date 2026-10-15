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
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
}

async function waitSaved(page: Page) {
  await expect(page.locator("[data-sync-state]")).toHaveAttribute(
    "data-sync-state",
    "saved"
  );
}

// "<kcal> <P>P <F>F <C>C" off a Today card.
async function cardProtein(page: Page, selector: string): Promise<number> {
  const text = await page.locator(selector).innerText();
  const m = text.match(/(\d+)P/);
  if (!m) throw new Error(`no protein on card: ${text}`);
  return Number(m[1]);
}

test.describe("Snacks", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.goto(`/today?d=${TODAY}`);
    await expect(page.getByText("Daily totals")).toBeVisible();
  });

  test("a logged snack shrinks the empty meals and counts toward daily totals", async ({ page }) => {
    const before = await cardProtein(page, '[data-meal-card="1"]');

    await page.getByRole("link", { name: "Snack", exact: true }).click();
    await expect(page).toHaveURL(/snack=new/);
    // No solver or locks in snack mode.
    await expect(page.getByRole("button", { name: "Balance" })).toHaveCount(0);

    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await expect(page.getByRole("button", { name: /Lock/ })).toHaveCount(0);
    await waitSaved(page);

    const snacks = await readTable(page, "snacks");
    expect(snacks).toHaveLength(1);
    expect(snacks[0].date).toBe(TODAY);
    expect(snacks[0].time).toBe("10:00");
    expect(snacks[0].proteinG).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/today/);
    await expect(page.locator("[data-snack-card]")).toHaveCount(1);
    // Snacks aren't meals.
    await expect(page.getByText("0 / 3 logged")).toBeVisible();

    const after = await cardProtein(page, '[data-meal-card="1"]');
    expect(after).toBeLessThan(before);
  });

  test("further edits update the same snack row; clearing deletes it", async ({ page }) => {
    await page.getByRole("link", { name: "Snack", exact: true }).click();
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await waitSaved(page);
    await addFoodFromPicker(page, "white rice", /^White rice \(cooked\)/);
    await expect
      .poll(async () => (await readTable(page, "snacks"))[0]?.items.length)
      .toBe(2);
    expect(await readTable(page, "snacks")).toHaveLength(1);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect.poll(async () => (await readTable(page, "snacks")).length).toBe(0);
  });

  test("snacks sit between meals in time order and reopen for editing", async ({ page }) => {
    await page.getByRole("link", { name: "Snack", exact: true }).click();
    await page.getByLabel("Snack time").fill("23:30");
    await addFoodFromPicker(page, "chicken breast cooked", /^Chicken breast \(cooked\)/);
    await waitSaved(page);
    await page.getByRole("button", { name: "Done" }).click();

    // After every meal in the day.
    const cards = page.locator("[data-meal-card], [data-snack-card]");
    await expect(cards.last()).toHaveAttribute("data-snack-card");
    await expect(cards.last()).toContainText("23:30");

    await cards.last().click();
    await expect(page).toHaveURL(/snack=\d+/);
    await expect(
      page.locator('[data-food-row][data-food-name="Chicken breast (cooked)"]')
    ).toBeVisible();
    await expect(page.getByLabel("Snack time")).toHaveValue("23:30");
  });

  test("going over a macro flags it on the daily totals", async ({ page }) => {
    await page.getByRole("link", { name: "Snack", exact: true }).click();
    await addFoodFromPicker(page, "olive oil", /^Olive oil/);
    const grams = page.locator("[data-food-row]").getByLabel("Grams");
    await grams.fill("200");
    await grams.press("Enter");
    await expect
      .poll(async () => (await readTable(page, "snacks"))[0]?.items[0]?.grams)
      .toBe(200);
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.locator("[data-overage]")).toContainText(/Fat over by \d+g/);
    await expect(page.locator("[data-overage]")).toContainText("remaining meals get 0g fat");
  });
});
