from pathlib import Path
import re


def sub_once(path, pattern, replacement, flags=0):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{path}: expected one replacement, got {count}")
    p.write_text(updated, encoding="utf-8")


new_section = r'''            <section id="page-consumption" class="page" data-page="consumption" aria-labelledby="consumption-title" hidden>
              <header class="page-header"><div class="page-header-copy"><p class="eyebrow">ANÁLISE DO CICLO</p><h1 id="consumption-title">Consumo</h1><p class="supporting-copy">Acompanhe o ciclo atual, entenda o ritmo de consumo e antecipe o fechamento antes da fatura chegar.</p></div><div class="page-header-actions"><div class="segmented-control glass-control" aria-label="Tipo de consumo"><button class="segment-button" type="button" data-consumption-type="energy" aria-pressed="true">Energia</button><button class="segment-button" type="button" data-consumption-type="water" aria-pressed="false">Água</button></div><button class="text-button" type="button" data-nav="reports">Ver histórico</button></div></header>
              <div class="analytics-grid">
                <article class="consumption-cycle-summary card glass-level-2">
                  <div class="consumption-cycle-item"><span class="metric-caption">Ciclo atual</span><strong id="consumption-cycle-range">—</strong></div>
                  <div class="consumption-cycle-item"><span class="metric-caption">Andamento</span><strong id="consumption-cycle-days">—</strong><small id="consumption-cycle-progress" class="muted">—</small></div>
                  <div class="consumption-cycle-item"><span class="metric-caption">Última leitura</span><strong id="consumption-last-reading">—</strong><small class="muted">Base da previsão</small></div>
                  <span id="consumption-confidence" class="status-pill" data-tone="warning">Verificando dados</span>
                  <div class="consumption-cycle-progress-track" aria-hidden="true"><span id="consumption-cycle-progress-fill"></span></div>
                </article>

                <article class="analytics-metric card glass-level-2"><span class="metric-caption">Consumo até a leitura</span><strong id="consumption-total" class="metric-value"></strong><span id="consumption-unit" class="metric-delta"></span><small id="consumption-total-note" class="muted"></small></article>
                <article class="analytics-metric card glass-level-2"><span class="metric-caption">Previsão de fechamento</span><strong id="consumption-forecast" class="metric-value"></strong><small id="consumption-forecast-note" class="muted"></small></article>
                <article class="analytics-metric card glass-level-2"><span class="metric-caption">Estimativa até agora</span><strong id="consumption-cost" class="metric-value"></strong><small id="consumption-cost-note" class="muted"></small></article>
                <article class="analytics-metric card glass-level-2"><span class="metric-caption">Previsão da fatura</span><strong id="consumption-forecast-cost" class="metric-value"></strong><small id="consumption-forecast-cost-note" class="muted">se o ritmo atual continuar</small></article>

                <article class="chart-card card glass-level-3"><div class="card-header"><div><p class="eyebrow">RITMO DO CICLO</p><h2 id="consumption-chart-title">Consumo diário estimado</h2></div><span id="consumption-chart-caption" class="chip"></span></div><div id="consumption-chart" class="line-chart-host" aria-label="Gráfico de consumo"></div><p id="consumption-chart-note" class="supporting-copy"></p></article>
                <article class="comparison-card card glass-level-3"><div><p class="eyebrow">LEITURA RÁPIDA</p><h2>Como você está</h2></div><ul id="consumption-comparison" class="comparison-list"></ul><p class="supporting-copy">A projeção usa as leituras registradas; dias sem leitura direta são estimados entre medições.</p></article>

                <article class="consumption-insight-card card glass-level-2"><span class="utility-icon"><svg class="icon"><use href="#icon-chart"></use></svg></span><div><p class="eyebrow">PROJEÇÃO VOLT</p><strong id="consumption-insight-title">Analisando o ciclo</strong><p id="consumption-insight-body" class="supporting-copy"></p></div></article>
              </div>
            </section>
'''
sub_once("index.html", r'            <section id="page-consumption".*?            </section>\n\n(?=            <section id="page-readings")', new_section + "\n", re.S)

