import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";
import { forecastEnergyBill } from "../packages/consumption-domain/browser/billing-engine.js?v=20260813.7";
import { consumptionWithinCycle, getCycleContext } from "./cycles.js?v=20260813.7";
import { StartupStatus } from "./app-state.js?v=20260813.7";
import { renderReports } from "./reports.js?v=20260813.7";

const FLAGS = Object.freeze({ green: 0, yellow: 0.01885, red1: 0.04463, red2: 0.07877 });
const PAGE_IDS = Object.freeze(["home", "consumption", "readings", "alerts", "reports", "users", "settings", "help"]);
const REQUIRED_IDS = [
  "login-screen", "login-form", "login-email", "login-password", "login-message", "login-progress",
  "mfa-screen", "mfa-form", "mfa-code", "mfa-message", "error-screen", "fatal-error-message", "dashboard",
  "greeting", "page-container", ...PAGE_IDS.map((page) => `page-${page}`), "users-nav", "users-nav-mobile",
  "home-greeting", "cycle-label", "home-cycle-copy", "home-energy-consumption", "home-water-consumption",
  "home-energy-cost", "home-water-cost", "home-energy-goal", "home-water-goal", "home-energy-progress",
  "home-water-progress", "home-energy-status", "home-water-status", "home-total-cost", "home-summary",
  "home-insight-title", "home-insight-body", "home-latest-readings", "home-consumption-chart", "home-distribution", "consumption-total", "consumption-cost",
  "consumption-forecast", "consumption-forecast-cost", "consumption-total-note", "consumption-forecast-note", "consumption-cost-note", "consumption-forecast-cost-note",
  "consumption-cycle-range", "consumption-cycle-days", "consumption-cycle-progress", "consumption-cycle-progress-fill", "consumption-last-reading", "consumption-confidence",
  "consumption-chart", "consumption-chart-caption", "consumption-chart-note", "consumption-comparison", "consumption-insight-title", "consumption-insight-body", "readings-list", "readings-empty", "readings-last-energy", "readings-last-water",
  "readings-last-energy-date", "readings-last-water-date", "readings-energy-delta", "readings-water-delta",
  "alerts-list", "alerts-empty", "alerts-count", "display-name", "account-email", "sidebar-display-name",
  "sidebar-email", "profile-initials", "mobile-profile-name", "mobile-profile-email", "mobile-profile-initials",
  "energy-cycle-start", "energy-cycle-end", "water-cycle-start", "water-cycle-end", "energy-rate", "energy-goal",
  "energy-flag", "lighting-fee", "water-rate", "water-goal", "sewer-percent", "water-fixed-fee",
  "locality-country", "locality-state", "locality-city", "energy-provider", "water-provider",
  "users-total", "users-confirmed", "users-active", "users-count", "users-empty", "users-list"
];

export function assertDomContract(documentRoot = document) {
  const missing = REQUIRED_IDS.filter((id) => !documentRoot.getElementById(id));
  if (missing.length) throw new Error(`Contrato DOM inválido; elementos ausentes: ${missing.join(", ")}`);
}

export function createRenderer() {
  assertDomContract();
  const byId = (id) => document.getElementById(id);

  return Object.freeze({
    render(state) {
      renderLifecycle(state, byId);
      renderThemePreference(state);
      if (state.status !== StartupStatus.READY) {
        publishStartupStatus(state.status);
        return;
      }
      const snapshot = createConsumptionSnapshot(state);
      renderNavigation(state, byId);
      renderIdentity(state, byId);
      renderHome(state, snapshot, byId);
      renderConsumption(state, snapshot, byId);
      renderReadings(state, snapshot, byId);
      renderAlerts(snapshot, byId);
      renderReports(state, snapshot);
      renderSettings(state, byId);
      renderUsers(state, byId);
      publishStartupStatus(state.status);
    },
    setMessage(id, message, error = false) {
      const element = byId(id);
      if (!element) throw new Error(`Mensagem destinada a elemento fora do contrato: ${id}`);
      element.textContent = message;
      element.dataset.error = String(Boolean(error));
      delete element.dataset.lifecycle;
    }
  });
}

function publishStartupStatus(status) {
  document.documentElement.dataset.startupStatus = status;
  window.dispatchEvent(new CustomEvent("volt:startup-status", { detail: { status } }));
}

