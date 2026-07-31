const READINGS_KEY = "volt-readings-v2";
const SETTINGS_KEY = "volt-settings-v1";
const THEME_KEY = "volt-theme";
const DEFAULT_SETTINGS = { rate: 0.894560, goal: 250 };
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
let readings = loadReadings();
let settings = loadSettings();

applyTheme(localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
setDefaultDate();
populateSettings();

$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  welcome.hidden = true;
  dashboard.hidden = false;
  render();
});

$("#logout").addEventListener("click", () => {
  dashboard.hidden = true;
  welcome.hidden = false;
});

document.querySelectorAll(".theme-toggle").forEach((button) => {
  button.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
});

$("#reading-form").addEventListener("submit", (event) => {
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

  readings.push({ value, date: date.toISOString() });
  readings.sort((a, b) => new Date(a.date) - new Date(b.date));
  readings = readings.slice(-100);
  saveReadings();
  $("#reading").value = "";
  setDefaultDate();
  message.textContent = "Leitura salva neste aparelho.";
  render();
});

$("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const rate = Number($("#rate").value);
  const goal = Number($("#goal").value);
  if (rate <= 0 || goal <= 0) return;
  settings = { rate, goal };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  $("#settings-message").textContent = "Preferências atualizadas.";
  render();
});

$("#clear-readings").addEventListener("click", () => $("#clear-dialog").showModal());
$("#clear-dialog").addEventListener("close", () => {
  if ($("#clear-dialog").returnValue !== "confirm") return;
  readings = [];
  saveReadings();
  render();
});

function loadReadings() {
  try {
    const saved = localStorage.getItem(READINGS_KEY);
    if (saved !== null) {
      const data = JSON.parse(saved);
      return Array.isArray(data) ? data : [];
    }
    localStorage.setItem(READINGS_KEY, JSON.stringify(INITIAL_READINGS));
    return structuredClone(INITIAL_READINGS);
  } catch {
    return structuredClone(INITIAL_READINGS);
  }
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveReadings() {
  localStorage.setItem(READINGS_KEY, JSON.stringify(readings));
}

function populateSettings() {
  $("#rate").value = settings.rate.toFixed(6);
  $("#goal").value = settings.goal;
}

function setDefaultDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $("#reading-date").value = now.toISOString().slice(0, 16);
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

function render() {
  const first = readings.at(0)?.value ?? 0;
  const last = readings.at(-1)?.value ?? first;
  const consumption = Math.max(0, last - first);
  const elapsed = readings.length > 1 ? new Date(readings.at(-1).date) - new Date(readings.at(0).date) : 86400000;
  const days = Math.max(1, elapsed / 86400000);
  const progress = Math.min(100, Math.round(consumption / settings.goal * 100));

  $("#cycle-consumption").textContent = consumption.toLocaleString("pt-BR");
  $("#estimated-cost").textContent = (consumption * settings.rate).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  $("#daily-average").textContent = `${(consumption / days).toFixed(1).replace(".", ",")} kWh`;
  $("#goal-label").textContent = `Meta: ${settings.goal.toLocaleString("pt-BR")} kWh`;
  $("#goal-percent").textContent = `${progress}%`;
  $("#rate-label").textContent = `R$ ${settings.rate.toLocaleString("pt-BR", { minimumFractionDigits: 6, maximumFractionDigits: 6 })}/kWh`;
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
}

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}
