/** Volt Consumo — Beta v3.3 · bootstrap progressivo sem tempestade de módulos. */
import "./startup-runtime.js?v=79";
import "./mercosur-region.js?v=84";
import "./regional-auth.js?v=89";
import "./signup-confirmation.js";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const DARK_SCHEME = window.matchMedia("(prefers-color-scheme: dark)");
let coreModulesPromise = null;
let secondaryModulesPromise = null;
let deferredModulesPromise = null;

start();

function start() {
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

function stageAuthenticatedRuntime() {
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard || !dashboard.hidden) {
    queueMicrotask(loadCoreModules);
    return;
  }
  const observer = new MutationObserver(() => {
    if (dashboard.hidden) return;
    observer.disconnect();
    loadCoreModules();
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
}

async function loadCoreModules() {
  if (coreModulesPromise) return coreModulesPromise;
  coreModulesPromise = (async () => {
    attachCycleStyles();
    await import("./locality-context.js?v=84");
    await import("./regional-tariff-resolver.js?v=84");
    await import("./regional-cycles.js?v=87");
    await import("./regional-home.js?v=86");
    await import("./regional-onboarding.js?v=88");
    scheduleSecondaryModules();
  })().catch(reportModuleFailure);
  return coreModulesPromise;
}

function scheduleSecondaryModules() {
  if (secondaryModulesPromise) return secondaryModulesPromise;
  const run = async () => {
    secondaryModulesPromise = (async () => {
      await import("./platform-users.js");
      await import("./guided-experience.js");
      await import("./tutorial-ack.js?v=68");
      await import("./initial-bill-setup.js?v=71");
      await import("./separate-cycles.js?v=77");
      scheduleDeferredModules();
    })().catch(reportModuleFailure);
    return secondaryModulesPromise;
  };
  scheduleIdle(run, 500);
  return null;
}

function scheduleDeferredModules() {
  if (deferredModulesPromise) return deferredModulesPromise;
  const run = async () => {
    deferredModulesPromise = (async () => {
      await import("./energy-detail.js?v=85");
      await import("./closed-cycle-report.js?v=91");
      await import("./mobile-reports-v2.js?v=94");
      await import("./uruguay-tariff-catalog.js?v=83");
      await import("./uruguay-water-detail.js?v=93");
      await loadTestAccountModules();
    })().catch(reportModuleFailure);
    return deferredModulesPromise;
  };
  scheduleIdle(run, 1400);
  return null;
}

function scheduleIdle(callback, timeout) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(callback, { timeout });
  else window.setTimeout(callback, Math.min(timeout, 350));
}

async function loadTestAccountModules() {
  const email = window.VOLT_BETA_API?.getSnapshot?.().account?.email?.trim().toLowerCase() || "";
  if (email !== "walflanribeiro@gmail.com") return;
  await import("./test-account-reset.js?v=73");
  await import("./test-account-onboarding-prefill.js?v=74");
}

function reportModuleFailure(error) {
  console.error("Volt: falha ao carregar módulo pós-login", error);
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
  new MutationObserver(() => { if (!dashboard.hidden) release(); }).observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
  if (!dashboard.hidden) release();
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
