import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

const fakeSupabase = await fs.readFile(new URL("../fixtures/fake-supabase.js", import.meta.url), "utf8");
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZfWQAAAAASUVORK5CYII=", "base64");

test.beforeEach(async ({ page }) => {
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

test.afterEach(async ({ page }) => {
  const unhandled = await page.evaluate(() => window.__voltUnhandled || []).catch(() => []);
  expect([...page.__voltFailures, ...unhandled], "zero console.error, pageerror e unhandledrejection").toEqual([]);
});

async function navigateTo(page, destination) {
  const direct = page.locator(`[data-nav="${destination}"]:visible`).first();
  if (await direct.count()) {
    await direct.click();
    return;
  }
  await page.locator("[data-action='open-more']:visible").click();
  await page.locator(`#more-dialog [data-nav="${destination}"]:visible`).click();
}

async function assertMaintenanceRemoved(page) {
  await expect(page.locator("#maintenance-screen")).toHaveCount(0);
}

async function signIn(page) {
  await page.goto("/");
  await assertMaintenanceRemoved(page);
  await page.locator("#login-email").fill("ana@volt.test");
  await page.locator("#login-password").fill("senha-segura-123");
  await page.locator("#login-form").getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#dashboard")).toBeVisible();
}

test("A — usuário deslogado vê somente Login", async ({ page }) => {
  await page.goto("/");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#login-screen")).toBeVisible();
  await expect(page.locator("#dashboard")).toBeHidden();
  await expect(page.locator("#boot-screen")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Entrar no Volt" })).toBeVisible();
});

test("B/D — sessão restaurada só revela Home consolidada", async ({ page }) => {
  await page.addInitScript(() => {
    window.__voltRestoreSurfaces = [];
    window.addEventListener("volt:startup-status", (event) => {
      const visible = ["login-screen", "mfa-screen", "error-screen", "dashboard"].filter((id) => {
        const element = document.getElementById(id);
        return element && getComputedStyle(element).display !== "none";
      });
      window.__voltRestoreSurfaces.push({ status: event.detail.status, visible });
    });
  });
  const releaseRequests = new Map();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["/app.js", "/src/renderer.js", "/src/app-state.js", "/src/volt-service.js"].includes(url.pathname)) {
      releaseRequests.set(url.pathname, url.searchParams.get("v"));
    }
  });
  await page.goto("/?session=user&dataDelay=180");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#login-screen")).toBeHidden();
  await expect(page.locator("#greeting")).toHaveText("Olá, Ana Volt!");
  await expect(page.locator("#home-energy-consumption")).not.toHaveText("");
  await expect(page.locator("#home-water-consumption")).not.toHaveText("");
  await expect(page.getByText("Tarifas e encargos")).toHaveCount(0);
  await expect(page.getByText("Organização ativa")).toHaveCount(0);
  await expect(page.getByText("Contas", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ciclos anteriores", { exact: true })).toHaveCount(0);
  const visibility = await page.evaluate(() => ["login-screen", "mfa-screen", "error-screen", "dashboard"].filter((id) => {
    const element = document.getElementById(id);
    return element && getComputedStyle(element).display !== "none";
  }));
  expect(visibility).toEqual(["dashboard"]);
  const restoreTransitions = await page.evaluate(() => window.__voltRestoreSurfaces.filter(({ status }) =>
    ["BOOTING", "RESTORING_SESSION", "LOADING_ACCOUNT", "LOADING_DATA"].includes(status)));
  expect(restoreTransitions.length).toBeGreaterThan(0);
  expect(restoreTransitions.every(({ visible }) => visible.length === 1 && visible[0] === "login-screen")).toBe(true);
  expect(Object.fromEntries(releaseRequests)).toEqual({
    "/app.js": "20260813.7",
    "/src/app-state.js": "20260813.7",
    "/src/renderer.js": "20260813.7",
    "/src/volt-service.js": "20260813.7"
  });
});

test("C/I — login e logout seguem uma única transição", async ({ page }) => {
  await signIn(page);
  if (page.viewportSize().width < 1024) {
    await page.locator("[data-action='open-more']:visible").click();
    await page.locator("#mobile-logout").click();
  } else {
    await page.locator("#logout").click();
  }
  await expect(page.locator("#dashboard")).toBeHidden();
  await expect(page.locator("#login-screen")).toBeVisible();
  expect(await page.evaluate(() => window.__voltFake.getSession())).toBeNull();
});

test("Login permanece visível até a Home estar pronta", async ({ page }) => {
  await page.goto("/?dataDelay=180");
  await page.evaluate(() => {
    window.__voltTransitionSurfaces = [];
    window.addEventListener("volt:startup-status", (event) => {
      const visible = ["login-screen", "mfa-screen", "error-screen", "dashboard"].filter((id) => {
        const element = document.getElementById(id);
        return element && getComputedStyle(element).display !== "none";
      });
      window.__voltTransitionSurfaces.push({ status: event.detail.status, visible });
    });
  });
  await page.locator("#login-email").fill("ana@volt.test");
  await page.locator("#login-password").fill("senha-segura-123");
  await page.locator("#login-submit").click();

  await expect(page.locator("#login-screen")).toBeVisible();
  await expect(page.locator("#login-progress")).toBeVisible();
  await expect(page.locator("#login-message")).toContainText(/Validando sua conta|Carregando seus dados/);
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#login-screen")).toBeHidden();

  const loadingTransitions = await page.evaluate(() => window.__voltTransitionSurfaces.filter(({ status }) =>
    ["LOADING_ACCOUNT", "LOADING_DATA"].includes(status)));
  expect(loadingTransitions.length).toBeGreaterThan(0);
  expect(loadingTransitions.every(({ visible }) => visible.length === 1 && visible[0] === "login-screen")).toBe(true);
});

test("C — MFA bloqueia o Dashboard até AAL2", async ({ page }) => {
  await page.goto("/?session=mfa");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#mfa-screen")).toBeVisible();
  await expect(page.locator("#dashboard")).toBeHidden();
  await page.locator("#mfa-code").fill("123456");
  await page.locator("#mfa-form").getByRole("button", { name: "Verificar" }).click();
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#mfa-screen")).toBeHidden();
});

test("E — registrar leitura preserva a Home", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await navigateTo(page, "readings");
  await page.locator("#page-readings [data-action='open-reading']").first().click();
  await page.locator("#reading-type").selectOption("energy");
  await page.locator("#reading-value").fill("1130");
  await page.locator("#reading-date").fill("2026-08-10T12:00");
  await page.locator("#reading-reviewed").check();
  await page.locator("#reading-form").getByRole("button", { name: "Confirmar leitura" }).click();
  await expect(page.locator("#reading-dialog")).not.toHaveAttribute("open", "");
  await navigateTo(page, "home");
  await expect(page.locator("#home-energy-consumption")).not.toHaveText("");
  await expect(page.locator("#dashboard")).toBeVisible();
});

test("OCR é lazy, mostra preview e exige revisão humana", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await page.locator("[data-action='open-reading']:visible").first().click();
  await page.locator("#reading-photo").setInputFiles({ name: "medidor.png", mimeType: "image/png", buffer: onePixelPng });
  await expect(page.locator("#meter-preview")).toBeVisible();
  await expect(page.locator("#ocr-message")).toContainText(/revise|Digite|disponível/i);
  await expect(page.locator("#reading-value")).toHaveValue("");
  await expect(page.locator("#reading-reviewed")).not.toBeChecked();
});

