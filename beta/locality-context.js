import { findSouthTariffRule, listSouthTariffRulesForState } from "./south-tariff-catalog.js";
import { MERCOSUR_COUNTRIES, getCountry, normalizeRegionalContext, formatMoney } from "./mercosur-region.js";

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
    <div class="settings-row"><div><h3 id="beta-locality-title">Região e concessionárias</h3><small>Base regional para regras de energia e água.</small></div></div>
    <form id="beta-locality-form" class="form compact-form">
      <label><span>País</span><select id="beta-locality-country" required>${MERCOSUR_COUNTRIES.map((item) => `<option value="${item.code}" ${item.enabled ? "" : "disabled"}>${item.name}${item.enabled ? "" : " — em preparação"}</option>`).join("")}</select></label>
      <label><span id="beta-subdivision-label">UF</span><select id="beta-locality-state" required><option value="">Selecione</option>${BRAZIL_STATES.map(([uf,name]) => `<option value="${uf}">${uf} — ${name}</option>`).join("")}</select></label>
      <label><span id="beta-city-label">Município</span><input id="beta-locality-city" type="text" maxlength="80" autocomplete="address-level2" placeholder="Ex.: Porto Alegre" required></label>
      <label><span>Concessionária de energia</span><input id="beta-locality-energy-provider" type="text" maxlength="120" list="beta-energy-provider-options" placeholder="Informe conforme sua fatura"></label>
      <label><span>Concessionária de água</span><input id="beta-locality-water-provider" type="text" maxlength="120" list="beta-water-provider-options" placeholder="Informe conforme sua fatura"></label>
      <datalist id="beta-energy-provider-options"></datalist><datalist id="beta-water-provider-options"></datalist>
      <button class="secondary-button" type="submit">Salvar região</button>
      <p id="beta-locality-status" class="note status-message full-row" role="status" aria-live="polite"></p>
    </form>
    <div id="beta-regional-tariff-rules" class="full-row" aria-live="polite"></div>
    <p class="note">A arquitetura do Volt já considera país, moeda, idioma e jurisdição. Nesta fase, somente o Brasil aplica regras automáticas; os demais países do Mercosul permanecem desativados até validação tarifária oficial.</p>`;

  const cycleSection = settingsPage.querySelector("#beta-cycle-form")?.closest("section.settings-group");
  if (cycleSection) cycleSection.before(section); else settingsPage.append(section);

  const form = section.querySelector("#beta-locality-form");
  const country = section.querySelector("#beta-locality-country");
  const state = section.querySelector("#beta-locality-state");
  const city = section.querySelector("#beta-locality-city");
  const energyProvider = section.querySelector("#beta-locality-energy-provider");
  const waterProvider = section.querySelector("#beta-locality-water-provider");
  const status = section.querySelector("#beta-locality-status");

  const saved = readLocality();
  country.value = saved.country || "BR";
  state.value = saved.state || "";
  city.value = saved.city || "";
  energyProvider.value = saved.energyProvider || "";
  waterProvider.value = saved.waterProvider || "";
  updateLabels(country.value, section);
  updateProviderOptions(country.value, state.value, section);
  updateStatus(saved, status);
  publish(saved);
  renderRegionalRules(saved, section);

  country.addEventListener("change", () => {
    updateLabels(country.value, section);
    updateProviderOptions(country.value, state.value, section);
  });
  state.addEventListener("change", () => {
    updateProviderOptions(country.value, state.value, section);
    renderRegionalRules(currentFormContext(), section);
  });
  energyProvider.addEventListener("input", () => renderRegionalRules(currentFormContext(), section));
  waterProvider.addEventListener("input", () => renderRegionalRules(currentFormContext(), section));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedCountry = getCountry(country.value);
    if (!selectedCountry.enabled) {
      status.textContent = `${selectedCountry.name} ainda está em preparação. Nenhuma regra tarifária foi ativada.`;
      return;
    }
    const next = normalizeRegionalContext({
      country: country.value,
      state: state.value,
      city: city.value,
      energyProvider: energyProvider.value,
      waterProvider: waterProvider.value,
      updatedAt: new Date().toISOString()
    });
    if (!next.state || !next.city) {
      status.textContent = `Informe ${selectedCountry.subdivisionLabel} e ${selectedCountry.cityLabel.toLowerCase()} para definir a jurisdição.`;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    updateStatus(next, status);
    publish(next);
    renderRegionalRules(next, section);
    window.dispatchEvent(new CustomEvent("volt:locality-context", { detail: structuredClone(next) }));
  });

  function currentFormContext() {
    return normalizeRegionalContext({ country: country.value, state: state.value, city: city.value, energyProvider: energyProvider.value, waterProvider: waterProvider.value });
  }
}

function updateLabels(countryCode, section) {
  const country = getCountry(countryCode);
  section.querySelector("#beta-subdivision-label").textContent = country.subdivisionLabel;
  section.querySelector("#beta-city-label").textContent = country.cityLabel;
}

function updateProviderOptions(countryCode, state, section) {
  const energyList = section.querySelector("#beta-energy-provider-options");
  const waterList = section.querySelector("#beta-water-provider-options");
  const rules = countryCode === "BR" ? listSouthTariffRulesForState(state) : [];
  energyList.replaceChildren(...uniqueOptions(rules.filter((rule) => rule.utility === "energy").map((rule) => rule.provider)));
  waterList.replaceChildren(...uniqueOptions(rules.filter((rule) => rule.utility === "water").map((rule) => rule.provider)));
}

function uniqueOptions(values) {
  return [...new Set(values)].map((value) => { const option = document.createElement("option"); option.value = value; return option; });
}

function renderRegionalRules(context, section) {
  const container = section.querySelector("#beta-regional-tariff-rules");
  if (!container) return;
  container.replaceChildren();
  if (context.country !== "BR" || !context.state || !["PR", "SC", "RS"].includes(String(context.state).toUpperCase())) return;
  const energyRule = findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
  const waterRule = findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
  if (!energyRule && !waterRule) return;
  for (const rule of [energyRule, waterRule].filter(Boolean)) container.append(buildRuleCard(rule, context));
}

function buildRuleCard(rule, context) {
  const card = document.createElement("article");
  card.className = "card tariff-info-card regional-tariff-card";
  const title = document.createElement("h3");
  title.textContent = `${rule.utility === "energy" ? "Energia" : "Água"} · ${rule.provider}`;
  const details = document.createElement("p");
  details.className = "note";
  if (rule.utility === "energy" && Number.isFinite(rule.ratePerKwh)) details.textContent = `${rule.customerClass}: ${formatMoney(rule.ratePerKwh, context)}/kWh. Não inclui ${rule.excludes.join(", ")}.`;
  else details.textContent = `${rule.customerClass}. ${rule.note}`;
  const source = document.createElement("p");
  source.className = "note";
  source.textContent = `Fonte: ${rule.source} · vigência a partir de ${formatDate(rule.validFrom, context.locale)}.`;
  card.append(title, details, source);
  return card;
}

function readLocality() {
  try { return normalizeRegionalContext(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")); }
  catch { return normalizeRegionalContext({}); }
}

function updateStatus(context, status) {
  if (!context.state || !context.city) {
    status.textContent = "Região ainda não configurada. Regras automáticas permanecem desativadas.";
    return;
  }
  const country = getCountry(context.country);
  status.textContent = `${country.name} · ${context.city} · ${context.state}. Jurisdição: ${context.jurisdiction}. Moeda: ${context.currency}.`;
}

function publish(context) {
  const normalized = normalizeRegionalContext(context);
  const energyRule = normalized.country === "BR" ? findSouthTariffRule({ state: normalized.state, utility: "energy", provider: normalized.energyProvider }) : null;
  const waterRule = normalized.country === "BR" ? findSouthTariffRule({ state: normalized.state, utility: "water", provider: normalized.waterProvider }) : null;
  window.VOLT_LOCALITY_CONTEXT = Object.freeze({
    ...normalized,
    automaticRules: Boolean(energyRule?.automatic || waterRule?.automatic),
    energyRuleId: energyRule?.id || null,
    waterRuleId: waterRule?.id || null
  });
  window.VOLT_REGION_CONTEXT = Object.freeze({ ...normalized });
}

function formatDate(value, locale = "pt-BR") {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
}
