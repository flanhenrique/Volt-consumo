function text(value) {
  return String(value || "").trim();
}

function normalized(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function dateOnly(value) {
  const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function latestProfiles(profiles, unitId) {
  const map = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (profile.consumer_unit_id !== unitId) continue;
    const previous = map.get(profile.rule_code);
    if (!previous || Date.parse(profile.created_at || 0) >= Date.parse(previous.created_at || 0)) map.set(profile.rule_code, profile);
  }
  return map;
}

function geographyMatches(rule, unit) {
  if (text(rule.country) && normalized(rule.country) !== normalized(unit.country || "BR")) return false;
  if (text(rule.state) && normalized(rule.state) !== normalized(unit.state)) return false;
  if (text(rule.city) && normalized(rule.city) !== normalized(unit.city)) return false;
  if (text(rule.distributor) && normalized(rule.distributor) !== normalized(unit.distributor)) return false;
  return true;
}

function validityMatches(rule, cycle) {
  const reference = dateOnly(cycle?.cycle_end) || dateOnly(cycle?.cycle_start) || new Date().toISOString().slice(0, 10);
  const from = dateOnly(rule.valid_from);
  const until = dateOnly(rule.valid_until);
  if (from && reference < from) return false;
  if (until && reference > until) return false;
  return true;
}

function profileMatches(rule, profile) {
  const conditions = rule?.conditions && typeof rule.conditions === "object" ? rule.conditions : {};
  if (!conditions.requires_profile) return true;
  if (!profile) return false;
  const allowed = Array.isArray(conditions.eligible_profile_states) ? conditions.eligible_profile_states : ["confirmed_on_bill"];
  return allowed.includes(profile.state);
}

function invoiceMatchersForRule(rule, effect) {
  const matchers = [effect?.component_code, rule?.code, rule?.name].filter(Boolean);
  if (rule?.code === "br_energy_itaipu_bonus") matchers.push("itaipu", "10.438", "art. 21", "art 21");
  if (rule?.code === "br_energy_tsee_80kwh") matchers.push("tarifa social", "subvencao baixa renda", "subvenção baixa renda", "baixa renda");
  return [...new Set(matchers)];
}

function legalBenefitMetadata(rule, profile, effect, options = {}) {
  const legalBasis = text(rule?.legal_basis);
  const sourceTitle = text(rule?.source_title) || "Fonte oficial";
  const sourceUrl = text(rule?.source_url);
  const confirmedOnBill = profile?.state === "confirmed_on_bill";
  return {
    legalBenefit: true,
    active: true,
    code: rule.code,
    name: rule.name,
    recurring: options.recurring !== false,
    forecastable: effect?.forecastable !== false,
    invoiceMatchers: invoiceMatchersForRule(rule, effect),
    law: {
      label: legalBasis || sourceTitle,
      article: "",
      url: sourceUrl
    },
    regulation: sourceUrl ? { label: sourceTitle, url: sourceUrl } : null,
    annualAct: null,
    formulaLabel: options.formulaLabel || "Conforme regra regulatória aplicável",
    referencePeriodLabel: confirmedOnBill ? "Benefício confirmado na fatura" : "Benefício regulatório identificado",
    officialRate: "not_identified",
    officialRateUnit: null,
    explanation: options.explanation || (confirmedOnBill
      ? "O benefício foi identificado na fatura da concessionária. O valor só é incorporado ao subtotal quando o lançamento monetário estiver confirmado."
      : "O benefício foi identificado pela regra regulatória aplicável."),
    regulatoryRuleId: rule.id,
    profileState: profile?.state || "not_analyzed"
  };
}

export function resolveRegulatoryRules({ rules = [], profiles = [], unit, cycle }) {
  if (!unit) return [];
  const profileMap = latestProfiles(profiles, unit.id);
  return (Array.isArray(rules) ? rules : [])
    .filter((rule) => rule?.status === "published")
    .filter((rule) => rule.service === unit.service)
    .filter((rule) => geographyMatches(rule, unit))
    .filter((rule) => validityMatches(rule, cycle))
    .map((rule) => ({ rule, profile: profileMap.get(rule.code) || null }))
    .filter(({ rule, profile }) => profileMatches(rule, profile))
    .sort((left, right) => Number(left.rule.priority || 100) - Number(right.rule.priority || 100));
}

export function buildEnergyBillingRules(context) {
  const resolved = resolveRegulatoryRules(context);
  const benefits = [];
  const charges = [];
  const flagRates = {};
  const applied = [];

  for (const { rule, profile } of resolved) {
    const effect = rule?.effect && typeof rule.effect === "object" ? rule.effect : {};
    if (effect.type === "free_energy_band" && Number(effect.up_to_kwh) > 0 && Number(effect.discount_percent) === 100) {
      benefits.push({
        ...legalBenefitMetadata(rule, profile, effect, {
          recurring: true,
          formulaLabel: `Gratuidade de até ${Number(effect.up_to_kwh)} kWh conforme regra aplicável`
        }),
        label: rule.name,
        type: "free_kwh_credit",
        upToKwh: Number(effect.up_to_kwh),
        forecastable: effect.forecastable !== false,
        regulatoryRuleId: rule.id
      });
      applied.push({ ruleId: rule.id, code: rule.code, profileState: profile?.state || "not_analyzed", forecastable: true });
      continue;
    }
    if (effect.type === "tariff_flag_rate") {
      const flag = String(effect.flag || "").trim();
      const rate = Number(effect.rate_per_kwh);
      if (flag && Number.isFinite(rate) && rate >= 0) {
        flagRates[flag] = rate;
        applied.push({ ruleId: rule.id, code: rule.code, profileState: profile?.state || "not_analyzed", forecastable: effect.forecastable !== false });
      }
      continue;
    }
    if (effect.type === "invoice_credit_only") {
      benefits.push({
        ...legalBenefitMetadata(rule, profile, effect, {
          recurring: false,
          formulaLabel: "Crédito conforme lançamento da concessionária e ato regulatório aplicável",
          explanation: "O Desconto Itaipu foi identificado e confirmado na fatura. Como o valor monetário do lançamento ainda não foi confirmado, o VOLT o exibe como benefício legal identificado, sem atribuir automaticamente a ele a diferença restante da conta e sem projetá-lo para os próximos ciclos."
        }),
        label: rule.name,
        type: "invoice_credit_only",
        forecastable: false,
        extraordinary: true,
        regulatoryRuleId: rule.id
      });
      applied.push({ ruleId: rule.id, code: rule.code, profileState: profile?.state || "not_analyzed", forecastable: false });
    }
  }

  return { tariffBands: [], benefits, charges, flagRates, applied };
}

export function matchRegulatoryRuleForComponent(rules, component) {
  const code = normalized(component?.code);
  const label = normalized(component?.label);
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.status !== "published") continue;
    const effectCode = normalized(rule?.effect?.component_code);
    if (effectCode && effectCode === code) return rule;
    if (rule.code === "br_energy_itaipu_bonus" && (code.includes("itaipu") || label.includes("itaipu") || label.includes("10.438"))) return rule;
    if (rule.code === "br_energy_tsee_80kwh" && (code.includes("social_tariff") || label.includes("tarifa social") || label.includes("subvencao baixa renda") || label.includes("baixa renda"))) return rule;
  }
  return null;
}

export function regulatoryProfileLabel(state) {
  const labels = {
    not_analyzed: "Não analisado",
    possible: "Possível",
    apparent_eligible: "Aparentemente elegível",
    confirmed_on_bill: "Confirmado na fatura",
    not_identified: "Não identificado"
  };
  return labels[state] || "Não analisado";
}