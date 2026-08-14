import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";
import { consumptionWithinCycle, getCycleContext } from "./cycles.js?v=20260813.7";

const DAY_MS = 86400000;
const PERIOD_MONTHS = Object.freeze({ "3m": 3, "6m": 6 });
const FLAG_RATES = Object.freeze({ green: 0, yellow: 0.01885, red1: 0.04463, red2: 0.07877 });

export function buildConsumptionReportData(type, state, period) {
  const readings = [...(state.readings?.[type] || [])].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const cycle = getCycleContext(state.cycles[type]);
  const range = resolveRange(period, readings, cycle);
  const intervals = readingIntervals(readings);
  const selectedIntervals = intervals.filter((item) => inside(item.date, range));
  const consumption = period === "cycle" ? consumptionWithinCycle(readings, cycle.current) : sum(selectedIntervals);
  const days = period === "cycle" ? elapsedCycleDays(cycle.current) : periodDays(range);
  const daily = consumption / Math.max(1, days);
  const monthly = daily * 30;
  const goal = Number(state.settings?.[type]?.goal) || 0;
  const currentConsumption = consumptionWithinCycle(readings, cycle.current);
  const projection = projectCurrentCycle(currentConsumption, goal, cycle.current);
  const buckets = monthBuckets(selectedIntervals);
  const previous = previousConsumption(period, readings, intervals, cycle, range);
  const change = relativeChange(consumption, previous);
  const peak = selectedIntervals.reduce((best, item) => !best || item.value > best.value ? item : best, null);
  const billing = type === "energy" ? normalizeClosedCycleBilling(state.billing?.energy, cycle.previous) : null;
  const cycleHistory = buildCycleHistory(readings, cycle, billing);
  const contextRange = { start: new Date(cycle.previous.start), end: new Date(cycle.current.end) };
  const contextLabel = `${dateOnly(contextRange.start)} a ${dateOnly(contextRange.end)}`;
  const financial = estimateFinancial(type, consumption, state.settings?.[type] || {});
  return { type, readings, cycle, range, intervals: selectedIntervals, consumption, days, daily, monthly, goal, currentConsumption, projection, buckets, previous, change, peak, billing, cycleHistory, contextRange, contextLabel, financial };
}

export function periodLabel(period) {
  return ({ cycle: "Ciclo atual", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses", all: "Todo o histórico" })[period] || "Ciclo atual";
}

export function monthLabel(value) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(value)).replace(".", "");
}

export function cycleLabel(range) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${formatter.format(new Date(range.start))}–${formatter.format(new Date(range.end))}`;
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function dateOnly(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

export function formatNumber(value, decimals) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

export function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function flagLabel(flag) {
  return ({ green: "Verde", yellow: "Amarela", red1: "Vermelha 1", red2: "Vermelha 2" })[flag] || "Verde";
}

export function signedPercent(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(number)}`;
}

export function rangeContains(value, range) {
  return inside(value, range);
}

function estimateFinancial(type, consumption, settings) {
  if (type === "water") {
    const estimate = calculateWaterEstimate(consumption, settings);
    return {
      totalCost: Number(estimate.totalCost) || 0,
      rate: Number(settings.rate) || 0,
      sewerPercent: Number(settings.sewerPercent) || 0,
      fixedFee: Number(settings.fixedFee) || 0
    };
  }
  const flagRate = FLAG_RATES[settings.flag] ?? 0;
  const estimate = calculateEnergyEstimate(consumption, {
    rate: settings.rate,
    flagRate,
    lightingFee: settings.lightingFee,
    flagLabel: settings.flag
  });
  return {
    totalCost: Number(estimate.totalCost) || 0,
    baseCost: Number(estimate.baseCost) || 0,
    flagCost: Number(estimate.flagCost) || 0,
    rate: Number(settings.rate) || 0,
    flag: settings.flag || "green",
    flagRate,
    lightingFee: Number(settings.lightingFee) || 0
  };
}

function normalizeClosedCycleBilling(input, range) {
  if (!input || typeof input !== "object" || !billingMatchesRange(input, range)) return null;
  return {
    cycleStart: input.cycleStart || null,
    cycleEnd: input.cycleEnd || null,
    range: { start: range.start, end: range.end },
    measuredConsumptionKwh: finiteOrNull(input.measuredConsumptionKwh),
    billedConsumptionKwh: finiteOrNull(input.billedConsumptionKwh),
    billingBasis: String(input.billingBasis || "metered"),
    invoiceTotal: finiteOrNull(input.invoiceTotal),
    items: Array.isArray(input.items) ? input.items.map((item, index) => ({
      category: String(item?.category || "other"),
      code: String(item?.code || `item_${index + 1}`),
      label: String(item?.label || item?.code || `Item ${index + 1}`),
      quantityKwh: finiteOrNull(item?.quantityKwh),
      unitRate: finiteOrNull(item?.unitRate),
      amount: finiteOrNull(item?.amount),
      amountStatus: String(item?.amountStatus || ""),
      forecastable: item?.forecastable !== false,
      extraordinary: Boolean(item?.extraordinary)
    })) : []
  };
}

