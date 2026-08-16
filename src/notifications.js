const NOTIFICATION_BUILD = "20260816.3";
const VAPID_PUBLIC_KEY = "BNhVQfuYd6vscLIbEBzAZ2aVDFXybRcQk3zWQ2kUR4ExGBCPVU62uFN00MCT541FPrP7mmRUxs7BDdYRw1oM3FY";
const DEFAULT_PREFERENCES = Object.freeze({
  notifications_enabled: true,
  push_enabled: false,
  sounds_enabled: true,
  reading_sound_enabled: true,
  goal_sound_enabled: true,
  warning_sound_enabled: true,
  cycle_sound_enabled: true,
  vibration_enabled: true,
  admin_new_user_enabled: true,
  admin_critical_enabled: true,
  admin_activity_enabled: false,
  admin_daily_digest_enabled: true,
  daily_digest_hour: 20
});

let client = null;
let activeUserId = null;
let preferences = { ...DEFAULT_PREFERENCES };
let notificationRows = [];
let realtimeChannel = null;
let initializedForUser = null;
let syncPromise = null;
let audioContext = null;
let readingObserver = null;
let lastReadingMessage = "";
let deepLinkHandled = false;

loadNotificationStyles();
mountNotificationUi();
bindNotificationUi();
watchReadingConfirmation();
renderAll();

window.addEventListener("volt:startup-status", (event) => {
  const status = event.detail?.status || document.documentElement.dataset.startupStatus;
  if (status === "READY") void syncNotificationCenter();
  if (status === "SIGNED_OUT") resetNotificationCenter();
});

if (document.documentElement.dataset.startupStatus === "READY") {
  void syncNotificationCenter();
}

