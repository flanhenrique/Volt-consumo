import {
  calculateConsumptionSummary,
  calculateEnergyEstimate,
  calculateGoalProgress,
  calculateWaterEstimate,
  detectContinuousWaterFlow,
  forecastLegacyLinear
} from "./packages/consumption-domain/browser/index.js";
import { listEngineDefinitions } from "./packages/engine-core/browser/index.js";
import {
  environmentStorageKey,
  environmentTableName,
  resolveAppEnvironment
} from "./packages/app-environment/browser/index.js";

const APP_ENVIRONMENT = resolveAppEnvironment(window.VOLT_ENVIRONMENT);
const READINGS_KEY = environmentStorageKey(APP_ENVIRONMENT, "readings-v2");
const SETTINGS_KEY = environmentStorageKey(APP_ENVIRONMENT, "settings-v1");
const THEME_KEY = environmentStorageKey(APP_ENVIRONMENT, "theme");
const REMEMBER_KEY = environmentStorageKey(APP_ENVIRONMENT, "remember-user");
const SAVED_EMAIL_KEY = environmentStorageKey(APP_ENVIRONMENT, "saved-email");
const SESSION_MARKER_KEY = environmentStorageKey(APP_ENVIRONMENT, "session-active");
const OFFLINE_DATA_KEY = environmentStorageKey(APP_ENVIRONMENT, "offline-data");
const USER_DATA_PREFIX = environmentStorageKey(APP_ENVIRONMENT, "user-data-");
const dataTable = (name) => environmentTableName(APP_ENVIRONMENT, name);
const PRIVACY_NOTICE_VERSION = "1.0";
const BETA_ADMIN_EMAIL = "flanhenriquee@icloud.com";
const SESSION_CORRELATION_ID = crypto.randomUUID();
const DEFAULT_SETTINGS = { rate: 0.894560, goal: 250, flag: "yellow", lightingFee: 32 };
const DEFAULT_WATER_SETTINGS = { rate: 8, goal: 15, sewerPercent: 100, fixedFee: 0 };
const FLAGS = {
  green: { name: "Bandeira verde", rate: 0, className: "flag-green" },
  yellow: { name: "Bandeira amarela", rate: 0.01885, className: "flag-yellow" },
  red1: { name: "Bandeira vermelha 1", rate: 0.04463, className: "flag-red" },
  red2: { name: "Bandeira vermelha 2", rate: 0.07877, className: "flag-red" }
};
const INITIAL_READINGS = [
  { value: 28425, date: "2026-07-20T18:52:00-04:00" },
  { value: 28431, date: "2026-07-21T18:30:00-04:00" },
  { value: 28446, date: "2026-07-24T08:52:00-04:00" },
  { value: 28475, date: "2026-07-27T09:08:00-04:00" },
  { value: 28490, date: "2026-07-30T07:40:00-04:00" }
];

const $ = (selector) => document.querySelector(selector);
const welcome = $("#welcome");
const dashboard = $("#dashboard");
const readingList = $("#reading-list");
const emptyState = $("#empty-state");
let readings = [];
let settings = { ...DEFAULT_SETTINGS };
let waterReadings = [];
let waterSettings = { ...DEFAULT_WATER_SETTINGS };
let supabaseClient = null;
let currentUserId = null;
let currentUserEmail = "";
let currentDisplayName = "";
let scannerTarget = null;
let betaDataUpdateScheduled = false;
let betaRefreshPromise = null;
let betaAdminSnapshot = { available: false, authorized: false, organization: null, membership: null, members: [], invitations: [], message: "" };
let mfaSnapshot = { available: false, enrolled: false, currentLevel: "aal1", nextLevel: "aal1", factorId: null, enrollment: null };
let operationalHealth = { status: "unknown", auth: false, database: false, checkedAt: null, durationMs: null };

initializeEnvironment();

window.addEventListener("error", (event) => {
  recordOperationalEvent("runtime.error", "error", "browser", { errorType: event.error?.name || "Error" });
});
window.addEventListener("unhandledrejection", (event) => {
  recordOperationalEvent("runtime.error", "error", "promise", { errorType: event.reason?.name || "UnhandledRejection" });
});
enforceOfflineDataPreference();
applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
setDefaultDate();
populateSettings();
populateWaterSettings();
renderEngineSettings();
restoreRememberPreference();
exposeBetaApi();
initializeAuth();

function initializeEnvironment() {
  document.documentElement.dataset.environment = APP_ENVIRONMENT.id;
  document.title = APP_ENVIRONMENT.productName;
  if (APP_ENVIRONMENT.badge) {
    document.querySelectorAll(".environment-badge").forEach((badge) => {
      badge.textContent = APP_ENVIRONMENT.badge;
      badge.hidden = false;
    });
  }
}

function updateReadingFab(meter) {
  const isWater = meter === "water";
  const fab = $("#new-reading-fab");
  fab.querySelector("span").textContent = isWater ? "💧" : "ϟ";
  fab.setAttribute("aria-label", isWater ? "Registrar uma nova leitura de água" : "Registrar uma nova leitura de energia");
  fab.title = isWater ? "Registrar uma nova leitura de água" : "Registrar uma nova leitura de energia";
}

$("#mfa-enable").addEventListener("click", startMfaEnrollment);
$("#mfa-disable").addEventListener("click", disableMfa);
$("#close-mfa-enrollment").addEventListener("click", cancelMfaEnrollment);
$("#mfa-enrollment-form").addEventListener("submit", verifyMfaEnrollment);
$("#mfa-challenge-form").addEventListener("submit", verifyMfaChallenge);
$("#cancel-mfa-challenge").addEventListener("click", async () => {
  $("#mfa-challenge-dialog").close();
  await supabaseClient?.auth.signOut({ scope: "local" });
});

/**
 * Ativa uma aba de medidor mantendo o estado ARIA sincronizado.
 * Correção AUD-002 / A11Y: as abas não expunham role, aria-selected nem
 * navegação por setas — leitores de tela não anunciavam a mudança.
 */
function activateMeterTab(button) {
  const meter = button.dataset.meter;
  document.querySelectorAll(".meter-tab").forEach((tab) => {
    const isActive = tab === button;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });
  $("#energy-panel").hidden = meter !== "energy";
  $("#water-panel").hidden = meter !== "water";
  updateReadingFab(meter);
}

document.querySelectorAll(".meter-tab").forEach((button) => {
  button.addEventListener("click", () => activateMeterTab(button));

  // Navegação por teclado conforme o padrão WAI-ARIA de tabs.
  button.addEventListener("keydown", (event) => {
    const tabs = [...document.querySelectorAll(".meter-tab")];
    const current = tabs.indexOf(button);
    let target = null;
    if (event.key === "ArrowRight") target = tabs[(current + 1) % tabs.length];
    if (event.key === "ArrowLeft") target = tabs[(current - 1 + tabs.length) % tabs.length];
    if (event.key === "Home") target = tabs[0];
    if (event.key === "End") target = tabs.at(-1);
    if (!target) return;
    event.preventDefault();
    activateMeterTab(target);
    target.focus();
  });
});

updateReadingFab(document.querySelector(".meter-tab.active")?.dataset.meter || "energy");

$("#new-reading-fab").addEventListener("click", () => {
  const meter = document.querySelector(".meter-tab.active")?.dataset.meter || "energy";
  const dialog = meter === "water" ? $("#water-reading-dialog") : $("#energy-reading-dialog");
  setDefaultDate();
  dialog.showModal();
  dialog.querySelector("input")?.focus();
});

