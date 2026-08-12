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
let startupReady = false;
let idleScheduled = false;
const deferredCalls = new Map();

installSupabaseSingleton();
installBetaApiFacade();
observeStartupReady();

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

function observeStartupReady() {
  const finish = () => {
    if (startupReady) return;
    startupReady = true;
    performance.mark?.("volt-account-load-ready");
    window.dispatchEvent(new CustomEvent("volt:startup-ready"));
    flushDeferredWork();
  };

  // app.js é a única autoridade para buscar os dados iniciais da conta.
  // Antes este módulo chamava refreshData() ao detectar o dashboard visível,
  // disparando uma segunda leitura de energia/água enquanto o login ainda
  // concluía. O primeiro volt:beta-data agora apenas sinaliza que a carga
  // prioritária terminou.
  window.addEventListener("volt:beta-data", finish, { once: true });

  // Fail-safe: se um erro de renderização impedir o evento, não mantenha as
  // funções administrativas bloqueadas indefinidamente.
  window.setTimeout(finish, 3500);
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
