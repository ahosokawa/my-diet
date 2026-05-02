import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeWeek2ReviewReady } from "./support/fixtures";

const SUNDAY = "2026-04-19"; // window open
const TUESDAY = "2026-04-21"; // window closed

test.describe("Weekly review — open window (Sun)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${SUNDAY}T10:00:00`));
    await seedEnvelope(page, makeWeek2ReviewReady({ today: SUNDAY }).tables);
    await page.goto(`/review`);
    await expect(page.getByRole("heading", { name: "Cut a bit" })).toBeVisible();
  });

  test("applies the auto verdict and stamps lastReviewedDate", async ({ page }) => {
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

    const profile = await readTable(page, "profile");
    expect(profile[0].lastReviewedDate).toBe(SUNDAY);
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

  test("Stay button keeps current kcal", async ({ page }) => {
    await page.getByRole("button", { name: "Stay" }).click();
    await expect(page).toHaveURL(/\/today/);

    const targets = await readTable(page, "targets");
    expect(targets).toHaveLength(2);
    const latest = [...targets].sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targets.length - 1];
    expect(latest.kcal).toBe(2400); // unchanged from current
    expect(latest.source).toBe("stay");
  });

  test("done summary appears after apply; Change my mind replaces pending row", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /^Apply$/ }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto(`/review`);
    await expect(
      page.getByRole("heading", { name: "Cut a bit" })
    ).toBeVisible();
    await expect(page.getByText(/This week's choice/)).toBeVisible();

    await page.getByRole("button", { name: "Change my mind" }).click();
    await page.getByRole("button", { name: "Stay" }).click();
    await expect(page).toHaveURL(/\/today/);

    const targets = await readTable(page, "targets");
    expect(targets).toHaveLength(2); // original + one replaced pending row
    const latest = [...targets].sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targets.length - 1];
    expect(latest.kcal).toBe(2400);
    expect(latest.source).toBe("stay");
  });
});

test.describe("Weekly review — closed window (Tue)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TUESDAY}T10:00:00`));
    await seedEnvelope(page, makeWeek2ReviewReady({ today: TUESDAY }).tables);
  });

  test("Today hides the check-in CTA Mon–Thu", async ({ page }) => {
    await page.goto(`/today`);
    await expect(page.getByText("Weekly check-in")).toHaveCount(0);
  });

  test("/review shows next-check-in state Mon–Thu", async ({ page }) => {
    await page.goto(`/review`);
    await expect(page.getByText(/Next check-in/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cut a bit" })
    ).toHaveCount(0);
  });
});
