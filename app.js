import { calculateConsumptionSummary } from "./packages/consumption-domain/browser/index.js";
import { createApplicationStore, StartupStatus } from "./src/app-state.js";
import { VOLT_CONFIG } from "./config.js";
import { loadCycleState, normalizeCycle } from "./src/cycles.js";
import { createMeterFlow } from "./src/meter-flow.js";
import { createRenderer } from "./src/renderer.js";
import { loadSupabaseRuntime } from "./src/supabase-loader.js";
import { createVoltService, normalizeIdentity } from "./src/volt-service.js";

const store = createApplicationStore();
const renderer = createRenderer();
let service = null;
let stopAuthSubscription = null;

let initialSessionResolved = false;
let activeSessionKey = null;
let pendingSessionKey = null;
let sessionQueue = Promise.resolve();
let mfaFactorId = null;

createMeterFlow({
  getService: () => service,
  getState: () => store.getState(),
  setReadingMessage: (message, error = false) => renderer.setMessage("reading-message", message, error)
});

store.subscribe((state) => renderer.render(state));
bindStaticUi();
void bootstrap();

export async function bootstrap() {
  store.setStatus(StartupStatus.RESTORING_SESSION);
  try {
    if (!service) {
      await loadSupabaseRuntime();
      service = createVoltService(VOLT_CONFIG);
      stopAuthSubscription = service.onAuthStateChange(handleAuthEvent);
    }
    const session = await service.restoreSession();
    initialSessionResolved = true;
    await enqueueSession(session);
    await registerServiceWorker();
  } catch (error) {
    initialSessionResolved = true;
    failStartup(error);
  }
}

function handleAuthEvent(event, session) {
  if (!initialSessionResolved && event === "INITIAL_SESSION") return;
  if (event === "SIGNED_OUT") {
    activeSessionKey = null;
    pendingSessionKey = null;
    mfaFactorId = null;
    if (store.getState().status !== StartupStatus.SIGNED_OUT) store.resetPrivateState();
    return;
  }
  if (event === "TOKEN_REFRESHED") {
    if (session) store.update({ session, user: session.user });
    return;
  }
  if (event === "USER_UPDATED" && session && store.getState().status === StartupStatus.READY) {
    const identity = normalizeIdentity(session.user);
    store.update({ session, user: session.user, identity, account: { ...store.getState().account, ...identity } });
    return;
  }
  if (event === "SIGNED_IN" && session) void enqueueSession(session);
}

function enqueueSession(session, force = false) {
  const key = sessionKey(session);
  if (!force && key && (key === activeSessionKey || key === pendingSessionKey)) return sessionQueue;
  pendingSessionKey = key;
  sessionQueue = sessionQueue
    .catch(() => undefined)
    .then(() => restoreAuthenticatedApplication(session))
    .finally(() => { if (pendingSessionKey === key) pendingSessionKey = null; });
  return sessionQueue;
}

async function restoreAuthenticatedApplication(session) {
  if (!session?.user) {
    activeSessionKey = null;
    store.resetPrivateState();
    return;
  }

  store.update({ session, user: session.user });
  store.setStatus(StartupStatus.LOADING_ACCOUNT);
  try {
    const mfa = await service.getMfaState();
    if (mfa.enrolled && mfa.currentLevel !== "aal2") {
      mfaFactorId = mfa.factorId;
      store.setStatus(StartupStatus.MFA_REQUIRED);
      return;
    }

    store.setStatus(StartupStatus.LOADING_DATA);
    const loaded = await service.loadApplicationData(session);
    const cycles = loadCycleState(session.user);
    activeSessionKey = sessionKey(session);
    store.update({ ...loaded, session, user: session.user, cycles, activePage: "home" });
    store.setStatus(StartupStatus.READY);
  } catch (error) {
    failStartup(error);
  }
}

function bindStaticUi() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("signup-button").addEventListener("click", handleSignup);
  document.getElementById("forgot-password").addEventListener("click", handlePasswordReset);
  document.getElementById("mfa-form").addEventListener("submit", handleMfa);
  document.getElementById("mfa-cancel").addEventListener("click", () => void logout());
  document.getElementById("retry-bootstrap").addEventListener("click", () => void bootstrap());
  document.getElementById("error-logout").addEventListener("click", () => void logout());
  document.getElementById("logout").addEventListener("click", () => void logout());
  document.getElementById("account-form").addEventListener("submit", handleAccountUpdate);
  document.getElementById("cycles-form").addEventListener("submit", handleCyclesUpdate);
  document.getElementById("energy-settings-form").addEventListener("submit", handleEnergySettings);
  document.getElementById("water-settings-form").addEventListener("submit", handleWaterSettings);
  document.getElementById("locality-form").addEventListener("submit", handleLocality);
  document.getElementById("reading-form").addEventListener("submit", handleReading);
  document.getElementById("invite-user").addEventListener("click", () => openDialog("invite-dialog"));
  document.getElementById("invite-form").addEventListener("submit", handleInvitation);
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  document.querySelectorAll("[data-action='open-reading']").forEach((button) => button.addEventListener("click", openReadingDialog));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.dataset.closeDialog)));
  document.querySelectorAll("[data-action='toggle-theme']").forEach((button) => button.addEventListener("click", toggleTheme));
  applySavedTheme();
}

