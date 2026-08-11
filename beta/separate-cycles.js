const api = window.VOLT_BETA_API;
const CONFIG = window.VOLT_SUPABASE_BETA || {};
const LEGACY_CYCLE_KEY = "volt-beta-v2-cycle";
const ENERGY_CYCLE_KEY = "volt-beta-energy-cycle-v1";
const WATER_CYCLE_KEY = "volt-beta-water-cycle-v1";
const SETUP_KEY = "volt-beta-initial-bill-setup-v1";

let client = null;
let syncing = false;

queueMicrotask(initializeSeparateCycles);

function initializeSeparateCycles() {
  migrateLegacyCycle();
  waitForUi();
  bindAuthSync();
  window.addEventListener("volt:beta-data", () => queueMicrotask(renderSeparateCycles));
}

function waitForUi(attempt = 0) {
  const settingsForm = document.querySelector("#beta-cycle-form");
  const setupDialog = document.querySelector("#initial-bill-setup-dialog");
  if (settingsForm) replaceCycleSettings(settingsForm);
  if (setupDialog) upgradeInitialSetup(setupDialog);
  renderSeparateCycles();
  if ((!settingsForm || !setupDialog) && attempt < 80) {
    window.setTimeout(() => waitForUi(attempt + 1), 100);
  }
}

function getClient() {
  if (client) return client;
  if (!window.supabase?.createClient || !CONFIG.url || !CONFIG.publishableKey) return null;
  client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return client;
}

function migrateLegacyCycle() {
  const legacy = readJson(LEGACY_CYCLE_KEY, null);
  if (!legacy) return;
  const normalized = normalizeCycle(legacy);
  if (!normalized) return;
  if (!readJson(ENERGY_CYCLE_KEY, null)) safeSet(ENERGY_CYCLE_KEY, JSON.stringify(normalized));
  if (!readJson(WATER_CYCLE_KEY, null)) safeSet(WATER_CYCLE_KEY, JSON.stringify(normalized));
}

function replaceCycleSettings(oldForm) {
  if (document.querySelector("#beta-energy-cycle-form")) return;
  const group = oldForm.closest(".settings-group");
  if (!group) return;
  const energy = getCycle("energy");
  const water = getCycle("water");
  group.innerHTML = `
    <h3>Ciclos de Contagem</h3>
    <p class="note">Energia e água podem ter períodos de faturamento diferentes. Configure cada ciclo separadamente.</p>
    <form id="beta-energy-cycle-form" class="form two-column-form">
      <strong class="full-row">Energia</strong>
      <label><span>Dia de início</span><input id="beta-energy-cycle-start" type="number" min="1" max="31" inputmode="numeric" required value="${energy.start}"></label>
      <label><span>Dia de encerramento</span><input id="beta-energy-cycle-end" type="number" min="1" max="31" inputmode="numeric" required value="${energy.end}"></label>
      <button class="secondary-button full-row" type="submit">Salvar ciclo de energia</button>
    </form>
    <form id="beta-water-cycle-form" class="form two-column-form" style="margin-top:16px">
      <strong class="full-row">Água</strong>
      <label><span>Dia de início</span><input id="beta-water-cycle-start" type="number" min="1" max="31" inputmode="numeric" required value="${water.start}"></label>
      <label><span>Dia de encerramento</span><input id="beta-water-cycle-end" type="number" min="1" max="31" inputmode="numeric" required value="${water.end}"></label>
      <button class="secondary-button full-row" type="submit">Salvar ciclo de água</button>
    </form>
    <p id="beta-cycle-status" class="note status-message" role="status" aria-live="polite"></p>
    <p class="note">Datas são ajustadas automaticamente ao último dia de cada mês.</p>`;

  group.querySelector("#beta-energy-cycle-form").addEventListener("submit", (event) => saveCycleForm(event, "energy"));
  group.querySelector("#beta-water-cycle-form").addEventListener("submit", (event) => saveCycleForm(event, "water"));
}

