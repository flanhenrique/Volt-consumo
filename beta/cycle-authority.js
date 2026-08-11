const CONFIG = window.VOLT_SUPABASE_BETA || {};
const ENERGY_KEY = "volt-beta-energy-cycle-v1";
const WATER_KEY = "volt-beta-water-cycle-v1";
const LEGACY_KEY = "volt-beta-v2-cycle";

let client = null;
let context = { energy: null, water: null };
let enforcing = false;

queueMicrotask(initCycleAuthority);

function initCycleAuthority() {
  bindAuth();
  window.addEventListener("volt:beta-data", () => queueMicrotask(enforceAuthoritativeCycles));
  window.addEventListener("volt:cycle-context-request", () => enforceAuthoritativeCycles());

  const label = document.querySelector("#beta-cycle-label");
  if (label) {
    new MutationObserver(() => {
      if (!enforcing) queueMicrotask(enforceAuthoritativeCycles);
    }).observe(label, { childList: true, characterData: true, subtree: true });
  }

  enforceAuthoritativeCycles();
}

function getClient() {
  if (client) return client;
  if (!window.supabase?.createClient || !CONFIG.url || !CONFIG.publishableKey) return null;
  client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return client;
}

function bindAuth() {
  const supabase = getClient();
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) applyAccountCycles(session.user);
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data?.session?.user) applyAccountCycles(data.session.user);
  }).catch(() => undefined);
}

function applyAccountCycles(user) {
  const cycles = user?.user_metadata?.cycles;
  if (!cycles || typeof cycles !== "object") {
    enforceAuthoritativeCycles();
    return;
  }
  const energy = normalize(cycles.energy);
  const water = normalize(cycles.water);
  if (energy) write(ENERGY_KEY, energy);
  if (water) write(WATER_KEY, water);
  // O ciclo legado não pode voltar a ser a fonte de verdade.
  try { localStorage.removeItem(LEGACY_KEY); } catch {}
  enforceAuthoritativeCycles();
}

function enforceAuthoritativeCycles() {
  const energy = normalize(read(ENERGY_KEY));
  const water = normalize(read(WATER_KEY));
  context = {
    energy: energy ? buildContext(energy) : null,
    water: water ? buildContext(water) : null
  };

  Object.defineProperty(window, "VOLT_CYCLE_CONTEXT", {
    configurable: true,
    value: Object.freeze({
      energy: context.energy ? structuredClone(context.energy) : null,
      water: context.water ? structuredClone(context.water) : null
    })
  });

  const label = document.querySelector("#beta-cycle-label");
  if (label) {
    const parts = [];
    if (context.energy) parts.push(`Energia ${context.energy.labelCompact}`);
    if (context.water) parts.push(`Água ${context.water.labelCompact}`);
    const expected = parts.length ? parts.join(" · ") : "Ciclos não configurados";
    if (label.textContent !== expected) {
      enforcing = true;
      label.textContent = expected;
      enforcing = false;
    }
  }

  window.dispatchEvent(new CustomEvent("volt:cycle-context", {
    detail: window.VOLT_CYCLE_CONTEXT
  }));
}

function buildContext(preference) {
  const range = currentRange(preference);
  return {
    preference,
    current: range.current,
    previous: range.previous,
    label: formatRange(range.current, true),
    labelCompact: formatRange(range.current, false)
  };
}

function currentRange(preference) {
  const now = new Date();
  const today = startOfDay(now);
  let start = occurrenceOnOrBefore(today, preference.start);
  let end = occurrenceAfter(start, preference.end);
  if (now > end) {
    start = occurrenceAfterStart(start, preference.start);
    end = occurrenceAfter(start, preference.end);
  }
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = occurrenceOnOrBefore(previousEnd, preference.start);
  return { current: { start, end }, previous: { start: previousStart, end: previousEnd } };
}

function occurrenceOnOrBefore(reference, day) {
  let candidate = localDate(reference.getFullYear(), reference.getMonth(), day, false);
  if (candidate <= reference) return candidate;
  return localDate(reference.getFullYear(), reference.getMonth() - 1, day, false);
}

function occurrenceAfter(reference, day) {
  let candidate = localDate(reference.getFullYear(), reference.getMonth(), day, true);
  if (candidate <= reference) candidate = localDate(reference.getFullYear(), reference.getMonth() + 1, day, true);
  return candidate;
}

function occurrenceAfterStart(reference, day) {
  let candidate = localDate(reference.getFullYear(), reference.getMonth(), day, false);
  if (candidate <= reference) candidate = localDate(reference.getFullYear(), reference.getMonth() + 1, day, false);
  return candidate;
}

function localDate(year, month, day, endOfDay) {
  const last = new Date(year, month + 1, 0).getDate();
  const date = new Date(year, month, Math.min(day, last));
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatRange(range, longMonth) {
  const options = longMonth
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "2-digit" };
  const formatter = new Intl.DateTimeFormat("pt-BR", options);
  const clean = (value) => formatter.format(value).replace(".", "");
  return `${clean(range.start)}–${clean(range.end)}`;
}

function normalize(value) {
  if (!value || typeof value !== "object") return null;
  const start = Number(value.start);
  const end = Number(value.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > 31 || end < 1 || end > 31) return null;
  return { start, end };
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
