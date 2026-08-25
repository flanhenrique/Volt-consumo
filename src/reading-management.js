import { calculateConsumptionSummary } from "../packages/consumption-domain/browser/index.js?v=20260813.7";
import { VOLT_CONFIG } from "../config.js?v=20260813.7";

const BUILD = "20260825.1";
const TABLES = Object.freeze({ energy: "beta_meter_readings", water: "beta_water_readings" });
const TYPE_LABELS = Object.freeze({ energy: "Energia", water: "Água" });
const TYPE_UNITS = Object.freeze({ energy: "kWh", water: "m³" });

let activeReading = null;
let decorateTimer = null;
let decorating = false;
let dialog = null;

installStyles();
installDialog();
bindStartup();

function bindStartup() {
  window.addEventListener("volt:startup-status", (event) => {
    if (event.detail?.status === "READY") scheduleDecoration();
  });

  const host = document.getElementById("readings-list");
  if (host) {
    const observer = new MutationObserver(() => scheduleDecoration());
    observer.observe(host, { childList: true });
  }

  scheduleDecoration();
}

function scheduleDecoration() {
  if (decorateTimer) window.clearTimeout(decorateTimer);
  decorateTimer = window.setTimeout(() => void decorateReadingList(), 40);
}

async function decorateReadingList() {
  if (decorating || document.documentElement.dataset.startupStatus !== "READY") return;
  const host = document.getElementById("readings-list");
  if (!host) return;
  const items = [...host.querySelectorAll(":scope > .reading-item")];
  if (!items.length || items.every((item) => item.dataset.readingManagement === BUILD)) return;

  decorating = true;
  try {
    const session = getStoredSession();
    if (!session?.access_token) return;
    const userId = session.user?.id || await loadAuthenticatedUserId(session.access_token);
    const rows = await loadVisibleReadings(session.access_token);
    const combined = [...rows.energy, ...rows.water]
      .sort((left, right) => Date.parse(right.measuredAt) - Date.parse(left.measuredAt));

    if (combined.length !== items.length) return;

    items.forEach((item, index) => {
      const reading = combined[index];
      item.dataset.readingManagement = BUILD;
      if (!reading || reading.userId !== userId) return;
      item.append(createReadingActions(reading, userId));
    });
  } catch (error) {
    console.warn("VOLT reading management unavailable", error instanceof Error ? error.message : "unknown_error");
  } finally {
    decorating = false;
  }
}

function createReadingActions(reading, userId) {
  const actions = document.createElement("div");
  actions.className = "reading-management-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "reading-management-button";
  edit.textContent = "Editar";
  edit.setAttribute("aria-label", `Editar leitura de ${TYPE_LABELS[reading.type].toLowerCase()} de ${formatDateTime(reading.measuredAt)}`);
  edit.addEventListener("click", () => openEditDialog(reading, userId));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "reading-management-button reading-management-danger";
  remove.textContent = "Apagar";
  remove.setAttribute("aria-label", `Apagar leitura de ${TYPE_LABELS[reading.type].toLowerCase()} de ${formatDateTime(reading.measuredAt)}`);
  remove.addEventListener("click", () => void deleteReading(reading, userId, remove));

  actions.append(edit, remove);
  return actions;
}

async function deleteReading(reading, userId, button) {
  const confirmed = window.confirm(
    `Apagar esta leitura de ${TYPE_LABELS[reading.type].toLowerCase()}?\n\n` +
    `${formatValue(reading)} em ${formatDateTime(reading.measuredAt)}.\n\n` +
    "Essa ação não pode ser desfeita e os cálculos serão atualizados."
  );
  if (!confirmed) return;

  button.disabled = true;
  try {
    const session = getStoredSession();
    if (!session?.access_token) throw new Error("Sua sessão expirou. Entre novamente no VOLT.");
    const deleted = await mutateReading("DELETE", reading, userId, null, session.access_token);
    if (!Array.isArray(deleted) || deleted.length !== 1) throw new Error("A leitura não foi encontrada ou você não tem permissão para apagá-la.");
    window.location.reload();
  } catch (error) {
    button.disabled = false;
    window.alert(error instanceof Error ? error.message : "Não foi possível apagar a leitura.");
  }
}