document.querySelectorAll(".close-reading-dialog").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.querySelectorAll(".scan-button").forEach((button) => button.addEventListener("click", () => {
  scannerTarget = button.dataset.scanTarget;
  $("#scanner-result").step = scannerTarget === "reading" ? "1" : "0.001";
  $("#scanner-result").value = "";
  $("#scanner-message").textContent = `Fotografe o visor. A leitura em ${button.dataset.unit} não será salva sem sua confirmação.`;
  $("#scanner-preview").hidden = true;
  $("#meter-photo").value = "";
  $("#scanner-dialog").showModal();
}));

$("#close-scanner").addEventListener("click", () => $("#scanner-dialog").close());
$("#use-scanner-result").addEventListener("click", () => {
  const value = $("#scanner-result").value;
  if (!scannerTarget || value === "") {
    $("#scanner-message").textContent = "Confira e informe um número válido.";
    return;
  }
  $(`#${scannerTarget}`).value = scannerTarget === "reading" ? String(Math.round(Number(value))) : value;
  $("#scanner-dialog").close();
  $(`#${scannerTarget}`).focus();
});

$("#meter-photo").addEventListener("change", scanMeterPhoto);

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;
  const button = $("#login-button");
  const message = $("#login-message");
  const rememberUser = $("#remember-user").checked;
  const email = $("#login-email").value.trim();
  button.disabled = true;
  button.textContent = "Entrando…";
  message.textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password: $("#login-password").value
  });
  button.disabled = false;
  button.textContent = "Entrar";
  if (error) {
    message.textContent = "E-mail ou senha incorretos.";
    return;
  }
  localStorage.setItem(REMEMBER_KEY, String(rememberUser));
  if (rememberUser) {
    localStorage.setItem(SAVED_EMAIL_KEY, email);
    sessionStorage.removeItem(SESSION_MARKER_KEY);
  } else {
    localStorage.removeItem(SAVED_EMAIL_KEY);
    sessionStorage.setItem(SESSION_MARKER_KEY, "true");
  }
});

