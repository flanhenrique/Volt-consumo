import { VOLT_CONFIG } from "../config.js?v=20260813.7";
import { normalizeCycle } from "./cycles.js?v=20260813.7";
import { renderLegalBillDetail } from "./bill-detail.js?v=20260813.7";
import { buildEnergyBillingRules } from "./regulatory-engine.js?v=20260813.7";
import { normalizeLocality, resolveEnergyTariff } from "./tariff.js?v=20260813.7";
import { normalizeEnergyBillingReference } from "./volt-service.js?v=20260813.7";

const DEFAULT_ENERGY_SETTINGS = Object.freeze({ rate: 0.89456, goal: 250, flag: "yellow", lightingFee: 32 });
const DEFAULT_WATER_SETTINGS = Object.freeze({ rate: 8, goal: 15, sewerPercent: 100, fixedFee: 0 });
const STORE_WAIT_LIMIT = 80;

let store = null;
let unsubscribe = null;
let restoreState = null;
let restoreBillingContext = null;
let enteringTargetId = null;
let waitAttempts = 0;

boot();

function boot() {
  store = globalThis.__VOLT_ADMIN_VIEW_BRIDGE__ || null;
  if (!store) {
    waitAttempts += 1;
    if (waitAttempts < STORE_WAIT_LIMIT) window.setTimeout(boot, 50);
    return;
  }

  ensureStyles();
  ensureBanner();
  bindCaptureGuards();
  unsubscribe?.();
  unsubscribe = store.subscribe(handleState);
}

function handleState(state) {
  if (!state || state.status === "SIGNED_OUT") {
    restoreState = null;
    restoreBillingContext = null;
    enteringTargetId = null;
  }

  const active = Boolean(state?.adminView);
  if (active) document.documentElement.dataset.adminUserView = "true";
  else delete document.documentElement.dataset.adminUserView;

  renderBanner(state);
  decorateUserDirectory(state);
  applyReadOnlyUi(active);
}

function ensureBanner() {
  if (document.getElementById("admin-user-view-banner")) return;
  const pageContainer = document.getElementById("page-container");
  if (!pageContainer) return;

  const banner = document.createElement("aside");
  banner.id = "admin-user-view-banner";
  banner.className = "admin-user-view-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.hidden = true;

  const copy = document.createElement("div");
  copy.className = "admin-user-view-copy";
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "VISUALIZAÇÃO ADMINISTRATIVA";
  const title = document.createElement("strong");
  title.id = "admin-user-view-title";
  title.textContent = "Visualizando usuário";
  const note = document.createElement("span");
  note.id = "admin-user-view-note";
  note.textContent = "Modo somente leitura. Sua sessão administrativa continua ativa.";
  copy.append(eyebrow, title, note);

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "secondary-button compact";
  exit.dataset.adminUserViewExit = "true";
  exit.textContent = "Sair da visualização";

  banner.append(copy, exit);
  pageContainer.prepend(banner);
}

function renderBanner(state) {
  ensureBanner();
  const banner = document.getElementById("admin-user-view-banner");
  if (!banner) return;
  const view = state?.adminView;
  banner.hidden = !view;
  if (!view) return;

  const title = document.getElementById("admin-user-view-title");
  const note = document.getElementById("admin-user-view-note");
  if (title) title.textContent = `Visualizando como ${view.displayName || "usuário"}`;
  if (note) note.textContent = "Modo somente leitura. Nenhuma alteração será gravada nesta conta.";
}

function decorateUserDirectory(state) {
  if (!state?.permissions?.canManageUsers || !state?.admin?.accounts?.length) return;
  const host = document.getElementById("users-list");
  if (!host) return;

  const items = [...host.querySelectorAll(".user-account-item")];
  items.forEach((item, index) => {
    const account = state.admin.accounts[index];
    if (!account) return;

    item.dataset.adminViewUserId = account.id;
    let actions = item.querySelector(".admin-user-view-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "admin-user-view-actions";
      item.append(actions);
    }

    let button = actions.querySelector("[data-admin-user-view-open]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button compact admin-user-view-button";
      button.dataset.adminUserViewOpen = "true";
      actions.append(button);
    }

    button.dataset.userId = account.id;
    const ownAccount = account.id === state.authenticatedUserId;
    button.disabled = ownAccount || Boolean(state.adminView) || enteringTargetId === account.id;
    button.textContent = ownAccount ? "Sua conta" : enteringTargetId === account.id ? "Abrindo…" : "Visualizar perfil";
    button.setAttribute("aria-label", ownAccount ? "Esta é sua conta administrativa" : `Visualizar ${account.displayName || account.email} em modo somente leitura`);
  });
}

