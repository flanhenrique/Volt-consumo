import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.1";
import { consumptionWithinCycle, getCycleContext } from "./cycles.js?v=20260813.1";
import { StartupStatus } from "./app-state.js?v=20260813.1";

const FLAGS = Object.freeze({ green: 0, yellow: 0.01885, red1: 0.04463, red2: 0.07877 });
const PAGE_IDS = Object.freeze(["home", "consumption", "readings", "alerts", "reports", "users", "settings", "help"]);
const REQUIRED_IDS = [
  "boot-screen", "boot-message", "login-screen", "login-form", "login-email", "login-password", "login-message",
  "mfa-screen", "mfa-form", "mfa-code", "mfa-message", "error-screen", "fatal-error-message", "dashboard",
  "greeting", "page-container", ...PAGE_IDS.map((page) => `page-${page}`), "users-nav", "users-nav-mobile",
  "home-greeting", "cycle-label", "home-cycle-copy", "home-energy-consumption", "home-water-consumption",
  "home-energy-cost", "home-water-cost", "home-energy-goal", "home-water-goal", "home-energy-progress",
  "home-water-progress", "home-energy-status", "home-water-status", "home-total-cost", "home-summary",
  "home-insight-title", "home-insight-body", "home-latest-readings", "consumption-total", "consumption-cost",
  "consumption-average", "consumption-peak", "consumption-status", "consumption-chart", "consumption-chart-caption",
  "consumption-comparison", "readings-list", "readings-empty", "readings-last-energy", "readings-last-water",
  "readings-last-energy-date", "readings-last-water-date", "readings-energy-delta", "readings-water-delta",
  "alerts-list", "alerts-empty", "alerts-count", "display-name", "account-email", "sidebar-display-name",
  "sidebar-email", "profile-initials", "mobile-profile-name", "mobile-profile-email", "mobile-profile-initials",
  "energy-cycle-start", "energy-cycle-end", "water-cycle-start", "water-cycle-end", "energy-rate", "energy-goal",
  "energy-flag", "lighting-fee", "water-rate", "water-goal", "sewer-percent", "water-fixed-fee",
  "locality-country", "locality-state", "locality-city", "energy-provider", "water-provider",
  "organization-summary", "members-list", "invitations-list"
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
      renderSettings(state, byId);
      renderUsers(state, byId);
      publishStartupStatus(state.status);
    },
    setMessage(id, message, error = false) {
      const element = byId(id);
      if (!element) throw new Error(`Mensagem destinada a elemento fora do contrato: ${id}`);
      element.textContent = message;
      element.dataset.error = String(Boolean(error));
    }
  });
}

function publishStartupStatus(status) {
  document.documentElement.dataset.startupStatus = status;
  window.dispatchEvent(new CustomEvent("volt:startup-status", { detail: { status } }));
}

