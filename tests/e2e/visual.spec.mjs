import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

const fakeSupabase = await fs.readFile(new URL("../fixtures/fake-supabase.js", import.meta.url), "utf8");
const viewports = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1024", width: 1024, height: 768 },
  { name: "desktop-1280", width: 1280, height: 800 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "wide-1920", width: 1920, height: 1080 }
];

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "capturas canônicas executam uma vez em Chromium");
  const failures = [];
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console.error: ${message.text()}`); });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    window.__voltUnhandled = [];
    window.addEventListener("unhandledrejection", (event) => window.__voltUnhandled.push(String(event.reason)));
  });
  await page.route("**/vendor/supabase/supabase.js*", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: fakeSupabase }));
  page.__voltFailures = failures;
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.project.name !== "chromium-desktop") return;
  const unhandled = await page.evaluate(() => window.__voltUnhandled || []).catch(() => []);
  expect([...page.__voltFailures, ...unhandled]).toEqual([]);
});

for (const viewport of viewports) {
  for (const theme of ["light", "dark"]) {
    test(`visual ${viewport.name} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript((selectedTheme) => localStorage.setItem("volt-theme", selectedTheme), theme);
      await page.goto("/?session=user");
      await expect(page.locator("#dashboard")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bottomNavigation: getComputedStyle(document.querySelector(".mobile-bottom-navigation")).display,
        sidebar: getComputedStyle(document.querySelector(".desktop-sidebar")).display
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
      if (viewport.width < 1024) {
        expect(metrics.bottomNavigation).not.toBe("none");
        expect(metrics.sidebar).toBe("none");
      } else {
        expect(metrics.bottomNavigation).toBe("none");
        expect(metrics.sidebar).not.toBe("none");
      }
      const path = testInfo.outputPath(`visual-${viewport.name}-${theme}.png`);
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(`visual-${viewport.name}-${theme}`, { path, contentType: "image/png" });
    });
  }
}

for (const viewport of [{ name: "login-mobile-390", width: 390, height: 844 }, { name: "login-desktop-1440", width: 1440, height: 900 }]) {
  for (const theme of ["light", "dark"]) {
    test(`visual ${viewport.name} ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.addInitScript((selectedTheme) => localStorage.setItem("volt-theme", selectedTheme), theme);
      await page.goto("/");
      await expect(page.locator("#login-screen")).toBeVisible();
      await expect(page.locator("#dashboard")).toBeHidden();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const path = testInfo.outputPath(`visual-${viewport.name}-${theme}.png`);
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(`visual-${viewport.name}-${theme}`, { path, contentType: "image/png" });
    });
  }
}