test("F — nome e e-mail persistem após reload", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await navigateTo(page, "settings");
  await expect(page.locator("#account-email")).toHaveValue("ana@volt.test");
  await page.locator("#display-name").fill("Ana Persistente");
  await page.locator("#account-form").getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.locator("#account-message")).toHaveText("Nome atualizado.");
  await page.reload();
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#greeting")).toHaveText("Olá, Ana Persistente!");
  await navigateTo(page, "settings");
  await expect(page.locator("#display-name")).toHaveValue("Ana Persistente");
  await expect(page.locator("#account-email")).toHaveValue("ana@volt.test");
});

test("G — Usuários aparece por permissão e reabre sem destruir DOM", async ({ page }) => {
  await page.goto("/?session=admin");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await navigateTo(page, "users");
  await expect(page.locator("#users-list .user-account-item")).toHaveCount(3);
  await expect(page.locator("#users-total")).toHaveText("3");
  await expect(page.locator("#users-confirmed")).toHaveText("2");
  await expect(page.locator("#page-users").getByText("Organização", { exact: false })).toHaveCount(0);
  await expect(page.getByText("ana@example.com")).toBeVisible();
  await page.locator("#invite-user").click();
  await page.locator("#invite-email").fill("novo@volt.test");
  await page.locator("#invite-form").getByRole("button", { name: "Criar convite" }).click();
  await expect(page.locator("#invite-message")).toHaveText("Convite criado por 48 horas.");
  await page.locator("[data-close-dialog='invite-dialog']").click();
  await page.locator("#page-users").evaluate((element) => { element.dataset.ownershipProbe = "same-node"; });
  await navigateTo(page, "home");
  await navigateTo(page, "users");
  await expect(page.locator("#users-list .user-account-item")).toHaveCount(3);
  await expect(page.locator("#page-users")).toHaveAttribute("data-ownership-probe", "same-node");
});

test("H — Relatórios existe e permanece vazio", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await navigateTo(page, "reports");
  await expect(page.locator("#page-reports")).toBeVisible();
  await expect(page.locator("#page-reports")).toBeEmpty();
});

test("Consumo, Alertas e Ajuda navegam com um único outlet", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await navigateTo(page, "consumption");
  await expect(page.locator("#page-consumption")).toBeVisible();
  await expect(page.locator("#consumption-cost")).not.toHaveText("");
  await page.getByRole("button", { name: "Água", exact: true }).first().click();
  await expect(page.locator("[data-consumption-type='water']")).toHaveAttribute("aria-pressed", "true");
  await navigateTo(page, "alerts");
  await expect(page.locator("#page-alerts")).toBeVisible();
  await navigateTo(page, "help");
  await expect(page.locator("#page-help")).toBeVisible();
  const visiblePages = await page.locator("[data-page]:visible").count();
  expect(visiblePages).toBe(1);
});

test("Tema claro, escuro e sistema compartilham o mesmo DOM", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  await navigateTo(page, "settings");
  await page.locator("[data-theme-choice='dark']").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("[data-theme-choice='light']").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator("[data-theme-choice='system']").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await page.locator("[data-accent-choice='violet']").click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await expect(page.locator("[data-accent-choice='violet']")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await navigateTo(page, "settings");
  await expect(page.locator("[data-accent-choice='violet']")).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#dashboard").count()).toBe(1);
});

test("layout não cria overflow horizontal", async ({ page }) => {
  await page.goto("/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page.locator("#dashboard")).toBeVisible();
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 1);
});

test("/beta é somente compatibilidade", async ({ page }) => {
  await page.goto("/beta/?session=user");
  await assertMaintenanceRemoved(page);
  await expect(page).toHaveURL(/\/?session=user$/);
  await expect(page.locator("#dashboard")).toBeVisible();
  expect(await page.locator("script[type=module]").count()).toBe(1);
});
