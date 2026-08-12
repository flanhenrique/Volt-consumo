import { findNationalEnergyRule, listNationalEnergyProviders } from "./national-energy-catalog.js";
import { findSouthTariffRule } from "./south-tariff-catalog.js";
import { normalizeRegionalContext, formatMoney } from "./mercosur-region.js";
import { URUGUAY_TARIFF_CATALOG, calculateUteResidentialSimple } from "./uruguay-tariff-catalog.js";

const LOCALITY_KEY = "volt:beta:locality-context-v1";
const MANAUS_COSIP_SOURCE = "Município de Manaus — Lei 2.802/2021 e Decreto 6.036/2024";
const MANAUS_RESIDENTIAL_COSIP = Object.freeze([
  Object.freeze({ min: 0, max: 100, amount: 8.53 }), Object.freeze({ min: 101, max: 200, amount: 10.67 }), Object.freeze({ min: 201, max: 300, amount: 21.33 }), Object.freeze({ min: 301, max: 500, amount: 32.00 }), Object.freeze({ min: 501, max: 1000, amount: 53.33 }), Object.freeze({ min: 1001, max: 1500, amount: 80.00 }), Object.freeze({ min: 1501, max: 2000, amount: 106.65 }), Object.freeze({ min: 2001, max: Number.POSITIVE_INFINITY, amount: 122.65 })
]);

queueMicrotask(initializeRegionalTariffResolver);
window.addEventListener("volt:locality-context", (event) => applyRegionalTariffs(event.detail));
window.addEventListener("volt:beta-data", () => applyRegionalTariffs(readLocality()));

function initializeRegionalTariffResolver() {
  const context = readLocality();
  publishResolverSnapshot(context);
  if (!document.querySelector("#dashboard")?.hidden && hasRegionalData(context)) applyRegionalTariffs(context);
}

function hasRegionalData(context) { return Boolean(context.state || context.city || context.energyProvider || context.waterProvider); }

async function applyRegionalTariffs(rawContext = readLocality()) {
  const context = normalizeRegionalContext(rawContext);
  const energyRule = resolveEnergyRule(context);
  const waterRule = resolveWaterRule(context);
  const snapshot = window.VOLT_BETA_API?.getSnapshot?.();
  const consumption = Number(snapshot?.energy?.summary?.consumption || 0);
  const lightingRule = resolveLightingRule(context, consumption);
  const internationalEstimate = resolveInternationalEstimate(context, consumption, energyRule);

  if (context.country === "BR") {
    const rateInput = document.querySelector("#rate");
    const lightingInput = document.querySelector("#lighting-fee");
    const form = document.querySelector("#settings-form");
    let needsSubmit = false;
    if (energyRule?.automatic && Number.isFinite(energyRule.ratePerKwh) && rateInput && form) {
      const currentRate = Number(rateInput.value || 0);
      if (Math.abs(currentRate - Number(energyRule.ratePerKwh)) > 0.0000005) { rateInput.value = Number(energyRule.ratePerKwh).toFixed(6); needsSubmit = true; }
    }
    if (lightingRule?.automatic && Number.isFinite(lightingRule.amount) && lightingInput && form) {
      const currentLighting = Number(lightingInput.value || 0);
      if (Math.abs(currentLighting - Number(lightingRule.amount)) > 0.005) { lightingInput.value = Number(lightingRule.amount).toFixed(2); needsSubmit = true; }
    }
    if (needsSubmit && form) form.requestSubmit();
  }

  publishResolverSnapshot(context, energyRule, waterRule, lightingRule, internationalEstimate);
  renderRegionalResolution(context, energyRule, waterRule, lightingRule, internationalEstimate);
  window.dispatchEvent(new CustomEvent("volt:tariff-resolution", { detail: structuredClone(window.VOLT_TARIFF_RESOLUTION) }));
}