$("#signup-button").addEventListener("click", async () => {
  if (!supabaseClient || !$("#login-form").reportValidity()) return;
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const button = $("#signup-button");
  const message = $("#login-message");
  if (!$("#privacy-ack").checked) {
    message.textContent = "Leia e confirme o Aviso de Privacidade para criar a conta.";
    $("#privacy-ack").focus();
    return;
  }
  const privacyAcceptedAt = new Date().toISOString();
  button.disabled = true;
  button.textContent = "Criando conta…";
  message.textContent = "";

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${location.origin}${location.pathname}`,
      data: {
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        privacy_notice_accepted_at: privacyAcceptedAt
      }
    }
  });

  button.disabled = false;
  button.textContent = "Criar minha conta";
  if (error) {
    message.textContent = error.message.toLowerCase().includes("already")
      ? "Este e-mail já possui uma conta. Use Entrar."
      : "Não foi possível criar a conta. Confira os dados e tente novamente.";
    return;
  }

  localStorage.setItem(SAVED_EMAIL_KEY, email);
  $("#remember-user").checked = true;
  localStorage.setItem(REMEMBER_KEY, "true");
  $("#login-password").value = "";
  if (data.user) await recordPrivacyAcceptance(data.user, privacyAcceptedAt);
  message.textContent = data.session
    ? "Conta criada. Você já pode usar o app."
    : "Conta criada. Abra o e-mail de confirmação para liberar o acesso.";
});

$("#forgot-password").addEventListener("click", async () => {
  if (!supabaseClient) return;
  const emailInput = $("#login-email");
  if (!emailInput.reportValidity()) return;
  const button = $("#forgot-password");
  button.disabled = true;
  await supabaseClient.auth.resetPasswordForEmail(emailInput.value.trim(), {
    redirectTo: `${location.origin}${location.pathname}`
  });
  button.disabled = false;
  $("#login-message").textContent = "Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.";
});

$("#close-password-recovery").addEventListener("click", () => $("#password-recovery-dialog").close());
$("#password-recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient) return;
  const password = $("#recovery-password").value;
  const confirmation = $("#recovery-password-confirmation").value;
  const message = $("#password-recovery-message");
  if (password !== confirmation) {
    message.textContent = "As senhas não coincidem.";
    return;
  }
  const button = $("#save-recovery-password");
  button.disabled = true;
  const { error } = await supabaseClient.auth.updateUser({ password });
  if (error) {
    button.disabled = false;
    message.textContent = "O link expirou ou a senha não atende à política de segurança. Solicite uma nova recuperação.";
    return;
  }
  await supabaseClient.from(dataTable("auth_security_events")).insert({
    user_id: currentUserId,
    event_type: "password_changed",
    details: { method: "recovery", sessions_revoked: true }
  });
  await supabaseClient.auth.signOut({ scope: "global" });
  button.disabled = false;
  event.target.reset();
  $("#password-recovery-dialog").close();
  $("#login-message").textContent = "Senha atualizada. Entre novamente; as sessões anteriores foram encerradas.";
});

/**
 * Remove todo dado local do usuário no logout.
 *
 * Correção AUD-002 / TECH-007: leituras, preferências e e-mail salvo
 * permaneciam no dispositivo após o logout. Em aparelho compartilhado,
 * o próximo usuário tinha acesso à cópia local do usuário anterior.
 */
async function clearLocalUserData(userId) {
  removeAllUserCaches(userId);

  // O e-mail salvo só permanece se "manter conectado" estiver ativo.
  if (localStorage.getItem(REMEMBER_KEY) === "false") {
    localStorage.removeItem(SAVED_EMAIL_KEY);
  }

  // Solicita ao service worker o expurgo do cache do shell (SEC-002).
  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: "VOLT_CLEAR_CACHE" });
  } catch {
    // Sem service worker ativo — nada a limpar.
  }
}

$("#logout").addEventListener("click", async () => {
  const userId = currentUserId;
  sessionStorage.removeItem(SESSION_MARKER_KEY);
  if (supabaseClient) await supabaseClient.auth.signOut();
  await clearLocalUserData(userId);
});

$("#open-settings").addEventListener("click", () => {
  $("#offline-data").checked = offlineDataAllowed();
  $("#privacy-message").textContent = "";
  $("#privacy-dialog").showModal();
  refreshMfa().then(renderMfaStatus);
});

$("#close-privacy").addEventListener("click", () => $("#privacy-dialog").close());

$("#offline-data").addEventListener("change", () => {
  const enabled = $("#offline-data").checked;
  localStorage.setItem(OFFLINE_DATA_KEY, String(enabled));
  if (enabled) {
    cacheUserData();
    $("#privacy-message").textContent = "Cópia offline ativada neste dispositivo.";
  } else {
    removeAllUserCaches(currentUserId);
    $("#privacy-message").textContent = "Cópia offline removida deste dispositivo.";
  }
});

$("#export-data").addEventListener("click", exportCurrentUserData);

$("#privacy-request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabaseClient || !currentUserId) return;

  const requestType = $("#privacy-request-type").value;
  if (requestType === "deletion" && !confirm("Registrar solicitação de exclusão da conta e dos dados? O pedido passará por verificação antes da execução.")) return;

  const button = $("#submit-privacy-request");
  const message = $("#privacy-message");
  const requestId = crypto.randomUUID();
  button.disabled = true;
  message.textContent = "Registrando solicitação…";

  const { error } = await supabaseClient.from(dataTable("data_subject_requests")).insert({
    id: requestId,
    user_id: currentUserId,
    request_type: requestType,
    status: "requested",
    privacy_notice_version: PRIVACY_NOTICE_VERSION
  });

  button.disabled = false;
  message.textContent = error
    ? "Não foi possível registrar agora. Tente novamente ou procure o responsável pelo seu acesso."
    : `Solicitação registrada. Protocolo: ${requestId.slice(0, 8).toUpperCase()}.`;
});

document.querySelectorAll(".theme-toggle").forEach((button) => {
  button.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
});

$("#reading-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Number($("#reading").value);
  const localDate = $("#reading-date").value;
  const date = new Date(localDate);
  const previous = readings.at(-1)?.value ?? 0;
  const previousDate = readings.at(-1) ? new Date(readings.at(-1).date) : null;
  const message = $("#reading-message");

  if (!Number.isFinite(value) || value < previous) {
    message.textContent = `A leitura deve ser igual ou maior que ${previous.toLocaleString("pt-BR")} kWh.`;
    return;
  }
  if (!localDate || Number.isNaN(date.getTime())) {
    message.textContent = "Informe uma data e hora válidas.";
    return;
  }
  if (previousDate && date <= previousDate) {
    message.textContent = `A data deve ser posterior a ${previousDate.toLocaleString("pt-BR")}.`;
    return;
  }
  if (readings.some((item) => item.value === value && new Date(item.date).getTime() === date.getTime())) {
    message.textContent = "Esta leitura já está registrada.";
    return;
  }

  const reading = { value, date: date.toISOString() };
  const { error } = await supabaseClient.from(dataTable("meter_readings")).insert({
    user_id: currentUserId,
    value: reading.value,
    measured_at: reading.date
  });
  if (error) {
    message.textContent = "Não foi possível salvar a leitura. Tente novamente.";
    return;
  }
  readings.push(reading);
  readings.sort((a, b) => new Date(a.date) - new Date(b.date));
  readings = readings.slice(-100);
  cacheUserData();
  $("#reading").value = "";
  setDefaultDate();
  message.textContent = "Leitura salva com segurança na sua conta.";
  render();
  $("#energy-reading-dialog").close();
});

$("#water-reading-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = Number($("#water-reading").value);
  const date = new Date($("#water-reading-date").value);
  const previous = waterReadings.at(-1)?.value ?? 0;
  const previousDate = waterReadings.at(-1) ? new Date(waterReadings.at(-1).date) : null;
  const message = $("#water-reading-message");
  if (!Number.isFinite(value) || value < previous) {
    message.textContent = `A leitura deve ser igual ou maior que ${previous.toLocaleString("pt-BR")} m³.`;
    return;
  }
  if (Number.isNaN(date.getTime()) || (previousDate && date <= previousDate)) {
    message.textContent = previousDate ? `A data deve ser posterior a ${previousDate.toLocaleString("pt-BR")}.` : "Informe uma data válida.";
    return;
  }
  const reading = { value, date: date.toISOString() };
  const { error } = await supabaseClient.from(dataTable("water_readings")).insert({ user_id: currentUserId, value, measured_at: reading.date });
  if (error) {
    message.textContent = "Não foi possível salvar. A atualização do banco de água pode estar pendente.";
    return;
  }
  waterReadings.push(reading);
  waterReadings.sort((a, b) => new Date(a.date) - new Date(b.date));
  cacheUserData();
  $("#water-reading").value = "";
  setDefaultDate();
  message.textContent = "Leitura de água salva com segurança.";
  renderWater();
  $("#water-reading-dialog").close();
});

$("#water-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const next = {
    rate: Number($("#water-rate").value),
    goal: Number($("#water-goal").value),
    sewerPercent: Number($("#sewer-percent").value),
    fixedFee: Number($("#water-fixed-fee").value)
  };
  if (next.rate < 0 || next.goal <= 0 || next.sewerPercent < 0 || next.fixedFee < 0) return;
  const { error } = await supabaseClient.from(dataTable("water_settings")).upsert({
    user_id: currentUserId, rate: next.rate, goal: next.goal,
    sewer_percent: next.sewerPercent, fixed_fee: next.fixedFee, updated_at: new Date().toISOString()
  });
  if (error) {
    $("#water-settings-message").textContent = "Não foi possível salvar as preferências de água.";
    return;
  }
  waterSettings = next;
  cacheUserData();
  $("#water-settings-message").textContent = "Preferências de água atualizadas.";
  renderWater();
});

$("#clear-water-readings").addEventListener("click", async () => {
  if (!confirm("Limpar todas as leituras de água desta conta?")) return;
  const { error } = await supabaseClient.from(dataTable("water_readings")).delete().eq("user_id", currentUserId);
  if (error) return;
  waterReadings = [];
  cacheUserData();
  renderWater();
});

$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const rate = Number($("#rate").value);
  const goal = Number($("#goal").value);
  const lightingFee = Number($("#lighting-fee").value);
  const flag = $("#tariff-flag").value;
  if (rate <= 0 || goal <= 0 || lightingFee < 0 || !FLAGS[flag]) return;
  const nextSettings = { rate, goal, flag, lightingFee };
  const { error } = await supabaseClient.from(dataTable("user_settings")).upsert({
    user_id: currentUserId,
    rate,
    goal,
    flag,
    lighting_fee: lightingFee,
    updated_at: new Date().toISOString()
  });
  if (error) {
    $("#settings-message").textContent = "Não foi possível salvar as preferências.";
    return;
  }
  settings = nextSettings;
  cacheUserData();
  $("#settings-message").textContent = "Preferências atualizadas.";
  render();
});

$("#clear-readings").addEventListener("click", () => $("#clear-dialog").showModal());
$("#clear-dialog").addEventListener("close", async () => {
  if ($("#clear-dialog").returnValue !== "confirm") return;
  const { error } = await supabaseClient.from(dataTable("meter_readings")).delete().eq("user_id", currentUserId);
  if (error) {
    $("#reading-message").textContent = "Não foi possível limpar as leituras.";
    return;
  }
  readings = [];
  cacheUserData();
  render();
});

function loadLegacyReadings() {
  try {
    const saved = localStorage.getItem(READINGS_KEY);
    if (saved !== null) {
      const data = JSON.parse(saved);
      return Array.isArray(data) ? data : [];
    }
    return structuredClone(INITIAL_READINGS);
  } catch {
    return structuredClone(INITIAL_READINGS);
  }
}

async function initializeAuth() {
  const config = window[APP_ENVIRONMENT.dataConfigGlobal] || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url || "")
    && config.publishableKey
    && !config.publishableKey.startsWith("COLE_AQUI");

  if (!configured || !window.supabase?.createClient) {
    $("#login-button").disabled = true;
    $("#login-message").textContent = "Login aguardando a configuração segura do Supabase.";
    return;
  }

  supabaseClient = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  supabaseClient.auth.onAuthStateChange((authEvent, session) => {
    setTimeout(async () => {
      if (authEvent === "PASSWORD_RECOVERY") {
        currentUserId = session?.user?.id || null;
        welcome.hidden = false;
        dashboard.hidden = true;
        $("#password-recovery-message").textContent = "";
        $("#password-recovery-dialog").showModal();
        $("#recovery-password").focus();
        return;
      }
      await updateAuthScreen(session?.user || null);
    }, 0);
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) $("#login-message").textContent = "Não foi possível verificar a sessão.";
  const rememberUser = localStorage.getItem(REMEMBER_KEY) !== "false";
  const sessionOnlyExpired = !rememberUser
    && !sessionStorage.getItem(SESSION_MARKER_KEY)
    && data?.session;
  if (sessionOnlyExpired) {
    await supabaseClient.auth.signOut();
    updateAuthScreen(null);
    return;
  }
  await updateAuthScreen(data?.session?.user || null);

}

function restoreRememberPreference() {
  const rememberUser = localStorage.getItem(REMEMBER_KEY) !== "false";
  $("#remember-user").checked = rememberUser;
  if (rememberUser) $("#login-email").value = localStorage.getItem(SAVED_EMAIL_KEY) || "";
}

async function updateAuthScreen(user) {
  const signedIn = Boolean(user);
  if (signedIn) {
    currentUserId = user.id;
    if (!(await enforceMfaForSession())) return;
  }
  welcome.hidden = signedIn;
  dashboard.hidden = !signedIn;
  $("#login-password").value = "";
  $("#login-message").textContent = signedIn ? "" : "Entre com seu e-mail e senha.";
  if (!signedIn) {
    currentUserId = null;
    currentUserEmail = "";
    currentDisplayName = "";
    readings = [];
    waterReadings = [];
    settings = { ...DEFAULT_SETTINGS };
    waterSettings = { ...DEFAULT_WATER_SETTINGS };
    betaAdminSnapshot = { available: false, authorized: false, organization: null, membership: null, members: [], invitations: [], message: "" };
    mfaSnapshot = { available: false, enrolled: false, currentLevel: "aal1", nextLevel: "aal1", factorId: null, enrollment: null };
    return;
  }
  const displayName = user.user_metadata?.name || user.email?.split("@")[0] || "usuário";
  currentUserEmail = user.email || "";
  currentDisplayName = user.user_metadata?.display_name || "";
  $("#user-name").textContent = displayName;
  await recordPrivacyAcceptance(user);
  await loadUserData(user.id);
  void recordOperationalEvent("session.started", "info", "auth", { assuranceLevel: mfaSnapshot.currentLevel });
  void checkOperationalHealth();
  await refreshBetaAdmin();
  render();
}

function loadLegacySettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function loadUserData(userId) {
  currentUserId = userId;
  const [readingResult, settingsResult, waterReadingResult, waterSettingsResult] = await Promise.all([
    supabaseClient.from(dataTable("meter_readings")).select("value, measured_at").order("measured_at"),
    supabaseClient.from(dataTable("user_settings")).select("rate, goal, flag, lighting_fee").maybeSingle(),
    supabaseClient.from(dataTable("water_readings")).select("value, measured_at").order("measured_at"),
    supabaseClient.from(dataTable("water_settings")).select("rate, goal, sewer_percent, fixed_fee").maybeSingle()
  ]);

  if (readingResult.error || settingsResult.error) {
    const cached = loadUserCache(userId);
    readings = cached.readings;
    settings = cached.settings;
    $("#reading-message").textContent = "Sem conexão: exibindo a última cópia deste dispositivo.";
    populateSettings();
    return;
  }

  const cached = loadUserCache(userId);
  if (waterReadingResult.error || waterSettingsResult.error) {
    waterReadings = cached.waterReadings;
    waterSettings = cached.waterSettings;
    $("#water-reading-message").textContent = "O banco de água precisa receber a atualização antes do primeiro uso.";
  } else {
    waterReadings = (waterReadingResult.data || []).map((item) => ({ value: Number(item.value), date: item.measured_at }));
    if (waterSettingsResult.data) {
      waterSettings = {
        rate: Number(waterSettingsResult.data.rate), goal: Number(waterSettingsResult.data.goal),
        sewerPercent: Number(waterSettingsResult.data.sewer_percent), fixedFee: Number(waterSettingsResult.data.fixed_fee)
      };
    } else {
      waterSettings = cached.waterSettings;
      await supabaseClient.from(dataTable("water_settings")).upsert({
        user_id: userId, rate: waterSettings.rate, goal: waterSettings.goal,
        sewer_percent: waterSettings.sewerPercent, fixed_fee: waterSettings.fixedFee
      });
    }
  }

  readings = (readingResult.data || []).map((item) => ({
    value: Number(item.value),
    date: item.measured_at
  }));

  if (readings.length === 0 && localStorage.getItem(READINGS_KEY) !== null) {
    const legacy = loadLegacyReadings();
    if (legacy.length) {
      const { error } = await supabaseClient.from(dataTable("meter_readings")).insert(legacy.map((item) => ({
        user_id: userId,
        value: item.value,
        measured_at: item.date
      })));
      if (!error) {
        readings = legacy;
        localStorage.removeItem(READINGS_KEY);
      }
    }
  }

  if (settingsResult.data) {
    settings = {
      rate: Number(settingsResult.data.rate),
      goal: Number(settingsResult.data.goal),
      flag: settingsResult.data.flag,
      lightingFee: Number(settingsResult.data.lighting_fee)
    };
  } else {
    settings = loadLegacySettings();
    const { error } = await supabaseClient.from(dataTable("user_settings")).upsert({
      user_id: userId,
      rate: settings.rate,
      goal: settings.goal,
      flag: settings.flag,
      lighting_fee: settings.lightingFee
    });
    if (!error) localStorage.removeItem(SETTINGS_KEY);
  }
  cacheUserData();
  populateSettings();
  populateWaterSettings();
}

function cacheUserData() {
  if (!currentUserId) return;
  if (!offlineDataAllowed()) {
    localStorage.removeItem(`${USER_DATA_PREFIX}${currentUserId}`);
    return;
  }
  localStorage.setItem(`${USER_DATA_PREFIX}${currentUserId}`, JSON.stringify({ readings, settings, waterReadings, waterSettings }));
}

function offlineDataAllowed() {
  return localStorage.getItem(OFFLINE_DATA_KEY) === "true";
}

function removeAllUserCaches(userId) {
  if (userId) localStorage.removeItem(`${USER_DATA_PREFIX}${userId}`);
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(USER_DATA_PREFIX)) localStorage.removeItem(key);
  }
}

function enforceOfflineDataPreference() {
  if (!offlineDataAllowed()) removeAllUserCaches();
}

async function recordPrivacyAcceptance(user, acceptedAtOverride) {
  const metadata = user?.user_metadata || {};
  const noticeVersion = acceptedAtOverride ? PRIVACY_NOTICE_VERSION : metadata.privacy_notice_version;
  const acceptedAt = acceptedAtOverride || metadata.privacy_notice_accepted_at;
  if (!supabaseClient || !user?.id || noticeVersion !== PRIVACY_NOTICE_VERSION || !acceptedAt) return;

  // O registro é append-only. Conflito de unicidade em logins seguintes é esperado.
  await supabaseClient.from(dataTable("privacy_acceptances")).insert({
    user_id: user.id,
    notice_version: noticeVersion,
    accepted_at: acceptedAt,
    channel: "web_signup"
  });
}

function exportCurrentUserData() {
  if (!currentUserId) return;
  const exportPayload = {
    schemaVersion: "1.0",
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    exportedAt: new Date().toISOString(),
    account: { id: currentUserId, email: currentUserEmail },
    energy: { readings, settings },
    water: { readings: waterReadings, settings: waterSettings }
  };
  const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${APP_ENVIRONMENT.storagePrefix}-dados-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  $("#privacy-message").textContent = "Arquivo preparado com os dados disponíveis nesta conta.";
}

function exposeBetaApi() {
  if (APP_ENVIRONMENT.id !== "beta") return;
  window.VOLT_BETA_API = Object.freeze({
    deleteReading: deleteBetaReading,
    estimateEnergy: estimateBetaEnergy,
    estimateWater: estimateBetaWater,
    exportData: exportCurrentUserData,
    getSnapshot: getBetaSnapshot,
    getAdminSnapshot: () => structuredClone(betaAdminSnapshot),
    getMfaSnapshot: () => structuredClone(mfaSnapshot),
    getOperationalHealth: () => structuredClone(operationalHealth),
    enableMfa: startMfaEnrollment,
    disableMfa,
    inviteMember: inviteBetaMember,
    refreshData: refreshBetaData,
    refreshAdmin: refreshBetaAdmin,
    refreshMfa,
    checkOperationalHealth,
    resetApplication: resetBetaApplication,
    setTheme: applyTheme,
    updateDisplayName: updateBetaDisplayName,
    updateMember: updateBetaMember,
    updateReading: updateBetaReading
  });
}

async function recordOperationalEvent(eventType, severity, component, details = {}, durationMs = null) {
  if (!supabaseClient || !currentUserId) return;
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(key) && ["string", "number", "boolean"].includes(typeof value))
  );
  try {
    await supabaseClient.from(dataTable("operational_events")).insert({
      user_id: currentUserId,
      correlation_id: SESSION_CORRELATION_ID,
      event_type: eventType,
      severity,
      component,
      duration_ms: durationMs,
      details: safeDetails
    });
  } catch {
    // Telemetria nunca interrompe o fluxo principal.
  }
}

async function checkOperationalHealth() {
  if (!supabaseClient || !currentUserId) return operationalHealth;
  const startedAt = performance.now();
  const [authResult, databaseResult] = await Promise.all([
    supabaseClient.auth.getSession(),
    supabaseClient.from(dataTable("user_settings")).select("user_id").maybeSingle()
  ]);
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  operationalHealth = {
    status: !authResult.error && !databaseResult.error ? "healthy" : "degraded",
    auth: !authResult.error,
    database: !databaseResult.error,
    checkedAt: new Date().toISOString(),
    durationMs
  };
  await recordOperationalEvent(
    "health.checked",
    operationalHealth.status === "healthy" ? "info" : "warning",
    "web-client",
    { auth: operationalHealth.auth, database: operationalHealth.database },
    durationMs
  );
  notifyBetaDataUpdate();
  return operationalHealth;
}

async function refreshMfa() {
  if (!supabaseClient?.auth?.mfa || !currentUserId) {
    mfaSnapshot = { available: false, enrolled: false, currentLevel: "aal1", nextLevel: "aal1", factorId: null, enrollment: null };
    return mfaSnapshot;
  }
  const [factorResult, assuranceResult] = await Promise.all([
    supabaseClient.auth.mfa.listFactors(),
    supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);
  if (factorResult.error || assuranceResult.error) {
    mfaSnapshot = { ...mfaSnapshot, available: false };
    return mfaSnapshot;
  }
  const verified = (factorResult.data?.totp || []).find((factor) => factor.status === "verified") || null;
  mfaSnapshot = {
    ...mfaSnapshot,
    available: true,
    enrolled: Boolean(verified),
    factorId: verified?.id || null,
    currentLevel: assuranceResult.data?.currentLevel || "aal1",
    nextLevel: assuranceResult.data?.nextLevel || "aal1"
  };
  return mfaSnapshot;
}

function renderMfaStatus() {
  const status = $("#mfa-status");
  if (!status) return;
  status.textContent = !mfaSnapshot.available
    ? "MFA indisponível até a configuração do provedor de identidade."
    : mfaSnapshot.enrolled
      ? `Autenticador ativo. Sessão atual em ${mfaSnapshot.currentLevel.toUpperCase()}.`
      : "Autenticador ainda não configurado.";
  $("#mfa-enable").hidden = mfaSnapshot.enrolled;
  $("#mfa-disable").hidden = !mfaSnapshot.enrolled;
  notifyBetaDataUpdate();
}

async function startMfaEnrollment() {
  if (!supabaseClient?.auth?.mfa) return { ok: false, message: "MFA indisponível." };
  const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "Volt" });
  if (error || !data?.id || !data?.totp) return { ok: false, message: "Não foi possível iniciar a configuração do autenticador." };
  mfaSnapshot = { ...mfaSnapshot, enrollment: { factorId: data.id, secret: data.totp.secret, qrCode: data.totp.qr_code } };
  $("#mfa-qr-code").src = data.totp.qr_code;
  $("#mfa-secret").value = data.totp.secret;
  $("#mfa-enrollment-code").value = "";
  $("#mfa-enrollment-message").textContent = "";
  $("#mfa-enrollment-dialog").showModal();
  return { ok: true, message: "Configuração iniciada." };
}

async function cancelMfaEnrollment() {
  const factorId = mfaSnapshot.enrollment?.factorId;
  if (factorId) await supabaseClient?.auth?.mfa?.unenroll({ factorId });
  mfaSnapshot = { ...mfaSnapshot, enrollment: null };
  $("#mfa-enrollment-dialog").close();
  await refreshMfa();
  renderMfaStatus();
  await refreshBetaAdmin();
}

async function verifyMfaEnrollment(event) {
  event.preventDefault();
  const factorId = mfaSnapshot.enrollment?.factorId;
  if (!factorId) return;
  const code = $("#mfa-enrollment-code").value.trim();
  const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    $("#mfa-enrollment-message").textContent = "Código inválido ou expirado. Aguarde o próximo código e tente novamente.";
    return;
  }
  await supabaseClient.from(dataTable("auth_security_events")).insert({
    user_id: currentUserId,
    event_type: "mfa_changed",
    details: { action: "enrolled", factor_type: "totp" }
  });
  mfaSnapshot = { ...mfaSnapshot, enrollment: null };
  event.target.reset();
  $("#mfa-enrollment-dialog").close();
  await refreshMfa();
  renderMfaStatus();
  await refreshBetaAdmin();
}

async function disableMfa() {
  if (!mfaSnapshot.factorId || !confirm("Desativar a autenticação em duas etapas desta conta?")) return { ok: false, message: "Ação cancelada." };
  const { error } = await supabaseClient.auth.mfa.unenroll({ factorId: mfaSnapshot.factorId });
  if (error) return { ok: false, message: "Não foi possível desativar o autenticador. Confirme a sessão em AAL2." };
  await supabaseClient.from(dataTable("auth_security_events")).insert({
    user_id: currentUserId,
    event_type: "mfa_changed",
    details: { action: "unenrolled", factor_type: "totp" }
  });
  await refreshMfa();
  renderMfaStatus();
  await refreshBetaAdmin();
  return { ok: true, message: "Autenticador desativado." };
}

async function verifyMfaChallenge(event) {
  event.preventDefault();
  const code = $("#mfa-challenge-code").value.trim();
  const { error } = await supabaseClient.auth.mfa.challengeAndVerify({ factorId: mfaSnapshot.factorId, code });
  if (error) {
    $("#mfa-challenge-message").textContent = "Código inválido ou expirado.";
    return;
  }
  event.target.reset();
  $("#mfa-challenge-dialog").close();
  await refreshMfa();
  await updateAuthScreen((await supabaseClient.auth.getUser()).data?.user || null);
}

async function enforceMfaForSession() {
  await refreshMfa();
  renderMfaStatus();
  if (!mfaSnapshot.enrolled || mfaSnapshot.currentLevel === "aal2") return true;
  welcome.hidden = true;
  dashboard.hidden = true;
  $("#mfa-challenge-message").textContent = "";
  if (!$("#mfa-challenge-dialog").open) $("#mfa-challenge-dialog").showModal();
  $("#mfa-challenge-code").focus();
  return false;
}

async function refreshBetaAdmin() {
  if (APP_ENVIRONMENT.id !== "beta" || !currentUserId || !supabaseClient?.rpc) return betaAdminSnapshot;
  if (currentUserEmail.trim().toLowerCase() !== BETA_ADMIN_EMAIL || mfaSnapshot.currentLevel !== "aal2") {
    betaAdminSnapshot = { available: true, authorized: false, organization: null, membership: null, members: [], invitations: [], message: "" };
    notifyBetaDataUpdate();
    return betaAdminSnapshot;
  }
  const displayName = currentDisplayName || currentUserEmail.split("@")[0] || "Administrador";
  const bootstrap = await supabaseClient.rpc("beta_admin_bootstrap", {
    p_organization_name: "Minha organização",
    p_display_name: displayName
  });
  if (bootstrap.error) {
    betaAdminSnapshot = { ...betaAdminSnapshot, message: "Administração indisponível até a atualização do banco da Beta." };
    notifyBetaDataUpdate();
    return betaAdminSnapshot;
  }
  const response = await supabaseClient.rpc("beta_admin_snapshot");
  if (response.error || !response.data) {
    betaAdminSnapshot = { ...betaAdminSnapshot, message: "Não foi possível carregar a organização agora." };
  } else {
    betaAdminSnapshot = { available: true, message: "", ...response.data };
  }
  notifyBetaDataUpdate();
  return betaAdminSnapshot;
}

async function inviteBetaMember({ email, role }) {
  if (currentUserEmail.trim().toLowerCase() !== BETA_ADMIN_EMAIL) return { ok: false, message: "Acesso administrativo não autorizado." };
  if (!supabaseClient?.rpc) return { ok: false, message: "Administração indisponível." };
  const { error } = await supabaseClient.rpc("beta_admin_invite_member", { p_email: email, p_role: role });
  if (error) return { ok: false, message: adminErrorMessage(error) };
  await refreshBetaAdmin();
  return { ok: true, message: "Convite registrado por 48 horas." };
}

async function updateBetaMember({ membershipId, role, status, reason }) {
  if (currentUserEmail.trim().toLowerCase() !== BETA_ADMIN_EMAIL) return { ok: false, message: "Acesso administrativo não autorizado." };
  if (!supabaseClient?.rpc) return { ok: false, message: "Administração indisponível." };
  const { error } = await supabaseClient.rpc("beta_admin_update_member", {
    p_membership_id: membershipId,
    p_role: role,
    p_status: status,
    p_reason: reason
  });
  if (error) return { ok: false, message: adminErrorMessage(error) };
  await refreshBetaAdmin();
  return { ok: true, message: "Acesso atualizado e registrado na auditoria." };
}

function adminErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("last_admin")) return "A organização não pode ficar sem administrador.";
  if (message.includes("permission_denied")) return "Você não possui permissão para esta ação.";
  if (message.includes("invalid_")) return "Revise os dados informados.";
  return "Não foi possível concluir a ação administrativa.";
}

function getBetaSnapshot() {
  const energySummary = calculateConsumptionSummary(readings);
  const waterSummary = calculateConsumptionSummary(waterReadings);
  const flag = FLAGS[settings.flag] || FLAGS.yellow;
  const energyConsumption = energySummary.valid ? energySummary.consumption : 0;
  const waterConsumption = waterSummary.valid ? waterSummary.consumption : 0;
  return structuredClone({
    account: { displayName: currentDisplayName, email: currentUserEmail },
    energy: {
      readings,
      settings,
      summary: energySummary,
      forecast: getForecast(readings),
      estimate: calculateEnergyEstimate(energyConsumption, {
        rate: settings.rate,
        flagRate: flag.rate,
        lightingFee: settings.lightingFee
      })
    },
    water: {
      readings: waterReadings,
      settings: waterSettings,
      summary: waterSummary,
      forecast: getForecast(waterReadings),
      estimate: calculateWaterEstimate(waterConsumption, waterSettings)
    }
  });
}

function estimateBetaEnergy(consumption) {
  const flag = FLAGS[settings.flag] || FLAGS.yellow;
  return calculateEnergyEstimate(Number(consumption) || 0, {
    rate: settings.rate,
    flagRate: flag.rate,
    lightingFee: settings.lightingFee
  });
}

function estimateBetaWater(consumption) {
  return calculateWaterEstimate(Number(consumption) || 0, waterSettings);
}

async function updateBetaDisplayName(value) {
  const displayName = String(value || "").trim();
  if (!displayName || displayName.length > 40) {
    return { ok: false, message: "Informe um nome de exibição com até 40 caracteres." };
  }
  const { error } = await supabaseClient.auth.updateUser({ data: { display_name: displayName } });
  if (error) return { ok: false, message: "Não foi possível salvar o nome agora." };
  currentDisplayName = displayName;
  notifyBetaDataUpdate();
  return { ok: true, message: "Nome de exibição atualizado." };
}

function betaReadingCollection(type) {
  if (type === "energy") return { items: readings, table: "meter_readings" };
  if (type === "water") return { items: waterReadings, table: "water_readings" };
  throw new TypeError("Tipo de leitura desconhecido.");
}

function validateBetaReading(type, originalDate, value, date) {
  if (!currentUserId || !supabaseClient) return "Entre novamente para alterar a leitura.";
  if (!Number.isFinite(value) || value < 0 || Number.isNaN(new Date(date).getTime())) {
    return "Informe uma leitura, data e hora válidas.";
  }
  const { items } = betaReadingCollection(type);
  const candidate = items
    .map((item) => item.date === originalDate ? { value, date: new Date(date).toISOString() } : item)
    .sort((left, right) => new Date(left.date) - new Date(right.date));
  if (new Set(candidate.map((item) => item.date)).size !== candidate.length) {
    return "Já existe uma leitura neste horário.";
  }
  if (!calculateConsumptionSummary(candidate).valid) {
    return "A alteração quebraria a sequência crescente das leituras.";
  }
  return "";
}

async function updateBetaReading({ type, originalDate, value, date }) {
  const numericValue = Number(value);
  const parsedDate = new Date(date);
  const isoDate = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
  const validationMessage = validateBetaReading(type, originalDate, numericValue, isoDate);
  if (validationMessage) return { ok: false, message: validationMessage };
  const { items, table } = betaReadingCollection(type);
  const original = items.find((item) => item.date === originalDate);
  if (!original) return { ok: false, message: "A leitura não foi encontrada." };
  const { error } = await supabaseClient
    .from(dataTable(table))
    .update({ value: numericValue, measured_at: isoDate })
    .eq("user_id", currentUserId)
    .eq("value", original.value)
    .eq("measured_at", original.date);
  if (error) return { ok: false, message: "Não foi possível editar a leitura." };
  original.value = numericValue;
  original.date = isoDate;
  items.sort((left, right) => new Date(left.date) - new Date(right.date));
  cacheUserData();
  render();
  return { ok: true, message: "Leitura atualizada." };
}

async function deleteBetaReading({ type, date }) {
  if (!currentUserId || !supabaseClient) return { ok: false, message: "Entre novamente para excluir a leitura." };
  const { items, table } = betaReadingCollection(type);
  const reading = items.find((item) => item.date === date);
  if (!reading) return { ok: false, message: "A leitura não foi encontrada." };
  const { error } = await supabaseClient
    .from(dataTable(table))
    .delete()
    .eq("user_id", currentUserId)
    .eq("value", reading.value)
    .eq("measured_at", reading.date);
  if (error) return { ok: false, message: "Não foi possível excluir a leitura." };
  items.splice(items.indexOf(reading), 1);
  cacheUserData();
  render();
  return { ok: true, message: "Leitura excluída." };
}

async function resetBetaApplication() {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(`${APP_ENVIRONMENT.storagePrefix}-`));
  keys.forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem(SESSION_MARKER_KEY);
  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.filter((key) => key.startsWith(`volt-${APP_ENVIRONMENT.id}-`)).map((key) => caches.delete(key)));
  }
  await supabaseClient?.auth.signOut();
  location.reload();
}

async function refreshBetaData() {
  if (APP_ENVIRONMENT.id !== "beta" || !currentUserId || !supabaseClient) return false;
  if (betaRefreshPromise) return betaRefreshPromise;
  betaRefreshPromise = (async () => {
    await loadUserData(currentUserId);
    render();
    return true;
  })().finally(() => {
    betaRefreshPromise = null;
  });
  return betaRefreshPromise;
}

function notifyBetaDataUpdate() {
  if (APP_ENVIRONMENT.id !== "beta" || betaDataUpdateScheduled) return;
  betaDataUpdateScheduled = true;
  queueMicrotask(() => {
    betaDataUpdateScheduled = false;
    window.dispatchEvent(new CustomEvent("volt:beta-data", {
      detail: { updatedAt: new Date().toISOString() }
    }));
  });
}

function renderEngineSettings() {
  const rows = listEngineDefinitions().map((engine) => {
    const row = document.createElement("li");
    row.className = "engine-row";

    const summary = document.createElement("button");
    summary.className = "engine-summary";
    summary.type = "button";
    summary.setAttribute("aria-expanded", "false");

    const detailsId = `engine-details-${engine.id}`;
    const itemLabel = engine.id === "rule-engine" ? "regras" : "funções";
    summary.setAttribute("aria-controls", detailsId);
    summary.setAttribute("aria-label", `Ver ${itemLabel} do ${engine.displayName}`);

    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = engine.displayName;
    const description = document.createElement("p");
    description.className = "note";
    description.textContent = engine.capabilities.join(" · ");
    details.append(name, description);

    const status = document.createElement("span");
    status.className = "confidence";
    status.textContent = engine.lifecycle === "ready"
      ? "Ativo"
      : engine.lifecycle === "development"
        ? "Em desenvolvimento"
        : "Desativado";
    status.setAttribute("aria-label", `${engine.displayName}: ${status.textContent}`);

    const chevron = document.createElement("span");
    chevron.className = "engine-chevron";
    chevron.textContent = "⌄";
    chevron.setAttribute("aria-hidden", "true");

    const summaryMeta = document.createElement("span");
    summaryMeta.className = "engine-summary-meta";
    summaryMeta.append(status, chevron);
    summary.append(details, summaryMeta);

    const detailPanel = document.createElement("div");
    detailPanel.id = detailsId;
    detailPanel.className = "engine-details";
    detailPanel.hidden = true;

    const detailList = document.createElement("ul");
    detailList.className = "engine-detail-list";
    engine.items.forEach((item) => {
      const detailItem = document.createElement("li");
      const detailHeader = document.createElement("div");
      detailHeader.className = "engine-detail-header";
      const detailId = document.createElement("strong");
      detailId.textContent = item.id;
      const detailStatus = document.createElement("span");
      detailStatus.className = "engine-detail-status";
      detailStatus.textContent = item.status === "available" ? "Disponível" : "Em desenvolvimento";
      detailHeader.append(detailId, detailStatus);

      const detailTitle = document.createElement("h4");
      detailTitle.textContent = item.title;
      const detailDescription = document.createElement("p");
      detailDescription.className = "note";
      detailDescription.textContent = item.description;
      detailItem.append(detailHeader, detailTitle, detailDescription);
      detailList.append(detailItem);
    });
    detailPanel.append(detailList);

    summary.addEventListener("click", () => {
      const expanded = summary.getAttribute("aria-expanded") === "true";
      summary.setAttribute("aria-expanded", String(!expanded));
      summary.setAttribute("aria-label", `${expanded ? "Ver" : "Ocultar"} ${itemLabel} do ${engine.displayName}`);
      detailPanel.hidden = expanded;
      row.classList.toggle("expanded", !expanded);
    });

    row.append(summary, detailPanel);
    return row;
  });
  $("#engine-list").replaceChildren(...rows);
}

function loadUserCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${USER_DATA_PREFIX}${userId}`) || "{}");
    return {
      readings: Array.isArray(cached.readings) ? cached.readings : [],
      settings: { ...DEFAULT_SETTINGS, ...(cached.settings || {}) },
      waterReadings: Array.isArray(cached.waterReadings) ? cached.waterReadings : [],
      waterSettings: { ...DEFAULT_WATER_SETTINGS, ...(cached.waterSettings || {}) }
    };
  } catch {
    return { readings: [], settings: { ...DEFAULT_SETTINGS }, waterReadings: [], waterSettings: { ...DEFAULT_WATER_SETTINGS } };
  }
}

