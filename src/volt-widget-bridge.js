import { getApplicationStateSnapshot } from './app-state.js?v=20260813.7';
import { buildWidgetSnapshot, parseCycleProgress, parseLocaleNumber, parseNativeRoute } from './widget-snapshot-adapter.mjs?v=20260813.7';

const handler = () => globalThis.webkit?.messageHandlers?.voltWidget;
const text = (id) => document.getElementById(id)?.textContent?.trim() || '';
const value = (id) => document.getElementById(id)?.value ?? '';

function newestReading(readings = []) {
  const reading = [...readings].sort((a, b) => {
    const at = (item) => Date.parse(item?.reading_at || item?.read_at || item?.created_at || item?.date || 0) || 0;
    return at(b) - at(a);
  })[0];
  return reading?.reading_at || reading?.read_at || reading?.created_at || reading?.date || null;
}

function snapshotInput() {
  const state = getApplicationStateSnapshot();
  if (state.status !== 'READY') return null;
  const cycle = parseCycleProgress(text('consumption-cycle-days'));
  const energyValue = parseLocaleNumber(text('home-energy-consumption'));
  const waterValue = parseLocaleNumber(text('home-water-consumption'));
  const energyGoal = parseLocaleNumber(text('home-energy-goal'));
  const waterGoal = parseLocaleNumber(text('home-water-goal'));
  const energyCost = parseLocaleNumber(text('home-energy-cost'));
  const waterCost = parseLocaleNumber(text('home-water-cost'));
  const totalCost = parseLocaleNumber(text('home-total-cost'));

  const elapsed = cycle.elapsed;
  const total = cycle.total;
  const energyAverage = elapsed && energyValue != null ? energyValue / elapsed : null;
  const waterAverage = elapsed && waterValue != null ? waterValue / elapsed : null;

  return {
    accountLabel: state.identity?.display_name || state.identity?.name || state.account?.name || state.organization?.name || null,
    energy: {
      value: energyValue,
      goal: energyGoal,
      estimatedCostBRL: energyCost,
      dailyAverage: energyAverage,
      cycleElapsedDays: elapsed,
      cycleTotalDays: total,
      lastReadingAt: newestReading(state.readings?.energy),
    },
    water: {
      value: waterValue,
      goal: waterGoal,
      estimatedCostBRL: waterCost,
      dailyAverage: waterAverage,
      cycleElapsedDays: elapsed,
      cycleTotalDays: total,
      lastReadingAt: newestReading(state.readings?.water),
    },
    totalEstimatedCostBRL: totalCost,
    tariffFlagLabel: text('home-insight-title').replace(/^Bandeira\s+/i, '') || value('energy-flag') || null,
    accent: state.view?.accent || document.documentElement.dataset.accent || 'emerald',
    preferredTheme: state.view?.theme || document.documentElement.dataset.theme || 'system',
  };
}

function openReadingRoute(service, readingStep) {
  const trigger = document.querySelector('[data-action="open-reading"]');
  if (!trigger) return false;
  trigger.click();

  queueMicrotask(() => {
    if (service) document.querySelector(`[data-reading-type="${service}"]`)?.click();
    if (readingStep !== 'review') return;

    const typeContinue = document.querySelector('[data-reading-panel="type"] .primary-button');
    typeContinue?.click();
    queueMicrotask(() => {
      const captureContinue = document.querySelector('[data-reading-panel="capture"] .primary-button');
      captureContinue?.click();
      queueMicrotask(() => document.getElementById('reading-value')?.focus());
    });
  });
  return true;
}

function applyNativeRoute(path) {
  const route = parseNativeRoute(path);
  let applied = false;

  if (route.page === 'reading') {
    applied = openReadingRoute(route.service, route.readingStep);
  } else {
    const navigation = document.querySelector(`[data-nav="${route.page}"]`);
    if (navigation) {
      navigation.click();
      applied = true;
      if (route.page === 'consumption' && route.service) {
        queueMicrotask(() => document.querySelector(`[data-consumption-type="${route.service}"]`)?.click());
      }
    }
  }

  if (applied && globalThis.__VOLT_PENDING_NATIVE_ROUTE__ === path) {
    delete globalThis.__VOLT_PENDING_NATIVE_ROUTE__;
  }
  return applied;
}

export function syncVoltWidgets() {
  const target = handler();
  if (!target?.postMessage) return false;
  const input = snapshotInput();
  if (!input) return false;
  target.postMessage(buildWidgetSnapshot(input));
  return true;
}

let scheduled = false;
function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    syncVoltWidgets();
  }, 80);
}

function consumePendingNativeRoute() {
  const path = globalThis.__VOLT_PENDING_NATIVE_ROUTE__;
  if (typeof path !== 'string' || !path) return false;
  return applyNativeRoute(path);
}

if (typeof window !== 'undefined') {
  window.addEventListener('volt:startup-status', (event) => {
    if (event.detail?.status === 'SIGNED_OUT') {
      handler()?.postMessage?.({ command: 'clear' });
      consumePendingNativeRoute();
      return;
    }
    if (event.detail?.status === 'READY') {
      scheduleSync();
      consumePendingNativeRoute();
    }
  });
  window.addEventListener('volt:native-route', (event) => {
    const path = event.detail?.path;
    if (typeof path === 'string' && path) {
      globalThis.__VOLT_PENDING_NATIVE_ROUTE__ = path;
      applyNativeRoute(path);
    }
  });
  window.addEventListener('volt:regulatory-context', scheduleSync);
  window.addEventListener('volt:widget-sync', scheduleSync);
  document.addEventListener('change', (event) => {
    if (event.target?.id && ['energy-flag', 'energy-rate', 'lighting-fee'].includes(event.target.id)) scheduleSync();
  });
  queueMicrotask(consumePendingNativeRoute);
}
