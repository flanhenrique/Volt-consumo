import { findSouthTariffRule, listSouthTariffRulesForState } from "./south-tariff-catalog.js";

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
      <label><span>Concessionária de energia</span><input id="beta-locality-energy-provider" type="text" maxlength="120" list="beta-energy-provider-options" placeholder="Informe conforme sua fatura"></label>
      <label><span>Concessionária de água</span><input id="beta-locality-water-provider" type="text" maxlength="120" list="beta-water-provider-options" placeholder="Informe conforme sua fatura"></label>
      <datalist id="beta-energy-provider-options"></datalist>
      <datalist id="beta-water-provider-options"></datalist>
      <button class="secondary-button" type="submit">Salvar região</button>
      <p id="beta-locality-status" class="note status-message full-row" role="status" aria-live="polite"></p>
    </form>
    <div id="beta-regional-tariff-rules" class="full-row" aria-live="polite"></div>
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
  updateProviderOptions(state.value, section);
  updateStatus(saved, status);
  publish(saved);
  renderRegionalRules(saved, section);
  renderHomeRuleContext(saved);

  state.addEventListener("change", () => {
    updateProviderOptions(state.value, section);
    renderRegionalRules({
      state: state.value,
      city: city.value,
      energyProvider: energyProvider.value,
      waterProvider: waterProvider.value
    }, section);
  });
  energyProvider.addEventListener("input", () => renderRegionalRules({ state: state.value, city: city.value, energyProvider: energyProvider.value, waterProvider: waterProvider.value }, section));
  waterProvider.addEventListener("input", () => renderRegionalRules({ state: state.value, city: city.value, energyProvider: energyProvider.value, waterProvider: waterProvider.value }, section));

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
    renderRegionalRules(next, section);
    renderHomeRuleContext(next);
    window.dispatchEvent(new CustomEvent("volt:locality-context", { detail: structuredClone(next) }));
  });
}

function updateProviderOptions(state, section) {
  const energyList = section.querySelector("#beta-energy-provider-options");
  const waterList = section.querySelector("#beta-water-provider-options");
  const rules = listSouthTariffRulesForState(state);
  energyList.replaceChildren(...uniqueOptions(rules.filter((rule) => rule.utility === "energy").map((rule) => rule.provider)));
  waterList.replaceChildren(...uniqueOptions(rules.filter((rule) => rule.utility === "water").map((rule) => rule.provider)));
}

function uniqueOptions(values) {
  return [...new Set(values)].map((value) => {
    const option = document.createElement("option");
    option.value = value;
    return option;
  });
}

function renderRegionalRules(context, section) {
  const container = section.querySelector("#beta-regional-tariff-rules");
  if (!container) return;
  container.replaceChildren();
  if (!context.state || !["PR", "SC", "RS"].includes(String(context.state).toUpperCase())) return;

  const energyRule = findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
  const waterRule = findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });

  if (!energyRule && !waterRule) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Sul: o catálogo regional está disponível. Informe a concessionária exatamente como aparece na fatura para localizar a regra validada.";
    container.append(note);
    return;
  }

  for (const rule of [energyRule, waterRule].filter(Boolean)) container.append(buildRuleCard(rule));
}

function buildRuleCard(rule) {
  const card = document.createElement("article");
  card.className = "card tariff-info-card regional-tariff-card";
  const heading = document.createElement("div");
  heading.className = "section-heading";
  const title = document.createElement("h3");
  title.textContent = `${rule.utility === "energy" ? "Energia" : "Água"} · ${rule.provider}`;
  const badge = document.createElement("span");
  badge.className = "confidence";
  badge.textContent = rule.automatic ? "Tarifa base validada" : "Regra regional cadastrada";
  heading.append(title, badge);

  const details = document.createElement("p");
  details.className = "note";
  if (rule.utility === "energy" && Number.isFinite(rule.ratePerKwh)) {
    details.textContent = `${rule.customerClass}: ${currencyPerKwh(rule.ratePerKwh)}. Não inclui ${rule.excludes.join(", ")}.`;
  } else if (rule.utility === "water" && rule.referenceValues) {
    details.textContent = `${rule.customerClass}. Referência oficial: preço-base da água ${currency(rule.referenceValues.baseWaterPerM3)}/m³ e serviço básico ${currency(rule.referenceValues.basicService)}. O cálculo real usa ${rule.pricingModel === "exponential-plus-service" ? "fórmula exponencial" : "estrutura regional"}.`;
  } else {
    details.textContent = `${rule.customerClass}. ${rule.note}`;
  }

  const source = document.createElement("p");
  source.className = "note";
  source.textContent = `Fonte: ${rule.source} · vigência a partir de ${formatDate(rule.validFrom)}.`;

  card.append(heading, details, source);

  if (rule.utility === "energy" && rule.automatic && Number.isFinite(rule.ratePerKwh)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "Usar tarifa base no cálculo";
    button.addEventListener("click", () => applyEnergyRate(rule, button));
    card.append(button);
  }
  return card;
}

function applyEnergyRate(rule, button) {
  const input = document.querySelector("#rate");
  const form = document.querySelector("#settings-form");
  if (!input || !form || !Number.isFinite(rule.ratePerKwh)) return;
  input.value = Number(rule.ratePerKwh).toFixed(6);
  button.textContent = "Tarifa preenchida — salve as preferências";
  button.disabled = true;
  document.querySelector("#settings-message").textContent = `Tarifa base de ${rule.provider} preenchida. Confira e salve as preferências de cálculo.`;
  input.focus();
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
  const energyRule = findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
  const waterRule = findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
  const matched = [energyRule, waterRule].filter(Boolean).map((rule) => rule.provider);
  if (matched.length) {
    note.textContent = `Regras locais: ${context.city} · ${context.state} · catálogo validado para ${matched.join(" / ")}. Encargos municipais e tributos permanecem separados.`;
    return;
  }
  const providers = [context.energyProvider, context.waterProvider].filter(Boolean);
  const providerText = providers.length ? ` · ${providers.join(" / ")}` : "";
  note.textContent = `Regras locais: ${context.city} · ${context.state}${providerText}. Valores automáticos só serão aplicados quando houver regra validada para esta localidade.`;
}

function publish(context) {
  const energyRule = findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
  const waterRule = findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
  window.VOLT_LOCALITY_CONTEXT = Object.freeze({
    state: context.state || "",
    city: context.city || "",
    energyProvider: context.energyProvider || "",
    waterProvider: context.waterProvider || "",
    updatedAt: context.updatedAt || null,
    automaticRules: Boolean(energyRule?.automatic || waterRule?.automatic),
    energyRuleId: energyRule?.id || null,
    waterRuleId: waterRule?.id || null
  });
}

function currency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currencyPerKwh(value) {
  return `${currency(value)}/kWh`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}