function populateSettings() {
  $("#rate").value = settings.rate.toFixed(6);
  $("#goal").value = settings.goal;
  $("#tariff-flag").value = settings.flag;
  $("#lighting-fee").value = settings.lightingFee.toFixed(2);
}

function populateWaterSettings() {
  $("#water-rate").value = waterSettings.rate.toFixed(2);
  $("#water-goal").value = waterSettings.goal;
  $("#sewer-percent").value = waterSettings.sewerPercent;
  $("#water-fixed-fee").value = waterSettings.fixedFee.toFixed(2);
}

function setDefaultDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $("#reading-date").value = now.toISOString().slice(0, 16);
  if ($("#water-reading-date")) $("#water-reading-date").value = now.toISOString().slice(0, 16);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0e171d" : "#f3f6f9";
  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.textContent = theme === "dark" ? "☀" : "☾";
    button.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo noturno");
  });
}

/**
 * Monta um item da lista de leituras usando nós DOM.
 *
 * Correção AUD-002 / SEC-005: a versão anterior usava innerHTML com
 * interpolação de template. Embora os valores atuais sejam numéricos e
 * formatados, innerHTML com dado dinâmico é vetor de XSS assim que a
 * origem do dado mudar. Criação de nós com textContent elimina a classe
 * inteira do problema.
 */