function buildCycleHistory(readings, cycle, billing) {
  const measuredPreviousValue = consumptionWithinCycle(readings, cycle.previous);
  const previousValue = billing?.measuredConsumptionKwh ?? measuredPreviousValue;
  const currentValue = consumptionWithinCycle(readings, cycle.current);
  const previousDays = fullCycleDays(cycle.previous);
  const currentDays = elapsedCycleDays(cycle.current);
  return [
    {
      range: billing?.range || cycle.previous,
      value: previousValue,
      daily: previousValue / Math.max(1, previousDays),
      status: billing ? "Fechado · fatura" : "Fechado",
      isCurrent: false,
      hasInvoice: Boolean(billing)
    },
    { range: cycle.current, value: currentValue, daily: currentValue / Math.max(1, currentDays), status: "Em andamento", isCurrent: true, hasInvoice: false }
  ];
}

function billingMatchesRange(input, range) {
  const invoiceStart = calendarKey(input.cycleStart);
  const invoiceEnd = calendarKey(input.cycleEnd);
  const expectedStart = calendarKey(range.start);
  const expectedEnd = calendarKey(range.end);
  if (invoiceStart && expectedStart && invoiceStart !== expectedStart) return false;
  if (invoiceEnd && expectedEnd && invoiceEnd !== expectedEnd) return false;
  return true;
}

function calendarKey(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveRange(period, readings, cycle) {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  if (period === "cycle") return { start: new Date(cycle.current.start), end: new Date(cycle.current.end) };
  if (PERIOD_MONTHS[period]) {
    const start = new Date(now);
    start.setMonth(start.getMonth() - PERIOD_MONTHS[period]);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  const first = readings[0] ? new Date(readings[0].date) : new Date(now.getFullYear(), now.getMonth(), 1);
  first.setHours(0, 0, 0, 0);
  return { start: first, end: now };
}

function readingIntervals(readings) {
  return readings.slice(1).map((reading, index) => ({
    value: Math.max(0, Number(reading.value) - Number(readings[index].value)),
    date: reading.date,
    startDate: readings[index].date
  }));
}

function previousConsumption(period, readings, intervals, cycle, range) {
  if (period === "cycle") return consumptionWithinCycle(readings, cycle.previous);
  if (PERIOD_MONTHS[period]) {
    const previousRange = { end: new Date(range.start.getTime() - 1), start: new Date(range.start) };
    previousRange.start.setMonth(previousRange.start.getMonth() - PERIOD_MONTHS[period]);
    return sum(intervals.filter((item) => inside(item.date, previousRange)));
  }
  return NaN;
}

function projectCurrentCycle(consumption, goal, range) {
  const totalDays = fullCycleDays(range);
  const elapsedDays = elapsedCycleDays(range);
  const projected = (Number(consumption) || 0) / Math.max(1, elapsedDays) * totalDays;
  return { projected, goal, ratio: goal > 0 ? projected / goal : 0, elapsedDays, totalDays };
}

function monthBuckets(intervals) {
  const map = new Map();
  intervals.forEach((item) => {
    const date = new Date(item.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) map.set(key, { date: new Date(date.getFullYear(), date.getMonth(), 1), value: 0 });
    map.get(key).value += Number(item.value) || 0;
  });
  return [...map.values()].sort((a, b) => a.date - b.date);
}

function fullCycleDays(range) {
  return Math.max(1, Math.ceil((new Date(range.end).getTime() - new Date(range.start).getTime()) / DAY_MS) + 1);
}

function elapsedCycleDays(range) {
  const start = new Date(range.start).getTime();
  const end = new Date(range.end).getTime();
  const effectiveEnd = Math.min(Date.now(), end);
  return Math.max(1, Math.ceil((effectiveEnd - start) / DAY_MS) + 1);
}

function periodDays(range) {
  const end = Math.min(Date.now(), new Date(range.end).getTime());
  return Math.max(1, Math.ceil((end - new Date(range.start).getTime()) / DAY_MS) + 1);
}

function inside(value, range) {
  const date = new Date(value);
  return date >= new Date(range.start) && date <= new Date(range.end);
}

function sum(items) {
  return items.reduce((total, item) => total + (Number(item.value) || 0), 0);
}

function relativeChange(current, previous) {
  if (previous > 0) return (current - previous) / previous;
  return current > 0 ? NaN : 0;
}
