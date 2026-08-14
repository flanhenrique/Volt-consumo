const DEFAULT_CYCLE = Object.freeze({ start: 1, end: 31 });

export function normalizeCycle(value) {
  const start = Number(value?.start);
  const end = Number(value?.end);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && start <= 31 && end >= 1 && end <= 31
    ? { start, end }
    : { ...DEFAULT_CYCLE };
}

export function loadCycleState(user) {
  const cycles = user?.user_metadata?.cycles || {};
  return { energy: normalizeCycle(cycles.energy), water: normalizeCycle(cycles.water) };
}

export function getCycleContext(preference, now = new Date()) {
  const exact = exactCycleContext(preference);
  if (exact) return exact;

  const cycle = normalizeCycle(preference);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let start = occurrenceOnOrBefore(today, cycle.start);
  let end = occurrenceAfter(start, cycle.end);
  if (now > end) {
    start = occurrenceAfter(start, cycle.start);
    end = occurrenceAfter(start, cycle.end);
  }
  const previousEnd = new Date(start.getTime() - 1);
  return {
    preference: cycle,
    current: { start, end },
    previous: { start: occurrenceOnOrBefore(previousEnd, cycle.start), end: previousEnd },
    label: formatRange(start, end)
  };
}

export function consumptionWithinCycle(readings, range) {
  const sorted = [...readings].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
  const base = sorted.filter((item) => new Date(item.date) <= range.start).at(-1);
  const latest = sorted.filter((item) => new Date(item.date) <= range.end).at(-1);
  if (base && latest && Date.parse(latest.date) > Date.parse(base.date)) return Math.max(0, Number(latest.value) - Number(base.value));
  const contained = sorted.filter((item) => {
    const date = new Date(item.date);
    return date >= range.start && date <= range.end;
  });
  return contained.length >= 2 ? Math.max(0, Number(contained.at(-1).value) - Number(contained[0].value)) : 0;
}

function exactCycleContext(preference) {
  if (!preference || typeof preference !== "object") return null;
  const current = normalizeExactRange(preference.exactCurrent || preference.current);
  if (!current) return null;
  const previous = normalizeExactRange(preference.exactPrevious || preference.previous);
  const cycle = normalizeCycle(preference);
  return {
    preference: cycle,
    current,
    previous: previous || previousRangeFromCurrent(current, cycle.start),
    label: formatRange(current.start, current.end),
    exact: true
  };
}

function normalizeExactRange(value) {
  if (!value?.start || !value?.end) return null;
  const start = calendarDate(value.start, false);
  const end = calendarDate(value.end, true);
  if (!start || !end || end < start) return null;
  return { start, end };
}

function previousRangeFromCurrent(current, startDay) {
  const end = new Date(current.start.getTime() - 1);
  return { start: occurrenceOnOrBefore(end, startDay), end };
}

function calendarDate(value, endOfDay) {
  if (value instanceof Date) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date;
  }
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
}

function occurrenceOnOrBefore(reference, day) {
  const candidate = cycleDate(reference.getFullYear(), reference.getMonth(), day, false);
  return candidate <= reference ? candidate : cycleDate(reference.getFullYear(), reference.getMonth() - 1, day, false);
}

function occurrenceAfter(reference, day) {
  let candidate = cycleDate(reference.getFullYear(), reference.getMonth(), day, true);
  if (candidate <= reference) candidate = cycleDate(reference.getFullYear(), reference.getMonth() + 1, day, true);
  return candidate;
}

function cycleDate(year, month, day, endOfDay) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const date = new Date(year, month, Math.min(day, lastDay));
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
}

function formatRange(start, end) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  return `${formatter.format(start).replace(".", "")} – ${formatter.format(end).replace(".", "")}`;
}
