import { formatNumber, monthLabel, periodLabel, signedPercent } from "./consumption-report-data.js?v=20260825.4";

export function ensureGeneralConsumptionReport() {
  const tab = document.querySelector('[data-report-tab="overview"]');
  if (tab) for (const node of [...tab.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.textContent = "Geral";
  const library = [...document.querySelectorAll(".report-library-list button")].find((button) => button.querySelector("strong")?.textContent === "Relatório de consumo");
  const libraryCopy = library?.querySelector("small");
  if (libraryCopy) libraryCopy.textContent = "Geral, energia e água";
  if (document.getElementById("consumption-report-general")) return;
  const panel = document.querySelector('[data-report-panel="overview"]');
  if (!panel) return;
  const card = document.createElement("article");
  card.id = "consumption-report-general";
  card.className = "consumption-report-card card glass-level-3";
  card.innerHTML = `<div class="card-header report-card-header"><div><p class="eyebrow">RELATÓRIO DE CONSUMO</p><h2>Visão geral</h2><p class="supporting-copy">Energia e água no mesmo relatório, mantendo cada unidade separada.</p></div><span id="consumption-general-period" class="chip">—</span></div><div class="consumption-utility-grid"><section class="consumption-utility-card energy"><div class="consumption-utility-heading"><span class="report-action-icon"><svg class="icon"><use href="#icon-bolt"></use></svg></span><div><small>ENERGIA</small><strong id="consumption-general-energy-total">—</strong></div></div><div class="consumption-kpis"><span><small>Média diária</small><strong id="consumption-general-energy-daily">—</strong></span><span><small>Média mensal</small><strong id="consumption-general-energy-monthly">—</strong></span><span><small>Projeção do ciclo</small><strong id="consumption-general-energy-projection">—</strong></span></div><div class="consumption-progress"><div><span>Meta do ciclo</span><strong id="consumption-general-energy-goal">—</strong></div><span class="consumption-progress-track"><i id="consumption-general-energy-progress"></i></span><small id="consumption-general-energy-note"></small></div></section><section class="consumption-utility-card water"><div class="consumption-utility-heading"><span class="report-action-icon water"><svg class="icon"><use href="#icon-water"></use></svg></span><div><small>ÁGUA</small><strong id="consumption-general-water-total">—</strong></div></div><div class="consumption-kpis"><span><small>Média diária</small><strong id="consumption-general-water-daily">—</strong></span><span><small>Média mensal</small><strong id="consumption-general-water-monthly">—</strong></span><span><small>Projeção do ciclo</small><strong id="consumption-general-water-projection">—</strong></span></div><div class="consumption-progress"><div><span>Meta do ciclo</span><strong id="consumption-general-water-goal">—</strong></div><span class="consumption-progress-track water"><i id="consumption-general-water-progress"></i></span><small id="consumption-general-water-note"></small></div></section></div><div class="consumption-general-grid"><section><div><p class="eyebrow">HISTÓRICO</p><h3>Consumo por mês</h3></div><div id="consumption-general-history" class="consumption-history"></div></section><section><div><p class="eyebrow">LEITURA DO PERÍODO</p><h3>O que mudou</h3></div><ul id="consumption-general-insights" class="consumption-insights"></ul></section></div>`;
  const before = panel.querySelector(".report-secondary-grid");
  if (before) panel.insertBefore(card, before); else panel.append(card);
}

export function renderGeneralConsumptionReport(energy, water, period) {
  setText("consumption-general-period", periodLabel(period));
  renderUtility("energy", energy, "kWh", 0);
  renderUtility("water", water, "m³", 3);
  renderHistory(energy.buckets, water.buckets);
  renderInsights([changeInsight(energy), changeInsight(water), projectionInsight(energy), projectionInsight(water)]);
}

function renderUtility(type, data, unit, decimals) {
  setText(`consumption-general-${type}-total`, `${formatNumber(data.consumption, decimals)} ${unit}`);
  setText(`consumption-general-${type}-daily`, `${formatNumber(data.daily, type === "water" ? 3 : 2)} ${unit}/dia`);
  setText(`consumption-general-${type}-monthly`, `${formatNumber(data.monthly, type === "water" ? 2 : 0)} ${unit}`);
  setText(`consumption-general-${type}-projection`, `${formatNumber(data.projection.projected, type === "water" ? 2 : 0)} ${unit}`);
  setText(`consumption-general-${type}-goal`, `${formatNumber(data.goal, type === "water" ? 1 : 0)} ${unit}`);
  setProgress(`consumption-general-${type}-progress`, data.projection.ratio);
  const diff = data.projection.projected - data.goal;
  setText(`consumption-general-${type}-note`, data.goal > 0 ? (diff > 0 ? `Projeção ${formatNumber(diff, decimals)} ${unit} acima da meta` : `Margem projetada de ${formatNumber(Math.abs(diff), decimals)} ${unit}`) : "Meta não configurada");
}

function renderHistory(energyBuckets, waterBuckets) {
  const host = document.getElementById("consumption-general-history");
  if (!host) return;
  const rows = new Map();
  energyBuckets.forEach((item) => rows.set(key(item.date), { date: item.date, energy: item.value, water: 0 }));
  waterBuckets.forEach((item) => { const id = key(item.date); if (!rows.has(id)) rows.set(id, { date: item.date, energy: 0, water: 0 }); rows.get(id).water = item.value; });
  const sorted = [...rows.values()].sort((a, b) => a.date - b.date).slice(-12);
  host.innerHTML = sorted.length ? `<table><thead><tr><th>Período</th><th>Energia</th><th>Água</th></tr></thead><tbody>${sorted.map((row) => `<tr><td>${monthLabel(row.date)}</td><td>${formatNumber(row.energy,0)} kWh</td><td>${formatNumber(row.water,3)} m³</td></tr>`).join("")}</tbody></table>` : `<div class="consumption-empty"><strong>Sem histórico suficiente</strong><small>Registre pelo menos duas leituras para formar um intervalo.</small></div>`;
}

function changeInsight(data) {
  const label = data.type === "water" ? "Água" : "Energia";
  if (!Number.isFinite(data.change)) return { tone:"neutral", title:`${label}: sem base anterior`, copy:"Ainda não há período anterior suficiente para uma comparação confiável." };
  if (Math.abs(data.change) < .005) return { tone:"neutral", title:`${label}: estável`, copy:"Variação inferior a 0,5% em relação ao período anterior." };
  return { tone:data.change > 0 ? "warning" : "success", title:`${label}: ${data.change > 0 ? "aumento" : "redução"} de ${signedPercent(Math.abs(data.change))}`, copy:"Comparação direta com o período anterior equivalente." };
}

function projectionInsight(data) {
  const label = data.type === "water" ? "Água" : "Energia", unit = data.type === "water" ? "m³" : "kWh", decimals = data.type === "water" ? 2 : 0;
  if (!(data.goal > 0)) return { tone:"neutral", title:`${label}: meta não configurada`, copy:`A projeção atual é ${formatNumber(data.projection.projected,decimals)} ${unit}.` };
  const diff = data.projection.projected - data.goal;
  return diff > 0 ? { tone:"warning", title:`${label}: projeção acima da meta`, copy:`Fechamento projetado em ${formatNumber(data.projection.projected,decimals)} ${unit}.` } : { tone:"success", title:`${label}: projeção dentro da meta`, copy:`Margem estimada de ${formatNumber(Math.abs(diff),decimals)} ${unit}.` };
}

function renderInsights(insights) {
  const host = document.getElementById("consumption-general-insights");
  if (!host) return;
  host.replaceChildren(...insights.map((item) => insightNode(item)));
}
function insightNode(item){const li=document.createElement("li");li.dataset.tone=item.tone;const dot=document.createElement("span");dot.className="consumption-insight-dot";const copy=document.createElement("span");const strong=document.createElement("strong");const small=document.createElement("small");strong.textContent=item.title;small.textContent=item.copy;copy.append(strong,small);li.append(dot,copy);return li}
function setProgress(id, ratio){const node=document.getElementById(id);if(node){node.style.setProperty("--consumption-progress",`${Math.min(Math.max((Number(ratio)||0)*100,0),100)}%`);node.dataset.tone=ratio>1?"warning":"success"}}
function key(date){const value=new Date(date);return `${value.getFullYear()}-${value.getMonth()}`}
function setText(id,value){const node=document.getElementById(id);if(node)node.textContent=value}
