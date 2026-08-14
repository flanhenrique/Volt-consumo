import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";
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
  "consumption-average", "consumption-peak", "consumption-status", "consumption-chart", "consumption-chart-caption",
  "consumption-comparison", "readings-list", "readings-empty", "readings-last-energy", "readings-last-water",
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
  const energyEstimate = calculateEnergyEstimate(energyConsumption, {
    rate: state.settings.energy.rate,
    flagRate: FLAGS[state.settings.energy.flag] ?? 0,
    lightingFee: state.settings.energy.lightingFee
  });
  const waterEstimate = calculateWaterEstimate(waterConsumption, state.settings.water);
  return {
    energy: utilitySnapshot("energy", energyConsumption, energyEstimate.totalCost, state.settings.energy.goal, energyCycle, state.readings.energy),
    water: utilitySnapshot("water", waterConsumption, waterEstimate.totalCost, state.settings.water.goal, waterCycle, state.readings.water),
    totalCost: energyEstimate.totalCost + waterEstimate.totalCost
  };
}

function utilitySnapshot(type, consumption, cost, goal, cycle, readings) {
  const ratio = goal > 0 ? consumption / goal : 0;
  const intervals = readingIntervals(readings);
  const dailySeries = buildDailyAverageSeries(readings, cycle.current);
  const average = dailySeries.length ? dailySeries.reduce((total, item) => total + item.value, 0) / dailySeries.length : 0;
  const peakPoint = dailySeries.length ? dailySeries.reduce((best, item) => !best || item.value > best.value ? item : best, null) : null;
  const minPoint = dailySeries.length ? dailySeries.reduce((best, item) => !best || item.value < best.value ? item : best, null) : null;
  return {
    type,
    consumption,
    cost,
    goal,
    ratio,
    cycle,
    readings,
    intervals,
    dailySeries,
    average,
    peak: peakPoint?.value ?? 0,
    peakPoint,
    minPoint,
    status: ratio > 1 ? { label: "Acima da meta", tone: "danger" } : ratio >= .8 ? { label: "Atenção à meta", tone: "warning" } : { label: "Dentro da meta", tone: "success" }
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
  const trend = consumptionTrend(utility.dailySeries);
  byId("consumption-total").textContent = formatNumber(utility.consumption, decimals);
  byId("consumption-unit").textContent = unit;
  byId("consumption-cost").textContent = currency(utility.cost);
  byId("consumption-average").textContent = `${formatNumber(utility.average, decimals)} ${unit}`;
  byId("consumption-peak").textContent = `${formatNumber(utility.peak, decimals)} ${unit}`;
  const peakStatus = byId("consumption-status");
  peakStatus.textContent = utility.peakPoint ? `Pico ${chartDateNumeric(utility.peakPoint.date)}` : "Sem dados";
  peakStatus.dataset.tone = utility.peakPoint ? "warning" : "success";
  byId("consumption-chart-caption").textContent = periodLabel(state.view.consumptionPeriod);
  byId("consumption-chart-title").textContent = `${utilityLabel(type)} diário`;
  const chartHost = byId("consumption-chart");
  chartHost.classList.remove("bar-chart");
  chartHost.classList.add("line-chart-host");
  chartHost.replaceChildren(renderLineChart(utility.dailySeries, type));
  chartHost.dataset.empty = String(utility.dailySeries.length === 0);
  byId("consumption-comparison").replaceChildren(
    comparisonItem("Maior consumo", utility.peakPoint ? `${formatNumber(utility.peakPoint.value, decimals)} ${unit}` : "—", utility.peakPoint ? chartDateNumeric(utility.peakPoint.date) : "Sem dados"),
    comparisonItem("Menor consumo", utility.minPoint ? `${formatNumber(utility.minPoint.value, decimals)} ${unit}` : "—", utility.minPoint ? chartDateNumeric(utility.minPoint.date) : "Sem dados"),
    comparisonItem("Tendência", trend.label, trend.note),
    comparisonItem("Meta utilizada", percent(utility.ratio), utility.status.label)
  );
  document.querySelectorAll("[data-consumption-type]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.consumptionType === type)));
  document.querySelectorAll("[data-consumption-period]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.consumptionPeriod === state.view.consumptionPeriod)));
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
  Object.entries(fields).forEach(([id, value]) => setInputValue(byId(id), value));
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
  if (series.length < 4) return { label: "Sem tendência", note: "Registre mais leituras" };
  const sample = Math.min(3, Math.floor(series.length / 2));
  const first = series.slice(0, sample).reduce((total, item) => total + item.value, 0) / sample;
  const last = series.slice(-sample).reduce((total, item) => total + item.value, 0) / sample;
  if (first <= 0 && last <= 0) return { label: "Estável", note: "Sem variação relevante" };
  const change = first > 0 ? (last - first) / first : 1;
  if (Math.abs(change) < .05) return { label: "Estável", note: "Variação inferior a 5%" };
  const magnitude = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 }).format(Math.abs(change));
  return change > 0 ? { label: `Subindo ${magnitude}`, note: "Consumo diário aumentou" } : { label: `Caindo ${magnitude}`, note: "Consumo diário diminuiu" };
}

function renderLineChart(series, type) {
  const wrapper = document.createElement("div");
  wrapper.className = "line-chart";
  wrapper.dataset.type = type;
  if (!series.length) {
    const empty = document.createElement("div");
    empty.className = "line-chart-empty";
    empty.textContent = "Sem leituras suficientes para calcular o consumo diário.";
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
  const maxValue = Math.max(...series.map((item) => item.value), 1);
  const maxY = maxValue * 1.12;
  const points = series.map((item, index) => ({
    ...item,
    index,
    x: padding.left + (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth),
    y: padding.top + innerHeight - ((item.value / maxY) * innerHeight)
  }));
  const peakPoint = points.reduce((best, point) => !best || point.value > best.value ? point : best, null);
  const minPoint = points.reduce((best, point) => !best || point.value < best.value ? point : best, null);
  const average = series.reduce((total, item) => total + item.value, 0) / series.length;
  const averageY = padding.top + innerHeight - ((average / maxY) * innerHeight);
  const linePath = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1).x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z`;
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const labelIndexes = new Set(points.map((_, index) => index).filter((index) => index % labelStep === 0 || index === points.length - 1));
  const grid = [0, .33, .66, 1].map((ratio) => {
    const y = padding.top + innerHeight * ratio;
    const value = maxY * (1 - ratio);
    return `<g><line class="line-chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line><text class="line-chart-y-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${formatNumber(value, decimals)}</text></g>`;
  }).join("");
  const xLabels = points.filter((point) => labelIndexes.has(point.index)).map((point) => `<text class="line-chart-x-label" x="${point.x}" y="${height - 10}" text-anchor="middle">${chartDateNumeric(point.date)}</text>`).join("");
  const pointMarkup = points.map((point) => {
    const classes = ["line-chart-point"];
    if (point.index === peakPoint.index) classes.push("peak");
    if (point.index === minPoint.index) classes.push("min");
    return `<circle class="${classes.join(" ")}" cx="${point.x}" cy="${point.y}" r="${point.index === peakPoint.index || point.index === minPoint.index ? 4.8 : 3}"><title>${chartDateNumeric(point.date)} · ${formatNumber(point.value, decimals)} ${unit}</title></circle>`;
  }).join("");
  const peakLabelY = Math.max(14, peakPoint.y - 11);
  const showSeparateMinimum = minPoint.index !== peakPoint.index && Math.abs(minPoint.value - peakPoint.value) > 1e-9;
  const minLabelY = Math.min(height - padding.bottom - 5, minPoint.y + 17);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "line-chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${utilityLabel(type)} diário, de ${chartDateNumeric(series[0].date)} a ${chartDateNumeric(series.at(-1).date)}`);
  svg.innerHTML = `${grid}<line class="line-chart-average" x1="${padding.left}" y1="${averageY}" x2="${width - padding.right}" y2="${averageY}"></line><text class="line-chart-average-label" x="${width - padding.right}" y="${Math.max(12, averageY - 6)}" text-anchor="end">Média</text><path class="line-chart-area" d="${areaPath}"></path><path class="line-chart-path" d="${linePath}"></path>${pointMarkup}${xLabels}<text class="line-chart-extreme-label" x="${peakPoint.x}" y="${peakLabelY}" text-anchor="middle">Pico</text>${showSeparateMinimum ? `<text class="line-chart-extreme-label" x="${minPoint.x}" y="${minLabelY}" text-anchor="middle">Menor</text>` : ""}`;

  const legend = document.createElement("div");
  legend.className = "line-chart-legend";
  legend.innerHTML = `<span><strong>Média</strong>${formatNumber(average, decimals)} ${unit}</span><span><strong>Pico</strong>${formatNumber(peakPoint.value, decimals)} ${unit} · ${chartDateNumeric(peakPoint.date)}</span><span><strong>Menor</strong>${formatNumber(minPoint.value, decimals)} ${unit} · ${chartDateNumeric(minPoint.date)}</span>`;
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