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
  assert.deepEqual(runtimeErrors, [], `Erros no bootstrap:\n${runtimeErrors.join("\n")}`);

  await context.close();
} finally {
  await browser.close();
}
