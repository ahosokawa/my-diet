import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeDay3MidWeek } from "./support/fixtures";

const TODAY = "2026-04-19";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  });

  test("editing profile saves and does not touch targets", async ({ page }) => {
    const targetsBefore = await readTable(page, "targets");
    expect(targetsBefore).toHaveLength(1);

    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByLabel("Age").fill("31");
    await page.getByRole("button", { name: "Save profile" }).click();

    await expect(page.getByText(/31y/)).toBeVisible();

    const profile = (await readTable(page, "profile"))[0];
    expect(profile.age).toBe(31);

    // Profile edit is deliberately non-recomputing — targets rows unchanged.
    const targetsAfter = await readTable(page, "targets");
    expect(targetsAfter).toHaveLength(1);
    expect(targetsAfter[0].kcal).toBe(targetsBefore[0].kcal);
  });

  test("dragging the rate slider to a deficit writes a new versioned targets row", async ({
    page,
  }) => {
    const targetsBefore = await readTable(page, "targets");
    const maintainKcal = targetsBefore[0].kcal;

    await page.getByRole("button", { name: "Edit goal" }).click();
    await page.getByLabel("Weekly rate of weight change").fill("-1");
    await page.getByRole("button", { name: "Save goal" }).click();

    // Wait for the form to collapse before matching the summary — while it is
    // open the editor shows its own "Lose fat · …%" line and the loose match
    // is a strict-mode violation.
    await expect(page.getByRole("button", { name: "Save goal" })).toBeHidden();
    await expect(page.getByText(/Lose fat · [\d,]+ kcal/)).toBeVisible();

    // The goal label follows the rate — no separate goal picker any more.
    const profile = (await readTable(page, "profile"))[0];
    expect(profile.goal).toBe("cut");
    expect(profile.goalStartDate).toBe(TODAY);

    const targetsAfter = await readTable(page, "targets");
    expect(targetsAfter).toHaveLength(2);
    const latest = [...targetsAfter].sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targetsAfter.length - 1];
    expect(latest.dateEffective).toBe(TODAY);
    // A hand-picked pace, not the goal default.
    expect(latest.source).toBe("override");
    expect(latest.rateLbPerWeek).toBe(-1);
    // 180 lb, male, moderate, 30y, 5'10" — maintenance ~2760, so -1 lb/wk is a
    // 500 kcal/day deficit off *maintenance*, not off the seeded target.
    expect(latest.kcal).toBeLessThan(maintainKcal);
    expect(latest.kcal).toBeGreaterThan(2200);
    expect(latest.kcal).toBeLessThan(2300);
    // Macros must be present and positive.
    expect(latest.proteinG).toBeGreaterThan(0);
    expect(latest.fatG).toBeGreaterThan(0);
    expect(latest.carbG).toBeGreaterThan(0);
  });

  test("typing a calorie number re-anchors the rate", async ({ page }) => {
    await page.getByRole("button", { name: "Edit goal" }).click();
    await page.getByLabel("Daily calories").fill("2000");
    await page.getByLabel("Daily calories").blur();
    await page.getByRole("button", { name: "Save goal" }).click();
    // The form collapses once the write lands.
    await expect(page.getByRole("button", { name: "Save goal" })).toBeHidden();

    const targetsAfter = await readTable(page, "targets");
    const latest = [...targetsAfter].sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targetsAfter.length - 1];
    expect(latest.kcal).toBe(2000);
    // 180 lb, male, moderate, 30y, 5'10" — maintenance ~2750, so 2000 kcal is
    // roughly a 1.5 lb/wk deficit. Stored so the number survives weight change.
    expect(latest.rateLbPerWeek).toBeLessThan(-1.4);
    expect(latest.rateLbPerWeek).toBeGreaterThan(-1.6);
  });
});
