const INSTALL_BUILD = "20260816.4";
const INSTALLED_KEY = "volt-pwa-installed";
const DISMISS_KEY_PREFIX = "volt-pwa-install-dismissed:";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_OPEN_DELAY_MS = 650;
const MAX_DIALOG_RETRIES = 8;

let deferredInstallPrompt = null;
let applicationReady = document.documentElement.dataset.startupStatus === "READY";
let autoOpenTimer = null;
let autoOpenRetries = 0;
let iosInstallStage = "intro";

loadInstallStyles();
mountInstallUi();
syncInstalledState();
refreshInstallUi();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  refreshInstallUi();
  scheduleAutomaticOffer();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  safeSet(INSTALLED_KEY, "1");
  clearDismissal();
  closeInstallDialog(false);
  refreshInstallUi();
});

window.addEventListener("volt:startup-status", (event) => {
  applicationReady = event.detail?.status === "READY";
  if (applicationReady) {
    autoOpenRetries = 0;
    refreshInstallUi();
    scheduleAutomaticOffer();
    return;
  }
  if (event.detail?.status === "SIGNED_OUT") closeInstallDialog(false);
});

const displayModeQuery = window.matchMedia?.("(display-mode: standalone)");
if (displayModeQuery?.addEventListener) {
  displayModeQuery.addEventListener("change", () => {
    syncInstalledState();
    refreshInstallUi();
  });
}

function loadInstallStyles() {
  if (document.querySelector("link[data-volt-pwa-install]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/pwa-install.css?v=${INSTALL_BUILD}`;
  link.dataset.voltPwaInstall = "";
  document.head.append(link);
}

function mountInstallUi() {
  if (!document.getElementById("pwa-install-dialog")) {
    const dialog = document.createElement("dialog");
    dialog.id = "pwa-install-dialog";
    dialog.setAttribute("aria-labelledby", "pwa-install-title");
    dialog.innerHTML = `
      <section class="dialog-card glass-modal glass-shine pwa-install-card">
        <div class="pwa-install-heading">
          <div>
            <p class="eyebrow">VOLT NO SEU DISPOSITIVO</p>
            <h2 id="pwa-install-title">Instale o VOLT</h2>
          </div>
          <button id="pwa-install-close" class="icon-button" type="button" aria-label="Fechar instalação">
            <svg class="icon" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
          </button>
        </div>

        <div class="pwa-install-hero" aria-hidden="true">
          <div class="pwa-install-home-preview">
            <span class="pwa-install-app-icon"><svg><use href="#icon-bolt"></use></svg></span>
            <strong>VOLT</strong>
            <small>na sua tela inicial</small>
          </div>
        </div>

        <div class="pwa-install-copy">
          <h3 id="pwa-install-subtitle">Acesse como um aplicativo.</h3>
          <p id="pwa-install-description" class="supporting-copy">Tenha o VOLT na sua tela inicial e abra seu consumo sem precisar procurar pelo navegador.</p>
        </div>

        <ol id="pwa-install-ios-steps" class="pwa-install-steps" hidden>
          <li><span>1</span><div><strong>Compartilhe no Safari</strong><small>Toque em Compartilhar no menu do Safari.</small></div></li>
          <li><span>2</span><div><strong>Adicione à Tela de Início</strong><small>Escolha “Adicionar à Tela de Início”.</small></div></li>
          <li><span>3</span><div><strong>Abra como aplicativo</strong><small>Ative “Abrir como App da Web” e toque em Adicionar.</small></div></li>
        </ol>

        <p id="pwa-install-note" class="pwa-install-note supporting-copy" role="status" aria-live="polite"></p>

        <div class="pwa-install-actions">
          <button id="pwa-install-primary" class="primary-button" type="button">Instalar VOLT</button>
          <button id="pwa-install-later" class="secondary-button" type="button">Agora não</button>
        </div>
      </section>
    `;
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dismissInstallPromotion();
    });
    document.getElementById("pwa-install-close")?.addEventListener("click", dismissInstallPromotion);
    document.getElementById("pwa-install-later")?.addEventListener("click", dismissInstallPromotion);
    document.getElementById("pwa-install-primary")?.addEventListener("click", handlePrimaryInstallAction);
  }

  if (!document.getElementById("pwa-settings-card")) {
    const settingsLayout = document.querySelector("#page-settings .settings-layout");
    if (!settingsLayout) return;
    const section = document.createElement("section");
    section.id = "pwa-settings-card";
    section.className = "settings-group card glass-level-2 pwa-settings-card";
    section.innerHTML = `
      <div class="pwa-settings-heading">
        <div><p class="eyebrow">APLICATIVO</p><h2>VOLT no dispositivo</h2></div>
        <span id="pwa-settings-status" class="status-pill">Verificando</span>
      </div>
      <p id="pwa-settings-description" class="supporting-copy">Instale o VOLT para abrir direto da tela inicial.</p>
      <button id="pwa-settings-action" class="secondary-button" type="button">Instalar VOLT</button>
    `;
    settingsLayout.append(section);
    document.getElementById("pwa-settings-action")?.addEventListener("click", () => openInstallDialog(true));
  }
}

