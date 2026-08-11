// Volt Beta — inicialização prioritária e cliente Supabase compartilhado.
// Este módulo carrega antes do app.js através de environment.js.

const STARTUP_HEAVY_METHODS = new Set([
  "refreshAdmin",
  "refreshFeatureFlags",
  "refreshOperationalMetrics",
  "refreshOrganizations"
]);

let apiTarget = null;
let apiFacade = null;
let startupDataRequested = false;
let startupReady = false;
let idleScheduled = false;
const deferredCalls = new Map();

installSupabaseSingleton();
installBetaApiFacade();
observeDashboardPriority();

function installSupabaseSingleton() {
  const factory = window.supabase?.createClient;
  if (typeof factory !== "function" || factory.__voltSingleton) return;

  const clients = new Map();
  const wrapped = function createVoltClient(url, key, options) {
    const cacheKey = `${String(url || "")}::${String(key || "")}`;
    if (clients.has(cacheKey)) return clients.get(cacheKey);
    const client = factory.call(this, url, key, options);
    clients.set(cacheKey, client);
    return client;
  };
  Object.defineProperty(wrapped, "__voltSingleton", { value: true });
  window.supabase.createClient = wrapped;
}

function installBetaApiFacade() {
  const existing = window.VOLT_BETA_API;
  if (existing) setApi(existing);

  try {
    Object.defineProperty(window, "VOLT_BETA_API", {
      configurable: true,
      enumerable: true,
      get() { return apiFacade || apiTarget; },
      set(value) { setApi(value); }
    });
  } catch {
    // Se o navegador não permitir redefinir, o app continua funcional sem a fachada.
  }
}

function setApi(value) {
  if (!value || typeof value !== "object") {
    apiTarget = value;
    apiFacade = value;
    return;
  }
  apiTarget = value;
  apiFacade = new Proxy(value, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function" || !STARTUP_HEAVY_METHODS.has(String(property))) return member;
      return (...args) => {
        if (startupReady) return member(...args);
        deferredCalls.set(String(property), { member, args });
        scheduleDeferredWork();
        return Promise.resolve(readSnapshotFor(String(property), target));
      };
    }
  });
}

function readSnapshotFor(method, api) {
  try {
    if (method === "refreshAdmin") return api.getAdminSnapshot?.();
    if (method === "refreshFeatureFlags") return api.getFeatureFlagsSnapshot?.();
    if (method === "refreshOperationalMetrics") return api.getOperationalSnapshot?.();
    if (method === "refreshOrganizations") return api.getOrganizationSnapshot?.();
  } catch {
    return undefined;
  }
  return undefined;
}

function observeDashboardPriority() {
  const begin = () => {
    const dashboard = document.querySelector("#dashboard");
    if (!dashboard) {
      setTimeout(begin, 25);
      return;
    }
    const tryLoad = () => {
      if (dashboard.hidden || startupDataRequested) return;
      const api = window.VOLT_BETA_API;
      if (!api?.refreshData) {
        setTimeout(tryLoad, 0);
        return;
      }
      startupDataRequested = true;
      performance.mark?.("volt-account-load-start");
      Promise.resolve(api.refreshData())
        .catch(() => false)
        .finally(() => {
          startupReady = true;
          performance.mark?.("volt-account-load-ready");
          try {
            performance.measure?.("volt-account-load", "volt-account-load-start", "volt-account-load-ready");
          } catch {}
          window.dispatchEvent(new CustomEvent("volt:startup-ready"));
          flushDeferredWork();
        });
    };
    new MutationObserver(tryLoad).observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
    tryLoad();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", begin, { once: true });
  else begin();
}

function scheduleDeferredWork() {
  if (idleScheduled || startupReady) return;
  idleScheduled = true;
  const run = () => {
    idleScheduled = false;
    if (startupReady) flushDeferredWork();
    else setTimeout(scheduleDeferredWork, 250);
  };
  if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 1800 });
  else setTimeout(run, 600);
}

function flushDeferredWork() {
  if (!startupReady || !deferredCalls.size) return;
  const tasks = [...deferredCalls.values()];
  deferredCalls.clear();
  Promise.allSettled(tasks.map(({ member, args }) => Promise.resolve().then(() => member(...args))));
}