function bindCaptureGuards() {
  if (document.documentElement.dataset.adminUserViewBound === "true") return;
  document.documentElement.dataset.adminUserViewBound = "true";

  document.addEventListener("click", (event) => {
    const open = event.target.closest?.("[data-admin-user-view-open]");
    if (open) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void startUserView(open.dataset.userId);
      return;
    }

    const exit = event.target.closest?.("[data-admin-user-view-exit]");
    if (exit) {
      event.preventDefault();
      event.stopImmediatePropagation();
      exitUserView();
      return;
    }

    if (!store?.getState()?.adminView) return;
    const blocked = event.target.closest?.("[data-action='open-reading'], #invite-user");
    if (blocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      announceReadOnly();
    }
  }, true);

  document.addEventListener("submit", (event) => {
    if (!store?.getState()?.adminView) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.closest("#dashboard") && !["reading-form", "invite-form"].includes(form.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    announceReadOnly();
  }, true);
}

async function startUserView(userId) {
  const state = store?.getState();
  if (!state || state.status !== "READY" || !state.permissions?.canManageUsers || !userId) return;
  if (state.adminView || enteringTargetId) return;
  if (userId === state.authenticatedUserId) return;

  enteringTargetId = userId;
  decorateUserDirectory(state);
  setUsersMessage("Carregando perfil em modo somente leitura…");

  try {
    const snapshot = await fetchAdminSnapshot(userId);
    if (!snapshot?.authorized) throw new Error("Acesso administrativo não autorizado.");
    if (!snapshot?.found || !snapshot?.target?.id) throw new Error("A conta selecionada não foi encontrada.");

    restoreState = state;
    restoreBillingContext = globalThis.__VOLT_BILLING_CONTEXT__ || null;

    const loaded = normalizeAdminSnapshot(snapshot, state);
    activateTargetBillingContext(snapshot, loaded.settings.energy.rate, loaded.billing.energy);
    store.update(loaded);

    const pageContainer = document.getElementById("page-container");
    pageContainer?.scrollTo?.({ top: 0, behavior: "auto" });
    setUsersMessage("");
  } catch (error) {
    setUsersMessage(operationMessage(error), true);
  } finally {
    enteringTargetId = null;
    decorateUserDirectory(store?.getState());
  }
}

function exitUserView() {
  const current = store?.getState();
  if (!current?.adminView || !restoreState) return;

  globalThis.__VOLT_BILLING_CONTEXT__ = restoreBillingContext;
  const restored = {
    ...restoreState,
    adminView: null,
    activePage: "users",
    error: null
  };

  restoreState = null;
  restoreBillingContext = null;
  store.update(restored);
  renderLegalBillDetail(globalThis.__VOLT_BILLING_CONTEXT__?.profile || null, restored.billing?.energy || null);
  setUsersMessage("");

  const pageContainer = document.getElementById("page-container");
  pageContainer?.scrollTo?.({ top: 0, behavior: "auto" });
}

async function fetchAdminSnapshot(userId) {
  if (!window.supabase?.createClient) throw new Error("Runtime seguro indisponível. Recarregue o VOLT.");
  const rpcClient = window.supabase.createClient(VOLT_CONFIG.url, VOLT_CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: sessionData, error: sessionError } = await rpcClient.auth.getSession();
  if (sessionError || !sessionData?.session) throw new Error("Sessão administrativa indisponível. Entre novamente.");

  const { data, error } = await rpcClient.rpc("beta_admin_user_view_snapshot", { p_user_id: userId });
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("jwt") || message.includes("permission") || message.includes("authorized")) {
      throw new Error("Sua sessão administrativa precisa ser validada novamente.");
    }
    throw new Error("Não foi possível carregar o perfil selecionado.");
  }
  return data;
}