async function handleLogin(event) {
  event.preventDefault();
  const button = document.getElementById("login-submit");
  button.disabled = true;
  renderer.setMessage("login-message", "Autenticando…");
  try {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const session = await service.signIn(email, password);
    if (!session) throw new Error("O provedor não iniciou a sessão.");
    renderer.setMessage("login-message", "");
    await enqueueSession(session);
  } catch (error) {
    renderer.setMessage("login-message", authMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function handleSignup() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  if (!email || password.length < 12) {
    renderer.setMessage("login-message", "Informe um e-mail válido e uma senha com pelo menos 12 caracteres.", true);
    return;
  }
  renderer.setMessage("login-message", "Criando conta…");
  try {
    const result = await service.signUp(email, password);
    renderer.setMessage("login-message", result.session ? "Conta criada. Carregando…" : "Confirme o e-mail enviado para concluir o cadastro.");
    if (result.session) await enqueueSession(result.session);
  } catch (error) {
    renderer.setMessage("login-message", authMessage(error), true);
  }
}

async function handlePasswordReset() {
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    renderer.setMessage("login-message", "Informe o e-mail da conta.", true);
    return;
  }
  try {
    await service.requestPasswordReset(email);
    renderer.setMessage("login-message", "Enviamos as instruções de recuperação para seu e-mail.");
  } catch (error) {
    renderer.setMessage("login-message", authMessage(error), true);
  }
}

async function handleMfa(event) {
  event.preventDefault();
  const code = document.getElementById("mfa-code").value.trim();
  renderer.setMessage("mfa-message", "Verificando…");
  try {
    const session = await service.verifyMfa(mfaFactorId, code);
    document.getElementById("mfa-form").reset();
    renderer.setMessage("mfa-message", "");
    await enqueueSession(session);
  } catch {
    renderer.setMessage("mfa-message", "Código inválido ou expirado.", true);
  }
}

async function handleAccountUpdate(event) {
  event.preventDefault();
  renderer.setMessage("account-message", "Salvando…");
  try {
    const identity = await service.updateDisplayName(document.getElementById("display-name").value);
    const state = store.getState();
    store.update({ identity, account: { ...state.account, displayName: identity.displayName } });
    renderer.setMessage("account-message", "Nome atualizado.");
  } catch (error) {
    renderer.setMessage("account-message", error.message, true);
  }
}

async function handleCyclesUpdate(event) {
  event.preventDefault();
  const cycles = {
    energy: normalizeCycle({ start: numericValue("energy-cycle-start"), end: numericValue("energy-cycle-end") }),
    water: normalizeCycle({ start: numericValue("water-cycle-start"), end: numericValue("water-cycle-end") })
  };
  renderer.setMessage("cycles-message", "Salvando…");
  try {
    const user = await service.persistCycles(store.getState().user, cycles);
    store.update({ user, session: { ...store.getState().session, user }, cycles });
    renderer.setMessage("cycles-message", "Ciclos atualizados.");
  } catch (error) {
    renderer.setMessage("cycles-message", operationMessage(error), true);
  }
}

async function handleEnergySettings(event) {
  event.preventDefault();
  const settings = {
    rate: numericValue("energy-rate"), goal: numericValue("energy-goal"), flag: document.getElementById("energy-flag").value,
    lightingFee: numericValue("lighting-fee")
  };
  if (settings.rate < 0 || settings.goal <= 0 || settings.lightingFee < 0) return renderer.setMessage("energy-settings-message", "Revise os valores informados.", true);
  renderer.setMessage("energy-settings-message", "Salvando…");
  try {
    const energy = await service.saveEnergySettings(store.getState().user.id, settings);
    store.update({ settings: { ...store.getState().settings, energy }, tariff: energy });
    renderer.setMessage("energy-settings-message", "Preferências de energia atualizadas.");
  } catch (error) {
    renderer.setMessage("energy-settings-message", operationMessage(error), true);
  }
}

async function handleWaterSettings(event) {
  event.preventDefault();
  const settings = {
    rate: numericValue("water-rate"), goal: numericValue("water-goal"), sewerPercent: numericValue("sewer-percent"), fixedFee: numericValue("water-fixed-fee")
  };
  if (settings.rate < 0 || settings.goal <= 0 || settings.sewerPercent < 0 || settings.fixedFee < 0) return renderer.setMessage("water-settings-message", "Revise os valores informados.", true);
  renderer.setMessage("water-settings-message", "Salvando…");
  try {
    const water = await service.saveWaterSettings(store.getState().user.id, settings);
    store.update({ settings: { ...store.getState().settings, water } });
    renderer.setMessage("water-settings-message", "Preferências de água atualizadas.");
  } catch (error) {
    renderer.setMessage("water-settings-message", operationMessage(error), true);
  }
}

async function handleLocality(event) {
  event.preventDefault();
  const state = store.getState();
  const locality = {
    country: document.getElementById("locality-country").value,
    state: document.getElementById("locality-state").value,
    city: document.getElementById("locality-city").value,
    energyProvider: document.getElementById("energy-provider").value,
    waterProvider: document.getElementById("water-provider").value
  };
  renderer.setMessage("locality-message", "Resolvendo tarifa e salvando…");
  try {
    const result = await service.saveLocality(state.user, locality, state.settings.energy);
    store.update({
      user: result.user,
      session: { ...state.session, user: result.user },
      locality: result.locality,
      tariff: result.tariff,
      settings: { ...state.settings, energy: result.energySettings }
    });
    renderer.setMessage("locality-message", result.tariff.automatic ? "Região salva e tarifa oficial aplicada." : "Região salva; tarifa manual mantida.");
  } catch (error) {
    renderer.setMessage("locality-message", operationMessage(error), true);
  }
}

async function handleReading(event) {
  event.preventDefault();
  const type = document.getElementById("reading-type").value;
  const reading = { value: numericValue("reading-value"), date: new Date(document.getElementById("reading-date").value).toISOString() };
  const state = store.getState();
  const candidate = [...state.readings[type], reading].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const validation = calculateConsumptionSummary(candidate);
  if (!validation.valid) return renderer.setMessage("reading-message", "A leitura precisa manter datas e valores em ordem crescente.", true);
  renderer.setMessage("reading-message", "Salvando…");
  try {
    const readings = await service.addReading(type, state.user.id, reading);
    store.update({ readings: { ...state.readings, [type]: readings } });
    event.target.reset();
    closeDialog("reading-dialog");
    renderer.setMessage("readings-message", "Leitura registrada.");
  } catch (error) {
    renderer.setMessage("reading-message", operationMessage(error), true);
  }
}

async function handleInvitation(event) {
  event.preventDefault();
  renderer.setMessage("invite-message", "Criando convite…");
  try {
    const result = await service.inviteMember(document.getElementById("invite-email").value.trim(), document.getElementById("invite-role").value);
    document.getElementById("invite-result-row").hidden = false;
    document.getElementById("invite-result").value = result.invitationUrl;
    renderer.setMessage("invite-message", "Convite criado por 48 horas.");
    const admin = await service.loadAdministration();
    store.update({ admin });
  } catch (error) {
    renderer.setMessage("invite-message", operationMessage(error), true);
  }
}

async function navigate(page) {
  const state = store.getState();
  if (state.status !== StartupStatus.READY) return;
  if (page === "users" && !state.permissions.canManageUsers) return;
  store.update({ activePage: page });
  document.getElementById("page-container").scrollTo({ top: 0, behavior: "auto" });
  if (page === "users" && !state.admin) {
    renderer.setMessage("users-message", "Carregando usuários…");
    try {
      const admin = await service.loadAdministration();
      store.update({ admin });
      renderer.setMessage("users-message", "");
    } catch (error) {
      renderer.setMessage("users-message", operationMessage(error), true);
    }
  }
}

function openReadingDialog() {
  const dateInput = document.getElementById("reading-date");
  dateInput.value = toLocalDateTime(new Date());
  renderer.setMessage("reading-message", "");
  openDialog("reading-dialog");
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog.open) dialog.close();
}

