import { test, expect, type Page } from "@playwright/test";
import { readTable } from "./support/db";

/**
 * Walk the intake flow through step 6 (schedule) with a fixed profile, stopping on
 * the calorie review screen (step 7). Caller chooses the goal + the final calorie option.
 */
async function walkToCalorieReview(page: Page, goalButtonRegex: RegExp) {
  await page.goto("/intake");

  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Age").fill("30");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Feet").fill("5");
  await page.getByLabel("Inches").fill("10");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Weight pounds").fill("180");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /Moderate/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: goalButtonRegex }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Schedule — accept defaults.
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Daily calorie target" })
  ).toBeVisible();
}

test("fresh user completes maintain path and lands on /today", async ({ page }) => {
  await walkToCalorieReview(page, /^Maintain/);
  await page.getByRole("button", { name: "Start tracking" }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText("Daily totals")).toBeVisible();
  await expect(page.getByText("Meal 1", { exact: false })).toBeVisible();
  await expect(page.getByText("Meal 2", { exact: false })).toBeVisible();
  await expect(page.getByText("Meal 3", { exact: false })).toBeVisible();

  const profile = (await readTable(page, "profile"))[0];
  expect(profile.goal).toBe("maintain");
});

test("cut path writes a deficit target", async ({ page }) => {
  await walkToCalorieReview(page, /Lose fat/);
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page).toHaveURL(/\/today/);

  const profile = (await readTable(page, "profile"))[0];
  const targets = await readTable(page, "targets");
  expect(profile.goal).toBe("cut");
  expect(targets).toHaveLength(1);
  // 180lb, male, moderate, 30y, 5'10" — maintenance ~2750 kcal. Cut should be under 2600.
  expect(targets[0].kcal).toBeLessThan(2600);
  expect(targets[0].proteinG).toBeGreaterThan(0);
});

test("bulk path writes a surplus target", async ({ page }) => {
  await walkToCalorieReview(page, /Gain muscle/);
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page).toHaveURL(/\/today/);

  const profile = (await readTable(page, "profile"))[0];
  const targets = await readTable(page, "targets");
  expect(profile.goal).toBe("bulk");
  expect(targets).toHaveLength(1);
  // Bulk should be above maintenance (~2750) → more than 2800.
  expect(targets[0].kcal).toBeGreaterThan(2800);
});

test("custom calorie override on the review screen persists", async ({ page }) => {
  await walkToCalorieReview(page, /^Maintain/);
  await page.getByLabel("Daily calories").fill("2500");
  await page.getByLabel("Daily calories").blur();
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page).toHaveURL(/\/today/);

  const targets = await readTable(page, "targets");
  expect(targets[0].kcal).toBe(2500);
  expect(targets[0].source).toBe("override");
  // A hand-typed number still anchors to the rate it implies.
  expect(targets[0].rateLbPerWeek).toBeLessThan(0);
});

test("rate slider drives the calorie target on the review screen", async ({ page }) => {
  await walkToCalorieReview(page, /^Maintain/);
  await page.getByLabel("Weekly rate of weight change").fill("-1");
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page).toHaveURL(/\/today/);

  const targets = await readTable(page, "targets");
  const profile = (await readTable(page, "profile"))[0];
  expect(targets[0].rateLbPerWeek).toBe(-1);
  // Maintenance ~2750 minus a 500 kcal/day deficit.
  expect(targets[0].kcal).toBeGreaterThan(2200);
  expect(targets[0].kcal).toBeLessThan(2300);
  // The goal follows the chosen rate even though "Maintain" was picked earlier.
  expect(profile.goal).toBe("cut");
});
