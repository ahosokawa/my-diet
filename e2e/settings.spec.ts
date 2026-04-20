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

  test("switching goal from maintain → cut writes a new versioned targets row", async ({
    page,
  }) => {
    const targetsBefore = await readTable(page, "targets");
    const maintainKcal = targetsBefore[0].kcal;

    await page.getByRole("button", { name: "Edit goal" }).click();
    await page.getByRole("button", { name: "Lose fat" }).click();
    await page.getByRole("button", { name: "Save goal" }).click();

    await expect(page.getByText(/Lose fat/)).toBeVisible();

    const profile = (await readTable(page, "profile"))[0];
    expect(profile.goal).toBe("cut");

    const targetsAfter = await readTable(page, "targets");
    expect(targetsAfter).toHaveLength(2);
    const latest = [...targetsAfter].sort((a, b) =>
      a.dateEffective.localeCompare(b.dateEffective)
    )[targetsAfter.length - 1];
    expect(latest.dateEffective).toBe(TODAY);
    expect(latest.source).toBe("auto");
    // Cut should land under the maintain baseline.
    expect(latest.kcal).toBeLessThan(maintainKcal);
    // Macros must be present and positive.
    expect(latest.proteinG).toBeGreaterThan(0);
    expect(latest.fatG).toBeGreaterThan(0);
    expect(latest.carbG).toBeGreaterThan(0);
  });
});
