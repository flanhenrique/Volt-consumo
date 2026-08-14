let loadingPromise = null;
let billingWorkflowStarted = false;
let authLockHardened = false;

const RUNTIME_LOAD_TIMEOUT_MS = 8000;

async function runWithoutBrowserWebLock(_name, _acquireTimeout, operation) {
  return operation();
}

function hardenSupabaseAuthLock() {
  if (authLockHardened || !window.supabase?.createClient) return;

  const runtime = window.supabase;
  const originalCreateClient = runtime.createClient.bind(runtime);
  const hardenedRuntime = Object.create(runtime);

  Object.defineProperty(hardenedRuntime, "createClient", {
    configurable: false,
    enumerable: true,
    writable: false,
    value(url, key, options = {}) {
      return originalCreateClient(url, key, {
        ...options,
        auth: {
          ...(options.auth || {}),
          lock: runWithoutBrowserWebLock
        }
      });
    }
  });

  window.supabase = hardenedRuntime;
  authLockHardened = true;
}

function startBillingWorkflow() {
  if (billingWorkflowStarted) return;
  billingWorkflowStarted = true;
  void import("./billing-workflow.js?v=20260813.7")
    .then((module) => module.startBillingWorkflow?.())
    .catch((error) => console.warn("VOLT billing workflow unavailable", error instanceof Error ? error.message : "unknown_error"));
}

export function loadSupabaseRuntime() {
  if (window.supabase?.createClient) {
    hardenSupabaseAuthLock();
    startBillingWorkflow();
    return Promise.resolve();
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const runtimeUrl = new URL("../vendor/supabase/supabase.js", import.meta.url);
    runtimeUrl.searchParams.set("v", "20260813.7");
    script.src = runtimeUrl.href;
    script.async = true;
    script.dataset.voltDependency = "supabase";

    const timeoutId = window.setTimeout(() => {
      reject(new Error("O carregamento da autenticação demorou demais. Tente novamente."));
    }, RUNTIME_LOAD_TIMEOUT_MS);

    script.addEventListener("load", () => {
      window.clearTimeout(timeoutId);
      if (window.supabase?.createClient) {
        hardenSupabaseAuthLock();
        startBillingWorkflow();
        resolve();
      } else reject(new Error("O runtime Supabase foi carregado sem expor createClient."));
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      reject(new Error("Não foi possível carregar o runtime Supabase."));
    }, { once: true });
    document.head.append(script);
  }).catch((error) => {
    loadingPromise = null;
    throw error;
  });

  return loadingPromise;
}
