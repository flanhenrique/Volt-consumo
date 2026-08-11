const api = window.VOLT_BETA_API;
const CONFIG = window.VOLT_SUPABASE_BETA || {};
const LEGACY_CYCLE_KEY = "volt-beta-v2-cycle";
const ENERGY_CYCLE_KEY = "volt-beta-energy-cycle-v1";
const WATER_CYCLE_KEY = "volt-beta-water-cycle-v1";
const SETUP_KEY = "volt-beta-initial-bill-setup-v1";

let client = null;
let syncing = false;
let rendering = false;

queueMicrotask(initializeCycles);

function initializeCycles() {
  migrateLegacyCycleOnce();
  bindAuthSync();
  waitForUi();
  window.addEventListener("volt:beta-data", renderAll);
  window.addEventListener("volt:cycle-context-request", renderAll);
  renderAll();
}

function getClient() {
  if (client) return client;
  if (!window.supabase?.createClient || !CONFIG.url || !CONFIG.publishableKey) return null;
  client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return client;
}

function migrateLegacyCycleOnce() {
  const legacy = normalizeCycle(readJson(LEGACY_CYCLE_KEY, null));
  if (legacy) {
    if (!normalizeCycle(readJson(ENERGY_CYCLE_KEY, null))) writeCycle("energy", legacy);
    if (!normalizeCycle(readJson(WATER_CYCLE_KEY, null))) writeCycle("water", legacy);
  }
  try { localStorage.removeItem(LEGACY_CYCLE_KEY); } catch {}
}

function waitForUi(attempt = 0) {
  const settingsForm = document.querySelector("#beta-cycle-form");
  const setupDialog = document.querySelector("#initial-bill-setup-dialog");
  if (settingsForm) replaceCycleSettings(settingsForm);
  if (setupDialog) upgradeInitialSetup(setupDialog);
  renderAll();
  if ((!document.querySelector("#beta-energy-cycle-form") || !setupDialog) && attempt < 60) {
    window.setTimeout(() => waitForUi(attempt + 1), 100);
  }
}

function replaceCycleSettings(oldForm) {
  if (document.querySelector("#beta-energy-cycle-form")) return;
  const group = oldForm.closest(".settings-group");
  if (!group) return;
  const energy = getCycle("energy");
  const water = getCycle("water");
  group.innerHTML = `
    <h3>Ciclos de Contagem</h3>
    <p class="note">Energia e água têm ciclos independentes. Cada serviço mantém seu próprio período.</p>
    ${cycleSettingsForm("energy", "Energia", energy)}
    ${cycleSettingsForm("water", "Água", water)}
    <p id="beta-cycle-status" class="note status-message" role="status" aria-live="polite"></p>`;
  group.querySelector("#beta-energy-cycle-form")?.addEventListener("submit", (event) => saveCycleForm(event, "energy"));
  group.querySelector("#beta-water-cycle-form")?.addEventListener("submit", (event) => saveCycleForm(event, "water"));
}

function cycleSettingsForm(type, title, cycle) {
  return `<form id="beta-${type}-cycle-form" class="form two-column-form" style="margin-top:12px">
    <strong class="full-row">${title}</strong>
    <label><span>Dia de início</span><input id="beta-${type}-cycle-start" type="number" min="1" max="31" inputmode="numeric" required value="${cycle?.start || ""}"></label>
    <label><span>Dia de encerramento</span><input id="beta-${type}-cycle-end" type="number" min="1" max="31" inputmode="numeric" required value="${cycle?.end || ""}"></label>
    <button class="secondary-button full-row" type="submit">Salvar ciclo de ${type === "energy" ? "energia" : "água"}</button>
  </form>`;
}

async function saveCycleForm(event, type) {
  event.preventDefault();
  const cycle = normalizeCycle({
    start: Number(document.querySelector(`#beta-${type}-cycle-start`)?.value),
    end: Number(document.querySelector(`#beta-${type}-cycle-end`)?.value)
  });
  const status = document.querySelector("#beta-cycle-status");
  if (!cycle) {
    if (status) status.textContent = "Informe dias válidos, de 1 a 31.";
    return;
  }
  writeCycle(type, cycle);
  await persistCyclesToAccount();
  if (status) status.textContent = `Ciclo de ${type === "energy" ? "energia" : "água"} atualizado.`;
  renderAll();
}

