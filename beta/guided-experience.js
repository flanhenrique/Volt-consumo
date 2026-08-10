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
    <div class="guided-dialog-card">
      <div class="guided-dialog-head">
        <div><p class="eyebrow">CRIAR CONTA</p><h2>Configure seu acesso ao Volt</h2></div>
        <button class="icon-button guided-close" type="button" aria-label="Fechar">×</button>
      </div>
      <form id="guided-signup-form" class="guided-form">
        <label class="full"><span>Nome</span><input id="guided-name" type="text" maxlength="80" autocomplete="name" required></label>
        <label><span>E-mail</span><input id="guided-email" type="email" autocomplete="email" required></label>
        <label><span>Senha</span><input id="guided-password" type="password" minlength="${PASSWORD_POLICY.minLength}" maxlength="${PASSWORD_POLICY.maxLength}" autocomplete="new-password" required></label>
        <label><span>Estado</span><select id="guided-state" autocomplete="address-level1" required><option value="">Selecione</option>${STATES.map(([uf,name]) => `<option value="${uf}">${uf} — ${name}</option>`).join("")}</select></label>
        <label><span>Cidade</span><input id="guided-city" type="text" maxlength="80" autocomplete="address-level2" required></label>
        <label><span>Concessionária de energia</span><input id="guided-energy-provider" type="text" maxlength="120" placeholder="Conforme a fatura" required></label>
        <label><span>Concessionária de água</span><input id="guided-water-provider" type="text" maxlength="120" placeholder="Conforme a fatura" required></label>
        <div class="guided-privacy">
          <label><input id="guided-privacy" type="checkbox" required><span>Li o <a href="./privacy.html" target="_blank" rel="noopener">Aviso de Privacidade</a> e entendi como meus dados serão usados para fornecer a conta, sincronização e contexto regional do Volt.</span></label>
          <p>Coletamos apenas os dados necessários para o funcionamento solicitado. Telefone e idade não fazem parte deste cadastro.</p>
        </div>
        <p id="guided-signup-status" class="note guided-status" role="status" aria-live="polite"></p>
        <div class="guided-actions"><button class="secondary-button" type="button" data-guided-cancel>Cancelar</button><button id="guided-create-account" class="primary-button" type="submit">Criar minha conta</button></div>
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
      if (locality.state && locality.city) await persistMetadata({ locality });
    }
  });
}

async function persistMetadata(partial) {
  const supabase = getClient();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return;
  await supabase.auth.updateUser({ data: { ...(data.user.user_metadata || {}), ...partial } });
}

function exposeOnboarding() {
  window.showOnboarding = () => openTour(buildWelcomeSlides());
  window.resetOnboardingStatus = () => undefined;
}

