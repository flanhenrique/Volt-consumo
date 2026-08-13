let loadingPromise = null;

export function loadSupabaseRuntime() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const runtimeUrl = new URL("../vendor/supabase/supabase.js", import.meta.url);
    runtimeUrl.searchParams.set("v", "20260813.4");
    script.src = runtimeUrl.href;
    script.async = true;
    script.dataset.voltDependency = "supabase";
    script.addEventListener("load", () => {
      if (window.supabase?.createClient) resolve();
      else reject(new Error("O runtime Supabase foi carregado sem expor createClient."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar o runtime Supabase.")), { once: true });
    document.head.append(script);
  });
  return loadingPromise;
}
