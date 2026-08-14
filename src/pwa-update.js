const CURRENT_BUILD = new URL(import.meta.url).searchParams.get("v") || "dev";
const VERSION_URL = "./version.json";
const SERVICE_WORKER_URL = "./sw.js";
const CHECK_COOLDOWN_MS = 30000;

let registration = null;
let banner = null;
let updateButton = null;
let lastCheckAt = 0;
let applyingUpdate = false;

void initializePwaUpdateManager();

async function initializePwaUpdateManager() {
  injectUpdateStylesheet();
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;

  bindResumeChecks();
  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);

  try {
    registration = await ensureRegistration();
    observeRegistration(registration);
    await checkForUpdate(true);
  } catch {
    // Atualização é um recurso auxiliar: falhas aqui nunca bloqueiam o VOLT.
  }
}

function injectUpdateStylesheet() {
  if (document.querySelector('link[data-volt-pwa-update-style="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/pwa-update.css?v=${encodeURIComponent(CURRENT_BUILD)}`;
  link.dataset.voltPwaUpdateStyle = "true";
  document.head.append(link);
}

function bindResumeChecks() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForUpdate();
  });
  window.addEventListener("pageshow", () => void checkForUpdate());
  window.addEventListener("focus", () => void checkForUpdate());
}

async function ensureRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("./");
  return existing || navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "./" });
}

function observeRegistration(activeRegistration) {
  if (!activeRegistration) return;
  if (activeRegistration.waiting && navigator.serviceWorker.controller) showUpdateBanner();

  activeRegistration.addEventListener("updatefound", () => {
    const worker = activeRegistration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) void checkForUpdate(true);
    });
  });
}

async function checkForUpdate(force = false) {
  const now = Date.now();
  if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return;
  lastCheckAt = now;

  try {
    registration ||= await ensureRegistration();
    await registration.update().catch(() => undefined);

    const response = await fetch(`${VERSION_URL}?t=${now}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return;

    const remoteVersion = await response.json();
    const remoteBuild = String(remoteVersion?.build || "").trim();
    const hasNewBuild = Boolean(remoteBuild && remoteBuild !== CURRENT_BUILD);
    const hasWaitingWorker = Boolean(registration.waiting && navigator.serviceWorker.controller);

    if (hasNewBuild || hasWaitingWorker) {
      showUpdateBanner(remoteVersion);
      await setUpdateBadge();
    } else {
      hideUpdateBanner();
      await clearUpdateBadge();
    }
  } catch {
    // Sem rede, o PWA segue usando o cache atual normalmente.
  }
}

function showUpdateBanner(remoteVersion = {}) {
  if (!banner) createUpdateBanner();
  const detail = banner.querySelector("[data-update-detail]");
  if (detail) {
    detail.textContent = remoteVersion?.message || "Melhorias e correções estão prontas para instalar.";
  }
  banner.hidden = false;
  requestAnimationFrame(() => { banner.dataset.visible = "true"; });
}

function hideUpdateBanner() {
  if (!banner) return;
  delete banner.dataset.visible;
  window.setTimeout(() => {
    if (!banner?.dataset.visible) banner.hidden = true;
  }, 240);
}

function createUpdateBanner() {
  banner = document.createElement("aside");
  banner.className = "volt-update-banner";
  banner.hidden = true;
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.innerHTML = `
    <span class="volt-update-icon" aria-hidden="true">↑</span>
    <span class="volt-update-copy">
      <strong>Nova versão do VOLT disponível</strong>
      <small data-update-detail>Melhorias e correções estão prontas para instalar.</small>
    </span>
    <button class="volt-update-action" type="button">Atualizar agora</button>
  `;
  updateButton = banner.querySelector(".volt-update-action");
  updateButton.addEventListener("click", () => void applyUpdate());
  document.body.append(banner);
}

async function applyUpdate() {
  if (applyingUpdate) return;
  applyingUpdate = true;
  if (updateButton) {
    updateButton.disabled = true;
    updateButton.textContent = "Atualizando…";
  }

  await clearUpdateBadge();

  try {
    registration ||= await ensureRegistration();
    await registration.update().catch(() => undefined);

    const candidate = registration.waiting || registration.installing;
    if (candidate) {
      const worker = await waitUntilInstalled(candidate);
      if (worker?.state === "installed") {
        worker.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(() => location.reload(), 1200);
        return;
      }
    }

    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_VOLT_CACHE" });
    window.setTimeout(() => location.reload(), 120);
  } catch {
    location.reload();
  }
}

function waitUntilInstalled(worker) {
  if (!worker || ["installed", "activated"].includes(worker.state)) return Promise.resolve(worker);
  return new Promise((resolve) => {
    const onStateChange = () => {
      if (["installed", "activated", "redundant"].includes(worker.state)) {
        worker.removeEventListener("statechange", onStateChange);
        resolve(worker);
      }
    };
    worker.addEventListener("statechange", onStateChange);
  });
}

function handleControllerChange() {
  if (applyingUpdate) location.reload();
  else void checkForUpdate(true);
}

function handleServiceWorkerMessage(event) {
  if (event.data?.type === "VOLT_UPDATED" && !applyingUpdate) void checkForUpdate(true);
}

async function setUpdateBadge() {
  try {
    if (typeof navigator.setAppBadge === "function") await navigator.setAppBadge(1);
  } catch {
    // Badging é opcional e depende do navegador/SO.
  }
}

async function clearUpdateBadge() {
  try {
    if (typeof navigator.clearAppBadge === "function") await navigator.clearAppBadge();
  } catch {
    // Badging é opcional e depende do navegador/SO.
  }
}
