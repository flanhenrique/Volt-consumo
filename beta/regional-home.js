import { formatMoney, normalizeRegionalContext } from "./mercosur-region.js";

const LOCALITY_KEY = "volt:beta:locality-context-v1";
const VERIFIED_WATER_TAX_STATES = new Set(["verified", "verified-excess-only", "residential-exempt"]);
let renderScheduled = false;
let lastCountry = null;

queueMicrotask(scheduleRegionalHome);
["volt:beta-data", "volt:locality-context", "volt:tariff-resolution", "volt:cycle-context"].forEach((eventName) => {
  window.addEventListener(eventName, scheduleRegionalHome);
});

function scheduleRegionalHome() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    renderRegionalHome();
  });
}

function renderRegionalHome() {
  const context = readContext();
  document.documentElement.lang = context.locale || "pt-BR";

  if (context.country !== "UY") {
    if (lastCountry === "UY") restoreBrazilLabels();
    lastCountry = context.country;
    return;
  }
  lastCountry = "UY";

  const resolution = window.VOLT_TARIFF_RESOLUTION || {};
  const values = window.VOLT_CYCLE_VALUES || {};
  const energy = resolution.internationalEstimate;
  const water = resolution.internationalWaterEstimate;
  const energyKnown = Boolean(energy?.valid);
  const waterKnown = Boolean(water?.valid);
  const energyTotal = energyKnown ? Number(energy.totalWithVat ?? energy.subtotalBeforeTax ?? 0) : null;
  const waterTotal = waterKnown ? Number(water.totalWaterWithVat ?? water.waterSubtotalBeforeTax ?? 0) : null;
  const waterTaxComplete = Boolean(waterKnown && VERIFIED_WATER_TAX_STATES.has(water.taxStatus));
  const waterFinalKnown = waterTaxComplete && !context.oseSanitation;
  const bothFinalKnown = energyKnown && waterFinalKnown;
  const knownTotal = (energyTotal || 0) + (waterTotal || 0);

  setText("#beta-greeting", localizeGreeting(document.querySelector("#beta-greeting")?.textContent));
  setText("#beta-water-cost", waterKnown ? formatMoney(waterTotal, context) : "—");
  setText("#beta-energy-cost", energyKnown ? formatMoney(energyTotal, context) : "—");
  setText("#beta-financial-total", energyKnown && waterKnown ? formatMoney(knownTotal, context) : "—");

  const summary = document.querySelector("#beta-summary-values");
  if (summary) {
    renderStats(summary, [
      ["Energía UTE · total con IVA", energyKnown ? formatMoney(energyTotal, context) : "Pendiente"],
      ["Agua OSE · total con IVA aplicable", waterKnown ? formatMoney(waterTotal, context) : "Pendiente"],
      [bothFinalKnown ? "Total estimado" : "Total parcial conocido", energyKnown && waterKnown ? formatMoney(knownTotal, context) : "Pendiente"]
    ]);
  }

  setText(
    "#beta-financial-comparison",
    bothFinalKnown
      ? "Estimación con los componentes tributarios modelados para UTE y agua OSE."
      : context.oseSanitation
        ? "UTE y agua OSE incluyen el IVA aplicable. Saneamiento todavía está pendiente."
        : "Complete los componentes regionales pendientes."
  );
  setText(
    "#beta-cycle-forecast",
    energyKnown
      ? `UTE: ${formatMoney(energyTotal, context)} con IVA${waterKnown ? ` · OSE: ${formatMoney(waterTotal, context)} con IVA aplicable al excedente sobre 15 m³` : ""}.`
      : "Complete los datos UTE para generar la estimación."
  );

  const title = document.querySelector(".financial-summary-card .summary-header h2");
  if (title) title.textContent = bothFinalKnown ? "Total estimado" : "Estimación regional";
  const eyebrow = document.querySelector(".financial-summary-card .eyebrow");
  if (eyebrow) eyebrow.textContent = "RESUMEN FINANCIERO";
  const energyPreview = document.querySelector(".utility-card.energy .financial-preview p");
  const waterPreview = document.querySelector(".utility-card.water .financial-preview p");
  if (energyPreview) energyPreview.textContent = "Total con IVA";
  if (waterPreview) waterPreview.textContent = "Total con IVA aplicable";

  setText(
    "#beta-energy-comparison",
    energyKnown
      ? `UTE · TRS · IVA ${Math.round(Number(energy.vatRate || 0) * 100)}% sobre energía y potencia`
      : "Configuración UTE incompleta"
  );
  setText(
    "#beta-water-comparison",
    waterKnown
      ? `OSE · ${water.zoneLabel || water.zone} · 0–15 m³ exentos${Number(water.taxableExcessM3 || 0) > 0 ? ` · ${formatNumber(water.taxableExcessM3, 3, context)} m³ con IVA` : ""}${water.sanitationDeclared ? " · saneamiento pendiente" : ""}`
      : "OSE · configuración incompleta"
  );

  const report = document.querySelector("#beta-report-comparison");
  if (report) {
    renderStats(report, [
      ["Energía", `${formatNumber(Number(values.energy?.consumption || 0), 1, context)} kWh`],
      ["Agua", `${formatNumber(Number(values.water?.consumption || 0), 3, context)} m³`],
      [bothFinalKnown ? "Total estimado" : "Total parcial conhecido", energyKnown && waterKnown ? formatMoney(knownTotal, context) : "Pendiente"]
    ]);
  }

  const flag = document.querySelector("#flag-badge");
  if (flag) {
    flag.textContent = "UTE";
    flag.dataset.regional = "UY";
  }
  const legacy = document.querySelector("#estimated-cost");
  if (legacy) legacy.textContent = energyKnown && waterKnown ? formatMoney(knownTotal, context) : energyKnown ? formatMoney(energyTotal, context) : "—";
}

function restoreBrazilLabels() {
  document.documentElement.lang = "pt-BR";
  const title = document.querySelector(".financial-summary-card .summary-header h2");
  if (title) title.textContent = "Total estimado";
  const eyebrow = document.querySelector(".financial-summary-card .eyebrow");
  if (eyebrow) eyebrow.textContent = "RESUMO FINANCEIRO";
  for (const selector of [".utility-card.energy .financial-preview p", ".utility-card.water .financial-preview p"]) {
    const element = document.querySelector(selector);
    if (element) element.textContent = "Estimativa";
  }
  const flag = document.querySelector("#flag-badge");
  if (flag) delete flag.dataset.regional;
}

function readContext() {
  if (window.VOLT_REGION_CONTEXT) return normalizeRegionalContext(window.VOLT_REGION_CONTEXT);
  try {
    return normalizeRegionalContext(JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}"));
  } catch {
    return normalizeRegionalContext({});
  }
}

function renderStats(container, items) {
  container.replaceChildren(...items.map(([label, value]) => {
    const row = document.createElement("div");
    const small = document.createElement("small");
    const strong = document.createElement("strong");
    small.textContent = label;
    strong.textContent = value;
    row.append(small, strong);
    return row;
  }));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function formatNumber(value, digits, context) {
  return Number(value || 0).toLocaleString(context.locale || "pt-BR", { maximumFractionDigits: digits });
}

function localizeGreeting(value) {
  return String(value || "").replace(/^Olá,?\s*/i, "Hola, ").replace(/^Olá!$/i, "¡Hola!");
}
