const MONEY_DECIMALS = 2;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value) {
  return Math.max(0, finite(value));
}

function roundMoney(value) {
  const factor = 10 ** MONEY_DECIMALS;
  return Math.round((finite(value) + Number.EPSILON) * factor) / factor;
}

function signedAmount(value, sign) {
  const amount = Math.abs(roundMoney(value));
  return sign < 0 ? -amount : amount;
}

function normalizeBands(rules, fallbackRate) {
  const configured = Array.isArray(rules?.tariffBands) ? rules.tariffBands : [];
  const bands = configured
    .map((band, index) => ({
      code: String(band?.code || `energy_band_${index + 1}`),
      label: String(band?.label || `Faixa ${index + 1}`),
      upToKwh: band?.upToKwh == null ? null : nonNegative(band.upToKwh),
      rate: nonNegative(band?.rate)
    }))
    .filter((band) => band.rate > 0)
    .sort((left, right) => {
      if (left.upToKwh == null) return 1;
      if (right.upToKwh == null) return -1;
      return left.upToKwh - right.upToKwh;
    });
  if (bands.length) return bands;
  return [{ code: "energy_base", label: "Energia", upToKwh: null, rate: nonNegative(fallbackRate) }];
}

function tariffItems(consumptionKwh, bands) {
  const items = [];
  let lowerBound = 0;
  let remaining = consumptionKwh;
  for (const band of bands) {
    if (remaining <= 0) break;
    const upperBound = band.upToKwh == null ? Infinity : Math.max(lowerBound, band.upToKwh);
    const capacity = upperBound === Infinity ? remaining : Math.max(0, upperBound - lowerBound);
    const quantityKwh = Math.min(remaining, capacity);
    if (quantityKwh > 0) {
      items.push({
        category: "energy",
        code: band.code,
        label: band.label,
        quantityKwh,
        unitRate: band.rate,
        amount: roundMoney(quantityKwh * band.rate),
        forecastable: true,
        extraordinary: false
      });
      remaining -= quantityKwh;
    }
    lowerBound = upperBound;
  }
  if (remaining > 0) {
    const last = bands.at(-1);
    items.push({
      category: "energy",
      code: `${last.code}_overflow`,
      label: last.label,
      quantityKwh: remaining,
      unitRate: last.rate,
      amount: roundMoney(remaining * last.rate),
      forecastable: true,
      extraordinary: false
    });
  }
  return items;
}

function costOfFirstKwh(items, capInput) {
  let remaining = nonNegative(capInput);
  let total = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (remaining <= 0) break;
    const quantity = nonNegative(item?.quantityKwh);
    const rate = nonNegative(item?.unitRate);
    if (quantity <= 0 || rate <= 0) continue;
    const covered = Math.min(remaining, quantity);
    total += covered * rate;
    remaining -= covered;
  }
  return roundMoney(total);
}

function benefitAmount(rule, context) {
  const type = String(rule?.type || "fixed_credit");
  const cap = rule?.upToKwh == null ? context.consumptionKwh : Math.min(context.consumptionKwh, nonNegative(rule.upToKwh));
  if (type === "free_kwh_credit") {
    return { quantityKwh: cap, unitRate: null, amount: signedAmount(costOfFirstKwh(context.energyItems, cap), -1) };
  }
  if (type === "per_kwh_credit") {
    const rate = rule?.rateSource === "flagRate" ? context.flagRate : nonNegative(rule?.rate);
    return { quantityKwh: cap, unitRate: rate, amount: signedAmount(cap * rate, -1) };
  }
  if (type === "percent_credit") {
    const percent = nonNegative(rule?.percent) / 100;
    const base = rule?.appliesTo === "flag" ? context.flagGross : context.energySubtotal;
    return { quantityKwh: null, unitRate: null, amount: signedAmount(base * percent, -1) };
  }
  return { quantityKwh: null, unitRate: null, amount: signedAmount(rule?.amount, -1) };
}

function chargeAmount(rule, context) {
  const type = String(rule?.type || "fixed_charge");
  const cap = rule?.upToKwh == null ? context.consumptionKwh : Math.min(context.consumptionKwh, nonNegative(rule.upToKwh));
  if (type === "per_kwh_charge") {
    const rate = rule?.rateSource === "flagRate" ? context.flagRate : nonNegative(rule?.rate);
    return { quantityKwh: cap, unitRate: rate, amount: signedAmount(cap * rate, 1) };
  }
  if (type === "percent_charge") {
    const percent = nonNegative(rule?.percent) / 100;
    const base = rule?.appliesTo === "flag" ? context.flagGross : context.energySubtotal;
    return { quantityKwh: null, unitRate: null, amount: signedAmount(base * percent, 1) };
  }
  return { quantityKwh: null, unitRate: null, amount: signedAmount(rule?.amount, 1) };
}

