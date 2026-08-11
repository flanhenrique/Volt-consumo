const CONFIG = window.VOLT_SUPABASE_BETA || {};
const ENERGY_KEY = "volt-beta-energy-cycle-v1";
const WATER_KEY = "volt-beta-water-cycle-v1";
const LEGACY_KEY = "volt-beta-v2-cycle";

let client = null;
let context = { energy: null, water: null };
let enforcing = false;

queueMicrotask(initCycleAuthority);

function initCycleAuthority() {
  attachStyles();
  bindAuth();
  window.addEventListener("volt:beta-data", () => queueMicrotask(enforceAuthoritativeCycles));
  window.addEventListener("volt:cycle-context-request", () => enforceAuthoritativeCycles());

  const home = document.querySelector("#beta-home");
  if (home) {
    new MutationObserver(() => {
      if (!enforcing) queueMicrotask(enforceAuthoritativeCycles);
    }).observe(home, { childList: true, characterData: true, subtree: true });
  }

  enforceAuthoritativeCycles();
}

function attachStyles() {
  if (document.querySelector('link[href*="cycle-authority.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./cycle-authority.css?v=76";
  document.head.append(link);
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
  if (cycles && typeof cycles === "object") {
    const energy = normalize(cycles.energy);
    const water = normalize(cycles.water);
    if (energy) write(ENERGY_KEY, energy);
    if (water) write(WATER_KEY, water);
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch {}
  enforceAuthoritativeCycles();
}

function enforceAuthoritativeCycles() {
  if (enforcing) return;
  enforcing = true;
  try {
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

    renderCycleHeader();
    renderAuthoritativeValues();
  } finally {
    enforcing = false;
  }

  window.dispatchEvent(new CustomEvent("volt:cycle-context", {
    detail: window.VOLT_CYCLE_CONTEXT
  }));
}

function renderCycleHeader() {
  const heading = document.querySelector(".cycle-heading");
  const title = document.querySelector("#beta-home-title");
  const label = document.querySelector("#beta-cycle-label");
  if (title) title.textContent = "Ciclos atuais";
  if (!label) return;

  label.classList.add("cycle-lines");
  label.replaceChildren(
    cycleLine("water", "●", "Água", context.water),
    cycleLine("energy", "ϟ", "Energia", context.energy)
  );
  if (heading) heading.dataset.separateCycles = "true";
}

function cycleLine(type, icon, name, item) {
  const row = document.createElement("span");
  row.className = `cycle-line ${type}`;
  const symbol = document.createElement("b");
  symbol.className = "cycle-line-icon";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = icon;
  const copy = document.createElement("span");
  const utility = document.createElement("strong");
  utility.textContent = name;
  const range = document.createElement("small");
  range.textContent = item?.label || "Não configurado";
  copy.append(utility, range);
  row.append(symbol, copy);
  return row;
}

function renderAuthoritativeValues() {
  const api = window.VOLT_BETA_API;
  const snapshot = api?.getSnapshot?.();
  if (!snapshot) return;

  const energyConsumption = context.energy ? cycleConsumption(snapshot.energy?.readings || [], context.energy.current) : 0;
  const waterConsumption = context.water ? cycleConsumption(snapshot.water?.readings || [], context.water.current) : 0;
  const energyEstimate = api.estimateEnergy?.(energyConsumption) || { totalCost: 0 };
  const waterEstimate = api.estimateWater?.(waterConsumption) || { totalCost: 0 };
  const energyCost = Number(energyEstimate.totalCost || 0);
  const waterCost = Number(waterEstimate.totalCost || 0);
  const totalCost = energyCost + waterCost;

  setText("#beta-energy-consumption", `${formatNumber(energyConsumption, 0)} kWh`);
  setText("#beta-water-consumption", `${formatNumber(waterConsumption, 3)} m³`);
  setText("#beta-energy-cost", currency(energyCost));
  setText("#beta-water-cost", currency(waterCost));
  setText("#beta-financial-total", currency(totalCost));

  const summary = document.querySelector("#beta-summary-values");
  if (summary) {
    summary.replaceChildren(
      summaryItem("Energia", currency(energyCost)),
      summaryItem("Água", currency(waterCost)),
      summaryItem("Total geral", currency(totalCost))
    );
  }

  // A tela principal e o detalhamento passam a consumir o mesmo cálculo.
  Object.defineProperty(window, "VOLT_CYCLE_VALUES", {
    configurable: true,
    value: Object.freeze({
      energy: { consumption: energyConsumption, estimate: energyEstimate },
      water: { consumption: waterConsumption, estimate: waterEstimate },
      totalCost
    })
  });
}

function summaryItem(label, value) {
  const item = document.createElement("div");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  item.append(small, strong);
  return item;
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

function cycleConsumption(items, range) {
  const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));
  const beforeOrAtStart = sorted.filter((item) => new Date(item.date) <= range.start).at(-1);
  const inRange = sorted.filter((item) => {
    const date = new Date(item.date);
    return date >= range.start && date <= range.end;
  });
  const latest = sorted.filter((item) => new Date(item.date) <= range.end).at(-1);

  if (beforeOrAtStart && latest && new Date(latest.date) > new Date(beforeOrAtStart.date)) {
    return Math.max(0, Number(latest.value) - Number(beforeOrAtStart.value));
  }
  if (inRange.length >= 2) {
    return Math.max(0, Number(inRange.at(-1).value) - Number(inRange[0].value));
  }
  return 0;
}

function formatRange(range, longMonth) {
  const options = longMonth
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "2-digit" };
  const formatter = new Intl.DateTimeFormat("pt-BR", options);
  const clean = (value) => formatter.format(value).replace(".", "");
  return `${clean(range.start)} – ${clean(range.end)}`;
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

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function currency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value, digits) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