function scheduleAutomaticOffer() {
  if (!applicationReady || !shouldAutomaticallyOffer()) return;
  if (autoOpenTimer) window.clearTimeout(autoOpenTimer);
  autoOpenTimer = window.setTimeout(() => {
    autoOpenTimer = null;
    openInstallDialog(false);
  }, AUTO_OPEN_DELAY_MS);
}

function shouldAutomaticallyOffer() {
  if (isInstalled()) return false;
  const userId = currentUserId();
  if (!userId || isDismissedRecently(userId)) return false;
  if (isIOS()) return true;
  return Boolean(deferredInstallPrompt);
}

function openInstallDialog(manual = false) {
  mountInstallUi();
  refreshInstallUi();

  if (isInstalled()) return;
  if (!manual && !shouldAutomaticallyOffer()) return;

  const dialog = document.getElementById("pwa-install-dialog");
  if (!dialog || dialog.open) return;

  const anotherDialog = [...document.querySelectorAll("dialog[open]")].find((candidate) => candidate !== dialog);
  if (anotherDialog && !manual && autoOpenRetries < MAX_DIALOG_RETRIES) {
    autoOpenRetries += 1;
    autoOpenTimer = window.setTimeout(() => openInstallDialog(false), 750);
    return;
  }

  iosInstallStage = "intro";
  configureInstallDialog();
  autoOpenRetries = 0;
  dialog.showModal();
}

function configureInstallDialog() {
  const title = document.getElementById("pwa-install-title");
  const subtitle = document.getElementById("pwa-install-subtitle");
  const description = document.getElementById("pwa-install-description");
  const steps = document.getElementById("pwa-install-ios-steps");
  const note = document.getElementById("pwa-install-note");
  const primary = document.getElementById("pwa-install-primary");

  primary.disabled = false;
  note.textContent = "";

  if (deferredInstallPrompt) {
    title.textContent = "Instale o VOLT";
    subtitle.textContent = "Acesse como um aplicativo.";
    description.textContent = "Tenha o VOLT na sua tela inicial e abra seu consumo sem precisar procurar pelo navegador.";
    steps.hidden = true;
    primary.textContent = "Instalar VOLT";
    return;
  }

  if (isIOS() && isSafari()) {
    if (iosInstallStage === "intro") {
      title.textContent = "Tenha o VOLT no seu iPhone";
      subtitle.textContent = "Use o VOLT como um aplicativo.";
      description.textContent = "Ele fica na sua Tela de Início e abre em tela própria, sem você precisar procurar pelo site no Safari.";
      steps.hidden = true;
      primary.textContent = "Entendi";
      return;
    }

    title.textContent = "Instalar VOLT";
    subtitle.textContent = "Agora adicione à Tela de Início.";
    description.textContent = "O iPhone conclui a instalação pelo menu do Safari. Toque em “Instalar VOLT” para abrir a etapa de compartilhamento e procure “Adicionar à Tela de Início”.";
    steps.hidden = false;
    note.textContent = "Se “Adicionar à Tela de Início” não aparecer na folha que abrir, use o botão Compartilhar do próprio Safari.";
    primary.textContent = "Instalar VOLT";
    return;
  }

  if (isIOS()) {
    if (iosInstallStage === "intro") {
      title.textContent = "Instale o VOLT no seu iPhone";
      subtitle.textContent = "A instalação é concluída pelo Safari.";
      description.textContent = "Primeiro abra esta página no Safari. Depois o VOLT pode ser adicionado à Tela de Início como aplicativo.";
      steps.hidden = true;
      primary.textContent = "Entendi";
      return;
    }

    title.textContent = "Abra o VOLT no Safari";
    subtitle.textContent = "Falta apenas concluir pelo Safari.";
    description.textContent = "Abra esta mesma página no Safari e escolha “Adicionar à Tela de Início”.";
    steps.hidden = false;
    note.textContent = "No iPhone, navegadores como Chrome e Edge não conseguem abrir diretamente essa etapa do Safari.";
    primary.textContent = "Fechar";
    return;
  }

  title.textContent = "Instale o VOLT";
  subtitle.textContent = "A instalação ainda não foi liberada pelo navegador.";
  description.textContent = "Quando o navegador reconhecer o VOLT como instalável, a opção de instalação ficará disponível aqui.";
  steps.hidden = true;
  primary.textContent = "Fechar";
}

