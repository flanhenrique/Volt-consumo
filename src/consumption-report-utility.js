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
    if (copy) copy.textContent = isWater ? "Consumo do ciclo, custo estimado e composição de água." : "Consumo do ciclo atual e demonstrativo completo da última fatura fechada.";
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
  detail.innerHTML = `${isWater ? "" : `<article id="consumption-energy-closed-bill" class="card glass-level-3 consumption-bill-card" hidden><div class="card-header report-card-header"><div class="consumption-bill-header-copy"><p class="eyebrow">FATURA DO CICLO FECHADO</p><h2>Demonstrativo da concessionária</h2><p id="consumption-energy-bill-cycle" class="supporting-copy">—</p></div><span class="status-pill" data-tone="success">Fatura registrada</span></div><div id="consumption-energy-bill-summary" class="consumption-bill-summary"></div><section class="consumption-bill-section"><div><p class="eyebrow">COMPOSIÇÃO</p><h3>Itens da fatura</h3></div><div id="consumption-energy-bill-items" class="consumption-bill-items"></div></section><ul id="consumption-energy-bill-totals" class="report-summary-list consumption-bill-totals"></ul><section><div><p class="eyebrow">ANÁLISE VOLT</p><h3>Medido × faturado</h3></div><div id="consumption-energy-bill-analysis" class="consumption-bill-analysis"></div></section></article>`}<article class="card glass-level-3"><div><p class="eyebrow">HISTÓRICO OBJETIVO</p><h2>Últimos ciclos</h2><p class="supporting-copy">Compare o ciclo fechado com o ciclo atual.</p></div><div id="consumption-${type}-history" class="consumption-history"></div></article><article class="card glass-level-3"><div><p class="eyebrow">LEITURA RÁPIDA</p><h2>O que importa agora</h2></div><ul id="consumption-${type}-insights" class="consumption-insights"></ul></article>`;
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
  if (type === "energy") renderClosedCycleBill(data);
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

function renderClosedCycleBill(data) {
  const card = document.getElementById("consumption-energy-closed-bill");
  if (!card) return;
  const bill = data.billing;
  if (!bill) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  const closedCycle = data.cycleHistory.find((row) => !row.isCurrent) || null;
  const measured = bill.measuredConsumptionKwh ?? closedCycle?.value ?? null;
  const billed = bill.billedConsumptionKwh;
  const difference = measured != null && billed != null ? measured - billed : null;
  const effectiveRate = bill.invoiceTotal != null && billed > 0 ? bill.invoiceTotal / billed : null;

  setText("consumption-energy-bill-cycle", `${cycleLabel(bill.range || data.cycle.previous)} · ${billingBasisLabel(bill.billingBasis)}`);
  const summary = document.getElementById("consumption-energy-bill-summary");
  if (summary) {
    summary.replaceChildren(
      billMetricNode("Consumo medido", kwhOrDash(measured), "leitura física do ciclo"),
      billMetricNode("Consumo faturado", kwhOrDash(billed), billingBasisLabel(bill.billingBasis)),
      billMetricNode("Diferença", difference == null ? "—" : `${signedNumber(difference, 0)} kWh`, differenceNote(difference)),
      billMetricNode("Total oficial", bill.invoiceTotal == null ? "—" : currency(bill.invoiceTotal), "valor da concessionária"),
      billMetricNode("Custo efetivo", effectiveRate == null ? "—" : `${currency(effectiveRate)}/kWh`, "total ÷ consumo faturado")
    );
  }

  renderBillItems(bill.items);
  renderBillTotals(bill);
  renderBillAnalysis(bill, measured, billed, difference);
}

