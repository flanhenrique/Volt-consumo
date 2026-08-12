// Volt Beta — prioridade de dados da conta, cliente Supabase compartilhado e
// trabalho administrativo fora do caminho crítico do primeiro render.

const STARTUP_HEAVY_METHODS = new Set([
  "refreshAdmin",
  "refreshFeatureFlags",
  "refreshOperationalMetrics",
  "refreshOrganizations"
]);
const DEFERRED_RPC_GROUP = Object.freeze({
  beta_admin_bootstrap: "admin",
  beta_organization_context: "admin",
  beta_admin_snapshot: "admin",
  beta_feature_flags_snapshot: "flags",
  beta_admin_operational_snapshot: "metrics"
});
const CORE_ACCOUNT_TABLES = new Set([
  "meter_readings",
  "user_settings",
  "water_readings",
  "water_settings"
]);
const DATA_REFRESH_COOLDOWN_MS = 1500;

let apiTarget = null;
let apiFacade = null;
let startupReady = false;
let coreDataFetched = false;
let idleScheduled = false;
let dataRefreshPromise = null;
let lastDataRefreshAt = 0;
const completedCoreTables = new Set();
const deferredCalls = new Map();
const deferredRpcGroups = new Set();

installSupabaseSingleton();
installBetaApiFacade();
observeStartupReady();

function installSupabaseSingleton() {
  const factory = window.supabase?.createClient;
  if (typeof factory !== "function" || factory.__voltSingleton) return;

  const clients = new Map();
  const wrapped = function createVoltClient(url, key, options = {}) {
    const cacheKey = `${String(url || "")}::${String(key || "")}`;
    if (clients.has(cacheKey)) return clients.get(cacheKey);

    const originalFetch = options?.global?.fetch || window.fetch.bind(window);
    const trackedFetch = async (input, init) => {
      const table = accountTableFromRequest(input);
      try {
        return await originalFetch(input, init);
      } finally {
        if (table) markCoreTableComplete(table);
      }
    };
    const client = factory.call(this, url, key, {
      ...options,
      global: { ...(options.global || {}), fetch: trackedFetch }
    });
    wrapHeavyRpc(client);
    clients.set(cacheKey, client);
    return client;
  };
  Object.defineProperty(wrapped, "__voltSingleton", { value: true });
  window.supabase.createClient = wrapped;
}

function accountTableFromRequest(input) {
  let url;
  try {
    const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
    url = new URL(raw, location.href);
  } catch {
    return "";
  }
  if (!/\/rest\/v1\//.test(url.pathname)) return "";
  const encodedTable = url.pathname.split("/rest/v1/")[1]?.split("/")[0] || "";
  const table = decodeURIComponent(encodedTable);
  for (const expected of CORE_ACCOUNT_TABLES) {
    if (table === expected || table.endsWith(`_${expected}`)) return expected;
  }
  return "";
}

function markCoreTableComplete(table) {
  if (startupReady || !CORE_ACCOUNT_TABLES.has(table)) return;
  completedCoreTables.add(table);
  coreDataFetched = completedCoreTables.size === CORE_ACCOUNT_TABLES.size;
}

function wrapHeavyRpc(client) {
  if (!client || typeof client.rpc !== "function" || client.rpc.__voltDeferred) return;
  const originalRpc = client.rpc.bind(client);
  const wrappedRpc = function voltRpc(fn, args, options) {
    const group = DEFERRED_RPC_GROUP[String(fn || "")];
    if (!startupReady && group) {
      deferredRpcGroups.add(group);
      scheduleDeferredWork();
      // O chamador atual só verifica data/error. A resposta temporária permite
      // que app.js avance até loadUserData sem esperar bootstrap/admin/métricas.
      return Promise.resolve({ data: null, error: null, status: 200, statusText: "deferred" });
    }
    return originalRpc(fn, args, options);
  };
  Object.defineProperty(wrappedRpc, "__voltDeferred", { value: true });
  try {
    client.rpc = wrappedRpc;
  } catch {
    // SDK não gravável: segue sem otimização de RPC, preservando funcionalidade.
  }
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
      const method = String(property);
      if (typeof member !== "function") return member;
      if (method === "refreshData") return (...args) => runDataRefresh(member, args);
      if (!STARTUP_HEAVY_METHODS.has(method)) return member;
      return (...args) => {
        if (startupReady) return member(...args);
        deferredCalls.set(method, { member, args });
        scheduleDeferredWork();
        return Promise.resolve(readSnapshotFor(method, target));
      };
    }
  });
}

function runDataRefresh(member, args) {
  if (!startupReady) return Promise.resolve(false);
  if (dataRefreshPromise) return dataRefreshPromise;
  const now = performance.now();
  if (now - lastDataRefreshAt < DATA_REFRESH_COOLDOWN_MS) return Promise.resolve(false);
  lastDataRefreshAt = now;
  dataRefreshPromise = Promise.resolve()
    .then(() => member(...args))
    .finally(() => {
      lastDataRefreshAt = performance.now();
      dataRefreshPromise = null;
    });
  return dataRefreshPromise;
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
    lastDataRefreshAt = performance.now();
    performance.mark?.("volt-account-load-ready");
    window.dispatchEvent(new CustomEvent("volt:account-data-ready"));
    window.dispatchEvent(new CustomEvent("volt:startup-ready"));
    flushDeferredWork();
    flushDeferredRpcGroups();
  };

  // Vários módulos administrativos também publicam volt:beta-data. Só aceitamos
  // esse evento depois que as quatro consultas-base da conta finalizaram.
  window.addEventListener("volt:beta-data", () => {
    if (coreDataFetched) finish();
  });

  // Fail-safe para falha de rede/SDK inesperada. O render principal do app
  // continua sendo responsável por sua própria mensagem de erro/cache.
  window.setTimeout(finish, 5000);
}

function scheduleDeferredWork() {
  if (idleScheduled || startupReady) return;
  idleScheduled = true;
  const run = () => {
    idleScheduled = false;
    if (startupReady) {
      flushDeferredWork();
      flushDeferredRpcGroups();
    } else {
      setTimeout(scheduleDeferredWork, 250);
    }
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

function flushDeferredRpcGroups() {
  if (!startupReady || !deferredRpcGroups.size) return;
  const groups = new Set(deferredRpcGroups);
  deferredRpcGroups.clear();
  const api = window.VOLT_BETA_API;
  const tasks = [];
  if (groups.has("admin")) tasks.push(() => api?.refreshAdmin?.());
  if (groups.has("flags")) tasks.push(() => api?.refreshFeatureFlags?.());
  if (groups.has("metrics")) tasks.push(() => api?.refreshOperationalMetrics?.());
  Promise.allSettled(tasks.map((task) => Promise.resolve().then(task)));
}