function buildReadingItem(valueLabel, isoDate, deltaLabel) {
  const li = document.createElement("li");

  const info = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = valueLabel;

  const time = document.createElement("time");
  time.dateTime = isoDate;
  time.textContent = new Date(isoDate).toLocaleString("pt-BR");

  info.append(strong, document.createElement("br"), time);

  const delta = document.createElement("span");
  delta.textContent = deltaLabel;

  li.append(info, delta);
  return li;
}

function render() {
  const summary = calculateConsumptionSummary(readings);
  const integrityAlert = $("#energy-integrity-alert");
  integrityAlert.hidden = summary.valid;
  const consumption = summary.valid ? summary.consumption : 0;
  const progress = calculateGoalProgress(consumption, settings.goal);
  const flag = FLAGS[settings.flag] || FLAGS.yellow;
  const estimate = calculateEnergyEstimate(consumption, {
    rate: settings.rate,
    flagRate: flag.rate,
    lightingFee: settings.lightingFee
  });
  const currency = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  $("#cycle-consumption").textContent = summary.valid ? consumption.toLocaleString("pt-BR") : "—";
  $("#estimated-cost").textContent = summary.valid ? currency(estimate.totalCost) : "—";
  $("#daily-average").textContent = summary.valid ? `${summary.dailyAverage.toFixed(1).replace(".", ",")} kWh` : "—";
  $("#goal-label").textContent = `Meta: ${settings.goal.toLocaleString("pt-BR")} kWh`;
  $("#goal-percent").textContent = `${progress}%`;
  $("#rate-label").textContent = `R$ ${settings.rate.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}/kWh`;
  $("#base-cost").textContent = summary.valid ? currency(estimate.baseCost) : "—";
  $("#flag-cost").textContent = summary.valid ? currency(estimate.flagCost) : "—";
  $("#flag-cost-label").textContent = `${flag.name} (R$ ${flag.rate.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}/kWh)`;
  $("#lighting-cost").textContent = currency(settings.lightingFee);
  $("#breakdown-total").textContent = summary.valid ? currency(estimate.totalCost) : "—";
  const badge = $("#flag-badge");
  badge.textContent = flag.name;
  badge.className = `flag-badge ${flag.className}`;
  $("#progress-fill").style.width = `${progress}%`;
  $("#energy-progress").setAttribute("aria-valuenow", String(progress));

  readingList.replaceChildren(...[...readings].reverse().map((item, reverseIndex) => {
    const index = readings.length - 1 - reverseIndex;
    const previous = readings[index - 1]?.value;
    const delta = previous === undefined ? "Leitura inicial" : `+${(item.value - previous).toLocaleString("pt-BR")} kWh`;
    return buildReadingItem(`${item.value.toLocaleString("pt-BR")} kWh`, item.date, delta);
  }));
  emptyState.hidden = readings.length > 0;
  renderForecast(readings, settings, "");
  renderWater();
}

