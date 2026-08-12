const LOCALITY_KEY = "volt:beta:locality-context-v1";

export const MERCOSUR_COUNTRIES = Object.freeze([
  Object.freeze({ code: "BR", name: "Brasil", currency: "BRL", locale: "pt-BR", enabled: true, subdivisionLabel: "UF", cityLabel: "Município" }),
  Object.freeze({ code: "UY", name: "Uruguai", currency: "UYU", locale: "es-UY", enabled: false, subdivisionLabel: "Departamento", cityLabel: "Localidad" }),
  Object.freeze({ code: "PY", name: "Paraguai", currency: "PYG", locale: "es-PY", enabled: false, subdivisionLabel: "Departamento", cityLabel: "Ciudad" }),
  Object.freeze({ code: "AR", name: "Argentina", currency: "ARS", locale: "es-AR", enabled: false, subdivisionLabel: "Provincia", cityLabel: "Localidad" }),
  Object.freeze({ code: "BO", name: "Bolívia", currency: "BOB", locale: "es-BO", enabled: false, subdivisionLabel: "Departamento", cityLabel: "Municipio" })
]);

export function getCountry(code = "BR") {
  const normalized = String(code || "BR").trim().toUpperCase();
  return MERCOSUR_COUNTRIES.find((item) => item.code === normalized) || MERCOSUR_COUNTRIES[0];
}

export function buildJurisdiction(context = {}) {
  const country = getCountry(context.country || "BR");
  const subdivision = String(context.state || context.subdivision || "").trim().toUpperCase();
  const city = normalizeKey(context.city || "");
  return [country.code, subdivision, city].filter(Boolean).join(":");
}

export function normalizeRegionalContext(context = {}) {
  const country = getCountry(context.country || "BR");
  return {
    ...context,
    country: country.code,
    currency: country.currency,
    locale: country.locale,
    jurisdiction: context.jurisdiction || buildJurisdiction({ ...context, country: country.code }),
    state: String(context.state || context.subdivision || "").trim().toUpperCase(),
    city: String(context.city || "").trim(),
    energyProvider: String(context.energyProvider || "").trim(),
    waterProvider: String(context.waterProvider || "").trim()
  };
}

export function formatMoney(value, context = {}) {
  const normalized = normalizeRegionalContext(context);
  return Number(value || 0).toLocaleString(normalized.locale, {
    style: "currency",
    currency: normalized.currency
  });
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function migrateLegacyLocality() {
  try {
    const current = JSON.parse(localStorage.getItem(LOCALITY_KEY) || "{}");
    if (!current || typeof current !== "object") return;
    const normalized = normalizeRegionalContext(current);
    const changed = current.country !== normalized.country
      || current.currency !== normalized.currency
      || current.locale !== normalized.locale
      || current.jurisdiction !== normalized.jurisdiction;
    if (changed) localStorage.setItem(LOCALITY_KEY, JSON.stringify(normalized));
    window.VOLT_REGION_CONTEXT = Object.freeze({ ...normalized });
  } catch {
    window.VOLT_REGION_CONTEXT = Object.freeze(normalizeRegionalContext({}));
  }
}

migrateLegacyLocality();
window.addEventListener("volt:locality-context", (event) => {
  const normalized = normalizeRegionalContext(event.detail || {});
  window.VOLT_REGION_CONTEXT = Object.freeze({ ...normalized });
});

window.VOLT_MERCOSUR = Object.freeze({
  countries: MERCOSUR_COUNTRIES,
  getCountry,
  normalizeRegionalContext,
  buildJurisdiction,
  formatMoney
});
