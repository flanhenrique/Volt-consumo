/** Volt Consumo — Beta v3.19 · startup explícito e renderers sem concorrência de página. */
import "./mercosur-region.js?v=84";
import "./regional-auth.js?v=89";
import "./locality-context.js?v=84";
import "./regional-onboarding.js?v=88";
import "./signup-confirmation.js";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const DARK_SCHEME = window.matchMedia("(prefers-color-scheme: dark)");
let coreModulesPromise = null;
let secondaryModulesPromise = null;
let deferredModulesPromise = null;
let authenticatedRuntimeArmed = false;
let financialStartupReleased = false;

start();

function start() {
  installRuntimeVisibilityGuards();
  syncStatusBarColor();
  const shell = document.querySelector(".beta-v2-shell");
  if (shell) {
    measureNavigationHeight(shell);
    enhanceHeader(shell);
    enhanceNavigation(shell);
  }
  enhanceSubmitFeedback();
  stageAuthenticatedRuntime();
}

function installRuntimeVisibilityGuards() {
  if (!document.querySelector("style[data-volt-runtime-visibility]")) {
    const style = document.createElement("style");
    style.dataset.voltRuntimeVisibility = "true";
    style.textContent = `
      html[data-environment="beta"] [hidden] { display: none !important; }
      html[data-environment="beta"][data-volt-home-ready="false"] .beta-v2-shell {
        visibility: hidden !important;
      }
      html[data-environment="beta"][data-volt-financial-ready="false"] #beta-home .financial-preview strong,
      html[data-environment="beta"][data-volt-financial-ready="false"] #beta-financial-total,
      html[data-environment="beta"][data-volt-financial-ready="false"] #beta-summary-values strong {
        visibility: hidden !important;
      }
    `;
    document.head.append(style);
  }
  document.documentElement.dataset.voltStartupState = "waiting-account";
  document.documentElement.dataset.voltHomeReady = "false";
  document.documentElement.dataset.voltFinancialReady = "false";
  document.querySelector("#beta-home")?.setAttribute("aria-busy", "true");
}

function stageAuthenticatedRuntime() {
  const loadAfterAccountData = () => {
    if (authenticatedRuntimeArmed) return;
    authenticatedRuntimeArmed = true;
    document.documentElement.dataset.voltStartupState = "loading-core";
    void loadCoreModules().then(releaseFinancialStartup).catch(reportCoreModuleFailure);
  };
  const handleStartupError = (event) => {
    reportStartupFailure(event?.detail?.reason || "account-data-timeout");
  };

  window.addEventListener("volt:account-data-ready", loadAfterAccountData, { once: true });
  window.addEventListener("volt:startup-error", handleStartupError, { once: true });

  const currentState = window.VOLT_STARTUP_STATE;
  if (currentState?.status === "ready") {
    queueMicrotask(loadAfterAccountData);
  } else if (currentState?.status === "error") {
    queueMicrotask(() => reportStartupFailure(currentState.reason || "account-data-timeout"));
  }
}

async function loadCoreModules() {
  if (coreModulesPromise) return coreModulesPromise;
  coreModulesPromise = (async () => {
    attachCycleStyles();

    const initialTariffSettled = waitForStartupSignal(
      "volt:tariff-resolution",
      () => Boolean(window.VOLT_TARIFF_RESOLUTION),
      4000,
      "tariff-resolution-timeout"
    );
    const initialCycleSettled = waitForStartupSignal(
      "volt:cycle-context",
      () => Boolean(window.VOLT_CYCLE_CONTEXT),
      4000,
      "cycle-context-timeout"
    );

    await Promise.all([
      import("./regional-tariff-resolver.js?v=96"),
      import("./separate-cycles.js?v=77")
    ]);

    await Promise.all([initialTariffSettled, initialCycleSettled]);

    await Promise.all([
      import("./regional-cycles.js?v=96"),
      import("./regional-home.js?v=97")
    ]);

    await waitForTariffSettingsApplied(5000);
    await waitForStartupQuiet(["volt:beta-data", "volt:tariff-resolution", "volt:cycle-context"], 320, 3000);
    await settleVisualFrame();
    scheduleSecondaryModules();
  })();
  return coreModulesPromise;
}