function renderLifecycle(state, byId) {
  const booting = [StartupStatus.BOOTING, StartupStatus.RESTORING_SESSION, StartupStatus.LOADING_ACCOUNT, StartupStatus.LOADING_DATA].includes(state.status);
  byId("boot-screen").hidden = !booting;
  byId("login-screen").hidden = state.status !== StartupStatus.SIGNED_OUT;
  byId("mfa-screen").hidden = state.status !== StartupStatus.MFA_REQUIRED;
  byId("error-screen").hidden = state.status !== StartupStatus.ERROR;
  byId("dashboard").hidden = state.status !== StartupStatus.READY;
  const bootMessages = {
    [StartupStatus.BOOTING]: "Iniciando com segurança…",
    [StartupStatus.RESTORING_SESSION]: "Restaurando sua sessão…",
    [StartupStatus.LOADING_ACCOUNT]: "Confirmando sua conta…",
    [StartupStatus.LOADING_DATA]: "Carregando leituras e preferências…"
  };
  if (booting) byId("boot-message").textContent = bootMessages[state.status];
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
  return {
    type,
    consumption,
    cost,
    goal,
    ratio,
    cycle,
    readings,
    intervals,
    average: intervals.length ? intervals.reduce((total, item) => total + item.value, 0) / intervals.length : 0,
    peak: intervals.length ? Math.max(...intervals.map((item) => item.value)) : 0,
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
  byId("consumption-total").textContent = formatNumber(utility.consumption, decimals);
  byId("consumption-unit").textContent = unit;
  byId("consumption-cost").textContent = currency(utility.cost);
  byId("consumption-average").textContent = `${formatNumber(utility.average, decimals)} ${unit}`;
  byId("consumption-peak").textContent = `${formatNumber(utility.peak, decimals)} ${unit}`;
  byId("consumption-status").textContent = utility.status.label;
  byId("consumption-status").dataset.tone = utility.status.tone;
  byId("consumption-chart-caption").textContent = periodLabel(state.view.consumptionPeriod);
  byId("consumption-chart-title").textContent = `${utilityLabel(type)} por intervalo`;
  const max = Math.max(1, ...utility.intervals.map((item) => item.value));
  byId("consumption-chart").replaceChildren(...utility.intervals.slice(-12).map((item) => chartBar(item, max, type)));
  byId("consumption-chart").dataset.empty = String(utility.intervals.length === 0);
  byId("consumption-comparison").replaceChildren(
    comparisonItem("Meta configurada", `${formatNumber(utility.goal, type === "water" ? 1 : 0)} ${unit}`, "Referência do ciclo"),
    comparisonItem("Meta utilizada", percent(utility.ratio), utility.status.label),
    comparisonItem("Margem restante", `${formatNumber(Math.max(utility.goal - utility.consumption, 0), decimals)} ${unit}`, utility.ratio > 1 ? "Meta ultrapassada" : "Até a meta")
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
}

function renderUsers(state, byId) {
  if (!state.permissions.canManageUsers || !state.admin) {
    byId("organization-summary").replaceChildren();
    byId("members-list").replaceChildren();
    byId("invitations-list").replaceChildren();
    return;
  }
  const organization = state.admin.organization || state.organization;
  byId("organization-summary").replaceChildren(
    adminMetric("Organização", organization?.name || "Organização"),
    adminMetric("Seu papel", roleLabel(state.admin.membership?.role)),
    adminMetric("Membros", String(state.admin.members.length))
  );
  byId("members-list").replaceChildren(...state.admin.members.map(memberItem));
  byId("invitations-list").replaceChildren(...state.admin.invitations.map(invitationItem));
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
  bar.title = `${formatNumber(item.value, type === "water" ? 3 : 0)} ${type === "water" ? "m³" : "kWh"}`;
  const label = document.createElement("span");
  label.textContent = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(item.date)).replace(".", "");
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

function adminMetric(label, value) {
  const item = document.createElement("div");
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  small.textContent = label;
  strong.textContent = value;
  item.append(small, strong);
  return item;
}

function memberItem(member) {
  const item = document.createElement("div");
  item.className = "member-item";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = member.display_name || member.email;
  small.textContent = member.email;
  copy.append(strong, small);
  const badge = document.createElement("span");
  badge.className = "chip";
  badge.textContent = `${roleLabel(member.role)} · ${member.status}`;
  item.append(copy, badge);
  return item;
}

function invitationItem(invitation) {
  const item = document.createElement("div");
  item.className = "member-item";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = invitation.email;
  small.textContent = `Expira em ${dateTime(invitation.expires_at)}`;
  copy.append(strong, small);
  const badge = document.createElement("span");
  badge.className = "chip";
  badge.textContent = roleLabel(invitation.role);
  item.append(copy, badge);
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
function dateTime(value) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function roleLabel(role) { return ({ owner: "Proprietário", admin: "Administrador", member: "Membro", viewer: "Visualizador" })[role] || "Sem papel"; }