async function saveCycleForm(event, type) {
  event.preventDefault();
  const prefix = type === "energy" ? "beta-energy" : "beta-water";
  const cycle = normalizeCycle({
    start: Number(document.querySelector(`#${prefix}-cycle-start`)?.value),
    end: Number(document.querySelector(`#${prefix}-cycle-end`)?.value)
  });
  const status = document.querySelector("#beta-cycle-status");
  if (!cycle) {
    if (status) status.textContent = "Informe dias válidos, de 1 a 31.";
    return;
  }
  setCycle(type, cycle);
  await persistCyclesToAccount();
  if (status) status.textContent = `Ciclo de ${type === "energy" ? "energia" : "água"} atualizado.`;
  renderSeparateCycles();
}

function upgradeInitialSetup(dialog) {
  if (dialog.dataset.separateCycles === "true") return;
  dialog.dataset.separateCycles = "true";

  const globalCycle = dialog.querySelector("#initial-cycle-enabled")?.closest(".initial-setup-section");
  globalCycle?.remove();

  for (const type of ["energy", "water"]) {
    const section = dialog.querySelector(`.initial-utility-card.${type}`);
    const readings = section?.querySelector(`[data-setup-section="${type}"]`);
    if (!section || !readings) continue;
    const label = type === "energy" ? "energia" : "água";
    const cycle = getCycle(type);
    const cycleFields = document.createElement("div");
    cycleFields.className = "initial-cycle-fields";
    cycleFields.dataset.separateCycle = type;
    cycleFields.hidden = true;
    cycleFields.innerHTML = `
      <label><span>Início do ciclo de ${label}</span><input id="initial-${type}-cycle-start" type="number" min="1" max="31" inputmode="numeric" value="${cycle.start}"></label>
      <label><span>Fim do ciclo de ${label}</span><input id="initial-${type}-cycle-end" type="number" min="1" max="31" inputmode="numeric" value="${cycle.end}"></label>`;
    readings.before(cycleFields);

    const checkbox = dialog.querySelector(`#initial-${type}-enabled`);
    checkbox?.addEventListener("change", () => {
      cycleFields.hidden = !checkbox.checked;
    });
  }

  const intro = dialog.querySelector(".initial-bill-setup-head p:last-child");
  if (intro) intro.textContent = "Opcional. Configure separadamente o ciclo e as últimas leituras de energia, água ou ambos.";

  const form = dialog.querySelector("#initial-bill-setup-form");
  form?.addEventListener("submit", saveSeparateInitialSetup, true);
}

async function saveSeparateInitialSetup(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  const form = event.currentTarget;
  const status = form.querySelector("#initial-bill-setup-status");
  const button = form.querySelector("#initial-setup-save");
  const supabase = getClient();
  if (!supabase) {
    status.textContent = "Não foi possível acessar sua conta agora.";
    return;
  }

  const selected = {
    energy: form.querySelector("#initial-energy-enabled")?.checked,
    water: form.querySelector("#initial-water-enabled")?.checked
  };

  if (!selected.energy && !selected.water) {
    safeSet(SETUP_KEY, "skipped");
    await persistSetupState("skipped");
    closeSetupDialog();
    return;
  }

  const data = {};
  for (const type of ["energy", "water"]) {
    if (!selected[type]) continue;
    const cycle = normalizeCycle({
      start: Number(form.querySelector(`#initial-${type}-cycle-start`)?.value),
      end: Number(form.querySelector(`#initial-${type}-cycle-end`)?.value)
    });
    if (!cycle) {
      status.textContent = `Informe dias válidos para o ciclo de ${type === "energy" ? "energia" : "água"}.`;
      return;
    }
    const pair = readReadingPair(form, type);
    const error = validateReadingPair(pair, type === "energy" ? "energia" : "água");
    if (error) {
      status.textContent = error;
      return;
    }
    data[type] = { cycle, pair };
  }

  button.disabled = true;
  button.textContent = "Salvando…";
  status.textContent = "";

  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) throw new Error("Sessão indisponível");

    for (const type of ["energy", "water"]) {
      if (!data[type]) continue;
      setCycle(type, data[type].cycle);
      const table = type === "energy" ? "beta_meter_readings" : "beta_water_readings";
      await insertReadingPair(supabase, table, user.id, data[type].pair);
    }

    await persistCyclesToAccount(user);
    safeSet(SETUP_KEY, "completed");
    await persistSetupState("completed", user);
    await api?.refreshData?.();
    renderSeparateCycles();
    closeSetupDialog();
  } catch (error) {
    console.warn("Volt: falha ao salvar ciclos separados", error);
    status.textContent = "Não foi possível salvar todos os dados agora. Confira a conexão e tente novamente.";
  } finally {
    button.disabled = false;
    button.textContent = "Salvar e começar";
  }
}