function buildTourDialog() {
  if (document.querySelector("#guided-tour-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "guided-tour-dialog";
  dialog.className = "guided-tour-dialog";
  dialog.innerHTML = `<div class="guided-dialog-card"><div class="guided-dialog-head"><div><p class="eyebrow">GUIA DO VOLT</p><h2 id="guided-tour-title">Bem-vindo</h2></div><button class="icon-button guided-close" type="button" aria-label="Fechar">×</button></div><div id="guided-tour-body"></div><div class="guided-tour-footer"><div id="guided-tour-progress" class="guided-tour-progress" aria-label="Progresso do tutorial"></div><div class="guided-inline-help"><button id="guided-tour-prev" class="secondary-button" type="button">Voltar</button><button id="guided-tour-next" class="primary-button" type="button">Próximo</button></div></div></div>`;
  document.body.append(dialog);
  dialog.querySelector(".guided-close").addEventListener("click", () => dialog.close());
  dialog.querySelector("#guided-tour-prev").addEventListener("click", () => { if (tourIndex > 0) { tourIndex -= 1; renderTour(); } });
  dialog.querySelector("#guided-tour-next").addEventListener("click", () => {
    if (tourIndex >= tourSlides.length - 1) return dialog.close();
    tourIndex += 1;
    renderTour();
  });
}

function openTour(slides) {
  tourSlides = slides;
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
  progress.replaceChildren(...tourSlides.map((_item, index) => {
    const dot = document.createElement("span");
    if (index === tourIndex) dot.className = "active";
    return dot;
  }));
  const prev = document.querySelector("#guided-tour-prev");
  prev.disabled = tourIndex === 0;
  document.querySelector("#guided-tour-next").textContent = tourIndex === tourSlides.length - 1 ? "Concluir" : "Próximo";
}

function buildWelcomeSlides() {
  return [
    { title: "Bem-vindo ao Volt", html: `${heroSvg("ϟ", "●", "Energia e água em um só lugar")}<div class="guided-tour-copy"><h3>Acompanhe o ciclo real da sua casa</h3><p>Registre leituras, acompanhe consumo e veja estimativas de energia e água sem confundir estimativa com a fatura oficial.</p></div>` },
    { title: "Configure sua região", html: `${locationSvg()}<div class="guided-tour-copy"><h3>UF, município e concessionárias</h3><p>Esses dados definem quais orientações e regras regionais podem ser exibidas. O Volt não presume tarifas nacionais.</p></div>` },
    { title: "Defina o Ciclo de Contagem", html: `${cycleSvg()}<div class="guided-tour-copy"><h3>Use as datas de leitura da fatura</h3><p>O ciclo acompanha o período entre leituras, que pode começar e terminar em qualquer dia do mês. Depois de salvo, ele fica associado à sua conta.</p></div>` },
    { title: "Registre leituras corretamente", html: `${meterSvg("Medidor / hidrômetro", "LEITURA DE CONSUMO", "CÓDIGO TÉCNICO")}<div class="guided-tour-copy"><h3>Nem todo número do visor é consumo</h3><p>Medidores digitais podem alternar telas técnicas e telas de consumo. Confira a orientação regional antes de registrar.</p></div>` },
    { title: "Use relatórios como apoio", html: `${reportSvg()}<div class="guided-tour-copy"><h3>Estimativa, comparação e tendência</h3><p>Com mais leituras, o Volt melhora comparativos e projeções. A conta da concessionária continua sendo a referência oficial de cobrança.</p></div>` }
  ];
}

function bindRegionalHelpOverrides() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("#beta-meter-tutorial, #beta-bill-cycle-tutorial");
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const context = readContext();
    if (target.id === "beta-meter-tutorial") openTour(buildMeterSlides(context));
    else openTour(buildBillSlides(context));
  }, true);
}

function readContext() {
  return window.VOLT_LOCALITY_CONTEXT || readJson(LOCALITY_KEY, {}) || {};
}

function buildMeterSlides(context) {
  const region = regionalBadge(context);
  const energy = context.energyProvider || "sua concessionária de energia";
  const water = context.waterProvider || "sua concessionária de água";
  return [
    { title: "Como ler energia", html: `${region}${meterSvg(energy, "CONSUMO kWh", "TELA / CÓDIGO TÉCNICO")}<div class="guided-tour-copy"><h3>Procure a leitura usada para faturamento</h3><p>Em medidores eletrônicos, o visor pode alternar registros. Use a leitura acumulada de energia ativa indicada para faturamento pela ${escapeHtml(energy)}; não copie automaticamente o primeiro número exibido.</p><div class="guided-provider-warning">O nome do registro e a sequência do visor variam por modelo e concessionária. Quando não houver orientação regional validada, confira a fatura ou o material oficial da distribuidora.</div></div>` },
    { title: "Como ler água", html: `${region}${waterSvg(water)}<div class="guided-tour-copy"><h3>Registre o volume acumulado</h3><p>Use os dígitos que representam metros cúbicos conforme a orientação da ${escapeHtml(water)}. Dígitos coloridos, ponteiros ou casas decimais podem representar frações do m³.</p><div class="guided-provider-warning">O Volt não presume que cores ou posições sejam iguais em todos os hidrômetros.</div></div>` },
    { title: "Confira antes de salvar", html: `${checkSvg()}<div class="guided-tour-copy"><ul><li>Compare com a leitura anterior.</li><li>Confira unidade: kWh para energia e m³ para água.</li><li>Se o visor alternar telas, aguarde aparecer o registro correto.</li><li>Use o OCR apenas como auxílio e confirme o número reconhecido.</li></ul></div>` }
  ];
}

