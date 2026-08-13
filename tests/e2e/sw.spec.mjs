import { expect, test } from "@playwright/test";

test("Service Worker: ativação, asset 404, offline e retorno online", async ({ page, context }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#login-screen")).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active))).toBe(true);
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.goto("/");
  await expect(page.locator("#login-screen")).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const errorCount = errors.length;
  const missing = await page.evaluate(async () => {
    const response = await fetch("/arquivo-ausente.js");
    return { status: response.status, type: response.headers.get("content-type") || "" };
  });
  expect(missing.status).toBe(404);
  expect(missing.type).not.toContain("text/html");
  const expected404 = errors.splice(errorCount);
  expect(expected404.every((message) => message.includes("404") && message.includes("Failed to load resource"))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#login-screen")).toBeVisible();
  await context.setOffline(false);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator("#login-screen")).toBeVisible();
  expect(errors).toEqual([]);
});
