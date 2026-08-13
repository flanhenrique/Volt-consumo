import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.VOLT_SMOKE_URL || "http://127.0.0.1:4173/";
const fakeSupabase = await readFile(new URL("./fake-supabase-browser.js", import.meta.url), "utf8");
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const runtimeErrors = [];

  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error?.stack || error?.message || error}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console.error: ${message.text()}`);
  });

  await page.route("**/vendor/supabase/supabase.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript; charset=utf-8",
    body: fakeSupabase
  }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: "[]"
  }));

  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.ok(response?.ok(), `Sessão restaurada respondeu HTTP ${response?.status() || "sem resposta"}`);

  await page.waitForSelector("#dashboard", { state: "visible", timeout: 12_000 });
  await page.waitForFunction(() => document.documentElement.dataset.voltHomeReady === "true", null, { timeout: 12_000 });
  await page.waitForFunction(() => document.documentElement.dataset.voltFinancialReady === "true", null, { timeout: 12_000 });
  const usersReady = await page.waitForFunction(
    () => document.querySelector("#beta-users-nav")?.hidden === false,
    null,
    { timeout: 5_000 }
  ).then(() => true).catch(() => false);
  if (!usersReady) {
    const diagnostic = await page.evaluate(() => ({
      startup: window.VOLT_STARTUP_STATE || null,
      admin: window.VOLT_BETA_API?.getAdminSnapshot?.() || null,
      organization: window.VOLT_BETA_API?.getOrganizationSnapshot?.() || null,
      mfa: window.VOLT_BETA_API?.getMfaSnapshot?.() || null,
      account: window.VOLT_BETA_API?.getSnapshot?.()?.account || null,
      usersHidden: document.querySelector("#beta-users-nav")?.hidden ?? null,
      rpcCalls: window.__VOLT_FAKE_RPC_CALLS || [],
      runtimeErrors: [...runtimeErrors]
    }));
    assert.fail(`Admin não ficou disponível: ${JSON.stringify(diagnostic)}`);
  }
  await page.waitForTimeout(300);

  const authenticatedState = await page.evaluate(() => {
    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    return {
      welcomeVisible: visible(document.querySelector("#welcome")),
      dashboardVisible: visible(document.querySelector("#dashboard")),
      shellVisible: visible(document.querySelector(".beta-v2-shell")),
      greeting: document.querySelector("#beta-greeting")?.textContent?.trim() || "",
      displayName: document.querySelector("#beta-display-name")?.value || "",
      email: document.querySelector("#beta-account-email")?.value || "",
      usersHidden: document.querySelector("#beta-users-nav")?.hidden ?? true,
      startupState: window.VOLT_STARTUP_STATE?.status || "",
      homeReady: document.documentElement.dataset.voltHomeReady,
      financialReady: document.documentElement.dataset.voltFinancialReady,
      visiblePages: [...document.querySelectorAll(".beta-page")].filter((item) => {
        if (item.hidden) return false;
        const style = getComputedStyle(item);
        return style.display !== "none" && style.visibility !== "hidden";
      }).map((item) => item.dataset.page)
    };
  });

  assert.equal(authenticatedState.welcomeVisible, false, "Login permaneceu sobre o Dashboard após restaurar sessão");
  assert.equal(authenticatedState.dashboardVisible, true, "Dashboard não foi exibido após restaurar sessão");
  assert.equal(authenticatedState.shellVisible, true, "Shell permaneceu bloqueado após concluir o startup");
  assert.equal(authenticatedState.greeting, "Olá, Flan Teste!", "Nome não chegou à saudação da Home");
  assert.equal(authenticatedState.displayName, "Flan Teste", "Nome não chegou ao campo da conta");
  assert.equal(authenticatedState.email, "flanhenriquee@icloud.com", "E-mail não chegou ao campo da conta");
  assert.equal(authenticatedState.usersHidden, false, "Usuários não apareceu após autorização administrativa");
  assert.equal(authenticatedState.startupState, "ready", "Runtime não concluiu o estado explícito de startup");
  assert.equal(authenticatedState.homeReady, "true", "Home não foi liberada após dados críticos");
  assert.equal(authenticatedState.financialReady, "true", "Valores financeiros não foram liberados após estabilização");
  assert.deepEqual(authenticatedState.visiblePages, ["home"], "Sessão restaurada deixou páginas sobrepostas na Home");

  await page.locator('[data-nav="users"]').click();
  await page.waitForTimeout(350);
  const usersState = await page.evaluate(() => ({
    visiblePages: [...document.querySelectorAll(".beta-page")].filter((item) => {
      if (item.hidden) return false;
      const style = getComputedStyle(item);
      return style.display !== "none" && style.visibility !== "hidden";
    }).map((item) => item.dataset.page),
    organization: document.querySelector("#beta-organization-name")?.textContent?.trim() || "",
    role: document.querySelector("#beta-current-role")?.textContent?.trim() || "",
    memberCount: document.querySelector("#beta-member-count")?.textContent?.trim() || ""
  }));
  assert.deepEqual(usersState.visiblePages, ["users"], "Usuários abriu com outra página sobreposta");
  assert.equal(usersState.organization, "Organização Teste", "Contexto administrativo não foi renderizado");
  assert.equal(usersState.role, "Proprietário", "Papel administrativo não foi renderizado");
  assert.equal(usersState.memberCount, "1", "Lista administrativa não refletiu o usuário autenticado");

  await page.locator('[data-nav="settings"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#beta-display-name").inputValue(), "Flan Teste", "Nome desapareceu ao navegar para Configurações");
  assert.equal(await page.locator("#beta-account-email").inputValue(), "flanhenriquee@icloud.com", "E-mail desapareceu ao navegar para Configurações");

  assert.deepEqual(runtimeErrors, [], `Erros na sessão restaurada:\n${runtimeErrors.join("\n")}`);
  await context.close();
} finally {
  await browser.close();
}