renderer = Path("src/renderer.js")
text = renderer.read_text(encoding="utf-8")
if "billing-engine.js?v=20260813.7" not in text:
    text = text.replace(
        'import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";\n',
        'import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";\nimport { forecastEnergyBill } from "../packages/consumption-domain/browser/billing-engine.js?v=20260813.7";\n',
    )
renderer.write_text(text, encoding="utf-8")

sub_once(
    "src/renderer.js",
    r'  "home-insight-title", "home-insight-body", "home-latest-readings", "home-consumption-chart", "home-distribution", "consumption-total", "consumption-cost",\n  "consumption-average", "consumption-peak", "consumption-status", "consumption-chart", "consumption-chart-caption",\n  "consumption-comparison",',
    '  "home-insight-title", "home-insight-body", "home-latest-readings", "home-consumption-chart", "home-distribution", "consumption-total", "consumption-cost",\n  "consumption-forecast", "consumption-forecast-cost", "consumption-total-note", "consumption-forecast-note", "consumption-cost-note", "consumption-forecast-cost-note",\n  "consumption-cycle-range", "consumption-cycle-days", "consumption-cycle-progress", "consumption-cycle-progress-fill", "consumption-last-reading", "consumption-confidence",\n  "consumption-chart", "consumption-chart-caption", "consumption-chart-note", "consumption-comparison", "consumption-insight-title", "consumption-insight-body",',
)

snapshot_code = r'''function createConsumptionSnapshot(state) {
  const energyCycle = getCycleContext(state.cycles.energy);
  const waterCycle = getCycleContext(state.cycles.water);
  const energyConsumption = consumptionWithinCycle(state.readings.energy, energyCycle.current);
  const waterConsumption = consumptionWithinCycle(state.readings.water, waterCycle.current);
  const previousEnergy = consumptionWithinCycle(state.readings.energy, energyCycle.previous);
  const previousWater = consumptionWithinCycle(state.readings.water, waterCycle.previous);
  const energy = utilitySnapshot("energy", energyConsumption, state.settings.energy.goal, energyCycle, state.readings.energy, previousEnergy, state);
  const water = utilitySnapshot("water", waterConsumption, state.settings.water.goal, waterCycle, state.readings.water, previousWater, state);
  return { energy, water, totalCost: energy.cost + water.cost };
}

function utilitySnapshot(type, consumption, goal, cycle, readings, previousConsumption, state) {
  const intervals = readingIntervals(readings);
  const dailySeries = buildDailyAverageSeries(readings, cycle.current);
  const rateIntervals = buildDailyRateIntervals(readings, cycle.current);
  const progress = cycleProgress(cycle.current);
  const lastReading = latestReadingForRange(readings, cycle.current);
  const measuredDays = lastReading ? clampNumber(dayDifference(cycle.current.start, dayStart(lastReading.date)), 0, progress.totalDays) : 0;
  const fallbackAverage = dailySeries.length ? dailySeries.reduce((total, item) => total + item.value, 0) / dailySeries.length : 0;
  const average = measuredDays > 0 ? consumption / measuredDays : fallbackAverage;
  const projectedConsumption = measuredDays > 0 ? Math.max(consumption, average * progress.totalDays) : consumption;
  const currentEstimate = estimateUtilityCost(type, consumption, state);
  const projectedEstimate = estimateUtilityCost(type, projectedConsumption, state);
  const targetDaily = progress.totalDays > 0 && goal > 0 ? goal / progress.totalDays : 0;
  const remainingFromReading = Math.max(0, progress.totalDays - measuredDays);
  const paceToGoal = remainingFromReading > 0 && goal > 0 ? Math.max(0, goal - consumption) / remainingFromReading : 0;
  const ratio = goal > 0 ? consumption / goal : 0;
  const forecastRatio = goal > 0 ? projectedConsumption / goal : 0;
  const previousChange = previousConsumption > 0 ? (projectedConsumption - previousConsumption) / previousConsumption : null;
  const quality = readingConfidence(lastReading, rateIntervals);
  const values = rateIntervals.map((item) => item.value);
  return {
    type, consumption, goal, ratio, forecastRatio, cycle, readings, intervals, dailySeries, rateIntervals,
    average, projectedConsumption, cost: currentEstimate.total, projectedCost: projectedEstimate.total,
    costSource: currentEstimate.source, targetDaily, paceToGoal, progress, lastReading, measuredDays,
    remainingFromReading, previousConsumption, previousChange, quality,
    maxDaily: values.length ? Math.max(...values) : 0,
    minDaily: values.length ? Math.min(...values) : 0,
    status: forecastRatio > 1 ? { label: "Previsão acima da meta", tone: "danger" } : forecastRatio >= .9 ? { label: "Próximo da meta", tone: "warning" } : { label: "Dentro da meta", tone: "success" }
  };
}

'''
sub_once("src/renderer.js", r'function createConsumptionSnapshot\(state\) \{.*?\n\}\n\nfunction renderHome', snapshot_code + "function renderHome", re.S)

