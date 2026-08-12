import { formatMoney, normalizeRegionalContext } from "./mercosur-region.js";

const LOCALITY_KEY = "volt:beta:locality-context-v1";
queueMicrotask(renderRegionalHome);
window.addEventListener("volt:beta-data", renderRegionalHome);
window.addEventListener("volt:locality-context", renderRegionalHome);
window.addEventListener("volt:tariff-resolution", renderRegionalHome);
window.addEventListener("volt:cycle-context", renderRegionalHome);

function renderRegionalHome() {
  const context = readContext();
  document.documentElement.lang = context.locale || "pt-BR";
  if (context.country !== "UY") return restoreBrazilLabels();

  const resolution = window.VOLT_TARIFF_RESOLUTION || {};
  const values = window.VOLT_CYCLE_VALUES || {};
  const energyEstimate = resolution.internationalEstimate;
  const energyKnown = Boolean(energyEstimate?.valid);
  const energyTotal = energyKnown ? Number(energyEstimate.subtotalBeforeTax || 0) : null;

  setText("#beta-greeting", localizeGreeting(document.querySelector("#beta-greeting")?.textContent));
  setText("#beta-water-cost", "—");
  setText("#beta-energy-cost", energyKnown ? formatMoney(energyTotal, context) : "—");
  setText("#beta-financial-total", energyKnown ? formatMoney(energyTotal, context) : "—");

  const summary = document.querySelector("#beta-summary-values");
  if (summary) renderStats(summary, [
    ["Energía · subtotal sin IVA", energyKnown ? formatMoney(energyTotal, context) : "Pendiente"],
    ["Agua · OSE", "Pendiente"],
    ["Total general", "Pendiente de impuestos y agua"]
  ]);

  setText("#beta-financial-comparison", "Comparación financiera pendiente hasta completar impuestos y agua de Uruguay.");
  setText("#beta-cycle-forecast", energyKnown ? `Referencia UTE actual: ${formatMoney(energyTotal, context)} sin IVA.` : "Complete los datos UTE para generar la estimación.");

  const financialTitle = document.querySelector(".financial-summary-card .summary-header h2");
  if (financialTitle) financialTitle.textContent = "Estimación regional";
  const financialEyebrow = document.querySelector(".financial-summary-card .eyebrow");
  if (financialEyebrow) financialEyebrow.textContent = "RESUMEN FINANCIERO";

  const energyPreview = document.querySelector(".utility-card.energy .financial-preview p");
  const waterPreview = document.querySelector(".utility-card.water .financial-preview p");
  if (energyPreview) energyPreview.textContent = "Subtotal sin IVA";
  if (waterPreview) waterPreview.textContent = "Estimación";

  setText("#beta-energy-comparison", energyKnown ? "UTE · Tarifa Residencial Simple" : "Configuración UTE incompleta");
  setText("#beta-water-comparison", "OSE · cálculo tarifario pendiente");

  const report = document.querySelector("#beta-report-comparison");
  if (report) renderStats(report, [
    ["Energía", `${formatNumber(Number(values.energy?.consumption || 0), 1, context)} kWh`],
    ["Agua", `${formatNumber(Number(values.water?.consumption || 0), 3, context)} m³`],
    ["Valor estimado", energyKnown ? `${formatMoney(energyTotal, context)} sin IVA + agua pendiente` : "Pendiente"]
  ]);

  // Evita que conceitos brasileiros sobrevivam visualmente na Home uruguaia.
  const flagBadge = document.querySelector("#flag-badge");
  if (flagBadge) { flagBadge.textContent = "UTE"; flagBadge.dataset.regional = "UY"; }
  const legacyEstimated = document.querySelector("#estimated-cost");
  if (legacyEstimated) legacyEstimated.textContent = energyKnown ? formatMoney(energyTotal, context) : "—";
}

function restoreBrazilLabels() {
  document.documentElement.lang = "pt-BR";
  const financialTitle = document.querySelector(".financial-summary-card .summary-header h2");
  if (financialTitle) financialTitle.textContent = "Total estimado";
  const financialEyebrow = document.querySelector(".financial-summary-card .eyebrow");
  if (financialEyebrow) financialEyebrow.textContent = "RESUMO FINANCEIRO";
  const energyPreview = document.querySelector(".utility-card.energy .financial-preview p");
  const waterPreview = document.querySelector(".utility-card.water .financial-preview p");
  if (energyPreview) energyPreview.textContent = "Estimativa";
  if (waterPreview) waterPreview.textContent = "Estimativa";
}

function readContext() {
  if (window.VOLT_REGION_CONTEXT) return normalizeRegionalContext(window.VOLT_REGION_CONTEXT);
  try { return normalizeRegionalContext(JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}")); }
  catch { return normalizeRegionalContext({}); }
}
function renderStats(container, items) { container.replaceChildren(...items.map(([label,value]) => { const item=document.createElement("div"),small=document.createElement("small"),strong=document.createElement("strong"); small.textContent=label; strong.textContent=value; item.append(small,strong); return item; })); }
function setText(selector,value){const element=document.querySelector(selector);if(element)element.textContent=value;}
function formatNumber(value,digits,context){return Number(value||0).toLocaleString(context.locale||"pt-BR",{maximumFractionDigits:digits});}
function localizeGreeting(value){return String(value||"").replace(/^Olá,?\s*/i,"Hola, ").replace(/^Olá!$/i,"¡Hola!");}