function upgradeInitialSetup(dialog) {
  if (dialog.dataset.separateCycles === "true") return;
  dialog.dataset.separateCycles = "true";
  dialog.querySelector("#initial-cycle-enabled")?.closest(".initial-setup-section")?.remove();

  for (const type of ["energy", "water"]) {
    const section = dialog.querySelector(`.initial-utility-card.${type}`);
    const readings = section?.querySelector(`[data-setup-section="${type}"]`);
    if (!section || !readings) continue;
    const cycle = getCycle(type);
    const label = type === "energy" ? "energia" : "água";
    const fields = document.createElement("div");
    fields.className = "initial-cycle-fields";
    fields.dataset.separateCycle = type;
    fields.hidden = true;
    fields.innerHTML = `
      <label><span>Início do ciclo de ${label}</span><input id="initial-${type}-cycle-start" type="number" min="1" max="31" inputmode="numeric" value="${cycle?.start || ""}"></label>
      <label><span>Fim do ciclo de ${label}</span><input id="initial-${type}-cycle-end" type="number" min="1" max="31" inputmode="numeric" value="${cycle?.end || ""}"></label>`;
    readings.before(fields);
    const checkbox = dialog.querySelector(`#initial-${type}-enabled`);
    checkbox?.addEventListener("change", () => { fields.hidden = !checkbox.checked; });
  }

  const form = dialog.querySelector("#initial-bill-setup-form");
  form?.addEventListener("submit", saveInitialSetup, true);
}

async function saveInitialSetup(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  const form = event.currentTarget;
  const status = form.querySelector("#initial-bill-setup-status");
  const button = form.querySelector("#initial-setup-save");
  const supabase = getClient();
  if (!supabase) return void (status.textContent = "Não foi possível acessar sua conta agora.");

  const selected = {
    energy: form.querySelector("#initial-energy-enabled")?.checked,
    water: form.querySelector("#initial-water-enabled")?.checked
  };
  if (!selected.energy && !selected.water) {
    safeSet(SETUP_KEY, "skipped");
    await persistSetupState("skipped");
    return closeSetupDialog();
  }

  const payload = {};
  for (const type of ["energy", "water"]) {
    if (!selected[type]) continue;
    const cycle = normalizeCycle({
      start: Number(form.querySelector(`#initial-${type}-cycle-start`)?.value),
      end: Number(form.querySelector(`#initial-${type}-cycle-end`)?.value)
    });
    if (!cycle) return void (status.textContent = `Informe dias válidos para o ciclo de ${type === "energy" ? "energia" : "água"}.`);
    const pair = readReadingPair(form, type);
    const error = validateReadingPair(pair, type === "energy" ? "energia" : "água");
    if (error) return void (status.textContent = error);
    payload[type] = { cycle, pair };
  }

  button.disabled = true;
  button.textContent = "Salvando…";
  status.textContent = "";
  try {
    const user = (await supabase.auth.getUser()).data?.user;
    if (!user) throw new Error("Sessão indisponível");
    for (const type of ["energy", "water"]) {
      if (!payload[type]) continue;
      writeCycle(type, payload[type].cycle);
      await insertReadingPair(supabase, type === "energy" ? "beta_meter_readings" : "beta_water_readings", user.id, payload[type].pair);
    }
    await persistCyclesToAccount(user);
    safeSet(SETUP_KEY, "completed");
    await persistSetupState("completed", user);
    await api?.refreshData?.();
    renderAll();
    closeSetupDialog();
  } catch (error) {
    console.warn("Volt: falha ao salvar configuração inicial", error);
    status.textContent = "Não foi possível salvar todos os dados agora. Tente novamente.";
  } finally {
    button.disabled = false;
    button.textContent = button.dataset.testAccount === "true" ? "OK e continuar" : "Salvar e começar";
  }
}

function bindAuthSync() {
  const supabase = getClient();
  if (!supabase) return;
  const apply = (user) => {
    const cycles = user?.user_metadata?.cycles;
    if (cycles && typeof cycles === "object") {
      const energy = normalizeCycle(cycles.energy);
      const water = normalizeCycle(cycles.water);
      if (energy) writeCycle("energy", energy);
      if (water) writeCycle("water", water);
    }
    try { localStorage.removeItem(LEGACY_CYCLE_KEY); } catch {}
    renderAll();
  };
  supabase.auth.onAuthStateChange((_event, session) => session?.user && apply(session.user));
  supabase.auth.getSession().then(({ data }) => data?.session?.user && apply(data.session.user)).catch(() => undefined);
}

async function persistCyclesToAccount(existingUser = null) {
  if (syncing) return;
  const supabase = getClient();
  if (!supabase) return;
  syncing = true;
  try {
    const user = existingUser || (await supabase.auth.getUser()).data?.user;
    if (!user) return;
    const cycles = { energy: getCycle("energy"), water: getCycle("water") };
    const { error } = await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), cycles, cycles_updated_at: new Date().toISOString() } });
    if (error) throw error;
  } finally {
    syncing = false;
  }
}

