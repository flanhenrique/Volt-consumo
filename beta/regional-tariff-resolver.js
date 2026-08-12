import { findNationalEnergyRule, listNationalEnergyProviders } from "./national-energy-catalog.js";
import { findSouthTariffRule } from "./south-tariff-catalog.js";
import { normalizeRegionalContext, formatMoney } from "./mercosur-region.js";
import {
  URUGUAY_TARIFF_CATALOG,
  calculateUteResidentialSimple,
  calculateOseResidentialWater,
  classifyOseZone,
  resolveUruguaySanitation
} from "./uruguay-tariff-catalog.js";

const LOCALITY_KEY = "volt:beta:locality-context-v1";
const MANAUS_COSIP_SOURCE = "Município de Manaus — Lei 2.802/2021 e Decreto 6.036/2024";
const NATIONAL_ENERGY_PROVIDERS = Object.freeze(listNationalEnergyProviders());
const MANAUS_RESIDENTIAL_COSIP = Object.freeze([
  { min: 0, max: 100, amount: 8.53 },
  { min: 101, max: 200, amount: 10.67 },
  { min: 201, max: 300, amount: 21.33 },
  { min: 301, max: 500, amount: 32 },
  { min: 501, max: 1000, amount: 53.33 },
  { min: 1001, max: 1500, amount: 80 },
  { min: 1501, max: 2000, amount: 106.65 },
  { min: 2001, max: Number.POSITIVE_INFINITY, amount: 122.65 }
].map(Object.freeze));

let applyScheduled = false;
let pendingContext = null;
let lastResolutionSignature = "";

queueMicrotask(initializeRegionalTariffResolver);
window.addEventListener("volt:locality-context", (event) => scheduleRegionalTariffs(event.detail));
window.addEventListener("volt:beta-data", () => scheduleRegionalTariffs(readLocality()));

function initializeRegionalTariffResolver() {
  const context = readLocality();
  publishResolverSnapshot(context);
  if (!document.querySelector("#dashboard")?.hidden && hasRegionalData(context)) scheduleRegionalTariffs(context);
}

function hasRegionalData(context) {
  return Boolean(context.state || context.city || context.energyProvider || context.waterProvider);
}

function scheduleRegionalTariffs(raw = readLocality()) {
  pendingContext = raw;
  if (applyScheduled) return;
  applyScheduled = true;
  queueMicrotask(() => {
    applyScheduled = false;
    const context = pendingContext || readLocality();
    pendingContext = null;
    applyRegionalTariffs(context).catch((error) => {
      console.error("Volt: falha ao resolver tarifa regional", error);
    });
  });
}

async function applyRegionalTariffs(raw = readLocality()) {
  const context = normalizeRegionalContext(raw);
  const energyRule = resolveEnergyRule(context);
  const waterRule = resolveWaterRule(context);
  const snapshot = window.VOLT_BETA_API?.getSnapshot?.();
  const energyConsumption = Number(snapshot?.energy?.summary?.consumption || 0);
  const waterConsumption = Number(snapshot?.water?.summary?.consumption || 0);
  const lightingRule = resolveLightingRule(context, energyConsumption);
  const internationalEstimate = resolveInternationalEstimate(context, energyConsumption, energyRule);
  const internationalWaterEstimate = resolveInternationalWaterEstimate(context, waterConsumption, waterRule);

  if (context.country === "BR") applyBrazilAutomaticInputs(energyRule, lightingRule);

  const resolution = publishResolverSnapshot(
    context,
    energyRule,
    waterRule,
    lightingRule,
    internationalEstimate,
    internationalWaterEstimate
  );
  renderRegionalResolution(context, energyRule, waterRule, lightingRule, internationalEstimate, internationalWaterEstimate);

  const signature = buildResolutionSignature(context, energyConsumption, waterConsumption, resolution);
  if (signature === lastResolutionSignature) return;
  lastResolutionSignature = signature;
  window.dispatchEvent(new CustomEvent("volt:tariff-resolution", { detail: structuredClone(resolution) }));
}

function applyBrazilAutomaticInputs(energyRule, lightingRule) {
  const rate = document.querySelector("#rate");
  const lighting = document.querySelector("#lighting-fee");
  const form = document.querySelector("#settings-form");
  if (!form) return;

  let submit = false;
  if (
    energyRule?.automatic
    && Number.isFinite(energyRule.ratePerKwh)
    && rate
    && Math.abs(Number(rate.value || 0) - Number(energyRule.ratePerKwh)) > 0.0000005
  ) {
    rate.value = Number(energyRule.ratePerKwh).toFixed(6);
    submit = true;
  }
  if (
    lightingRule?.automatic
    && Number.isFinite(lightingRule.amount)
    && lighting
    && Math.abs(Number(lighting.value || 0) - Number(lightingRule.amount)) > 0.005
  ) {
    lighting.value = Number(lightingRule.amount).toFixed(2);
    submit = true;
  }
  if (submit) form.requestSubmit();
}