async function handlePrimaryInstallAction() {
  const primary = document.getElementById("pwa-install-primary");
  const note = document.getElementById("pwa-install-note");

  if (!deferredInstallPrompt && isIOS()) {
    if (iosInstallStage === "intro") {
      iosInstallStage = "install";
      configureInstallDialog();
      primary.focus();
      return;
    }

    if (isSafari()) {
      await openIOSInstallShare(primary, note);
      return;
    }

    closeInstallDialog(false);
    return;
  }

  if (!deferredInstallPrompt) {
    markDismissed();
    closeInstallDialog(false);
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  primary.disabled = true;
  primary.textContent = "Abrindo instalação…";
  note.textContent = "";

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === "accepted") {
      safeSet(INSTALLED_KEY, "1");
      clearDismissal();
      closeInstallDialog(false);
    } else {
      markDismissed();
      closeInstallDialog(false);
    }
  } catch {
    note.textContent = "O navegador não conseguiu abrir a instalação agora. Tente novamente pelo menu de Configurações do VOLT.";
    primary.disabled = false;
    primary.textContent = "Fechar";
  } finally {
    refreshInstallUi();
  }
}

async function openIOSInstallShare(primary, note) {
  note.textContent = "No menu que abrir, procure “Adicionar à Tela de Início”. Se a opção não aparecer, feche-o e use o botão Compartilhar do Safari.";

  if (typeof window.navigator.share !== "function") {
    primary.textContent = "Use Compartilhar no Safari";
    return;
  }

  try {
    const result = window.navigator.share({ title: "VOLT", url: window.location.href });
    if (result && typeof result.then === "function") await result;
  } catch (error) {
    if (error?.name !== "AbortError") {
      note.textContent = "O iPhone não abriu o compartilhamento. Use o botão Compartilhar do Safari e toque em “Adicionar à Tela de Início”.";
    }
  }
}

function dismissInstallPromotion() {
  markDismissed();
  closeInstallDialog(false);
}

function closeInstallDialog(markAsDismissed = false) {
  if (markAsDismissed) markDismissed();
  const dialog = document.getElementById("pwa-install-dialog");
  if (dialog?.open) dialog.close();
}

function refreshInstallUi() {
  mountInstallUi();
  const status = document.getElementById("pwa-settings-status");
  const description = document.getElementById("pwa-settings-description");
  const action = document.getElementById("pwa-settings-action");
  if (!status || !description || !action) return;

  status.removeAttribute("data-tone");
  action.disabled = false;

  if (isInstalled()) {
    status.textContent = "Instalado";
    status.dataset.tone = "success";
    description.textContent = "O VOLT já pode ser aberto como aplicativo neste dispositivo.";
    action.textContent = "VOLT instalado";
    action.disabled = true;
    return;
  }

  if (deferredInstallPrompt) {
    status.textContent = "Disponível";
    status.dataset.tone = "success";
    description.textContent = "Instale o VOLT para abrir direto da tela inicial, sem depender do navegador.";
    action.textContent = "Instalar VOLT";
    return;
  }

  if (isIOS() && isSafari()) {
    status.textContent = "Disponível no Safari";
    description.textContent = "No iPhone, use o Safari para adicionar o VOLT à Tela de Início.";
    action.textContent = "Instalar VOLT";
    return;
  }

  if (isIOS()) {
    status.textContent = "Requer Safari";
    description.textContent = "Abra o VOLT no Safari para instalar na Tela de Início.";
    action.textContent = "Ver instruções";
    return;
  }

  status.textContent = "Aguardando navegador";
  description.textContent = "A opção aparece assim que o navegador reconhecer o VOLT como instalável.";
  action.textContent = "Ver instalação";
}

function syncInstalledState() {
  if (isStandalone()) safeSet(INSTALLED_KEY, "1");
}

function isInstalled() {
  return isStandalone() || safeGet(INSTALLED_KEY) === "1";
}

function isStandalone() {
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
}

function isIOS() {
  const ua = window.navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
}

function isSafari() {
  const ua = window.navigator.userAgent || "";
  return /Safari/.test(ua) && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/.test(ua);
}

function currentUserId() {
  try {
    return globalThis.__VOLT_CANONICAL_SYNC_BRIDGE__?.getState?.().authenticatedUserId || null;
  } catch {
    return null;
  }
}

function dismissalKey(userId) {
  return `${DISMISS_KEY_PREFIX}${userId}`;
}

function isDismissedRecently(userId) {
  const dismissedAt = Number(safeGet(dismissalKey(userId)) || 0);
  return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

function markDismissed() {
  const userId = currentUserId();
  if (userId) safeSet(dismissalKey(userId), String(Date.now()));
}

function clearDismissal() {
  const userId = currentUserId();
  if (userId) safeRemove(dismissalKey(userId));
}

function safeGet(key) {
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}

function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); }
  catch { /* Storage can be unavailable in restricted browsing contexts. */ }
}

function safeRemove(key) {
  try { window.localStorage.removeItem(key); }
  catch { /* Storage can be unavailable in restricted browsing contexts. */ }
}
