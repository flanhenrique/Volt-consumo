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

function benefitAmount(rule, context) {
  const type = String(rule?.type || "fixed_credit");
  const cap = rule?.upToKwh == null ? context.consumptionKwh : Math.min(context.consumptionKwh, nonNegative(rule.upToKwh));
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

export function forecastEnergyBill(consumptionKwhInput, rules = {}, runtime = {}) {
  const consumptionKwh = nonNegative(consumptionKwhInput);
  const fallbackRate = nonNegative(runtime?.fallbackRate);
  const flagRate = nonNegative(runtime?.flagRate);
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
  const context = { consumptionKwh, flagRate, energySubtotal, flagGross };
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
  return { engine: "billing-rules-v1", consumptionKwh, energySubtotal, flagGross, flagNet, totalCost, items };
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
    engine: "billing-rules-v1",
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
