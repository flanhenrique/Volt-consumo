const READINGS_KEY = "volt-readings-v2";
const SETTINGS_KEY = "volt-settings-v1";
const THEME_KEY = "volt-theme";
const REMEMBER_KEY = "volt-remember-user";
const SAVED_EMAIL_KEY = "volt-saved-email";
const SESSION_MARKER_KEY = "volt-session-active";
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
let scannerTarget = null;

applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
setDefaultDate();
populateSettings();
populateWaterSettings();
restoreRememberPreference();
initializeAuth();

function updateReadingFab(meter) {
  const isWater = meter === "water";
  const fab = $("#new-reading-fab");
  fab.querySelector("span").textContent = isWater ? "💧" : "ϟ";
  fab.setAttribute("aria-label", isWater ? "Registrar uma nova leitura de água" : "Registrar uma nova leitura de energia");
  fab.title = isWater ? "Registrar uma nova leitura de água" : "Registrar uma nova leitura de energia";
}

document.querySelectorAll(".meter-tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".meter-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  $("#energy-panel").hidden = button.dataset.meter !== "energy";
  $("#water-panel").hidden = button.dataset.meter !== "water";
  updateReadingFab(button.dataset.meter);
}));

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
  button.disabled = true;
  button.textContent = "Criando conta…";
  message.textContent = "";

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${location.origin}${location.pathname}` }
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
  message.textContent = data.session
    ? "Conta criada. Você já pode usar o app."
    : "Conta criada. Abra o e-mail de confirmação para liberar o acesso.";
});

$("#logout").addEventListener("click", async () => {
  sessionStorage.removeItem(SESSION_MARKER_KEY);
  if (supabaseClient) await supabaseClient.auth.signOut();
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
  const { error } = await supabaseClient.from("meter_readings").insert({
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
  saveReadings();
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
  const { error } = await supabaseClient.from("water_readings").insert({ user_id: currentUserId, value, measured_at: reading.date });
  if (error) {
    message.textContent = "Não foi possível salvar. A atualização do banco de água pode estar pendente.";
    return;
  }
  waterReadings.push(reading);
  waterReadings.sort((a, b) => new Date(a.date) - new Date(b.date));
  cacheUserData();
  $("#water-reading").value = "";
  setDefaultDates();
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
  const { error } = await supabaseClient.from("water_settings").upsert({
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
  const { error } = await supabaseClient.from("water_readings").delete().eq("user_id", currentUserId);
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
  const { error } = await supabaseClient.from("user_settings").upsert({
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
  const { error } = await supabaseClient.from("meter_readings").delete().eq("user_id", currentUserId);
  if (error) {
    $("#reading-message").textContent = "Não foi possível limpar as leituras.";
    return;
  }
  readings = [];
  saveReadings();
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
  const config = window.VOLT_SUPABASE || {};
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

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => updateAuthScreen(session?.user || null), 0);
  });
}

function restoreRememberPreference() {
  const rememberUser = localStorage.getItem(REMEMBER_KEY) !== "false";
  $("#remember-user").checked = rememberUser;
  if (rememberUser) $("#login-email").value = localStorage.getItem(SAVED_EMAIL_KEY) || "";
}

async function updateAuthScreen(user) {
  const signedIn = Boolean(user);
  welcome.hidden = signedIn;
  dashboard.hidden = !signedIn;
  $("#login-password").value = "";
  $("#login-message").textContent = signedIn ? "" : "Entre com seu e-mail e senha.";
  if (!signedIn) {
    currentUserId = null;
    readings = [];
    waterReadings = [];
    settings = { ...DEFAULT_SETTINGS };
    waterSettings = { ...DEFAULT_WATER_SETTINGS };
    return;
  }
  const displayName = user.user_metadata?.name || user.email?.split("@")[0] || "usuário";
  $("#user-name").textContent = displayName;
  await loadUserData(user.id);
  render();
}

function loadLegacySettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveReadings() {
  cacheUserData();
}

async function loadUserData(userId) {
  currentUserId = userId;
  const [readingResult, settingsResult, waterReadingResult, waterSettingsResult] = await Promise.all([
    supabaseClient.from("meter_readings").select("value, measured_at").order("measured_at"),
    supabaseClient.from("user_settings").select("rate, goal, flag, lighting_fee").maybeSingle(),
    supabaseClient.from("water_readings").select("value, measured_at").order("measured_at"),
    supabaseClient.from("water_settings").select("rate, goal, sewer_percent, fixed_fee").maybeSingle()
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
      await supabaseClient.from("water_settings").upsert({
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
      const { error } = await supabaseClient.from("meter_readings").insert(legacy.map((item) => ({
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
    const { error } = await supabaseClient.from("user_settings").upsert({
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
  localStorage.setItem(`volt-user-data-${currentUserId}`, JSON.stringify({ readings, settings, waterReadings, waterSettings }));
}

function loadUserCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(`volt-user-data-${userId}`) || "{}");
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

function setDefaultDates() { setDefaultDate(); }

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0e171d" : "#f3f6f9";
  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.textContent = theme === "dark" ? "☀" : "☾";
    button.setAttribute("aria-label", theme === "dark" ? "Ativar modo claro" : "Ativar modo noturno");
  });
}

function render() {
  const first = readings.at(0)?.value ?? 0;
  const last = readings.at(-1)?.value ?? first;
  const consumption = Math.max(0, last - first);
  const elapsed = readings.length > 1 ? new Date(readings.at(-1).date) - new Date(readings.at(0).date) : 86400000;
  const days = Math.max(1, elapsed / 86400000);
  const progress = Math.min(100, Math.round(consumption / settings.goal * 100));
  const flag = FLAGS[settings.flag] || FLAGS.yellow;
  const baseCost = consumption * settings.rate;
  const flagCost = consumption * flag.rate;
  const totalCost = baseCost + flagCost + settings.lightingFee;
  const currency = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  $("#cycle-consumption").textContent = consumption.toLocaleString("pt-BR");
  $("#estimated-cost").textContent = currency(totalCost);
  $("#daily-average").textContent = `${(consumption / days).toFixed(1).replace(".", ",")} kWh`;
  $("#goal-label").textContent = `Meta: ${settings.goal.toLocaleString("pt-BR")} kWh`;
  $("#goal-percent").textContent = `${progress}%`;
  $("#rate-label").textContent = `R$ ${settings.rate.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}/kWh`;
  $("#base-cost").textContent = currency(baseCost);
  $("#flag-cost").textContent = currency(flagCost);
  $("#flag-cost-label").textContent = `${flag.name} (R$ ${flag.rate.toLocaleString("pt-BR", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}/kWh)`;
  $("#lighting-cost").textContent = currency(settings.lightingFee);
  $("#breakdown-total").textContent = currency(totalCost);
  const badge = $("#flag-badge");
  badge.textContent = flag.name;
  badge.className = `flag-badge ${flag.className}`;
  $("#progress-fill").style.width = `${progress}%`;
  $(".progress").setAttribute("aria-valuenow", String(progress));

  readingList.replaceChildren(...[...readings].reverse().map((item, reverseIndex) => {
    const li = document.createElement("li");
    const index = readings.length - 1 - reverseIndex;
    const previous = readings[index - 1]?.value;
    const delta = previous == null ? "Leitura inicial" : `+${(item.value - previous).toLocaleString("pt-BR")} kWh`;
    li.innerHTML = `<div><strong>${item.value.toLocaleString("pt-BR")} kWh</strong><br><span>${new Date(item.date).toLocaleString("pt-BR")}</span></div><span>${delta}</span>`;
    return li;
  }));
  emptyState.hidden = readings.length > 0;
  renderForecast(readings, settings, "");
  renderWater();
}

function getForecast(items, cycleDays = 30) {
  if (items.length < 2) return { usage: 0, confidence: "baixa", uncertainty: .3 };
  const recent = items.slice(-8);
  const elapsedDays = (new Date(recent.at(-1).date) - new Date(recent[0].date)) / 86400000;
  const usage = recent.at(-1).value - recent[0].value;
  const daily = elapsedDays > 0 ? usage / elapsedDays : 0;
  const confidence = recent.length >= 6 && elapsedDays >= 14 ? "alta" : recent.length >= 3 && elapsedDays >= 5 ? "média" : "baixa";
  return { usage: Math.max(0, daily * cycleDays), confidence, uncertainty: confidence === "alta" ? .1 : confidence === "média" ? .18 : .3 };
}

function renderForecast(items, currentSettings, prefix) {
  const forecast = getForecast(items);
  const flag = FLAGS[currentSettings.flag] || FLAGS.yellow;
  const cost = forecast.usage * (currentSettings.rate + flag.rate) + currentSettings.lightingFee;
  const low = Math.max(currentSettings.lightingFee, cost * (1 - forecast.uncertainty));
  const high = cost * (1 + forecast.uncertainty);
  const currency = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  $(`#${prefix}forecast-consumption`).textContent = `${Math.round(forecast.usage).toLocaleString("pt-BR")} kWh`;
  $(`#${prefix}forecast-cost`).textContent = currency(cost);
  $(`#${prefix}forecast-confidence`).textContent = `Confiança ${forecast.confidence}`;
  $(`#${prefix}forecast-confidence`).dataset.level = forecast.confidence;
  $(`#${prefix}forecast-range`).textContent = items.length < 2
    ? "Adicione mais leituras para melhorar a previsão."
    : `Faixa provável: ${currency(low)} a ${currency(high)}, mantendo o ritmo atual por 30 dias.`;
}

