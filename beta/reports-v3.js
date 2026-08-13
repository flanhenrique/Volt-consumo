const api = window.VOLT_BETA_API;
const page = document.querySelector("#beta-reports");
const DAY_MS = 86_400_000;
let renderScheduled = false;
let lastSignature = "";

if (api && page) {
  attachStyles();
  ["volt:beta-data", "volt:cycle-context", "volt:tariff-resolution"].forEach((eventName) => {
    window.addEventListener(eventName, scheduleRender);
  });
  queueMicrotask(scheduleRender);
}

function attachStyles() {
  if (document.querySelector('link[href*="reports-v3.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./reports-v3.css?v=1";
  document.head.append(link);
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  const run = () => {
    renderScheduled = false;
    renderReport();
  };
  if (document.hidden) queueMicrotask(run);
  else requestAnimationFrame(run);
}

function renderReport() {
  const snapshot = api.getSnapshot?.();
  if (!snapshot) return;

  const model = buildModel(snapshot);
  const signature = JSON.stringify(model.signature);
  if (signature === lastSignature && page.childElementCount) return;
  lastSignature = signature;

  page.innerHTML = reportMarkup(model);
  page.querySelector("#beta-report-export")?.addEventListener("click", exportReportPdf);
}

function buildModel(snapshot) {
  const readings = normalizeReadings(snapshot.energy?.readings);
  const waterReadings = normalizeReadings(snapshot.water?.readings);
  const context = window.VOLT_CYCLE_CONTEXT?.energy || null;
  const values = window.VOLT_CYCLE_VALUES?.energy || null;
  const currentRange = normalizeRange(context?.current);
  const preference = normalizePreference(context?.preference);
  const currentConsumption = finite(values?.consumption, 0);
  const currentEstimate = values?.estimate || api.estimateEnergy?.(currentConsumption) || { totalCost: 0 };
  const currentCost = finite(currentEstimate.totalCost, 0);
  const currentPeriod = currentRange ? periodStats(currentRange) : null;
  const currentReadings = currentRange ? readingsInOrAtRange(readings, currentRange) : [];
  const projection = projectCurrentCycle(currentConsumption, currentPeriod, currentReadings, api);
  const closedRanges = currentRange && preference ? previousRanges(currentRange, preference, 6) : [];
  const cycles = closedRanges.map((range) => cycleMetrics(range, readings, api)).filter((item) => item.available);
  const lastClosed = cycles[0] || null;
  const previousClosed = cycles[1] || null;
  const variation = lastClosed && previousClosed && previousClosed.consumption > 0
    ? ((lastClosed.consumption - previousClosed.consumption) / previousClosed.consumption) * 100
    : null;
  const currentVsClosed = lastClosed && lastClosed.consumption > 0
    ? ((currentConsumption - lastClosed.consumption) / lastClosed.consumption) * 100
    : null;
  const waterEvolution = buildWaterEvolution(waterReadings);

  return {
    current: {
      range: currentRange,
      consumption: currentConsumption,
      cost: currentCost,
      progress: currentPeriod?.progress || 0,
      label: currentRange ? formatRange(currentRange) : "Ciclo não configurado"
    },
    projection,
    cycles,
    lastClosed,
    variation,
    currentVsClosed,
    waterEvolution,
    energySettings: snapshot.energy?.settings || {},
    signature: {
      readings,
      waterReadings,
      currentRange: currentRange ? [currentRange.start.toISOString(), currentRange.end.toISOString()] : null,
      currentConsumption,
      currentCost,
      projection,
      settings: snapshot.energy?.settings || {}
    }
  };
}

function projectCurrentCycle(consumption, period, readings, reportApi) {
  if (!period || period.progress <= 0) {
    return { consumption: 0, cost: 0, confidence: "Baixa confiança", closing: "—" };
  }
  const fraction = Math.max(0.08, Math.min(1, period.progress / 100));
  const projectedConsumption = Math.max(consumption, consumption / fraction);
  const estimate = reportApi.estimateEnergy?.(projectedConsumption) || { totalCost: 0 };
  const confidence = readings.length >= 6 && period.progress >= 45
    ? "Alta confiança"
    : readings.length >= 3 && period.progress >= 20
      ? "Média confiança"
      : "Baixa confiança";
  return {
    consumption: projectedConsumption,
    cost: finite(estimate.totalCost, 0),
    confidence,
    closing: period.end
  };
}

function previousRanges(currentRange, preference, count) {
  const ranges = [];
  let anchorStart = new Date(currentRange.start);
  for (let index = 0; index < count; index += 1) {
    const previousEnd = new Date(anchorStart.getTime() - 1);
    const previousStart = occurrenceOnOrBefore(previousEnd, preference.start);
    ranges.push({ start: previousStart, end: previousEnd });
    anchorStart = previousStart;
  }
  return ranges;
}

function occurrenceOnOrBefore(reference, day) {
  const atStart = new Date(reference);
  atStart.setHours(0, 0, 0, 0);
  let candidate = cycleDate(atStart.getFullYear(), atStart.getMonth(), day, false);
  if (candidate <= atStart) return candidate;
  return cycleDate(atStart.getFullYear(), atStart.getMonth() - 1, day, false);
}

function cycleDate(year, month, day, endOfDay) {
  const last = new Date(year, month + 1, 0).getDate();
  const value = new Date(year, month, Math.min(day, last));
  value.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return value;
}

function cycleMetrics(range, readings, reportApi) {
  const sorted = normalizeReadings(readings);
  const base = sorted.filter((item) => new Date(item.date) <= range.start).at(-1) || null;
  const latest = sorted.filter((item) => new Date(item.date) <= range.end).at(-1) || null;
  const available = Boolean(base && latest && new Date(latest.date) > new Date(base.date));
  const consumption = available ? Math.max(0, latest.value - base.value) : 0;
  const estimate = reportApi.estimateEnergy?.(consumption) || { baseCost: 0, flagCost: 0, totalCost: 0 };
  const days = Math.max(1, Math.round((range.end - range.start + 1) / DAY_MS));
  const boundaryConfidence = available && isNearBoundary(base.date, range.start) && isNearBoundary(latest.date, range.end);
  return {
    available,
    range,
    label: formatRange(range),
    base,
    latest,
    consumption,
    average: consumption / days,
    days,
    estimate: {
      baseCost: finite(estimate.baseCost, 0),
      flagCost: finite(estimate.flagCost, 0),
      totalCost: finite(estimate.totalCost, 0)
    },
    boundaryConfidence
  };
}

function isNearBoundary(dateValue, boundary) {
  const difference = Math.abs(new Date(dateValue).getTime() - boundary.getTime());
  return difference <= 36 * 60 * 60 * 1000;
}

function periodStats(range) {
  const now = Date.now();
  const start = range.start.getTime();
  const end = range.end.getTime();
  const total = Math.max(DAY_MS, end - start);
  const elapsed = Math.max(0, Math.min(total, now - start));
  return {
    progress: Math.round((elapsed / total) * 100),
    end: range.end
  };
}

function readingsInOrAtRange(readings, range) {
  return readings.filter((item) => {
    const time = new Date(item.date).getTime();
    return time >= range.start.getTime() && time <= range.end.getTime();
  });
}

function buildWaterEvolution(readings) {
  const sorted = normalizeReadings(readings);
  const rows = [];
  for (let index = Math.max(1, sorted.length - 7); index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    rows.push({
      date: current.date,
      consumption: Math.max(0, current.value - previous.value)
    });
  }
  return rows.slice(-6);
}

function reportMarkup(model) {
  const last = model.lastClosed;
  return `
    <div class="reports-v3" id="reports-v3-root">
      <div class="reports-v3-heading">
        <div><p class="eyebrow">ANÁLISE</p><h2>Relatórios</h2></div>
        <button id="beta-report-export" class="reports-export-button" type="button" aria-label="Exportar relatório em PDF"><span aria-hidden="true">▧</span> Exportar PDF</button>
      </div>

      <section class="reports-panel reports-overview" aria-labelledby="reports-overview-title">
        <h3 id="reports-overview-title">1. VISÃO GERAL</h3>
        <div class="reports-overview-grid">
          ${overviewCard("energy", "ϟ", "Ciclo atual", "Em andamento", model.current.label,
            "Consumo até agora", `${number(model.current.consumption, 0)} kWh`, "Gasto acumulado", money(model.current.cost), `${model.current.progress}% do período`, model.current.progress)}
          ${overviewCard("projection", "⌁", "Projeção de fechamento", model.projection.confidence, `Estimativa para ${formatDate(model.projection.closing)}`,
            "Consumo projetado", `${number(model.projection.consumption, 0)} kWh`, "Valor projetado", money(model.projection.cost), "Projeção linear do ciclo", Math.min(100, model.current.progress))}
          ${overviewCard("closed", "▤", "Último ciclo fechado", last ? (last.boundaryConfidence ? "Leituras de fechamento" : "Calculado") : "Sem dados", last?.label || "Aguardando histórico",
            "Consumo faturável", last ? `${number(last.consumption, 0)} kWh` : "—", "Valor estimado", last ? money(last.estimate.totalCost) : "—", "Com tarifa atual", last ? 100 : 0)}
          ${variationCard(model.currentVsClosed)}
        </div>
      </section>

      <section class="reports-panel reports-history" aria-labelledby="reports-history-title">
        <div class="reports-section-title"><h3 id="reports-history-title">2. HISTÓRICO DE CICLOS</h3><span>Últimos ciclos calculáveis</span></div>
        ${historyMarkup(model.cycles)}
      </section>

      <section class="reports-panel reports-detail" aria-labelledby="reports-detail-title">
        <div class="reports-section-title"><h3 id="reports-detail-title">3. DETALHAMENTO DO ÚLTIMO CICLO FECHADO</h3>${last ? `<span class="reports-badge">${last.boundaryConfidence ? "LEITURAS DE FECHAMENTO" : "ESTIMATIVA"}</span>` : ""}</div>
        ${last ? detailMarkup(last, model.energySettings) : '<div class="reports-empty">Ainda não existem duas leituras suficientes para fechar um ciclo.</div>'}
      </section>

      <section class="reports-panel reports-water" aria-labelledby="reports-water-title">
        <div class="reports-section-title"><div><h3 id="reports-water-title">4. EVOLUÇÃO DA ÁGUA</h3><p>Variação entre leituras do hidrômetro.</p></div></div>
        ${waterMarkup(model.waterEvolution)}
      </section>
    </div>`;
}

function overviewCard(kind, icon, title, badge, period, labelA, valueA, labelB, valueB, footer, progress) {
  return `<article class="reports-kpi-card ${kind}">
    <div class="reports-kpi-head"><span class="reports-kpi-icon" aria-hidden="true">${icon}</span><strong>${title}</strong></div>
    <span class="reports-status">${badge}</span>
    <small class="reports-period">${period}</small>
    <div class="reports-kpi-value"><small>${labelA}</small><b>${valueA}</b></div>
    <div class="reports-kpi-value"><small>${labelB}</small><b>${valueB}</b></div>
    <div class="reports-progress"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>
    <small class="reports-footnote">${footer}</small>
  </article>`;
}

function variationCard(value) {
  const known = Number.isFinite(value);
  const direction = !known ? "neutral" : value <= 0 ? "down" : "up";
  const sign = !known ? "" : value > 0 ? "+" : "";
  return `<article class="reports-kpi-card variation">
    <div class="reports-kpi-head"><span class="reports-kpi-icon" aria-hidden="true">⚖</span><strong>Variação vs. ciclo anterior</strong></div>
    <small class="reports-period">Comparação de consumo</small>
    <div class="reports-variation ${direction}">${known ? `${value <= 0 ? "↓" : "↑"} ${sign}${number(value, 1)}%` : "—"}</div>
    <small class="reports-footnote">${known ? "Diferença em relação ao último ciclo fechado" : "Aguardando dois ciclos fechados"}</small>
  </article>`;
}

function historyMarkup(cycles) {
  if (!cycles.length) return '<div class="reports-empty">O histórico aparecerá quando houver leituras suficientes para fechar ciclos.</div>';
  const visible = cycles.slice(0, 5);
  return `<div class="reports-history-table" role="table" aria-label="Histórico de ciclos">
    <div class="reports-history-header" role="row"><span>Período</span><span>Consumo</span><span>Valor estimado</span><span>Variação</span></div>
    ${visible.map((cycle, index) => {
      const older = cycles[index + 1];
      const variation = older?.consumption > 0 ? ((cycle.consumption - older.consumption) / older.consumption) * 100 : null;
      const variationText = Number.isFinite(variation) ? `${variation > 0 ? "↑" : variation < 0 ? "↓" : "→"} ${Math.abs(variation).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
      const variationClass = Number.isFinite(variation) ? (variation > 0 ? "up" : variation < 0 ? "down" : "neutral") : "neutral";
      return `<div class="reports-history-row" role="row">
        <span><b aria-hidden="true">▣</b><span><strong>${cycle.label}</strong><small><em>Fechado</em>${cycle.boundaryConfidence ? "Leituras próximas às bordas do ciclo" : "Calculado por leituras disponíveis"}</small></span></span>
        <span><strong>${number(cycle.consumption, 0)} kWh</strong></span>
        <span><strong>${money(cycle.estimate.totalCost)}</strong></span>
        <span class="${variationClass}">${variationText}</span>
      </div>`;
    }).join("")}
  </div>`;
}

function detailMarkup(cycle, settings) {
  const lighting = finite(settings?.lightingFee, 0);
  const subtotal = cycle.estimate.baseCost + cycle.estimate.flagCost + lighting;
  return `<div class="reports-detail-card">
    <div class="reports-detail-head">
      <div><span class="reports-calendar" aria-hidden="true">▣</span><strong>${cycle.label}</strong><span class="reports-status">Fechado</span></div>
      <div><small>Total estimado</small><b>${money(cycle.estimate.totalCost)}</b></div>
    </div>
    <div class="reports-detail-metrics">
      ${metric("Dias faturáveis", `${cycle.days}`, "dias")}
      ${metric("Leitura anterior", cycle.base ? `${number(cycle.base.value, 0)} kWh` : "—", cycle.base ? formatDate(cycle.base.date) : "")}
      ${metric("Leitura atual", cycle.latest ? `${number(cycle.latest.value, 0)} kWh` : "—", cycle.latest ? formatDate(cycle.latest.date) : "")}
      ${metric("Consumo médio", `${number(cycle.average, 1)} kWh`, "por dia")}
      ${metric("Consumo do ciclo", `${number(cycle.consumption, 0)} kWh`, "calculado")}
    </div>
    <div class="reports-detail-columns">
      <div>
        <h4>Composição da estimativa</h4>
        ${costRow("Consumo de energia", `${number(cycle.consumption, 0)} kWh × ${money(finite(settings?.rate, 0))}`, cycle.estimate.baseCost)}
        ${costRow("Bandeira tarifária", String(settings?.flag || "—"), cycle.estimate.flagCost)}
        ${costRow("Iluminação pública (COSIP)", "Configuração atual", lighting)}
        <div class="reports-cost-total"><span>SUBTOTAL MODELADO</span><strong>${money(subtotal)}</strong></div>
        <div class="reports-cost-muted"><span>Impostos e outros encargos</span><strong>Conforme fatura</strong></div>
        <div class="reports-cost-grand"><span>TOTAL ESTIMADO</span><strong>${money(cycle.estimate.totalCost)}</strong></div>
      </div>
      <div>
        <h4>Qualidade do cálculo</h4>
        <div class="reports-comparison-row"><span>Origem do consumo</span><strong>${cycle.boundaryConfidence ? "Leituras próximas ao fechamento" : "Leituras disponíveis"}</strong></div>
        <div class="reports-comparison-row"><span>Tarifa aplicada</span><strong>Configuração atual</strong></div>
        <div class="reports-comparison-row"><span>Fatura oficial vinculada</span><strong>Não</strong></div>
        <p class="reports-info-note">O Volt não inventa PIS/COFINS, ICMS ou valor de fatura. Quando uma fatura oficial for vinculada, o relatório poderá separar valor real e estimativa.</p>
      </div>
    </div>
  </div>`;
}

function metric(label, value, note) {
  return `<div><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`;
}

function costRow(label, detail, value) {
  return `<div class="reports-cost-row"><span><b>${label}</b><small>${detail}</small></span><strong>${money(value)}</strong></div>`;
}

function waterMarkup(rows) {
  if (!rows.length) return '<div class="reports-empty">Adicione pelo menos duas leituras de água para visualizar a evolução.</div>';
  const max = Math.max(...rows.map((row) => row.consumption), 0.001);
  return `<div class="reports-water-chart">${rows.map((row) => {
    const height = Math.max(8, Math.round((row.consumption / max) * 100));
    return `<div class="reports-water-bar"><span>${number(row.consumption, 2)} m³</span><i style="height:${height}%"></i><small>${shortDate(row.date)}</small></div>`;
  }).join("")}</div>`;
}

function exportReportPdf() {
  const title = document.title;
  document.title = `Volt - Relatorio - ${new Date().toLocaleDateString("pt-BR")}`;
  document.documentElement.dataset.printingReport = "true";
  const restore = () => {
    delete document.documentElement.dataset.printingReport;
    document.title = title;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  window.setTimeout(restore, 1500);
}

function normalizeReadings(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({ value: Number(item?.value), date: item?.date }))
    .filter((item) => Number.isFinite(item.value) && item.date && Number.isFinite(new Date(item.date).getTime()))
    .sort((left, right) => new Date(left.date) - new Date(right.date));
}

function normalizeRange(range) {
  if (!range?.start || !range?.end) return null;
  const start = new Date(range.start), end = new Date(range.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  return { start, end };
}

function normalizePreference(preference) {
  const start = Number(preference?.start), end = Number(preference?.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > 31 || end < 1 || end > 31) return null;
  return { start, end };
}

function formatRange(range) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${formatter.format(range.start)} – ${formatter.format(range.end)}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

function shortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function money(value) {
  return finite(value, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function number(value, digits) {
  return finite(value, 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
