import { findNationalEnergyRule } from "../data/national-energy-catalog.js?v=20260813.7";
import { findEnergyBillingProfile } from "../data/energy-billing-profiles.js?v=20260813.7";
import { renderLegalBillDetail } from "./bill-detail.js?v=20260813.7";

const ENERGY_PROVIDER_RENAMES = Object.freeze(new Map([
  ["amazonas energia", "Âmbar Amazonas"],
  ["amazonas energia sa", "Âmbar Amazonas"],
  ["amazonas distribuidora de energia", "Âmbar Amazonas"],
  ["amazonas distribuidora de energia sa", "Âmbar Amazonas"],
  ["ambar energia", "Âmbar Amazonas"]
]));

export function normalizeLocality(value) {
  const hasBillingProfile = Boolean(value && Object.prototype.hasOwnProperty.call(value, "billingProfile"));
  const inheritedBillingProfile = globalThis.__VOLT_BILLING_CONTEXT__?.profile?.id || "";
  return {
    country: String(value?.country || "BR").trim().toUpperCase(),
    state: String(value?.state || "").trim().toUpperCase(),
    city: String(value?.city || "").trim(),
    energyProvider: String(value?.energyProvider || "").trim(),
    waterProvider: String(value?.waterProvider || "").trim(),
    billingProfile: String(hasBillingProfile ? value?.billingProfile || "" : inheritedBillingProfile).trim()
  };
}

export function resolveEnergyTariff(localityInput, currentSettings, date = new Date()) {
  const locality = normalizeLocality(localityInput);
  const billingProfile = publishBillingProfile(locality);
  if (locality.country !== "BR" || !locality.energyProvider) {
    return { settings: { ...currentSettings }, resolution: { automatic: false, rule: null, billingProfile: summarizeBillingProfile(billingProfile), locality } };
  }
  const lookupProvider = canonicalEnergyProvider(locality.energyProvider);
  const rule = findNationalEnergyRule({ provider: lookupProvider, date });
  if (!rule?.automatic || !Number.isFinite(rule.ratePerKwh) || rule.ratePerKwh <= 0) {
    return { settings: { ...currentSettings }, resolution: { automatic: false, rule: null, billingProfile: summarizeBillingProfile(billingProfile), locality } };
  }
  return {
    settings: { ...currentSettings, rate: Number(rule.ratePerKwh) },
    resolution: {
      automatic: true,
      rule: {
        id: rule.id,
        provider: rule.provider,
        ratePerKwh: Number(rule.ratePerKwh),
        source: rule.source,
        validFrom: rule.validFrom,
        validUntil: rule.validUntil,
        matchedFromProvider: locality.energyProvider,
        providerRenameApplied: normalizeProviderKey(locality.energyProvider) !== normalizeProviderKey(rule.provider)
      },
      billingProfile: summarizeBillingProfile(billingProfile),
      locality
    }
  };
}

function canonicalEnergyProvider(value) {
  const original = String(value || "").trim();
  return ENERGY_PROVIDER_RENAMES.get(normalizeProviderKey(original)) || original;
}

function normalizeProviderKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function publishBillingProfile(locality) {
  const profile = findEnergyBillingProfile(locality.billingProfile, locality.energyProvider);
  globalThis.__VOLT_BILLING_CONTEXT__ = profile ? { profile } : null;
  renderLegalBillDetail(profile);
  return profile;
}

function summarizeBillingProfile(profile) {
  if (!profile) return null;
  return { id: profile.id, version: profile.version, provider: profile.provider, label: profile.label, validFrom: profile.validFrom };
}
