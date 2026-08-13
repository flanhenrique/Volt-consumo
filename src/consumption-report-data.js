import { consumptionWithinCycle, getCycleContext } from "./cycles.js?v=20260813.7";

const DAY_MS = 86400000;
const PERIOD_MONTHS = Object.freeze({ "3m": 3, "6m": 6 });

export function buildConsumptionReportData(type, state, period) {
  const readings = [...(state.readings?.[type] || [])].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const cycle = getCycleContext(state.cycles[type]);
  const range = resolveRange(period, readings, cycle);
  const intervals = readingIntervals(readings);
  const selectedIntervals = intervals.filter((item) => inside(item.date, range));
  const consumption = period === "cycle" ? consumptionWithinCycle(readings, cycle.current) : sum(selectedIntervals);
  const days = periodDays(range);
  const daily = consumption / Math.max(1, days);
  const monthly = daily * 30;
  const goal = Number(state.settings[type].goal) || 0;
  const currentConsumption = consumptionWithinCycle(readings, cycle.current);
  const projection = projectCurrentCycle(currentConsumption, goal, cycle.current);
  const buckets = monthBuckets(selectedIntervals);
  const previous = previousConsumption(period, readings, intervals, cycle, range);
  const change = relativeChange(consumption, previous);
  const peak = selectedIntervals.reduce((best, item) => !best || item.value > best.value ? item : best, null);
  return { type, readings, cycle, range, intervals: selectedIntervals, consumption, days, daily, monthly, goal, currentConsumption, projection, buckets, previous, change, peak };
}

export function periodLabel(period) {
  return ({ cycle: "Ciclo atual", "3m": "Últimos 3 meses", "6m": "Últimos 6 meses", all: "Todo o histórico" })[period] || "Últimos 6 meses";
}

export function monthLabel(value) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(value)).replace(".", "");
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

export function signedPercent(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(number)}`;
}

export function rangeContains(value, range) {
  return inside(value, range);
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
  const start = new Date(range.start);
  const end = new Date(range.end);
  const now = new Date();
  const totalDays = Math.max(1, Math.ceil((end - start) / DAY_MS) + 1);
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.ceil((Math.min(now.getTime(), end.getTime()) - start.getTime()) / DAY_MS) + 1));
  const projected = (Number(consumption) || 0) / elapsedDays * totalDays;
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