function normalizeAdminSnapshot(snapshot, adminState) {
  const target = snapshot.target || {};
  const identity = {
    displayName: String(target.display_name || target.email || "Usuário").trim(),
    email: String(target.email || "").trim()
  };
  const locality = normalizeLocality(target.locality || {});
  const rawEnergy = mapEnergySettings(snapshot.settings?.energy) || { ...DEFAULT_ENERGY_SETTINGS };
  const tariff = resolveEnergyTariff(locality, rawEnergy);
  const water = mapWaterSettings(snapshot.settings?.water) || { ...DEFAULT_WATER_SETTINGS };
  const billing = normalizeEnergyBillingReference(target.energy_billing_reference);

  return {
    identity,
    account: { id: target.id, email: identity.email, displayName: identity.displayName },
    organization: normalizeOrganization(snapshot.organization),
    readings: {
      energy: normalizeReadings(snapshot.readings?.energy),
      water: normalizeReadings(snapshot.readings?.water)
    },
    historicalConsumption: {
      energy: normalizeMonthlyHistory(snapshot.monthly_history),
      water: []
    },
    settings: { energy: tariff.settings, water },
    cycles: resolveTargetCycles(target.cycles, snapshot.energy_unit),
    billing: { energy: billing },
    tariff: tariff.resolution,
    locality,
    adminView: {
      targetId: target.id,
      displayName: identity.displayName,
      email: identity.email,
      readOnly: true
    },
    activePage: "home",
    transitionSurface: null,
    error: null,
    view: { ...adminState.view, consumptionType: "energy" }
  };
}

function resolveTargetCycles(cycles, unit) {
  const raw = cycles && typeof cycles === "object" ? cycles : {};
  const unitEnergy = Number.isInteger(Number(unit?.cycle_start_day)) && Number.isInteger(Number(unit?.cycle_end_day))
    ? { start: Number(unit.cycle_start_day), end: Number(unit.cycle_end_day) }
    : null;
  return {
    energy: normalizeCycle(raw.energy || unitEnergy),
    water: normalizeCycle(raw.water)
  };
}

function normalizeReadings(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ value: Number(row?.value), date: row?.date }))
    .filter((row) => Number.isFinite(row.value) && row.date)
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}

function normalizeMonthlyHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      referenceMonth: row?.reference_month,
      value: Number(row?.consumption_kwh),
      basis: String(row?.consumption_basis || "not_identified"),
      sourceType: String(row?.source_type || "bill_identified"),
      confidence: String(row?.confidence || "not_identified")
    }))
    .filter((row) => row.referenceMonth && Number.isFinite(row.value));
}

function mapEnergySettings(data) {
  if (!data || typeof data !== "object") return null;
  const rate = Number(data.rate);
  const goal = Number(data.goal);
  const lightingFee = Number(data.lighting_fee);
  if (![rate, goal, lightingFee].every(Number.isFinite)) return null;
  return { rate, goal, flag: String(data.flag || "green"), lightingFee };
}

function mapWaterSettings(data) {
  if (!data || typeof data !== "object") return null;
  const rate = Number(data.rate);
  const goal = Number(data.goal);
  const sewerPercent = Number(data.sewer_percent);
  const fixedFee = Number(data.fixed_fee);
  if (![rate, goal, sewerPercent, fixedFee].every(Number.isFinite)) return null;
  return { rate, goal, sewerPercent, fixedFee };
}

function normalizeOrganization(organization) {
  if (!organization || typeof organization !== "object") return { id: null, name: "Conta do usuário", role: null };
  return {
    id: organization.id || null,
    name: String(organization.name || "Conta do usuário"),
    role: organization.role || null
  };
}

function activateTargetBillingContext(snapshot, fallbackRate, bill) {
  const unit = snapshot.energy_unit;
  if (!unit) {
    globalThis.__VOLT_BILLING_CONTEXT__ = null;
    renderLegalBillDetail(null, bill);
    return;
  }

  const resolved = buildEnergyBillingRules({
    rules: Array.isArray(snapshot.regulatory_rules) ? snapshot.regulatory_rules : [],
    profiles: Array.isArray(snapshot.regulatory_profiles) ? snapshot.regulatory_profiles : [],
    unit,
    cycle: null
  });
  const compatibleBenefits = resolved.benefits.map((benefit) => benefit.type === "free_kwh_credit"
    ? { ...benefit, type: "per_kwh_credit", rate: Number(fallbackRate) || 0 }
    : benefit);

  globalThis.__VOLT_BILLING_CONTEXT__ = {
    profile: {
      id: "sql-regulatory-admin-readonly",
      version: "regulatory-sql-v1",
      provider: unit.distributor || "",
      label: "Regras regulatórias confirmadas no Supabase",
      validFrom: null,
      active: true,
      legalBenefits: [],
      rules: {
        tariffBands: resolved.tariffBands,
        benefits: compatibleBenefits,
        charges: resolved.charges
      },
      appliedRules: resolved.applied
    }
  };
  renderLegalBillDetail(globalThis.__VOLT_BILLING_CONTEXT__.profile, bill);
}

