import { calculateEnergyEstimate, calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";
import { forecastEnergyBill } from "../packages/consumption-domain/browser/billing-engine.js?v=20260813.7";
import { getApplicationStateSnapshot, StartupStatus } from "./app-state.js?v=20260813.7";
import { consumptionWithinCycle, getCycleContext } from "./cycles.js?v=20260813.7";

export const WIDGET_SNAPSHOT_VERSION = 2;
export const GRID_FACTOR_KG_CO2E_PER_KWH = 0.0385;

const FLAGS = Object.freeze({ green: 0, yellow: 0.01885, red1: 0.04463, red2: 0.07877 });
let lastPublishedFingerprint = "";

export function createWidgetSnapshot(state = getApplicationStateSnapshot(), now = new Date()) {
  if (!isReadyState(state)) return null;

  const energy = utilitySnapshot("energy", state, now);
  const water = utilitySnapshot("water", state, now);
  const totalCurrentCost = energy.currentCost + water.currentCost;
  const totalProjectedCost = energy.projectedCost + water.projectedCost;

  return Object.freeze({
    version: WIDGET_SNAPSHOT_VERSION,
    capturedAt: new Date(now).toISOString(),
    cycleLabel: energy.cycle.label,
    energyConsumption: energy.consumption,
    energyGoal: energy.goal,
    energyProgress: energy.ratio,
    energyProjectedConsumption: energy.projectedConsumption,
    energyCurrentCost: energy.currentCost,
    energyProjectedCost: energy.projectedCost,
    totalCurrentCost,
    totalProjectedCost,
    waterConsumption: water.consumption,
    waterGoal: water.goal,
    waterProgress: water.ratio,
    waterProjectedConsumption: water.projectedConsumption,
    waterCurrentCost: water.currentCost,
    waterProjectedCost: water.projectedCost,
    co2Kg: energy.consumption * GRID_FACTOR_KG_CO2E_PER_KWH,
    projectedCo2Kg: energy.projectedConsumption * GRID_FACTOR_KG_CO2E_PER_KWH,
    energyStatus: energy.status.label,
    energyStatusTone: energy.status.tone,
    confidence: energy.confidence
  });
}

export function publishWidgetSnapshot(state = getApplicationStateSnapshot(), now = new Date()) {
  const snapshot = createWidgetSnapshot(state, now);
  if (!snapshot || typeof window === "undefined" || typeof CustomEvent === "undefined") return snapshot;

  const fingerprint = JSON.stringify({ ...snapshot, capturedAt: undefined });
  if (fingerprint === lastPublishedFingerprint) return snapshot;
  lastPublishedFingerprint = fingerprint;

  globalThis.__VOLT_WIDGET_SNAPSHOT__ = snapshot;
  window.dispatchEvent(new CustomEvent("volt:widget-snapshot", { detail: snapshot }));
  return snapshot;
}

function utilitySnapshot(type, state, now) {
  const settings = state.settings[type];
  const cycle = getCycleContext(state.cycles[type], now);
  const readings = state.readings[type];
  const consumption = consumptionWithinCycle(readings, cycle.current);
  const progress = cycleProgress(cycle.current, now);
  const lastReading = latestReadingForRange(readings, cycle.current);
  const measuredDays = lastReading
    ? clampNumber(dayDifference(cycle.current.start, dayStart(lastReading.date)), 0, progress.totalDays)
    : 0;
  const dailyAverage = measuredDays > 0 ? consumption / measuredDays : 0;
  const projectedConsumption = measuredDays > 0
    ? Math.max(consumption, dailyAverage * progress.totalDays)
    : consumption;
  const currentCost = estimateUtilityCost(type, consumption, state);
  const projectedCost = estimateUtilityCost(type, projectedConsumption, state);
  const goal = Number(settings.goal) || 0;
  const ratio = goal > 0 ? consumption / goal : 0;
  const forecastRatio = goal > 0 ? projectedConsumption / goal : 0;
  const status = forecastRatio > 1
    ? { label: "Previsão acima da meta", tone: "danger" }
    : forecastRatio >= .9
      ? { label: "Próximo da meta", tone: "warning" }
      : { label: "Dentro da meta", tone: "success" };

  return {
    cycle,
    consumption,
    goal,
    ratio,
    projectedConsumption,
    currentCost,
    projectedCost,
    status,
    confidence: measuredDays > 0 ? "measured" : "insufficient_data"
  };
}

function estimateUtilityCost(type, consumption, state) {
  if (type === "water") return calculateWaterEstimate(consumption, state.settings.water).totalCost;

  const settings = state.settings.energy;
  const rules = globalThis.__VOLT_BILLING_CONTEXT__?.profile?.rules;
  if (rules) {
    return forecastEnergyBill(consumption, rules, {
      fallbackRate: settings.rate,
      flagRate: FLAGS[settings.flag] ?? 0,
      flagLabel: "Bandeira tarifária",
      lightingFee: settings.lightingFee
    }).totalCost;
  }

  return calculateEnergyEstimate(consumption, {
    rate: settings.rate,
    flagRate: FLAGS[settings.flag] ?? 0,
    lightingFee: settings.lightingFee
  }).totalCost;
}

function isReadyState(state) {
  return state?.status === StartupStatus.READY
    && state?.settings?.energy
    && state?.settings?.water
    && state?.cycles?.energy
    && state?.cycles?.water
    && Array.isArray(state?.readings?.energy)
    && Array.isArray(state?.readings?.water);
}

function latestReadingForRange(readings, range) {
  return [...readings]
    .filter((reading) => {
      const date = new Date(reading.date);
      return date >= range.start && date <= range.end;
    })
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
    .at(-1) || null;
}

function cycleProgress(range, now) {
  const totalDays = Math.max(1, dayDifference(range.start, range.end));
  const today = dayStart(now);
  const bounded = today < range.start ? range.start : today > range.end ? range.end : today;
  const elapsedDays = clampNumber(dayDifference(range.start, bounded), 0, totalDays);
  return { totalDays, elapsedDays };
}

function dayStart(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDifference(left, right) {
  return Math.max(0, Math.round((dayStart(right).getTime() - dayStart(left).getTime()) / 86400000));
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}
