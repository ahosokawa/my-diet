import { test, expect } from "@playwright/test";
import { seedEnvelope } from "./support/seed";
import { readTable } from "./support/db";
import { makeDay3MidWeek, makeFresh } from "./support/fixtures";
import type { Envelope } from "@/lib/backup/envelope";
import fs from "node:fs/promises";

const TODAY = "2026-04-19";

test.describe("Local backup file", () => {
  test("exports a valid envelope and restores it after a wipe", async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY, weightLb: 184 }).tables);

    await page.goto("/settings");
    await expect(page.getByText("Data & backup")).toBeVisible();

    // Export downloads a parseable envelope containing the seeded data.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download backup" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`my-diet-backup-${TODAY}.json`);
    const filePath = testInfo.outputPath("backup.json");
    await download.saveAs(filePath);
    const env = JSON.parse(await fs.readFile(filePath, "utf8")) as Envelope;
    expect(env.schemaVersion).toBeGreaterThan(0);
    expect(env.tables.profile[0]?.weightLb).toBe(184);
    expect(env.tables.foods.length).toBeGreaterThan(0);

    // Wipe local data, then import the downloaded file.
    await seedEnvelope(page, makeFresh().tables);
    await page.goto("/settings");

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Import…" }).click(),
    ]);
    await chooser.setFiles(filePath);

    const dialog = page.getByRole("dialog", { name: "Import backup file" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("backup.json")).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "Replace local data" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill("REPLACE");
    // A successful restore triggers location.reload(); wait for that load
    // event before touching the page again.
    await Promise.all([page.waitForEvent("load"), confirm.click()]);
    await expect(page.getByText("Data & backup")).toBeVisible();
    const profiles = await readTable(page, "profile");
    expect(profiles[0]?.weightLb).toBe(184);
    const foods = await readTable(page, "foods");
    expect(foods.length).toBe(env.tables.foods.length);
  });

  test("rejects a file that is not a backup", async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date(`${TODAY}T10:00:00`));
    await seedEnvelope(page, makeDay3MidWeek({ today: TODAY }).tables);
    await page.goto("/settings");
    await expect(page.getByText("Data & backup")).toBeVisible();

    const badPath = testInfo.outputPath("not-a-backup.json");
    await fs.writeFile(badPath, JSON.stringify({ hello: "world" }));

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Import…" }).click(),
    ]);
    await chooser.setFiles(badPath);

    const dialog = page.getByRole("dialog", { name: "Import backup file" });
    await dialog.getByRole("textbox").fill("REPLACE");
    await dialog.getByRole("button", { name: "Replace local data" }).click();

    await expect(dialog.getByText("Missing schemaVersion")).toBeVisible();
    // Local data untouched.
    const profiles = await readTable(page, "profile");
    expect(profiles).toHaveLength(1);
  });
});
