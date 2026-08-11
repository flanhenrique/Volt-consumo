const DEFAULT_LEGACY_LIGHTING_FEE = 32;
const LOCALITY_KEY = "volt:beta:locality-context-v1";

let initialRefreshStarted = false;
let lightingMigrationStarted = false;

queueMicrotask(initializeStartupDataSync);

function initializeStartupDataSync() {
  const dashboard = document.querySelector("#dashboard");
  if (!dashboard) return;

  const tryRefresh = () => {
    if (dashboard.hidden || initialRefreshStarted) return;
    const api = window.VOLT_BETA_API;
    if (!api?.refreshData) return;

    initialRefreshStarted = true;
    setLoadingState(true);
    Promise.resolve(api.refreshData())
      .catch(() => false)
      .finally(() => {
        setLoadingState(false);
        migrateLegacyLightingFallback();
      });
  };

  new MutationObserver(tryRefresh).observe(dashboard, {
    attributes: true,
    attributeFilter: ["hidden"]
  });

  window.addEventListener("volt:locality-context", () => {
    migrateLegacyLightingFallback();
  });

  tryRefresh();
  window.setTimeout(tryRefresh, 0);
}

function setLoadingState(loading) {
  const readingMessage = document.querySelector("#reading-message");
  if (!readingMessage) return;
  if (loading) {
    readingMessage.dataset.startupLoading = "true";
    readingMessage.textContent = "Carregando leituras da sua conta…";
    return;
  }
  if (readingMessage.dataset.startupLoading === "true") {
    delete readingMessage.dataset.startupLoading;
    if (readingMessage.textContent === "Carregando leituras da sua conta…") readingMessage.textContent = "";
  }
}

function migrateLegacyLightingFallback() {
  if (lightingMigrationStarted) return;
  const context = readLocality();
  if (!context.state || !context.city) return;

  const state = String(context.state).trim().toUpperCase();
  const city = normalize(context.city);
  if (state === "AM" && city === "manaus") return;

  const input = document.querySelector("#lighting-fee");
  const form = document.querySelector("#settings-form");
  if (!input || !form) return;

  const current = Number(input.value || 0);
  if (Math.abs(current - DEFAULT_LEGACY_LIGHTING_FEE) > 0.005) return;

  const account = window.VOLT_BETA_API?.getSnapshot?.()?.account || {};
  const accountKey = String(account.email || "anonymous").trim().toLowerCase();
  const markerKey = `volt-beta-lighting-default-migrated:${accountKey}`;
  if (safeStorageGet(markerKey) === "true") return;

  lightingMigrationStarted = true;
  input.value = "0.00";
  safeStorageSet(markerKey, "true");

  const message = document.querySelector("#settings-message");
  if (message) {
    message.textContent = "Taxa fixa de R$ 32 removida: iluminação pública depende da regra do município.";
  }

  try {
    form.requestSubmit();
  } catch {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

function readLocality() {
  const published = window.VOLT_LOCALITY_CONTEXT;
  if (published && typeof published === "object") return published;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage indisponível */ }
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
