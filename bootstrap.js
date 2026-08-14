const BOOTSTRAP_BUILD = "20260814.12";
const STUCK_STARTUP_STATUSES = new Set(["BOOTING", "RESTORING_SESSION"]);
const RECOVERY_DELAY_MS = 9000;

const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
let recoveryInterval = null;
let recoveryActive = false;

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
