/** Volt Beta — relatório determinístico do ciclo anterior de energia. */
const api = window.VOLT_BETA_API;
if (api) initializeClosedCycleReports();

function initializeClosedCycleReports() {
  attachStyles();
  const mount = () => {
    const reports = document.querySelector("#beta-reports");
    const comparison = reports?.querySelector(".compact-comparison-card");
    if (!reports || document.querySelector("#beta-closed-cycle-report")) return;
    const card = document.createElement("article");
    card.id = "beta-closed-cycle-report";
    card.className = "report-card closed-cycle-report";
    card.innerHTML = `<div class="closed-cycle-heading"><div><p class="eyebrow">HISTÓRICO DE CICLOS</p><h3>Ciclo anterior · Energia</h3></div><span class="cycle-chip">Ciclo fechado</span></div><div id="beta-closed-cycle-content"></div>`;
    comparison ? comparison.after(card) : reports.append(card);
    render();
  };
  mount();
  window.addEventListener("volt:beta-data", () => { mount(); render(); });
  window.addEventListener("volt:cycle-context", render);
}

function render() {
  const target = document.querySelector("#beta-closed-cycle-content");
  if (!target) return;
  const snapshot = api.getSnapshot();
  const previousRange = window.VOLT_CYCLE_CONTEXT?.energy?.previous || null;
  const report = closedEnergyCycle(snapshot.energy.readings || [], previousRange);
  if (!report) {
    target.innerHTML = '<p class="empty">O ciclo anterior ainda não possui duas leituras de energia suficientes para gerar o relatório fechado.</p>';
    return;
  }
  const estimate = api.estimateEnergy(report.consumption) || {};
  target.replaceChildren(buildReport(report, {
    total: Number(estimate.totalCost || 0),
    base: Number(estimate.baseCost || estimate.energyCost || 0),
    flag: Number(estimate.flagCost || 0),
    lighting: Number(estimate.lightingCost || estimate.lightingFee || 0)
  }));
}

function closedEnergyCycle(readings, range) {
  if (!range?.start || !range?.end) return null;
  const rangeStart = new Date(range.start);
  const rangeEnd = new Date(range.end);
  const selected = readings
    .map(item => ({ value: Number(item.value), date: new Date(item.date) }))
    .filter(item => Number.isFinite(item.value) && !Number.isNaN(item.date.getTime()) && item.date >= rangeStart && item.date <= rangeEnd)
    .sort((a, b) => a.date - b.date);
  if (selected.length < 2) return null;
  const start = selected[0];
  const end = selected.at(-1);
  const consumption = end.value - start.value;
  if (consumption < 0) return null;
  const days = (end.date - start.date) / 86_400_000;
  return { start, end, consumption, days, dailyAverage: days > 0 ? consumption / days : 0 };
}

function buildReport(report, cost) {
  const fragment = document.createDocumentFragment();
  const period = document.createElement("div");
  period.className = "closed-cycle-period";
  period.innerHTML = `<div><small>Período medido</small><strong>${dateTime(report.start.date)} → ${dateTime(report.end.date)}</strong></div><div><small>Duração</small><strong>${format(report.days, 1)} dias</strong></div>`;
  const readings = grid([
    ["Leitura inicial", `${format(report.start.value, 0)} kWh`],
    ["Leitura final", `${format(report.end.value, 0)} kWh`],
    ["Consumo real", `${format(report.consumption, 1)} kWh`],
    ["Média diária", `${format(report.dailyAverage, 2)} kWh/dia`]
  ]);
  const financial = document.createElement("section");
  financial.className = "closed-cycle-financial";
  const title = document.createElement("h4"); title.textContent = "Estimativa financeira do ciclo";
  financial.append(title, grid([
    ["Energia", money(cost.base)], ["Bandeira", money(cost.flag)], ["Iluminação", money(cost.lighting)], ["Total estimado", money(cost.total)]
  ]));
  const note = document.createElement("p");
  note.className = "note closed-cycle-note";
  note.textContent = "Relatório derivado das leituras registradas no ciclo fechado. O custo usa a configuração tarifária disponível no Volt; a fatura da concessionária continua sendo a referência para impostos e encargos não modelados.";
  fragment.append(period, readings, financial, note);
  return fragment;
}

function grid(items) {
  const container = document.createElement("div"); container.className = "closed-cycle-grid";
  for (const [label, value] of items) {
    const item = document.createElement("div"); const caption = document.createElement("small"); caption.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value; item.append(caption, strong); container.append(item);
  }
  return container;
}
function dateTime(value) { return value.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
function format(value, digits) { return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits }); }
function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function attachStyles() {
  if (document.querySelector("#closed-cycle-report-styles")) return;
  const style = document.createElement("style"); style.id = "closed-cycle-report-styles";
  style.textContent = `.closed-cycle-report{display:grid;gap:16px}.closed-cycle-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.closed-cycle-heading h3{margin:2px 0 0}.closed-cycle-period,.closed-cycle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.closed-cycle-period>div,.closed-cycle-grid>div{display:grid;gap:4px;padding:12px;border:1px solid var(--lm-border-subtle,currentColor);border-radius:14px}.closed-cycle-period strong,.closed-cycle-grid strong{font-variant-numeric:tabular-nums}.closed-cycle-financial{display:grid;gap:10px;margin-top:14px}.closed-cycle-financial h4{margin:0}.closed-cycle-note{margin:14px 0 0}@media(max-width:520px){.closed-cycle-period,.closed-cycle-grid{grid-template-columns:1fr}.closed-cycle-heading{align-items:center}}`;
  document.head.append(style);
}
