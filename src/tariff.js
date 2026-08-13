import { findNationalEnergyRule } from "../data/national-energy-catalog.js?v=20260813.7";
import { findEnergyBillingProfile } from "../data/energy-billing-profiles.js?v=20260813.7";
import { renderLegalBillDetail } from "./bill-detail.js?v=20260813.7";

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
  const rule = findNationalEnergyRule({ provider: locality.energyProvider, date });
  if (!rule?.automatic || !Number.isFinite(rule.ratePerKwh) || rule.ratePerKwh <= 0) {
    return { settings: { ...currentSettings }, resolution: { automatic: false, rule: null, billingProfile: summarizeBillingProfile(billingProfile), locality } };
  }
  return {
    settings: { ...currentSettings, rate: Number(rule.ratePerKwh) },
    resolution: {
      automatic: true,
      rule: { id: rule.id, provider: rule.provider, ratePerKwh: Number(rule.ratePerKwh), source: rule.source, validFrom: rule.validFrom, validUntil: rule.validUntil },
      billingProfile: summarizeBillingProfile(billingProfile),
      locality
    }
  };
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