function renderBillItems(items) {
  const host = document.getElementById("consumption-energy-bill-items");
  if (!host) return;
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "consumption-empty";
    const strong = document.createElement("strong");
    strong.textContent = "Fatura sem itens detalhados";
    const small = document.createElement("small");
    small.textContent = "O total oficial continua disponível, mas os lançamentos individuais ainda não foram identificados.";
    empty.append(strong, small);
    host.replaceChildren(empty);
    return;
  }

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Item", "Base de cobrança", "Valor"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.append(th);
  });
  head.append(headRow);

  const body = document.createElement("tbody");
  items.forEach((item) => {
    const row = document.createElement("tr");
    if (item.amount != null && item.amount < 0 || ["benefit", "credit"].includes(item.category)) row.dataset.tone = "credit";
    if (item.extraordinary) row.dataset.extraordinary = "true";

    const labelCell = document.createElement("td");
    labelCell.className = "consumption-bill-item-label";
    const category = document.createElement("small");
    category.textContent = categoryLabel(item.category);
    const strong = document.createElement("strong");
    strong.textContent = item.label;
    labelCell.append(category, strong);

    const baseCell = document.createElement("td");
    baseCell.textContent = invoiceItemBase(item);
    const valueCell = document.createElement("td");
    valueCell.textContent = item.amount == null ? "A confirmar" : signedCurrency(item.amount);
    row.append(labelCell, baseCell, valueCell);
    body.append(row);
  });

  table.append(head, body);
  host.replaceChildren(table);
}

function renderBillTotals(bill) {
  const host = document.getElementById("consumption-energy-bill-totals");
  if (!host) return;
  const knownItems = bill.items.filter((item) => item.amount != null);
  const knownTotal = roundMoney(knownItems.reduce((total, item) => total + item.amount, 0));
  const unexplained = bill.invoiceTotal != null && knownItems.length ? roundMoney(bill.invoiceTotal - knownTotal) : null;
  const rows = [summaryNode("Subtotal identificado", knownItems.length ? currency(knownTotal) : "A confirmar", "soma dos lançamentos com valor identificado")];
  if (unexplained != null && Math.abs(unexplained) >= 0.01) {
    rows.push(summaryNode("Diferença ainda não identificada", signedCurrency(unexplained), "não é atribuída automaticamente a nenhuma taxa ou desconto"));
  }
  if (bill.invoiceTotal != null) rows.push(summaryNode("Total oficial da fatura", currency(bill.invoiceTotal), "valor cobrado pela concessionária"));
  host.replaceChildren(...rows);
}

function renderBillAnalysis(bill, measured, billed, difference) {
  const host = document.getElementById("consumption-energy-bill-analysis");
  if (!host) return;
  const items = [];

  if (bill.billingBasis === "average") {
    items.push({
      tone: "warning",
      title: "Faturamento por média",
      copy: "A concessionária não usou apenas a leitura física do Volt para definir o consumo cobrado neste ciclo."
    });
  } else {
    items.push({ tone: "neutral", title: "Faturamento por leitura", copy: "A fatura informa cobrança baseada em leitura do medidor." });
  }

  if (difference != null) {
    items.push(difference === 0
      ? { tone: "success", title: "Medido e faturado alinhados", copy: `${kwhOrDash(measured)} medidos e ${kwhOrDash(billed)} faturados.` }
      : { tone: "warning", title: "Medido e faturado são diferentes", copy: `${signedNumber(difference, 0)} kWh de diferença entre a medição acompanhada e o consumo cobrado.` });
  }

  const lighting = bill.items.find((item) => item.category === "lighting");
  if (lighting) {
    items.push({ tone: "neutral", title: "Iluminação pública identificada", copy: lighting.amount == null ? "A taxa aparece na fatura, mas o valor ainda precisa ser confirmado." : `${lighting.label}: ${signedCurrency(lighting.amount)}.` });
  }

  const extraordinary = bill.items.filter((item) => item.extraordinary);
  if (extraordinary.length) {
    items.push({ tone: "neutral", title: "Crédito extraordinário", copy: "Há lançamento não recorrente nesta fatura. Ele não deve reduzir automaticamente a previsão dos próximos ciclos." });
  }

  host.replaceChildren(...items.map(analysisNode));
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
  host.innerHTML = rows.map((row) => {
    const progress = Math.max(4, Math.min(100, (Number(row.value) || 0) / max * 100));
    const label = `${cycleLabel(row.range)} · ${formatNumber(row.value, decimals)} ${unit}`;
    return `<div class="consumption-cycle-bar${row.isCurrent ? " current" : ""}${row.hasInvoice ? " invoiced" : ""}"><div class="consumption-cycle-bar-copy"><span>${cycleLabel(row.range)}</span><small>${row.status}</small></div><div class="consumption-cycle-bar-track"><progress class="consumption-cycle-bar-progress" max="100" value="${progress}" aria-label="${label}"></progress></div><strong>${formatNumber(row.value, decimals)} ${unit}</strong></div>`;
  }).join("");
}

