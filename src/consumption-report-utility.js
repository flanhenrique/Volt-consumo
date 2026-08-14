import { currency, cycleLabel, dateOnly, flagLabel, formatNumber, signedPercent } from "./consumption-report-data.js?v=20260813.7";

export function ensureUtilityConsumptionReport(type) {
  const panel = document.querySelector(`[data-report-panel="${type}"]`);
  if (!panel || document.getElementById(`consumption-${type}-detail`)) return;
  const isWater = type === "water";
  const label = isWater ? "Água" : "Energia";
  const hero = panel.querySelector(".report-detail-hero");
  if (hero) {
    const eyebrow = hero.querySelector(".eyebrow"), title = hero.querySelector("h2"), copy = hero.querySelector(".supporting-copy");
    if (eyebrow) eyebrow.textContent = `RELATÓRIO · ${label.toUpperCase()}`;
    if (title) title.textContent = label;
    if (copy) copy.textContent = isWater ? "Consumo do ciclo, custo estimado e composição de água." : "Consumo do ciclo, custo estimado e composição de energia.";
  }

  const cards = [...(panel.querySelector(".report-detail-metrics")?.children || [])];
  ["Consumo do ciclo", "Custo estimado", "Média diária", "Projeção do ciclo"].forEach((text, index) => {
    const caption = cards[index]?.querySelector(".metric-caption");
    if (caption) caption.textContent = text;
  });
  const cardNotes = ["ciclo atual", "estimativa do ciclo", "ritmo atual", "fechamento projetado"];
  cards.forEach((card, index) => {
    const note = card.querySelector("small");
    if (note) note.textContent = cardNotes[index];
  });

  const chartCard = panel.querySelector(".report-detail-grid")?.children?.[0];
  if (chartCard) {
    const eyebrow = chartCard.querySelector(".eyebrow"), title = chartCard.querySelector("h2"), chart = chartCard.querySelector(".report-bar-chart");
    if (eyebrow) eyebrow.textContent = "CICLOS";
    if (title) title.textContent = "Consumo por ciclo";
    if (chart) chart.classList.add("consumption-cycle-chart");
  }

  const side = panel.querySelector(".report-detail-grid")?.children?.[1];
  if (side) {
    side.innerHTML = `<div><p class="eyebrow">RESUMO FINANCEIRO</p><h2>Estimativa do ciclo</h2></div><div class="consumption-financial-total"><span>Total estimado</span><strong id="consumption-${type}-financial-total">—</strong></div><ul id="consumption-${type}-financial-list" class="report-summary-list"></ul><div class="consumption-cycle-meta"><span>Ciclo analisado</span><strong id="consumption-${type}-cycle-range">—</strong><small id="consumption-${type}-context-range">—</small></div>`;
  }

  const detail = document.createElement("div");
  detail.id = `consumption-${type}-detail`;
  detail.className = "consumption-detail-grid";
  detail.innerHTML = `<article class="card glass-level-3"><div><p class="eyebrow">HISTÓRICO OBJETIVO</p><h2>Últimos ciclos</h2><p class="supporting-copy">Compare o ciclo fechado com o ciclo atual.</p></div><div id="consumption-${type}-history" class="consumption-history"></div></article><article class="card glass-level-3"><div><p class="eyebrow">LEITURA RÁPIDA</p><h2>O que importa agora</h2></div><ul id="consumption-${type}-insights" class="consumption-insights"></ul></article>`;
  panel.append(detail);
}

export function renderUtilityConsumptionReport(type, data) {
  const isWater = type === "water";
  const unit = isWater ? "m³" : "kWh";
  const decimals = isWater ? 3 : 0;
  const cards = document.querySelectorAll(`[data-report-panel="${type}"] .report-detail-metrics .card`);
  const values = [
    `${formatNumber(data.currentConsumption, decimals)} ${unit}`,
    currency(data.financial.totalCost),
    `${formatNumber(data.currentConsumption / Math.max(1, data.projection.elapsedDays), isWater ? 3 : 2)} ${unit}/dia`,
    `${formatNumber(data.projection.projected, isWater ? 2 : 0)} ${unit}`
  ];
  cards.forEach((card, index) => {
    const strong = card.querySelector(".metric-value");
    if (strong) strong.textContent = values[index];
  });

  const change = document.getElementById(`report-${type}-change`);
  if (change) {
    change.textContent = Number.isFinite(data.change) ? `${signedPercent(data.change)} vs. ciclo anterior` : "Sem ciclo anterior comparável";
    change.dataset.tone = Number.isFinite(data.change) ? (data.change > 0 ? "warning" : data.change < 0 ? "success" : "neutral") : "neutral";
  }

  setText(`consumption-${type}-cycle-range`, cycleLabel(data.cycle.current));
  setText(`consumption-${type}-context-range`, `Contexto: ${data.contextLabel}`);
  setText(`consumption-${type}-financial-total`, currency(data.financial.totalCost));
  renderFinancial(type, data);
  renderCycleChart(type, data.cycleHistory, unit, decimals);
  renderHistory(type, data.cycleHistory, unit, decimals);
  renderInsights(type, buildInsights(data, unit, decimals));
}

