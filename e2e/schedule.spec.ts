import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeDay3MidWeek } from "./support/fixtures";

// 2026-04-19 is a Sunday (weekday 0).
const TODAY = "2026-04-19";
const SUNDAY = 0;

test.describe("Schedule editing", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
  });

  test("sets a workout window, saves, and flags post-workout meal on /today", async ({
    page,
  }) => {
    await page.goto("/schedule");

    // Expand Sunday.
    await page.getByRole("button", { name: /^Sun\b/ }).click();

    // Set workout 10:00 for 60 min — meal 2 at 12:30 becomes post-workout.
    const timeInputs = page.locator('input[type="time"]');
    // Inputs: 3 meal times + 1 workout start = 4.
    await timeInputs.nth(3).fill("10:00");
    await page.getByPlaceholder("min").fill("60");

    await page.getByRole("button", { name: /^Save schedule$/ }).click();
    await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();

    const schedule = await readTable(page, "schedule");
    const sun = schedule.find((d) => d.weekday === SUNDAY);
    expect(sun?.workoutStart).toBe("10:00");
    expect(sun?.workoutDurationMin).toBe(60);

    // Flag should appear on the 12:30 meal (index 1) on /today.
    await page.goto(`/today?d=${TODAY}`);
    const meal2 = page.getByRole("link", { name: /Meal 2/ });
    await expect(meal2.getByText(/Post-workout/i)).toBeVisible();
    const meal1 = page.getByRole("link", { name: /Meal 1/ });
    await expect(meal1.getByText(/Post-workout/i)).not.toBeVisible();
  });

  test("copy-to-days propagates workout to selected weekdays", async ({ page }) => {
    await page.goto("/schedule");

    // Set workout on Sunday, save, then copy to Tue + Thu (Sunday stays expanded).
    await page.getByRole("button", { name: /^Sun\b/ }).click();
    await page.locator('input[type="time"]').nth(3).fill("10:00");
    await page.getByPlaceholder("min").fill("60");
    await page.getByRole("button", { name: /^Save schedule$/ }).click();
    await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();

    await page.getByRole("button", { name: /Copy this day to/ }).click();
    const sheet = page.getByRole("dialog", { name: /Copy Sun to/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /^T Tue$/ }).click();
    await sheet.getByRole("button", { name: /^T Thu$/ }).click();
    // iPhone-15 (WebKit) emulated viewport renders the Sheet's sticky footer
    // just below the viewport edge; force-click to skip the viewport check.
    await sheet.getByRole("button", { name: /Paste to 2/ }).click({ force: true });
    await expect(sheet).not.toBeVisible();

    // Paste persists internally; poll the DB until Tue has the workout.
    await expect
      .poll(async () => {
        const schedule = await readTable(page, "schedule");
        return schedule.find((d) => d.weekday === 2)?.workoutStart;
      })
      .toBe("10:00");

    const schedule = await readTable(page, "schedule");
    const thu = schedule.find((d) => d.weekday === 4);
    const mon = schedule.find((d) => d.weekday === 1);
    expect(thu?.workoutStart).toBe("10:00");
    expect(mon?.workoutStart).toBeUndefined();
  });
});