function renderHistory(type, rows, unit, decimals) {
  const host = document.getElementById(`consumption-${type}-history`);
  if (!host) return;
  host.innerHTML = rows.length ? `<table><thead><tr><th>Ciclo</th><th>Consumo</th><th>Média/dia</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr${row.isCurrent ? ' data-current="true"' : ""}${row.hasInvoice ? ' data-invoice="true"' : ""}><td>${cycleLabel(row.range)}</td><td>${formatNumber(row.value, decimals)} ${unit}</td><td>${formatNumber(row.daily, type === "water" ? 3 : 2)} ${unit}/dia</td><td>${row.status}</td></tr>`).join("")}</tbody></table>` : `<div class="consumption-empty"><strong>Sem histórico suficiente</strong><small>Registre leituras para formar um ciclo.</small></div>`;
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

function billMetricNode(label, value, note) {
  const node = document.createElement("span");
  node.className = "consumption-bill-metric";
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  const description = document.createElement("span");
  small.textContent = label;
  strong.textContent = value;
  description.textContent = note;
  node.append(small, strong, description);
  return node;
}

function analysisNode(item) {
  const node = document.createElement("article");
  node.className = "consumption-bill-analysis-item";
  node.dataset.tone = item.tone;
  const dot = document.createElement("span");
  dot.className = "consumption-insight-dot";
  const copy = document.createElement("span");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = item.title;
  small.textContent = item.copy;
  copy.append(strong, small);
  node.append(dot, copy);
  return node;
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

function invoiceItemBase(item) {
  if (item.quantityKwh != null && item.unitRate != null) return `${formatNumber(item.quantityKwh, 0)} kWh × R$ ${formatRate(item.unitRate, 6)}`;
  if (item.quantityKwh != null) return `${formatNumber(item.quantityKwh, 0)} kWh`;
  if (item.unitRate != null) return `R$ ${formatRate(item.unitRate, 6)}/kWh`;
  return categoryLabel(item.category);
}

function categoryLabel(category) {
  return ({
    energy: "Energia",
    benefit: "Benefício tarifário",
    credit: "Crédito",
    flag: "Bandeira tarifária",
    fee: "Encargo",
    lighting: "Iluminação pública"
  })[category] || "Item da fatura";
}

function billingBasisLabel(value) {
  if (value === "average") return "Faturamento por média da concessionária";
  if (value === "metered") return "Faturamento por leitura do medidor";
  return "Critério informado pela concessionária";
}

function differenceNote(value) {
  if (value == null) return "sem base suficiente";
  if (value === 0) return "medição e faturamento alinhados";
  return value > 0 ? "medido acima do faturado" : "faturado acima do medido";
}

function kwhOrDash(value) {
  return value == null ? "—" : `${formatNumber(value, 0)} kWh`;
}

function signedNumber(value, decimals) {
  const number = Number(value) || 0;
  const formatted = formatNumber(Math.abs(number), decimals);
  if (number > 0) return `+${formatted}`;
  if (number < 0) return `−${formatted}`;
  return formatted;
}

function signedCurrency(value) {
  const number = Number(value) || 0;
  return number < 0 ? `− ${currency(Math.abs(number))}` : currency(number);
}

function formatRate(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(number);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
