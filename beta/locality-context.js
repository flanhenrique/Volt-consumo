import { findSouthTariffRule, listSouthTariffRulesForState } from "./south-tariff-catalog.js";
import { MERCOSUR_COUNTRIES, getCountry, normalizeRegionalContext, formatMoney } from "./mercosur-region.js";
import { listUruguayProviders, listUruguayTariffRules } from "./uruguay-tariff-catalog.js";

const STORAGE_KEY = "volt:beta:locality-context-v1";
const BRAZIL_STATES = [
  ["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],["CE","Ceará"],["DF","Distrito Federal"],["ES","Espírito Santo"],["GO","Goiás"],["MA","Maranhão"],["MT","Mato Grosso"],["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],["PE","Pernambuco"],["PI","Piauí"],["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],["RS","Rio Grande do Sul"],["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],["SE","Sergipe"],["TO","Tocantins"]
];
const URUGUAY_DEPARTMENTS = [
  ["AR","Artigas"],["CA","Canelones"],["CL","Cerro Largo"],["CO","Colonia"],["DU","Durazno"],["FS","Flores"],["FD","Florida"],["LA","Lavalleja"],["MA","Maldonado"],["MO","Montevideo"],["PA","Paysandú"],["RN","Río Negro"],["RV","Rivera"],["RO","Rocha"],["SA","Salto"],["SJ","San José"],["SO","Soriano"],["TA","Tacuarembó"],["TT","Treinta y Tres"]
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
      <label><span>País</span><select id="beta-locality-country" required>${MERCOSUR_COUNTRIES.map((item) => `<option value="${item.code}" ${item.enabled ? "" : "disabled"}>${item.name}${item.pilot ? " — piloto" : item.enabled ? "" : " — em preparação"}</option>`).join("")}</select></label>
      <label><span id="beta-subdivision-label">UF</span><select id="beta-locality-state" required></select></label>
      <label><span id="beta-city-label">Município</span><input id="beta-locality-city" type="text" maxlength="80" autocomplete="address-level2" placeholder="Ex.: Porto Alegre" required></label>
      <label><span>Concessionária de energia</span><input id="beta-locality-energy-provider" type="text" maxlength="120" list="beta-energy-provider-options" placeholder="Informe conforme sua fatura"></label>
      <label><span>Concessionária de água</span><input id="beta-locality-water-provider" type="text" maxlength="120" list="beta-water-provider-options" placeholder="Informe conforme sua fatura"></label>
      <datalist id="beta-energy-provider-options"></datalist><datalist id="beta-water-provider-options"></datalist>
      <div id="beta-uruguay-energy-options" class="full-row" hidden>
        <div class="form compact-form">
          <label><span>Tarifa UTE</span><select id="beta-uy-energy-plan"></select></label>
          <label><span>Potência contratada (kW)</span><input id="beta-uy-contracted-power" type="number" min="0.1" step="0.1" inputmode="decimal" placeholder="Ex.: 3,7"></label>
          <p class="note full-row">No piloto uruguaio, o Volt calcula automaticamente apenas a Tarifa Residencial Simple. Tarifas por horário permanecem identificadas, mas não são reduzidas a um único valor por kWh.</p>
        </div>
      </div>
      <button class="secondary-button" type="submit">Salvar região</button>
      <p id="beta-locality-status" class="note status-message full-row" role="status" aria-live="polite"></p>
    </form>
    <div id="beta-regional-tariff-rules" class="full-row" aria-live="polite"></div>
    <p class="note">Brasil permanece com as regras atuais. Uruguai está liberado somente na Beta como piloto tarifário controlado; Paraguai, Argentina e Bolívia continuam desativados até validação oficial.</p>`;

  const cycleSection = settingsPage.querySelector("#beta-cycle-form")?.closest("section.settings-group");
  if (cycleSection) cycleSection.before(section); else settingsPage.append(section);

  const form = section.querySelector("#beta-locality-form");
  const country = section.querySelector("#beta-locality-country");
  const state = section.querySelector("#beta-locality-state");
  const city = section.querySelector("#beta-locality-city");
  const energyProvider = section.querySelector("#beta-locality-energy-provider");
  const waterProvider = section.querySelector("#beta-locality-water-provider");
  const energyPlan = section.querySelector("#beta-uy-energy-plan");
  const contractedPower = section.querySelector("#beta-uy-contracted-power");
  const status = section.querySelector("#beta-locality-status");

  const saved = readLocality();
  country.value = saved.country || "BR";
  updateCountryUi(country.value, section, saved.state);
  state.value = saved.state || "";
  city.value = saved.city || "";
  energyProvider.value = saved.energyProvider || defaultEnergyProvider(country.value);
  waterProvider.value = saved.waterProvider || defaultWaterProvider(country.value);
  energyPlan.value = saved.energyPlan || "uy-ute-trs-2026";
  contractedPower.value = saved.contractedPowerKw || "";
  updateProviderOptions(country.value, state.value, section);
  updateStatus(saved, status);
  publish(saved);
  renderRegionalRules(saved, section);

  country.addEventListener("change", () => {
    updateCountryUi(country.value, section, "");
    energyProvider.value = defaultEnergyProvider(country.value);
    waterProvider.value = defaultWaterProvider(country.value);
    energyPlan.value = country.value === "UY" ? "uy-ute-trs-2026" : "";
    contractedPower.value = "";
    updateProviderOptions(country.value, state.value, section);
    renderRegionalRules(currentFormContext(), section);
  });
  state.addEventListener("change", () => {
    updateProviderOptions(country.value, state.value, section);
    renderRegionalRules(currentFormContext(), section);
  });
  energyProvider.addEventListener("input", () => renderRegionalRules(currentFormContext(), section));
  waterProvider.addEventListener("input", () => renderRegionalRules(currentFormContext(), section));
  energyPlan.addEventListener("change", () => renderRegionalRules(currentFormContext(), section));
  contractedPower.addEventListener("input", () => renderRegionalRules(currentFormContext(), section));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedCountry = getCountry(country.value);
    if (!selectedCountry.enabled) {
      status.textContent = `${selectedCountry.name} ainda está em preparação. Nenhuma regra tarifária foi ativada.`;
      return;
    }
    const next = currentFormContext();
    if (!next.state || !next.city) {
      status.textContent = `Informe ${selectedCountry.subdivisionLabel} e ${selectedCountry.cityLabel.toLowerCase()} para definir a jurisdição.`;
      return;
    }
    if (next.country === "UY" && next.energyPlan === "uy-ute-trs-2026" && !next.contractedPowerKw) {
      status.textContent = "Informe a potência contratada da UTE para calcular corretamente a Tarifa Residencial Simple.";
      contractedPower.focus();
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    updateStatus(next, status);
    publish(next);
    renderRegionalRules(next, section);
    window.dispatchEvent(new CustomEvent("volt:locality-context", { detail: structuredClone(next) }));
  });

  function currentFormContext() {
    return normalizeRegionalContext({
      country: country.value,
      state: state.value,
      city: city.value,
      energyProvider: energyProvider.value,
      waterProvider: waterProvider.value,
      energyPlan: country.value === "UY" ? energyPlan.value : "",
      contractedPowerKw: country.value === "UY" ? contractedPower.value : null,
      updatedAt: new Date().toISOString()
    });
  }
}

function updateCountryUi(countryCode, section, selectedState = "") {
  const country = getCountry(countryCode);
  section.querySelector("#beta-subdivision-label").textContent = country.subdivisionLabel;
  section.querySelector("#beta-city-label").textContent = country.cityLabel;
  const state = section.querySelector("#beta-locality-state");
  const options = country.code === "UY" ? URUGUAY_DEPARTMENTS : BRAZIL_STATES;
  state.replaceChildren(makeOption("", "Selecione"), ...options.map(([code, name]) => makeOption(code, `${code} — ${name}`)));
  if (selectedState && options.some(([code]) => code === selectedState)) state.value = selectedState;
  const city = section.querySelector("#beta-locality-city");
  city.placeholder = country.code === "UY" ? "Ex.: Montevideo" : "Ex.: Porto Alegre";
  section.querySelector("#beta-uruguay-energy-options").hidden = country.code !== "UY";
  const plan = section.querySelector("#beta-uy-energy-plan");
  plan.replaceChildren(...listUruguayTariffRules("energy").map((rule) => makeOption(rule.id, rule.customerClass)));
}

function updateProviderOptions(countryCode, state, section) {
  const energyList = section.querySelector("#beta-energy-provider-options");
  const waterList = section.querySelector("#beta-water-provider-options");
  if (countryCode === "UY") {
    energyList.replaceChildren(...listUruguayProviders("energy").map((value) => makeOption(value, value)));
    waterList.replaceChildren(...listUruguayProviders("water").map((value) => makeOption(value, value)));
    return;
  }
  const rules = listSouthTariffRulesForState(state);
  energyList.replaceChildren(...uniqueOptions(rules.filter((rule) => rule.utility === "energy").map((rule) => rule.provider)));
  waterList.replaceChildren(...uniqueOptions(rules.filter((rule) => rule.utility === "water").map((rule) => rule.provider)));
}

function defaultEnergyProvider(countryCode) { return countryCode === "UY" ? "UTE" : ""; }
function defaultWaterProvider(countryCode) { return countryCode === "UY" ? "OSE" : ""; }
function makeOption(value, label) { const option = document.createElement("option"); option.value = value; option.textContent = label; return option; }
function uniqueOptions(values) { return [...new Set(values)].map((value) => makeOption(value, value)); }

function renderRegionalRules(context, section) {
  const container = section.querySelector("#beta-regional-tariff-rules");
  if (!container) return;
  container.replaceChildren();
  if (context.country === "UY") {
    const plan = listUruguayTariffRules("energy").find((rule) => rule.id === context.energyPlan) || listUruguayTariffRules("energy")[0];
    const water = listUruguayTariffRules("water")[0];
    if (plan) container.append(buildUruguayRuleCard(plan, context));
    if (water) container.append(buildUruguayRuleCard(water, context));
    return;
  }
  if (context.country !== "BR" || !context.state || !["PR", "SC", "RS"].includes(String(context.state).toUpperCase())) return;
  const energyRule = findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
  const waterRule = findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
  for (const rule of [energyRule, waterRule].filter(Boolean)) container.append(buildRuleCard(rule, context));
}

function buildUruguayRuleCard(rule, context) {
  const card = document.createElement("article");
  card.className = "card tariff-info-card regional-tariff-card";
  const title = document.createElement("h3");
  title.textContent = `${rule.utility === "energy" ? "Energía" : "Agua"} · ${rule.provider}`;
  const details = document.createElement("p");
  details.className = "note";
  if (rule.id === "uy-ute-trs-2026") {
    const tiers = rule.energyTiers.map((tier) => `${tier.minKwh}${tier.maxKwh ? `–${tier.maxKwh}` : "+"} kWh: ${formatMoney(tier.ratePerKwh, context)}/kWh`).join(" · ");
    details.textContent = `${rule.customerClass}. ${tiers}. Cargo fijo ${formatMoney(rule.fixedMonthlyCharge, context)} + potencia ${formatMoney(rule.contractedPowerRatePerKw, context)}/kW. Valores sin IVA.`;
  } else {
    details.textContent = `${rule.customerClass}. ${rule.note || "Regla oficial identificada; cálculo automático todavía no habilitado."}`;
  }
  const source = document.createElement("p");
  source.className = "note";
  source.textContent = `Fuente: ${rule.source}.`;
  card.append(title, details, source);
  return card;
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
  const pilot = country.pilot ? " · piloto Beta" : "";
  status.textContent = `${country.name}${pilot} · ${context.city} · ${context.state}. Jurisdição: ${context.jurisdiction}. Moeda: ${context.currency}.`;
}

function publish(context) {
  const normalized = normalizeRegionalContext(context);
  const energyRule = normalized.country === "BR" ? findSouthTariffRule({ state: normalized.state, utility: "energy", provider: normalized.energyProvider }) : null;
  const waterRule = normalized.country === "BR" ? findSouthTariffRule({ state: normalized.state, utility: "water", provider: normalized.waterProvider }) : null;
  window.VOLT_LOCALITY_CONTEXT = Object.freeze({
    ...normalized,
    automaticRules: Boolean(energyRule?.automatic || waterRule?.automatic || normalized.country === "UY"),
    energyRuleId: normalized.country === "UY" ? normalized.energyPlan || null : energyRule?.id || null,
    waterRuleId: normalized.country === "UY" ? "uy-ose-residencial-2026" : waterRule?.id || null
  });
  window.VOLT_REGION_CONTEXT = Object.freeze({ ...normalized });
}

function formatDate(value, locale = "pt-BR") {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale);
}
