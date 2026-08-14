let loadingPromise = null;
let billingWorkflowStarted = false;

function startBillingWorkflow() {
  if (billingWorkflowStarted) return;
  billingWorkflowStarted = true;
  void import("./billing-workflow.js?v=20260814.1")
    .then((module) => module.startBillingWorkflow?.())
    .catch((error) => console.warn("VOLT billing workflow unavailable", error instanceof Error ? error.message : "unknown_error"));
}

export function loadSupabaseRuntime() {
  if (window.supabase?.createClient) {
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
    script.addEventListener("load", () => {
      if (window.supabase?.createClient) {
        startBillingWorkflow();
        resolve();
      } else reject(new Error("O runtime Supabase foi carregado sem expor createClient."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o runtime Supabase.")), { once: true });
    document.head.append(script);
  });
  return loadingPromise;
}
