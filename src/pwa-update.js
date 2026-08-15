const MODULE_BUILD = new URL(import.meta.url).searchParams.get("v") || "dev";
const VERSION_URL = "./version.json";
const SERVICE_WORKER_URL = "./sw.js";
const CHECK_COOLDOWN_MS = 30000;
const SAFE_STARTUP_STATUSES = new Set(["SIGNED_OUT", "MFA_REQUIRED", "READY", "ERROR"]);

let registration = null;
let banner = null;
let updateButton = null;
let progressRegion = null;
let progressTrack = null;
let progressFill = null;
let progressStatus = null;
let progressPercent = null;
let lastCheckAt = 0;
let applyingUpdate = false;
let initializationScheduled = false;
let reloadScheduled = false;

schedulePwaUpdateManager();

function installedBuild() {
  const runtimeBuild = String(globalThis.__VOLT_BUILD__ || "").trim();
  return runtimeBuild || MODULE_BUILD;
}

function schedulePwaUpdateManager() {
  if (initializationScheduled) return;
  initializationScheduled = true;

  const startWhenIdle = () => {
    const start = () => void initializePwaUpdateManager();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(start, { timeout: 2000 });
    } else {
      window.setTimeout(start, 600);
    }
  };

  const startupStatus = document.documentElement.dataset.startupStatus;
  if (SAFE_STARTUP_STATUSES.has(startupStatus)) {
    startWhenIdle();
    return;
  }

  const handleStartupStatus = (event) => {
    if (!SAFE_STARTUP_STATUSES.has(event.detail?.status)) return;
    window.removeEventListener("volt:startup-status", handleStartupStatus);
    startWhenIdle();
  };

  window.addEventListener("volt:startup-status", handleStartupStatus);
}

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
  link.href = `./styles/pwa-update.css?v=${encodeURIComponent(installedBuild())}`;
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
  if (activeRegistration.waiting && navigator.serviceWorker.controller) void checkForUpdate(true);

  activeRegistration.addEventListener("updatefound", () => {
    const worker = activeRegistration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller && !applyingUpdate) {
        void checkForUpdate(true);
      }
    });
  });
}

