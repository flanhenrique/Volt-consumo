import { calculateConsumptionSummary } from "./packages/consumption-domain/browser/index.js?v=20260813.7";
import { createApplicationStore, StartupStatus } from "./src/app-state.js?v=20260813.7";
import { VOLT_CONFIG } from "./config.js?v=20260813.7";
import { loadCycleState, normalizeCycle } from "./src/cycles.js?v=20260813.7";
import { createRenderer } from "./src/renderer.js?v=20260813.7";
import { loadSupabaseRuntime } from "./src/supabase-loader.js?v=20260813.7";
import { createVoltService, normalizeIdentity } from "./src/volt-service.js?v=20260813.7";

const store = createApplicationStore();
const renderer = createRenderer();
let service = null;
let stopAuthSubscription = null;

let initialSessionResolved = false;
let activeSessionKey = null;
let pendingSessionKey = null;
let sessionQueue = Promise.resolve();
let mfaFactorId = null;
let readingPreviewUrl = null;
let readingPhotoSequence = 0;
let readingStep = "type";
let applicationStarted = false;
const ACCENT_CHOICES = Object.freeze(["emerald", "azure", "violet", "amber", "coral", "teal"]);
const READING_STEPS = Object.freeze(["type", "capture", "review", "done"]);

store.subscribe((state) => renderer.render(state));
startApplication();

function startApplication() {
  if (applicationStarted) return;
  applicationStarted = true;
  document.getElementById("main-content").hidden = false;
  bindStaticUi();
  void bootstrap();
}

export async function bootstrap() {
  store.setStatus(StartupStatus.RESTORING_SESSION);
  try {
    void registerServiceWorker();
    if (!service) {
      await loadSupabaseRuntime();
      service = createVoltService(VOLT_CONFIG);
      stopAuthSubscription = service.onAuthStateChange(handleAuthEvent);
    }
    const session = await service.restoreSession();
    initialSessionResolved = true;
    await enqueueSession(session);
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
    applyAccentToDocument("emerald");
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
    const accent = savedAccentFor(session.user);
    applyAccentToDocument(accent);
    activeSessionKey = sessionKey(session);
    store.update({ ...loaded, session, user: session.user, cycles, activePage: "home", view: { ...store.getState().view, accent } });
    store.setStatus(StartupStatus.READY);
  } catch (error) {
    failStartup(error);
  }
}

function bindStaticUi() {
  document.getElementById("login-form").addEventListener("submit", handleLogin);
  document.getElementById("signup-button").addEventListener("click", openSignupDialog);
  document.getElementById("signup-form").addEventListener("submit", handleSignup);
  document.getElementById("forgot-password").addEventListener("click", handlePasswordReset);
  document.getElementById("mfa-form").addEventListener("submit", handleMfa);
  document.getElementById("mfa-cancel").addEventListener("click", () => void logout());
  document.getElementById("retry-bootstrap").addEventListener("click", () => void bootstrap());
  document.getElementById("error-logout").addEventListener("click", () => void logout());
  document.getElementById("logout").addEventListener("click", () => void logout());
  document.getElementById("mobile-logout").addEventListener("click", () => void logout());
  document.getElementById("account-form").addEventListener("submit", handleAccountUpdate);
  document.getElementById("cycles-form").addEventListener("submit", handleCyclesUpdate);
  document.getElementById("energy-settings-form").addEventListener("submit", handleEnergySettings);
  document.getElementById("water-settings-form").addEventListener("submit", handleWaterSettings);
  document.getElementById("locality-form").addEventListener("submit", handleLocality);
  document.getElementById("reading-form").addEventListener("submit", handleReading);
  document.getElementById("invite-user").addEventListener("click", () => openDialog("invite-dialog"));
  document.getElementById("invite-form").addEventListener("submit", handleInvitation);
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", (event) => {
    event.preventDefault();
    void navigate(button.dataset.nav);
  }));
  document.querySelectorAll("[data-action='open-reading']").forEach((button) => button.addEventListener("click", openReadingDialog));
  document.querySelectorAll("[data-action='open-more']").forEach((button) => button.addEventListener("click", () => openDialog("more-dialog")));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.dataset.closeDialog)));
  document.querySelectorAll("[data-action='toggle-theme']").forEach((button) => button.addEventListener("click", toggleTheme));
  document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => setThemePreference(button.dataset.themeChoice)));
  document.querySelectorAll("[data-accent-choice]").forEach((button) => button.addEventListener("click", () => setAccentPreference(button.dataset.accentChoice)));
  document.querySelectorAll("[data-consumption-type]").forEach((button) => button.addEventListener("click", () => updateView({ consumptionType: button.dataset.consumptionType })));
  document.querySelectorAll("[data-consumption-period]").forEach((button) => button.addEventListener("click", () => updateView({ consumptionPeriod: button.dataset.consumptionPeriod })));
  document.querySelectorAll("[data-reading-type]").forEach((button) => button.addEventListener("click", () => selectReadingType(button.dataset.readingType)));
  document.getElementById("reading-type").addEventListener("change", (event) => selectReadingType(event.target.value));
  document.getElementById("reading-photo").addEventListener("change", handleReadingPhoto);
  initializeReadingWizard();
  applySavedTheme();
  applyAccentToDocument("emerald");
}