function resolveEnergyRule(context) {
  if (context.country === "UY") return URUGUAY_TARIFF_CATALOG.find((rule) => rule.utility === "energy" && rule.id === context.energyPlan) || URUGUAY_TARIFF_CATALOG.find((rule) => rule.id === "uy-ute-trs-2026") || null;
  if (context.country !== "BR") return null;
  return findNationalEnergyRule({ provider: context.energyProvider, date: new Date() }) || findSouthTariffRule({ state: context.state, utility: "energy", provider: context.energyProvider });
}

function resolveWaterRule(context) {
  if (context.country === "UY") return URUGUAY_TARIFF_CATALOG.find((rule) => rule.id === "uy-ose-residencial-2026") || null;
  if (context.country !== "BR") return null;
  return findSouthTariffRule({ state: context.state, utility: "water", provider: context.waterProvider });
}

function resolveInternationalEstimate(context, consumption, energyRule) {
  if (context.country !== "UY" || energyRule?.id !== "uy-ute-trs-2026") return null;
  const result = calculateUteResidentialSimple(consumption, context.contractedPowerKw);
  return result.valid ? Object.freeze({ ...result, consumptionKwh: consumption, planId: energyRule.id }) : Object.freeze({ ...result, consumptionKwh: consumption, planId: energyRule.id });
}

function resolveLightingRule(context, consumption) {
  if (context.country !== "BR") return null;
  const state = String(context.state || "").trim().toUpperCase();
  const city = normalize(context.city);
  const kwh = Math.max(0, Math.floor(Number(consumption) || 0));
  if (state !== "AM" || city !== "manaus") return null;
  const band = MANAUS_RESIDENTIAL_COSIP.find((item) => kwh >= item.min && kwh <= item.max);
  if (!band) return null;
  return { id: `BR:AM:manaus:cosip:${band.min}-${Number.isFinite(band.max) ? band.max : "mais"}`, utility: "lighting", provider: "Município de Manaus", customerClass: "Residencial comum", pricingModel: "consumption-band-fixed-amount", consumptionKwh: kwh, minKwh: band.min, maxKwh: Number.isFinite(band.max) ? band.max : null, amount: band.amount, automatic: true, source: MANAUS_COSIP_SOURCE, sourceUrl: "https://www.manaus.am.gov.br/noticia/iluminacao/metodo-de-cobranca-da-cosip-e-atualizado-pela-prefeitura/", note: "Tabela residencial de Manaus por faixa de consumo. Tarifa Social não é inferida automaticamente." };
}

function publishResolverSnapshot(context, energyRule = resolveEnergyRule(context), waterRule = resolveWaterRule(context), lightingRule = resolveLightingRule(context, Number(window.VOLT_BETA_API?.getSnapshot?.()?.energy?.summary?.consumption || 0)), internationalEstimate = resolveInternationalEstimate(normalizeRegionalContext(context), Number(window.VOLT_BETA_API?.getSnapshot?.()?.energy?.summary?.consumption || 0), energyRule)) {
  const normalized = normalizeRegionalContext(context);
  window.VOLT_TARIFF_RESOLUTION = Object.freeze({
    jurisdiction: normalized.jurisdiction,
    country: normalized.country,
    currency: normalized.currency,
    locale: normalized.locale,
    locality: Object.freeze({ state: normalized.state, city: normalized.city, energyProvider: normalized.energyProvider, waterProvider: normalized.waterProvider, energyPlan: normalized.energyPlan, contractedPowerKw: normalized.contractedPowerKw }),
    energy: energyRule ? freezeRule(energyRule) : null,
    water: waterRule ? freezeRule(waterRule) : null,
    lighting: lightingRule ? Object.freeze({ ...lightingRule }) : null,
    internationalEstimate: internationalEstimate ? Object.freeze({ ...internationalEstimate }) : null,
    energyProviderCatalog: Object.freeze(normalized.country === "BR" ? listNationalEnergyProviders() : normalized.country === "UY" ? ["UTE"] : [])
  });
}