function waitForStartupSignal(eventName, isReady, timeoutMs, reason) {
  if (isReady()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      window.removeEventListener(eventName, check);
      clearTimeout(timeout);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(reason));
    };
    const check = () => {
      if (isReady()) finish();
    };
    const timeout = window.setTimeout(fail, timeoutMs);
    window.addEventListener(eventName, check);
    queueMicrotask(check);
  });
}

function tariffSettingsApplied() {
  const resolution = window.VOLT_TARIFF_RESOLUTION;
  if (!resolution || resolution.country !== "BR") return true;
  const settings = window.VOLT_BETA_API?.getSnapshot?.()?.energy?.settings;
  if (!settings) return false;
  const expectedRate = resolution.energy?.automatic ? Number(resolution.energy.ratePerKwh) : NaN;
  const expectedLighting = resolution.lighting?.automatic ? Number(resolution.lighting.amount) : NaN;
  if (Number.isFinite(expectedRate) && Math.abs(Number(settings.rate) - expectedRate) > 0.0000005) return false;
  if (Number.isFinite(expectedLighting) && Math.abs(Number(settings.lightingFee) - expectedLighting) > 0.005) return false;
  return true;
}

function waitForTariffSettingsApplied(maxMs) {
  if (tariffSettingsApplied()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      window.removeEventListener("volt:beta-data", check);
      window.removeEventListener("volt:tariff-resolution", check);
      clearTimeout(timeout);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("tariff-settings-timeout"));
    };
    const check = () => {
      if (tariffSettingsApplied()) finish();
    };
    const timeout = window.setTimeout(fail, maxMs);
    window.addEventListener("volt:beta-data", check);
    window.addEventListener("volt:tariff-resolution", check);
    queueMicrotask(check);
  });
}

function waitForStartupQuiet(eventNames, quietMs, maxMs) {
  return new Promise((resolve, reject) => {
    let quietTimer = 0;
    let maxTimer = 0;
    let finished = false;
    const cleanup = () => {
      for (const eventName of eventNames) window.removeEventListener(eventName, reschedule);
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const fail = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("startup-did-not-settle"));
    };
    const reschedule = () => {
      clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, quietMs);
    };
    for (const eventName of eventNames) window.addEventListener(eventName, reschedule);
    maxTimer = window.setTimeout(fail, maxMs);
    reschedule();
  });
}

function settleVisualFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function releaseFinancialStartup() {
  if (financialStartupReleased) return;
  financialStartupReleased = true;
  document.documentElement.dataset.voltStartupState = "ready";
  document.documentElement.dataset.voltFinancialReady = "true";
  document.documentElement.dataset.voltHomeReady = "true";
  document.querySelector("#beta-home")?.removeAttribute("aria-busy");
  document.querySelector("#beta-startup-error")?.remove();
}

function reportStartupFailure(reason) {
  document.documentElement.dataset.voltStartupState = "error";
  document.documentElement.dataset.voltHomeReady = "true";
  document.documentElement.dataset.voltFinancialReady = "false";
  const home = document.querySelector("#beta-home");
  home?.removeAttribute("aria-busy");
  if (!home || document.querySelector("#beta-startup-error")) return;
  const notice = document.createElement("p");
  notice.id = "beta-startup-error";
  notice.className = "note status-message";
  notice.setAttribute("role", "alert");
  notice.textContent = reason === "account-data-timeout"
    ? "Não foi possível concluir a carga da conta. Verifique a conexão e tente novamente."
    : "Não foi possível concluir a preparação da Home. Recarregue a página para tentar novamente.";
  home.prepend(notice);
}

function scheduleSecondaryModules() {
  if (secondaryModulesPromise) return secondaryModulesPromise;
  const run = async () => {
    secondaryModulesPromise = Promise.all([
      import("./guided-experience.js"),
      import("./tutorial-ack.js?v=68"),
      import("./initial-bill-setup.js?v=71")
    ]).then(scheduleDeferredModules).catch(reportModuleFailure);
    return secondaryModulesPromise;
  };
  scheduleIdle(run, 650);
  return null;
}

