/** Volt Consumo — Beta v3.13 · runtime por prioridade e página ativa. */
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
const pageModulePromises = new Map();

start();

function start() {
  installRuntimeVisibilityGuards();
  syncStatusBarColor();
  const shell = document.querySelector(".beta-v2-shell");
  if (shell) {
    measureNavigationHeight(shell);
    enhanceHeader(shell);
    enhanceNavigation(shell);
    bindLazyPageModules(shell);
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
      html[data-environment="beta"][data-volt-financial-ready="false"] #beta-home .financial-preview strong,
      html[data-environment="beta"][data-volt-financial-ready="false"] #beta-financial-total,
      html[data-environment="beta"][data-volt-financial-ready="false"] #beta-summary-values strong {
        visibility: hidden !important;
      }
    `;
    document.head.append(style);
  }
  document.documentElement.dataset.voltFinancialReady = "false";
  document.querySelector("#beta-home")?.setAttribute("aria-busy", "true");
}

function stageAuthenticatedRuntime() {
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard) return queueMicrotask(() => void loadCoreModules().finally(releaseFinancialStartup));

  const loadAfterAccountData = () => {
    if (authenticatedRuntimeArmed) return;
    authenticatedRuntimeArmed = true;
    void loadCoreModules().finally(releaseFinancialStartup);
  };

  window.addEventListener("volt:account-data-ready", loadAfterAccountData, { once: true });

  const armFallback = () => {
    if (dashboard.hidden) return;
    window.setTimeout(() => {
      if (!authenticatedRuntimeArmed) loadAfterAccountData();
    }, 5200);
  };

  if (!dashboard.hidden) armFallback();
  const observer = new MutationObserver(() => {
    if (dashboard.hidden) return;
    observer.disconnect();
    armFallback();
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
}

async function loadCoreModules() {
  if (coreModulesPromise) return coreModulesPromise;
  coreModulesPromise = (async () => {
    attachCycleStyles();

    // O valor financeiro só pode aparecer depois de duas autoridades terem
    // estabilizado: o ciclo efetivo e a resolução tarifária. Antes, o ciclo
    // ainda era carregado na fase secundária, o que explicava a sequência
    // visual de valores intermediários antes do total correto.
    const initialTariffSettled = waitForStartupEvent("volt:tariff-resolution", 1100);
    const initialCycleSettled = waitForStartupEvent("volt:cycle-context", 1100);

    await Promise.all([
      import("./regional-tariff-resolver.js?v=96"),
      import("./separate-cycles.js?v=77")
    ]);

    await Promise.all([initialTariffSettled, initialCycleSettled]);

    await Promise.all([
      import("./regional-cycles.js?v=96"),
      import("./regional-home.js?v=97")
    ]);

    // Dá uma janela curta para os renderizadores reagirem ao contexto já
    // consolidado antes de revelar os números ao usuário.
    await settleVisualFrame();
    scheduleSecondaryModules();
  })().catch(reportModuleFailure);
  return coreModulesPromise;
}

function waitForStartupEvent(eventName, timeout) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener(eventName, finish);
      resolve();
    };
    window.addEventListener(eventName, finish, { once: true });
    window.setTimeout(finish, timeout);
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
  document.documentElement.dataset.voltFinancialReady = "true";
  document.querySelector("#beta-home")?.removeAttribute("aria-busy");
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

function bindLazyPageModules(shell) {
  const navigation = shell.querySelector(".bottom-navigation");
  if (!navigation) return;
  navigation.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-nav]");
    if (!button) return;
    void loadPageModules(button.dataset.nav);
  }, { passive: true });
}

async function loadPageModules(page) {
  if (!page || !["reports", "users"].includes(page)) return;
  if (pageModulePromises.has(page)) return pageModulePromises.get(page);

  const promise = (async () => {
    await loadCoreModules();
    if (page === "reports") {
      await Promise.all([
        import("./closed-cycle-report.js?v=91"),
        import("./mobile-reports-v2.js?v=94")
      ]);
      return;
    }
    if (page === "users") await import("./platform-users.js");
  })().catch((error) => {
    pageModulePromises.delete(page);
    reportModuleFailure(error);
  });
  pageModulePromises.set(page, promise);
  return promise;
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

function reportModuleFailure(error) {
  console.error("Volt: falha ao carregar módulo pós-login", error);
  releaseFinancialStartup();
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