render_consumption = r'''function renderConsumption(state, snapshot, byId) {
  const type = state.view.consumptionType;
  const utility = snapshot[type];
  const decimals = type === "water" ? 3 : 0;
  const unit = type === "water" ? "m³" : "kWh";
  const trend = consumptionTrend(utility.rateIntervals);

  byId("consumption-total").textContent = formatNumber(utility.consumption, decimals);
  byId("consumption-unit").textContent = unit;
  byId("consumption-total-note").textContent = utility.lastReading ? `Até ${chartDateNumeric(utility.lastReading.date)}` : "Sem leitura no ciclo";
  byId("consumption-forecast").textContent = `${formatNumber(utility.projectedConsumption, decimals)} ${unit}`;
  byId("consumption-forecast-note").textContent = forecastGoalNote(utility, decimals, unit);
  byId("consumption-cost").textContent = currency(utility.cost);
  byId("consumption-cost-note").textContent = utility.costSource;
  byId("consumption-forecast-cost").textContent = currency(utility.projectedCost);
  byId("consumption-forecast-cost-note").textContent = utility.measuredDays > 0 ? "se o ritmo medido continuar" : "aguardando base de leitura";

  byId("consumption-cycle-range").textContent = utility.cycle.label;
  byId("consumption-cycle-days").textContent = `${utility.progress.elapsedDays} de ${utility.progress.totalDays} dias`;
  byId("consumption-cycle-progress").textContent = `${utility.progress.remainingDays} ${utility.progress.remainingDays === 1 ? "dia restante" : "dias restantes"}`;
  byId("consumption-cycle-progress-fill").style.width = `${Math.round(utility.progress.ratio * 100)}%`;
  byId("consumption-last-reading").textContent = utility.lastReading ? dateTime(utility.lastReading.date) : "Sem leitura";
  const confidence = byId("consumption-confidence");
  confidence.textContent = `Confiança ${utility.quality.label.toLowerCase()}`;
  confidence.dataset.tone = utility.quality.tone;

  byId("consumption-chart-caption").textContent = utility.cycle.label;
  byId("consumption-chart-title").textContent = `${utilityLabel(type)} diário estimado`;
  byId("consumption-chart-note").textContent = utility.quality.note;
  const chartHost = byId("consumption-chart");
  chartHost.replaceChildren(renderLineChart(utility.dailySeries, type, utility.targetDaily));
  chartHost.dataset.empty = String(utility.dailySeries.length === 0);

  const rangeValue = utility.rateIntervals.length ? `${formatNumber(utility.minDaily, decimals)}–${formatNumber(utility.maxDaily, decimals)} ${unit}/dia` : "—";
  byId("consumption-comparison").replaceChildren(
    comparisonItem("Média diária", utility.average > 0 ? `${formatNumber(utility.average, decimals)} ${unit}/dia` : "—", "Até a última leitura registrada"),
    comparisonItem("Ritmo para ficar na meta", utility.remainingFromReading > 0 && utility.goal > 0 ? `${formatNumber(utility.paceToGoal, decimals)} ${unit}/dia` : "—", utility.remainingFromReading > 0 ? `A partir da última leitura · ${utility.remainingFromReading} dias` : "Ciclo encerrado ou sem meta"),
    comparisonItem("Previsão vs ciclo anterior", utility.previousChange == null ? "Sem histórico" : signedPercent(utility.previousChange), utility.previousChange == null ? "Ainda não há ciclo anterior comparável" : `${formatNumber(utility.previousConsumption, decimals)} ${unit} no ciclo anterior`),
    comparisonItem("Tendência entre leituras", trend.label, trend.note),
    comparisonItem("Faixa diária estimada", rangeValue, "Menor e maior média diária entre leituras")
  );

  const insight = consumptionInsight(utility, decimals, unit);
  byId("consumption-insight-title").textContent = insight.title;
  byId("consumption-insight-body").textContent = insight.body;
  document.querySelectorAll("[data-consumption-type]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.consumptionType === type)));
}

'''
sub_once("src/renderer.js", r'function renderConsumption\(state, snapshot, byId\) \{.*?\n\}\n\nfunction renderReadings', render_consumption + "function renderReadings", re.S)