function bindAuthSync() {
  const supabase = getClient();
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) queueMicrotask(() => restoreCyclesFromAccount(session.user));
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data?.session?.user) restoreCyclesFromAccount(data.session.user);
  }).catch(() => undefined);
}

function restoreCyclesFromAccount(user) {
  const metadata = user?.user_metadata || {};
  const cycles = metadata.cycles && typeof metadata.cycles === "object" ? metadata.cycles : {};
  const fallback = normalizeCycle(metadata.cycle);
  const energy = normalizeCycle(cycles.energy) || fallback;
  const water = normalizeCycle(cycles.water) || fallback;
  if (energy) setCycle("energy", energy, false);
  if (water) setCycle("water", water, false);
  syncSettingsInputs();
  renderSeparateCycles();
}

async function persistCyclesToAccount(existingUser = null) {
  if (syncing) return;
  const supabase = getClient();
  if (!supabase) return;
  syncing = true;
  try {
    let user = existingUser;
    if (!user) user = (await supabase.auth.getUser()).data?.user;
    if (!user) return;
    const cycles = { energy: getCycle("energy"), water: getCycle("water") };
    await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), cycles, cycles_updated_at: new Date().toISOString() } });
  } finally {
    syncing = false;
  }
}

function renderSeparateCycles() {
  if (!api?.getSnapshot) return;
  const snapshot = api.getSnapshot();
  const energyCycle = getCycleRange(getCycle("energy"));
  const waterCycle = getCycleRange(getCycle("water"));
  const energyConsumption = cycleConsumption(snapshot.energy?.readings || [], energyCycle.current);
  const waterConsumption = cycleConsumption(snapshot.water?.readings || [], waterCycle.current);
  const energyEstimate = api.estimateEnergy?.(energyConsumption);
  const waterEstimate = api.estimateWater?.(waterConsumption);
  const currency = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const energyValue = document.querySelector("#beta-energy-consumption");
  const waterValue = document.querySelector("#beta-water-consumption");
  const energyCost = document.querySelector("#beta-energy-cost");
  const waterCost = document.querySelector("#beta-water-cost");
  if (energyValue) energyValue.textContent = `${energyConsumption.toLocaleString("pt-BR")} kWh`;
  if (waterValue) waterValue.textContent = `${waterConsumption.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³`;
  if (energyCost && energyEstimate) energyCost.textContent = currency(energyEstimate.totalCost);
  if (waterCost && waterEstimate) waterCost.textContent = currency(waterEstimate.totalCost);

  const total = document.querySelector("#beta-financial-total");
  if (total) total.textContent = currency(Number(energyEstimate?.totalCost || 0) + Number(waterEstimate?.totalCost || 0));

  const label = document.querySelector("#beta-cycle-label");
  if (label) label.textContent = `Energia ${formatRange(energyCycle.current)} · Água ${formatRange(waterCycle.current)}`;
  const title = document.querySelector("#beta-home-title");
  if (title) title.textContent = "Ciclos atuais";

  syncSettingsInputs();
}