function normalizeRuleItem(rule, calculation, category) {
  return {
    category,
    code: String(rule?.code || category),
    label: String(rule?.label || rule?.code || category),
    quantityKwh: calculation.quantityKwh,
    unitRate: calculation.unitRate,
    amount: calculation.amount,
    forecastable: rule?.forecastable !== false,
    extraordinary: Boolean(rule?.extraordinary)
  };
}

function sum(items, predicate = () => true) {
  return roundMoney(items.filter(predicate).reduce((total, item) => total + finite(item?.amount), 0));
}

function verifiedFlagRate(rules, runtimeRate) {
  const candidate = nonNegative(runtimeRate);
  if (candidate === 0) return 0;
  const verified = Object.values(rules?.flagRates || {})
    .map((value) => nonNegative(value))
    .filter((value) => value > 0);
  return verified.some((value) => Math.abs(value - candidate) <= 0.0000005) ? candidate : 0;
}


/** Acionamentos oficiais por competência. Não extrapolar meses ainda não publicados.
 * https://dadosabertos.aneel.gov.br/dataset/bandeiras-tarifarias
 */
export const ANEEL_MONTHLY_FLAGS = Object.freeze({
  "2026-01": ["green", 0], "2026-02": ["green", 0], "2026-03": ["green", 0],
  "2026-04": ["green", 0], "2026-05": ["yellow", 0.01885], "2026-06": ["yellow", 0.01885],
  "2026-07": ["yellow", 0.01885], "2026-08": ["yellow", 0.01885], "2026-09": ["yellow", 0.01885],
  "2026-10": ["green", 0], "2026-11": ["green", 0]
});

function civilDay(value) {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return NaN;
  const time = Date.UTC(Number(match[1]), Number(match[2])-1, Number(match[3]));
  return new Date(time).toISOString().slice(0,10) === match[0] ? time : NaN;
}

/** Rate weighted by civil days, inclusive billing dates. Unknown competence or
 * system type is explicitly provisional and never assumed to be green/SIN. */
export function resolveCycleFlags(start, end, systemType = "not_identified") {
  const first = civilDay(start), last = civilDay(end), day = 86400000;
  const days = Math.round((last-first)/day)+1;
  if (!Number.isFinite(days) || days < 1 || days > 370) {
    return { rate: 0, complete: false, pendingMonths: [], segments: [], scope: "invalid_period" };
  }
  if (systemType === "isolated") return { rate: 0, complete: true, pendingMonths: [], segments: [], scope: "isolated" };
  const segments = [];
  for (let t=first;t<=last;t+=day) {
    const month = new Date(t).toISOString().slice(0,7);
    const entry = ANEEL_MONTHLY_FLAGS[month];
    const previous = segments.at(-1);
    if (previous?.month === month) previous.days++;
    else segments.push({ month, days: 1, flag: entry?.[0] ?? null, rate: entry?.[1] ?? null });
  }
  const pendingMonths = segments.filter(s=>s.flag===null).map(s=>s.month);
  const scope = systemType === "sin" ? "sin" : "not_identified";
  const rate = scope === "sin" ? segments.reduce((sum,s)=>sum+s.days*(s.rate ?? 0),0)/days : 0;
  return { rate, complete: !pendingMonths.length && scope==="sin", pendingMonths, segments, scope };
}

/** Project using exactly the same meter endpoints as the consumption delta.
 * The end date is a calendar estimate, not a promised meter-reading time. */
export function projectMeterCycle(readings, range, consumption) {
  const sorted = [...readings].filter(r=>Number.isFinite(Date.parse(r.date)) && Number.isFinite(Number(r.value)))
    .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const start = new Date(range.start), end = new Date(range.end);
  const last = sorted.filter(r=>new Date(r.date)>=start && new Date(r.date)<=end).at(-1);
  const baseline = range.baselineValue == null
    ? (sorted.filter(r=>new Date(r.date)<=start).at(-1) || sorted.find(r=>new Date(r.date)>=start && new Date(r.date)<=end))
    : sorted.filter(r=>new Date(r.date)<=start && Number(r.value)===Number(range.baselineValue)).at(-1);
  const measuredDays = baseline && last ? (Date.parse(last.date)-Date.parse(baseline.date))/86400000 : 0;
  // Match the last reading's local time on the final civil day.
  const remainingDays = last ? Math.max(0,(civilDay(end)-civilDay(new Date(last.date)))/86400000) : 0;
  const valid = measuredDays>0 && Number(last.value)-Number(baseline.value)===Number(consumption);
  const average = valid ? consumption/measuredDays : 0;
  return { measuredDays: valid ? measuredDays : 0, remainingDays, average,
    projectedConsumption: valid ? Math.max(consumption, consumption+average*remainingDays) : consumption };
}

