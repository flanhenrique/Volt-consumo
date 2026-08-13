import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.VOLT_SMOKE_URL || "http://127.0.0.1:4173/";
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

  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.ok(response?.ok(), `Bootstrap respondeu HTTP ${response?.status() || "sem resposta"}`);

  await page.waitForSelector("#login-form", { state: "visible" });
  await page.waitForSelector(".beta-v2-shell", { state: "attached" });
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    const reports = document.querySelector("#beta-reports");
    const moduleScripts = [...document.querySelectorAll('script[type="module"]')].map((script) => script.getAttribute("src"));
    return {
      welcomeVisible: visible(document.querySelector("#welcome")),
      dashboardVisible: visible(document.querySelector("#dashboard")),
      reportsMarkup: reports?.innerHTML.trim() ?? null,
      moduleScripts,
      tariffCardCount: document.querySelectorAll(".tariff-info-card").length,
      tariffTextPresent: document.body.textContent.includes("Tarifas e encargos"),
      usersNavHidden: document.querySelector("#beta-users-nav")?.hidden ?? null
    };
  });

  assert.equal(state.welcomeVisible, true, "Login não está visível sem sessão");
  assert.equal(state.dashboardVisible, false, "Dashboard apareceu junto com o Login");
  assert.deepEqual(state.moduleScripts, ["./bootstrap.js"], "index voltou a carregar múltiplos entry points module");
  assert.equal(state.reportsMarkup, "", "Relatórios deixou de estar vazio");
  assert.equal(state.tariffCardCount, 0, "Card legado Tarifas e encargos reapareceu");
  assert.equal(state.tariffTextPresent, false, "Texto legado Tarifas e encargos reapareceu");
  assert.equal(state.usersNavHidden, true, "Usuários apareceu sem autorização autenticada");

  // Exercita a casca autenticada sem criar sessão falsa. O objetivo aqui é
  // validar o contrato visual de navegação/hidden e capturar erros de CSP/DOM
  // que só aparecem quando o Dashboard deixa de estar oculto.
  await page.evaluate(() => {
    document.documentElement.dataset.voltHomeReady = "true";
    document.documentElement.dataset.voltFinancialReady = "true";
    const welcome = document.querySelector("#welcome");
    const dashboard = document.querySelector("#dashboard");
    if (welcome) welcome.hidden = true;
    if (dashboard) dashboard.hidden = false;
  });
  await page.waitForTimeout(200);

  for (const pageName of ["home", "readings", "reports", "settings"]) {
    await page.locator(`[data-nav="${pageName}"]`).click();
    await page.waitForTimeout(80);
    const navigationState = await page.evaluate(() => {
      const visiblePages = [...document.querySelectorAll(".beta-page")].filter((item) => {
        if (item.hidden) return false;
        const style = getComputedStyle(item);
        return style.display !== "none" && style.visibility !== "hidden";
      }).map((item) => item.dataset.page);
      const activePages = [...document.querySelectorAll(".beta-page.active")].map((item) => item.dataset.page);
      return { visiblePages, activePages, reportsMarkup: document.querySelector("#beta-reports")?.innerHTML.trim() ?? null };
    });
    assert.deepEqual(navigationState.visiblePages, [pageName], `Navegação ${pageName} deixou páginas sobrepostas`);
    assert.deepEqual(navigationState.activePages, [pageName], `Navegação ${pageName} perdeu página ativa única`);
    if (pageName === "reports") assert.equal(navigationState.reportsMarkup, "", "Relatórios foi preenchido durante navegação");
  }

  // O segundo carregamento é o cenário que mais expõe mistura de versões e
  // falhas de Response.clone: agora a página já deve estar controlada pelo SW.
  const serviceWorkerScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  assert.ok(serviceWorkerScope.endsWith("/"), `Escopo inesperado do Service Worker: ${serviceWorkerScope}`);

  const reloadResponse = await page.reload({ waitUntil: "domcontentloaded" });
  assert.ok(reloadResponse?.ok(), `Reload sob Service Worker respondeu HTTP ${reloadResponse?.status() || "sem resposta"}`);
  await page.waitForSelector("#login-form", { state: "visible" });
  await page.waitForSelector(".beta-v2-shell", { state: "attached" });
  await page.waitForTimeout(700);

  const reloadState = await page.evaluate(() => {
    const visible = (element) => {
      if (!element || element.hidden) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    };
    return {
      controlled: Boolean(navigator.serviceWorker.controller),
      welcomeVisible: visible(document.querySelector("#welcome")),
      dashboardVisible: visible(document.querySelector("#dashboard")),
      reportsMarkup: document.querySelector("#beta-reports")?.innerHTML.trim() ?? null,
      moduleScripts: [...document.querySelectorAll('script[type="module"]')].map((script) => script.getAttribute("src"))
    };
  });
  assert.equal(reloadState.controlled, true, "Reload não ficou sob controle do Service Worker");
  assert.equal(reloadState.welcomeVisible, true, "Login não reapareceu corretamente sob Service Worker");
  assert.equal(reloadState.dashboardVisible, false, "Dashboard vazou durante reload sob Service Worker");
  assert.equal(reloadState.reportsMarkup, "", "Relatórios reapareceu após reload sob Service Worker");
  assert.deepEqual(reloadState.moduleScripts, ["./bootstrap.js"], "Service Worker entregou entry points divergentes");

  assert.deepEqual(runtimeErrors, [], `Erros no bootstrap/navegação/Service Worker:\n${runtimeErrors.join("\n")}`);

  await context.close();
} finally {
  await browser.close();
}