function applyReadOnlyUi(active) {
  const banner = document.getElementById("admin-user-view-banner");
  if (banner) banner.hidden = !active;

  const formControls = document.querySelectorAll("#dashboard form input:not([readonly]), #dashboard form select, #dashboard form textarea, #dashboard form button, #reading-form input, #reading-form select, #reading-form textarea, #reading-form button, #invite-form input, #invite-form select, #invite-form textarea, #invite-form button");
  formControls.forEach((control) => setControlledDisabled(control, active));

  const writeButtons = document.querySelectorAll("[data-action='open-reading'], #invite-user");
  writeButtons.forEach((control) => setControlledDisabled(control, active));

  if (active) {
    for (const id of ["reading-dialog", "invite-dialog"]) {
      const dialog = document.getElementById(id);
      if (dialog?.open) dialog.close();
    }
  }
}

function setControlledDisabled(control, active) {
  if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
  if (active) {
    if (!control.disabled) {
      control.disabled = true;
      control.dataset.adminViewDisabled = "true";
    }
    return;
  }
  if (control.dataset.adminViewDisabled === "true") {
    control.disabled = false;
    delete control.dataset.adminViewDisabled;
  }
}

function announceReadOnly() {
  const note = document.getElementById("admin-user-view-note");
  if (note) note.textContent = "Modo somente leitura: alterações e novos registros estão bloqueados.";
}

function setUsersMessage(message, error = false) {
  const host = document.getElementById("users-message");
  if (!host) return;
  host.textContent = message || "";
  host.dataset.error = String(Boolean(error));
}

function operationMessage(error) {
  const message = String(error?.message || "").trim();
  return message && !message.toLowerCase().includes("jwt") ? message : "Não foi possível concluir a operação agora.";
}

function ensureStyles() {
  if (document.getElementById("admin-user-view-styles")) return;
  const style = document.createElement("style");
  style.id = "admin-user-view-styles";
  style.textContent = `
    .admin-user-view-banner {
      position: sticky;
      top: 0;
      z-index: 25;
      display: flex;
      margin-bottom: var(--space-4);
      padding: var(--space-3) var(--space-4);
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      border: 1px solid color-mix(in srgb, var(--volt-accent) 45%, var(--glass-border));
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--glass-3) 92%, var(--volt-accent) 8%);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(22px) saturate(145%);
    }
    .admin-user-view-copy { display: grid; min-width: 0; gap: .2rem; }
    .admin-user-view-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .admin-user-view-copy > span:last-child { color: var(--text-secondary); font-size: var(--font-size-xs); }
    .admin-user-view-actions { display: flex; justify-content: flex-end; }
    .user-account-item:has(.admin-user-view-actions) { grid-template-columns: minmax(12rem, 1.3fr) minmax(15rem, 1fr) auto auto; }
    :root[data-admin-user-view="true"] [data-requires-users] { display: none !important; }
    :root[data-admin-user-view="true"] #dashboard form :disabled,
    :root[data-admin-user-view="true"] [data-action="open-reading"]:disabled,
    :root[data-admin-user-view="true"] #invite-user:disabled { opacity: .58; cursor: not-allowed; }
    @media (max-width: 900px) {
      .admin-user-view-banner { position: static; align-items: stretch; flex-direction: column; }
      .admin-user-view-banner .secondary-button { width: 100%; }
      .user-account-item:has(.admin-user-view-actions) { grid-template-columns: 1fr auto; }
      .user-account-item:has(.admin-user-view-actions) .user-account-metadata { grid-column: 1 / -1; }
      .admin-user-view-actions { grid-column: 1 / -1; justify-content: stretch; }
      .admin-user-view-actions .secondary-button { width: 100%; }
    }
  `;
  document.head.append(style);
}
