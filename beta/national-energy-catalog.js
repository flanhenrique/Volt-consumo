// Catálogo nacional de energia — gerado a partir da base pública da ANEEL.
// Este arquivo pode ser sobrescrito pelo workflow update-national-tariffs.yml.
// Regras só são automáticas quando há uma única combinação TUSD + TE vigente
// para B1 Residencial Convencional no conjunto oficial.

export const NATIONAL_ENERGY_CATALOG_META = Object.freeze({
  source: "ANEEL — Tarifas de aplicação das distribuidoras de energia elétrica",
  sourceUrl: "https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica",
  generatedAt: "2026-08-10T00:00:00.000Z",
  mode: "seed"
});

export const NATIONAL_ENERGY_CATALOG = Object.freeze([
  Object.freeze({
    id: "enel-sp-b1-residencial-convencional-2026",
    utility: "energy",
    provider: "Enel Distribuição São Paulo",
    providerAliases: Object.freeze(["enel distribuição são paulo", "enel distribuicao sao paulo", "enel sp", "eletropaulo"]),
    customerClass: "B1 Residencial — Convencional",
    validFrom: "2026-07-04",
    validUntil: null,
    ratePerKwh: 0.78938,
    components: Object.freeze({ tusdPerMwh: 472.42, tePerMwh: 316.96 }),
    automatic: true,
    source: "Enel SP / ANEEL — tarifa residencial B1 convencional vigente desde 04/07/2026",
    sourceUrl: "https://www.enel.com.br/pt-saopaulo/Para_Voce/tarifa-de-energia-eletrica.html",
    excludes: Object.freeze(["ICMS", "PIS/Cofins", "CIP/COSIP", "bandeira tarifária"])
  })
]);

export function findNationalEnergyRule({ provider = "", date = new Date() } = {}) {
  const needle = normalize(provider);
  if (!needle) return null;
  const when = date instanceof Date ? date : new Date(date);
  return NATIONAL_ENERGY_CATALOG.find((rule) => {
    if (!rule.automatic || !Number.isFinite(rule.ratePerKwh)) return false;
    if (!matchesProvider(rule, needle)) return false;
    if (!isCurrent(rule, when)) return false;
    return true;
  }) || null;
}

export function listNationalEnergyProviders() {
  return NATIONAL_ENERGY_CATALOG.filter((rule) => rule.automatic).map((rule) => rule.provider);
}

function matchesProvider(rule, needle) {
  return [rule.provider, ...(rule.providerAliases || [])].some((value) => {
    const candidate = normalize(value);
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate);
  });
}

function isCurrent(rule, date) {
  if (Number.isNaN(date.getTime())) return false;
  const day = date.toISOString().slice(0, 10);
  return (!rule.validFrom || day >= rule.validFrom) && (!rule.validUntil || day <= rule.validUntil);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
