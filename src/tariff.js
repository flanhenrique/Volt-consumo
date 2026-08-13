import { findNationalEnergyRule } from "../data/national-energy-catalog.js?v=20260813.4";

export function normalizeLocality(value) {
  return {
    country: String(value?.country || "BR").trim().toUpperCase(),
    state: String(value?.state || "").trim().toUpperCase(),
    city: String(value?.city || "").trim(),
    energyProvider: String(value?.energyProvider || "").trim(),
    waterProvider: String(value?.waterProvider || "").trim()
  };
}

export function resolveEnergyTariff(localityInput, currentSettings, date = new Date()) {
  const locality = normalizeLocality(localityInput);
  if (locality.country !== "BR" || !locality.energyProvider) {
    return { settings: { ...currentSettings }, resolution: { automatic: false, rule: null, locality } };
  }
  const rule = findNationalEnergyRule({ provider: locality.energyProvider, date });
  if (!rule?.automatic || !Number.isFinite(rule.ratePerKwh) || rule.ratePerKwh <= 0) {
    return { settings: { ...currentSettings }, resolution: { automatic: false, rule: null, locality } };
  }
  return {
    settings: { ...currentSettings, rate: Number(rule.ratePerKwh) },
    resolution: {
      automatic: true,
      rule: { id: rule.id, provider: rule.provider, ratePerKwh: Number(rule.ratePerKwh), source: rule.source, validFrom: rule.validFrom, validUntil: rule.validUntil },
      locality
    }
  };
}