function renderRegionalResolution(context, energyRule, waterRule, lightingRule, internationalEstimate) {
  const status = document.querySelector("#beta-locality-status");
  if (!status || !context.state || !context.city) return;
  if (context.country === "UY") {
    const energyText = energyRule ? `Energía: UTE · ${energyRule.customerClass}.` : "Energía: tarifa UTE no identificada.";
    const estimateText = internationalEstimate?.valid
      ? `Estimación piloto sin IVA para ${internationalEstimate.consumptionKwh.toLocaleString("es-UY")} kWh: ${formatMoney(internationalEstimate.subtotalBeforeTax, context)}.`
      : energyRule?.id === "uy-ute-trs-2026" ? "Informe la potencia contratada para calcular la Tarifa Residencial Simple." : "Esta tarifa por horario todavía no se calcula automáticamente.";
    const waterText = waterRule ? "Agua: OSE · regla residencial identificada; cálculo automático aún no habilitado." : "Agua: regla OSE no identificada.";
    status.textContent = `${context.city} · ${context.state} · piloto Uruguay. ${energyText} ${estimateText} ${waterText}`;
    return;
  }
  if (context.country !== "BR") { status.textContent = `${context.jurisdiction}. País preparado na arquitetura, mas regras tarifárias ainda não estão ativadas.`; return; }
  const energyText = energyRule?.automatic && Number.isFinite(energyRule.ratePerKwh) ? `Energia: ${energyRule.provider} · tarifa-base oficial ${currencyPerKwh(energyRule.ratePerKwh, context)} aplicada.` : context.energyProvider ? `Energia: ${context.energyProvider} · sem tarifa automática validada; mantendo valor manual.` : "Energia: concessionária não informada.";
  const lightingText = lightingRule?.automatic ? `Iluminação pública: ${lightingRule.consumptionKwh} kWh · faixa ${formatBand(lightingRule)} · ${formatMoney(lightingRule.amount, context)} aplicada.` : "Iluminação pública: mantendo valor manual; nenhuma regra municipal validada foi localizada para esta cidade.";
  const waterText = waterRule ? `Água: ${waterRule.provider} · regra regional identificada (${waterRule.pricingModel || "modelo local"}).` : context.waterProvider ? `Água: ${context.waterProvider} · sem regra tarifária local modelada; mantendo configuração manual.` : "Água: concessionária não informada.";
  status.textContent = `${context.city} · ${context.state}. ${energyText} ${lightingText} ${waterText}`;
}

function readLocality() { try { return normalizeRegionalContext(JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}")); } catch { return normalizeRegionalContext({}); } }

function freezeRule(rule) {
  return Object.freeze({ id: rule.id, provider: rule.provider, customerClass: rule.customerClass, validFrom: rule.validFrom || null, validUntil: rule.validUntil || null, ratePerKwh: Number.isFinite(rule.ratePerKwh) ? Number(rule.ratePerKwh) : null, automatic: Boolean(rule.automatic), pricingModel: rule.pricingModel || null, source: rule.source || "", sourceUrl: rule.sourceUrl || "", components: rule.components ? Object.freeze({ ...rule.components }) : null, energyTiers: rule.energyTiers ? Object.freeze(rule.energyTiers.map((tier) => Object.freeze({ ...tier }))) : null, contractedPowerRatePerKw: Number.isFinite(rule.contractedPowerRatePerKw) ? rule.contractedPowerRatePerKw : null, fixedMonthlyCharge: Number.isFinite(rule.fixedMonthlyCharge) ? rule.fixedMonthlyCharge : null });
}

function formatBand(rule) { if (!rule) return "—"; if (rule.maxKwh == null) return `acima de ${Math.max(0, Number(rule.minKwh || 1) - 1)} kWh`; return `${rule.minKwh}–${rule.maxKwh} kWh`; }
function normalize(value) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase(); }
function currencyPerKwh(value, context) { return `${Number(value || 0).toLocaleString(context.locale || "pt-BR", { style: "currency", currency: context.currency || "BRL", minimumFractionDigits: 5, maximumFractionDigits: 5 })}/kWh`; }
