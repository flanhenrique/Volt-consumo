// Volt Mercosul — Uruguai (piloto Beta)
// Fontes oficiais registradas no catálogo: UTE, OSE, IMPO, URSEA e Intendencia de Montevideo.
// Não completar componentes sem regra validada.

export const URUGUAY_TARIFF_CATALOG_META = Object.freeze({
  country: "UY",
  currency: "UYU",
  locale: "es-UY",
  generatedAt: "2026-08-12T16:51:00Z",
  status: "pilot-verified-2026"
});

const UY_BASIC_VAT_RATE = 0.22;

const TRS = Object.freeze({
  id: "uy-ute-trs-2026",
  country: "UY",
  utility: "energy",
  provider: "UTE",
  providerAliases: Object.freeze(["ute"]),
  customerClass: "Tarifa Residencial Simple (TRS)",
  validFrom: "2026-01-01",
  pricingModel: "tiered-energy-plus-contracted-power-plus-fixed",
  automatic: true,
  energyTiers: Object.freeze([
    Object.freeze({ minKwh: 1, maxKwh: 100, ratePerKwh: 6.744 }),
    Object.freeze({ minKwh: 101, maxKwh: 600, ratePerKwh: 8.452 }),
    Object.freeze({ minKwh: 601, maxKwh: null, ratePerKwh: 10.539 })
  ]),
  contractedPowerRatePerKw: 83.2,
  fixedMonthlyCharge: 324.9,
  pricesIncludeVat: false,
  vatRate: UY_BASIC_VAT_RATE,
  fixedChargeVatExempt: true,
  source: "UTE — Pliego Tarifario vigente desde 01/01/2026; DGI Título 10; Decreto 70/014"
});

const OSE = Object.freeze({
  id: "uy-ose-residencial-2026",
  country: "UY",
  utility: "water",
  provider: "OSE",
  providerAliases: Object.freeze(["ose"]),
  customerClass: "Residencial con medidor individual",
  validFrom: "2026-01-01",
  pricingModel: "location-sensitive-tiered-water-and-sanitation",
  automatic: "water-only-when-zone-known",
  pricesIncludeVat: false,
  vatRate: UY_BASIC_VAT_RATE,
  residentialVatExemptThroughM3: 15,
  source: "OSE — Decreto Tarifario enero 2026 / Decreto 340/025; URSEA; DGI",
  zones: Object.freeze({
    beach: Object.freeze({
      id: "beach",
      label: "Zona balnearia excepto Maldonado",
      minimum0to5: 368.91,
      tiers: Object.freeze([
        { from: 5, to: 10, rate: 36.91 },
        { from: 10, to: 15, rate: 105.17 },
        { from: 15, to: 20, rate: 139.63 },
        { from: 20, to: 25, rate: 164.85 },
        { from: 25, to: 30, rate: 186.53 },
        { from: 30, to: 50, rate: 207.48 },
        { from: 50, to: null, rate: 236.79 }
      ].map(Object.freeze))
    }),
    maldonado: Object.freeze({
      id: "maldonado",
      label: "Zona balnearia Maldonado",
      minimum0to5: 473.71,
      tiers: Object.freeze([
        { from: 5, to: 10, rate: 47.41 },
        { from: 10, to: 15, rate: 142.14 },
        { from: 15, to: 20, rate: 181.47 },
        { from: 20, to: 25, rate: 211.64 },
        { from: 25, to: 30, rate: 238.63 },
        { from: 30, to: 50, rate: 267.17 },
        { from: 50, to: null, rate: 636.68 }
      ].map(Object.freeze))
    })
  }),
  fixedByDiameter: Object.freeze({ "12.5": 184.43, "13": 184.43, "19": 948.46, "25": 1523.75, gt25: 6595.65 }),
  highAverageFixedCharge: Object.freeze({ thresholdM3: 15, amount: 101.45 }),
  note: "Água residencial é isenta de IVA até 15 m³; acima disso, somente o cargo variável correspondente ao excedente é tributado. Saneamento é resolvido separadamente conforme a localidade."
});

export const URUGUAY_TARIFF_CATALOG = Object.freeze([
  TRS,
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
    fixedMonthlyCharge: 488,
    pricesIncludeVat: false,
    vatRate: UY_BASIC_VAT_RATE,
    fixedChargeVatExempt: true,
    source: "UTE — Plan Inteligente / Pliego Tarifario 2026"
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
    fixedMonthlyCharge: 488,
    pricesIncludeVat: false,
    vatRate: UY_BASIC_VAT_RATE,
    fixedChargeVatExempt: true,
    source: "UTE — Plan Inteligente / Pliego Tarifario 2026"
  }),
  OSE
]);

export function listUruguayTariffRules(utility = "") {
  return utility ? URUGUAY_TARIFF_CATALOG.filter((rule) => rule.utility === utility) : [...URUGUAY_TARIFF_CATALOG];
}

export function listUruguayProviders(utility = "") {
  return [...new Set(listUruguayTariffRules(utility).map((rule) => rule.provider))];
}

export function findUruguayTariffRule({ utility = "", provider = "" } = {}) {
  const value = String(provider || "").trim().toLowerCase();
  return URUGUAY_TARIFF_CATALOG.find((rule) =>
    (!utility || rule.utility === utility)
    && (!value || rule.providerAliases.some((alias) => alias.includes(value) || value.includes(alias)))
  ) || null;
}