helpers = r'''function buildDailyRateIntervals(readings, range) {
  const sorted = [...readings].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const rates = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const start = dayStart(previous.date);
    const end = dayStart(current.date);
    if (range && (end < range.start || start > range.end)) continue;
    const days = Math.max(1, dayDifference(start, end));
    rates.push({ value: Math.max(0, Number(current.value) - Number(previous.value)) / days, date: current.date, startDate: previous.date, endDate: current.date });
  }
  return rates;
}

function latestReadingForRange(readings, range) {
  return [...readings].filter((reading) => { const date = new Date(reading.date); return date >= range.start && date <= range.end; }).sort((left, right) => Date.parse(left.date) - Date.parse(right.date)).at(-1) || null;
}

function cycleProgress(range, now = new Date()) {
  const totalDays = Math.max(1, dayDifference(range.start, range.end));
  const today = dayStart(now);
  const bounded = today < range.start ? range.start : today > range.end ? range.end : today;
  const elapsedDays = clampNumber(dayDifference(range.start, bounded), 0, totalDays);
  return { totalDays, elapsedDays, remainingDays: Math.max(0, totalDays - elapsedDays), ratio: elapsedDays / totalDays };
}

function estimateUtilityCost(type, consumption, state) {
  if (type === "water") return { total: calculateWaterEstimate(consumption, state.settings.water).totalCost, source: "Tarifa de água configurada" };
  const settings = state.settings.energy;
  const rules = globalThis.__VOLT_BILLING_CONTEXT__?.profile?.rules;
  if (rules) {
    const result = forecastEnergyBill(consumption, rules, { fallbackRate: settings.rate, flagRate: FLAGS[settings.flag] ?? 0, flagLabel: "Bandeira tarifária", lightingFee: settings.lightingFee });
    return { total: result.totalCost, source: "Regras regulatórias aplicadas" };
  }
  const fallback = calculateEnergyEstimate(consumption, { rate: settings.rate, flagRate: FLAGS[settings.flag] ?? 0, lightingFee: settings.lightingFee });
  return { total: fallback.totalCost, source: "Configuração atual" };
}

function readingConfidence(lastReading, rateIntervals, now = new Date()) {
  if (!lastReading || !rateIntervals.length) return { label: "Baixa", tone: "warning", note: "Sem leituras suficientes no ciclo. Registre uma nova leitura para habilitar uma previsão útil." };
  const ageDays = Math.max(0, dayDifference(dayStart(lastReading.date), dayStart(now)));
  if (ageDays <= 2 && rateIntervals.length >= 2) return { label: "Alta", tone: "success", note: "Curva estimada entre leituras. A última leitura é recente e há mais de um intervalo para comparar." };
  if (ageDays <= 4) return { label: "Moderada", tone: "warning", note: `Curva estimada entre leituras. Última leitura há ${ageDays} ${ageDays === 1 ? "dia" : "dias"}.` };
  return { label: "Baixa", tone: "warning", note: `Curva estimada entre leituras. Última leitura há ${ageDays} dias; uma nova leitura melhora a previsão.` };
}

function forecastGoalNote(utility, decimals, unit) {
  if (!(utility.goal > 0) || !(utility.measuredDays > 0)) return utility.goal > 0 ? "Aguardando base de leitura" : "Sem meta configurada";
  const difference = utility.projectedConsumption - utility.goal;
  if (Math.abs(difference) < 0.0001) return "Projeção alinhada à meta";
  return difference > 0 ? `${formatNumber(difference, decimals)} ${unit} acima da meta` : `${formatNumber(Math.abs(difference), decimals)} ${unit} abaixo da meta`;
}

function consumptionInsight(utility, decimals, unit) {
  if (!utility.lastReading || utility.measuredDays <= 0) return { title: "Registre uma leitura para projetar o ciclo", body: "O VOLT precisa de uma leitura dentro do ciclo para calcular ritmo, fechamento e valor provável da fatura sem inventar dados." };
  const projected = `${formatNumber(utility.projectedConsumption, decimals)} ${unit}`;
  const goal = `${formatNumber(utility.goal, decimals)} ${unit}`;
  if (!(utility.goal > 0)) return { title: "Previsão de fechamento disponível", body: `No ritmo medido até a última leitura, o ciclo tende a fechar em aproximadamente ${projected}. Configure uma meta para o VOLT indicar o ritmo recomendado.` };
  if (utility.forecastRatio > 1) {
    const excess = `${formatNumber(utility.projectedConsumption - utility.goal, decimals)} ${unit}`;
    if (utility.consumption >= utility.goal) return { title: "A meta já foi ultrapassada", body: `O consumo registrado já passou de ${goal}. Mantido o ritmo atual, o fechamento tende a chegar a ${projected}, cerca de ${excess} acima da meta.` };
    return { title: "Previsão acima da meta", body: `No ritmo atual, o ciclo tende a fechar em ${projected}, cerca de ${excess} acima da meta de ${goal}. A partir da última leitura, o ritmo precisaria ficar em até ${formatNumber(utility.paceToGoal, decimals)} ${unit}/dia para voltar à meta.` };
  }
  const margin = `${formatNumber(Math.max(0, utility.goal - utility.projectedConsumption), decimals)} ${unit}`;
  return { title: "Ritmo compatível com a meta", body: `A previsão de fechamento é ${projected}, deixando uma margem estimada de ${margin} em relação à meta de ${goal}.` };
}

function signedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const formatted = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(Math.abs(number));
  if (number > 0) return `+${formatted}`;
  if (number < 0) return `−${formatted}`;
  return formatted;
}

function dayDifference(left, right) {
  return Math.max(0, Math.round((dayStart(right).getTime() - dayStart(left).getTime()) / 86400000));
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

'''
sub_once("src/renderer.js", r'function buildDailyAverageSeries\(readings, range\) \{', helpers + "function buildDailyAverageSeries(readings, range) {")

