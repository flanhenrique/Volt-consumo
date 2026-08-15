import { test, expect } from "@playwright/test";

const MOBILE_SHELL_PROJECTS = new Set(["chromium-mobile", "webkit-iphone"]);

test("mobile shell is fixed, edge-to-edge and vertical-only", async ({ page }, testInfo) => {
  test.skip(!MOBILE_SHELL_PROJECTS.has(testInfo.project.name), "Mobile shell contract only");

  await page.goto("/");
  await expect(page.locator("#login-screen")).toBeVisible();

  await expect.poll(async () => page.locator('meta[name="viewport"]').getAttribute("content")).toContain("user-scalable=no");
  await expect(page.locator('link[data-volt-mobile-polish]')).toHaveAttribute("href", /mobile-polish\.css\?v=\d{8}\.\d+$/);

  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await expect.poll(async () => page.locator('meta[name="theme-color"]').getAttribute("content")).toBe("#000000");

  const metrics = await page.evaluate(() => {
    const login = document.getElementById("login-screen");
    const loginForm = document.getElementById("login-form");
    const email = document.getElementById("login-email");
    const viewport = document.querySelector('meta[name="viewport"]');
    const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const capable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
    const themeColor = document.querySelector('meta[name="theme-color"]');
    const consumptionCopy = document.querySelector("#page-consumption .page-header-copy > .supporting-copy");
    const moreEyebrow = document.querySelector("#more-dialog .dialog-heading .eyebrow");
    const moreClose = document.querySelector("#more-dialog .dialog-heading .icon-button");
    const loginHeadingCopy = document.querySelector(".auth-form-wrap > .section-heading .section-heading-copy");
    const loginHeading = document.querySelector(".auth-form-wrap > .section-heading");
    const loginBrandSymbol = document.querySelector(".auth-mobile-brand .brand-symbol");
    const rect = login.getBoundingClientRect();
    const formRect = loginForm.getBoundingClientRect();

    return {
      viewport: viewport?.content || "",
      statusBar: statusBar?.content || "",
      capable: capable?.content || "",
      themeColor: themeColor?.content || "",
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      loginFormTop: formRect.top,
      bodyTouchAction: getComputedStyle(document.body).touchAction,
      loginTouchAction: getComputedStyle(login).touchAction,
      inputFontSize: getComputedStyle(email).fontSize,
      loginOverflow: getComputedStyle(login).overflow,
      consumptionCopyDisplay: consumptionCopy ? getComputedStyle(consumptionCopy).display : "missing",
      moreEyebrowDisplay: moreEyebrow ? getComputedStyle(moreEyebrow).display : "missing",
      moreCloseWidth: moreClose ? parseFloat(getComputedStyle(moreClose).width) : 0,
      moreCloseHeight: moreClose ? parseFloat(getComputedStyle(moreClose).height) : 0,
      loginHeadingCopyDisplay: loginHeadingCopy ? getComputedStyle(loginHeadingCopy).display : "missing",
      loginHeadingPosition: loginHeading ? getComputedStyle(loginHeading).position : "missing",
      loginBrandWidth: loginBrandSymbol ? parseFloat(getComputedStyle(loginBrandSymbol).width) : 0
    };
  });

  expect(metrics.viewport).toContain("width=device-width");
  expect(metrics.viewport).toContain("maximum-scale=1");
  expect(metrics.viewport).toContain("viewport-fit=cover");
  expect(metrics.statusBar).toBe("black-translucent");
  expect(metrics.capable).toBe("yes");
  expect(metrics.themeColor).toBe("#000000");

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
  expect(metrics.loginHeadingCopyDisplay).toBe("none");
  expect(metrics.loginHeadingPosition).toBe("absolute");
  expect(metrics.loginBrandWidth).toBeGreaterThanOrEqual(53);
  expect(metrics.loginFormTop).toBeLessThan(metrics.innerHeight * .58);
  expect(metrics.consumptionCopyDisplay).toBe("none");
  expect(metrics.moreEyebrowDisplay).toBe("none");
  expect(metrics.moreCloseWidth).toBeGreaterThanOrEqual(44);
  expect(metrics.moreCloseHeight).toBeGreaterThanOrEqual(44);
});