function renderAll() {
  if (rendering || !api?.getSnapshot) return;
  rendering = true;
  try {
    const snapshot = api.getSnapshot();
    const energy = buildContext(getCycle("energy"));
    const water = buildContext(getCycle("water"));
    const energyConsumption = energy ? cycleConsumption(snapshot.energy?.readings || [], energy.current) : 0;
    const waterConsumption = water ? cycleConsumption(snapshot.water?.readings || [], water.current) : 0;
    const energyEstimate = api.estimateEnergy?.(energyConsumption) || { totalCost: 0 };
    const waterEstimate = api.estimateWater?.(waterConsumption) || { totalCost: 0 };
    const totalCost = Number(energyEstimate.totalCost || 0) + Number(waterEstimate.totalCost || 0);

    window.VOLT_CYCLE_CONTEXT = Object.freeze({ energy, water });
    window.VOLT_CYCLE_VALUES = Object.freeze({
      energy: { consumption: energyConsumption, estimate: energyEstimate },
      water: { consumption: waterConsumption, estimate: waterEstimate },
      totalCost
    });

    renderHeader(energy, water);
    setText("#beta-energy-consumption", `${formatNumber(energyConsumption, 0)} kWh`);
    setText("#beta-water-consumption", `${formatNumber(waterConsumption, 3)} m³`);
    setText("#beta-energy-cost", currency(energyEstimate.totalCost));
    setText("#beta-water-cost", currency(waterEstimate.totalCost));
    setText("#beta-financial-total", currency(totalCost));
    renderSummary(energyEstimate.totalCost, waterEstimate.totalCost, totalCost);
    syncSettingsInputs();
  } finally {
    rendering = false;
  }
  window.dispatchEvent(new CustomEvent("volt:cycle-context", { detail: window.VOLT_CYCLE_CONTEXT }));
}

function renderHeader(energy, water) {
  const title = document.querySelector("#beta-home-title");
  if (title) title.textContent = "Ciclos atuais";
  const label = document.querySelector("#beta-cycle-label");
  if (!label) return;
  label.classList.add("cycle-lines");
  label.replaceChildren(
    cycleLine("water", "●", "Água", water),
    cycleLine("energy", "ϟ", "Energia", energy)
  );
}

function cycleLine(type, icon, name, context) {
  const row = document.createElement("span");
  row.className = `cycle-line ${type}`;
  const symbol = document.createElement("b");
  symbol.className = "cycle-line-icon";
  symbol.textContent = icon;
  symbol.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  const utility = document.createElement("strong");
  utility.textContent = name;
  const range = document.createElement("small");
  range.textContent = context?.label || "Não configurado";
  copy.append(utility, range);
  row.append(symbol, copy);
  return row;
}

function renderSummary(energyCost, waterCost, totalCost) {
  const summary = document.querySelector("#beta-summary-values");
  if (!summary) return;
  summary.replaceChildren(
    summaryItem("Energia", currency(energyCost)),
    summaryItem("Água", currency(waterCost)),
    summaryItem("Total geral", currency(totalCost))
  );
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

function getCycle(type) {
  const key = type === "energy" ? ENERGY_CYCLE_KEY : WATER_CYCLE_KEY;
  return normalizeCycle(readJson(key, null));
}

function writeCycle(type, cycle) {
  const normalized = normalizeCycle(cycle);
  if (!normalized) return false;
  safeSet(type === "energy" ? ENERGY_CYCLE_KEY : WATER_CYCLE_KEY, JSON.stringify(normalized));
  return true;
}

function buildContext(preference) {
  if (!preference) return null;
  const current = getCycleRange(preference);
  return { preference, current: current.current, previous: current.previous, label: formatRange(current.current), labelCompact: formatRange(current.current, true) };
}

function getCycleRange(preference) {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let start = occurrenceOnOrBefore(today, preference.start);
  let end = occurrenceAfter(start, preference.end);
  if (now > end) {
    start = occurrenceAfterStart(start, preference.start);
    end = occurrenceAfter(start, preference.end);
  }
  const previousEnd = new Date(start.getTime() - 1);
  return { current: { start, end }, previous: { start: occurrenceOnOrBefore(previousEnd, preference.start), end: previousEnd } };
}

function occurrenceOnOrBefore(reference, day) {
  let candidate = cycleDate(reference.getFullYear(), reference.getMonth(), day, false);
  if (candidate <= reference) return candidate;
  return cycleDate(reference.getFullYear(), reference.getMonth() - 1, day, false);
}

function occurrenceAfter(reference, day) {
  let candidate = cycleDate(reference.getFullYear(), reference.getMonth(), day, true);
  if (candidate <= reference) candidate = cycleDate(reference.getFullYear(), reference.getMonth() + 1, day, true);
  return candidate;
}

function occurrenceAfterStart(reference, day) {
  let candidate = cycleDate(reference.getFullYear(), reference.getMonth(), day, false);
  if (candidate <= reference) candidate = cycleDate(reference.getFullYear(), reference.getMonth() + 1, day, false);
  return candidate;
}

function cycleDate(year, month, day, endOfDay) {
  const last = new Date(year, month + 1, 0).getDate();
  const value = new Date(year, month, Math.min(day, last));
  value.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return value;
}

function cycleConsumption(items, range) {
  const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));
  const base = sorted.filter((item) => new Date(item.date) <= range.start).at(-1);
  const latest = sorted.filter((item) => new Date(item.date) <= range.end).at(-1);
  if (base && latest && new Date(latest.date) > new Date(base.date)) return Math.max(0, Number(latest.value) - Number(base.value));
  const inRange = sorted.filter((item) => { const date = new Date(item.date); return date >= range.start && date <= range.end; });
  return inRange.length >= 2 ? Math.max(0, Number(inRange.at(-1).value) - Number(inRange[0].value)) : 0;
}

