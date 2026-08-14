export const VOLT_CONFIG = Object.freeze({
  url: "https://zatwcrouojjqnuuabdif.supabase.co",
  publishableKey: "sb_publishable_Y6iBS989R-miV65onlQWew_Gof7GIqp"
});

const AUXILIARY_MODULES = Object.freeze([
  "./src/consumption-reports.js?v=20260814.15",
  "./src/home-dashboard-v2.js?v=20260814.15",
  "./src/home-dashboard-sustainability.js?v=20260814.15",
  "./src/pwa-update.js?v=20260814.15",
  "./src/admin-user-view.js?v=20260814.15"
]);

function loadAuxiliaryModules() {
  for (const moduleUrl of AUXILIARY_MODULES) {
    void import(moduleUrl).catch((error) => {
      console.warn("VOLT auxiliary module unavailable", moduleUrl, error instanceof Error ? error.message : "unknown_error");
    });
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => window.setTimeout(loadAuxiliaryModules, 0), { once: true });
} else {
  window.setTimeout(loadAuxiliaryModules, 0);
}