function getForecast(items, cycleDays = 30) {
  return forecastLegacyLinear(items, cycleDays);
}

function renderForecast(items, currentSettings, prefix) {
  const forecast = getForecast(items);
  const flag = FLAGS[currentSettings.flag] || FLAGS.yellow;
  const cost = forecast.usage * (currentSettings.rate + flag.rate) + currentSettings.lightingFee;
  const low = Math.max(currentSettings.lightingFee, cost * (1 - forecast.uncertainty));
  const high = cost * (1 + forecast.uncertainty);
  const currency = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  $(`#${prefix}forecast-consumption`).textContent = forecast.valid ? `${Math.round(forecast.usage).toLocaleString("pt-BR")} kWh` : "—";
  $(`#${prefix}forecast-cost`).textContent = forecast.valid ? currency(cost) : "—";
  $(`#${prefix}forecast-confidence`).textContent = `Confiança ${forecast.confidence}`;
  $(`#${prefix}forecast-confidence`).dataset.level = forecast.confidence;
  $(`#${prefix}forecast-range`).textContent = !forecast.valid
    ? "Previsão indisponível até a correção das leituras inconsistentes."
    : items.length < 2
    ? "Adicione mais leituras para melhorar a previsão."
    : `Faixa provável: ${currency(low)} a ${currency(high)}, mantendo o ritmo atual por 30 dias.`;
}

