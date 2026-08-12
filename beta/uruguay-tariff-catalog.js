// Volt Mercosul — Uruguai (piloto Beta)
// Fontes oficiais: UTE / URSEA / OSE. Não aplicar valores não validados.

export const URUGUAY_TARIFF_CATALOG_META = Object.freeze({
  country: "UY",
  currency: "UYU",
  locale: "es-UY",
  generatedAt: "2026-08-12T15:14:00Z",
  status: "pilot"
});

export const URUGUAY_TARIFF_CATALOG = Object.freeze([
  Object.freeze({
    id: "uy-ute-trs-2026",
    country: "UY",
    utility: "energy",
    provider: "UTE",
    providerAliases: Object.freeze(["ute"]),
    customerClass: "Tarifa Residencial Simple (TRS)",
    validFrom: "2026-01-01",
    pricingModel: "tiered-energy-plus-contracted-power-plus-fixed",
    automatic: false,
    energyTiers: Object.freeze([
      Object.freeze({ minKwh: 1, maxKwh: 100, ratePerKwh: 6.744 }),
      Object.freeze({ minKwh: 101, maxKwh: 600, ratePerKwh: 8.452 }),
      Object.freeze({ minKwh: 601, maxKwh: null, ratePerKwh: 10.539 })
    ]),
    contractedPowerRatePerKw: 83.2,
    fixedMonthlyCharge: 324.9,
    source: "UTE — Pliego Tarifario vigente desde 01/01/2026",
    note: "Valores oficiais sem IVA. O cálculo exige faixas, potência contratada e cargo fixo."
  }),
  Object.freeze({
    id: "uy-ute-trdh-2026",
    country: "UY",
    utility: "energy",
    provider: "UTE",
    providerAliases: Object.freeze(["ute"]),
    customerClass: "Tarifa Residencial Doble Horario",
    validFrom: "2026-01-01",
    pricingModel: "time-of-use-plus-contracted-power-plus-fixed",
    automatic: false,
    timeOfUse: Object.freeze({ peakRatePerKwh: 12.034, offPeakRatePerKwh: 4.771 }),
    contractedPowerRatePerKw: 83.2,
    fixedMonthlyCharge: 488.0,
    source: "UTE — Pliego Tarifario vigente desde 01/01/2026"
  }),
  Object.freeze({
    id: "uy-ute-trth-2026",
    country: "UY",
    utility: "energy",
    provider: "UTE",
    providerAliases: Object.freeze(["ute"]),
    customerClass: "Tarifa Residencial Triple Horario",
    validFrom: "2026-01-01",
    pricingModel: "three-period-time-of-use-plus-contracted-power-plus-fixed",
    automatic: false,
    timeOfUse: Object.freeze({ valleyRatePerKwh: 2.443, flatRatePerKwh: 5.172, peakRatePerKwh: 12.034 }),
    contractedPowerRatePerKw: 83.2,
    fixedMonthlyCharge: 488.0,
    source: "UTE — Pliego Tarifario vigente desde 01/01/2026"
  }),
  Object.freeze({
    id: "uy-ose-residencial-2026",
    country: "UY",
    utility: "water",
    provider: "OSE",
    providerAliases: Object.freeze(["ose"]),
    customerClass: "Residencial",
    validFrom: "2026-01-01",
    pricingModel: "tiered-water-and-sanitation",
    automatic: false,
    source: "OSE — Decreto Tarifario vigente / Resolución 1464/25",
    note: "Regra cadastrada sem inventar valores unitários: OSE usa blocos de consumo e saneamento."
  })
]);

export function listUruguayTariffRules(utility = "") {
  return utility ? URUGUAY_TARIFF_CATALOG.filter((rule) => rule.utility === utility) : [...URUGUAY_TARIFF_CATALOG];
}

export function listUruguayProviders(utility = "") {
  return [...new Set(listUruguayTariffRules(utility).map((rule) => rule.provider))];
}

export function findUruguayTariffRule({ utility = "", provider = "" } = {}) {
  const normalized = String(provider || "").trim().toLowerCase();
  return URUGUAY_TARIFF_CATALOG.find((rule) => (!utility || rule.utility === utility) && (!normalized || rule.providerAliases.some((alias) => alias.includes(normalized) || normalized.includes(alias)))) || null;
}

export function calculateUteResidentialSimple(consumptionKwh, contractedPowerKw) {
  const consumption = Math.max(0, Number(consumptionKwh) || 0);
  const power = Number(contractedPowerKw);
  if (!Number.isFinite(power) || power <= 0) return Object.freeze({ valid: false, reason: "contracted_power_required" });
  let remaining = consumption;
  let energyCharge = 0;
  for (const tier of URUGUAY_TARIFF_CATALOG[0].energyTiers) {
    if (remaining <= 0) break;
    const capacity = tier.maxKwh == null ? remaining : tier.maxKwh - tier.minKwh + 1;
    const quantity = Math.min(remaining, capacity);
    energyCharge += quantity * tier.ratePerKwh;
    remaining -= quantity;
  }
  const powerCharge = power * 83.2;
  const fixedCharge = 324.9;
  return Object.freeze({ valid: true, energyCharge, powerCharge, fixedCharge, subtotalBeforeTax: energyCharge + powerCharge + fixedCharge, taxIncluded: false });
}
