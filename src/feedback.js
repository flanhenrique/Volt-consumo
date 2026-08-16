import { VOLT_CONFIG } from "../config.js?v=20260813.7";
import { loadSupabaseRuntime } from "./supabase-loader.js?v=20260813.7";
import { createShakeDetector } from "./shake-detector.js?v=20260813.7";

const BUILD = globalThis.__VOLT_BUILD__ || "20260816.3";
const SHAKE_STORAGE_KEY = "volt:feedback:shake-enabled";
const FEEDBACK_BUCKET = "volt-feedback";
const MAX_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_UPLOAD_EDGE = 1600;
const JPEG_QUALITY = 0.82;

let feedbackClientPromise = null;
let currentSource = "help";
let motionListening = false;
let motionPermission = "unknown";
const shakeDetector = createShakeDetector();

init();

function init() {
  loadStyles();
  mountDialog();
  mountSettingsEntry();
  bindHelpEntry();
  bindFeedbackEvents();
  restoreShakePreference();
}

function loadStyles() {
  if (document.querySelector("link[data-volt-feedback-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/feedback.css?v=${BUILD}`;
  link.dataset.voltFeedbackStyle = "";
  document.head.append(link);
}

function mountDialog() {
  if (document.getElementById("feedback-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "feedback-dialog";
  dialog.className = "feedback-dialog";
  dialog.innerHTML = `
    <form id="feedback-form" class="dialog-card form glass-modal glass-shine" novalidate>
      <div class="dialog-heading">
        <div><p class="eyebrow">AJUDA E FEEDBACK</p><h2 id="feedback-title">Relatar ao VOLT</h2></div>
        <button class="icon-button" type="button" data-feedback-close aria-label="Fechar">
          <svg class="icon" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>
      <p class="supporting-copy">Conte o que aconteceu. O VOLT pode anexar apenas informações técnicas do aparelho e da tela atual para facilitar a investigação.</p>
      <label>
        <span>O que aconteceu?</span>
        <select id="feedback-category" required>
          <option value="bug">Algo não está funcionando</option>
          <option value="calculation">Informação ou cálculo parece errado</option>
          <option value="visual">Problema visual</option>
          <option value="suggestion">Sugestão de melhoria</option>
          <option value="other">Outro</option>
        </select>
      </label>
      <label>
        <span>Descreva rapidamente</span>
        <textarea id="feedback-description" rows="5" minlength="3" maxlength="4000" placeholder="Ex.: toquei em registrar leitura e a tela não avançou." required></textarea>
      </label>
      <label class="feedback-file-field">
        <span>Captura de tela <small class="muted">opcional</small></span>
        <input id="feedback-screenshot" type="file" accept="image/jpeg,image/png,image/webp,image/*">
        <small class="muted">A imagem é redimensionada antes do envio e os metadados do arquivo são removidos.</small>
      </label>
      <label class="checkbox-row feedback-context-row">
        <input id="feedback-tech-context" type="checkbox" checked>
        <span>Incluir diagnóstico técnico do aparelho e da tela atual</span>
      </label>
      <details class="feedback-privacy-note">
        <summary>O que será enviado no diagnóstico?</summary>
        <p class="supporting-copy">Versão do VOLT, página atual, sistema/navegador, tamanho da tela, modo de exibição, tema, estado da conexão e horário. Senha, cookies, leituras, valores de consumo e conteúdo de outros campos não são coletados.</p>
      </details>
      <div class="feedback-actions">
        <button id="feedback-submit" class="primary-button" type="submit">Enviar relato</button>
        <button class="secondary-button" type="button" data-feedback-close>Cancelar</button>
      </div>
      <p id="feedback-message" class="status-message" role="status" aria-live="polite"></p>
    </form>
  `;
  document.body.append(dialog);
}

function mountSettingsEntry() {
  const layout = document.querySelector("#page-settings .settings-layout");
  if (!layout || layout.querySelector("[data-feedback-settings]")) return;

  const section = document.createElement("section");
  section.className = "settings-group card glass-level-2 feedback-settings";
  section.dataset.feedbackSettings = "";
  section.innerHTML = `
    <div><p class="eyebrow">AJUDA E FEEDBACK</p><h2>Relatar problemas</h2><p class="supporting-copy">Envie um relato curto sem iniciar uma conversa de suporte.</p></div>
    <button id="feedback-open-settings" class="secondary-button" type="button">Relatar um problema</button>
    <label class="feedback-shake-row" for="feedback-shake-toggle">
      <span><strong>Agitar para reportar</strong><small>Com o VOLT aberto, agite o telefone para abrir o formulário.</small></span>
      <input id="feedback-shake-toggle" type="checkbox" role="switch" aria-describedby="feedback-motion-status">
    </label>
    <p id="feedback-motion-status" class="status-message" role="status" aria-live="polite"></p>
  `;

  const about = [...layout.children].find((child) => child.textContent?.includes("VOLT Consumo"));
  if (about) layout.insertBefore(section, about);
  else layout.append(section);
}

function bindHelpEntry() {
  const link = document.querySelector('#page-help a[href^="mailto:suporte@voltconsumo.com.br"][href*="Feedback"]');
  if (!link || link.dataset.feedbackBound === "true") return;
  link.dataset.feedbackBound = "true";
  const title = link.querySelector("strong");
  const subtitle = link.querySelector("small");
  const iconUse = link.querySelector("use");
  if (title) title.textContent = "Relatar um problema";
  if (subtitle) subtitle.textContent = "Sugestões, erros e problemas técnicos";
  if (iconUse) iconUse.setAttribute("href", "#icon-alert");
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openFeedback("help");
  });
}

function bindFeedbackEvents() {
  document.getElementById("feedback-form")?.addEventListener("submit", handleSubmit);
  document.querySelectorAll("[data-feedback-close]").forEach((button) => {
    button.addEventListener("click", () => closeFeedback());
  });
  document.getElementById("feedback-open-settings")?.addEventListener("click", () => openFeedback("settings"));
  document.getElementById("feedback-shake-toggle")?.addEventListener("change", handleShakeToggle);
  document.getElementById("feedback-dialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeFeedback();
  });
  window.addEventListener("volt:open-feedback", (event) => openFeedback(event.detail?.source || "screen"));
}

function openFeedback(source = "screen") {
  if (!dashboardIsVisible()) return;
  currentSource = ["shake", "help", "settings", "screen"].includes(source) ? source : "screen";
  const dialog = document.getElementById("feedback-dialog");
  if (!dialog || dialog.open) return;
  setMessage("");
  dialog.showModal();
  window.setTimeout(() => document.getElementById("feedback-description")?.focus(), 50);
}

function closeFeedback() {
  const dialog = document.getElementById("feedback-dialog");
  if (dialog?.open) dialog.close();
}

function dashboardIsVisible() {
  const dashboard = document.getElementById("dashboard");
  return Boolean(dashboard && !dashboard.hidden && document.visibilityState !== "hidden");
}

async function getFeedbackClient() {
  if (feedbackClientPromise) return feedbackClientPromise;
  feedbackClientPromise = (async () => {
    await loadSupabaseRuntime();
    if (!window.supabase?.createClient) throw new Error("O serviço de feedback não pôde ser iniciado.");
    return window.supabase.createClient(VOLT_CONFIG.url, VOLT_CONFIG.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  })().catch((error) => {
    feedbackClientPromise = null;
    throw error;
  });
  return feedbackClientPromise;
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.getElementById("feedback-submit");
  const description = document.getElementById("feedback-description")?.value.trim() || "";
  const category = document.getElementById("feedback-category")?.value || "bug";
  const includeContext = Boolean(document.getElementById("feedback-tech-context")?.checked);
  const screenshot = document.getElementById("feedback-screenshot")?.files?.[0] || null;

  if (description.length < 3) {
    setMessage("Descreva o problema com pelo menos 3 caracteres.", true);
    return;
  }
  if (screenshot && screenshot.size > MAX_INPUT_BYTES) {
    setMessage("A imagem é muito grande. Escolha uma captura com até 12 MB.", true);
    return;
  }

  submit.disabled = true;
  form.setAttribute("aria-busy", "true");
  setMessage("Enviando relato…");

  try {
    const client = await getFeedbackClient();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData?.session?.user;
    if (!user?.id) throw new Error("Sua sessão expirou. Entre novamente para enviar o relato.");

    const payload = {
      user_id: user.id,
      category,
      description,
      source: currentSource,
      page: currentPage(),
      app_build: String(BUILD),
      technical_context: includeContext ? collectTechnicalContext() : {}
    };

    const { data: report, error: reportError } = await client
      .from("feedback_reports")
      .insert(payload)
      .select("id,status,created_at")
      .single();
    if (reportError) throw reportError;

    let attachmentWarning = "";
    if (screenshot) {
      try {
        const blob = await prepareScreenshot(screenshot);
        const path = `${user.id}/${report.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await client.storage
          .from(FEEDBACK_BUCKET)
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;

        const { error: updateError } = await client
          .from("feedback_reports")
          .update({ screenshot_path: path, updated_at: new Date().toISOString() })
          .eq("id", report.id)
          .eq("user_id", user.id);
        if (updateError) throw updateError;
      } catch (error) {
        console.warn("VOLT feedback attachment failed", error instanceof Error ? error.message : "unknown_error");
        attachmentWarning = " O relato foi recebido, mas a captura não pôde ser anexada.";
      }
    }

    const protocol = formatProtocol(report.id);
    form.reset();
    document.getElementById("feedback-tech-context").checked = true;
    setMessage(`Relato recebido. Protocolo ${protocol}.${attachmentWarning}`);
  } catch (error) {
    console.warn("VOLT feedback submission failed", error instanceof Error ? error.message : "unknown_error");
    setMessage(error instanceof Error ? error.message : "Não foi possível enviar o relato. Tente novamente.", true);
  } finally {
    submit.disabled = false;
    form.setAttribute("aria-busy", "false");
  }
}

function currentPage() {
  const page = document.querySelector("#page-container .page:not([hidden])");
  if (page?.dataset?.page) return page.dataset.page;
  return document.querySelector(".nav-button[aria-current='page']")?.dataset?.nav || "home";
}

function collectTechnicalContext() {
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  return {
    captured_at: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    user_agent: navigator.userAgent || null,
    platform: navigator.platform || null,
    language: navigator.language || null,
    online: navigator.onLine,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    display_mode: standalone ? "standalone" : "browser",
    theme: document.documentElement.dataset.theme || "system",
    accent: document.documentElement.dataset.accent || "emerald",
    route: `${location.pathname}${location.hash}`,
    service_worker: Boolean(navigator.serviceWorker?.controller)
  };
}

async function prepareScreenshot(file) {
  if (!file.type.startsWith("image/")) throw new Error("O anexo precisa ser uma imagem.");
  const image = await loadImage(file);
  const ratio = Math.min(1, MAX_UPLOAD_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Não foi possível preparar a captura de tela.");
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Não foi possível preparar a captura de tela."));
      resolve(blob);
    }, "image/jpeg", JPEG_QUALITY);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem selecionada."));
    };
    image.src = url;
  });
}

function formatProtocol(id) {
  return `VLT-${String(id || "").replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function setMessage(message, error = false) {
  const node = document.getElementById("feedback-message");
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = error ? "danger" : "success";
}

function restoreShakePreference() {
  const toggle = document.getElementById("feedback-shake-toggle");
  const supported = "DeviceMotionEvent" in window;
  if (!toggle) return;

  if (!supported) {
    toggle.checked = false;
    toggle.disabled = true;
    setMotionStatus("O sensor de movimento não está disponível neste navegador.", true);
    return;
  }

  const enabled = localStorage.getItem(SHAKE_STORAGE_KEY) === "1";
  toggle.checked = enabled;
  if (enabled) {
    attachMotionListener();
    setMotionStatus("Ativado neste dispositivo.");
  } else {
    setMotionStatus("Desativado. O relato manual continua disponível.");
  }
}

async function handleShakeToggle(event) {
  const toggle = event.currentTarget;
  if (!toggle.checked) {
    localStorage.setItem(SHAKE_STORAGE_KEY, "0");
    detachMotionListener();
    shakeDetector.reset();
    setMotionStatus("Desativado. O relato manual continua disponível.");
    return;
  }

  try {
    const MotionEvent = window.DeviceMotionEvent;
    if (!MotionEvent) throw new Error("O sensor de movimento não está disponível neste navegador.");

    if (typeof MotionEvent.requestPermission === "function") {
      motionPermission = await MotionEvent.requestPermission();
      if (motionPermission !== "granted") throw new Error("Permissão de movimento não concedida.");
    } else {
      motionPermission = "granted";
    }

    localStorage.setItem(SHAKE_STORAGE_KEY, "1");
    attachMotionListener();
    setMotionStatus("Ativado. Agite o telefone com o VOLT aberto para reportar.");
  } catch (error) {
    toggle.checked = false;
    localStorage.setItem(SHAKE_STORAGE_KEY, "0");
    detachMotionListener();
    setMotionStatus(error instanceof Error ? error.message : "Não foi possível ativar o sensor.", true);
  }
}

function attachMotionListener() {
  if (motionListening) return;
  window.addEventListener("devicemotion", handleMotion, { passive: true });
  motionListening = true;
}

function detachMotionListener() {
  if (!motionListening) return;
  window.removeEventListener("devicemotion", handleMotion);
  motionListening = false;
}

function handleMotion(event) {
  if (!dashboardIsVisible()) return;
  if (document.getElementById("feedback-dialog")?.open) return;
  if (document.querySelector("dialog[open]")) return;

  const acceleration = event.acceleration || event.accelerationIncludingGravity;
  if (!acceleration) return;
  const triggered = shakeDetector.sample({
    x: acceleration.x,
    y: acceleration.y,
    z: acceleration.z,
    at: performance.now()
  });
  if (!triggered) return;

  navigator.vibrate?.(24);
  openFeedback("shake");
}

function setMotionStatus(message, error = false) {
  const node = document.getElementById("feedback-motion-status");
  if (!node) return;
  node.textContent = message;
  node.dataset.tone = error ? "danger" : "neutral";
}