function scheduleDeferredModules() {
  if (deferredModulesPromise) return deferredModulesPromise;
  const run = async () => {
    deferredModulesPromise = Promise.all([
      import("./energy-detail.js?v=85"),
      import("./uruguay-water-detail.js?v=96")
    ]).then(loadTestAccountModules).catch(reportModuleFailure);
    return deferredModulesPromise;
  };
  scheduleIdle(run, 1600);
  return null;
}

function scheduleIdle(callback, timeout) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout });
  else window.setTimeout(callback, Math.min(timeout, 400));
}

async function loadTestAccountModules() {
  const email = window.VOLT_BETA_API?.getSnapshot?.().account?.email?.trim().toLowerCase() || "";
  if (email !== "walflanribeiro@gmail.com") return;
  await Promise.all([
    import("./test-account-reset.js?v=73"),
    import("./test-account-onboarding-prefill.js?v=74")
  ]);
}

function reportCoreModuleFailure(error) {
  console.error("Volt: falha ao preparar módulos críticos pós-login", error);
  reportStartupFailure(String(error?.message || "core-module-failure"));
}

function reportModuleFailure(error) {
  console.error("Volt: falha ao carregar módulo secundário pós-login", error);
}

function attachCycleStyles() {
  if (document.querySelector('link[href*="cycle-authority.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./cycle-authority.css?v=83";
  document.head.append(link);
}

function syncStatusBarColor() {
  const apply = () => {
    const canvas = getComputedStyle(document.documentElement).getPropertyValue("--lm-canvas").trim();
    if (!canvas) return;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.removeAttribute("media");
      meta.setAttribute("content", canvas);
    }
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  DARK_SCHEME.addEventListener("change", apply);
}

function measureNavigationHeight(shell) {
  const navigation = shell.querySelector(".bottom-navigation");
  if (!navigation || typeof ResizeObserver === "undefined") return;
  const publish = () => {
    const height = Math.round(navigation.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty("--lm-nav-height", `${height}px`);
  };
  new ResizeObserver(publish).observe(navigation);
  publish();
}

function enhanceHeader(shell) {
  const header = shell.querySelector(".beta-header");
  const content = shell.querySelector("#beta-content");
  if (!header || !content) return;
  const sync = () => { header.dataset.scrolled = String(content.scrollTop > 4 || window.scrollY > 4); };
  content.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

function enhanceNavigation(shell) {
  const navigation = shell.querySelector(".bottom-navigation");
  if (!navigation || navigation.querySelector(".nav-indicator")) return;
  const indicator = document.createElement("span");
  indicator.className = "nav-indicator";
  indicator.dataset.ready = "false";
  indicator.setAttribute("aria-hidden", "true");
  navigation.prepend(indicator);
  const move = () => {
    const active = navigation.querySelector("button.active");
    if (!active) return;
    const bounds = active.getBoundingClientRect();
    const reference = navigation.getBoundingClientRect();
    if (!bounds.width) return;
    indicator.style.setProperty("--nav-indicator-width", `${bounds.width}px`);
    indicator.style.setProperty("--nav-indicator-x", `${bounds.left - reference.left}px`);
  };
  const release = () => {
    move();
    requestAnimationFrame(() => { indicator.dataset.ready = "true"; });
  };
  navigation.addEventListener("click", () => requestAnimationFrame(move));
  window.addEventListener("resize", move, { passive: true });
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard) return release();
  if (!dashboard.hidden) return release();
  const visibilityObserver = new MutationObserver(() => {
    if (dashboard.hidden) return;
    visibilityObserver.disconnect();
    release();
  });
  visibilityObserver.observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
}

function enhanceSubmitFeedback() {
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.method === "dialog") return;
    const button = event.submitter;
    if (!(button instanceof HTMLButtonElement) || button.dataset.loading === "true") return;
    button.dataset.loading = "true";
    const settle = () => { delete button.dataset.loading; };
    window.addEventListener("volt:beta-data", settle, { once: true });
    window.setTimeout(settle, REDUCED_MOTION.matches ? 240 : 700);
  }, true);
}