function resolveEnergyRule(context) {
  if (context.country === "UY") {
    return URUGUAY_TARIFF_CATALOG.find((rule) => rule.utility === "energy" && rule.id === context.energyPlan)
      || URUGUAY_TARIFF_CATALOG.find((rule) => rule.id === "uy-ute-trs-2026")
      || null;
  }
  if (context.country !== "BR") return null;
  return findNationalEnergyRule({ provider: context.energyProvider, date: new Date() })
    || findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
}

function resolveWaterRule(context) {
  if (context.country === "UY") {
    return URUGUAY_TARIFF_CATALOG.find((rule) => rule.id === "uy-ose-residencial-2026") || null;
  }
  if (context.country !== "BR") return null;
  return findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
}

function resolveInternationalEstimate(context, kwh, rule) {
  if (context.country !== "UY" || rule?.id !== "uy-ute-trs-2026") return null;
  const estimate = calculateUteResidentialSimple(kwh, context.contractedPowerKw);
  return Object.freeze({ ...estimate, consumptionKwh: kwh, planId: rule.id });
}

function resolveInternationalWaterEstimate(context, m3, rule) {
  if (context.country !== "UY" || rule?.id !== "uy-ose-residencial-2026") return null;
  const zone = classifyOseZone({ department: context.state, city: context.city, zone: context.oseZone });
  const estimate = calculateOseResidentialWater({
    consumptionM3: m3,
    zone,
    connectionDiameterMm: context.oseConnectionDiameterMm,
    annualAverageM3: context.oseAnnualAverageM3
  });
  const sanitation = resolveUruguaySanitation({
    department: context.state,
    city: context.city,
    enabled: Boolean(context.oseSanitation)
  });
  return Object.freeze({
    ...estimate,
    consumptionM3: m3,
    ruleId: rule.id,
    sanitationDeclared: Boolean(context.oseSanitation),
    sanitation,
    sanitationStatus: sanitation.enabled ? sanitation.reason : "not-declared"
  });
}

function resolveLightingRule(context, consumption) {
  if (context.country !== "BR") return null;
  const state = String(context.state || "").trim().toUpperCase();
  const city = normalize(context.city);
  const kwh = Math.max(0, Math.floor(Number(consumption) || 0));
  if (state !== "AM" || city !== "manaus") return null;
  const band = MANAUS_RESIDENTIAL_COSIP.find((item) => kwh >= item.min && kwh <= item.max);
  if (!band) return null;
  return {
    id: `BR:AM:manaus:cosip:${band.min}-${Number.isFinite(band.max) ? band.max : "mais"}`,
    utility: "lighting",
    provider: "Município de Manaus",
    customerClass: "Residencial comum",
    pricingModel: "consumption-band-fixed-amount",
    consumptionKwh: kwh,
    minKwh: band.min,
    maxKwh: Number.isFinite(band.max) ? band.max : null,
    amount: band.amount,
    automatic: true,
    source: MANAUS_COSIP_SOURCE
  };
}

function publishResolverSnapshot(
  context,
  energyRule = resolveEnergyRule(context),
  waterRule = resolveWaterRule(context),
  lightingRule = resolveLightingRule(context, Number(window.VOLT_BETA_API?.getSnapshot?.()?.energy?.summary?.consumption || 0)),
  internationalEstimate = resolveInternationalEstimate(
    normalizeRegionalContext(context),
    Number(window.VOLT_BETA_API?.getSnapshot?.()?.energy?.summary?.consumption || 0),
    energyRule
  ),
  internationalWaterEstimate = resolveInternationalWaterEstimate(
    normalizeRegionalContext(context),
    Number(window.VOLT_BETA_API?.getSnapshot?.()?.water?.summary?.consumption || 0),
    waterRule
  )
) {
  const normalized = normalizeRegionalContext(context);
  const resolution = Object.freeze({
    jurisdiction: normalized.jurisdiction,
    country: normalized.country,
    currency: normalized.currency,
    locale: normalized.locale,
    locality: Object.freeze({
      state: normalized.state,
      city: normalized.city,
      energyProvider: normalized.energyProvider,
      waterProvider: normalized.waterProvider,
      energyPlan: normalized.energyPlan,
      contractedPowerKw: normalized.contractedPowerKw,
      oseZone: normalized.oseZone,
      oseConnectionDiameterMm: normalized.oseConnectionDiameterMm,
      oseAnnualAverageM3: normalized.oseAnnualAverageM3,
      oseSanitation: normalized.oseSanitation
    }),
    energy: energyRule ? freezeRule(energyRule) : null,
    water: waterRule ? freezeRule(waterRule) : null,
    lighting: lightingRule ? Object.freeze({ ...lightingRule }) : null,
    internationalEstimate: internationalEstimate ? Object.freeze({ ...internationalEstimate }) : null,
    internationalWaterEstimate: internationalWaterEstimate ? Object.freeze({ ...internationalWaterEstimate }) : null,
    energyProviderCatalog: normalized.country === "BR"
      ? NATIONAL_ENERGY_PROVIDERS
      : normalized.country === "UY"
        ? Object.freeze(["UTE"])
        : Object.freeze([])
  });
  window.VOLT_TARIFF_RESOLUTION = resolution;
  return resolution;
}