function loadNotificationStyles() {
  if (document.querySelector("link[data-volt-notifications]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/notifications.css?v=${NOTIFICATION_BUILD}`;
  link.dataset.voltNotifications = "";
  document.head.append(link);
}

function mountNotificationUi() {
  mountAlertCenter();
  mountSettingsCard();
  mountNotificationBadges();
}

function mountAlertCenter() {
  if (document.getElementById("notification-center-card")) return;
  const page = document.getElementById("page-alerts");
  if (!page) return;

  const card = document.createElement("section");
  card.id = "notification-center-card";
  card.className = "card glass-level-2 notification-center-card";
  card.setAttribute("aria-labelledby", "notification-center-title");
  card.innerHTML = `
    <div class="notification-center-heading">
      <div>
        <p class="eyebrow">CENTRAL DO VOLT</p>
        <h2 id="notification-center-title">Notificações</h2>
        <p class="supporting-copy">Eventos da sua conta e avisos importantes do VOLT.</p>
      </div>
      <div class="notification-center-actions">
        <span id="notification-unread-count" class="status-pill">0 novas</span>
        <button id="notification-mark-all" class="secondary-button compact" type="button">Marcar como lidas</button>
      </div>
    </div>
    <div id="notification-center-empty" class="notification-center-empty">
      <svg class="icon" aria-hidden="true"><use href="#icon-alert"></use></svg>
      <div><strong>Nenhuma notificação</strong><p class="supporting-copy">Quando houver algo novo, ele aparecerá aqui.</p></div>
    </div>
    <div id="notification-center-list" class="notification-center-list" role="list"></div>
    <p id="notification-center-message" class="status-message" role="status" aria-live="polite"></p>
  `;

  const consumptionAlerts = page.querySelector("#alerts-list")?.closest("article");
  if (consumptionAlerts) page.insertBefore(card, consumptionAlerts);
  else page.append(card);
}

function mountSettingsCard() {
  if (document.getElementById("notifications-settings-card")) return;
  const layout = document.querySelector("#page-settings .settings-layout");
  if (!layout) return;

  const section = document.createElement("section");
  section.id = "notifications-settings-card";
  section.className = "settings-group wide card glass-level-2 notifications-settings-card";
  section.innerHTML = `
    <div class="notification-settings-heading">
      <div>
        <p class="eyebrow">NOTIFICAÇÕES E SONS</p>
        <h2>Alertas do VOLT</h2>
        <p class="supporting-copy">Escolha o que pode avisar você neste dispositivo e dentro do aplicativo.</p>
      </div>
      <span id="notification-push-status" class="status-pill">Verificando</span>
    </div>

    <div class="notification-settings-grid">
      <label class="notification-setting-row">
        <span><strong>Notificações</strong><small>Permite avisos na central e, quando ativado, por push.</small></span>
        <input id="notification-enabled" type="checkbox" data-notification-pref="notifications_enabled">
      </label>

      <div class="notification-setting-row notification-push-row">
        <span><strong>Notificações push</strong><small id="notification-push-description">Receba avisos mesmo fora do VOLT.</small></span>
        <div class="notification-push-controls">
          <input id="notification-push-enabled" type="checkbox" aria-label="Ativar notificações push">
          <button id="notification-push-action" class="text-button" type="button" hidden>Configurar neste dispositivo</button>
        </div>
      </div>

      <label class="notification-setting-row">
        <span><strong>Sons dentro do aplicativo</strong><small>Usa a identidade sonora do VOLT durante o uso.</small></span>
        <input id="notification-sounds-enabled" type="checkbox" data-notification-pref="sounds_enabled">
      </label>

      <div class="notification-sound-preview">
        <div><strong>Identidade sonora</strong><small>Prévia curta do som de confirmação.</small></div>
        <button id="notification-test-sound" class="secondary-button compact" type="button">Testar som</button>
      </div>

      <label class="notification-setting-row">
        <span><strong>Leitura registrada</strong><small>Confirma com um pulso curto após salvar uma leitura.</small></span>
        <input id="notification-reading-sound" type="checkbox" data-notification-pref="reading_sound_enabled">
      </label>

      <label class="notification-setting-row">
        <span><strong>Meta atingida</strong><small>Som positivo quando uma meta ou objetivo for concluído.</small></span>
        <input id="notification-goal-sound" type="checkbox" data-notification-pref="goal_sound_enabled">
      </label>

      <label class="notification-setting-row">
        <span><strong>Atenção de consumo</strong><small>Tom mais grave para avisos que exigem atenção.</small></span>
        <input id="notification-warning-sound" type="checkbox" data-notification-pref="warning_sound_enabled">
      </label>

      <label class="notification-setting-row">
        <span><strong>Ciclo ou fatura concluída</strong><small>Confirma o fechamento de um ciclo.</small></span>
        <input id="notification-cycle-sound" type="checkbox" data-notification-pref="cycle_sound_enabled">
      </label>

      <label class="notification-setting-row">
        <span><strong>Vibração</strong><small>Usada somente quando o navegador e o aparelho oferecem suporte.</small></span>
        <input id="notification-vibration" type="checkbox" data-notification-pref="vibration_enabled">
      </label>
    </div>

    <div id="notification-admin-settings" class="notification-admin-settings" hidden>
      <div class="notification-admin-heading">
        <div><p class="eyebrow">PROPRIETÁRIO</p><h3>Alertas administrativos</h3></div>
        <span class="chip">Protegido por MFA</span>
      </div>
      <div class="notification-settings-grid">
        <label class="notification-setting-row">
          <span><strong>Novos usuários confirmados</strong><small>Avisa quando a confirmação de e-mail for concluída.</small></span>
          <input id="notification-admin-new-user" type="checkbox" data-notification-pref="admin_new_user_enabled">
        </label>
        <label class="notification-setting-row">
          <span><strong>Problemas críticos</strong><small>Reserva o canal para falhas que exigem ação administrativa.</small></span>
          <input id="notification-admin-critical" type="checkbox" data-notification-pref="admin_critical_enabled">
        </label>
        <label class="notification-setting-row">
          <span><strong>Atividade de usuários</strong><small>Desativado por padrão para evitar excesso de notificações.</small></span>
          <input id="notification-admin-activity" type="checkbox" data-notification-pref="admin_activity_enabled">
        </label>
        <label class="notification-setting-row">
          <span><strong>Resumo diário</strong><small>Consolida novos cadastros, confirmações e usuários ativos.</small></span>
          <input id="notification-admin-digest" type="checkbox" data-notification-pref="admin_daily_digest_enabled">
        </label>
        <label class="notification-setting-row">
          <span><strong>Horário do resumo</strong><small>Horário de Manaus (AM).</small></span>
          <select id="notification-digest-hour" aria-label="Horário do resumo diário"></select>
        </label>
      </div>
    </div>
    <p id="notification-settings-message" class="status-message" role="status" aria-live="polite"></p>
  `;

  layout.append(section);
  fillDigestHours();
}

function mountNotificationBadges() {
  document.querySelectorAll("[data-nav='alerts']").forEach((button) => {
    if (button.querySelector("[data-notification-badge]")) return;
    const badge = document.createElement("span");
    badge.className = "notification-nav-badge";
    badge.dataset.notificationBadge = "";
    badge.hidden = true;
    badge.textContent = "0";
    badge.setAttribute("aria-hidden", "true");
    button.append(badge);
  });
}

function fillDigestHours() {
  const select = document.getElementById("notification-digest-hour");
  if (!select || select.options.length) return;
  for (let hour = 0; hour < 24; hour += 1) {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = `${String(hour).padStart(2, "0")}:00`;
    select.append(option);
  }
}

function bindNotificationUi() {
  document.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const select = event.target instanceof HTMLSelectElement ? event.target : null;

    if (input?.dataset.notificationPref) {
      void persistPreference(input.dataset.notificationPref, input.checked);
      return;
    }

    if (input?.id === "notification-push-enabled") {
      void handlePushToggle(input.checked);
      return;
    }

    if (select?.id === "notification-digest-hour") {
      void persistPreference("daily_digest_hour", Number(select.value));
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("#notification-test-sound")) {
      void playSound("preview", true);
      return;
    }

    if (target.closest("#notification-push-action")) {
      void enablePushOnDevice();
      return;
    }

    if (target.closest("#notification-mark-all")) {
      void markAllNotificationsRead();
      return;
    }

    const readButton = target.closest("[data-notification-read]");
    if (readButton) {
      void markNotificationRead(readButton.getAttribute("data-notification-read"));
      return;
    }

    const dismissButton = target.closest("[data-notification-dismiss]");
    if (dismissButton) {
      void dismissNotification(dismissButton.getAttribute("data-notification-dismiss"));
    }
  });

  const primeAudio = () => {
    void ensureAudioContext();
    window.removeEventListener("pointerdown", primeAudio);
    window.removeEventListener("keydown", primeAudio);
  };
  window.addEventListener("pointerdown", primeAudio, { passive: true });
  window.addEventListener("keydown", primeAudio);
}