function renderLifecycle(state, byId) {
  const booting = [StartupStatus.BOOTING, StartupStatus.RESTORING_SESSION, StartupStatus.LOADING_ACCOUNT, StartupStatus.LOADING_DATA].includes(state.status);
  const interactiveLoading = booting && ["login", "mfa"].includes(state.transitionSurface);
  const keepLoginVisible = booting && state.transitionSurface !== "mfa";
  const keepMfaVisible = interactiveLoading && state.transitionSurface === "mfa";
  const loginLoading = keepLoginVisible;
  const loginForm = byId("login-form");
  const loginMessage = byId("login-message");
  document.documentElement.setAttribute("aria-busy", String(booting));
  byId("login-screen").hidden = state.status !== StartupStatus.SIGNED_OUT && !keepLoginVisible;
  byId("mfa-screen").hidden = state.status !== StartupStatus.MFA_REQUIRED && !keepMfaVisible;
  byId("error-screen").hidden = state.status !== StartupStatus.ERROR;
  byId("dashboard").hidden = state.status !== StartupStatus.READY;
  loginForm.setAttribute("aria-busy", String(loginLoading));
  loginForm.inert = loginLoading;
  byId("login-progress").hidden = !loginLoading;
  if (loginLoading) {
    const messages = {
      [StartupStatus.BOOTING]: "Iniciando o Volt…",
      [StartupStatus.RESTORING_SESSION]: "Verificando sua sessão…",
      [StartupStatus.LOADING_ACCOUNT]: "Validando sua conta…",
      [StartupStatus.LOADING_DATA]: "Carregando seus dados…"
    };
    const message = messages[state.status];
    if (message) {
      loginMessage.textContent = message;
      loginMessage.dataset.error = "false";
      loginMessage.dataset.lifecycle = "true";
    }
  } else if (state.status === StartupStatus.SIGNED_OUT && loginMessage.dataset.lifecycle === "true") {
    loginMessage.textContent = "";
    loginMessage.dataset.error = "false";
    delete loginMessage.dataset.lifecycle;
  }
  if (state.status === StartupStatus.ERROR) byId("fatal-error-message").textContent = state.error || "Falha inesperada durante a inicialização.";
}