function buildBillSlides(context) {
  const region = regionalBadge(context);
  const provider = context.energyProvider || context.waterProvider || "sua concessionária";
  return [
    { title: "Localize o período na fatura", html: `${region}${billSvg(provider)}<div class="guided-tour-copy"><h3>Procure datas de leitura, não apenas o mês da conta</h3><p>Na fatura da ${escapeHtml(provider)}, procure campos equivalentes a leitura anterior, leitura atual, data da leitura anterior e data da leitura atual. Os nomes e posições podem mudar conforme a concessionária.</p></div>` },
    { title: "Transforme em Ciclo de Contagem", html: `${cycleSvg()}<div class="guided-tour-copy"><p>Use o dia da leitura anterior como referência de início e o dia da leitura atual como encerramento. O Volt ajusta automaticamente meses com menos dias.</p><div class="guided-tour-note">Exemplo ilustrativo: leitura anterior em 12/07 e leitura atual em 11/08 → ciclo aproximado do dia 12 ao dia 11. Use sempre as datas reais da sua fatura.</div></div>` }
  ];
}

function regionalBadge(context) {
  const parts = [context.city, context.state].filter(Boolean).join(" · ");
  const providers = [context.energyProvider, context.waterProvider].filter(Boolean).join(" / ");
  if (!parts && !providers) return '<div class="guided-context-badge">Orientação geral — configure sua região para contextualizar</div>';
  return `<div class="guided-context-badge">${escapeHtml(parts || "Região configurada")}${providers ? ` · ${escapeHtml(providers)}` : ""}</div>`;
}

