const PROFILES = Object.freeze({
  "amazonas-social-80-2026-08": Object.freeze({
    id: "amazonas-social-80-2026-08",
    version: "billing-rules-v1",
    provider: "Amazonas Energia",
    label: "Amazonas Energia · Tarifa Social até 80 kWh",
    active: true,
    validFrom: "2026-08-01",
    rules: Object.freeze({
      tariffBands: Object.freeze([
        Object.freeze({ code: "social_band_80", label: "Energia até 80 kWh", upToKwh: 80, rate: 0.750890 }),
        Object.freeze({ code: "standard_above_80", label: "Energia acima de 80 kWh", upToKwh: null, rate: 0.769740 })
      ]),
      benefits: Object.freeze([
        Object.freeze({
          code: "social_tariff_energy",
          label: "Subvenção Baixa Renda",
          type: "per_kwh_credit",
          upToKwh: 80,
          rate: 0.769740,
          forecastable: true
        }),
        Object.freeze({
          code: "social_tariff_flag",
          label: "Desconto Tarifa Social sobre bandeira",
          type: "per_kwh_credit",
          upToKwh: 80,
          rateSource: "flagRate",
          forecastable: true
        })
      ]),
      charges: Object.freeze([])
    })
  })
});

export function findEnergyBillingProfile(id, provider) {
  const key = String(id || "").trim();
  const profile = PROFILES[key] || null;
  if (!profile) return null;
  const expectedProvider = String(profile.provider || "").trim().toLocaleLowerCase("pt-BR");
  const actualProvider = String(provider || "").trim().toLocaleLowerCase("pt-BR");
  if (expectedProvider && actualProvider && expectedProvider !== actualProvider) return null;
  return profile;
}
