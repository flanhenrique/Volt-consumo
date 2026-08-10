import {
  PASSWORD_POLICY,
  buildSignupRequestBody,
  describeSignupOutcome,
  validateSignupInput
} from "./packages/auth-client/browser/index.js";

const CONFIG = window.VOLT_SUPABASE_BETA || {};
const PROFILE_KEY = "volt-beta-pending-profile-v1";
const LOCALITY_KEY = "volt:beta:locality-context-v1";
const CYCLE_KEY = "volt-beta-v2-cycle";
const PRIVACY_NOTICE_VERSION = "1.0";
const STATES = [["AC","Acre"],["AL","Alagoas"],["AP","Amapá"],["AM","Amazonas"],["BA","Bahia"],["CE","Ceará"],["DF","Distrito Federal"],["ES","Espírito Santo"],["GO","Goiás"],["MA","Maranhão"],["MT","Mato Grosso"],["MS","Mato Grosso do Sul"],["MG","Minas Gerais"],["PA","Pará"],["PB","Paraíba"],["PR","Paraná"],["PE","Pernambuco"],["PI","Piauí"],["RJ","Rio de Janeiro"],["RN","Rio Grande do Norte"],["RS","Rio Grande do Sul"],["RO","Rondônia"],["RR","Roraima"],["SC","Santa Catarina"],["SP","São Paulo"],["SE","Sergipe"],["TO","Tocantins"]];

let client = null;
let tourIndex = 0;
let tourSlides = [];

initialize();

function initialize() {
  attachStylesheet();
  buildSignupDialog();
  buildTourDialog();
  interceptLegacySignup();
  exposeOnboarding();
  bindAccountPersistence();
  bindRegionalHelpOverrides();
  initializeProfileSync();
}

