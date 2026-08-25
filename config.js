export const VOLT_CONFIG = Object.freeze({
  url: "https://zatwcrouojjqnuuabdif.supabase.co",
  publishableKey: "sb_publishable_Y6iBS989R-miV65onlQWew_Gof7GIqp"
});

const APPLICATION_BUILD = "20260825.2";
globalThis.__VOLT_BUILD__ = APPLICATION_BUILD;

const AUXILIARY_STYLES = Object.freeze([
  `./styles/reading-management.css?v=${APPLICATION_BUILD}`
]);

const AUXILIARY_MODULES = Object.freeze([
  "./src/consumption-reports.js?v=20260814.15",
  "./src/home-dashboard-v2.js?v=20260814.15",
  "./src/home-dashboard-sustainability.js?v=20260814.15",
  "./src/pwa-update.js?v=20260816.3",
  "./src/admin-user-view.js?v=20260814.15",
  "./src/admin-billing-context.js?v=20260814.15",
  "./src/canonical-billing-context.js?v=20260814.15",
  "./src/notifications.js?v=20260816.3",
  `./src/reading-management.js?v=${APPLICATION_BUILD}`
]);

function loadAuxiliaryStyles() {
  for (const styleUrl of AUXILIARY_STYLES) {
    if (document.querySelector(`link[href="${styleUrl}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = styleUrl;
    link.dataset.voltAuxiliaryStyle = APPLICATION_BUILD;
    document.head.append(link);
  }
}

function loadAuxiliaryModules() {
  loadAuxiliaryStyles();
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
