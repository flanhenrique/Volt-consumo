import { findNationalEnergyRule, listNationalEnergyProviders } from "./national-energy-catalog.js";
import { findSouthTariffRule } from "./south-tariff-catalog.js";

const LOCALITY_KEY = "volt:beta:locality-context-v1";

queueMicrotask(initializeRegionalTariffResolver);
window.addEventListener("volt:locality-context", (event) => applyRegionalTariffs(event.detail));
window.addEventListener("volt:beta-data", () => applyRegionalTariffs(readLocality()));

function initializeRegionalTariffResolver() {
  const context = readLocality();
  publishResolverSnapshot(context);
  if (!document.querySelector("#dashboard")?.hidden && (context.state || context.city || context.energyProvider || context.waterProvider)) {
    applyRegionalTariffs(context);
  }
}

async function applyRegionalTariffs(context = readLocality()) {
  const energyRule = resolveEnergyRule(context);
  const waterRule = resolveWaterRule(context);

  if (energyRule?.automatic && Number.isFinite(energyRule.ratePerKwh)) {
    const rateInput = document.querySelector("#rate");
    const form = document.querySelector("#settings-form");
    const currentRate = Number(rateInput?.value || 0);
    if (rateInput && form && Math.abs(currentRate - Number(energyRule.ratePerKwh)) > 0.0000005) {
      rateInput.value = Number(energyRule.ratePerKwh).toFixed(6);
      form.requestSubmit();
    }
  }

  publishResolverSnapshot(context, energyRule, waterRule);
  renderRegionalResolution(context, energyRule, waterRule);
  window.dispatchEvent(new CustomEvent("volt:tariff-resolution", {
    detail: structuredClone(window.VOLT_TARIFF_RESOLUTION)
  }));
}

function resolveEnergyRule(context) {
  return findNationalEnergyRule({ provider: context.energyProvider, date: new Date() })
    || findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
}

function resolveWaterRule(context) {
  return findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
}

function publishResolverSnapshot(context, energyRule = resolveEnergyRule(context), waterRule = resolveWaterRule(context)) {
  window.VOLT_TARIFF_RESOLUTION = Object.freeze({
    locality: Object.freeze({
      state: context.state || "",
      city: context.city || "",
      energyProvider: context.energyProvider || "",
      waterProvider: context.waterProvider || ""
    }),
    energy: energyRule ? freezeRule(energyRule) : null,
    water: waterRule ? freezeRule(waterRule) : null,
    energyProviderCatalog: Object.freeze(listNationalEnergyProviders())
  });
}

function renderRegionalResolution(context, energyRule, waterRule) {
  const status = document.querySelector("#beta-locality-status");
  if (!status || !context.state || !context.city) return;

  const energyText = energyRule?.automatic && Number.isFinite(energyRule.ratePerKwh)
    ? `Energia: ${energyRule.provider} · tarifa-base oficial ${currencyPerKwh(energyRule.ratePerKwh)} aplicada.`
    : context.energyProvider
      ? `Energia: ${context.energyProvider} · sem tarifa automática validada; mantendo valor manual.`
      : "Energia: concessionária não informada.";

  const waterText = waterRule
    ? `Água: ${waterRule.provider} · regra regional identificada (${waterRule.pricingModel || "modelo local"}).`
    : context.waterProvider
      ? `Água: ${context.waterProvider} · sem regra tarifária local modelada; mantendo configuração manual.`
      : "Água: concessionária não informada.";

  status.textContent = `${context.city} · ${context.state}. ${energyText} ${waterText}`;
}

function readLocality() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function freezeRule(rule) {
  return Object.freeze({
    id: rule.id,
    provider: rule.provider,
    customerClass: rule.customerClass,
    validFrom: rule.validFrom || null,
    validUntil: rule.validUntil || null,
    ratePerKwh: Number.isFinite(rule.ratePerKwh) ? Number(rule.ratePerKwh) : null,
    automatic: Boolean(rule.automatic),
    pricingModel: rule.pricingModel || null,
    source: rule.source || "",
    sourceUrl: rule.sourceUrl || "",
    components: rule.components ? Object.freeze({ ...rule.components }) : null
  });
}

function currencyPerKwh(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 5, maximumFractionDigits: 5 })}/kWh`;
}
