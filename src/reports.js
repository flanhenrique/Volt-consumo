import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260825.4";

const FLAG_RATES = Object.freeze({ green: 0, yellow: 0.01885, red1: 0.04463, red2: 0.07877 });
const PERIOD_MONTHS = Object.freeze({ "3m": 3, "6m": 6 });
const MODE_LABELS = Object.freeze({ overview: "Visão geral", energy: "Energia", water: "Água", custom: "Personalizados" });

let initialized = false;
let lastState = null;
let lastSnapshot = null;
let reportPeriod = "6m";
let reportMode = "overview";
let chartUnit = "consumption";

export function renderReports(state, snapshot) {
  lastState = state;
  lastSnapshot = snapshot;
  ensureStyles();
  ensurePage();
  renderCurrentView();
}

function ensureStyles() {
  if (document.querySelector('link[data-volt-reports-style="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./styles/reports.css?v=20260825.4";
  link.dataset.voltReportsStyle = "true";
  document.head.append(link);
}

function ensurePage() {
  if (initialized) return;
  const page = document.getElementById("page-reports");
  if (!page) return;
  page.classList.remove("reports-empty-page");
  page.classList.add("reports-page");
  page.setAttribute("aria-labelledby", "reports-title");
  page.innerHTML = `
    <header class="page-header reports-header">
      <div class="page-header-copy">
        <p class="eyebrow">ANÁLISE E HISTÓRICO</p>
        <h1 id="reports-title">Relatórios</h1>
        <p class="supporting-copy">Analise consumo, custos e tendências usando as leituras registradas no Volt.</p>
      </div>
      <div class="reports-header-actions">
        <label class="report-period-control glass-control">
          <span>Período</span>
          <select data-report-period aria-label="Período do relatório">
            <option value="cycle">Ciclo atual</option>
            <option value="3m">Últimos 3 meses</option>
            <option value="6m" selected>Últimos 6 meses</option>
            <option value="all">Todo o histórico</option>
          </select>
        </label>
        <button class="secondary-button report-export-button" type="button" data-report-export>
          <svg class="icon" aria-hidden="true"><use href="#icon-report"></use></svg>
          Exportar relatório
        </button>
      </div>
    </header>

    <nav class="report-tabs glass-control" aria-label="Tipo de relatório">
      <button type="button" data-report-tab="overview" aria-pressed="true"><svg class="icon"><use href="#icon-report"></use></svg>Visão geral</button>
      <button type="button" data-report-tab="energy" aria-pressed="false"><svg class="icon"><use href="#icon-bolt"></use></svg>Energia</button>
      <button type="button" data-report-tab="water" aria-pressed="false"><svg class="icon"><use href="#icon-water"></use></svg>Água</button>
      <button type="button" data-report-tab="custom" aria-pressed="false"><svg class="icon"><use href="#icon-settings"></use></svg>Personalizados</button>
    </nav>

    <section data-report-panel="overview" class="report-panel">
      <div class="report-metrics-grid">
        <article class="report-metric-card card glass-level-2">
          <span class="report-metric-icon energy"><svg class="icon"><use href="#icon-bolt"></use></svg></span>
          <div><span class="metric-caption">Consumo de energia</span><strong id="report-overview-energy" class="metric-value">—</strong><small id="report-overview-energy-delta" class="report-delta"></small></div>
        </article>
        <article class="report-metric-card card glass-level-2">
          <span class="report-metric-icon cost"><svg class="icon"><use href="#icon-wallet"></use></svg></span>
          <div><span class="metric-caption">Gasto estimado total</span><strong id="report-overview-cost" class="metric-value">—</strong><small id="report-overview-cost-note" class="muted"></small></div>
        </article>
        <article class="report-metric-card card glass-level-2">
          <span class="report-metric-icon"><svg class="icon"><use href="#icon-chart"></use></svg></span>
          <div><span class="metric-caption">Média mensal</span><strong id="report-overview-average" class="metric-value">—</strong><small class="muted">energia no período</small></div>
        </article>
        <article class="report-metric-card card glass-level-2">
          <span class="report-metric-icon days"><svg class="icon"><use href="#icon-reading"></use></svg></span>
          <div><span class="metric-caption">Dias analisados</span><strong id="report-overview-days" class="metric-value">—</strong><small id="report-overview-range" class="muted"></small></div>
        </article>
      </div>

      <div class="report-primary-grid">
        <article class="report-chart-card card glass-level-3" id="report-evolution-section">
          <div class="card-header report-card-header">
            <div><p class="eyebrow">EVOLUÇÃO</p><h2>Evolução do consumo</h2></div>
            <div class="report-unit-toggle glass-control" aria-label="Unidade do gráfico">
              <button type="button" data-report-unit="consumption" aria-pressed="true">kWh</button>
              <button type="button" data-report-unit="cost" aria-pressed="false">R$</button>
            </div>
          </div>
          <div id="report-overview-chart" class="report-bar-chart" aria-label="Evolução mensal do consumo"></div>
        </article>

        <article class="report-composition-card card glass-level-3">
          <div><p class="eyebrow">COMPOSIÇÃO</p><h2>Composição da estimativa</h2></div>
          <div class="report-donut-wrap">
            <div id="report-cost-donut" class="report-cost-donut" aria-hidden="true"><span><small>Total</small><strong id="report-donut-total">—</strong></span></div>
            <ul id="report-cost-legend" class="report-legend"></ul>
          </div>
        </article>
      </div>

      <div class="report-secondary-grid">
        <article class="report-comparison-card card glass-level-3" id="report-comparison-section">
          <div class="card-header"><div><p class="eyebrow">COMPARATIVO</p><h2>Período atual x anterior</h2></div><span id="report-comparison-badge" class="chip">—</span></div>
          <div id="report-comparison-chart" class="report-comparison-bars"></div>
        </article>

        <article class="report-summary-card card glass-level-3">
          <div><p class="eyebrow">RESUMO</p><h2>Resumo do período</h2></div>
          <ul id="report-summary-list" class="report-summary-list"></ul>
        </article>

        <article class="report-library-card card glass-level-3">
          <div><p class="eyebrow">RELATÓRIOS</p><h2>Relatórios disponíveis</h2></div>
          <div class="report-library-list">
            <button type="button" data-report-action="energy"><span class="report-action-icon"><svg class="icon"><use href="#icon-bolt"></use></svg></span><span><strong>Relatório de consumo</strong><small>Energia e evolução por período</small></span><svg class="icon"><use href="#icon-chevron"></use></svg></button>
            <button type="button" data-report-action="finance"><span class="report-action-icon"><svg class="icon"><use href="#icon-wallet"></use></svg></span><span><strong>Relatório financeiro</strong><small>Estimativas e composição dos custos</small></span><svg class="icon"><use href="#icon-chevron"></use></svg></button>
            <button type="button" data-report-action="comparison"><span class="report-action-icon"><svg class="icon"><use href="#icon-chart"></use></svg></span><span><strong>Relatório de comparação</strong><small>Compare períodos e tendências</small></span><svg class="icon"><use href="#icon-chevron"></use></svg></button>
            <button type="button" data-report-action="water"><span class="report-action-icon water"><svg class="icon"><use href="#icon-water"></use></svg></span><span><strong>Relatório de água</strong><small>Consumo, custo e médias</small></span><svg class="icon"><use href="#icon-chevron"></use></svg></button>
            <button type="button" data-report-action="custom"><span class="report-action-icon"><svg class="icon"><use href="#icon-settings"></use></svg></span><span><strong>Relatório personalizado</strong><small>Escolha os dados da exportação</small></span><svg class="icon"><use href="#icon-chevron"></use></svg></button>
          </div>
        </article>
      </div>
    </section>

    <section data-report-panel="energy" class="report-panel" hidden>
      <div class="report-detail-hero card glass-level-3">
        <div><p class="eyebrow">ENERGIA</p><h2>Consumo e faturamento</h2><p class="supporting-copy">Leituras, estimativas, tarifa configurada e comportamento no período selecionado.</p></div>
        <span class="report-detail-symbol energy"><svg class="icon"><use href="#icon-bolt"></use></svg></span>
      </div>
      <div class="report-detail-metrics">
        <article class="card glass-level-2"><span class="metric-caption">Consumo</span><strong id="report-energy-total" class="metric-value">—</strong><small id="report-energy-change" class="report-delta"></small></article>
        <article class="card glass-level-2"><span class="metric-caption">Gasto estimado</span><strong id="report-energy-cost" class="metric-value">—</strong><small class="muted">configuração atual</small></article>
        <article class="card glass-level-2"><span class="metric-caption">Média por intervalo</span><strong id="report-energy-average" class="metric-value">—</strong><small class="muted">entre leituras</small></article>
        <article class="card glass-level-2"><span class="metric-caption">Maior intervalo</span><strong id="report-energy-peak" class="metric-value">—</strong><small id="report-energy-peak-date" class="muted"></small></article>
      </div>
      <div class="report-detail-grid">
        <article class="card glass-level-3"><div class="card-header"><div><p class="eyebrow">HISTÓRICO</p><h2>Evolução de energia</h2></div></div><div id="report-energy-chart" class="report-bar-chart"></div></article>
        <article class="card glass-level-3"><div><p class="eyebrow">CONFIGURAÇÃO</p><h2>Tarifa e meta</h2></div><ul id="report-energy-settings" class="report-summary-list"></ul></article>
      </div>
    </section>

    <section data-report-panel="water" class="report-panel" hidden>
      <div class="report-detail-hero card glass-level-3">
        <div><p class="eyebrow">ÁGUA</p><h2>Consumo e custo estimado</h2><p class="supporting-copy">Acompanhe volume consumido, custo, média e picos entre leituras.</p></div>
        <span class="report-detail-symbol water"><svg class="icon"><use href="#icon-water"></use></svg></span>
      </div>
      <div class="report-detail-metrics">
        <article class="card glass-level-2"><span class="metric-caption">Consumo</span><strong id="report-water-total" class="metric-value">—</strong><small id="report-water-change" class="report-delta"></small></article>
        <article class="card glass-level-2"><span class="metric-caption">Gasto estimado</span><strong id="report-water-cost" class="metric-value">—</strong><small class="muted">água + esgoto + taxa fixa</small></article>
        <article class="card glass-level-2"><span class="metric-caption">Média por intervalo</span><strong id="report-water-average" class="metric-value">—</strong><small class="muted">entre leituras</small></article>
        <article class="card glass-level-2"><span class="metric-caption">Maior intervalo</span><strong id="report-water-peak" class="metric-value">—</strong><small id="report-water-peak-date" class="muted"></small></article>
      </div>
      <div class="report-detail-grid">
        <article class="card glass-level-3"><div class="card-header"><div><p class="eyebrow">HISTÓRICO</p><h2>Evolução de água</h2></div></div><div id="report-water-chart" class="report-bar-chart water"></div></article>
        <article class="card glass-level-3"><div><p class="eyebrow">CONFIGURAÇÃO</p><h2>Tarifa e meta</h2></div><ul id="report-water-settings" class="report-summary-list"></ul></article>
      </div>
    </section>

    <section data-report-panel="custom" class="report-panel" hidden>
      <div class="report-custom-layout">
        <article class="card glass-level-3 report-custom-builder">
          <div><p class="eyebrow">PERSONALIZADO</p><h2>Monte seu relatório</h2><p class="supporting-copy">Escolha quais grupos de dados devem entrar no arquivo exportado.</p></div>
          <div class="report-custom-options" role="group" aria-label="Dados do relatório personalizado">
            <label><input type="checkbox" data-report-custom="summary" checked><span><strong>Resumo geral</strong><small>Consumo, gasto, médias e período</small></span></label>
            <label><input type="checkbox" data-report-custom="energy" checked><span><strong>Energia</strong><small>Leituras, tarifa, bandeira e evolução</small></span></label>
            <label><input type="checkbox" data-report-custom="water" checked><span><strong>Água</strong><small>Volume, esgoto, taxa fixa e evolução</small></span></label>
            <label><input type="checkbox" data-report-custom="readings" checked><span><strong>Leituras</strong><small>Histórico bruto de registros</small></span></label>
          </div>
          <button class="primary-button" type="button" data-report-custom-export><svg class="icon"><use href="#icon-report"></use></svg>Exportar personalizado</button>
        </article>
        <aside class="card glass-level-2 report-custom-preview">
          <span class="report-detail-symbol"><svg class="icon"><use href="#icon-report"></use></svg></span>
          <div><p class="eyebrow">PRÉVIA</p><h2 id="report-custom-title">Relatório Volt</h2><p id="report-custom-copy" class="supporting-copy"></p></div>
          <ul id="report-custom-preview-list" class="report-summary-list"></ul>
        </aside>
      </div>
    </section>

    <aside class="report-security-note card glass-level-2">
      <span class="report-security-icon"><svg class="icon"><use href="#icon-shield"></use></svg></span>
      <div><strong>Seus dados permanecem sob seu controle.</strong><small>Os relatórios são calculados a partir das leituras e configurações da sua conta.</small></div>
    </aside>
  `;

  page.addEventListener("click", handleReportClick);
  page.addEventListener("change", handleReportChange);
  initialized = true;
}

function handleReportClick(event) {
  const tab = event.target.closest("[data-report-tab]");
  if (tab) {
    reportMode = tab.dataset.reportTab;
    renderCurrentView();
    return;
  }
  const unit = event.target.closest("[data-report-unit]");
  if (unit) {
    chartUnit = unit.dataset.reportUnit;
    renderCurrentView();
    return;
  }
  if (event.target.closest("[data-report-export]")) {
    exportReport(false);
    return;
  }
  if (event.target.closest("[data-report-custom-export]")) {
    exportReport(true);
    return;
  }
  const action = event.target.closest("[data-report-action]");
  if (!action) return;
  const target = action.dataset.reportAction;
  if (["energy", "water", "custom"].includes(target)) {
    reportMode = target;
    renderCurrentView();
    document.getElementById("page-reports")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (target === "comparison") {
    document.getElementById("report-comparison-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
  } else if (target === "finance") {
    document.querySelector(".report-composition-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function handleReportChange(event) {
  if (event.target.matches("[data-report-period]")) {
    reportPeriod = event.target.value;
    renderCurrentView();
    return;
  }
  if (event.target.matches("[data-report-custom]")) renderCustomPreview(buildReportData(lastState, lastSnapshot));
}

function renderCurrentView() {
  if (!lastState || !lastSnapshot || !initialized) return;
  const data = buildReportData(lastState, lastSnapshot);
  document.querySelectorAll("[data-report-tab]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.reportTab === reportMode)));
  document.querySelectorAll("[data-report-panel]").forEach((panel) => { panel.hidden = panel.dataset.reportPanel !== reportMode; });
  document.querySelectorAll("[data-report-unit]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.reportUnit === chartUnit)));
  const periodSelect = document.querySelector("[data-report-period]");
  if (periodSelect && periodSelect.value !== reportPeriod) periodSelect.value = reportPeriod;
  renderOverview(data);
  renderEnergy(data);
  renderWater(data);
  renderCustomPreview(data);
}

function buildReportData(state, snapshot) {
  const energyAll = readingIntervals(state.readings.energy);
  const waterAll = readingIntervals(state.readings.water);
  const range = periodRange(reportPeriod, snapshot, energyAll, waterAll);
  const energyIntervals = filterIntervals(energyAll, range);
  const waterIntervals = filterIntervals(waterAll, range);
  const energyConsumption = reportPeriod === "cycle" ? snapshot.energy.consumption : sumValues(energyIntervals);
  const waterConsumption = reportPeriod === "cycle" ? snapshot.water.consumption : sumValues(waterIntervals);
  const monthBuckets = aggregateMonths(energyIntervals, waterIntervals);
  if (!monthBuckets.length && (energyConsumption > 0 || waterConsumption > 0)) {
    monthBuckets.push({ key: monthKey(range.end), date: range.end, energy: energyConsumption, water: waterConsumption });
  }
  const estimates = estimateBuckets(monthBuckets, state.settings);
  const comparison = buildComparison(state, snapshot, energyAll, waterAll, range);
  const days = Math.max(1, Math.ceil((Math.min(Date.now(), range.end.getTime()) - range.start.getTime()) / 86400000) + 1);
  const energyAverage = energyIntervals.length ? energyConsumption / energyIntervals.length : energyConsumption;
  const waterAverage = waterIntervals.length ? waterConsumption / waterIntervals.length : waterConsumption;
  const energyPeak = peakInterval(energyIntervals);
  const waterPeak = peakInterval(waterIntervals);
  const monthCount = Math.max(1, monthBuckets.length);
  return {
    state,
    snapshot,
    range,
    energyIntervals,
    waterIntervals,
    energyConsumption,
    waterConsumption,
    monthBuckets,
    estimates,
    comparison,
    days,
    monthCount,
    energyAverage,
    waterAverage,
    energyPeak,
    waterPeak,
    periodLabel: periodLabel(reportPeriod),
    rangeLabel: formatRange(range.start, range.end)
  };
}

function periodRange(period, snapshot, energyIntervals, waterIntervals) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  if (period === "cycle") {
    const starts = [snapshot.energy.cycle.current.start, snapshot.water.cycle.current.start].map((value) => new Date(value));
    const ends = [snapshot.energy.cycle.current.end, snapshot.water.cycle.current.end].map((value) => new Date(value));
    return { start: new Date(Math.min(...starts.map(Number))), end: new Date(Math.max(...ends.map(Number))) };
  }
  if (PERIOD_MONTHS[period]) {
    const start = new Date(now);
    start.setMonth(start.getMonth() - PERIOD_MONTHS[period]);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  const dates = [...energyIntervals, ...waterIntervals].map((item) => new Date(item.startDate || item.date)).filter((date) => Number.isFinite(date.getTime()));
  const firstReadingDates = [lastState?.readings?.energy?.[0]?.date, lastState?.readings?.water?.[0]?.date].filter(Boolean).map((value) => new Date(value));
  const allDates = [...dates, ...firstReadingDates].filter((date) => Number.isFinite(date.getTime()));
  const start = allDates.length ? new Date(Math.min(...allDates.map(Number))) : new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

function filterIntervals(intervals, range) {
  return intervals.filter((item) => {
    const date = new Date(item.date);
    return date >= range.start && date <= range.end;
  });
}

function readingIntervals(readings) {
  const sorted = [...(readings || [])].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  return sorted.slice(1).map((reading, index) => ({
    value: Math.max(0, Number(reading.value) - Number(sorted[index].value)),
    date: reading.date,
    startDate: sorted[index].date
  }));
}

function aggregateMonths(energyIntervals, waterIntervals) {
  const buckets = new Map();
  const add = (item, type) => {
    const date = new Date(item.date);
    const key = monthKey(date);
    if (!buckets.has(key)) buckets.set(key, { key, date: new Date(date.getFullYear(), date.getMonth(), 1), energy: 0, water: 0 });
    buckets.get(key)[type] += Number(item.value) || 0;
  };
  energyIntervals.forEach((item) => add(item, "energy"));
  waterIntervals.forEach((item) => add(item, "water"));
  return [...buckets.values()].sort((left, right) => left.date - right.date);
}

function estimateBuckets(buckets, settings) {
  const result = { energy: 0, water: 0, total: 0, base: 0, flag: 0, lighting: 0, adjustments: 0 };
  for (const bucket of buckets) {
    const energy = calculateEnergyEstimate(bucket.energy, {
      rate: settings.energy.rate,
      flagRate: FLAG_RATES[settings.energy.flag] ?? 0,
      lightingFee: settings.energy.lightingFee,
      flagLabel: settings.energy.flag
    });
    const water = calculateWaterEstimate(bucket.water, settings.water);
    const lighting = Number(settings.energy.lightingFee) || 0;
    result.energy += Number(energy.totalCost) || 0;
    result.water += Number(water.totalCost) || 0;
    result.base += Number(energy.baseCost) || 0;
    result.flag += Number(energy.flagCost) || 0;
    result.lighting += lighting;
    result.adjustments += (Number(energy.totalCost) || 0) - (Number(energy.baseCost) || 0) - (Number(energy.flagCost) || 0) - lighting;
  }
  result.total = result.energy + result.water;
  return result;
}

function buildComparison(state, snapshot, energyAll, waterAll, currentRange) {
  let previousRange;
  let currentEnergy;
  let currentWater;
  if (reportPeriod === "cycle") {
    previousRange = {
      start: new Date(Math.min(Number(snapshot.energy.cycle.previous.start), Number(snapshot.water.cycle.previous.start))),
      end: new Date(Math.max(Number(snapshot.energy.cycle.previous.end), Number(snapshot.water.cycle.previous.end)))
    };
    currentEnergy = snapshot.energy.consumption;
    currentWater = snapshot.water.consumption;
  } else if (PERIOD_MONTHS[reportPeriod]) {
    previousRange = { end: new Date(currentRange.start.getTime() - 1), start: new Date(currentRange.start) };
    previousRange.start.setMonth(previousRange.start.getMonth() - PERIOD_MONTHS[reportPeriod]);
    currentEnergy = sumValues(filterIntervals(energyAll, currentRange));
    currentWater = sumValues(filterIntervals(waterAll, currentRange));
  } else {
    const allEnergy = filterIntervals(energyAll, currentRange);
    const allWater = filterIntervals(waterAll, currentRange);
    const dates = [...allEnergy, ...allWater].map((item) => Date.parse(item.date)).filter(Number.isFinite).sort((a, b) => a - b);
    const midpoint = dates.length ? dates[Math.floor(dates.length / 2)] : currentRange.start.getTime();
    previousRange = { start: currentRange.start, end: new Date(midpoint - 1) };
    const latter = { start: new Date(midpoint), end: currentRange.end };
    currentEnergy = sumValues(filterIntervals(energyAll, latter));
    currentWater = sumValues(filterIntervals(waterAll, latter));
    currentRange = latter;
  }
  const previousEnergyIntervals = filterIntervals(energyAll, previousRange);
  const previousWaterIntervals = filterIntervals(waterAll, previousRange);
  const previousEnergy = reportPeriod === "cycle" ? consumptionWithinRange(state.readings.energy, snapshot.energy.cycle.previous) : sumValues(previousEnergyIntervals);
  const previousWater = reportPeriod === "cycle" ? consumptionWithinRange(state.readings.water, snapshot.water.cycle.previous) : sumValues(previousWaterIntervals);
  const currentBuckets = aggregateMonths(filterIntervals(energyAll, currentRange), filterIntervals(waterAll, currentRange));
  const previousBuckets = aggregateMonths(previousEnergyIntervals, previousWaterIntervals);
  const currentEstimate = estimateBuckets(currentBuckets.length ? currentBuckets : [{ date: currentRange.end, energy: currentEnergy, water: currentWater }], state.settings);
  const previousEstimate = estimateBuckets(previousBuckets.length ? previousBuckets : [{ date: previousRange.end, energy: previousEnergy, water: previousWater }], state.settings);
  return {
    currentEnergy,
    previousEnergy,
    currentWater,
    previousWater,
    currentCost: currentEstimate.total,
    previousCost: previousEstimate.total,
    energyChange: relativeChange(currentEnergy, previousEnergy),
    waterChange: relativeChange(currentWater, previousWater),
    costChange: relativeChange(currentEstimate.total, previousEstimate.total)
  };
}

function consumptionWithinRange(readings, range) {
  const sorted = [...(readings || [])].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const base = sorted.filter((item) => new Date(item.date) <= new Date(range.start)).at(-1);
  const latest = sorted.filter((item) => new Date(item.date) <= new Date(range.end)).at(-1);
  if (base && latest && Date.parse(latest.date) > Date.parse(base.date)) return Math.max(0, Number(latest.value) - Number(base.value));
  const contained = sorted.filter((item) => {
    const date = new Date(item.date);
    return date >= new Date(range.start) && date <= new Date(range.end);
  });
  return contained.length >= 2 ? Math.max(0, Number(contained.at(-1).value) - Number(contained[0].value)) : 0;
}

function renderOverview(data) {
  setText("report-overview-energy", `${formatNumber(data.energyConsumption, 0)} kWh`);
  setDelta("report-overview-energy-delta", data.comparison.energyChange, "vs. período anterior");
  setText("report-overview-cost", currency(data.estimates.total));
  setText("report-overview-cost-note", `${currency(data.estimates.energy)} energia · ${currency(data.estimates.water)} água`);
  setText("report-overview-average", `${formatNumber(data.energyConsumption / data.monthCount, 0)} kWh`);
  setText("report-overview-days", `${data.days} ${data.days === 1 ? "dia" : "dias"}`);
  setText("report-overview-range", data.rangeLabel);
  renderMonthlyChart("report-overview-chart", data.monthBuckets, chartUnit === "cost" ? "cost" : "energy", data.state.settings);
  renderComposition(data);
  renderComparison(data);
  renderSummary(data);
}

function renderEnergy(data) {
  setText("report-energy-total", `${formatNumber(data.energyConsumption, 0)} kWh`);
  setDelta("report-energy-change", data.comparison.energyChange, "vs. período anterior");
  setText("report-energy-cost", currency(data.estimates.energy));
  setText("report-energy-average", `${formatNumber(data.energyAverage, 0)} kWh`);
  setText("report-energy-peak", `${formatNumber(data.energyPeak?.value || 0, 0)} kWh`);
  setText("report-energy-peak-date", data.energyPeak ? monthLabel(new Date(data.energyPeak.date), true) : "Sem intervalo suficiente");
  renderMonthlyChart("report-energy-chart", data.monthBuckets, "energy", data.state.settings);
  replaceSummary("report-energy-settings", [
    ["Tarifa base", `${currency(Number(data.state.settings.energy.rate) || 0)}/kWh`, "Configuração atual"],
    ["Bandeira", flagLabel(data.state.settings.energy.flag), `${currency(FLAG_RATES[data.state.settings.energy.flag] ?? 0)}/kWh`],
    ["Iluminação pública", currency(Number(data.state.settings.energy.lightingFee) || 0), "por ciclo estimado"],
    ["Meta de energia", `${formatNumber(data.state.settings.energy.goal, 0)} kWh`, data.snapshot.energy.status.label]
  ]);
}

function renderWater(data) {
  setText("report-water-total", `${formatNumber(data.waterConsumption, 3)} m³`);
  setDelta("report-water-change", data.comparison.waterChange, "vs. período anterior");
  setText("report-water-cost", currency(data.estimates.water));
  setText("report-water-average", `${formatNumber(data.waterAverage, 3)} m³`);
  setText("report-water-peak", `${formatNumber(data.waterPeak?.value || 0, 3)} m³`);
  setText("report-water-peak-date", data.waterPeak ? monthLabel(new Date(data.waterPeak.date), true) : "Sem intervalo suficiente");
  renderMonthlyChart("report-water-chart", data.monthBuckets, "water", data.state.settings);
  replaceSummary("report-water-settings", [
    ["Tarifa de água", `${currency(Number(data.state.settings.water.rate) || 0)}/m³`, "Configuração atual"],
    ["Esgoto", `${formatNumber(Number(data.state.settings.water.sewerPercent) || 0, 0)}%`, "sobre o custo de água"],
    ["Taxa fixa", currency(Number(data.state.settings.water.fixedFee) || 0), "por ciclo estimado"],
    ["Meta de água", `${formatNumber(data.state.settings.water.goal, 1)} m³`, data.snapshot.water.status.label]
  ]);
}

function renderMonthlyChart(id, buckets, type, settings) {
  const container = document.getElementById(id);
  if (!container) return;
  const recent = buckets.slice(-8);
  if (!recent.length) {
    container.replaceChildren(emptyChartMessage());
    container.dataset.empty = "true";
    return;
  }
  const values = recent.map((bucket) => {
    if (type === "cost") return estimateBuckets([bucket], settings).total;
    return Number(bucket[type]) || 0;
  });
  const max = Math.max(1, ...values);
  const nodes = recent.map((bucket, index) => {
    const value = values[index];
    const item = document.createElement("div");
    item.className = `report-bar${type === "water" ? " water" : ""}`;
    const valueLabel = document.createElement("strong");
    valueLabel.textContent = type === "cost" ? compactCurrency(value) : `${formatNumber(value, type === "water" ? 2 : 0)}`;
    const bar = document.createElement("span");
    bar.style.setProperty("--report-bar-height", `${Math.max(5, (value / max) * 100)}%`);
    const label = document.createElement("small");
    label.textContent = monthLabel(bucket.date);
    item.append(valueLabel, bar, label);
    return item;
  });
  container.replaceChildren(...nodes);
  container.dataset.empty = "false";
}

function renderComposition(data) {
  const total = Math.max(0, data.estimates.total);
  const parts = [
    { label: "Energia", value: Math.max(0, data.estimates.base), tone: "energy" },
    { label: "Bandeira", value: Math.max(0, data.estimates.flag), tone: "flag" },
    { label: "Iluminação", value: Math.max(0, data.estimates.lighting), tone: "lighting" },
    { label: "Água e esgoto", value: Math.max(0, data.estimates.water), tone: "water" }
  ];
  const adjustment = data.estimates.adjustments;
  if (Math.abs(adjustment) >= 0.01) parts.push({ label: adjustment < 0 ? "Descontos/benefícios" : "Outros ajustes", value: adjustment, tone: "adjustment" });
  const positiveBase = parts.reduce((sum, part) => sum + Math.max(0, part.value), 0) || 1;
  let cursor = 0;
  const stops = [];
  for (const part of parts) {
    const positive = Math.max(0, part.value);
    const next = cursor + (positive / positiveBase) * 100;
    stops.push(`${compositionColor(part.tone)} ${cursor}% ${next}%`);
    cursor = next;
  }
  const donut = document.getElementById("report-cost-donut");
  if (donut) donut.style.background = `conic-gradient(${stops.join(", ")})`;
  setText("report-donut-total", currency(total));
  const legend = document.getElementById("report-cost-legend");
  if (legend) {
    legend.replaceChildren(...parts.map((part) => {
      const item = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `report-legend-dot ${part.tone}`;
      const copy = document.createElement("span");
      const label = document.createElement("small");
      const value = document.createElement("strong");
      label.textContent = part.label;
      value.textContent = `${currency(part.value)} · ${formatNumber((Math.abs(part.value) / Math.max(total, 0.01)) * 100, 0)}%`;
      copy.append(label, value);
      item.append(dot, copy);
      return item;
    }));
  }
}

function renderComparison(data) {
  const container = document.getElementById("report-comparison-chart");
  if (!container) return;
  const current = Math.max(0, data.comparison.currentEnergy);
  const previous = Math.max(0, data.comparison.previousEnergy);
  const max = Math.max(1, current, previous);
  const item = (label, value, currentPeriod) => {
    const wrapper = document.createElement("div");
    wrapper.className = `report-comparison-column${currentPeriod ? " current" : ""}`;
    const strong = document.createElement("strong");
    strong.textContent = `${formatNumber(value, 0)} kWh`;
    const bar = document.createElement("span");
    bar.style.setProperty("--comparison-height", `${Math.max(7, (value / max) * 100)}%`);
    const small = document.createElement("small");
    small.textContent = label;
    wrapper.append(strong, bar, small);
    return wrapper;
  };
  container.replaceChildren(item("Anterior", previous, false), item("Atual", current, true));
  const change = data.comparison.energyChange;
  const badge = document.getElementById("report-comparison-badge");
  if (badge) {
    badge.textContent = Number.isFinite(change) ? signedPercent(change) : "Sem base anterior";
    badge.dataset.tone = change > 0 ? "warning" : change < 0 ? "success" : "neutral";
  }
}

function renderSummary(data) {
  const energyChange = data.comparison.energyChange;
  const costChange = data.comparison.costChange;
  const biggest = data.monthBuckets.reduce((peak, item) => !peak || item.energy > peak.energy ? item : peak, null);
  replaceSummary("report-summary-list", [
    ["Variação do consumo", Number.isFinite(energyChange) ? signedPercent(energyChange) : "Sem comparação", "energia vs. período anterior", deltaTone(energyChange)],
    ["Variação do gasto", Number.isFinite(costChange) ? signedPercent(costChange) : "Sem comparação", "estimativa total vs. período anterior", deltaTone(costChange)],
    ["Maior consumo mensal", biggest ? `${formatNumber(biggest.energy, 0)} kWh` : "—", biggest ? monthLabel(biggest.date, true) : "Sem dados"],
    ["Água no período", `${formatNumber(data.waterConsumption, 3)} m³`, currency(data.estimates.water)]
  ]);
}

function renderCustomPreview(data) {
  const selected = customSelection();
  const labels = [];
  if (selected.summary) labels.push("Resumo geral");
  if (selected.energy) labels.push("Energia");
  if (selected.water) labels.push("Água");
  if (selected.readings) labels.push("Leituras");
  setText("report-custom-title", `Relatório Volt · ${data.periodLabel}`);
  setText("report-custom-copy", labels.length ? `${labels.join(" · ")} — ${data.rangeLabel}` : "Selecione ao menos um grupo de dados.");
  replaceSummary("report-custom-preview-list", [
    ["Período", data.periodLabel, data.rangeLabel],
    ["Consumo de energia", `${formatNumber(data.energyConsumption, 0)} kWh`, `${data.monthCount} ${data.monthCount === 1 ? "mês" : "meses"} com dados`],
    ["Consumo de água", `${formatNumber(data.waterConsumption, 3)} m³`, "no período selecionado"],
    ["Estimativa total", currency(data.estimates.total), "energia + água"]
  ]);
}

function exportReport(customOnly) {
  if (!lastState || !lastSnapshot) return;
  const data = buildReportData(lastState, lastSnapshot);
  const selected = customOnly ? customSelection() : { summary: true, energy: true, water: true, readings: true };
  if (!Object.values(selected).some(Boolean)) return;
  const rows = [["VOLT - RELATÓRIO", ""], ["Período", data.periodLabel], ["Intervalo", data.rangeLabel], ["", ""]];
  if (selected.summary) {
    rows.push(["RESUMO", ""], ["Consumo de energia", `${plainNumber(data.energyConsumption, 3)} kWh`], ["Consumo de água", `${plainNumber(data.waterConsumption, 3)} m³`], ["Gasto estimado energia", plainCurrency(data.estimates.energy)], ["Gasto estimado água", plainCurrency(data.estimates.water)], ["Gasto estimado total", plainCurrency(data.estimates.total)], ["Dias analisados", String(data.days)], ["", ""]);
  }
  if (selected.energy) {
    rows.push(["ENERGIA", ""], ["Tarifa base R$/kWh", plainNumber(data.state.settings.energy.rate, 6)], ["Bandeira", flagLabel(data.state.settings.energy.flag)], ["Iluminação pública", plainCurrency(data.state.settings.energy.lightingFee)], ["Meta kWh", plainNumber(data.state.settings.energy.goal, 3)], ["", ""]);
    rows.push(["Mês", "Consumo kWh"]);
    data.monthBuckets.forEach((bucket) => rows.push([monthLabel(bucket.date, true), plainNumber(bucket.energy, 3)]));
    rows.push(["", ""]);
  }
  if (selected.water) {
    rows.push(["ÁGUA", ""], ["Tarifa R$/m³", plainNumber(data.state.settings.water.rate, 6)], ["Esgoto %", plainNumber(data.state.settings.water.sewerPercent, 2)], ["Taxa fixa", plainCurrency(data.state.settings.water.fixedFee)], ["Meta m³", plainNumber(data.state.settings.water.goal, 3)], ["", ""]);
    rows.push(["Mês", "Consumo m³"]);
    data.monthBuckets.forEach((bucket) => rows.push([monthLabel(bucket.date, true), plainNumber(bucket.water, 3)]));
    rows.push(["", ""]);
  }
  if (selected.readings) {
    rows.push(["LEITURAS", ""], ["Tipo", "Data", "Valor"]);
    const readings = [
      ...(data.state.readings.energy || []).map((item) => ["Energia", formatDateTime(item.date), plainNumber(item.value, 3)]),
      ...(data.state.readings.water || []).map((item) => ["Água", formatDateTime(item.date), plainNumber(item.value, 3)])
    ].sort((left, right) => Date.parse(left[1]) - Date.parse(right[1]));
    rows.push(...readings);
  }
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `volt-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function customSelection() {
  const result = { summary: false, energy: false, water: false, readings: false };
  document.querySelectorAll("[data-report-custom]").forEach((input) => { result[input.dataset.reportCustom] = input.checked; });
  return result;
}

function replaceSummary(id, items) {
  const list = document.getElementById(id);
  if (!list) return;
  list.replaceChildren(...items.map(([label, value, note, tone]) => {
    const item = document.createElement("li");
    if (tone) item.dataset.tone = tone;
    const icon = document.createElement("span");
    icon.className = "report-summary-dot";
    const copy = document.createElement("span");
    const small = document.createElement("small");
    const strong = document.createElement("strong");
    const description = document.createElement("span");
    small.textContent = label;
    strong.textContent = value;
    description.textContent = note;
    copy.append(small, strong, description);
    item.append(icon, copy);
    return item;
  }));
}

function emptyChartMessage() {
  const wrapper = document.createElement("div");
  wrapper.className = "report-empty-chart";
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = "Sem dados suficientes";
  small.textContent = "Registre pelo menos duas leituras para formar um intervalo de consumo.";
  wrapper.append(strong, small);
  return wrapper;
}

function peakInterval(intervals) {
  return intervals.reduce((peak, item) => !peak || item.value > peak.value ? item : peak, null);
}

function sumValues(items) {
  return items.reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function relativeChange(current, previous) {
  if (!(previous > 0)) return current > 0 ? NaN : 0;
  return (current - previous) / previous;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setDelta(id, change, note) {
  const element = document.getElementById(id);
  if (!element) return;
  if (!Number.isFinite(change)) {
    element.textContent = "Sem período anterior comparável";
    element.dataset.tone = "neutral";
    return;
  }
  element.textContent = `${signedPercent(change)} ${note}`;
  element.dataset.tone = deltaTone(change);
}

function deltaTone(change) {
  if (!Number.isFinite(change) || change === 0) return "neutral";
  return change > 0 ? "warning" : "success";
}

function compositionColor(tone) {
  return ({
    energy: "var(--volt-accent)",
    flag: "color-mix(in srgb, var(--volt-accent) 58%, #e0a21b)",
    lighting: "color-mix(in srgb, var(--text-secondary) 48%, var(--glass-3))",
    water: "var(--volt-water)",
    adjustment: "color-mix(in srgb, var(--volt-accent) 35%, var(--volt-water))"
  })[tone] || "var(--text-tertiary)";
}

function flagLabel(flag) {
  return ({ green: "Verde", yellow: "Amarela", red1: "Vermelha patamar 1", red2: "Vermelha patamar 2" })[flag] || "Verde";
}

function periodLabel(period) {
  return ({ cycle: "Ciclo atual", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses", all: "Todo o histórico" })[period] || "Últimos 6 meses";
}

function monthKey(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date, includeYear = false) {
  return new Intl.DateTimeFormat("pt-BR", includeYear ? { month: "short", year: "2-digit" } : { month: "short" }).format(new Date(date)).replace(".", "");
}

function formatRange(start, end) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  return `${formatter.format(start).replace(".", "")} – ${formatter.format(end).replace(".", "")}`;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value) || 0);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function compactCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function signedPercent(value) {
  const normalized = Number(value) || 0;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(normalized)}`;
}

function plainNumber(value, decimals = 2) {
  return (Number(value) || 0).toFixed(decimals).replace(".", ",");
}

function plainCurrency(value) {
  return `R$ ${plainNumber(value, 2)}`;
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}