chart_code = r'''function consumptionTrend(series) {
  if (series.length < 2) return { label: "Sem tendência", note: "Registre pelo menos mais uma leitura" };
  const first = series[0].value;
  const last = series.at(-1).value;
  if (first <= 0 && last <= 0) return { label: "Estável", note: "Sem variação relevante entre leituras" };
  const change = first > 0 ? (last - first) / first : 1;
  if (Math.abs(change) < .05) return { label: "Estável", note: "Variação inferior a 5% entre intervalos" };
  const magnitude = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(Math.abs(change));
  return change > 0 ? { label: `Subindo ${magnitude}`, note: "A média diária do último intervalo aumentou" } : { label: `Caindo ${magnitude}`, note: "A média diária do último intervalo diminuiu" };
}

function renderLineChart(series, type, targetDaily = 0) {
  const wrapper = document.createElement("div");
  wrapper.className = "line-chart";
  wrapper.dataset.type = type;
  if (!series.length) {
    const empty = document.createElement("div");
    empty.className = "line-chart-empty";
    empty.textContent = "Sem leituras suficientes para calcular o ritmo diário.";
    wrapper.append(empty);
    return wrapper;
  }
  const width = 720;
  const height = 270;
  const padding = { top: 24, right: 22, bottom: 38, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const decimals = type === "water" ? 3 : 0;
  const unit = type === "water" ? "m³" : "kWh";
  const average = series.reduce((total, item) => total + item.value, 0) / series.length;
  const maxValue = Math.max(...series.map((item) => item.value), targetDaily, average, 1);
  const maxY = maxValue * 1.14;
  const points = series.map((item, index) => ({ ...item, index, x: padding.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth), y: padding.top + innerHeight - ((item.value / maxY) * innerHeight) }));
  const peakPoint = points.reduce((best, point) => !best || point.value > best.value ? point : best, null);
  const minPoint = points.reduce((best, point) => !best || point.value < best.value ? point : best, null);
  const averageY = padding.top + innerHeight - ((average / maxY) * innerHeight);
  const targetY = targetDaily > 0 ? padding.top + innerHeight - ((targetDaily / maxY) * innerHeight) : null;
  const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1).x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const labelIndexes = new Set(points.map((_, index) => index).filter((index) => index % labelStep === 0 || index === points.length - 1));
  const grid = [0, .33, .66, 1].map((ratio) => { const y = padding.top + innerHeight * ratio; const value = maxY * (1 - ratio); return `<g><line class="line-chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line><text class="line-chart-y-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${formatNumber(value, decimals)}</text></g>`; }).join("");
  const xLabels = points.filter((point) => labelIndexes.has(point.index)).map((point) => `<text class="line-chart-x-label" x="${point.x}" y="${height - 10}" text-anchor="middle">${chartDateNumeric(point.date)}</text>`).join("");
  const pointMarkup = points.map((point) => `<circle class="line-chart-point" cx="${point.x}" cy="${point.y}" r="3"><title>${chartDateNumeric(point.date)} · ${formatNumber(point.value, decimals)} ${unit}/dia</title></circle>`).join("");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "line-chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${utilityLabel(type)} diário estimado, de ${chartDateNumeric(series[0].date)} a ${chartDateNumeric(series.at(-1).date)}`);
  svg.innerHTML = `${grid}<line class="line-chart-average" x1="${padding.left}" y1="${averageY}" x2="${width - padding.right}" y2="${averageY}"></line><text class="line-chart-average-label" x="${width - padding.right}" y="${Math.max(12, averageY - 6)}" text-anchor="end">Média atual</text>${targetY == null ? "" : `<line class="line-chart-target" x1="${padding.left}" y1="${targetY}" x2="${width - padding.right}" y2="${targetY}"></line><text class="line-chart-target-label" x="${padding.left + 6}" y="${Math.max(12, targetY - 6)}">Meta diária</text>`}<path class="line-chart-area" d="${areaPath}"></path><path class="line-chart-path" d="${linePath}"></path>${pointMarkup}${xLabels}`;
  const legend = document.createElement("div");
  legend.className = "line-chart-legend";
  legend.innerHTML = `<span><strong>Média atual</strong>${formatNumber(average, decimals)} ${unit}/dia</span><span><strong>Ritmo da meta</strong>${targetDaily > 0 ? `${formatNumber(targetDaily, decimals)} ${unit}/dia` : "Sem meta"}</span><span><strong>Maior média</strong>${formatNumber(peakPoint.value, decimals)} ${unit}/dia</span><span><strong>Menor média</strong>${formatNumber(minPoint.value, decimals)} ${unit}/dia</span>`;
  wrapper.append(svg, legend);
  return wrapper;
}

'''
sub_once("src/renderer.js", r'function consumptionTrend\(series\) \{.*?\n\}\n\nfunction renderLineChart\(series, type\) \{.*?\n\}\n\n(?=function miniReadingItem)', chart_code, re.S)

