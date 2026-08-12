/** Volt Beta — relatório determinístico de ciclos fechados. */
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
    card.innerHTML = `<div class="closed-cycle-heading"><div><p class="eyebrow">HISTÓRICO DE CICLOS</p><h3>Ciclo anterior</h3></div><span class="cycle-chip">Ciclo fechado</span></div><div id="beta-closed-cycle-content"></div>`;
    comparison ? comparison.after(card) : reports.append(card);
    render();
  };
  mount();
  window.addEventListener("volt:beta-data", () => { mount(); render(); });
}

function render() {
  const target = document.querySelector("#beta-closed-cycle-content");
  if (!target) return;
  const snapshot = api.getSnapshot();
  const report = latestClosedEnergyCycle(snapshot.energy.readings || []);
  if (!report) {
    target.innerHTML = '<p class="empty">Adicione duas leituras históricas de energia para gerar o primeiro ciclo fechado.</p>';
    return;
  }
  const estimate = api.estimateEnergy(report.consumption) || {};
  const total = Number(estimate.totalCost || 0);
  const base = Number(estimate.baseCost || estimate.energyCost || 0);
  const flag = Number(estimate.flagCost || 0);
  const lighting = Number(estimate.lightingCost || estimate.lightingFee || 0);
  target.replaceChildren(buildReport(report, { total, base, flag, lighting }));
}

function latestClosedEnergyCycle(readings) {
  const ordered = readings
    .map(item => ({ value: Number(item.value), date: new Date(item.date) }))
    .filter(item => Number.isFinite(item.value) && !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date - b.date);
  if (ordered.length < 2) return null;

  // Um ciclo fechado é sempre o intervalo entre duas leituras consecutivas já passadas.
  // Se houver três ou mais leituras, o último intervalo pode ser o ciclo em andamento;
  // por isso preferimos o penúltimo par completo. Com exatamente duas leituras históricas,
  // elas próprias formam o ciclo fechado importado.
  const now = Date.now();
  const past = ordered.filter(item => item.date.getTime() <= now);
  if (past.length < 2) return null;
  const endIndex = past.length >= 3 ? past.length - 2 : past.length - 1;
  const start = past[endIndex - 1];
  const end = past[endIndex];
  const consumption = end.value - start.value;
  if (consumption < 0) return null;
  const durationMs = end.date - start.date;
  const days = durationMs / 86_400_000;
  return {
    start,
    end,
    consumption,
    days,
    dailyAverage: days > 0 ? consumption / days : 0
  };
}

function buildReport(report, cost) {
  const fragment = document.createDocumentFragment();
  const period = document.createElement("div");
  period.className = "closed-cycle-period";
  period.innerHTML = `<div><small>Período</small><strong>${dateTime(report.start.date)} → ${dateTime(report.end.date)}</strong></div><div><small>Duração</small><strong>${format(report.days, 1)} dias</strong></div>`;

  const readings = grid([
    ["Leitura inicial", `${format(report.start.value, 0)} kWh`],
    ["Leitura final", `${format(report.end.value, 0)} kWh`],
    ["Consumo real", `${format(report.consumption, 1)} kWh`],
    ["Média diária", `${format(report.dailyAverage, 2)} kWh/dia`]
  ]);

  const financial = document.createElement("section");
  financial.className = "closed-cycle-financial";
  const title = document.createElement("h4");
  title.textContent = "Estimativa financeira do ciclo";
  financial.append(title, grid([
    ["Energia", money(cost.base)],
    ["Bandeira", money(cost.flag)],
    ["Iluminação", money(cost.lighting)],
    ["Total estimado", money(cost.total)]
  ]));

  const note = document.createElement("p");
  note.className = "note closed-cycle-note";
  note.textContent = "Relatório derivado das leituras registradas. O custo usa a configuração tarifária disponível no Volt e permanece uma estimativa; a fatura da concessionária é a referência para impostos e encargos não modelados.";
  fragment.append(period, readings, financial, note);
  return fragment;
}

function grid(items) {
  const container = document.createElement("div");
  container.className = "closed-cycle-grid";
  for (const [label, value] of items) {
    const item = document.createElement("div");
    const caption = document.createElement("small"); caption.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value;
    item.append(caption, strong); container.append(item);
  }
  return container;
}

function dateTime(value) {
  return value.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function format(value, digits) { return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits }); }
function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function attachStyles() {
  if (document.querySelector("#closed-cycle-report-styles")) return;
  const style = document.createElement("style");
  style.id = "closed-cycle-report-styles";
  style.textContent = `
    .closed-cycle-report{display:grid;gap:16px}.closed-cycle-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.closed-cycle-heading h3{margin:2px 0 0}.closed-cycle-period,.closed-cycle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.closed-cycle-period>div,.closed-cycle-grid>div{display:grid;gap:4px;padding:12px;border:1px solid var(--lm-border-subtle,currentColor);border-radius:14px}.closed-cycle-period strong,.closed-cycle-grid strong{font-variant-numeric:tabular-nums}.closed-cycle-financial{display:grid;gap:10px;margin-top:14px}.closed-cycle-financial h4{margin:0}.closed-cycle-note{margin:14px 0 0}@media(max-width:520px){.closed-cycle-period,.closed-cycle-grid{grid-template-columns:1fr}.closed-cycle-heading{align-items:center}}
  `;
  document.head.append(style);
}