function openEditDialog(reading, userId) {
  activeReading = { ...reading, userId };
  const type = dialog.querySelector("#reading-management-type");
  const value = dialog.querySelector("#reading-management-value");
  const date = dialog.querySelector("#reading-management-date");
  const message = dialog.querySelector("#reading-management-message");

  type.value = `${TYPE_LABELS[reading.type]} (${TYPE_UNITS[reading.type]})`;
  value.value = String(reading.value);
  date.value = toLocalDateTimeInput(reading.measuredAt);
  message.textContent = "Alterar uma leitura recalcula os intervalos de consumo relacionados.";
  message.dataset.error = "false";

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

async function saveEditedReading(event) {
  event.preventDefault();
  if (!activeReading) return;

  const value = Number(dialog.querySelector("#reading-management-value").value);
  const dateInput = dialog.querySelector("#reading-management-date").value;
  const save = dialog.querySelector("#reading-management-save");
  const message = dialog.querySelector("#reading-management-message");

  if (!Number.isFinite(value) || value < 0 || !dateInput) {
    setDialogMessage("Informe um valor e uma data válidos.", true);
    return;
  }

  const measuredAt = new Date(dateInput).toISOString();
  save.disabled = true;
  setDialogMessage("Validando e salvando…");

  try {
    const session = getStoredSession();
    if (!session?.access_token) throw new Error("Sua sessão expirou. Entre novamente no VOLT.");
    const authenticatedUserId = session.user?.id || await loadAuthenticatedUserId(session.access_token);
    if (authenticatedUserId !== activeReading.userId) throw new Error("A leitura não pertence à sua conta.");

    const visible = await loadVisibleReadings(session.access_token);
    const ownTypeRows = visible[activeReading.type]
      .filter((row) => row.userId === authenticatedUserId)
      .map((row) => row.id === activeReading.id
        ? { value, date: measuredAt }
        : { value: row.value, date: row.measuredAt })
      .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

    const validation = calculateConsumptionSummary(ownTypeRows);
    if (!validation.valid) throw new Error("A alteração precisa manter as datas e os valores das leituras em ordem crescente.");

    const updated = await mutateReading(
      "PATCH",
      activeReading,
      authenticatedUserId,
      { value, measured_at: measuredAt },
      session.access_token
    );
    if (!Array.isArray(updated) || updated.length !== 1) throw new Error("A leitura não foi encontrada ou você não tem permissão para editá-la.");

    setDialogMessage("Leitura atualizada. Recalculando o histórico…");
    window.location.reload();
  } catch (error) {
    save.disabled = false;
    message.dataset.error = "true";
    message.textContent = error instanceof Error ? error.message : "Não foi possível editar a leitura.";
  }
}

async function mutateReading(method, reading, userId, body, accessToken) {
  const table = TABLES[reading.type];
  if (!table) throw new Error("Tipo de leitura inválido.");
  const params = new URLSearchParams({
    id: `eq.${reading.id}`,
    user_id: `eq.${userId}`,
    select: "id,user_id,value,measured_at"
  });
  return apiRequest(`/rest/v1/${table}?${params}`, accessToken, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { Prefer: "return=representation" }
  });
}

async function loadVisibleReadings(accessToken) {
  const [energy, water] = await Promise.all([
    loadTableReadings("energy", accessToken),
    loadTableReadings("water", accessToken)
  ]);
  return { energy, water };
}

async function loadTableReadings(type, accessToken) {
  const params = new URLSearchParams({
    select: "id,user_id,value,measured_at",
    order: "measured_at.asc"
  });
  const rows = await apiRequest(`/rest/v1/${TABLES[type]}?${params}`, accessToken);
  return (rows || []).map((row) => ({
    id: Number(row.id),
    userId: String(row.user_id || ""),
    type,
    value: Number(row.value),
    measuredAt: row.measured_at
  })).filter((row) => Number.isFinite(row.id) && Number.isFinite(row.value) && row.measuredAt);
}

async function loadAuthenticatedUserId(accessToken) {
  const user = await apiRequest("/auth/v1/user", accessToken);
  if (!user?.id) throw new Error("Não foi possível identificar sua sessão.");
  return user.id;
}

async function apiRequest(path, accessToken, options = {}) {
  const headers = {
    apikey: VOLT_CONFIG.publishableKey,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    ...options.headers
  };
  if (options.body) headers["Content-Type"] = "application/json";

  const response = await fetch(`${VOLT_CONFIG.url}${path}`, { ...options, headers, cache: "no-store" });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { payload = text; }
  }

  if (!response.ok) {
    const detail = typeof payload === "object" && payload
      ? payload.message || payload.error_description || payload.error || null
      : null;
    throw new Error(detail || `Falha ao atualizar a leitura (${response.status}).`);
  }
  return payload;
}

