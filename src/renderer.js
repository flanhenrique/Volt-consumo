import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js";
import { consumptionWithinCycle, getCycleContext } from "./cycles.js";
import { StartupStatus } from "./app-state.js";

const FLAGS = Object.freeze({ green: 0, yellow: 0.01885, red1: 0.04463, red2: 0.07877 });
const REQUIRED_IDS = [
  "boot-screen", "boot-message", "login-screen", "login-form", "login-email", "login-password", "login-message",
  "mfa-screen", "mfa-form", "mfa-code", "mfa-message", "error-screen", "fatal-error-message", "dashboard",
  "greeting", "page-container", "page-home", "page-readings", "page-reports", "page-users", "page-settings",
  "users-nav", "home-energy-consumption", "home-water-consumption", "home-energy-cost", "home-water-cost",
  "home-total-cost", "home-summary", "readings-list", "readings-empty", "display-name", "account-email",
  "energy-cycle-start", "energy-cycle-end", "water-cycle-start", "water-cycle-end", "energy-rate", "energy-goal",
  "energy-flag", "lighting-fee", "water-rate", "water-goal", "sewer-percent", "water-fixed-fee",
  "locality-country", "locality-state", "locality-city", "energy-provider", "water-provider"
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
      if (state.status !== StartupStatus.READY) {
        publishStartupStatus(state.status);
        return;
      }
      renderNavigation(state, byId);
      renderIdentity(state, byId);
      renderHome(state, byId);
      renderReadings(state, byId);
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
    [StartupStatus.LOADING_DATA]: "Carregando seus dados…"
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
  byId("users-nav").hidden = !state.permissions.canManageUsers;
  byId("reading-fab").hidden = ["reports", "users", "settings"].includes(state.activePage);
}

function renderIdentity(state, byId) {
  byId("greeting").textContent = `Olá, ${state.identity.displayName}!`;
  setInputValue(byId("display-name"), state.identity.displayName);
  setInputValue(byId("account-email"), state.identity.email);
}

function renderHome(state, byId) {
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
  const total = energyEstimate.totalCost + waterEstimate.totalCost;

  byId("cycle-label").textContent = `${energyCycle.label} · ${waterCycle.label}`;
  byId("home-energy-consumption").textContent = `${formatNumber(energyConsumption, 0)} kWh`;
  byId("home-water-consumption").textContent = `${formatNumber(waterConsumption, 3)} m³`;
  byId("home-energy-cycle").textContent = energyCycle.label;
  byId("home-water-cycle").textContent = waterCycle.label;
  byId("home-energy-cost").textContent = currency(energyEstimate.totalCost);
  byId("home-water-cost").textContent = currency(waterEstimate.totalCost);
  byId("home-total-cost").textContent = currency(total);
  byId("home-summary").replaceChildren(
    summaryItem("Energia", energyEstimate.totalCost),
    summaryItem("Água", waterEstimate.totalCost)
  );
}

function renderReadings(state, byId) {
  const combined = [
    ...state.readings.energy.map((reading) => ({ ...reading, type: "energy" })),
    ...state.readings.water.map((reading) => ({ ...reading, type: "water" }))
  ].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  byId("readings-empty").hidden = combined.length > 0;
  byId("readings-list").replaceChildren(...combined.map(readingItem));
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

function renderUsers(state, byId) {
  if (!state.permissions.canManageUsers || !state.admin) {
    byId("organization-summary").replaceChildren();
    byId("members-list").replaceChildren();
    byId("invitations-list").replaceChildren();
    return;
  }
  const organization = state.admin.organization || state.organization;
  const name = document.createElement("strong");
  name.textContent = organization?.name || "Organização";
  const role = document.createElement("span");
  role.textContent = `Papel: ${roleLabel(state.admin.membership?.role)}`;
  const count = document.createElement("span");
  count.textContent = `${state.admin.members.length} usuário(s)`;
  byId("organization-summary").replaceChildren(name, role, count);
  byId("members-list").replaceChildren(...state.admin.members.map(memberItem));
  byId("invitations-list").replaceChildren(...state.admin.invitations.map(invitationItem));
}

function summaryItem(label, value) {
  const item = document.createElement("div");
  const small = document.createElement("small");
  const strong = document.createElement("strong");
  small.textContent = label;
  strong.textContent = currency(value);
  item.append(small, strong);
  return item;
}

function readingItem(reading) {
  const item = document.createElement("li");
  item.className = "reading-item";
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = `${formatNumber(reading.value, reading.type === "water" ? 3 : 0)} ${reading.type === "water" ? "m³" : "kWh"}`;
  small.textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(reading.date));
  copy.append(strong, small);
  const badge = document.createElement("span");
  badge.className = "chip";
  badge.textContent = reading.type === "water" ? "Água" : "Energia";
  item.append(copy, badge);
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
  small.textContent = `Expira em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(invitation.expires_at))}`;
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

function formatNumber(value, decimals) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(Number(value) || 0);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function roleLabel(role) {
  return ({ owner: "Proprietário", admin: "Administrador", member: "Membro", viewer: "Visualizador" })[role] || "Sem papel";
}
