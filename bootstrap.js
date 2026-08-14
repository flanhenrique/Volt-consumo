const BOOTSTRAP_BUILD = "20260814.11";
const ATOMIC_RELEASE = "20260813.7";

const CRITICAL_MODULES = Object.freeze([
  `./packages/consumption-domain/browser/index.js?v=${ATOMIC_RELEASE}`,
  `./src/app-state.js?v=${ATOMIC_RELEASE}`,
  `./config.js?v=${ATOMIC_RELEASE}`,
  `./src/cycles.js?v=${ATOMIC_RELEASE}`,
  `./src/renderer.js?v=${ATOMIC_RELEASE}`,
  `./src/supabase-loader.js?v=${ATOMIC_RELEASE}`,
  `./src/volt-service.js?v=${ATOMIC_RELEASE}`
]);

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");

const startupWatchdog = window.setTimeout(() => {
  const status = document.documentElement.dataset.startupStatus || "BOOTING";
  if (!["BOOTING", "RESTORING_SESSION"].includes(status)) return;
  if (loginForm) {
    loginForm.inert = false;
    loginForm.setAttribute("aria-busy", "false");
  }
  if (loginMessage) loginMessage.textContent = "Não foi possível concluir a inicialização. Recarregue a página.";
}, 9000);

try {
  await refreshCriticalModules();
  await import(`./app.js?v=${BOOTSTRAP_BUILD}`);
} catch (error) {
  if (loginForm) {
    loginForm.inert = false;
    loginForm.setAttribute("aria-busy", "false");
  }
  if (loginMessage) loginMessage.textContent = "O Volt não conseguiu iniciar. Recarregue a página.";
  document.documentElement.dataset.startupStatus = "ERROR";
  console.error("VOLT bootstrap failed", error);
} finally {
  window.clearTimeout(startupWatchdog);
}

async function refreshCriticalModules() {
  await Promise.all(CRITICAL_MODULES.map(async (moduleUrl) => {
    try {
      const response = await fetch(moduleUrl, { cache: "reload" });
      if (!response.ok) throw new Error(`${moduleUrl}: ${response.status}`);
    } catch (error) {
      if (!navigator.onLine) return;
      throw error;
    }
  }));
}