pages = Path("styles/pages.css")
css = pages.read_text(encoding="utf-8")
marker = '.analytics-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(12, minmax(0, 1fr)); }\n'
insert = marker + '.consumption-cycle-summary { display: grid; padding: var(--space-3); align-items: center; gap: var(--space-3); grid-column: 1 / -1; grid-template-columns: 1.2fr .8fr 1.2fr auto; }\n.consumption-cycle-item { display: grid; min-width: 0; gap: var(--space-1); }\n.consumption-cycle-item strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.consumption-cycle-progress-track { position: relative; height: .38rem; overflow: hidden; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--text-tertiary) 14%, transparent); grid-column: 1 / -1; }\n.consumption-cycle-progress-track span { display: block; width: 0; height: 100%; border-radius: inherit; background: var(--volt-accent); transition: width var(--duration-normal) var(--ease-standard); }\n.consumption-insight-card { display: grid; padding: var(--space-4); align-items: start; gap: var(--space-3); grid-column: 1 / -1; grid-template-columns: auto 1fr; }\n.consumption-insight-card strong { display: block; margin-bottom: var(--space-1); font-size: var(--font-size-lg); }\n.consumption-insight-card p { margin: 0; }\n'
if ".consumption-cycle-summary {" not in css:
    if marker not in css:
        raise SystemExit("styles/pages.css analytics marker missing")
    css = css.replace(marker, insert, 1)
