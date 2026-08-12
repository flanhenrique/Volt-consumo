const TUTORIAL_NOTICE_VERSION = "2026-08-10-v1";
const LOCAL_ACK_KEY = `volt-beta-guided-ack-${TUTORIAL_NOTICE_VERSION}`;
const CONFIG = window.VOLT_SUPABASE_BETA || {};

let tutorialClient = null;
let mandatoryTour = false;
let acknowledgementPending = false;
let accountSyncPending = false;
let tutorialRequirementKey = "";
let tutorialRequirementPromise = null;

queueMicrotask(initializeTutorialAcknowledgement);

function initializeTutorialAcknowledgement() {
  attachTutorialAckStyles();
  const dialog = document.querySelector("#guided-tour-dialog");
  if (!dialog) return;

  dialog.addEventListener("click", interceptTourActions, true);
  dialog.addEventListener("cancel", interceptMandatoryClose, true);

  const nextButton = dialog.querySelector("#guided-tour-next");
  if (nextButton) {
    nextButton.addEventListener("click", interceptConfirmButton, true);
    nextButton.addEventListener("touchend", interceptConfirmTouch, { capture: true, passive: false });
  }

  const body = dialog.querySelector("#guided-tour-body");
  const progress = dialog.querySelector("#guided-tour-progress");
  if (body) new MutationObserver(syncTourStep).observe(body, { childList: true, subtree: true });
  if (progress) new MutationObserver(syncTourStep).observe(progress, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  syncTourStep();

  const client = getTutorialClient();
  if (!client) return;
  client.auth.onAuthStateChange((_event, session) => {
    if (session?.user) queueMicrotask(() => scheduleTutorialRequirement(session.user));
    else {
      mandatoryTour = false;
      tutorialRequirementKey = "";
      tutorialRequirementPromise = null;
    }
  });
  client.auth.getSession().then(({ data }) => {
    if (data?.session?.user) scheduleTutorialRequirement(data.session.user);
  }).catch(() => undefined);
}

function attachTutorialAckStyles() {
  if (document.querySelector('link[href*="tutorial-ack.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./tutorial-ack.css";
  document.head.append(link);
}

function getTutorialClient() {
  if (tutorialClient) return tutorialClient;
  if (!window.supabase?.createClient || !CONFIG.url || !CONFIG.publishableKey) return null;
  tutorialClient = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return tutorialClient;
}

function scheduleTutorialRequirement(user) {
  if (!user?.id) return Promise.resolve();
  const key = [
    user.id,
    user.user_metadata?.guided_tutorial_notice_version || "",
    safeGet(LOCAL_ACK_KEY) || ""
  ].join("|");
  if (key === tutorialRequirementKey) return tutorialRequirementPromise || Promise.resolve();
  tutorialRequirementKey = key;
  tutorialRequirementPromise = Promise.resolve()
    .then(() => requireCurrentTutorial(user))
    .finally(() => {
      tutorialRequirementPromise = null;
    });
  return tutorialRequirementPromise;
}

async function requireCurrentTutorial(user) {
  const acknowledgedInAccount = user?.user_metadata?.guided_tutorial_notice_version === TUTORIAL_NOTICE_VERSION;
  const acknowledgedLocally = safeGet(LOCAL_ACK_KEY) === "true";

  if (acknowledgedInAccount) {
    safeSet(LOCAL_ACK_KEY, "true");
    mandatoryTour = false;
    return;
  }

  if (acknowledgedLocally) {
    mandatoryTour = false;
    queueMicrotask(syncTutorialAckToAccount);
    return;
  }

  mandatoryTour = true;
  await waitForDashboard();
  const dialog = document.querySelector("#guided-tour-dialog");
  if (!dialog || dialog.open) return;
  if (typeof window.showOnboarding === "function") window.showOnboarding();
  window.setTimeout(() => {
    const activeDialog = document.querySelector("#guided-tour-dialog");
    if (activeDialog?.open) {
      activeDialog.dataset.mandatory = "true";
      syncTourStep();
    }
  }, 0);
}

function waitForDashboard() {
  return new Promise((resolve) => {
    const ready = () => {
      const dashboard = document.querySelector("#dashboard");
      return dashboard && !dashboard.hidden;
    };
    if (ready()) { resolve(); return; }
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (ready() || attempts > 60) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

function interceptMandatoryClose(event) {
  if (!mandatoryTour) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  showAckStatus("Conclua o guia e confirme sua ciência para continuar.");
}

function interceptTourActions(event) {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;
  const close = target.closest(".guided-tour-close");
  if (close && mandatoryTour) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showAckStatus("Conclua o guia e confirme sua ciência para continuar.");
    return;
  }

  const next = target.closest("#guided-tour-next");
  if (!next || !isLastStep()) return;
  interceptConfirmationEvent(event, next);
}

function interceptConfirmButton(event) {
  if (!isLastStep()) return;
  interceptConfirmationEvent(event, event.currentTarget);
}

function interceptConfirmTouch(event) {
  if (!isLastStep()) return;
  interceptConfirmationEvent(event, event.currentTarget);
}

function interceptConfirmationEvent(event, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  confirmTutorialAcknowledgement(document.querySelector("#guided-tour-dialog"), button);
}

function confirmTutorialAcknowledgement(dialog, button) {
  if (acknowledgementPending || !dialog) return;
  const checkbox = dialog.querySelector("#guided-tour-ack-checkbox");
  if (!checkbox?.checked) {
    showAckStatus("Marque a confirmação de ciência para concluir o guia.");
    checkbox?.focus();
    return;
  }

  acknowledgementPending = true;
  mandatoryTour = false;
  dialog.dataset.mandatory = "false";
  if (button) {
    button.disabled = true;
    button.textContent = "Confirmado";
  }

  // Fecha primeiro. Nenhuma operação de storage ou rede pode bloquear o toque
  // no Android/Chrome/WebView.
  closeDialogImmediately(dialog);

  safeSet(LOCAL_ACK_KEY, "true");
  safeSet("volt-beta-onboarding-complete", "true");
  acknowledgementPending = false;

  window.setTimeout(() => {
    if (button) button.disabled = false;
    queueMicrotask(syncTutorialAckToAccount);
  }, 0);
}

function closeDialogImmediately(dialog) {
  try {
    if (dialog.open && typeof dialog.close === "function") dialog.close();
  } catch {
    // fallback abaixo
  }
  if (dialog.open || dialog.hasAttribute("open")) dialog.removeAttribute("open");
  document.documentElement.classList.remove("guided-tour-open");
  document.body?.classList.remove("guided-tour-open");
}

async function syncTutorialAckToAccount() {
  if (accountSyncPending || safeGet(LOCAL_ACK_KEY) !== "true") return;
  const client = getTutorialClient();
  if (!client) return;

  accountSyncPending = true;
  try {
    const { data } = await client.auth.getUser();
    const user = data?.user;
    if (!user || user.user_metadata?.guided_tutorial_notice_version === TUTORIAL_NOTICE_VERSION) return;

    const { error } = await client.auth.updateUser({
      data: {
        ...(user.user_metadata || {}),
        guided_tutorial_notice_version: TUTORIAL_NOTICE_VERSION,
        guided_tutorial_acknowledged_at: new Date().toISOString()
      }
    });
    if (error) console.warn("Volt: confirmação do tutorial pendente de sincronização", error);
  } catch (error) {
    console.warn("Volt: confirmação do tutorial pendente de sincronização", error);
  } finally {
    accountSyncPending = false;
  }
}

function syncTourStep() {
  const dialog = document.querySelector("#guided-tour-dialog");
  if (!dialog) return;
  if (mandatoryTour) dialog.dataset.mandatory = "true";

  const progress = dialog.querySelector("#guided-tour-progress");
  const dots = [...(progress?.querySelectorAll("span") || [])];
  const current = Math.max(0, dots.findIndex((dot) => dot.classList.contains("active")));
  let counter = dialog.querySelector("#guided-tour-step-counter");
  if (!counter) {
    counter = document.createElement("span");
    counter.id = "guided-tour-step-counter";
    counter.className = "guided-tour-step-counter";
    progress?.before(counter);
  }
  if (dots.length) counter.textContent = `Etapa ${current + 1} de ${dots.length}`;

  const button = dialog.querySelector("#guided-tour-next");
  if (!button) return;
  if (isLastStep()) {
    ensureAcknowledgementPanel(dialog);
    button.textContent = "Confirmar ciência";
  } else {
    dialog.querySelector("#guided-tour-ack-panel")?.remove();
    button.textContent = "Próximo";
  }
}

function ensureAcknowledgementPanel(dialog) {
  if (dialog.querySelector("#guided-tour-ack-panel")) return;
  const body = dialog.querySelector("#guided-tour-body");
  if (!body) return;
  const panel = document.createElement("section");
  panel.id = "guided-tour-ack-panel";
  panel.className = "guided-tour-ack-panel";
  panel.innerHTML = `
    <label>
      <input id="guided-tour-ack-checkbox" type="checkbox">
      <span><strong>Confirmo minha ciência.</strong> Entendi que as estimativas do Volt dependem das leituras registradas, do Ciclo de Contagem e das regras da minha localidade/concessionária. Também entendi que devo conferir o registro correto no medidor e os dados da fatura antes de salvar.</span>
    </label>
    <p id="guided-tour-ack-status" class="note" role="status" aria-live="polite"></p>`;
  body.append(panel);
}

function showAckStatus(message) {
  const dialog = document.querySelector("#guided-tour-dialog");
  if (!dialog) return;
  if (isLastStep()) ensureAcknowledgementPanel(dialog);
  let status = dialog.querySelector("#guided-tour-ack-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "guided-tour-ack-status";
    status.className = "note guided-tour-inline-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    dialog.querySelector(".guided-tour-footer")?.before(status);
  }
  status.textContent = message;
}

function isLastStep() {
  const progress = document.querySelector("#guided-tour-progress");
  const dots = [...(progress?.querySelectorAll("span") || [])];
  if (!dots.length) return false;
  const active = dots.findIndex((dot) => dot.classList.contains("active"));
  return active === dots.length - 1;
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
