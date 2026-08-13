const PROFILES = Object.freeze({
  "amazonas-social-80-2026-08": Object.freeze({
    id: "amazonas-social-80-2026-08",
    version: "billing-rules-v1",
    provider: "Amazonas Energia",
    label: "Amazonas Energia · Tarifa Social até 80 kWh",
    active: true,
    validFrom: "2026-08-01",
    legalBenefits: Object.freeze([
      Object.freeze({
        code: "itaipu_bonus_2026",
        name: "Bônus Itaipu",
        active: true,
        recurring: false,
        forecastable: false,
        extraordinary: true,
        referencePeriodLabel: "Meses elegíveis de janeiro a dezembro de 2025",
        creditPeriodLabel: "Crédito nas faturas emitidas em agosto de 2026",
        officialRate: 0.00747181,
        officialRateUnit: "R$/kWh",
        formulaLabel: "Consumo faturado elegível de 2025 × R$ 0,00747181/kWh",
        explanation: "O Volt trata este crédito como extraordinário. Ele não reduz a previsão recorrente dos meses seguintes e só deve ser marcado como valor validado quando o consumo elegível de 2025 e o crédito lançado pela distribuidora fecharem com a regra oficial.",
        law: Object.freeze({
          label: "Lei nº 10.438/2002",
          article: "art. 21",
          url: "https://www.planalto.gov.br/ccivil_03/leis/2002/l10438.htm"
        }),
        regulation: Object.freeze({
          label: "PRORET · Submódulo 6.2 — Itaipu",
          url: "https://www.gov.br/aneel/pt-br/centrais-de-conteudos/procedimentos-regulatorios/proret"
        }),
        annualAct: Object.freeze({
          label: "Resolução Homologatória ANEEL nº 3.597/2026",
          url: "https://www.gov.br/aneel/pt-br/assuntos/noticias"
        })
      })
    ]),
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
