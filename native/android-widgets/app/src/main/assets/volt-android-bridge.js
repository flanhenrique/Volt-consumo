globalThis.__VOLT_ANDROID_BRIDGE_PROMISE__ ||= (async () => {
  const { getApplicationStateSnapshot } = await import('./src/app-state.js?v=20260813.7');

  const nativeHandler = () => globalThis.voltAndroidWidget;
  const text = (id) => document.getElementById(id)?.textContent?.trim() || '';
  const value = (id) => document.getElementById(id)?.value ?? '';
  const finite = (input) => {
    const number = Number(input);
    return Number.isFinite(number) ? number : null;
  };

  function postNative(message) {
    const handler = nativeHandler();
    if (!handler?.postMessage) return false;
    handler.postMessage(JSON.stringify(message));
    return true;
  }

  function parseLocaleNumber(input) {
    if (input == null) return null;
    let normalized = String(input).trim().replace(/\s/g, '');
    if (!normalized) return null;
    normalized = normalized.replace(/[^\d,.-]/g, '');
    if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    const number = Number.parseFloat(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function parseCycleProgress(input) {
    const match = String(input || '').match(/(\d+)\s+de\s+(\d+)\s+dias/i);
    return match ? { elapsed: Number(match[1]), total: Number(match[2]) } : { elapsed: null, total: null };
  }

  function makeService(kind, input = {}) {
    const serviceValue = finite(input.value);
    if (serviceValue == null || serviceValue < 0) return null;
    const goal = finite(input.goal);
    const dailyAverage = finite(input.dailyAverage);
    const totalDays = Number.isInteger(Number(input.cycleTotalDays)) ? Number(input.cycleTotalDays) : null;
    let projectedValue = finite(input.projectedValue);
    if (projectedValue == null && dailyAverage != null && totalDays > 0) {
      projectedValue = Math.max(serviceValue, dailyAverage * totalDays);
    }
    return {
      kind,
      value: serviceValue,
      unit: kind === 'energy' ? 'kWh' : 'm³',
      goal: goal != null && goal > 0 ? goal : null,
      projectedValue,
      estimatedCostBRL: finite(input.estimatedCostBRL),
      dailyAverage,
      cycleElapsedDays: Number.isInteger(Number(input.cycleElapsedDays)) ? Number(input.cycleElapsedDays) : null,
      cycleTotalDays: totalDays,
      lastReadingAt: input.lastReadingAt || null,
    };
  }

  function buildWidgetSnapshot(input = {}) {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      accountLabel: input.accountLabel || null,
      energy: makeService('energy', input.energy),
      water: makeService('water', input.water),
      tariffFlagLabel: input.tariffFlagLabel || null,
      totalEstimatedCostBRL: finite(input.totalEstimatedCostBRL),
      accent: input.accent || 'emerald',
      preferredTheme: input.preferredTheme || 'system',
    };
  }

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
    const elapsed = cycle.elapsed;
    return {
      accountLabel: state.identity?.display_name || state.identity?.name || state.account?.name || state.organization?.name || null,
      energy: {
        value: energyValue,
        goal: parseLocaleNumber(text('home-energy-goal')),
        estimatedCostBRL: parseLocaleNumber(text('home-energy-cost')),
        dailyAverage: elapsed && energyValue != null ? energyValue / elapsed : null,
        cycleElapsedDays: elapsed,
        cycleTotalDays: cycle.total,
        lastReadingAt: newestReading(state.readings?.energy),
      },
      water: {
        value: waterValue,
        goal: parseLocaleNumber(text('home-water-goal')),
        estimatedCostBRL: parseLocaleNumber(text('home-water-cost')),
        dailyAverage: elapsed && waterValue != null ? waterValue / elapsed : null,
        cycleElapsedDays: elapsed,
        cycleTotalDays: cycle.total,
        lastReadingAt: newestReading(state.readings?.water),
      },
      totalEstimatedCostBRL: parseLocaleNumber(text('home-total-cost')),
      tariffFlagLabel: text('home-insight-title').replace(/^Bandeira\s+/i, '') || value('energy-flag') || null,
      accent: state.view?.accent || document.documentElement.dataset.accent || 'emerald',
      preferredTheme: state.view?.theme || document.documentElement.dataset.theme || 'system',
    };
  }

  function parseNativeRoute(path) {
    const normalized = String(path || 'home').replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!normalized || normalized === 'home') return { page: 'home', service: null, readingStep: null };
    const [page, service] = normalized.split('/');
    if (page === 'consumption') {
      return { page: 'consumption', service: ['energy', 'water'].includes(service) ? service : null, readingStep: null };
    }
    if (page === 'reading') {
      return {
        page: 'reading',
        service: ['energy', 'water'].includes(service) ? service : null,
        readingStep: ['energy', 'water'].includes(service) ? 'review' : 'type',
      };
    }
    return { page: 'home', service: null, readingStep: null };
  }

  function openReadingRoute(service, readingStep) {
    const trigger = document.querySelector('[data-action="open-reading"]');
    if (!trigger) return false;
    trigger.click();
    queueMicrotask(() => {
      if (service) document.querySelector(`[data-reading-type="${service}"]`)?.click();
      if (readingStep !== 'review') return;
      document.querySelector('[data-reading-panel="type"] .primary-button')?.click();
      queueMicrotask(() => {
        document.querySelector('[data-reading-panel="capture"] .primary-button')?.click();
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
    if (applied) postNative({ command: 'route-applied', path });
    return applied;
  }

  globalThis.__voltAndroidSyncWidgets = () => {
    const input = snapshotInput();
    return input ? postNative(buildWidgetSnapshot(input)) : false;
  };
  globalThis.__voltAndroidDispatchRoute = applyNativeRoute;

  let scheduled = false;
  const scheduleSync = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      globalThis.__voltAndroidSyncWidgets?.();
    }, 80);
  };

  window.addEventListener('volt:startup-status', (event) => {
    if (event.detail?.status === 'SIGNED_OUT') {
      postNative({ command: 'clear' });
      return;
    }
    if (event.detail?.status === 'READY') scheduleSync();
  });
  window.addEventListener('volt:regulatory-context', scheduleSync);
  document.addEventListener('change', (event) => {
    if (event.target?.id && ['energy-flag', 'energy-rate', 'lighting-fee'].includes(event.target.id)) scheduleSync();
  });

  postNative({ command: 'bridge-ready' });
  scheduleSync();
  return true;
})();
