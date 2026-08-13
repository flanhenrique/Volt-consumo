const DASHBOARD_RELEASE = "20260813.4";

const styleLink = document.createElement("link");
styleLink.rel = "stylesheet";
styleLink.href = `./styles/dashboard-screen-01.css?v=${DASHBOARD_RELEASE}`;
styleLink.dataset.voltDashboardScreen = "01";
if (!document.querySelector("link[data-volt-dashboard-screen='01']")) document.head.append(styleLink);

const home = document.getElementById("page-home");
if (home) {
  addPeriodControl(home);
  addCardLink(home.querySelector(".overview-card.energy"), "consumption", "Abrir análise de energia", "energy");
  addCardLink(home.querySelector(".overview-card.water"), "consumption", "Abrir análise de água", "water");
  addCardLink(home.querySelector(".overview-card.total"), "consumption", "Abrir análise da conta estimada");
  addCardLink(home.querySelector(".overview-card.status"), "alerts", "Abrir alertas e status");
  addCardLink(home.querySelector(".home-chart-card"), "consumption", "Abrir detalhes do consumo de energia", "energy");
  addCardLink(home.querySelector(".home-distribution-card"), "consumption", "Abrir detalhes da composição do consumo");
  addCardLink(home.querySelector(".latest-card"), "readings", "Abrir histórico de leituras");
  addCardLink(home.querySelector(".volt-tip-card"), "help", "Abrir ajuda do Volt");
}

function addPeriodControl(homePage) {
  const actions = homePage.querySelector(".home-page-header .page-header-actions");
  if (!actions || document.getElementById("home-dashboard-period")) return;
  const button = document.createElement("button");
  button.id = "home-dashboard-period";
  button.type = "button";
  button.className = "dashboard-period-button glass-control";
  button.dataset.nav = "settings";
  button.setAttribute("aria-label", "Revisar período e ciclos de consumo");
  const icon = document.createElement("span");
  icon.className = "dashboard-calendar-icon";
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "dashboard-period-label";
  label.textContent = "Período atual";
  button.append(icon, label);
  actions.prepend(button);
}

function addCardLink(card, page, label, consumptionType = null) {
  if (!card || card.querySelector(":scope > .dashboard-card-link")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "dashboard-card-link";
  button.dataset.nav = page;
  if (consumptionType) {
    button.dataset.dashboardConsumptionType = consumptionType;
    button.addEventListener("click", () => {
      document.querySelector(`.segment-button[data-consumption-type='${consumptionType}']`)?.click();
    });
  }
  button.setAttribute("aria-label", label);
  card.append(button);
}
