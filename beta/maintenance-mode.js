const BYPASS_KEY = "volt-beta-maintenance-bypass-v1";

installMaintenanceGate();

function installMaintenanceGate() {
  if (sessionStorage.getItem(BYPASS_KEY) === "true") return;
  if (document.querySelector(".volt-maintenance-gate")) return;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "./maintenance-mode.css?v=1";
  document.head.append(css);

  const gate = document.createElement("section");
  gate.className = "volt-maintenance-gate";
  gate.setAttribute("role", "status");
  gate.setAttribute("aria-live", "polite");
  gate.innerHTML = `
    <div class="volt-maintenance-card">
      <p class="volt-maintenance-brand">VOLT CONSUMO</p>
      <button class="volt-maintenance-gear" type="button" aria-label="Manutenção em andamento">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2"></circle>
          <path d="M19.2 13.1a7.8 7.8 0 0 0 0-2.2l2-1.5-2-3.4-2.5 1a8 8 0 0 0-1.9-1.1L14.5 3h-5l-.4 2.9A8 8 0 0 0 7.2 7l-2.5-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2.2l-2 1.5 2 3.4 2.5-1a8 8 0 0 0 1.9 1.1l.4 2.9h5l.4-2.9a8 8 0 0 0 1.9-1.1l2.5 1 2-3.4-2.1-1.5Z"></path>
        </svg>
      </button>
      <h1>Estamos em manutenção</h1>
      <p>Estamos realizando ajustes importantes no Volt. O acesso será restabelecido assim que a manutenção for concluída.</p>
      <span class="volt-maintenance-status">Manutenção em andamento</span>
    </div>`;

  document.body.append(gate);

  let clicks = 0;
  const gear = gate.querySelector(".volt-maintenance-gear");
  gear.addEventListener("click", () => {
    clicks += 1;
    if (clicks < 5) return;
    sessionStorage.setItem(BYPASS_KEY, "true");
    gate.remove();
    showLoginForInspection();
  });
}

function showLoginForInspection() {
  const welcome = document.querySelector("#welcome");
  const dashboard = document.querySelector("#dashboard");
  if (welcome) welcome.hidden = false;
  if (dashboard) dashboard.hidden = true;
  document.querySelector("#login-email")?.focus();
}