function renderFinancial(type, data) {
  const host = document.getElementById(`consumption-${type}-financial-list`);
  if (!host) return;
  const items = type === "water"
    ? [
        ["Tarifa de água", `${currency(data.financial.rate)}/m³`, "configuração atual"],
        ["Esgoto", `${formatNumber(data.financial.sewerPercent, 0)}%`, "sobre a base configurada"],
        ["Taxa fixa", currency(data.financial.fixedFee), "por ciclo"],
        ["Meta", `${formatNumber(data.goal, 1)} m³`, goalNote(data)]
      ]
    : [
        ["Tarifa base", `${currency(data.financial.rate)}/kWh`, "configuração atual"],
        ["Bandeira", flagLabel(data.financial.flag), `${currency(data.financial.flagRate)}/kWh`],
        ["Iluminação pública", currency(data.financial.lightingFee), "estimativa configurada"],
        ["Meta", `${formatNumber(data.goal, 0)} kWh`, goalNote(data)]
      ];
  host.replaceChildren(...items.map(([label, value, note]) => summaryNode(label, value, note)));
}

function goalNote(data) {
  if (!(data.goal > 0)) return "meta não configurada";
  const diff = data.projection.projected - data.goal;
  const unit = data.type === "water" ? "m³" : "kWh";
  const decimals = data.type === "water" ? 2 : 0;
  return diff > 0 ? `${formatNumber(diff, decimals)} ${unit} acima na projeção` : `${formatNumber(Math.abs(diff), decimals)} ${unit} de margem`;
}

function renderCycleChart(type, rows, unit, decimals) {
  const host = document.getElementById(`report-${type}-chart`);
  if (!host) return;
  host.classList.add("consumption-cycle-chart");
  if (!rows.length) {
    host.innerHTML = `<div class="consumption-empty"><strong>Sem ciclos suficientes</strong><small>Registre leituras para formar o histórico.</small></div>`;
    return;
  }
  const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
  host.innerHTML = rows.map((row) => `<div class="consumption-cycle-bar${row.isCurrent ? " current" : ""}"><div class="consumption-cycle-bar-copy"><span>${cycleLabel(row.range)}</span><small>${row.status}</small></div><div class="consumption-cycle-bar-track"><i style="--cycle-width:${Math.max(4, (row.value / max) * 100)}%"></i></div><strong>${formatNumber(row.value, decimals)} ${unit}</strong></div>`).join("");
}

function renderHistory(type, rows, unit, decimals) {
  const host = document.getElementById(`consumption-${type}-history`);
  if (!host) return;
  host.innerHTML = rows.length ? `<table><thead><tr><th>Ciclo</th><th>Consumo</th><th>Média/dia</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr${row.isCurrent ? ' data-current="true"' : ""}><td>${cycleLabel(row.range)}</td><td>${formatNumber(row.value, decimals)} ${unit}</td><td>${formatNumber(row.daily, type === "water" ? 3 : 2)} ${unit}/dia</td><td>${row.status}</td></tr>`).join("")}</tbody></table>` : `<div class="consumption-empty"><strong>Sem histórico suficiente</strong><small>Registre leituras para formar um ciclo.</small></div>`;
}

function buildInsights(data, unit, decimals) {
  const label = data.type === "water" ? "Água" : "Energia";
  const list = [];
  if (!Number.isFinite(data.change)) list.push({ tone: "neutral", title: `${label}: sem ciclo anterior`, copy: "Ainda não existe uma base anterior suficiente para comparação." });
  else if (Math.abs(data.change) < .005) list.push({ tone: "neutral", title: `${label}: ciclo estável`, copy: "Variação inferior a 0,5% contra o ciclo anterior." });
  else list.push({ tone: data.change > 0 ? "warning" : "success", title: `${label}: ${data.change > 0 ? "alta" : "queda"} de ${signedPercent(Math.abs(data.change))}`, copy: `Comparação entre ${cycleLabel(data.cycle.previous)} e ${cycleLabel(data.cycle.current)}.` });
  list.push({ tone: "neutral", title: "Ritmo diário", copy: `${formatNumber(data.currentConsumption / Math.max(1, data.projection.elapsedDays), data.type === "water" ? 3 : 2)} ${unit}/dia no ciclo atual.` });
  if (data.goal > 0) {
    const diff = data.projection.projected - data.goal;
    list.push({ tone: diff > 0 ? "warning" : "success", title: diff > 0 ? "Projeção acima da meta" : "Projeção dentro da meta", copy: `Fechamento projetado em ${formatNumber(data.projection.projected, data.type === "water" ? 2 : 0)} ${unit}.` });
  }
  if (data.peak) list.push({ tone: "neutral", title: "Maior intervalo", copy: `${formatNumber(data.peak.value, decimals)} ${unit} no intervalo encerrado em ${dateOnly(data.peak.date)}.` });
  return list.slice(0, 4);
}

function renderInsights(type, items) {
  const host = document.getElementById(`consumption-${type}-insights`);
  if (!host) return;
  host.replaceChildren(...items.map((item) => {
    const li = document.createElement("li");
    li.dataset.tone = item.tone;
    const dot = document.createElement("span");
    dot.className = "consumption-insight-dot";
    const copy = document.createElement("span");
    const strong = document.createElement("strong");
    const small = document.createElement("small");
    strong.textContent = item.title;
    small.textContent = item.copy;
    copy.append(strong, small);
    li.append(dot, copy);
    return li;
  }));
}

function summaryNode(label, value, note) {
  const li = document.createElement("li");
  const dot = document.createElement("span");
  dot.className = "report-summary-dot";
  const copy = document.createElement("span");
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  const description = document.createElement("span");
  small.textContent = label;
  strong.textContent = value;
  description.textContent = note;
  copy.append(small, strong, description);
  li.append(dot, copy);
  return li;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