function heroSvg(a,b,label){return `<div class="guided-tour-media"><svg viewBox="0 0 640 270" role="img" aria-label="${escapeHtml(label)}"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#31d797"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><rect width="640" height="270" fill="#081821"/><circle cx="250" cy="135" r="72" fill="url(#g1)" opacity=".17"/><circle cx="390" cy="135" r="72" fill="url(#g1)" opacity=".12"/><text x="250" y="157" text-anchor="middle" font-size="72" fill="#7fe8bd">${a}</text><text x="390" y="155" text-anchor="middle" font-size="62" fill="#74b9ff">${b}</text><text x="320" y="235" text-anchor="middle" font-family="system-ui" font-size="18" fill="#dce8ef">${escapeHtml(label)}</text></svg></div>`}
function locationSvg(){return `<div class="guided-tour-media"><svg viewBox="0 0 640 270" role="img" aria-label="Ilustração de localização"><rect width="640" height="270" fill="#081821"/><path d="M100 70L230 35l180 45 130-30v155l-130 30-180-45-130 35z" fill="none" stroke="#3d5968" stroke-width="3"/><path d="M320 68c-38 0-68 29-68 65 0 51 68 101 68 101s68-50 68-101c0-36-30-65-68-65z" fill="#31d797" opacity=".22" stroke="#31d797" stroke-width="3"/><circle cx="320" cy="132" r="21" fill="#31d797"/></svg></div>`}
function cycleSvg(){return `<div class="guided-tour-media"><svg viewBox="0 0 640 270" role="img" aria-label="Linha do tempo do ciclo de contagem"><rect width="640" height="270" fill="#081821"/><line x1="110" y1="145" x2="530" y2="145" stroke="#45606e" stroke-width="8" stroke-linecap="round"/><circle cx="150" cy="145" r="18" fill="#31d797"/><circle cx="490" cy="145" r="18" fill="#74b9ff"/><text x="150" y="105" text-anchor="middle" font-family="system-ui" font-size="18" fill="#dce8ef">Leitura anterior</text><text x="490" y="105" text-anchor="middle" font-family="system-ui" font-size="18" fill="#dce8ef">Leitura atual</text><text x="320" y="190" text-anchor="middle" font-family="system-ui" font-size="20" fill="#9fb1bc">Ciclo de Contagem</text></svg></div>`}
function meterSvg(provider,primary,secondary){return `<div class="guided-tour-media"><svg viewBox="0 0 640 300" role="img" aria-label="Exemplo de visor de medidor"><rect width="640" height="300" fill="#081821"/><rect x="125" y="45" width="390" height="205" rx="30" fill="#132732" stroke="#4c6572" stroke-width="3"/><rect x="175" y="95" width="290" height="68" rx="12" fill="#d9f4df"/><text x="320" y="140" text-anchor="middle" font-family="monospace" font-size="38" fill="#10251b">028510</text><text x="320" y="188" text-anchor="middle" font-family="system-ui" font-size="16" fill="#7fe8bd">${escapeHtml(primary)}</text><text x="320" y="216" text-anchor="middle" font-family="system-ui" font-size="13" fill="#8fa4af">${escapeHtml(secondary)}</text><text x="320" y="278" text-anchor="middle" font-family="system-ui" font-size="14" fill="#8fa4af">${escapeHtml(provider)}</text></svg></div>`}
function waterSvg(provider){return `<div class="guided-tour-media"><svg viewBox="0 0 640 300" role="img" aria-label="Exemplo de hidrômetro"><rect width="640" height="300" fill="#081821"/><circle cx="320" cy="145" r="105" fill="#142a35" stroke="#4d6876" stroke-width="4"/><rect x="210" y="105" width="220" height="62" rx="9" fill="#e7f3ed"/><text x="320" y="147" text-anchor="middle" font-family="monospace" font-size="34" fill="#12251b">00128.534</text><text x="320" y="207" text-anchor="middle" font-family="system-ui" font-size="15" fill="#74b9ff">m³ · leitura acumulada</text><text x="320" y="278" text-anchor="middle" font-family="system-ui" font-size="14" fill="#8fa4af">${escapeHtml(provider)}</text></svg></div>`}
function billSvg(provider){return `<div class="guided-tour-media"><svg viewBox="0 0 640 340" role="img" aria-label="Exemplo ilustrativo de fatura"><rect width="640" height="340" fill="#081821"/><rect x="130" y="25" width="380" height="290" rx="18" fill="#eef5f2"/><rect x="165" y="62" width="160" height="18" rx="6" fill="#9cb0aa"/><rect x="165" y="102" width="310" height="44" rx="8" fill="#d8e3df"/><rect x="165" y="171" width="145" height="62" rx="10" fill="#d7f5e7" stroke="#31d797" stroke-width="3"/><rect x="330" y="171" width="145" height="62" rx="10" fill="#e0edfa" stroke="#74b9ff" stroke-width="3"/><text x="237" y="193" text-anchor="middle" font-family="system-ui" font-size="12" fill="#274238">Leitura anterior</text><text x="237" y="217" text-anchor="middle" font-family="system-ui" font-size="15" fill="#163026">12/07</text><text x="402" y="193" text-anchor="middle" font-family="system-ui" font-size="12" fill="#274238">Leitura atual</text><text x="402" y="217" text-anchor="middle" font-family="system-ui" font-size="15" fill="#163026">11/08</text><text x="320" y="285" text-anchor="middle" font-family="system-ui" font-size="13" fill="#526a61">Exemplo · ${escapeHtml(provider)}</text></svg></div>`}
function reportSvg(){return `<div class="guided-tour-media"><svg viewBox="0 0 640 270" role="img" aria-label="Gráfico ilustrativo de consumo"><rect width="640" height="270" fill="#081821"/><path d="M90 210L170 170l80 18 80-85 80 34 120-78" fill="none" stroke="#31d797" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><line x1="90" y1="220" x2="550" y2="220" stroke="#3b5664" stroke-width="2"/></svg></div>`}
function checkSvg(){return `<div class="guided-tour-media"><svg viewBox="0 0 640 250" role="img" aria-label="Confirmação de leitura"><rect width="640" height="250" fill="#081821"/><circle cx="320" cy="125" r="78" fill="#31d797" opacity=".12"/><path d="M275 126l30 31 63-72" fill="none" stroke="#31d797" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function clampDay(value) { const number = Number(value); return Math.min(31, Math.max(1, Number.isFinite(number) ? Math.round(number) : 1)); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