function getStoredSession() {
  let projectRef = "";
  try { projectRef = new URL(VOLT_CONFIG.url).hostname.split(".")[0]; }
  catch { return null; }

  const preferredKey = `sb-${projectRef}-auth-token`;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const direct = parseSession(storage.getItem(preferredKey));
    if (direct?.access_token) return direct;

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const candidate = parseSession(storage.getItem(key));
      if (candidate?.access_token && candidate?.user?.id) return candidate;
    }
  }
  return null;
}

function parseSession(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession || parsed?.session || parsed;
    return session?.access_token ? session : null;
  } catch {
    return null;
  }
}

function installDialog() {
  if (document.getElementById("reading-management-dialog")) {
    dialog = document.getElementById("reading-management-dialog");
    return;
  }

  dialog = document.createElement("dialog");
  dialog.id = "reading-management-dialog";
  dialog.className = "reading-management-dialog";
  dialog.innerHTML = `
    <form id="reading-management-form" class="dialog-card form glass-modal glass-shine">
      <div class="dialog-heading">
        <div><p class="eyebrow">CORRIGIR HISTÓRICO</p><h2>Editar leitura</h2></div>
        <button class="icon-button" type="button" data-reading-management-close aria-label="Fechar">
          <svg class="icon"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <label><span>Tipo</span><input id="reading-management-type" type="text" readonly aria-readonly="true"></label>
      <div class="two-columns form">
        <label><span>Valor da leitura</span><input id="reading-management-value" type="number" min="0" step="0.001" inputmode="decimal" required></label>
        <label><span>Data e hora</span><input id="reading-management-date" type="datetime-local" required></label>
      </div>
      <div class="reading-management-dialog-actions">
        <button class="reading-management-button" type="button" data-reading-management-close>Cancelar</button>
        <button id="reading-management-save" class="primary-button" type="submit">Salvar alteração</button>
      </div>
      <p id="reading-management-message" class="status-message" role="status" aria-live="polite"></p>
    </form>
  `;
  document.body.append(dialog);
  dialog.querySelector("#reading-management-form").addEventListener("submit", saveEditedReading);
  dialog.querySelectorAll("[data-reading-management-close]").forEach((button) => {
    button.addEventListener("click", () => closeEditDialog());
  });
  dialog.addEventListener("cancel", () => { activeReading = null; });
}

function closeEditDialog() {
  activeReading = null;
  const save = dialog.querySelector("#reading-management-save");
  if (save) save.disabled = false;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function setDialogMessage(message, error = false) {
  const element = dialog.querySelector("#reading-management-message");
  element.textContent = message;
  element.dataset.error = String(Boolean(error));
}

function installStyles() {
  if (document.querySelector("style[data-volt-reading-management]")) return;
  const style = document.createElement("style");
  style.dataset.voltReadingManagement = BUILD;
  style.textContent = `
    .reading-management-actions { display:flex; flex-wrap:wrap; gap:var(--space-2); margin-top:var(--space-3); padding-top:var(--space-3); border-top:1px solid var(--glass-border); }
    .reading-management-button { display:inline-flex; min-height:2.45rem; padding:.5rem .85rem; align-items:center; justify-content:center; border:1px solid var(--glass-border-strong); border-radius:var(--radius-sm); background:var(--glass-control); color:var(--text-primary); font:inherit; font-size:var(--font-size-sm); font-weight:800; cursor:pointer; }
    .reading-management-button:hover { border-color:var(--volt-accent); color:var(--volt-accent-strong); }
    .reading-management-button:disabled { opacity:.55; cursor:wait; }
    .reading-management-danger { color:#b4232f; }
    .reading-management-danger:hover { border-color:#d64550; color:#b4232f; }
    .reading-management-dialog { width:min(92vw, 34rem); max-width:34rem; padding:0; border:0; background:transparent; color:var(--text-primary); }
    .reading-management-dialog::backdrop { background:rgba(0, 0, 0, .48); backdrop-filter:blur(8px); }
    .reading-management-dialog .dialog-card { width:100%; box-sizing:border-box; }
    .reading-management-dialog-actions { display:flex; justify-content:flex-end; gap:var(--space-2); }
    @media (max-width: 620px) {
      .reading-management-actions { width:100%; }
      .reading-management-actions .reading-management-button { flex:1; }
      .reading-management-dialog-actions { display:grid; grid-template-columns:1fr 1fr; }
    }
  `;
  document.head.append(style);
}

function toLocalDateTimeInput(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function formatValue(reading) {
  const decimals = reading.type === "water" ? 3 : 0;
  return `${Number(reading.value).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${TYPE_UNITS[reading.type]}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data desconhecida";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