async function logout() {
  try { await service.signOut(); }
  finally {
    activeSessionKey = null;
    pendingSessionKey = null;
    mfaFactorId = null;
    if (store.getState().status !== StartupStatus.SIGNED_OUT) store.resetPrivateState();
  }
}

function failStartup(error) {
  const message = operationMessage(error);
  store.setStatus(StartupStatus.ERROR, message);
}

function numericValue(id) {
  return Number(document.getElementById(id).value);
}

function sessionKey(session) {
  return session ? `${session.user?.id || ""}:${session.access_token || ""}` : "SIGNED_OUT";
}

function toLocalDateTime(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function authMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login")) return "E-mail ou senha inválidos.";
  if (message.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  return "Não foi possível autenticar agora. Tente novamente.";
}

function operationMessage(error) {
  const message = String(error?.message || "").trim();
  return message && !message.toLowerCase().includes("jwt") ? message : "Não foi possível concluir a operação agora.";
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("volt-theme", next);
}

function applySavedTheme() {
  const saved = localStorage.getItem("volt-theme");
  if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  else if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "dark";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return null;
  document.documentElement.dataset.serviceWorker = "registering";
  try {
    const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    document.documentElement.dataset.serviceWorker = "registered";
    return registration;
  } catch (error) {
    document.documentElement.dataset.serviceWorker = "unavailable";
    document.documentElement.dataset.serviceWorkerError = error?.name || "Error";
    return null;
  }
}
