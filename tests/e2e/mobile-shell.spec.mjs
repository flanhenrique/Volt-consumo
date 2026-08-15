import { test, expect } from "@playwright/test";

const MOBILE_SHELL_PROJECTS = new Set(["chromium-mobile", "webkit-iphone"]);

test("mobile shell is fixed, edge-to-edge and vertical-only", async ({ page }, testInfo) => {
  test.skip(!MOBILE_SHELL_PROJECTS.has(testInfo.project.name), "Mobile shell contract only");

  await page.goto("/");
  await expect(page.locator("#login-screen")).toBeVisible();

  await expect.poll(async () => page.locator('meta[name="viewport"]').getAttribute("content")).toContain("user-scalable=no");
  await expect(page.locator('link[data-volt-mobile-polish]')).toHaveAttribute("href", /mobile-polish\.css\?v=20260815\.4/);

  const metrics = await page.evaluate(() => {
    const login = document.getElementById("login-screen");
    const email = document.getElementById("login-email");
    const viewport = document.querySelector('meta[name="viewport"]');
    const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const capable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    const consumptionCopy = document.querySelector("#page-consumption .page-header-copy > .supporting-copy");
    const moreEyebrow = document.querySelector("#more-dialog .dialog-heading .eyebrow");
    const moreClose = document.querySelector("#more-dialog .dialog-heading .icon-button");
    const rect = login.getBoundingClientRect();

    return {
      viewport: viewport?.content || "",
      statusBar: statusBar?.content || "",
      capable: capable?.content || "",
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      bodyTouchAction: getComputedStyle(document.body).touchAction,
      loginTouchAction: getComputedStyle(login).touchAction,
      inputFontSize: getComputedStyle(email).fontSize,
      loginOverflow: getComputedStyle(login).overflow,
      consumptionCopyDisplay: consumptionCopy ? getComputedStyle(consumptionCopy).display : "missing",
      moreEyebrowDisplay: moreEyebrow ? getComputedStyle(moreEyebrow).display : "missing",
      moreCloseWidth: moreClose ? getComputedStyle(moreClose).width : "missing"
    };
  });

  expect(metrics.viewport).toContain("width=device-width");
  expect(metrics.viewport).toContain("maximum-scale=1");
  expect(metrics.viewport).toContain("viewport-fit=cover");
  expect(metrics.statusBar).toBe("black-translucent");
  expect(metrics.capable).toBe("yes");

  expect(metrics.rect.x).toBeCloseTo(0, 0);
  expect(metrics.rect.y).toBeCloseTo(0, 0);
  expect(metrics.rect.width).toBeCloseTo(metrics.innerWidth, 0);
  expect(metrics.rect.height).toBeCloseTo(metrics.innerHeight, 0);
  expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(metrics.bodyTouchAction).toBe("pan-y");
  expect(metrics.loginTouchAction).toBe("none");
  expect(metrics.inputFontSize).toBe("16px");
  expect(metrics.loginOverflow).toBe("hidden");
  expect(metrics.consumptionCopyDisplay).toBe("none");
  expect(metrics.moreEyebrowDisplay).toBe("none");
  expect(metrics.moreCloseWidth).toBe("48px");
});