function watchReadingConfirmation() {
  const element = document.getElementById("readings-message");
  if (!element || readingObserver) return;
  readingObserver = new MutationObserver(() => {
    const message = element.textContent?.trim() || "";
    if (message === "Leitura registrada." && message !== lastReadingMessage) {
      lastReadingMessage = message;
      void playSound("reading");
      vibrate([20]);
      window.setTimeout(() => { lastReadingMessage = ""; }, 500);
    } else if (message !== "Leitura registrada.") {
      lastReadingMessage = message;
    }
  });
  readingObserver.observe(element, { childList: true, characterData: true, subtree: true });
}

async function syncNotificationCenter() {
  if (syncPromise) return syncPromise;
  syncPromise = performSync().finally(() => { syncPromise = null; });
  return syncPromise;
}

async function performSync() {
  mountNotificationUi();
  const userId = currentUserId();
  if (!userId) return;

  client = globalThis.__VOLT_SUPABASE_CLIENT__ || null;
  if (!client) {
    window.setTimeout(() => void syncNotificationCenter(), 250);
    return;
  }

  activeUserId = userId;
  if (initializedForUser === userId && realtimeChannel) {
    renderAll();
    return;
  }

  cleanupRealtime();
  setMessage("notification-center-message", "Carregando notificações…");

  try {
    const [{ data: preferenceData, error: preferenceError }, { data: rows, error: notificationError }] = await Promise.all([
      client.from("beta_notification_preferences").select("*").eq("user_id", userId).maybeSingle(),
      client.from("beta_notifications")
        .select("id,event_type,title,body,priority,data,created_at,read_at,dismissed_at")
        .eq("recipient_user_id", userId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(40)
    ]);
    if (preferenceError) throw preferenceError;
    if (notificationError) throw notificationError;

    preferences = normalizePreferences(preferenceData);
    notificationRows = Array.isArray(rows) ? rows : [];
    initializedForUser = userId;
    subscribeRealtime(userId);
    renderAll();
    setMessage("notification-center-message", "");
    await handleNotificationDeepLink();
  } catch (error) {
    console.warn("VOLT notification center unavailable", error instanceof Error ? error.message : "unknown_error");
    setMessage("notification-center-message", "Não foi possível carregar as notificações agora.", true);
  }
}

function resetNotificationCenter() {
  cleanupRealtime();
  activeUserId = null;
  initializedForUser = null;
  notificationRows = [];
  preferences = { ...DEFAULT_PREFERENCES };
  deepLinkHandled = false;
  renderAll();
}

function subscribeRealtime(userId) {
  if (!client?.channel) return;
  realtimeChannel = client
    .channel(`volt-notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "beta_notifications", filter: `recipient_user_id=eq.${userId}` },
      handleRealtimeNotification
    )
    .subscribe();
}

function cleanupRealtime() {
  if (client && realtimeChannel) {
    try { void client.removeChannel(realtimeChannel); }
    catch { /* Realtime cleanup is best effort. */ }
  }
  realtimeChannel = null;
}

function handleRealtimeNotification(payload) {
  const row = payload?.new;
  if (!row?.id) return;

  if (payload.eventType === "INSERT") {
    notificationRows = [row, ...notificationRows.filter((item) => item.id !== row.id)].slice(0, 40);
    void playSound(soundKindForNotification(row));
    vibrate(row.priority === "critical" ? [35, 60, 35] : [20]);
  } else if (payload.eventType === "UPDATE") {
    if (row.dismissed_at) notificationRows = notificationRows.filter((item) => item.id !== row.id);
    else notificationRows = notificationRows.map((item) => item.id === row.id ? { ...item, ...row } : item);
  }

  renderAll();
}

async function persistPreference(key, value) {
  if (!activeUserId || !client || !(key in DEFAULT_PREFERENCES)) return;
  const previous = { ...preferences };
  preferences = { ...preferences, [key]: value };
  renderPreferences();

  try {
    const payload = { user_id: activeUserId, ...preferences, updated_at: new Date().toISOString() };
    const { data, error } = await client
      .from("beta_notification_preferences")
      .upsert(payload)
      .select("*")
      .single();
    if (error) throw error;
    preferences = normalizePreferences(data);
    renderPreferences();
    setMessage("notification-settings-message", "Preferências atualizadas.");
  } catch (error) {
    preferences = previous;
    renderPreferences();
    setMessage("notification-settings-message", "Não foi possível salvar essa preferência.", true);
    console.warn("VOLT notification preference update failed", error instanceof Error ? error.message : "unknown_error");
  }
}

async function handlePushToggle(enabled) {
  if (enabled) {
    await enablePushOnDevice();
    return;
  }
  await disablePushOnDevice();
}

async function enablePushOnDevice() {
  const pushInput = document.getElementById("notification-push-enabled");
  setPushBusy(true);

  try {
    if (!pushCapability().supported) throw new Error(pushCapability().message);

    let permission = Notification.permission;
    if (permission === "default") permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("As notificações foram bloqueadas pelo navegador.");

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const serialized = subscription.toJSON();
    const p256dh = serialized.keys?.p256dh || "";
    const auth = serialized.keys?.auth || "";
    if (!serialized.endpoint || !p256dh || !auth) throw new Error("O navegador não retornou as chaves de push.");

    const { error } = await client.rpc("beta_register_push_subscription", {
      p_endpoint: serialized.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_expiration_time: serialized.expirationTime ?? null,
      p_user_agent: navigator.userAgent
    });
    if (error) throw error;

    await persistPreference("push_enabled", true);
    if (pushInput) pushInput.checked = true;
    setMessage("notification-settings-message", "Notificações push ativadas neste dispositivo.");
  } catch (error) {
    if (pushInput) pushInput.checked = Boolean(preferences.push_enabled);
    setMessage("notification-settings-message", error instanceof Error ? error.message : "Não foi possível ativar o push.", true);
  } finally {
    setPushBusy(false);
    void renderPushState();
  }
}

async function disablePushOnDevice() {
  const pushInput = document.getElementById("notification-push-enabled");
  setPushBusy(true);

  try {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const { error } = await client.rpc("beta_unregister_push_subscription", { p_endpoint: subscription.endpoint });
        if (error) throw error;
        await subscription.unsubscribe();
      }
    }
    await persistPreference("push_enabled", false);
    if (pushInput) pushInput.checked = false;
    setMessage("notification-settings-message", "Notificações push desativadas neste dispositivo.");
  } catch (error) {
    if (pushInput) pushInput.checked = Boolean(preferences.push_enabled);
    setMessage("notification-settings-message", error instanceof Error ? error.message : "Não foi possível desativar o push.", true);
  } finally {
    setPushBusy(false);
    void renderPushState();
  }
}

function setPushBusy(busy) {
  const input = document.getElementById("notification-push-enabled");
  const action = document.getElementById("notification-push-action");
  if (input) input.disabled = busy;
  if (action) action.disabled = busy;
}

async function renderPushState() {
  const status = document.getElementById("notification-push-status");
  const description = document.getElementById("notification-push-description");
  const input = document.getElementById("notification-push-enabled");
  const action = document.getElementById("notification-push-action");
  if (!status || !description || !input || !action) return;

  input.checked = Boolean(preferences.push_enabled);
  status.removeAttribute("data-tone");
  action.hidden = true;
  action.disabled = false;

  if (!activeUserId) {
    status.textContent = "Indisponível";
    description.textContent = "Entre na sua conta para configurar notificações.";
    input.disabled = true;
    return;
  }

  const capability = pushCapability();
  if (!capability.supported) {
    status.textContent = "Indisponível";
    description.textContent = capability.message;
    input.disabled = true;
    return;
  }

  input.disabled = false;
  if (Notification.permission === "denied") {
    status.textContent = "Bloqueado";
    status.dataset.tone = "warning";
    description.textContent = "Libere notificações nas configurações do navegador ou do sistema.";
    action.hidden = false;
    action.textContent = "Como corrigir";
    action.disabled = true;
    return;
  }

  let subscription = null;
  try {
    const registration = await navigator.serviceWorker.ready;
    subscription = await registration.pushManager.getSubscription();
  } catch {
    subscription = null;
  }

  if (preferences.push_enabled && subscription) {
    status.textContent = "Ativado";
    status.dataset.tone = "success";
    description.textContent = "Este dispositivo está registrado para receber notificações do VOLT.";
    return;
  }

  if (preferences.push_enabled) {
    status.textContent = "Falta configurar";
    status.dataset.tone = "warning";
    description.textContent = "O push está permitido na conta, mas este dispositivo ainda não foi registrado.";
    action.hidden = false;
    action.textContent = "Configurar neste dispositivo";
    return;
  }

  status.textContent = "Desativado";
  description.textContent = "Ative para receber avisos mesmo quando o VOLT não estiver aberto.";
}

function pushCapability() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || "")
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;

  if (ios && !standalone) {
    return { supported: false, message: "No iPhone, instale o VOLT na Tela de Início antes de ativar notificações push." };
  }

  const supported = "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window;

  return supported
    ? { supported: true, message: "" }
    : { supported: false, message: "Este navegador não oferece Web Push para o VOLT." };
}

async function markNotificationRead(id) {
  if (!id || !client) return;
  const readAt = new Date().toISOString();
  const { error } = await client.from("beta_notifications").update({ read_at: readAt }).eq("id", id);
  if (error) {
    setMessage("notification-center-message", "Não foi possível marcar a notificação como lida.", true);
    return;
  }
  notificationRows = notificationRows.map((row) => row.id === id ? { ...row, read_at: readAt } : row);
  renderAll();
}

async function dismissNotification(id) {
  if (!id || !client) return;
  const now = new Date().toISOString();
  const { error } = await client
    .from("beta_notifications")
    .update({ read_at: now, dismissed_at: now })
    .eq("id", id);
  if (error) {
    setMessage("notification-center-message", "Não foi possível ocultar a notificação.", true);
    return;
  }
  notificationRows = notificationRows.filter((row) => row.id !== id);
  renderAll();
}

async function markAllNotificationsRead() {
  if (!client) return;
  const unreadIds = notificationRows.filter((row) => !row.read_at).map((row) => row.id);
  if (!unreadIds.length) return;

  const readAt = new Date().toISOString();
  const { error } = await client.from("beta_notifications").update({ read_at: readAt }).in("id", unreadIds);
  if (error) {
    setMessage("notification-center-message", "Não foi possível atualizar as notificações.", true);
    return;
  }
  notificationRows = notificationRows.map((row) => unreadIds.includes(row.id) ? { ...row, read_at: readAt } : row);
  renderAll();
}

async function handleNotificationDeepLink() {
  if (deepLinkHandled) return;
  const url = new URL(location.href);
  const notificationId = url.searchParams.get("notification");
  if (!notificationId) return;

  deepLinkHandled = true;
  document.querySelector("[data-nav='alerts']")?.click();
  await markNotificationRead(notificationId);
  url.searchParams.delete("notification");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderAll() {
  mountNotificationUi();
  renderPreferences();
  renderNotificationList();
  renderBadge();
  void renderPushState();
}

function renderPreferences() {
  document.querySelectorAll("[data-notification-pref]").forEach((element) => {
    if (!(element instanceof HTMLInputElement)) return;
    const key = element.dataset.notificationPref;
    element.checked = Boolean(preferences[key]);
    element.disabled = !activeUserId;
  });

  const pushInput = document.getElementById("notification-push-enabled");
  if (pushInput) pushInput.checked = Boolean(preferences.push_enabled);

  const digestHour = document.getElementById("notification-digest-hour");
  if (digestHour) {
    digestHour.value = String(Number(preferences.daily_digest_hour ?? 20));
    digestHour.disabled = !activeUserId;
  }

  const adminSettings = document.getElementById("notification-admin-settings");
  if (adminSettings) adminSettings.hidden = !isAdministrativeSession();

  const markAll = document.getElementById("notification-mark-all");
  if (markAll) markAll.disabled = notificationRows.every((row) => Boolean(row.read_at));
}

function renderNotificationList() {
  const list = document.getElementById("notification-center-list");
  const empty = document.getElementById("notification-center-empty");
  const count = document.getElementById("notification-unread-count");
  if (!list || !empty || !count) return;

  list.replaceChildren(...notificationRows.map(createNotificationItem));
  empty.hidden = notificationRows.length > 0;

  const unread = unreadCount();
  count.textContent = unread === 1 ? "1 nova" : `${unread} novas`;
  count.dataset.tone = unread ? "warning" : "success";
}

function createNotificationItem(row) {
  const article = document.createElement("article");
  article.className = "notification-item";
  article.dataset.unread = String(!row.read_at);
  article.dataset.priority = row.priority || "normal";
  article.setAttribute("role", "listitem");

  const marker = document.createElement("span");
  marker.className = "notification-item-marker";
  marker.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "notification-item-copy";

  const header = document.createElement("div");
  header.className = "notification-item-header";
  const title = document.createElement("strong");
  title.textContent = row.title || "Notificação";
  const time = document.createElement("time");
  time.dateTime = row.created_at || "";
  time.textContent = relativeTime(row.created_at);
  header.append(title, time);

  const body = document.createElement("p");
  body.textContent = row.body || "";

  content.append(header, body);

  if (row.event_type === "admin.user_confirmed" && isAdministrativeSession()) {
    const details = document.createElement("div");
    details.className = "notification-user-detail";
    const name = String(row.data?.name || "Novo usuário");
    const email = String(row.data?.email || "");
    const nameNode = document.createElement("strong");
    nameNode.textContent = name;
    const emailNode = document.createElement("small");
    emailNode.textContent = email;
    details.append(nameNode, emailNode);
    content.append(details);
  }

  if (row.event_type === "admin.digest_daily" && isAdministrativeSession()) {
    const summary = document.createElement("div");
    summary.className = "notification-digest-metrics";
    appendDigestMetric(summary, "Cadastros", row.data?.new_users);
    appendDigestMetric(summary, "Confirmados", row.data?.confirmed_users);
    appendDigestMetric(summary, "Ativos 30d", row.data?.active_last_30_days);
    content.append(summary);
  }

  const actions = document.createElement("div");
  actions.className = "notification-item-actions";
  if (!row.read_at) {
    const read = document.createElement("button");
    read.className = "text-button";
    read.type = "button";
    read.dataset.notificationRead = row.id;
    read.textContent = "Marcar como lida";
    actions.append(read);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "text-button";
  dismiss.type = "button";
  dismiss.dataset.notificationDismiss = row.id;
  dismiss.textContent = "Ocultar";
  actions.append(dismiss);

  content.append(actions);
  article.append(marker, content);
  return article;
}

function appendDigestMetric(parent, label, value) {
  const metric = document.createElement("span");
  const strong = document.createElement("strong");
  const small = document.createElement("small");
  strong.textContent = Number.isFinite(Number(value)) ? String(Number(value)) : "0";
  small.textContent = label;
  metric.append(strong, small);
  parent.append(metric);
}

function renderBadge() {
  const unread = unreadCount();
  document.querySelectorAll("[data-notification-badge]").forEach((badge) => {
    badge.hidden = unread === 0;
    badge.textContent = unread > 99 ? "99+" : String(unread);
  });
}

function unreadCount() {
  return notificationRows.reduce((total, row) => total + (row.read_at ? 0 : 1), 0);
}

function currentUserId() {
  try {
    const adminState = globalThis.__VOLT_ADMIN_VIEW_BRIDGE__?.getState?.();
    return adminState?.authenticatedUserId
      || adminState?.account?.id
      || globalThis.__VOLT_CANONICAL_SYNC_BRIDGE__?.getState?.().authenticatedUserId
      || null;
  } catch {
    return null;
  }
}

function isAdministrativeSession() {
  try {
    return Boolean(globalThis.__VOLT_ADMIN_VIEW_BRIDGE__?.getState?.().permissions?.canManageUsers);
  } catch {
    return false;
  }
}

function normalizePreferences(row) {
  const source = row || {};
  const normalized = {};
  for (const [key, fallback] of Object.entries(DEFAULT_PREFERENCES)) {
    if (typeof fallback === "boolean") normalized[key] = typeof source[key] === "boolean" ? source[key] : fallback;
    else normalized[key] = Number.isFinite(Number(source[key])) ? Number(source[key]) : fallback;
  }
  normalized.daily_digest_hour = Math.min(23, Math.max(0, Math.trunc(normalized.daily_digest_hour)));
  return normalized;
}

function setMessage(id, message, error = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.dataset.error = String(Boolean(error));
}

function relativeTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const absolute = Math.abs(seconds);

  if (absolute < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return formatter.format(days, "day");
  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 5) return formatter.format(weeks, "week");
  const months = Math.round(days / 30.4375);
  if (Math.abs(months) < 12) return formatter.format(months, "month");
  return formatter.format(Math.round(days / 365.25), "year");
}

function soundKindForNotification(row) {
  if (row.priority === "critical" || row.priority === "high") return "warning";
  if (row.event_type === "admin.digest_daily" || String(row.event_type || "").includes("cycle")) return "cycle";
  if (String(row.event_type || "").includes("goal")) return "goal";
  return "notification";
}

function soundEnabled(kind) {
  if (!preferences.sounds_enabled) return false;
  if (kind === "reading") return preferences.reading_sound_enabled;
  if (kind === "goal") return preferences.goal_sound_enabled;
  if (kind === "warning") return preferences.warning_sound_enabled;
  if (kind === "cycle") return preferences.cycle_sound_enabled;
  return true;
}

async function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") {
    try { await audioContext.resume(); }
    catch { return null; }
  }
  return audioContext;
}

async function playSound(kind = "notification", force = false) {
  if (!force && !soundEnabled(kind)) return;
  const context = await ensureAudioContext();
  if (!context || context.state !== "running") return;

  const sequence = {
    preview: [[620, 0, 0.07], [820, 0.09, 0.09]],
    notification: [[680, 0, 0.065], [860, 0.075, 0.08]],
    reading: [[720, 0, 0.07]],
    goal: [[560, 0, 0.07], [760, 0.08, 0.1]],
    warning: [[360, 0, 0.09], [330, 0.12, 0.1]],
    cycle: [[520, 0, 0.06], [660, 0.07, 0.07]]
  }[kind] || [[680, 0, 0.07]];

  const start = context.currentTime + 0.012;
  for (const [frequency, offset, duration] of sequence) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.055, start + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration + 0.02);
  }
}

function vibrate(pattern) {
  if (!preferences.vibration_enabled || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(pattern); }
  catch { /* Vibration is optional. */ }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}