function attachStylesheet() {
  if (document.querySelector('link[href*="guided-experience.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./guided-experience.css";
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

function buildSignupDialog() {
  if (document.querySelector("#guided-signup-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "guided-signup-dialog";
  dialog.className = "guided-signup-dialog";
  dialog.innerHTML = `
    <div class="guided-dialog-card guided-signup-card">
      <div class="guided-dialog-head guided-signup-head">
        <div><p class="eyebrow">CRIAR CONTA</p><h2>Configure seu acesso</h2><small>Preencha os dados essenciais para personalizar o Volt.</small></div>
        <button class="icon-button guided-close" type="button" aria-label="Fechar">×</button>
      </div>
      <form id="guided-signup-form" class="guided-form guided-card-form">
        <section class="guided-field-card guided-card-account" aria-labelledby="guided-account-title">
          <strong id="guided-account-title" class="guided-card-title">Conta</strong>
          <label><span>Nome</span><input id="guided-name" type="text" maxlength="80" autocomplete="name" required></label>
          <div class="guided-card-row">
            <label><span>E-mail</span><input id="guided-email" type="email" autocomplete="email" required></label>
            <label><span>Senha</span><input id="guided-password" type="password" minlength="${PASSWORD_POLICY.minLength}" maxlength="${PASSWORD_POLICY.maxLength}" autocomplete="new-password" required></label>
          </div>
        </section>

        <section class="guided-field-card guided-card-region" aria-labelledby="guided-region-title">
          <strong id="guided-region-title" class="guided-card-title">Região</strong>
          <div class="guided-card-row guided-card-row-region">
            <label><span>Estado</span><select id="guided-state" autocomplete="address-level1" required><option value="">UF</option>${STATES.map(([uf,name]) => `<option value="${uf}">${uf} — ${name}</option>`).join("")}</select></label>
            <label><span>Cidade</span><input id="guided-city" type="text" maxlength="80" autocomplete="address-level2" required></label>
          </div>
        </section>

        <section class="guided-field-card guided-provider-card energy" aria-labelledby="guided-energy-title">
          <span class="guided-card-icon" aria-hidden="true">ϟ</span>
          <label><strong id="guided-energy-title">Energia</strong><span>Concessionária</span><input id="guided-energy-provider" type="text" maxlength="120" placeholder="Conforme a fatura" required></label>
        </section>

        <section class="guided-field-card guided-provider-card water" aria-labelledby="guided-water-title">
          <span class="guided-card-icon" aria-hidden="true">●</span>
          <label><strong id="guided-water-title">Água</strong><span>Concessionária</span><input id="guided-water-provider" type="text" maxlength="120" placeholder="Conforme a fatura" required></label>
        </section>

        <div class="guided-privacy guided-privacy-compact">
          <label><input id="guided-privacy" type="checkbox" required><span>Li o <a href="./privacy.html" target="_blank" rel="noopener">Aviso de Privacidade</a> e entendi o uso dos dados para conta, sincronização e contexto regional.</span></label>
        </div>
        <p id="guided-signup-status" class="note guided-status" role="status" aria-live="polite"></p>
        <div class="guided-actions guided-actions-compact"><button class="secondary-button" type="button" data-guided-cancel>Cancelar</button><button id="guided-create-account" class="primary-button" type="submit">Criar minha conta</button></div>
      </form>
    </div>`;
  document.body.append(dialog);
  dialog.querySelector(".guided-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-guided-cancel]").addEventListener("click", () => dialog.close());
  dialog.querySelector("#guided-signup-form").addEventListener("submit", submitSignup);
}

function interceptLegacySignup() {
  const button = document.querySelector("#signup-button");
  if (!button) return;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const dialog = document.querySelector("#guided-signup-dialog");
    dialog.querySelector("#guided-email").value = document.querySelector("#login-email")?.value || "";
    dialog.querySelector("#guided-password").value = document.querySelector("#login-password")?.value || "";
    dialog.querySelector("#guided-privacy").checked = Boolean(document.querySelector("#privacy-ack")?.checked);
    dialog.querySelector("#guided-signup-status").textContent = "";
    dialog.showModal();
    dialog.querySelector("#guided-name").focus();
  }, true);
}

async function submitSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector("#guided-signup-status");
  const button = form.querySelector("#guided-create-account");
  const input = {
    email: form.querySelector("#guided-email").value.trim(),
    password: form.querySelector("#guided-password").value,
    privacyAccepted: form.querySelector("#guided-privacy").checked
  };
  const validation = validateSignupInput(input);
  if (!validation.ok) {
    status.textContent = validation.message;
    return;
  }
  const profile = {
    name: form.querySelector("#guided-name").value.trim(),
    state: form.querySelector("#guided-state").value,
    city: form.querySelector("#guided-city").value.trim(),
    energyProvider: form.querySelector("#guided-energy-provider").value.trim(),
    waterProvider: form.querySelector("#guided-water-provider").value.trim(),
    email: input.email.toLowerCase(),
    privacyAcceptedAt: new Date().toISOString()
  };
  if (!profile.name || !profile.state || !profile.city || !profile.energyProvider || !profile.waterProvider) {
    status.textContent = "Preencha nome, estado, cidade e as concessionárias para concluir o cadastro.";
    return;
  }
  if (!CONFIG.url) {
    status.textContent = "Cadastro indisponível no momento.";
    return;
  }
  button.disabled = true;
  button.textContent = "Criando conta…";
  status.textContent = "";
  let outcome;
  try {
    const response = await fetch(`${CONFIG.url}/functions/v1/auth-login/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildSignupRequestBody(input, PRIVACY_NOTICE_VERSION))
    });
    let payload = {};
    try { payload = await response.json(); } catch { payload = {}; }
    outcome = describeSignupOutcome({ status: response.status, code: payload.code, requestId: payload.request_id });
  } catch {
    outcome = describeSignupOutcome({ status: 0 });
  }
  button.disabled = false;
  button.textContent = "Criar minha conta";
  if (!outcome.ok) {
    status.textContent = outcome.message;
    return;
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  localStorage.setItem(LOCALITY_KEY, JSON.stringify({
    state: profile.state,
    city: profile.city,
    energyProvider: profile.energyProvider,
    waterProvider: profile.waterProvider,
    updatedAt: new Date().toISOString()
  }));
  const loginEmail = document.querySelector("#login-email");
  if (loginEmail) loginEmail.value = input.email.toLowerCase();
  const loginPassword = document.querySelector("#login-password");
  if (loginPassword) loginPassword.value = "";
  const legacyPrivacy = document.querySelector("#privacy-ack");
  if (legacyPrivacy) legacyPrivacy.checked = true;
  document.querySelector("#login-message").textContent = outcome.message;
  form.reset();
  document.querySelector("#guided-signup-dialog").close();
}

function initializeProfileSync() {
  const supabase = getClient();
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) queueMicrotask(() => applyAccountProfile(session.user));
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data?.session?.user) applyAccountProfile(data.session.user);
  }).catch(() => undefined);
}

async function applyAccountProfile(user) {
  const supabase = getClient();
  if (!supabase || !user) return;
  let metadata = user.user_metadata || {};
  const pending = readJson(PROFILE_KEY, null);
  if (pending && pending.email === String(user.email || "").toLowerCase()) {
    const locality = {
      state: pending.state,
      city: pending.city,
      energyProvider: pending.energyProvider,
      waterProvider: pending.waterProvider,
      updatedAt: new Date().toISOString()
    };
    const { data, error } = await supabase.auth.updateUser({
      data: {
        ...metadata,
        name: pending.name,
        display_name: pending.name,
        locality,
        profile_completed_at: new Date().toISOString(),
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        privacy_notice_accepted_at: pending.privacyAcceptedAt
      }
    });
    if (!error) {
      metadata = data.user?.user_metadata || metadata;
      localStorage.removeItem(PROFILE_KEY);
    }
  }
  syncMetadataToDevice(metadata);
}

function syncMetadataToDevice(metadata) {
  if (metadata.locality && typeof metadata.locality === "object") {
    localStorage.setItem(LOCALITY_KEY, JSON.stringify(metadata.locality));
    syncLocalityForm(metadata.locality);
  }
  if (metadata.cycle && typeof metadata.cycle === "object") {
    const cycle = { start: clampDay(metadata.cycle.start), end: clampDay(metadata.cycle.end) };
    localStorage.setItem(CYCLE_KEY, JSON.stringify(cycle));
    const start = document.querySelector("#beta-cycle-start");
    const end = document.querySelector("#beta-cycle-end");
    if (start) start.value = cycle.start;
    if (end) end.value = cycle.end;
    window.dispatchEvent(new CustomEvent("volt:beta-data"));
  }
}

function syncLocalityForm(locality) {
  const form = document.querySelector("#beta-locality-form");
  if (!form) return;
  const state = form.querySelector("#beta-locality-state");
  const city = form.querySelector("#beta-locality-city");
  const energy = form.querySelector("#beta-locality-energy-provider");
  const water = form.querySelector("#beta-locality-water-provider");
  if (state) state.value = locality.state || "";
  if (city) city.value = locality.city || "";
  if (energy) energy.value = locality.energyProvider || "";
  if (water) water.value = locality.waterProvider || "";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function bindAccountPersistence() {
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id === "beta-cycle-form") {
      const start = clampDay(form.querySelector("#beta-cycle-start")?.value);
      const end = clampDay(form.querySelector("#beta-cycle-end")?.value);
      await persistMetadata({ cycle: { start, end, updated_at: new Date().toISOString() } });
    }
    if (form.id === "beta-locality-form") {
      const locality = {
        state: form.querySelector("#beta-locality-state")?.value || "",
        city: form.querySelector("#beta-locality-city")?.value.trim() || "",
        energyProvider: form.querySelector("#beta-locality-energy-provider")?.value.trim() || "",
        waterProvider: form.querySelector("#beta-locality-water-provider")?.value.trim() || "",
        updatedAt: new Date().toISOString()
      };
      await persistMetadata({ locality });
    }
  }, true);
}

async function persistMetadata(partial) {
  const supabase = getClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return;
  await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), ...partial } });
}

function buildTourDialog() {
  if (document.querySelector("#guided-tour-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "guided-tour-dialog";
  dialog.className = "guided-tour-dialog";
  dialog.innerHTML = `<div class="guided-dialog-card"><div class="guided-dialog-head"><div><p class="eyebrow">GUIA DE BOAS-VINDAS</p><h2 id="guided-tour-title">Volt</h2></div><button class="icon-button guided-tour-close" type="button" aria-label="Fechar">×</button></div><div id="guided-tour-body"></div><div class="guided-tour-footer"><div id="guided-tour-progress" class="guided-tour-progress" aria-label="Progresso do tutorial"></div><div class="guided-actions"><button id="guided-tour-back" class="secondary-button" type="button">Voltar</button><button id="guided-tour-next" class="primary-button" type="button">Próximo</button></div></div></div>`;
  document.body.append(dialog);
  dialog.querySelector(".guided-tour-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("#guided-tour-back").addEventListener("click", () => { if (tourIndex > 0) { tourIndex -= 1; renderTour(); } });
  dialog.querySelector("#guided-tour-next").addEventListener("click", () => {
    if (tourIndex >= tourSlides.length - 1) { dialog.close(); markOnboardingComplete(); return; }
    tourIndex += 1; renderTour();
  });
}

function exposeOnboarding() {
  window.showOnboarding = () => openTour("welcome");
  window.resetOnboardingStatus = () => localStorage.removeItem("volt-beta-onboarding-complete");
}

function openTour(kind = "welcome") {
  tourSlides = createTourSlides(kind);
  tourIndex = 0;
  renderTour();
  document.querySelector("#guided-tour-dialog").showModal();
}

function renderTour() {
  const slide = tourSlides[tourIndex];
  if (!slide) return;
  document.querySelector("#guided-tour-title").textContent = slide.title;
  document.querySelector("#guided-tour-body").innerHTML = slide.html;
  const progress = document.querySelector("#guided-tour-progress");
  progress.innerHTML = tourSlides.map((_, index) => `<span class="${index === tourIndex ? "active" : ""}"></span>`).join("");
  document.querySelector("#guided-tour-back").hidden = tourIndex === 0;
  document.querySelector("#guided-tour-next").textContent = tourIndex === tourSlides.length - 1 ? "Concluir" : "Próximo";
}

function createTourSlides(kind) {
  const locality = readJson(LOCALITY_KEY, {});
  const context = `${locality.city || "sua cidade"}${locality.state ? ` · ${locality.state}` : ""}`;
  const provider = [locality.energyProvider, locality.waterProvider].filter(Boolean).join(" / ");
  const badge = `<span class="guided-context-badge">${escapeHtml(context)}${provider ? ` · ${escapeHtml(provider)}` : ""}</span>`;
  const all = [
    { title: "Bem-vindo ao Volt", html: `<div class="guided-tour-media">${welcomeSvg()}</div><div class="guided-tour-copy"><h3>Energia e água no mesmo lugar</h3><p>Registre leituras, acompanhe estimativas e veja a evolução do ciclo atual.</p></div>` },
    { title: "Sua região importa", html: `${badge}<div class="guided-tour-media">${regionSvg()}</div><div class="guided-tour-copy"><p>Tarifas, concessionárias, faturas e equipamentos variam por localidade. O Volt usa o contexto salvo na sua conta e não inventa regras quando não há fonte validada.</p></div>` },
    { title: "Ciclo de Contagem", html: `<div class="guided-tour-media">${billSvg()}</div><div class="guided-tour-copy"><p>Use as datas de leitura anterior e atual da fatura para definir o período acompanhado pelo Volt. O ciclo não precisa coincidir com o mês civil.</p></div>` },
    { title: "Leia o medidor correto", html: `${badge}<div class="guided-tour-media">${meterSvg()}</div><div class="guided-tour-copy"><p>Medidores digitais podem alternar entre consumo, códigos técnicos e outros registros. Use a leitura de consumo indicada para faturamento pela sua concessionária; não copie automaticamente qualquer número exibido.</p></div>` },
    { title: "Acompanhe e revise", html: `<div class="guided-tour-media">${reportSvg()}</div><div class="guided-tour-copy"><p>Leituras alimentam a Home e os Relatórios. Antes de salvar uma leitura reconhecida por foto, confira o número no visor.</p></div>` }
  ];
  if (kind === "meter") return [all[3]];
  if (kind === "cycle") return [all[2]];
  return all;
}

function bindRegionalHelpOverrides() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("#beta-meter-tutorial,#beta-bill-cycle-tutorial");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openTour(target.id === "beta-meter-tutorial" ? "meter" : "cycle");
  }, true);
}

function markOnboardingComplete() { localStorage.setItem("volt-beta-onboarding-complete", "true"); }
function clampDay(value) { return Math.max(1, Math.min(31, Number(value) || 1)); }
function readJson(key, fallback) { try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[char]); }

function welcomeSvg(){return `<svg viewBox="0 0 760 260" role="img" aria-label="Ilustração de energia e água"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#31d797"/><stop offset="1" stop-color="#48a7ff"/></linearGradient></defs><rect width="760" height="260" rx="28" fill="#07151f"/><circle cx="270" cy="130" r="78" fill="#102a31"/><path d="M287 48l-68 100h54l-19 68 79-110h-55z" fill="url(#g)"/><path d="M505 58c-20 35-68 81-68 123a68 68 0 10136 0c0-42-48-88-68-123z" fill="#48a7ff" opacity=".9"/></svg>`}
function regionSvg(){return `<svg viewBox="0 0 760 260" role="img" aria-label="Contexto regional"><rect width="760" height="260" rx="28" fill="#07151f"/><path d="M360 37c-54 0-98 43-98 96 0 69 98 103 98 103s98-34 98-103c0-53-44-96-98-96z" fill="#173d3d" stroke="#31d797" stroke-width="4"/><circle cx="360" cy="128" r="34" fill="#31d797"/><path d="M514 69h112M514 111h86M514 153h128M514 195h75" stroke="#48a7ff" stroke-width="12" stroke-linecap="round" opacity=".65"/><path d="M103 77h118M103 119h89M103 161h132" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".15"/></svg>`}
function billSvg(){return `<svg viewBox="0 0 760 300" role="img" aria-label="Fatura ilustrativa com datas de leitura destacadas"><rect width="760" height="300" rx="28" fill="#07151f"/><rect x="155" y="24" width="450" height="252" rx="18" fill="#eff5f7"/><rect x="185" y="50" width="155" height="18" rx="7" fill="#14303c"/><rect x="185" y="85" width="390" height="8" rx="4" fill="#c3d0d5"/><rect x="185" y="106" width="390" height="8" rx="4" fill="#c3d0d5"/><rect x="185" y="140" width="178" height="62" rx="11" fill="#d9fff0" stroke="#31d797" stroke-width="3"/><text x="200" y="163" fill="#345" font-size="14">LEITURA ANTERIOR</text><text x="200" y="187" fill="#10242e" font-size="18" font-weight="700">12/07 · 28.425</text><rect x="397" y="140" width="178" height="62" rx="11" fill="#e3f3ff" stroke="#48a7ff" stroke-width="3"/><text x="412" y="163" fill="#345" font-size="14">LEITURA ATUAL</text><text x="412" y="187" fill="#10242e" font-size="18" font-weight="700">11/08 · 28.610</text><path d="M363 171h34" stroke="#10242e" stroke-width="4"/><path d="M388 162l10 9-10 9" fill="none" stroke="#10242e" stroke-width="4"/></svg>`}
function meterSvg(){return `<svg viewBox="0 0 760 300" role="img" aria-label="Medidor digital ilustrativo"><rect width="760" height="300" rx="28" fill="#07151f"/><rect x="190" y="35" width="380" height="230" rx="30" fill="#d9e1e4"/><rect x="242" y="82" width="276" height="92" rx="12" fill="#a9c9b3" stroke="#20363b" stroke-width="5"/><text x="275" y="143" fill="#132522" font-family="monospace" font-size="56" font-weight="700">28610</text><text x="453" y="160" fill="#132522" font-size="18">kWh</text><rect x="238" y="76" width="284" height="104" rx="15" fill="none" stroke="#31d797" stroke-width="6"/><text x="247" y="216" fill="#20323a" font-size="16">REGISTRO DE CONSUMO</text><circle cx="535" cy="214" r="12" fill="#48a7ff"/></svg>`}
function reportSvg(){return `<svg viewBox="0 0 760 260" role="img" aria-label="Relatório ilustrativo"><rect width="760" height="260" rx="28" fill="#07151f"/><path d="M118 198h525" stroke="#36515b" stroke-width="3"/><rect x="160" y="129" width="56" height="69" rx="8" fill="#31d797"/><rect x="258" y="92" width="56" height="106" rx="8" fill="#48a7ff"/><rect x="356" y="116" width="56" height="82" rx="8" fill="#31d797"/><rect x="454" y="60" width="56" height="138" rx="8" fill="#48a7ff"/><rect x="552" y="81" width="56" height="117" rx="8" fill="#31d797"/><path d="M157 106c70-9 109-46 157-39 66 10 92 20 143-7 51-27 91-37 154-18" fill="none" stroke="#fff" stroke-width="4" opacity=".55"/></svg>`}