async function handleLogin(event) {
  event.preventDefault();
  const button = document.getElementById("login-submit");
  button.disabled = true;
  store.update({ transitionSurface: "login" });
  renderer.setMessage("login-message", "Autenticando…");
  try {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const session = await service.signIn(email, password);
    if (!session) throw new Error("O provedor não iniciou a sessão.");
    await enqueueSession(session);
  } catch (error) {
    store.update({ transitionSurface: null });
    renderer.setMessage("login-message", authMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const confirmation = document.getElementById("signup-password-confirm").value;
  if (password !== confirmation) {
    renderer.setMessage("signup-message", "As senhas precisam ser iguais.", true);
    return;
  }
  if (!email || password.length < 12) {
    renderer.setMessage("signup-message", "Informe um e-mail válido e uma senha com pelo menos 12 caracteres.", true);
    return;
  }
  renderer.setMessage("signup-message", "Criando conta…");
  try {
    const result = await service.signUp(email, password);
    if (result.session) {
      closeDialog("signup-dialog");
      store.update({ transitionSurface: "login" });
      renderer.setMessage("login-message", "Carregando seus dados…");
      await enqueueSession(result.session);
    } else {
      renderer.setMessage("signup-message", "Confirme o e-mail enviado para concluir o cadastro.");
    }
  } catch (error) {
    renderer.setMessage("signup-message", authMessage(error), true);
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
  store.update({ transitionSurface: "mfa" });
  renderer.setMessage("mfa-message", "Verificando…");
  try {
    const session = await service.verifyMfa(mfaFactorId, code);
    document.getElementById("mfa-form").reset();
    await enqueueSession(session);
  } catch {
    store.update({ transitionSurface: null });
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
    showReadingCompletion(type, reading);
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
  closeDialog("more-dialog");
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
  clearReadingPreview();
  document.getElementById("reading-form").reset();
  selectReadingType("energy");
  const dateInput = document.getElementById("reading-date");
  dateInput.value = toLocalDateTime(new Date());
  renderer.setMessage("reading-message", "");
  renderer.setMessage("ocr-message", "A foto é analisada somente quando escolhida. Revise sempre o valor.");
  setReadingStep("type");
  openDialog("reading-dialog");
}

function openSignupDialog() {
  document.getElementById("signup-form").reset();
  document.getElementById("signup-email").value = document.getElementById("login-email").value.trim();
  renderer.setMessage("signup-message", "");
  openDialog("signup-dialog");
}

function selectReadingType(type) {
  const normalized = type === "water" ? "water" : "energy";
  document.getElementById("reading-type").value = normalized;
  document.querySelectorAll("[data-reading-type]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.readingType === normalized)));
}

function initializeReadingWizard() {
  const flow = document.querySelector("#reading-form .reading-flow");
  if (!flow || flow.dataset.wizardReady === "true") return;

  const typeGrid = flow.querySelector(".reading-type-grid");
  const typeSelect = document.getElementById("reading-type")?.closest("label");
  const captureZone = flow.querySelector(".capture-zone");
  const reviewFields = flow.querySelector(".two-columns.form");
  const reviewed = document.getElementById("reading-reviewed")?.closest("label");
  const submitButton = flow.querySelector("button[type='submit']");
  const message = document.getElementById("reading-message");
  if (!typeGrid || !typeSelect || !captureZone || !reviewFields || !reviewed || !submitButton || !message) return;

  flow.dataset.wizardReady = "true";
  typeSelect.hidden = true;

  const typePanel = createReadingPanel("type");
  typePanel.append(typeGrid, typeSelect);
  typePanel.append(createReadingActions([
    createReadingButton("Continuar", "primary-button", () => setReadingStep("capture"))
  ]));

  const capturePanel = createReadingPanel("capture");
  const captureHint = document.createElement("p");
  captureHint.className = "supporting-copy";
  captureHint.textContent = "A foto é opcional. Você também pode continuar e informar o valor manualmente.";
  capturePanel.append(captureZone, captureHint);
  capturePanel.append(createReadingActions([
    createReadingButton("Voltar", "secondary-button", () => setReadingStep("type")),
    createReadingButton("Continuar", "primary-button", () => setReadingStep("review"))
  ]));

  const reviewPanel = createReadingPanel("review");
  reviewPanel.append(reviewFields, reviewed);
  const reviewActions = createReadingActions([
    createReadingButton("Voltar", "secondary-button", () => setReadingStep("capture")),
    submitButton
  ]);
  reviewPanel.append(reviewActions, message);

  const donePanel = createReadingPanel("done", "empty-state");
  donePanel.innerHTML = '<svg class="icon icon-xl" aria-hidden="true"><use href="#icon-shield"></use></svg><strong id="reading-complete-title">Leitura registrada</strong><p id="reading-complete-summary" class="supporting-copy"></p>';
  donePanel.append(createReadingButton("Concluir", "primary-button", () => closeDialog("reading-dialog")));

  flow.append(typePanel, capturePanel, reviewPanel, donePanel);
  setReadingStep("type");
}

function createReadingPanel(step, className = "form") {
  const panel = document.createElement("section");
  panel.className = className;
  panel.dataset.readingPanel = step;
  panel.hidden = true;
  return panel;
}

function createReadingActions(buttons) {
  const actions = document.createElement("div");
  actions.className = "form-actions";
  buttons.forEach((button) => actions.append(button));
  return actions;
}

function createReadingButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function setReadingStep(step) {
  readingStep = READING_STEPS.includes(step) ? step : "type";
  const activeIndex = READING_STEPS.indexOf(readingStep);

  document.querySelectorAll("[data-reading-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.readingPanel !== readingStep;
  });

  document.querySelectorAll("[data-reading-step]").forEach((indicator) => {
    const index = READING_STEPS.indexOf(indicator.dataset.readingStep);
    if (index === activeIndex) indicator.dataset.active = "true";
    else indicator.removeAttribute("data-active");
    if (index < activeIndex) indicator.dataset.complete = "true";
    else indicator.removeAttribute("data-complete");
  });
}

function showReadingCompletion(type, reading) {
  const unit = type === "water" ? "m³" : "kWh";
  const label = type === "water" ? "Água" : "Energia";
  const title = document.getElementById("reading-complete-title");
  const summary = document.getElementById("reading-complete-summary");
  if (title) title.textContent = `${label} registrada`;
  if (summary) {
    const formattedDate = new Date(reading.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    summary.textContent = `${reading.value} ${unit} · ${formattedDate}`;
  }
  renderer.setMessage("reading-message", "");
  document.getElementById("reading-form").reset();
  clearReadingPreview();
  setReadingStep("done");
}

async function handleReadingPhoto(event) {
  const file = event.target.files?.[0];
  const sequence = ++readingPhotoSequence;
  clearReadingPreview(false);
  if (!file) return;
  const preview = document.getElementById("meter-preview");
  readingPreviewUrl = URL.createObjectURL(file);
  preview.src = readingPreviewUrl;
  preview.hidden = false;
  renderer.setMessage("ocr-message", "Analisando a imagem localmente…");
  try {
    const { analyzeMeterImage } = await import("./src/meter-ocr.js?v=20260813.7");
    const result = await analyzeMeterImage(file);
    if (sequence !== readingPhotoSequence) return;
    if (result.value !== null) {
      document.getElementById("reading-value").value = String(result.value);
      renderer.setMessage("ocr-message", "Valor sugerido pela imagem. Confira o visor antes de confirmar.");
    } else {
      renderer.setMessage("ocr-message", result.message);
    }
  } catch {
    if (sequence === readingPhotoSequence) renderer.setMessage("ocr-message", "Não foi possível analisar a foto. Informe o valor manualmente e revise antes de confirmar.", true);
  }
}

function clearReadingPreview(invalidate = true) {
  if (invalidate) readingPhotoSequence += 1;
  if (readingPreviewUrl) URL.revokeObjectURL(readingPreviewUrl);
  readingPreviewUrl = null;
  const preview = document.getElementById("meter-preview");
  preview.removeAttribute("src");
  preview.hidden = true;
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog.open) dialog.close();
  if (id === "reading-dialog") clearReadingPreview();
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

function updateView(patch) {
  const state = store.getState();
  store.update({ view: { ...state.view, ...patch } });
}

function toggleTheme() {
  const currentDark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  setThemePreference(currentDark ? "light" : "dark");
}

function setThemePreference(preference) {
  const normalized = ["system", "light", "dark"].includes(preference) ? preference : "system";
  if (normalized === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = normalized;
  localStorage.setItem("volt-theme", normalized);
  updateView({ theme: normalized });
}

function applySavedTheme() {
  const saved = localStorage.getItem("volt-theme");
  setThemePreference(["system", "light", "dark"].includes(saved) ? saved : "system");
}

function setAccentPreference(preference) {
  const accent = ACCENT_CHOICES.includes(preference) ? preference : "emerald";
  const user = store.getState().user;
  if (user?.id) localStorage.setItem(`volt-accent:${user.id}`, accent);
  applyAccentToDocument(accent);
  updateView({ accent });
}

function savedAccentFor(user) {
  const saved = user?.id ? localStorage.getItem(`volt-accent:${user.id}`) : null;
  return ACCENT_CHOICES.includes(saved) ? saved : "emerald";
}

function applyAccentToDocument(accent) {
  document.documentElement.dataset.accent = ACCENT_CHOICES.includes(accent) ? accent : "emerald";
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