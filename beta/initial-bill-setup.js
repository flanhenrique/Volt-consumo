const CONFIG = window.VOLT_SUPABASE_BETA || {};
const ACK_KEY = "volt-beta-guided-ack-2026-08-10-v1";
const SETUP_KEY = "volt-beta-initial-bill-setup-v1";
const CYCLE_KEY = "volt-beta-v2-cycle";

let client = null;

queueMicrotask(initializeInitialBillSetup);

function initializeInitialBillSetup() {
  attachStyles();
  buildDialog();

  const tour = document.querySelector("#guided-tour-dialog");
  if (tour) {
    tour.addEventListener("close", () => {
      window.setTimeout(() => {
        if (safeGet(ACK_KEY) === "true") maybeOpenInitialSetup();
      }, 80);
    });
  }
}

function attachStyles() {
  if (document.querySelector('link[href*="initial-bill-setup.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./initial-bill-setup.css?v=71";
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

function buildDialog() {
  if (document.querySelector("#initial-bill-setup-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "initial-bill-setup-dialog";
  dialog.className = "initial-bill-setup-dialog";
  dialog.innerHTML = `
    <form id="initial-bill-setup-form" class="initial-bill-setup-card">
      <header class="initial-bill-setup-head">
        <div>
          <p class="eyebrow">PRIMEIRA CONFIGURAÇÃO</p>
          <h2>Comece pela última fatura</h2>
          <p>Opcional. Você pode configurar agora o Ciclo de Contagem e registrar as duas leituras da última fatura de energia, água ou ambas.</p>
        </div>
        <button type="button" class="icon-button" data-setup-skip aria-label="Pular esta etapa">×</button>
      </header>

      <section class="initial-setup-section">
        <label class="initial-setup-toggle"><input id="initial-cycle-enabled" type="checkbox"><span><strong>Ciclo de Contagem</strong><small>Use os dias informados na fatura. Pode ser alterado depois em Configurações.</small></span></label>
        <div class="initial-cycle-fields" data-setup-section="cycle" hidden>
          <label><span>Dia inicial</span><input id="initial-cycle-start" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 17"></label>
          <label><span>Dia final</span><input id="initial-cycle-end" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 16"></label>
        </div>
      </section>

      <div class="initial-utility-grid">
        ${utilityCard("energy", "ϟ", "Energia", "kWh", "1")}
        ${utilityCard("water", "●", "Água", "m³", "0.001")}
      </div>

      <p class="initial-setup-note">Para calcular o consumo corretamente, a fatura precisa fornecer a leitura anterior e a leitura atual. Se você não tiver esses dados agora, pode pular esta etapa sem perder acesso ao Volt.</p>
      <p id="initial-bill-setup-status" class="note initial-setup-status" role="status" aria-live="polite"></p>
      <footer class="initial-setup-actions">
        <button type="button" class="secondary-button" data-setup-skip>Agora não</button>
        <button type="submit" class="primary-button" id="initial-setup-save">Salvar e começar</button>
      </footer>
    </form>`;
  document.body.append(dialog);

  dialog.querySelectorAll("[data-setup-skip]").forEach((button) => button.addEventListener("click", skipInitialSetup));
  dialog.querySelector("#initial-bill-setup-form").addEventListener("submit", saveInitialSetup);
  dialog.querySelector("#initial-cycle-enabled").addEventListener("change", (event) => {
    dialog.querySelector('[data-setup-section="cycle"]').hidden = !event.target.checked;
  });
  for (const type of ["energy", "water"]) {
    dialog.querySelector(`#initial-${type}-enabled`).addEventListener("change", (event) => {
      dialog.querySelector(`[data-setup-section="${type}"]`).hidden = !event.target.checked;
    });
  }
}

function utilityCard(type, icon, title, unit, step) {
  return `
    <section class="initial-setup-section initial-utility-card ${type}">
      <label class="initial-setup-toggle"><input id="initial-${type}-enabled" type="checkbox"><span class="initial-utility-title"><b aria-hidden="true">${icon}</b><span><strong>${title}</strong><small>Adicionar dados da última fatura</small></span></span></label>
      <div class="initial-reading-fields" data-setup-section="${type}" hidden>
        <div class="initial-reading-row">
          <label><span>Leitura anterior (${unit})</span><input id="initial-${type}-previous" type="number" min="0" step="${step}" inputmode="decimal"></label>
          <label><span>Data anterior</span><input id="initial-${type}-previous-date" type="datetime-local"></label>
        </div>
        <div class="initial-reading-row">
          <label><span>Leitura atual (${unit})</span><input id="initial-${type}-current" type="number" min="0" step="${step}" inputmode="decimal"></label>
          <label><span>Data atual</span><input id="initial-${type}-current-date" type="datetime-local"></label>
        </div>
      </div>
    </section>`;
}

async function maybeOpenInitialSetup() {
  if (safeGet(SETUP_KEY)) return;
  const supabase = getClient();
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    const metadataState = user.user_metadata?.initial_bill_setup_state;
    if (metadataState === "completed" || metadataState === "skipped") {
      safeSet(SETUP_KEY, metadataState);
      return;
    }
  } catch {
    return;
  }

  const dialog = document.querySelector("#initial-bill-setup-dialog");
  if (!dialog || dialog.open) return;
  prefillCycle(dialog);
  dialog.showModal();
}

function prefillCycle(dialog) {
  const cycle = readJson(CYCLE_KEY, null);
  if (!cycle) return;
  dialog.querySelector("#initial-cycle-start").value = cycle.start || "";
  dialog.querySelector("#initial-cycle-end").value = cycle.end || "";
}

async function skipInitialSetup() {
  safeSet(SETUP_KEY, "skipped");
  const dialog = document.querySelector("#initial-bill-setup-dialog");
  try { dialog?.close(); } catch { dialog?.removeAttribute("open"); }
  await persistSetupState("skipped");
}

async function saveInitialSetup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("#initial-bill-setup-status");
  const button = form.querySelector("#initial-setup-save");
  const supabase = getClient();
  if (!supabase) {
    status.textContent = "Não foi possível acessar sua conta agora.";
    return;
  }

  const selected = {
    cycle: form.querySelector("#initial-cycle-enabled").checked,
    energy: form.querySelector("#initial-energy-enabled").checked,
    water: form.querySelector("#initial-water-enabled").checked
  };

  const cycle = selected.cycle ? readCycle(form) : null;
  if (selected.cycle && !cycle) {
    status.textContent = "Informe dias válidos, de 1 a 31, para o Ciclo de Contagem.";
    return;
  }

  const energy = selected.energy ? readReadingPair(form, "energy") : null;
  const water = selected.water ? readReadingPair(form, "water") : null;
  const energyError = selected.energy ? validateReadingPair(energy, "energia") : "";
  const waterError = selected.water ? validateReadingPair(water, "água") : "";
  if (energyError || waterError) {
    status.textContent = energyError || waterError;
    return;
  }

  button.disabled = true;
  button.textContent = "Salvando…";
  status.textContent = "";

  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) throw new Error("Sessão indisponível");

    if (cycle) {
      safeSet(CYCLE_KEY, JSON.stringify(cycle));
      syncCycleForm(cycle);
      await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), cycle: { ...cycle, updated_at: new Date().toISOString() } } });
    }

    if (energy) await insertReadingPair(supabase, "beta_meter_readings", user.id, energy);
    if (water) await insertReadingPair(supabase, "beta_water_readings", user.id, water);

    safeSet(SETUP_KEY, "completed");
    await persistSetupState("completed");
    await window.VOLT_BETA_API?.refreshData?.();
    try { document.querySelector("#initial-bill-setup-dialog")?.close(); } catch { document.querySelector("#initial-bill-setup-dialog")?.removeAttribute("open"); }
  } catch (error) {
    console.warn("Volt: falha na configuração inicial da fatura", error);
    status.textContent = "Não foi possível salvar todos os dados agora. Confira a conexão e tente novamente.";
  } finally {
    button.disabled = false;
    button.textContent = "Salvar e começar";
  }
}

