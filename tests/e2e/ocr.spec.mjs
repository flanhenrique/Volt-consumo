import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

const fakeSupabase = await fs.readFile(new URL("../fixtures/fake-supabase.js", import.meta.url), "utf8");
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=", "base64");

test.beforeEach(async ({ page }) => {
  await page.route("**/vendor/supabase/supabase.js*", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: fakeSupabase }));
  await page.route("https://*.supabase.co/rest/v1/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
});

test("OCR local abre preview, rejeita imagem inválida e exige revisão humana", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?session=user");
  await expect(page.locator("#dashboard")).toBeVisible();

  await page.locator("[data-action='open-reading']:visible").first().click();
  await expect(page.locator("[data-reading-panel='type']")).toBeVisible();
  await page.locator("[data-reading-panel='type']").getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator("[data-reading-panel='capture']")).toBeVisible();

  await page.locator("#reading-photo").setInputFiles({
    name: "imagem-invalida.png",
    mimeType: "image/png",
    buffer: onePixelPng
  });

  await expect(page.locator("#meter-preview")).toBeVisible();
  await expect(page.locator("#ocr-message")).toContainText(/visor|imagem|foto|revis|manual|não consegui/i, { timeout: 15000 });

  await page.locator("[data-reading-panel='capture']").getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator("[data-reading-panel='review']")).toBeVisible();
  await expect(page.locator("#reading-value")).toHaveValue("");
  await expect(page.locator("#reading-reviewed")).not.toBeChecked();
  expect(pageErrors).toEqual([]);
});