function waterCost(consumption) {
  const water = consumption * waterSettings.rate;
  return water + water * (waterSettings.sewerPercent / 100) + waterSettings.fixedFee;
}

function renderWater() {
  const first = waterReadings.at(0)?.value ?? 0;
  const last = waterReadings.at(-1)?.value ?? first;
  const consumption = Math.max(0, last - first);
  const elapsed = waterReadings.length > 1 ? new Date(waterReadings.at(-1).date) - new Date(waterReadings[0].date) : 86400000;
  const days = Math.max(1, elapsed / 86400000);
  const progress = Math.min(100, Math.round(consumption / waterSettings.goal * 100));
  const currency = (value) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  $("#water-consumption").textContent = consumption.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  $("#water-estimated-cost").textContent = currency(waterCost(consumption));
  $("#water-daily-average").textContent = `${(consumption / days).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`;
  $("#water-goal-label").textContent = `Meta: ${waterSettings.goal.toLocaleString("pt-BR")} m³`;
  $("#water-goal-percent").textContent = `${progress}%`;
  $("#water-progress-fill").style.width = `${progress}%`;

  const forecast = getForecast(waterReadings);
  const forecastCost = waterCost(forecast.usage);
  const low = Math.max(waterSettings.fixedFee, forecastCost * (1 - forecast.uncertainty));
  const high = forecastCost * (1 + forecast.uncertainty);
  $("#water-forecast-consumption").textContent = `${forecast.usage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³`;
  $("#water-forecast-cost").textContent = currency(forecastCost);
  $("#water-forecast-confidence").textContent = `Confiança ${forecast.confidence}`;
  $("#water-forecast-confidence").dataset.level = forecast.confidence;
  $("#water-forecast-range").textContent = waterReadings.length < 2 ? "Adicione mais leituras para melhorar a previsão." : `Faixa provável: ${currency(low)} a ${currency(high)} em 30 dias.`;

  const lastPair = waterReadings.slice(-2);
  const hours = lastPair.length === 2 ? (new Date(lastPair[1].date) - new Date(lastPair[0].date)) / 3600000 : 0;
  const litersPerHour = hours > 0 ? (lastPair[1].value - lastPair[0].value) * 1000 / hours : 0;
  const suspicious = hours >= 2 && hours <= 24 && litersPerHour >= 1;
  $("#leak-alert").hidden = !suspicious;
  if (suspicious) $("#leak-alert").textContent = `⚠ Avanço médio de ${litersPerHour.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L/h. Se não houve uso, verifique vazamentos.`;

  $("#water-reading-list").replaceChildren(...[...waterReadings].reverse().map((item, reverseIndex) => {
    const li = document.createElement("li");
    const index = waterReadings.length - 1 - reverseIndex;
    const previous = waterReadings[index - 1]?.value;
    const delta = previous == null ? "Leitura inicial" : `+${(item.value - previous).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`;
    li.innerHTML = `<div><strong>${item.value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³</strong><br><span>${new Date(item.date).toLocaleString("pt-BR")}</span></div><span>${delta}</span>`;
    return li;
  }));
  $("#water-empty-state").hidden = waterReadings.length > 0;
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
