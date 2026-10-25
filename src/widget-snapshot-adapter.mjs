export const SCHEMA_VERSION = 1;

const finite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function makeService(kind, input = {}) {
  const value = finite(input.value);
  if (value == null || value < 0) return null;
  const goal = finite(input.goal);
  const dailyAverage = finite(input.dailyAverage);
  const totalDays = Number.isInteger(Number(input.cycleTotalDays)) ? Number(input.cycleTotalDays) : null;
  let projectedValue = finite(input.projectedValue);
  if (projectedValue == null && dailyAverage != null && totalDays > 0) {
    projectedValue = Math.max(value, dailyAverage * totalDays);
  }
  return {
    kind,
    value,
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

export function buildWidgetSnapshot(input = {}, now = new Date()) {
  const energy = makeService('energy', input.energy);
  const water = makeService('water', input.water);
  const total = finite(input.totalEstimatedCostBRL);
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    accountLabel: input.accountLabel || null,
    energy,
    water,
    tariffFlagLabel: input.tariffFlagLabel || null,
    totalEstimatedCostBRL: total,
    accent: input.accent || 'emerald',
    preferredTheme: input.preferredTheme || 'system',
  };
}

export function parseLocaleNumber(value) {
  if (value == null) return null;
  let text = String(value).trim().replace(/\s/g, '');
  if (!text) return null;
  text = text.replace(/[^\d,.-]/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  const number = Number.parseFloat(text);
  return Number.isFinite(number) ? number : null;
}

export function parseCycleProgress(value) {
  const match = String(value || '').match(/(\d+)\s+de\s+(\d+)\s+dias/i);
  if (!match) return { elapsed: null, total: null };
  return { elapsed: Number(match[1]), total: Number(match[2]) };
}

export function parseNativeRoute(path) {
  const normalized = String(path || 'home')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
  if (!normalized || normalized === 'home') return { page: 'home', service: null, readingStep: null };
  const [page, service] = normalized.split('/');
  if (page === 'consumption' && ['energy', 'water'].includes(service)) {
    return { page: 'consumption', service, readingStep: null };
  }
  if (page === 'consumption') return { page: 'consumption', service: null, readingStep: null };
  if (page === 'reading') {
    return {
      page: 'reading',
      service: ['energy', 'water'].includes(service) ? service : null,
      readingStep: ['energy', 'water'].includes(service) ? 'review' : 'type',
    };
  }
  return { page: 'home', service: null, readingStep: null };
}