function normalizeCycle(value) {
  if (!value || typeof value !== "object") return null;
  const start = Number(value.start), end = Number(value.end);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && start <= 31 && end >= 1 && end <= 31 ? { start, end } : null;
}

function formatRange(range, compact = false) {
  const formatter = new Intl.DateTimeFormat("pt-BR", compact ? { day: "2-digit", month: "2-digit" } : { day: "2-digit", month: "short" });
  const clean = (date) => formatter.format(date).replace(".", "");
  return `${clean(range.start)} – ${clean(range.end)}`;
}

function syncSettingsInputs() {
  for (const type of ["energy", "water"]) {
    const cycle = getCycle(type);
    const start = document.querySelector(`#beta-${type}-cycle-start`);
    const end = document.querySelector(`#beta-${type}-cycle-end`);
    if (cycle && start && document.activeElement !== start) start.value = cycle.start;
    if (cycle && end && document.activeElement !== end) end.value = cycle.end;
  }
}

function readReadingPair(form, type) {
  return {
    previous: Number(form.querySelector(`#initial-${type}-previous`)?.value),
    previousDate: form.querySelector(`#initial-${type}-previous-date`)?.value || "",
    current: Number(form.querySelector(`#initial-${type}-current`)?.value),
    currentDate: form.querySelector(`#initial-${type}-current-date`)?.value || ""
  };
}

function validateReadingPair(pair, label) {
  if (!Number.isFinite(pair.previous) || !Number.isFinite(pair.current) || pair.previous < 0 || pair.current < pair.previous) return `Confira as leituras de ${label}.`;
  const previousDate = new Date(pair.previousDate), currentDate = new Date(pair.currentDate);
  if (!pair.previousDate || !pair.currentDate || Number.isNaN(previousDate.getTime()) || Number.isNaN(currentDate.getTime()) || currentDate <= previousDate) return `Confira as datas de ${label}.`;
  return "";
}

async function insertReadingPair(supabase, table, userId, pair) {
  const rows = [
    { user_id: userId, value: pair.previous, measured_at: new Date(pair.previousDate).toISOString() },
    { user_id: userId, value: pair.current, measured_at: new Date(pair.currentDate).toISOString() }
  ];
  const { data: existing, error: selectError } = await supabase.from(table).select("value, measured_at");
  if (selectError) throw selectError;
  const keys = new Set((existing || []).map((item) => `${Number(item.value)}|${new Date(item.measured_at).toISOString()}`));
  const missing = rows.filter((item) => !keys.has(`${Number(item.value)}|${item.measured_at}`));
  if (!missing.length) return;
  const { error } = await supabase.from(table).insert(missing);
  if (error) throw error;
}

async function persistSetupState(state, existingUser = null) {
  const supabase = getClient();
  if (!supabase) return;
  try {
    const user = existingUser || (await supabase.auth.getUser()).data?.user;
    if (!user) return;
    await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), initial_bill_setup_state: state, initial_bill_setup_at: new Date().toISOString() } });
  } catch {}
}

function closeSetupDialog() {
  const dialog = document.querySelector("#initial-bill-setup-dialog");
  try { dialog?.close(); } catch { dialog?.removeAttribute("open"); }
}

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }
function setText(selector, value) { const element = document.querySelector(selector); if (element) element.textContent = value; }
function currency(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatNumber(value, digits) { return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits }); }