function renderNavigation(state, byId) {
  document.querySelectorAll("[data-page]").forEach((page) => { page.hidden = page.dataset.page !== state.activePage; });
  document.querySelectorAll("[data-nav]").forEach((button) => {
    const active = button.dataset.nav === state.activePage;
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-requires-users]").forEach((element) => { element.hidden = !state.permissions.canManageUsers; });
  const moreActive = ["readings", "reports", "users", "settings", "help"].includes(state.activePage);
  document.querySelectorAll("[data-action='open-more']").forEach((button) => {
    if (moreActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (!PAGE_IDS.includes(state.activePage)) byId("page-home").hidden = false;
}

function renderIdentity(state, byId) {
  const displayName = state.identity.displayName;
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "V";
  byId("greeting").textContent = `Olá, ${displayName}!`;
  byId("home-greeting").textContent = `Olá, ${displayName}!`;
  byId("sidebar-display-name").textContent = displayName;
  byId("sidebar-email").textContent = state.identity.email;
  byId("profile-initials").textContent = initials;
  byId("mobile-profile-name").textContent = displayName;
  byId("mobile-profile-email").textContent = state.identity.email;
  byId("mobile-profile-initials").textContent = initials;
  byId("topbar-profile-name").textContent = displayName;
  setInputValue(byId("display-name"), displayName);
  setInputValue(byId("account-email"), state.identity.email);
}

function createConsumptionSnapshot(state) {
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

function renderHome(state, snapshot, byId) {
  byId("cycle-label").textContent = `${snapshot.energy.cycle.label} · ${snapshot.water.cycle.label}`;
  byId("home-cycle-copy").textContent = `Ciclos atuais: energia ${snapshot.energy.cycle.label.toLowerCase()} e água ${snapshot.water.cycle.label.toLowerCase()}.`;
  renderUtilityHome("energy", snapshot.energy, byId);
  renderUtilityHome("water", snapshot.water, byId);
  byId("home-total-cost").textContent = currency(snapshot.totalCost);
  byId("home-summary").replaceChildren(
    comparisonItem("Energia", currency(snapshot.energy.cost), `${formatNumber(snapshot.energy.consumption, 0)} kWh`),
    comparisonItem("Água", currency(snapshot.water.cost), `${formatNumber(snapshot.water.consumption, 3)} m³`)
  );
  const chartMaximum = Math.max(1, ...snapshot.energy.intervals.map((item) => item.value));
  byId("home-consumption-chart").replaceChildren(...snapshot.energy.intervals.slice(-18).map((item) => chartBar(item, chartMaximum, "energy")));
  byId("home-consumption-chart").dataset.empty = String(snapshot.energy.intervals.length === 0);
  const energyShare = snapshot.totalCost > 0 ? (snapshot.energy.cost / snapshot.totalCost) * 100 : 50;
  byId("home-distribution").style.setProperty("--energy-share", `${Math.min(Math.max(energyShare, 0), 100)}%`);
  const critical = snapshot.energy.ratio > 1 ? "energy" : snapshot.water.ratio > 1 ? "water" : null;
  const warning = snapshot.energy.ratio >= .8 ? "energy" : snapshot.water.ratio >= .8 ? "water" : null;
  if (critical) {
    byId("home-insight-title").textContent = `${utilityLabel(critical)} acima da meta`;
    byId("home-insight-body").textContent = "Revise os intervalos de maior consumo e considere uma nova leitura para confirmar a tendência.";
  } else if (warning) {
    byId("home-insight-title").textContent = `${utilityLabel(warning)} perto da meta`;
    byId("home-insight-body").textContent = "O consumo entrou na faixa de atenção. Acompanhe as próximas leituras.";
  } else {
    byId("home-insight-title").textContent = "Consumo dentro do planejado";
    byId("home-insight-body").textContent = "Energia e água permanecem abaixo das metas configuradas para os ciclos atuais.";
  }
  const latest = combinedReadings(state).slice(0, 3);
  byId("home-latest-readings").replaceChildren(...latest.map(miniReadingItem));
}

function renderUtilityHome(type, utility, byId) {
  const decimals = type === "water" ? 3 : 0;
  const unit = type === "water" ? "m³" : "kWh";
  byId(`home-${type}-consumption`).textContent = `${formatNumber(utility.consumption, decimals)} ${unit}`;
  byId(`home-${type}-cycle`).textContent = utility.cycle.label;
  byId(`home-${type}-cost`).textContent = currency(utility.cost);
  byId(`home-${type}-goal`).textContent = `${formatNumber(utility.goal, type === "water" ? 1 : 0)} ${unit}`;
  byId(`home-${type}-progress`).style.setProperty("--progress", `${Math.min(Math.max(utility.ratio * 100, 0), 100)}%`);
  const status = byId(`home-${type}-status`);
  status.textContent = utility.status.label;
  status.dataset.tone = utility.status.tone;
}

function renderConsumption(state, snapshot, byId) {
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

function renderReadings(state, snapshot, byId) {
  const combined = combinedReadings(state);
  byId("readings-empty").hidden = combined.length > 0;
  byId("readings-list").replaceChildren(...combined.map(readingItem));
  renderLastReading("energy", state.readings.energy, byId);
  renderLastReading("water", state.readings.water, byId);
  byId("readings-energy-delta").textContent = `${formatNumber(snapshot.energy.consumption, 0)} kWh`;
  byId("readings-water-delta").textContent = `${formatNumber(snapshot.water.consumption, 3)} m³`;
}

function renderLastReading(type, readings, byId) {
  const last = [...readings].sort((left, right) => Date.parse(right.date) - Date.parse(left.date))[0];
  const unit = type === "water" ? "m³" : "kWh";
  byId(`readings-last-${type}`).textContent = last ? `${formatNumber(last.value, type === "water" ? 3 : 0)} ${unit}` : "—";
  byId(`readings-last-${type}-date`).textContent = last ? dateTime(last.date) : "Sem leitura";
}

function renderAlerts(snapshot, byId) {
  const alerts = [];
  for (const utility of [snapshot.energy, snapshot.water]) {
    if (utility.ratio > 1) alerts.push({ tone: "danger", title: `${utilityLabel(utility.type)} acima da meta`, copy: `O ciclo atingiu ${percent(utility.ratio)} da meta configurada.` });
    else if (utility.ratio >= .8) alerts.push({ tone: "warning", title: `${utilityLabel(utility.type)} na faixa de atenção`, copy: `O ciclo já utilizou ${percent(utility.ratio)} da meta.` });
    const last = [...utility.readings].sort((left, right) => Date.parse(right.date) - Date.parse(left.date))[0];
    if (!last) alerts.push({ tone: "warning", title: `Primeira leitura de ${utilityLabel(utility.type).toLowerCase()}`, copy: "Registre o medidor para habilitar cálculos e comparações." });
  }
  byId("alerts-empty").hidden = alerts.length > 0;
  byId("alerts-list").replaceChildren(...alerts.map(alertItem));
  byId("alerts-count").textContent = `${alerts.length} ${alerts.length === 1 ? "alerta" : "alertas"}`;
}

function renderSettings(state, byId) {
  const { energy, water } = state.settings;
  const fields = {
    "energy-cycle-start": state.cycles.energy.start,
    "energy-cycle-end": state.cycles.energy.end,
    "water-cycle-start": state.cycles.water.start,
    "water-cycle-end": state.cycles.water.end,
    "energy-rate": energy.rate,
    "energy-goal": energy.goal,
    "energy-flag": energy.flag,
    "lighting-fee": energy.lightingFee,
    "water-rate": water.rate,
    "water-goal": water.goal,
    "sewer-percent": water.sewerPercent,
    "water-fixed-fee": water.fixedFee,
    "locality-country": state.locality.country,
    "locality-state": state.locality.state,
    "locality-city": state.locality.city,
    "energy-provider": state.locality.energyProvider,
    "water-provider": state.locality.waterProvider
  };
  const cycleFieldIds = new Set([
    "energy-cycle-start", "energy-cycle-end", "water-cycle-start", "water-cycle-end"
  ]);
  const cycleFormEditing = Boolean(document.getElementById("cycles-form")?.matches(":focus-within"));
  Object.entries(fields).forEach(([id, value]) => {
    if (cycleFormEditing && cycleFieldIds.has(id)) return;
    setInputValue(byId(id), value);
  });
}

function renderThemePreference(state) {
  document.querySelectorAll("[data-theme-choice]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === state.view.theme)));
  document.querySelectorAll("[data-accent-choice]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.accentChoice === state.view.accent)));
}

function renderUsers(state, byId) {
  const accounts = state.permissions.canManageUsers && state.admin ? state.admin.accounts : [];
  if (!state.permissions.canManageUsers || !state.admin) {
    byId("users-total").textContent = "—";
    byId("users-confirmed").textContent = "—";
    byId("users-active").textContent = "—";
  } else {
    byId("users-total").textContent = String(state.admin.totalUsers);
    byId("users-confirmed").textContent = String(state.admin.confirmedUsers);
    byId("users-active").textContent = String(state.admin.activeLast30Days);
  }
  byId("users-count").textContent = `${accounts.length} ${accounts.length === 1 ? "conta" : "contas"}`;
  byId("users-empty").hidden = accounts.length > 0;
  byId("users-list").replaceChildren(...accounts.map(accountItem));
}

function combinedReadings(state) {
  return [
    ...state.readings.energy.map((reading) => ({ ...reading, type: "energy" })),
    ...state.readings.water.map((reading) => ({ ...reading, type: "water" }))
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

function readingIntervals(readings) {
  const sorted = [...readings].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  return sorted.slice(1).map((reading, index) => ({ value: Math.max(0, Number(reading.value) - Number(sorted[index].value)), date: reading.date }));
}

function buildDailyRateIntervals(readings, range) {
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

function buildDailyAverageSeries(readings, range) {
  const sorted = [...readings].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  if (sorted.length < 2) return [];
  const series = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const start = dayStart(previous.date);
    const end = dayStart(current.date);
    const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const intervalConsumption = Math.max(0, Number(current.value) - Number(previous.value));
    const dailyAverage = intervalConsumption / dayCount;
    for (let day = 1; day <= dayCount; day += 1) {
      const pointDate = new Date(start);
      pointDate.setDate(pointDate.getDate() + day);
      pointDate.setHours(12, 0, 0, 0);
      if (range && (pointDate < range.start || pointDate > range.end)) continue;
      series.push({ date: pointDate.toISOString(), value: dailyAverage });
    }
  }
  return series;
}

function dayStart(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function consumptionTrend(series) {
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

function miniReadingItem(reading) {
  const item = document.createElement("li");
  item.className = "mini-list-item";
  const copy = document.createElement("span");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = utilityLabel(reading.type);
  small.textContent = dateTime(reading.date);
  copy.append(strong, small);
  const value = document.createElement("strong");
  value.textContent = `${formatNumber(reading.value, reading.type === "water" ? 3 : 0)} ${reading.type === "water" ? "m³" : "kWh"}`;
  item.append(copy, value);
  return item;
}

function readingItem(reading) {
  const item = document.createElement("li");
  item.className = "reading-item";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = `${formatNumber(reading.value, reading.type === "water" ? 3 : 0)} ${reading.type === "water" ? "m³" : "kWh"}`;
  small.textContent = dateTime(reading.date);
  copy.append(strong, small);
  const badge = document.createElement("span");
  badge.className = "chip";
  badge.textContent = utilityLabel(reading.type);
  item.append(copy, badge);
  return item;
}

function chartBar(item, max, type) {
  const bar = document.createElement("span");
  bar.className = "chart-bar";
  bar.dataset.type = type;
  bar.style.setProperty("--bar-height", `${Math.max(3, (item.value / max) * 100)}%`);
  bar.title = `${chartDate(item.date)} · ${formatNumber(item.value, type === "water" ? 3 : 0)} ${type === "water" ? "m³" : "kWh"}`;
  const label = document.createElement("span");
  label.textContent = chartDate(item.date);
  bar.append(label);
  return bar;
}

function comparisonItem(label, value, note) {
  const item = document.createElement("li");
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  const description = document.createElement("span");
  small.textContent = label;
  strong.textContent = value;
  description.textContent = note;
  item.append(small, strong, description);
  return item;
}

function alertItem(alert) {
  const item = document.createElement("article");
  item.className = "alert-item";
  const icon = document.createElement("span");
  icon.className = "alert-icon";
  icon.textContent = "!";
  const copy = document.createElement("div");
  copy.className = "alert-copy";
  const title = document.createElement("strong");
  title.textContent = alert.title;
  const description = document.createElement("p");
  description.textContent = alert.copy;
  copy.append(title, description);
  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.dataset.tone = alert.tone;
  badge.textContent = alert.tone === "danger" ? "Importante" : "Atenção";
  item.append(icon, copy, badge);
  return item;
}

function accountItem(account) {
  const item = document.createElement("article");
  item.className = "user-account-item";
  item.setAttribute("role", "listitem");
  const copy = document.createElement("div");
  copy.className = "user-account-identity";
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = account.displayName || account.email;
  small.textContent = account.email;
  copy.append(strong, small);
  const metadata = document.createElement("div");
  metadata.className = "user-account-metadata";
  metadata.append(
    accountMetadata("Cadastro", dateOnly(account.createdAt)),
    accountMetadata("Último acesso", account.lastSignInAt ? dateOnly(account.lastSignInAt) : "Nunca")
  );
  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.dataset.tone = account.status === "confirmed" ? "success" : "warning";
  badge.textContent = account.status === "confirmed" ? "Confirmada" : "Pendente";
  item.append(copy, metadata, badge);
  return item;
}

function accountMetadata(label, value) {
  const item = document.createElement("span");
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  small.textContent = label;
  strong.textContent = value;
  item.append(small, strong);
  return item;
}

function setInputValue(input, value) {
  if (document.activeElement !== input && String(input.value) !== String(value ?? "")) input.value = value ?? "";
}

function utilityLabel(type) { return type === "water" ? "Água" : "Energia"; }
function periodLabel(period) { return ({ cycle: "Ciclo atual", monthly: "Visão mensal", annual: "Visão anual" })[period] || "Ciclo atual"; }
function percent(value) { return new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(Number(value) || 0); }
function formatNumber(value, decimals) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value) || 0); }
function currency(value) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0); }
function chartDate(value) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
  return `${day}/${month}`;
}
function chartDateNumeric(value) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value)); }
function dateTime(value) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function dateOnly(value) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)); }