export function resolveUruguaySanitation({ department = "", city = "", enabled = false } = {}) {
  if (!enabled) return Object.freeze({ enabled: false, provider: null, scope: "none", automatic: false });
  const dep = normalize(department);
  const place = normalize(city);
  if (dep === "mo" || dep === "montevideo" || place === "montevideo") {
    return Object.freeze({
      enabled: true,
      provider: "Intendencia de Montevideo",
      scope: "departmental-separate-bill",
      automatic: false,
      reason: "montevideo-quarterly-rate-required",
      source: "URSEA; Intendencia de Montevideo"
    });
  }
  return Object.freeze({
    enabled: true,
    provider: "OSE",
    scope: "ose-bill",
    automatic: false,
    reason: "ose-sanitation-type-required",
    supportedTypes: Object.freeze(["conventional", "decanted-effluent"]),
    source: "OSE Decreto Tarifario 2026; URSEA"
  });
}

export function calculateUteResidentialSimple(consumptionKwh, contractedPowerKw) {
  const consumption = Math.max(0, Number(consumptionKwh) || 0);
  const power = Number(contractedPowerKw);
  if (!Number.isFinite(power) || power <= 0) return Object.freeze({ valid: false, reason: "contracted_power_required" });

  let remaining = consumption;
  let energyCharge = 0;
  for (const tier of TRS.energyTiers) {
    if (remaining <= 0) break;
    const capacity = tier.maxKwh == null ? remaining : tier.maxKwh - tier.minKwh + 1;
    const quantity = Math.min(remaining, capacity);
    energyCharge += quantity * tier.ratePerKwh;
    remaining -= quantity;
  }

  const powerCharge = power * TRS.contractedPowerRatePerKw;
  const fixedCharge = TRS.fixedMonthlyCharge;
  const taxableBase = energyCharge + powerCharge;
  const vatAmount = taxableBase * TRS.vatRate;
  const subtotalBeforeTax = energyCharge + powerCharge + fixedCharge;
  const totalWithVat = subtotalBeforeTax + vatAmount;
  return Object.freeze({
    valid: true,
    energyCharge,
    powerCharge,
    fixedCharge,
    taxableBase,
    vatRate: TRS.vatRate,
    vatAmount,
    subtotalBeforeTax,
    totalWithVat,
    taxIncluded: true,
    taxStatus: "verified",
    fixedChargeVatExempt: true
  });
}

export function classifyOseZone({ department = "", city = "", zone = "" } = {}) {
  const explicit = normalize(zone);
  if (explicit === "maldonado") return "maldonado";
  if (explicit === "beach" || explicit === "balnearia") return "beach";

  const dep = normalize(department);
  const place = normalize(city);
  if ((dep === "ma" || dep === "maldonado") && ["maldonado", "punta del este", "piriapolis", "pan de azucar", "san carlos"].includes(place)) {
    return "maldonado";
  }
  return null;
}

export function calculateOseResidentialWater({ consumptionM3 = 0, zone = "", connectionDiameterMm = 13, annualAverageM3 = null } = {}) {
  const selectedZone = OSE.zones[zone];
  if (!selectedZone) return Object.freeze({ valid: false, reason: "ose_zone_required" });

  const diameter = Number(connectionDiameterMm);
  const diameterKey = diameter > 25 ? "gt25" : String(diameter);
  const fixed = OSE.fixedByDiameter[diameterKey];
  if (!Number.isFinite(fixed)) return Object.freeze({ valid: false, reason: "connection_diameter_required" });

  const consumption = Math.max(0, Number(consumptionM3) || 0);
  const variable = calculateOseVariableCharge(selectedZone, consumption);
  const exemptConsumption = Math.min(consumption, OSE.residentialVatExemptThroughM3);
  const exemptVariableCharge = calculateOseVariableCharge(selectedZone, exemptConsumption);
  const taxableExcessM3 = Math.max(0, consumption - OSE.residentialVatExemptThroughM3);
  const taxableVariableCharge = Math.max(0, variable - exemptVariableCharge);
  const vatAmount = taxableVariableCharge * OSE.vatRate;
  const average = Number(annualAverageM3);
  const highAverage = Number.isFinite(average) && average > OSE.highAverageFixedCharge.thresholdM3
    ? OSE.highAverageFixedCharge.amount
    : 0;
  const waterSubtotalBeforeTax = variable + fixed + highAverage;
  const totalWaterWithVat = waterSubtotalBeforeTax + vatAmount;

  return Object.freeze({
    valid: true,
    zone: selectedZone.id,
    zoneLabel: selectedZone.label,
    consumptionM3: consumption,
    variableCharge: variable,
    fixedCharge: fixed,
    highAverageFixedCharge: highAverage,
    waterSubtotalBeforeTax,
    vatExemptThroughM3: OSE.residentialVatExemptThroughM3,
    exemptVariableCharge,
    taxableExcessM3,
    taxableVariableCharge,
    taxableExcessBase: taxableVariableCharge,
    vatRate: OSE.vatRate,
    vatAmount,
    totalWaterWithVat,
    sanitationIncluded: false,
    taxIncluded: true,
    taxStatus: taxableExcessM3 > 0 ? "verified-excess-only" : "residential-exempt"
  });
}

function calculateOseVariableCharge(zone, consumptionM3) {
  const consumption = Math.max(0, Number(consumptionM3) || 0);
  if (consumption === 0) return 0;
  let variable = zone.minimum0to5;
  if (consumption <= 5) return variable;
  for (const tier of zone.tiers) {
    const upper = tier.to == null ? consumption : Math.min(consumption, tier.to);
    const quantity = Math.max(0, upper - tier.from);
    variable += quantity * tier.rate;
    if (tier.to == null || consumption <= tier.to) break;
  }
  return variable;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
