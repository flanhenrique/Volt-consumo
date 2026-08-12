import { formatMoney, normalizeRegionalContext } from "./mercosur-region.js";

const KEY = "volt:beta:locality-context-v1";
let renderScheduled = false;

queueMicrotask(scheduleRender);
// O detalhe depende da localidade e da resolução tarifária. beta-data e
// cycle-context já convergem para tariff-resolution no resolvedor regional.
["volt:locality-context", "volt:tariff-resolution"].forEach((eventName) => {
  window.addEventListener(eventName, scheduleRender);
});

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    render();
  });
}

function render() {
  const context = readContext();
  const panel = document.querySelector("#water-panel");
  if (!panel) return;

  let card = document.querySelector("#uy-ose-breakdown");
  if (context.country !== "UY") {
    card?.remove();
    return;
  }

  const water = window.VOLT_TARIFF_RESOLUTION?.internationalWaterEstimate;
  if (!card) {
    card = document.createElement("section");
    card.id = "uy-ose-breakdown";
    card.className = "card cost-breakdown regional-ose-breakdown";
    const forecast = panel.querySelector(".forecast-card");
    forecast ? forecast.after(card) : panel.append(card);
  }

  card.replaceChildren();
  const head = document.createElement("div");
  head.className = "section-heading";
  const title = document.createElement("h2");
  title.textContent = "Detalle estimado OSE";
  const badge = document.createElement("span");
  badge.textContent = water?.valid ? (water.zoneLabel || water.zone || "OSE") : "OSE";
  head.append(title, badge);
  card.append(head);

  if (!water?.valid) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Seleccione la zona tarifaria y el diámetro de conexión para calcular el agua.";
    card.append(note);
    return;
  }

  const dl = document.createElement("dl");
  const high = Number(water.highAverageFixedCharge || 0);
  const excess = Number(water.taxableExcessM3 || 0);
  const vat = Number(water.vatAmount || 0);
  const total = Number(water.totalWaterWithVat ?? water.waterSubtotalBeforeTax ?? 0);
  const exemptM3 = Math.min(15, Math.max(0, Number(water.consumptionM3 || 0)));

  add(dl, "Consumo del ciclo", `${number(water.consumptionM3, 3, context)} m³`);
  add(dl, "Cargo variable de agua", formatMoney(water.variableCharge, context));
  add(dl, `Cargo fijo · conexión ${context.oseConnectionDiameterMm || "—"} mm`, formatMoney(water.fixedCharge, context));
  add(dl, "Adicional por promedio anual > 15 m³", formatMoney(high, context));
  add(dl, "Consumo exento de IVA", `${number(exemptM3, 3, context)} m³`);
  if (excess > 0) {
    add(dl, "Excedente sujeto a IVA", `${number(excess, 3, context)} m³ · base ${formatMoney(water.taxableExcessBase, context)}`);
    add(dl, `IVA ${Math.round(Number(water.vatRate || 0) * 100)}% sobre excedente`, formatMoney(vat, context));
  }
  add(dl, "Total agua con IVA aplicable", formatMoney(total, context), "breakdown-total");
  card.append(dl);

  const note = document.createElement("p");
  note.className = "note";
  note.textContent = water.sanitationDeclared
    ? "Saneamiento declarado: todavía no incluido en este total. El IVA del agua ya está considerado según el excedente sobre 15 m³."
    : "Saneamiento no declarado. El IVA del agua ya está considerado según el excedente sobre 15 m³.";
  card.append(note);

  const totalNode = document.querySelector("#water-estimated-cost");
  if (totalNode) totalNode.textContent = formatMoney(total, context);
}

function add(dl, label, value, className = "") {
  const row = document.createElement("div");
  if (className) row.className = className;
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  row.append(dt, dd);
  dl.append(row);
}

function readContext() {
  if (window.VOLT_REGION_CONTEXT) return normalizeRegionalContext(window.VOLT_REGION_CONTEXT);
  try {
    return normalizeRegionalContext(JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return normalizeRegionalContext({});
  }
}

function number(value, digits, context) {
  return Number(value || 0).toLocaleString(context.locale || "es-UY", { maximumFractionDigits: digits });
}
