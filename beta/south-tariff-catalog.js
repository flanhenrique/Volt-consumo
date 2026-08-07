export const SOUTH_TARIFF_CATALOG = Object.freeze([
  Object.freeze({
    id: "sc-celesc-b1-convencional",
    state: "SC",
    utility: "energy",
    providerAliases: ["celesc", "celesc distribuição", "celesc distribuicao"],
    provider: "Celesc Distribuição",
    customerClass: "B1 Residencial — Convencional",
    validFrom: "2025-08-22",
    validUntil: null,
    ratePerKwh: 0.69568,
    components: Object.freeze({ tusdPerMwh: 373.75, tePerMwh: 321.93 }),
    automatic: true,
    excludes: ["ICMS", "PIS/Cofins", "CIP/COSIP", "bandeira tarifária"],
    source: "ANEEL — Resolução Homologatória nº 3.511/2025, Tabela 2",
    sourceUrl: "https://www2.aneel.gov.br/cedoc/reh20253511ti.pdf",
    note: "Tarifa de aplicação B1 convencional. A revisão tarifária de 2026 estava em processo regulatório; o Volt só substitui este valor quando houver ato homologatório final validado."
  }),
  Object.freeze({
    id: "rs-ceee-equatorial-b1-convencional",
    state: "RS",
    utility: "energy",
    providerAliases: ["ceee", "ceee equatorial", "grupo equatorial", "equatorial"],
    provider: "CEEE Equatorial",
    customerClass: "B1 Residencial — Convencional",
    validFrom: "2025-11-22",
    validUntil: null,
    ratePerKwh: 0.64305,
    components: Object.freeze({ tusdPerMwh: 364.49, tePerMwh: 278.56 }),
    automatic: true,
    excludes: ["ICMS", "PIS/Cofins", "CIP/COSIP", "bandeira tarifária"],
    source: "ANEEL — tarifa de aplicação B1 convencional da CEEE Equatorial",
    sourceUrl: "https://www2.aneel.gov.br/cedoc/reh20233283ti.pdf",
    note: "Valor base TUSD + TE. Tributos, iluminação pública e bandeira permanecem separados."
  }),
  Object.freeze({
    id: "rs-rge-b1",
    state: "RS",
    utility: "energy",
    providerAliases: ["rge", "rge sul", "cpfl rge"],
    provider: "RGE Sul",
    customerClass: "B1 Residencial",
    validFrom: "2026-06-19",
    validUntil: null,
    ratePerKwh: null,
    automatic: false,
    excludes: ["ICMS", "PIS/Cofins", "CIP/COSIP", "bandeira tarifária"],
    source: "ANEEL — Reajuste Tarifário Anual da RGE Sul, vigência a partir de 19/06/2026",
    sourceUrl: "https://www.gov.br/aneel/pt-br/assuntos/noticias/2026-defeso-eleitoral/novas-tarifas-da-rge-sul-sao-aprovadas-pela-aneel",
    note: "A regra está cadastrada, mas o valor unitário não é aplicado automaticamente até o Volt validar a tabela homologatória de TUSD + TE vigente."
  }),
  Object.freeze({
    id: "pr-copel-b1",
    state: "PR",
    utility: "energy",
    providerAliases: ["copel", "copel distribuição", "copel distribuicao"],
    provider: "Copel Distribuição",
    customerClass: "B1 Residencial",
    validFrom: "2026-06-24",
    validUntil: null,
    ratePerKwh: null,
    automatic: false,
    excludes: ["ICMS", "PIS/Cofins", "CIP/COSIP", "bandeira tarifária"],
    source: "ANEEL — Revisão Tarifária Periódica 2026 da Copel",
    sourceUrl: "https://www.gov.br/aneel/pt-br/assuntos/noticias/2026/aneel-aprova-consulta-publica-para-debater-revisao-tarifaria-da-copel",
    note: "O catálogo não converte percentual de revisão em R$/kWh. O valor só será automatizado após validação da resolução homologatória final."
  }),
  Object.freeze({
    id: "pr-sanepar-residencial",
    state: "PR",
    utility: "water",
    providerAliases: ["sanepar"],
    provider: "Sanepar",
    customerClass: "Residencial",
    validFrom: "2026-04-16",
    validUntil: null,
    automatic: false,
    pricingModel: "tiered",
    source: "Sanepar — tabela tarifária 2026",
    sourceUrl: "https://www.sanepar.com.br/sites/default/files/EX_2026-04-16.pdf",
    note: "A cobrança residencial usa faixas de consumo e possui regra de esgoto que pode variar por localidade. Não é seguro reduzir a tarifa a um único R$/m³."
  }),
  Object.freeze({
    id: "sc-casan-residencial",
    state: "SC",
    utility: "water",
    providerAliases: ["casan"],
    provider: "CASAN",
    customerClass: "Residencial",
    validFrom: "2026-04-01",
    validUntil: null,
    automatic: false,
    pricingModel: "tiered-plus-fixed",
    sewerRule: "100% da tarifa de água, conforme tabela aplicável",
    source: "CASAN — tabela vigente a partir de 01/04/2026",
    sourceUrl: "https://www.casan.com.br/menu-conteudo/index/url/precos-e-prazos",
    note: "A estrutura combina disponibilidade/faixas e esgoto. O Volt mantém a regra como regional e não substitui por uma tarifa linear."
  }),
  Object.freeze({
    id: "rs-corsan-residencial-b",
    state: "RS",
    utility: "water",
    providerAliases: ["corsan", "aegea corsan"],
    provider: "Corsan",
    customerClass: "Residencial B",
    validFrom: "2026-01-01",
    validUntil: null,
    automatic: false,
    pricingModel: "exponential-plus-service",
    referenceValues: Object.freeze({ baseWaterPerM3: 8.65, basicService: 41.03, collectedSewerPerM3: 4.32, treatedSewerPerM3: 6.05 }),
    source: "Corsan / AGERGS — tabela tarifária 2026 para municípios do anexo aplicável",
    sourceUrl: "https://corsan.com.br/wp-content/uploads/2026/04/Anexo-5_AGERGS_2026_TABELA-TARIFARIA-298-MUNICIPIOS.pdf",
    note: "O preço base é usado em fórmula exponencial e a tabela depende do grupo de municípios/regulador. Os valores de referência não são aplicados como simples multiplicação por m³."
  })
]);

export function findSouthTariffRule({ state = "", utility = "", provider = "" } = {}) {
  const normalizedProvider = normalize(provider);
  return SOUTH_TARIFF_CATALOG.find((rule) => {
    if (rule.state !== String(state).trim().toUpperCase() || rule.utility !== utility) return false;
    if (!normalizedProvider) return false;
    return rule.providerAliases.some((alias) => normalizedProvider.includes(normalize(alias)) || normalize(alias).includes(normalizedProvider));
  }) || null;
}

export function listSouthTariffRulesForState(state) {
  const uf = String(state || "").trim().toUpperCase();
  return SOUTH_TARIFF_CATALOG.filter((rule) => rule.state === uf);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