async function checkForUpdate(force = false) {
  const now = Date.now();
  if (!force && now - lastCheckAt < CHECK_COOLDOWN_MS) return;
  lastCheckAt = now;

  try {
    registration ||= await ensureRegistration();

    // Não confie apenas no número do bootstrap: em PWA o HTML/JS pode chegar
    // pela rede antes de o Service Worker novo estar efetivamente instalado.
    // Forçar update() garante que um worker novo apareça como installing/waiting.
    await registration.update().catch(() => undefined);

    const response = await fetch(`${VERSION_URL}?t=${now}`, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return;

    const remoteVersion = await response.json();
    const remoteBuild = String(remoteVersion?.build || "").trim();
    const currentBuild = installedBuild();
    const hasPendingWorker = Boolean(
      navigator.serviceWorker.controller && (registration.waiting || registration.installing)
    );
    const hasNewBuild = hasPendingWorker || Boolean(remoteBuild && currentBuild && remoteBuild !== currentBuild);

    if (hasNewBuild) {
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
  if (!applyingUpdate) resetUpdateProgress();
  const detail = banner.querySelector("[data-update-detail]");
  if (detail) {
    detail.textContent = remoteVersion?.message || "Melhorias e correções estão prontas para instalar.";
  }
  banner.hidden = false;
  requestAnimationFrame(() => { banner.dataset.visible = "true"; });
}

function hideUpdateBanner() {
  if (!banner || applyingUpdate) return;
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
    <div class="volt-update-progress" data-update-progress hidden>
      <div class="volt-update-progress-copy">
        <span data-update-progress-status>Preparando atualização…</span>
        <strong data-update-progress-percent>0%</strong>
      </div>
      <div class="volt-update-progress-track" data-update-progress-track role="progressbar" aria-label="Progresso da atualização" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="volt-update-progress-fill" data-update-progress-fill></span>
      </div>
    </div>
  `;
  updateButton = banner.querySelector(".volt-update-action");
  progressRegion = banner.querySelector("[data-update-progress]");
  progressTrack = banner.querySelector("[data-update-progress-track]");
  progressFill = banner.querySelector("[data-update-progress-fill]");
  progressStatus = banner.querySelector("[data-update-progress-status]");
  progressPercent = banner.querySelector("[data-update-progress-percent]");
  updateButton.addEventListener("click", () => void applyUpdate());
  document.body.append(banner);
}

function resetUpdateProgress() {
  if (!banner) return;
  delete banner.dataset.updating;
  delete banner.dataset.complete;
  if (updateButton) {
    updateButton.hidden = false;
    updateButton.disabled = false;
    updateButton.textContent = "Atualizar agora";
  }
  if (progressRegion) progressRegion.hidden = true;
  setUpdateProgress(0, "Preparando atualização…");
}

function setUpdateProgress(percent, status) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (progressFill) progressFill.style.width = `${value}%`;
  if (progressPercent) progressPercent.textContent = `${value}%`;
  if (progressStatus && status) progressStatus.textContent = status;
  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", String(value));
    if (status) progressTrack.setAttribute("aria-valuetext", `${status} ${value}%`);
  }
}

function beginUpdateProgress() {
  if (!banner) createUpdateBanner();
  banner.dataset.updating = "true";
  delete banner.dataset.complete;
  if (updateButton) {
    updateButton.disabled = true;
    updateButton.hidden = true;
  }
  if (progressRegion) progressRegion.hidden = false;
  setUpdateProgress(4, "Preparando atualização…");
}

async function applyUpdate() {
  if (applyingUpdate) return;
  applyingUpdate = true;
  beginUpdateProgress();
  await clearUpdateBadge();

  try {
    registration ||= await ensureRegistration();

    setUpdateProgress(10, "Verificando nova versão…");
    const waitingBeforeUpdate = registration.waiting;
    if (!waitingBeforeUpdate) {
      setUpdateProgress(14, "Baixando dados…");
      await registration.update();
    }

    const candidate = registration.waiting || registration.installing || waitingBeforeUpdate;
    if (candidate) {
      if (candidate.state === "installing") setUpdateProgress(18, "Baixando dados…");
      const worker = await waitUntilInstalled(candidate);
      if (worker?.state === "installed") {
        setUpdateProgress(Math.max(currentProgress(), 78), "Instalando dados…");
        worker.postMessage({ type: "SKIP_WAITING" });
        return;
      }
    }

    setUpdateProgress(92, "Aplicando atualização…");
    finishUpdateAndReload();
  } catch {
    setUpdateProgress(92, "Finalizando atualização…");
    finishUpdateAndReload();
  }
}

function currentProgress() {
  return Number(progressTrack?.getAttribute("aria-valuenow")) || 0;
}

function waitUntilInstalled(worker) {
  if (!worker || ["installed", "activated"].includes(worker.state)) return Promise.resolve(worker);
  return new Promise((resolve) => {
    const onStateChange = () => {
      if (worker.state === "installing") setUpdateProgress(Math.max(currentProgress(), 22), "Baixando dados…");
      if (worker.state === "installed") setUpdateProgress(Math.max(currentProgress(), 72), "Download concluído. Instalando dados…");
      if (["installed", "activated", "redundant"].includes(worker.state)) {
        worker.removeEventListener("statechange", onStateChange);
        resolve(worker);
      }
    };
    worker.addEventListener("statechange", onStateChange);
  });
}

function finishUpdateAndReload() {
  if (reloadScheduled) return;
  reloadScheduled = true;
  setUpdateProgress(100, "Atualização completa");
  if (banner) banner.dataset.complete = "true";
  window.setTimeout(() => location.reload(), 850);
}

function handleControllerChange() {
  if (applyingUpdate) {
    setUpdateProgress(96, "Ativando nova versão…");
    window.setTimeout(finishUpdateAndReload, 180);
  } else {
    void checkForUpdate(true);
  }
}

function handleServiceWorkerMessage(event) {
  const payload = event.data || {};
  if (payload.type === "VOLT_UPDATE_PROGRESS" && applyingUpdate) {
    const progress = Math.max(currentProgress(), Number(payload.progress) || 0);
    const status = payload.phase === "install"
      ? "Instalando dados…"
      : payload.phase === "complete"
        ? "Atualização completa"
        : "Baixando dados…";
    setUpdateProgress(progress, status);
    return;
  }

  if (payload.type === "VOLT_UPDATED") {
    if (applyingUpdate) {
      setUpdateProgress(96, "Ativando nova versão…");
    } else {
      void checkForUpdate(true);
    }
  }
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