function readCycle(form) {
  const start = Number(form.querySelector("#initial-cycle-start").value);
  const end = Number(form.querySelector("#initial-cycle-end").value);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || start > 31 || end < 1 || end > 31) return null;
  return { start, end };
}

function readReadingPair(form, type) {
  return {
    previous: Number(form.querySelector(`#initial-${type}-previous`).value),
    previousDate: form.querySelector(`#initial-${type}-previous-date`).value,
    current: Number(form.querySelector(`#initial-${type}-current`).value),
    currentDate: form.querySelector(`#initial-${type}-current-date`).value
  };
}

function validateReadingPair(pair, label) {
  if (!pair || !Number.isFinite(pair.previous) || !Number.isFinite(pair.current) || pair.previous < 0 || pair.current < pair.previous) {
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
  const existingKeys = new Set((existing || []).map((item) => `${Number(item.value)}|${new Date(item.measured_at).toISOString()}`));
  const missing = rows.filter((item) => !existingKeys.has(`${Number(item.value)}|${item.measured_at}`));
  if (!missing.length) return;
  const { error } = await supabase.from(table).insert(missing);
  if (error) throw error;
}

async function persistSetupState(state) {
  const supabase = getClient();
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;
    await supabase.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        initial_bill_setup_state: state,
        initial_bill_setup_at: new Date().toISOString()
      }
    });
  } catch {
    // O estado local evita bloquear o usuário se a rede oscilar.
  }
}

function syncCycleForm(cycle) {
  const start = document.querySelector("#beta-cycle-start");
  const end = document.querySelector("#beta-cycle-end");
  if (start) start.value = cycle.start;
  if (end) end.value = cycle.end;
  window.dispatchEvent(new CustomEvent("volt:beta-data"));
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