function buildResolutionSignature(context, energyConsumption, waterConsumption, resolution) {
  return [
    context.country,
    context.state,
    context.city,
    context.energyProvider,
    context.waterProvider,
    context.energyPlan,
    context.contractedPowerKw,
    context.oseZone,
    context.oseConnectionDiameterMm,
    context.oseAnnualAverageM3,
    context.oseSanitation,
    energyConsumption,
    waterConsumption,
    resolution.energy?.id || "",
    resolution.water?.id || "",
    resolution.lighting?.amount ?? "",
    resolution.internationalEstimate?.totalWithVat ?? "",
    resolution.internationalWaterEstimate?.totalWaterWithVat ?? "",
    resolution.internationalWaterEstimate?.sanitationStatus || ""
  ].join("|");
}

function renderRegionalResolution(context, energyRule, waterRule, lightingRule, energyEstimate, waterEstimate) {
  const status = document.querySelector("#beta-locality-status");
  if (!status || !context.state || !context.city) return;

  if (context.country === "UY") {
    const energyText = energyRule
      ? `Energía: UTE · ${energyRule.customerClass}.`
      : "Energía: tarifa UTE no identificada.";
    const estimateText = energyEstimate?.valid
      ? `Total con IVA aplicable: ${formatMoney(energyEstimate.totalWithVat, context)}.`
      : energyRule?.id === "uy-ute-trs-2026"
        ? "Informe la potencia contratada para calcular UTE."
        : "La tarifa horaria requiere consumo por franja.";
    const waterText = waterEstimate?.valid
      ? `Agua OSE: ${waterEstimate.consumptionM3.toLocaleString("es-UY")} m³ · total con IVA aplicable ${formatMoney(waterEstimate.totalWaterWithVat, context)}${waterEstimate.sanitationDeclared ? ` · saneamiento pendiente (${waterEstimate.sanitation?.provider || "prestador por definir"})` : ""}.`
      : "Agua OSE: faltan una zona tarifaria modelada o el diámetro de conexión.";
    status.textContent = `${context.city} · ${context.state} · piloto Uruguay. ${energyText} ${estimateText} ${waterText}`;
    return;
  }

  if (context.country !== "BR") {
    status.textContent = `${context.jurisdiction}. País preparado na arquitetura, mas regras tarifárias ainda não estão ativadas.`;
    return;
  }

  const energyText = energyRule?.automatic && Number.isFinite(energyRule.ratePerKwh)
    ? `Energia: ${energyRule.provider} · tarifa-base oficial ${currencyPerKwh(energyRule.ratePerKwh, context)} aplicada.`
    : context.energyProvider
      ? `Energia: ${context.energyProvider} · sem tarifa automática validada; mantendo valor manual.`
      : "Energia: concessionária não informada.";
  const lightingText = lightingRule?.automatic
    ? `Iluminação pública: ${lightingRule.consumptionKwh} kWh · ${formatMoney(lightingRule.amount, context)} aplicada.`
    : "Iluminação pública: mantendo valor manual.";
  const waterText = waterRule
    ? `Água: ${waterRule.provider} · regra regional identificada.`
    : context.waterProvider
      ? `Água: ${context.waterProvider} · sem regra tarifária local modelada.`
      : "Água: concessionária não informada.";
  status.textContent = `${context.city} · ${context.state}. ${energyText} ${lightingText} ${waterText}`;
}

function readLocality() {
  try {
    return normalizeRegionalContext(JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}"));
  } catch {
    return normalizeRegionalContext({});
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
    components: rule.components ? Object.freeze({ ...rule.components }) : null,
    energyTiers: rule.energyTiers ? Object.freeze(rule.energyTiers.map((tier) => Object.freeze({ ...tier }))) : null,
    contractedPowerRatePerKw: Number.isFinite(rule.contractedPowerRatePerKw) ? rule.contractedPowerRatePerKw : null,
    fixedMonthlyCharge: Number.isFinite(rule.fixedMonthlyCharge) ? rule.fixedMonthlyCharge : null
  });
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function currencyPerKwh(value, context) {
  return `${Number(value || 0).toLocaleString(context.locale || "pt-BR", {
    style: "currency",
    currency: context.currency || "BRL",
    minimumFractionDigits: 5,
    maximumFractionDigits: 5
  })}/kWh`;
}
