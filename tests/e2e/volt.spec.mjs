import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";

const fakeSupabase = await fs.readFile(new URL("../fixtures/fake-supabase.js", import.meta.url), "utf8");

test.beforeEach(async ({ page }) => {
  const failures = [];
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console.error: ${message.text()}`); });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  await page.addInitScript(() => {
    window.__voltUnhandled = [];
    window.addEventListener("unhandledrejection", (event) => window.__voltUnhandled.push(String(event.reason)));
  });
  await page.route("**/vendor/supabase/supabase.js", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: fakeSupabase }));
  page.__voltFailures = failures;
});

test.afterEach(async ({ page }) => {
  const unhandled = await page.evaluate(() => window.__voltUnhandled || []).catch(() => []);
  expect([...page.__voltFailures, ...unhandled], "zero console.error, pageerror e unhandledrejection").toEqual([]);
});

test("A — usuário deslogado vê somente Login", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#login-screen")).toBeVisible();
  await expect(page.locator("#dashboard")).toBeHidden();
  await expect(page.locator("#boot-screen")).toBeHidden();
});

test("B/D — sessão restaurada só revela Home consolidada", async ({ page }) => {
  await page.goto("/?session=user");
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#login-screen")).toBeHidden();
  await expect(page.locator("#greeting")).toHaveText("Olá, Ana Volt!");
  await expect(page.locator("#home-energy-consumption")).not.toHaveText("");
  await expect(page.locator("#home-water-consumption")).not.toHaveText("");
  await expect(page.getByText("Tarifas e encargos")).toHaveCount(0);
  await expect(page.getByText("Organização ativa")).toHaveCount(0);
  const visibility = await page.evaluate(() => ["boot-screen", "login-screen", "mfa-screen", "error-screen", "dashboard"].filter((id) => {
    const element = document.getElementById(id);
    return element && getComputedStyle(element).display !== "none";
  }));
  expect(visibility).toEqual(["dashboard"]);
});

test("C/I — login e logout seguem uma única transição", async ({ page }) => {
  await page.goto("/");
  await page.locator("#login-email").fill("ana@volt.test");
  await page.locator("#login-password").fill("senha-segura-123");
  await page.locator("#login-form").getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#dashboard")).toBeVisible();
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.locator("#logout").click();
  await expect(page.locator("#dashboard")).toBeHidden();
  await expect(page.locator("#login-screen")).toBeVisible();
  expect(await page.evaluate(() => window.__voltFake.getSession())).toBeNull();
});

test("C — MFA bloqueia o Dashboard até AAL2", async ({ page }) => {
  await page.goto("/?session=mfa");
  await expect(page.locator("#mfa-screen")).toBeVisible();
  await expect(page.locator("#dashboard")).toBeHidden();
  await page.locator("#mfa-code").fill("123456");
  await page.locator("#mfa-form").getByRole("button", { name: "Verificar" }).click();
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#mfa-screen")).toBeHidden();
});

test("E — registrar leitura preserva a Home", async ({ page }) => {
  await page.goto("/?session=user");
  await expect(page.locator("#dashboard")).toBeVisible();
  await page.getByRole("button", { name: "Leituras" }).click();
  await page.getByRole("button", { name: "Nova leitura", exact: true }).click();
  await page.locator("#reading-type").selectOption("energy");
  await page.locator("#reading-value").fill("1130");
  await page.locator("#reading-date").fill("2026-08-10T12:00");
  await page.locator("#reading-form").getByRole("button", { name: "Salvar leitura" }).click();
  await expect(page.locator("#reading-dialog")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Início" }).click();
  await expect(page.locator("#home-energy-consumption")).not.toHaveText("");
  await expect(page.locator("#dashboard")).toBeVisible();
});

test("F — nome e e-mail persistem após reload", async ({ page }) => {
  await page.goto("/?session=user");
  await expect(page.locator("#dashboard")).toBeVisible();
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.locator("#account-email")).toHaveValue("ana@volt.test");
  await page.locator("#display-name").fill("Ana Persistente");
  await page.locator("#account-form").getByRole("button", { name: "Salvar nome" }).click();
  await expect(page.locator("#account-message")).toHaveText("Nome atualizado.");
  await page.reload();
  await expect(page.locator("#dashboard")).toBeVisible();
  await expect(page.locator("#greeting")).toHaveText("Olá, Ana Persistente!");
  await page.getByRole("button", { name: "Configurações" }).click();
  await expect(page.locator("#display-name")).toHaveValue("Ana Persistente");
  await expect(page.locator("#account-email")).toHaveValue("ana@volt.test");
});

test("G — Usuários aparece por permissão e reabre sem destruir DOM", async ({ page }) => {
  await page.goto("/?session=admin");
  await expect(page.locator("#dashboard")).toBeVisible();
  const nav = page.getByRole("button", { name: "Usuários" });
  await expect(nav).toBeVisible();
  await nav.click();
  await expect(page.locator("#members-list .member-item")).toHaveCount(1);
  await page.locator("#invite-user").click();
  await page.locator("#invite-email").fill("novo@volt.test");
  await page.locator("#invite-form").getByRole("button", { name: "Criar convite" }).click();
  await expect(page.locator("#invite-message")).toHaveText("Convite criado por 48 horas.");
  await page.locator("[data-close-dialog='invite-dialog']").click();
  await page.locator("#page-users").evaluate((element) => { element.dataset.ownershipProbe = "same-node"; });
  await page.getByRole("button", { name: "Início" }).click();
  await nav.click();
  await expect(page.locator("#members-list .member-item")).toHaveCount(1);
  await expect(page.locator("#page-users")).toHaveAttribute("data-ownership-probe", "same-node");
});

test("H — Relatórios existe, abre e permanece vazio", async ({ page }) => {
  await page.goto("/?session=user");
  await expect(page.locator("#dashboard")).toBeVisible();
  await page.getByRole("button", { name: "Relatórios" }).click();
  await expect(page.locator("#page-reports")).toBeVisible();
  expect(await page.locator("#page-reports").evaluate((element) => element.children.length)).toBe(0);
  expect((await page.locator("#page-reports").textContent()).trim()).toBe("");
});

test("/beta é somente compatibilidade", async ({ page }) => {
  await page.goto("/beta/?session=user");
  await expect(page).toHaveURL(/\/?session=user$/);
  await expect(page.locator("#dashboard")).toBeVisible();
  expect(await page.locator("script[type=module]").count()).toBe(1);
});