function waterCost(consumption) {
  return calculateWaterEstimate(consumption, waterSettings).totalCost;
}

function renderWater() {
  const summary = calculateConsumptionSummary(waterReadings);
  const integrityAlert = $("#water-integrity-alert");
  integrityAlert.hidden = summary.valid;
  const consumption = summary.valid ? summary.consumption : 0;
  const progress = calculateGoalProgress(consumption, waterSettings.goal);
  const currency = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  $("#water-consumption").textContent = summary.valid ? consumption.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—";
  $("#water-estimated-cost").textContent = summary.valid ? currency(waterCost(consumption)) : "—";
  $("#water-daily-average").textContent = summary.valid ? `${summary.dailyAverage.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³` : "—";
  $("#water-goal-label").textContent = `Meta: ${waterSettings.goal.toLocaleString("pt-BR")} m³`;
  $("#water-goal-percent").textContent = `${progress}%`;
  $("#water-progress-fill").style.width = `${progress}%`;
  $("#water-progress").setAttribute("aria-valuenow", String(progress));

  const forecast = getForecast(waterReadings);
  const forecastCost = waterCost(forecast.usage);
  const low = Math.max(waterSettings.fixedFee, forecastCost * (1 - forecast.uncertainty));
  const high = forecastCost * (1 + forecast.uncertainty);
  $("#water-forecast-consumption").textContent = forecast.valid ? `${forecast.usage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³` : "—";
  $("#water-forecast-cost").textContent = forecast.valid ? currency(forecastCost) : "—";
  $("#water-forecast-confidence").textContent = `Confiança ${forecast.confidence}`;
  $("#water-forecast-confidence").dataset.level = forecast.confidence;
  $("#water-forecast-range").textContent = !forecast.valid
    ? "Previsão indisponível até a correção das leituras inconsistentes."
    : waterReadings.length < 2
      ? "Adicione mais leituras para melhorar a previsão."
      : `Faixa provável: ${currency(low)} a ${currency(high)} em 30 dias.`;

  const continuousFlow = detectContinuousWaterFlow(waterReadings);
  $("#leak-alert").hidden = !continuousFlow.suspicious;
  if (continuousFlow.suspicious) $("#leak-alert").textContent = `⚠ Avanço médio de ${continuousFlow.litersPerHour.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L/h. Se não houve uso, verifique vazamentos.`;

  $("#water-reading-list").replaceChildren(...[...waterReadings].reverse().map((item, reverseIndex) => {
    const index = waterReadings.length - 1 - reverseIndex;
    const previous = waterReadings[index - 1]?.value;
    const delta = previous === undefined ? "Leitura inicial" : `+${(item.value - previous).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`;
    const label = `${item.value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`;
    return buildReadingItem(label, item.date, delta);
  }));
  $("#water-empty-state").hidden = waterReadings.length > 0;
  notifyBetaDataUpdate();
}