css = css.replace('.line-chart-average { stroke: color-mix(in srgb, var(--text-secondary) 70%, transparent); stroke-width: 1.25; stroke-dasharray: 5 5; }\n', '.line-chart-average { stroke: color-mix(in srgb, var(--text-secondary) 70%, transparent); stroke-width: 1.25; stroke-dasharray: 5 5; }\n.line-chart-target { stroke: var(--line-color); stroke-width: 1.35; stroke-dasharray: 3 5; opacity: .72; }\n.line-chart-target-label { fill: var(--line-color); font-size: .68rem; font-weight: 800; }\n', 1)
css = css.replace('.line-chart-average-label, .line-chart-extreme-label { fill: var(--text-secondary); font-size: .68rem; font-weight: 800; }', '.line-chart-average-label { fill: var(--text-secondary); font-size: .68rem; font-weight: 800; }', 1)
css = css.replace('.line-chart-legend { display: grid; gap: var(--space-2); grid-template-columns: repeat(3, minmax(0, 1fr)); }', '.line-chart-legend { display: grid; gap: var(--space-2); grid-template-columns: repeat(4, minmax(0, 1fr)); }', 1)
css = css.replace('  .analytics-metric { grid-column: span 6; }\n', '  .analytics-metric { grid-column: span 6; }\n  .consumption-cycle-summary, .consumption-insight-card { grid-column: 1 / -1; }\n', 1)
css = css.replace('  .analytics-metric .metric-caption, .analytics-metric .metric-delta { font-size: .7rem; }\n', '  .analytics-metric .metric-caption, .analytics-metric .metric-delta, .analytics-metric .muted { font-size: .7rem; }\n  .consumption-cycle-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }\n  .consumption-cycle-summary .status-pill { justify-self: start; }\n  .consumption-cycle-progress-track { grid-column: 1 / -1; }\n  .consumption-insight-card { padding: var(--space-3); }\n', 1)
pages.write_text(css, encoding="utf-8")

sub_once(
    "src/billing-workflow.js",
    r'    const header = page\.querySelector\("\.page-header"\);\n    if \(header\) header\.after\(host\);\n    else page\.prepend\(host\);',
    '    const analytics = page.querySelector(".analytics-grid");\n    if (analytics) analytics.after(host);\n    else page.append(host);',
)

index = Path("index.html").read_text(encoding="utf-8")
renderer_text = Path("src/renderer.js").read_text(encoding="utf-8")
assert "data-consumption-period" not in index
assert "Pico diário" not in index
for needle in ["consumption-forecast", "consumption-cycle-range", "consumption-insight-title", "forecastEnergyBill", "buildDailyRateIntervals", "Ritmo para ficar na meta"]:
    assert needle in index or needle in renderer_text, needle