function syncSettingsInputs() {
  for (const type of ["energy", "water"]) {
    const cycle = getCycle(type);
    const start = document.querySelector(`#beta-${type}-cycle-start`);
    const end = document.querySelector(`#beta-${type}-cycle-end`);
    if (start && document.activeElement !== start) start.value = cycle.start;
    if (end && document.activeElement !== end) end.value = cycle.end;
  }
}

function getCycle(type) {
  const key = type === "energy" ? ENERGY_CYCLE_KEY : WATER_CYCLE_KEY;
  return normalizeCycle(readJson(key, null)) || { start: 1, end: 31 };
}

function setCycle(type, cycle, render = true) {
  const normalized = normalizeCycle(cycle);
  if (!normalized) return false;
  safeSet(type === "energy" ? ENERGY_CYCLE_KEY : WATER_CYCLE_KEY, JSON.stringify(normalized));
  if (render) renderSeparateCycles();
  return true;
}

function normalizeCycle(value) {
  if (!value || typeof value !== "object") return null;
  const start = Number(value.start);
  const end = Number(value.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > 31 || end < 1 || end > 31) return null;
  return { start, end };
}

function getCycleRange(preference) {
  const now = new Date();
  let start = occurrenceOnOrBefore(now, preference.start);
  let end = occurrenceAfter(start, preference.end);
  if (now > end) {
    start = occurrenceAfter(start, preference.start);
    end = occurrenceAfter(start, preference.end);
  }
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = occurrenceOnOrBefore(previousEnd, preference.start);
  return { current: { start, end }, previous: { start: previousStart, end: previousEnd } };
}

function occurrenceOnOrBefore(reference, day) {
  const value = new Date(reference);
  value.setHours(0, 0, 0, 0);
  const candidate = dateWithClampedDay(value.getFullYear(), value.getMonth(), day);
  if (candidate <= value) return candidate;
  return dateWithClampedDay(value.getFullYear(), value.getMonth() - 1, day);
}

function occurrenceAfter(reference, day) {
  let candidate = dateWithClampedDay(reference.getFullYear(), reference.getMonth(), day);
  if (candidate <= reference) candidate = dateWithClampedDay(reference.getFullYear(), reference.getMonth() + 1, day);
  return candidate;
}

function dateWithClampedDay(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last), 23, 59, 59, 999);
}

function cycleConsumption(items, range) {
  const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));
  const inRange = sorted.filter((item) => {
    const date = new Date(item.date);
    return date >= range.start && date <= range.end;
  });
  if (inRange.length >= 2) return Math.max(0, Number(inRange.at(-1).value) - Number(inRange[0].value));
  const before = sorted.filter((item) => new Date(item.date) <= range.start).at(-1);
  const latest = sorted.filter((item) => new Date(item.date) <= range.end).at(-1);
  if (before && latest && new Date(latest.date) > new Date(before.date)) return Math.max(0, Number(latest.value) - Number(before.value));
  return 0;
}

function formatRange(range) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${formatter.format(range.start)}–${formatter.format(range.end)}`;
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
  if (!Number.isFinite(pair.previous) || !Number.isFinite(pair.current) || pair.previous < 0 || pair.current < pair.previous) {
    return `Confira as leituras de ${label}: a leitura atual deve ser igual ou maior que a anterior.`;
  }
  const previousDate = new Date(pair.previousDate);
  const currentDate = new Date(pair.currentDate);
  if (!pair.previousDate || !pair.currentDate || Number.isNaN(previousDate.getTime()) || Number.isNaN(currentDate.getTime()) || currentDate <= previousDate) {
    return `Confira as datas de ${label}: a data atual deve ser posterior à anterior.`;
  }
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
    let user = existingUser;
    if (!user) user = (await supabase.auth.getUser()).data?.user;
    if (!user) return;
    await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), initial_bill_setup_state: state, initial_bill_setup_at: new Date().toISOString() } });
  } catch {
    // A configuração local continua válida e será sincronizada no próximo acesso.
  }
}

function closeSetupDialog() {
  const dialog = document.querySelector("#initial-bill-setup-dialog");
  try { dialog?.close(); } catch { dialog?.removeAttribute("open"); }
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