async function scanMeterPhoto(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const preview = $("#scanner-preview");
  const objectUrl = URL.createObjectURL(file);
  preview.src = objectUrl;
  preview.hidden = false;
  $("#scanner-progress").hidden = false;
  $("#scanner-message").textContent = "Reconhecendo os dígitos…";
  try {
    if (!window.Tesseract) throw new Error("OCR indisponível");
    const result = await window.Tesseract.recognize(file, "eng", {
      workerPath: "./vendor/tesseract/worker.min.js",
      corePath: "./vendor/tesseract-core",
      langPath: "./vendor/tessdata",
      logger: ({ progress }) => {
        if (Number.isFinite(progress)) $("#scanner-progress span").style.width = `${Math.round(progress * 100)}%`;
      }
    });
    const candidates = (result.data.text.match(/\d+(?:[.,]\d+)?/g) || [])
      .map((text) => text.replace(",", ".").replace(/[^\d.]/g, ""))
      .filter(Boolean)
      .sort((a, b) => b.replace(".", "").length - a.replace(".", "").length);
    if (!candidates.length) throw new Error("Nenhum número encontrado");
    $("#scanner-result").value = candidates[0];
    $("#scanner-message").textContent = "Número sugerido. Compare com o visor antes de usar.";
  } catch {
    $("#scanner-message").textContent = "Não consegui ler com segurança. Digite o número observado na foto.";
  } finally {
    $("#scanner-progress").hidden = true;
    URL.revokeObjectURL(objectUrl);
  }
}

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
