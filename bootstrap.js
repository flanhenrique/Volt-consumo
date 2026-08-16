const BOOTSTRAP_BUILD = "20260815.10";
const ATOMIC_RELEASE = "20260813.7";
const UPDATE_BUILD = "20260816.3";
globalThis.__VOLT_BUILD__ = UPDATE_BUILD;

const STUCK_STARTUP_STATUSES = new Set(["BOOTING", "RESTORING_SESSION"]);
const RECOVERY_DELAY_MS = 9000;
const STARTUP_SPLASH_MIN_MS = 850;
const STARTUP_SPLASH_MAX_MS = 1400;
const STARTUP_SPLASH_EXIT_MS = 260;
const startupSplashStartedAt = performance.now();
let startupSplashExited = false;
let startupSplashExitTimer = null;
let startupSplashForceTimer = null;

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

document.documentElement.dataset.startupSplash = "active";
loadStartupSplashStyle();
mountStartupSplash();
startupSplashForceTimer = window.setTimeout(beginStartupSplashExit, STARTUP_SPLASH_MAX_MS);

configureMobileWebAppShell();
loadMobilePolish();
loadDialogFix();
loadDesktopAuthLayout();
loadEasterEggStyle();

function loadStartupSplashStyle() {
  if (document.querySelector("link[data-volt-startup-splash]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/startup-splash.css?v=${UPDATE_BUILD}`;
  link.dataset.voltStartupSplash = "";
  document.head.append(link);
}

function mountStartupSplash() {
  if (document.getElementById("volt-startup-splash")) return;
  const splash = document.createElement("div");
  splash.id = "volt-startup-splash";
  splash.setAttribute("role", "status");
  splash.setAttribute("aria-label", "Carregando o Volt");
  splash.innerHTML = `
    <div class="volt-startup-splash__content">
      <span class="volt-startup-splash__mark" aria-hidden="true"></span>
      <strong>VOLT</strong>
      <small>CONSUMO</small>
    </div>
  `;
  document.body.prepend(splash);
}

function beginStartupSplashExit() {
  if (startupSplashExited) return;
  startupSplashExited = true;
  if (startupSplashExitTimer) window.clearTimeout(startupSplashExitTimer);
  if (startupSplashForceTimer) window.clearTimeout(startupSplashForceTimer);
  document.documentElement.dataset.startupSplash = "leaving";
  window.setTimeout(() => {
    document.documentElement.dataset.startupSplash = "done";
    document.getElementById("volt-startup-splash")?.remove();
  }, STARTUP_SPLASH_EXIT_MS);
}

function finishStartupSplash() {
  if (startupSplashExited) return;
  const elapsed = performance.now() - startupSplashStartedAt;
  const remaining = Math.max(0, STARTUP_SPLASH_MIN_MS - elapsed);
  startupSplashExitTimer = window.setTimeout(beginStartupSplashExit, remaining);
}

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

function preferredChromeColor() {
  const theme = document.documentElement.dataset.theme;
  const dark = theme === "dark" || (!theme && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
  return dark ? "#000000" : "#eaf4f0";
}

function syncMobileChromeColor() {
  ensureMeta("theme-color", preferredChromeColor());
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
  syncMobileChromeColor();

  const chromeObserver = new MutationObserver(syncMobileChromeColor);
  chromeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

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

function loadDialogFix() {
  if (document.querySelector("link[data-volt-dialog-fix]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/dialog-fix.css?v=${UPDATE_BUILD}`;
  link.dataset.voltDialogFix = "";
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

function loadEasterEggStyle() {
  if (document.querySelector("link[data-volt-easter-egg]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/easter-egg.css?v=${UPDATE_BUILD}`;
  link.dataset.voltEasterEgg = "";
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
  await import(`./src/pwa-install.js?v=${UPDATE_BUILD}`);
} catch (error) {
  console.warn("VOLT install onboarding unavailable", error);
}

try {
  await revalidateCriticalModules();
  await import(`./app.js?v=${BOOTSTRAP_BUILD}`);
  await import(`./src/home-dashboard-v2.js?v=${UPDATE_BUILD}`);
  await import(`./src/home-dashboard-sustainability.js?v=${UPDATE_BUILD}`);
  finishStartupSplash();
} catch (error) {
  stopRecoveryGuard();
  finishStartupSplash();
  if (loginForm) {
    loginForm.inert = false;
    loginForm.setAttribute("aria-busy", "false");
  }
  if (loginMessage) loginMessage.textContent = "O Volt não conseguiu iniciar. Recarregue a página.";
  document.documentElement.dataset.startupStatus = "ERROR";
  console.error("VOLT bootstrap failed", error);
}

try {
  await import(`./src/easter-egg.js?v=${UPDATE_BUILD}`);
} catch (error) {
  console.warn("VOLT easter egg unavailable", error);
}

try {
  await import(`./src/pwa-update.js?v=${UPDATE_BUILD}`);
} catch (error) {
  console.warn("VOLT update manager unavailable", error);
}
