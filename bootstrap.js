const BOOTSTRAP_BUILD = "20260814.11";
const ATOMIC_RELEASE = "20260813.7";
const UPDATE_BUILD = "20260815.4";
globalThis.__VOLT_BUILD__ = UPDATE_BUILD;

const STUCK_STARTUP_STATUSES = new Set(["BOOTING", "RESTORING_SESSION"]);
const RECOVERY_DELAY_MS = 9000;
const CRITICAL_MODULES = Object.freeze([
  `./app.js?v=${BOOTSTRAP_BUILD}`,
  `./src/app-state.js?v=${ATOMIC_RELEASE}`,
  `./src/renderer.js?v=${ATOMIC_RELEASE}`,
  `./src/volt-service.js?v=${ATOMIC_RELEASE}`
]);

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
let recoveryInterval = null;
let recoveryActive = false;

configureMobileWebAppShell();
loadMobilePolish();
loadDesktopAuthLayout();

function ensureMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
  return meta;
}

function configureMobileWebAppShell() {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
  }

  ensureMeta("mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-capable", "yes");
  ensureMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
  ensureMeta("apple-mobile-web-app-title", "Volt");

  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  document.documentElement.dataset.displayMode = standalone ? "standalone" : "browser";
}

function loadMobilePolish() {
  if (document.querySelector("link[data-volt-mobile-polish]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/mobile-polish.css?v=${UPDATE_BUILD}`;
  link.dataset.voltMobilePolish = "";
  document.head.append(link);
}

function loadDesktopAuthLayout() {
  if (document.querySelector("link[data-volt-auth-desktop]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/auth-desktop.css?v=${UPDATE_BUILD}`;
  link.dataset.voltAuthDesktop = "";
  document.head.append(link);
}

function currentStartupStatus() {
  return document.documentElement.dataset.startupStatus || "BOOTING";
}

function releaseLogin(message = "A sessão anterior não respondeu. Entre novamente.") {
  if (!STUCK_STARTUP_STATUSES.has(currentStartupStatus())) return;
  recoveryActive = true;
  if (loginForm) {
    loginForm.inert = false;
    loginForm.setAttribute("aria-busy", "false");
  }
  if (loginMessage) loginMessage.textContent = message;
}

function stopRecoveryGuard() {
  if (recoveryInterval) {
    window.clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
}

function keepLoginReleasedWhileStartupIsStuck() {
  if (!recoveryActive) return;
  const status = currentStartupStatus();
  if (!STUCK_STARTUP_STATUSES.has(status)) {
    stopRecoveryGuard();
    return;
  }
  if (loginForm?.inert || loginForm?.getAttribute("aria-busy") !== "false") {
    releaseLogin();
  }
}

async function revalidateCriticalModules() {
  const results = await Promise.allSettled(CRITICAL_MODULES.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`Falha ao revalidar ${url}`);
  }));
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

window.setTimeout(() => {
  if (!STUCK_STARTUP_STATUSES.has(currentStartupStatus())) return;
  releaseLogin();
  recoveryInterval = window.setInterval(keepLoginReleasedWhileStartupIsStuck, 500);
}, RECOVERY_DELAY_MS);

window.addEventListener("volt:startup-status", (event) => {
  const status = event.detail?.status || currentStartupStatus();
  if (!STUCK_STARTUP_STATUSES.has(status)) stopRecoveryGuard();
});

try {
  await revalidateCriticalModules();
  await import(`./app.js?v=${BOOTSTRAP_BUILD}`);
} catch (error) {
  stopRecoveryGuard();
  if (loginForm) {
    loginForm.inert = false;
    loginForm.setAttribute("aria-busy", "false");
  }
  if (loginMessage) loginMessage.textContent = "O Volt não conseguiu iniciar. Recarregue a página.";
  document.documentElement.dataset.startupStatus = "ERROR";
  console.error("VOLT bootstrap failed", error);
}

try {
  await import(`./src/pwa-update.js?v=${UPDATE_BUILD}`);
} catch (error) {
  console.warn("VOLT update manager unavailable", error);
}
