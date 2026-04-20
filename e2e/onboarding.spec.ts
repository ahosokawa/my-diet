import { test, expect } from "@playwright/test";

test("fresh user completes intake and lands on /today", async ({ page }) => {
  await page.goto("/intake");

  await expect(
    page.getByRole("heading", { name: "What's your sex?" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "How old are you?" })
  ).toBeVisible();
  await expect(page.getByText("Age (years)")).toBeVisible();
  await page.getByRole("textbox").fill("30");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "How tall are you?" })
  ).toBeVisible();
  await expect(page.getByText("Feet")).toBeVisible();
  await expect(page.getByText("Inches")).toBeVisible();
  const heightInputs = page.getByRole("textbox");
  await expect(heightInputs).toHaveCount(2);
  await heightInputs.nth(0).fill("5");
  await heightInputs.nth(1).fill("10");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Current weight?" })
  ).toBeVisible();
  await expect(page.getByText("Pounds")).toBeVisible();
  const weightInputs = page.getByRole("textbox");
  await expect(weightInputs).toHaveCount(1);
  await weightInputs.fill("180");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Activity level" })
  ).toBeVisible();
  await page.getByRole("button", { name: /Moderate/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "What's your goal?" })
  ).toBeVisible();
  await page.getByRole("button", { name: /^Maintain/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Weekly schedule" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Daily calorie target" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Start tracking" }).click();

  await expect(page).toHaveURL(/\/today/);
  await expect(page.getByText("Daily totals")).toBeVisible();
  await expect(page.getByText("Meal 1", { exact: false })).toBeVisible();
  await expect(page.getByText("Meal 2", { exact: false })).toBeVisible();
  await expect(page.getByText("Meal 3", { exact: false })).toBeVisible();
});
