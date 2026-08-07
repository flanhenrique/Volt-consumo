const STORAGE_KEY = "volt:beta:locality-context-v1";
const BRAZIL_STATES = [
  ["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],["CE","Ceará"],["DF","Distrito Federal"],["ES","Espírito Santo"],["GO","Goiás"],["MA","Maranhão"],["MT","Mato Grosso"],["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],["PE","Pernambuco"],["PI","Piauí"],["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],["RS","Rio Grande do Sul"],["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],["SE","Sergipe"],["TO","Tocantins"]
];

queueMicrotask(initializeLocalityContext);

function initializeLocalityContext() {
  const settingsPage = document.querySelector("#beta-settings");
  if (!settingsPage || document.querySelector("#beta-locality-form")) return;

  const section = document.createElement("section");
  section.className = "settings-group";
  section.setAttribute("aria-labelledby", "beta-locality-title");
  section.innerHTML = `
    <div class="settings-row">
      <div>
        <h3 id="beta-locality-title">Região e concessionárias</h3>
        <small>Define o contexto das regras locais de energia e água.</small>
      </div>
    </div>
    <form id="beta-locality-form" class="form compact-form">
      <label><span>UF</span><select id="beta-locality-state" required><option value="">Selecione</option>${BRAZIL_STATES.map(([uf,name]) => `<option value="${uf}">${uf} — ${name}</option>`).join("")}</select></label>
      <label><span>Município</span><input id="beta-locality-city" type="text" maxlength="80" autocomplete="address-level2" placeholder="Ex.: Porto Alegre" required></label>
      <label><span>Concessionária de energia</span><input id="beta-locality-energy-provider" type="text" maxlength="120" placeholder="Informe conforme sua fatura"></label>
      <label><span>Concessionária de água</span><input id="beta-locality-water-provider" type="text" maxlength="120" placeholder="Informe conforme sua fatura"></label>
      <button class="secondary-button" type="submit">Salvar região</button>
      <p id="beta-locality-status" class="note status-message full-row" role="status" aria-live="polite"></p>
    </form>
    <p class="note">O Volt não considera tarifas, iluminação pública, esgoto, impostos ou taxas como regras nacionais. Esses valores dependem da localidade e da concessionária. Enquanto não houver uma regra local validada para o endereço informado, o aplicativo mantém apenas os valores configurados pelo usuário e não inventa encargos.</p>`;

  const cycleSection = settingsPage.querySelector("#beta-cycle-form")?.closest("section.settings-group");
  if (cycleSection) cycleSection.before(section);
  else settingsPage.append(section);

  const form = section.querySelector("#beta-locality-form");
  const state = section.querySelector("#beta-locality-state");
  const city = section.querySelector("#beta-locality-city");
  const energyProvider = section.querySelector("#beta-locality-energy-provider");
  const waterProvider = section.querySelector("#beta-locality-water-provider");
  const status = section.querySelector("#beta-locality-status");

  const saved = readLocality();
  state.value = saved.state || "";
  city.value = saved.city || "";
  energyProvider.value = saved.energyProvider || "";
  waterProvider.value = saved.waterProvider || "";
  updateStatus(saved, status);
  publish(saved);
  renderHomeRuleContext(saved);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = {
      state: state.value.trim().toUpperCase(),
      city: city.value.trim(),
      energyProvider: energyProvider.value.trim(),
      waterProvider: waterProvider.value.trim(),
      updatedAt: new Date().toISOString()
    };
    if (!next.state || !next.city) {
      status.textContent = "Informe UF e município para definir o contexto regional.";
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    updateStatus(next, status);
    publish(next);
    renderHomeRuleContext(next);
    window.dispatchEvent(new CustomEvent("volt:locality-context", { detail: structuredClone(next) }));
  });
}

function readLocality() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function updateStatus(context, status) {
  if (!context.state || !context.city) {
    status.textContent = "Região ainda não configurada. Regras locais automáticas permanecem desativadas.";
    return;
  }
  status.textContent = `Contexto regional: ${context.city} · ${context.state}. Tarifas continuam sendo usadas somente quando configuradas ou validadas para essa localidade.`;
}

function renderHomeRuleContext(context) {
  const card = document.querySelector(".tariff-info-card");
  if (!card) return;
  let note = card.querySelector("#beta-local-rule-context");
  if (!note) {
    note = document.createElement("p");
    note.id = "beta-local-rule-context";
    note.className = "note";
    card.prepend(note);
  }
  if (!context.state || !context.city) {
    note.textContent = "Regras locais: região não configurada. O Volt não presume tarifas nacionais.";
    return;
  }
  const providers = [context.energyProvider, context.waterProvider].filter(Boolean);
  const providerText = providers.length ? ` · ${providers.join(" / ")}` : "";
  note.textContent = `Regras locais: ${context.city} · ${context.state}${providerText}. Valores automáticos só serão aplicados quando houver regra validada para esta localidade.`;
}

function publish(context) {
  window.VOLT_LOCALITY_CONTEXT = Object.freeze({
    state: context.state || "",
    city: context.city || "",
    energyProvider: context.energyProvider || "",
    waterProvider: context.waterProvider || "",
    updatedAt: context.updatedAt || null,
    automaticRules: false
  });
}