export function forecastEnergyBill(consumptionKwhInput, rules = {}, runtime = {}) {
  const consumptionKwh = nonNegative(consumptionKwhInput);
  const fallbackRate = nonNegative(runtime?.fallbackRate);
  const flagPeriod = runtime.flagPeriod ? resolveCycleFlags(runtime.flagPeriod.start, runtime.flagPeriod.end, runtime.flagPeriod.systemType) : null;
  const flagRate = flagPeriod ? flagPeriod.rate : verifiedFlagRate(rules, runtime?.flagRate);
  const bands = normalizeBands(rules, fallbackRate);
  const energyItems = tariffItems(consumptionKwh, bands);
  const energySubtotal = sum(energyItems);
  const flagItem = flagRate > 0 ? {
    category: "flag",
    code: "tariff_flag",
    label: String(runtime?.flagLabel || "Bandeira tarifária"),
    quantityKwh: consumptionKwh,
    unitRate: flagRate,
    amount: roundMoney(consumptionKwh * flagRate),
    forecastable: true,
    extraordinary: false
  } : null;
  const flagGross = flagItem?.amount || 0;
  const context = { consumptionKwh, flagRate, energySubtotal, flagGross, energyItems };
  const benefitItems = (Array.isArray(rules?.benefits) ? rules.benefits : [])
    .filter((rule) => rule?.forecastable !== false)
    .map((rule) => normalizeRuleItem(rule, benefitAmount(rule, context), "benefit"))
    .filter((item) => item.amount !== 0);
  const chargeItems = (Array.isArray(rules?.charges) ? rules.charges : [])
    .filter((rule) => rule?.forecastable !== false)
    .map((rule) => normalizeRuleItem(rule, chargeAmount(rule, context), "fee"))
    .filter((item) => item.amount !== 0);
  const lightingFee = nonNegative(runtime?.lightingFee);
  const fixedItems = lightingFee > 0 ? [{
    category: "lighting",
    code: "lighting_fee",
    label: "Iluminação pública",
    quantityKwh: null,
    unitRate: null,
    amount: roundMoney(lightingFee),
    forecastable: true,
    extraordinary: false
  }] : [];
  const items = [...energyItems, ...(flagItem ? [flagItem] : []), ...benefitItems, ...chargeItems, ...fixedItems];
  const flagNet = sum(items, (item) => item.category === "flag" || (item.category === "benefit" && item.code.toLowerCase().includes("flag")));
  const totalCost = sum(items, (item) => item.forecastable !== false && !item.extraordinary);
  return { engine: flagPeriod ? "billing-rules-v3" : "billing-rules-v2", consumptionKwh, energySubtotal, flagGross, flagNet, totalCost, items, ...(flagPeriod ? { flagPeriod } : {}) };
}

export function analyzeEnergyInvoice(input = {}) {
  const measuredConsumptionKwh = nonNegative(input?.measuredConsumptionKwh);
  const billedConsumptionKwh = nonNegative(input?.billedConsumptionKwh);
  const billingBasis = String(input?.billingBasis || "metered");
  const invoiceTotal = input?.invoiceTotal == null ? null : roundMoney(input.invoiceTotal);
  const items = (Array.isArray(input?.items) ? input.items : []).map((item, index) => ({
    category: String(item?.category || "other"),
    code: String(item?.code || `item_${index + 1}`),
    label: String(item?.label || item?.code || `Item ${index + 1}`),
    quantityKwh: item?.quantityKwh == null ? null : nonNegative(item.quantityKwh),
    unitRate: item?.unitRate == null ? null : nonNegative(item.unitRate),
    amount: item?.amount == null ? null : roundMoney(item.amount),
    forecastable: item?.forecastable !== false,
    extraordinary: Boolean(item?.extraordinary)
  }));
  const knownItems = items.filter((item) => item.amount != null);
  const knownTotal = sum(knownItems);
  const meterDifferenceKwh = roundMoney(measuredConsumptionKwh - billedConsumptionKwh);
  const reconciliationStatus = meterDifferenceKwh > 0 ? "pending_underbilled" : meterDifferenceKwh < 0 ? "pending_overbilled" : "aligned";
  const unexplainedAdjustment = invoiceTotal == null ? null : roundMoney(invoiceTotal - knownTotal);
  return {
    engine: "billing-rules-v2",
    billingBasis,
    measuredConsumptionKwh,
    billedConsumptionKwh,
    meterDifferenceKwh,
    reconciliationStatus,
    knownTotal,
    invoiceTotal,
    unexplainedAdjustment,
    items
  };
}

export function analyzePersistedEnergyBill(bill = {}) {
  return analyzeEnergyInvoice({
    measuredConsumptionKwh: bill.measuredConsumptionKwh,
    billedConsumptionKwh: bill.billedConsumptionKwh,
    billingBasis: bill.billingBasis,
    invoiceTotal: bill.invoiceTotal,
    items: bill.items
  });
}
