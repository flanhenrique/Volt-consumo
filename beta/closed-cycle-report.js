/** Volt Beta — relatório do ciclo anterior reconciliado com fatura oficial. */
const api = window.VOLT_BETA_API;
const OFFICIAL_JULY_2026 = Object.freeze({
  reference: "07/2026", provider: "Amazonas Energia", dueDate: "03/08/2026",
  previousReading: 28359, currentReading: 28402, measuredConsumption: 43,
  billedConsumption: 50, billingDays: 29, unitRate: 0.8945,
  energyCharge: 44.72, lightingCharge: 0.53, tariffFlag: "Amarela",
  tariffFlagCharge: 0.93, invoiceTotal: 53.25
});
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
    card.innerHTML = `<div class="closed-cycle-heading"><div><p class="eyebrow">HISTÓRICO DE CICLOS</p><h3>Ciclo anterior · Energia</h3></div><span class="cycle-chip">Fatura real</span></div><div id="beta-closed-cycle-content"></div>`;
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
  const measured = closedEnergyCycle(snapshot.energy.readings || [], previousRange);
  const bill = OFFICIAL_JULY_2026;
  const estimate = api.estimateEnergy(bill.billedConsumption) || {};
  target.replaceChildren(buildReport(measured, bill, {
    total: Number(estimate.totalCost || 0), base: Number(estimate.baseCost || estimate.energyCost || 0),
    flag: Number(estimate.flagCost || 0), lighting: Number(estimate.lightingCost || estimate.lightingFee || 0)
  }));
}

function closedEnergyCycle(readings, range) {
  if (!range?.start || !range?.end) return null;
  const rangeStart = new Date(range.start), rangeEnd = new Date(range.end);
  const selected = readings.map(item => ({ value:Number(item.value), date:new Date(item.date) }))
    .filter(item => Number.isFinite(item.value) && !Number.isNaN(item.date.getTime()) && item.date >= rangeStart && item.date <= rangeEnd)
    .sort((a,b) => a.date-b.date);
  if (selected.length < 2) return null;
  const start=selected[0], end=selected.at(-1), consumption=end.value-start.value;
  const days=(end.date-start.date)/86400000;
  return consumption < 0 ? null : { start,end,consumption,days,dailyAverage:days>0?consumption/days:0 };
}

function buildReport(measured, bill, estimate) {
  const fragment=document.createDocumentFragment();
  const period=document.createElement("div"); period.className="closed-cycle-period";
  period.innerHTML=`<div><small>Referência da fatura</small><strong>${bill.reference} · venc. ${bill.dueDate}</strong></div><div><small>Dias faturados</small><strong>${bill.billingDays} dias</strong></div>`;
  const readings=grid([
    ["Leitura oficial anterior", `${format(bill.previousReading,0)} kWh`],
    ["Leitura oficial atual", `${format(bill.currentReading,0)} kWh`],
    ["Consumo medido", `${format(bill.measuredConsumption,0)} kWh`],
    ["Consumo faturado", `${format(bill.billedConsumption,0)} kWh`]
  ]);
  const actual=document.createElement("section"); actual.className="closed-cycle-financial";
  const title=document.createElement("h4"); title.textContent="Fatura real";
  actual.append(title,grid([
    ["Consumo", `${format(bill.billedConsumption,0)} kWh × ${money4(bill.unitRate)}`],
    ["Energia", money(bill.energyCharge)], ["Bandeira amarela", money(bill.tariffFlagCharge)],
    ["Iluminação pública", money(bill.lightingCharge)], ["Total faturado", money(bill.invoiceTotal)]
  ]));
  const simulated=document.createElement("section"); simulated.className="closed-cycle-financial closed-cycle-simulation";
  const simTitle=document.createElement("h4"); simTitle.textContent="O que o Volt estimaria hoje";
  simulated.append(simTitle,grid([["Energia",money(estimate.base)],["Bandeira",money(estimate.flag)],["Iluminação",money(estimate.lighting)],["Total estimado",money(estimate.total)]]));
  const delta=document.createElement("p"); delta.className="note closed-cycle-note";
  const difference=estimate.total-bill.invoiceTotal;
  delta.textContent=`Diferença entre a regra atual do Volt e a fatura real: ${money(difference)}. A fatura real prevalece no histórico fechado.`;
  const warning=document.createElement("p"); warning.className="note closed-cycle-note";
  warning.textContent=measured && Math.round(measured.start.value)!==bill.previousReading ? `A leitura manual do início do período (${format(measured.start.value,0)} kWh) difere da leitura oficial da fatura (${format(bill.previousReading,0)} kWh). As duas são preservadas; o fechamento financeiro usa a leitura oficial.` : "O fechamento financeiro usa os dados oficiais transcritos da fatura.";
  fragment.append(period,readings,actual,simulated,delta,warning); return fragment;
}

function grid(items){const c=document.createElement("div");c.className="closed-cycle-grid";for(const [label,value] of items){const i=document.createElement("div"),s=document.createElement("small"),b=document.createElement("strong");s.textContent=label;b.textContent=value;i.append(s,b);c.append(i)}return c}
function format(v,d){return Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:d})}
function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function money4(v){return `R$ ${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:4,maximumFractionDigits:4})}/kWh`}
function attachStyles(){if(document.querySelector("#closed-cycle-report-styles"))return;const s=document.createElement("style");s.id="closed-cycle-report-styles";s.textContent=`.closed-cycle-report{display:grid;gap:16px}.closed-cycle-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.closed-cycle-heading h3{margin:2px 0 0}.closed-cycle-period,.closed-cycle-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.closed-cycle-period>div,.closed-cycle-grid>div{display:grid;gap:4px;padding:12px;border:1px solid var(--lm-border-subtle,currentColor);border-radius:14px}.closed-cycle-period strong,.closed-cycle-grid strong{font-variant-numeric:tabular-nums}.closed-cycle-financial{display:grid;gap:10px;margin-top:14px}.closed-cycle-financial h4{margin:0}.closed-cycle-simulation{opacity:.78}.closed-cycle-note{margin:10px 0 0}@media(max-width:520px){.closed-cycle-period,.closed-cycle-grid{grid-template-columns:1fr}.closed-cycle-heading{align-items:center}}`;document.head.append(s)}
