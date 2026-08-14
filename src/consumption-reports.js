import { getApplicationStateSnapshot } from "./app-state.js?v=20260813.7";
import { buildConsumptionReportData } from "./consumption-report-data.js?v=20260813.8";
import { ensureGeneralConsumptionReport, renderGeneralConsumptionReport } from "./consumption-report-general.js?v=20260813.7";
import { ensureUtilityConsumptionReport, renderUtilityConsumptionReport } from "./consumption-report-utility.js?v=20260813.8";
import { exportConsumptionReport } from "./consumption-report-export.js?v=20260813.7";

window.addEventListener("volt:startup-status", (event) => {
  if (event.detail?.status === "READY") queueMicrotask(refresh);
});

document.addEventListener("change", (event) => {
  if (event.target.matches?.("[data-report-period]")) setTimeout(refresh, 0);
});

document.addEventListener("click", (event) => {
  const tab = event.target.closest?.("[data-report-tab]");
  if (!tab) return;
  const mode = tab.dataset.reportTab;
  if (["energy", "water"].includes(mode)) {
    const select = document.querySelector("[data-report-period]");
    if (select && select.value !== "cycle") {
      select.value = "cycle";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  setTimeout(refresh, 0);
}, true);

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-report-export]");
  if (!button) return;
  const page = document.getElementById("page-reports");
  if (!page || page.hidden) return;
  const mode = activeMode();
  if (!["overview", "energy", "water"].includes(mode)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const state = getApplicationStateSnapshot();
  if (state?.status !== "READY") return;
  const period = ["energy", "water"].includes(mode) ? "cycle" : selectedPeriod();
  exportConsumptionReport(mode, state, period);
}, true);

document.addEventListener("click", (event) => {
  const button = event.target.closest?.(".report-library-list button");
  if (button?.querySelector("strong")?.textContent !== "Relatório de consumo") return;
  setTimeout(() => document.querySelector('[data-report-tab="overview"]')?.click(), 0);
});

function refresh() {
  const state = getApplicationStateSnapshot();
  const page = document.getElementById("page-reports");
  if (!page || state?.status !== "READY" || !state.settings?.energy || !state.settings?.water) return;
  ensureStyles();
  ensureCycleDefault();
  ensureGeneralConsumptionReport();
  ensureUtilityConsumptionReport("energy");
  ensureUtilityConsumptionReport("water");
  const mode = activeMode();
  const period = ["energy", "water"].includes(mode) ? "cycle" : selectedPeriod();
  const energy = buildConsumptionReportData("energy", state, period);
  const water = buildConsumptionReportData("water", state, period);
  renderGeneralConsumptionReport(energy, water, period);
  renderUtilityConsumptionReport("energy", buildConsumptionReportData("energy", state, "cycle"));
  renderUtilityConsumptionReport("water", buildConsumptionReportData("water", state, "cycle"));
}

function ensureCycleDefault() {
  const select = document.querySelector("[data-report-period]");
  if (!select || select.dataset.cycleDefaultApplied === "true") return;
  select.dataset.cycleDefaultApplied = "true";
  if (select.value === "6m") {
    select.value = "cycle";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function activeMode() {
  return document.querySelector("[data-report-tab][aria-pressed='true']")?.dataset.reportTab || "overview";
}

function selectedPeriod() {
  return document.querySelector("[data-report-period]")?.value || "cycle";
}

function ensureStyles() {
  ensureStyle("./styles/consumption-reports.css?v=20260813.8", "consumption-reports-style");
  ensureStyle("./styles/reports-mobile-compact.css?v=20260813.7", "reports-mobile-compact-style");
}

function ensureStyle(href, key) {
  if (document.querySelector(`link[data-${key}="true"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(`data-${key}`, "true");
  document.head.append(link);
}
