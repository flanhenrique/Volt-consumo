const $ = (id) => document.getElementById(id);
const GRID_FACTOR_KG_CO2E_PER_KWH = 0.0385;
let queued = false;
let observer = null;

if (typeof window !== "undefined" && typeof document !== "undefined") boot();

function boot() {
  const start = () => {
    loadCss();
    structure();
    queue();
    observeHome();
    window.addEventListener("volt:startup-status", (event) => {
      if (event.detail?.status === "READY") queue();
    });
    window.addEventListener("volt:regulatory-context", queue);
    document.addEventListener("change", (event) => {
      if (["energy-goal", "water-goal"].includes(event.target?.id)) queue();
    });
  };
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", start, { once: true })
    : start();
}

function loadCss() {
  if (document.querySelector("link[data-home-sustainability]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./styles/home-dashboard-sustainability.css?v=20260825.4";
  link.dataset.homeSustainability = "";
  document.head.append(link);
}

function observeHome() {
  if (observer) return;
  const sources = [
    $("home-energy-consumption"),
    $("home-water-consumption"),
    $("home-energy-goal"),
    $("home-water-goal")
  ].filter(Boolean);
  if (!sources.length) return;
  observer = new MutationObserver(queue);
  sources.forEach((source) => observer.observe(source, {
    childList: true,
    characterData: true,
    subtree: true
  }));
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    structure();
    renderMeters();
    renderEnvironment();
  });
}

function structure() {
  const home = $("page-home");
  if (!home) return;
  home.classList.add("home-sustainability");

  // O renderer principal ainda mantém o contrato DOM deste gráfico.
  // Ocultamos o card sem removê-lo para preservar o nó durante renders posteriores.
  const dailyConsumptionCard = home.querySelector(".home-chart-card, .home-daily-card");
  if (dailyConsumptionCard) {
    dailyConsumptionCard.hidden = true;
    dailyConsumptionCard.setAttribute("aria-hidden", "true");
  }

  prepareMeter("energy");
  prepareMeter("water");
  prepareEnvironmentCard();
}

function prepareMeter(type) {
  const card = $(`home-${type}-consumption`)?.closest(".overview-card");
  const goal = $(`home-${type}-goal`);
  const cycle = $(`home-${type}-cycle`);
  const track = $(`home-${type}-progress`)?.closest(".progress-track");
  if (!card || !goal || !cycle || !track) return;
  card.classList.add("goal-meter-card");
  cycle.hidden = true;
  const footer = goal.closest("small");
  if (footer && !footer.querySelector(`[data-goal-meter-copy="${type}"]`)) {
    const copy = document.createElement("span");
    copy.dataset.goalMeterCopy = type;
    copy.className = "home-goal-meter-copy";
    footer.replaceChildren(
      document.createTextNode("Meta "),
      goal,
      document.createTextNode(" · "),
      copy,
      cycle
    );
  }
}

function prepareEnvironmentCard() {
  const title = $("home-insight-title");
  const card = title?.closest(".overview-card");
  if (!card) return;
  card.classList.remove("status");
  card.classList.add("environmental");
  card.removeAttribute("data-flag");

  const heading = card.querySelector(".overview-card-heading > span:last-child");
  if (heading && heading.textContent !== "Impacto ambiental") heading.textContent = "Impacto ambiental";

  const iconHost = card.querySelector(".utility-icon");
  if (iconHost && iconHost.dataset.environmentIcon !== "true") {
    iconHost.dataset.environmentIcon = "true";
    iconHost.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5C12.8 3.8 7.4 6.1 5 10.6c-1.8 3.4-.8 6.6 1.6 8.2 2.6 1.8 6.2 1.2 8.5-1.5 2.7-3.1 3.7-8 5.4-13.8Z"></path><path d="M5.8 20.2c2.7-4.2 5.8-7.5 10.1-10.2"></path></svg>';
  }

  const oldFlagImpact = $("home-flag-impact");
  if (oldFlagImpact) oldFlagImpact.hidden = true;

  let source = $("home-environment-source");
  if (!source) {
    source = document.createElement("small");
    source.id = "home-environment-source";
    source.className = "muted home-environment-source";
    $("home-insight-body")?.after(source);
  }

  const action = card.querySelector(".text-button");
  if (action) action.hidden = true;
}

function renderMeters() {
  ["energy", "water"].forEach((type) => {
    const consumption = numberFromText($(`home-${type}-consumption`)?.textContent);
    const goal = numberFromText($(`home-${type}-goal`)?.textContent);
    const ratio = goal > 0 ? consumption / goal : 0;
    const percent = Math.max(0, ratio * 100);
    const clamped = Math.min(percent, 100);
    const track = $(`home-${type}-progress`)?.closest(".progress-track");
    const copy = document.querySelector(`[data-goal-meter-copy="${type}"]`);
    const card = $(`home-${type}-consumption`)?.closest(".overview-card");
    if (track) {
      track.style.setProperty("--usage", `${clamped}%`);
      track.dataset.tone = percent > 100 ? "danger" : percent >= 90 ? "warning" : "success";
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(Math.round(percent)));
    }
    if (copy) {
    const nextCopy = `${formatNumber(percent, 0)}% da meta`;
    if (copy.textContent !== nextCopy) copy.textContent = nextCopy;
  }
    if (card) card.dataset.goalTone = percent > 100 ? "danger" : percent >= 90 ? "warning" : "success";

    const status = $(`home-${type}-status`);
    if (status && percent > 100) {
    if (status.textContent !== "Meta ultrapassada") status.textContent = "Meta ultrapassada";
    if (status.dataset.tone !== "danger") status.dataset.tone = "danger";
  }
  });
}

function renderEnvironment() {
  const title = $("home-insight-title");
  const body = $("home-insight-body");
  const source = $("home-environment-source");
  if (!title || !body || !source) return;

  const kwh = numberFromText($("home-energy-consumption")?.textContent);
  const kg = kwh * GRID_FACTOR_KG_CO2E_PER_KWH;
  const nextTitle = `${formatNumber(kg, 1)} kg CO₂e`;
  const nextBody = kwh > 0
    ? "Estimativa associada à energia consumida neste ciclo."
    : "Registre leituras de energia para estimar o impacto do ciclo.";
  const nextSource = "Fator de referência: 0,0385 kg CO₂e/kWh · matriz elétrica brasileira";

  if (title.textContent !== nextTitle) title.textContent = nextTitle;
  if (body.textContent !== nextBody) body.textContent = nextBody;
  if (source.textContent !== nextSource) source.textContent = nextSource;
}

function numberFromText(value) {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const valueNumber = Number.parseFloat(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value) || 0);
}
