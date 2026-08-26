import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

const fakeSupabase = await fs.readFile(new URL("../fixtures/fake-supabase.js", import.meta.url), "utf8");

test.beforeEach(async ({ page }) => {
  await page.route("**/vendor/supabase/supabase.js*", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: fakeSupabase })
  );
});

async function openSettings(page) {
  const direct = page.locator('[data-nav="settings"]:visible').first();
  if (await direct.count()) {
    await direct.click();
    return;
  }
  await page.locator("[data-action='open-more']:visible").click();
  await page.locator('#more-dialog [data-nav="settings"]:visible').click();
}

test("ciclo 22 para 21 atravessa o mês e persiste após rerender", async ({ page }) => {
  await page.goto("/?session=user");
  await expect(page.locator("#dashboard")).toBeVisible();
  await openSettings(page);

  const start = page.locator("#energy-cycle-start");
  const end = page.locator("#energy-cycle-end");
  await start.fill("22");
  await end.fill("21");

  await page.evaluate(() => document.querySelector('[data-accent-choice="azure"]')?.click());

  await expect(start).toHaveValue("22");
  await expect(end).toHaveValue("21");

  await page.locator("#cycles-form button[type='submit']").click();
  await expect(page.locator("#cycles-message")).toHaveText("Ciclos atualizados.");

  const saved = await page.evaluate(() => window.__voltFake.getSession().user.user_metadata.cycles.energy);
  expect(saved).toEqual({ start: 22, end: 21 });
});
