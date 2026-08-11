import "./platform-users.js";

installUtilityDetailStyles();

async function installUtilityDetailStyles() {
  const href = new URL("./energy-detail.css?v=67", import.meta.url);
  try {
    if ("adoptedStyleSheets" in document && typeof CSSStyleSheet !== "undefined" && "replace" in CSSStyleSheet.prototype) {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(`Falha ao carregar estilos: ${response.status}`);
      const sheet = new CSSStyleSheet();
      await sheet.replace(await response.text());
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return;
    }
  } catch (error) {
    console.warn("Volt: fallback de stylesheet do detalhamento", error);
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href.href;
  link.dataset.voltUtilityDetail = "true";
  document.head.append(link);
}

const explanations = {
  energyConsumption: ["Consumo", "Valor estimado da energia consumida no ciclo, calculado a partir dos kWh registrados e da tarifa configurada."],
  flag: ["Bandeira tarifária", "Adicional aplicado por kWh conforme a bandeira selecionada para o período."],
  lighting: ["Taxa de iluminação pública", "Contribuição municipal de iluminação pública configurada no aplicativo."],
  waterConsumption: ["Consumo de água", "Valor estimado da água consumida no ciclo, calculado a partir dos m³ registrados e da tarifa configurada."],
  sewer: ["Taxa de esgoto", "Percentual configurado sobre o valor do consumo de água."],
  fixedFee: ["Taxa fixa", "Valor fixo configurado para a conta de água, quando aplicável."],
  taxes: ["Impostos", "O Volt não inventa tributos: quando não há dado confiável, o item fica como não identificado."],
  fine: ["Multa", "Só entra no total quando houver valor real identificado."],
  interest: ["Juros", "Só entram no total quando houver valor real identificado."]
};

const icons = { energyConsumption: "ϟ", flag: "⚑", lighting: "⌁", waterConsumption: "●", sewer: "≈", fixedFee: "+", taxes: "%", fine: "!", interest: "%" };
let detailDialog;
let detailPopover;
let detailPopoverTimer;
let activeMeter = "energy";

queueMicrotask(initializeUtilityDetails);
window.addEventListener("volt:locality-context", refreshUtilityDetail);
window.addEventListener("volt:cycle-context", refreshUtilityDetail);

function initializeUtilityDetails() {
  if (!window.VOLT_BETA_API) return;
  bindCard("energy", ".utility-card.energy", "Energia. Abrir detalhamento da composição estimada");
  bindCard("water", ".utility-card.water", "Água. Abrir detalhamento da composição estimada");
  ensureDialog();
}

function bindCard(meter, selector, label) {
  const card = document.querySelector(selector);
  if (!card || card.dataset.detailBound === "true") return;
  card.dataset.detailBound = "true";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-haspopup", "dialog");
  card.setAttribute("aria-label", label);
  card.addEventListener("click", () => openUtilityDetail(meter));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openUtilityDetail(meter);
    }
  });
}

function ensureDialog() {
  if (detailDialog?.isConnected) return detailDialog;
  detailDialog = document.createElement("dialog");
  detailDialog.className = "energy-detail-dialog";
  detailDialog.setAttribute("aria-labelledby", "utility-detail-title");
  detailDialog.innerHTML = `<div class="energy-detail-sheet">
    <div class="energy-detail-handle" aria-hidden="true"></div>
    <div class="energy-detail-heading"><div class="energy-detail-title"><span id="utility-detail-symbol" aria-hidden="true">ϟ</span><h2 id="utility-detail-title">Detalhamento de energia</h2></div><button class="icon-button" type="button" data-utility-detail-close aria-label="Fechar">×</button></div>
    <p class="energy-detail-cycle" id="utility-detail-cycle">Ciclo atual</p>
    <p class="energy-detail-context" id="utility-detail-context" hidden></p>
    <div class="energy-detail-list" id="utility-detail-list"></div>
    <div class="energy-detail-total"><div><span>TOTAL ESTIMADO</span></div><strong id="utility-detail-total">R$ 0,00</strong></div>
    <p class="energy-detail-note" id="utility-detail-note"></p>
  </div>`;
  document.body.append(detailDialog);
  const closeButton = detailDialog.querySelector("[data-utility-detail-close]");
  const closeNow = (event) => {
    event?.preventDefault?.();
    try { detailDialog.close(); } catch { detailDialog.removeAttribute("open"); }
  };
  closeButton.addEventListener("pointerdown", closeNow, { passive: false });
  closeButton.addEventListener("click", closeNow);
  detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) closeNow(event); });
  detailDialog.addEventListener("close", clearExplanation);
  return detailDialog;
}

function openUtilityDetail(meter) {
  activeMeter = meter;
  ensureDialog();
  window.dispatchEvent(new CustomEvent("volt:cycle-context-request"));
  renderUtilityDetail();
  if (!detailDialog.open) detailDialog.showModal();
}

function refreshUtilityDetail() { if (detailDialog?.open) renderUtilityDetail(); }

function renderUtilityDetail() {
  const snapshot = window.VOLT_BETA_API?.getSnapshot?.();
  const values = window.VOLT_CYCLE_VALUES?.[activeMeter];
  const cycle = window.VOLT_CYCLE_CONTEXT?.[activeMeter];
  if (!snapshot) return;
  const locality = readLocalityContext();
  detailDialog.dataset.meter = activeMeter;
  const list = detailDialog.querySelector("#utility-detail-list");

  if (activeMeter === "water") {
    const water = snapshot.water || {};
    const settings = water.settings || {};
    const estimate = values?.estimate || { waterCost: 0, sewerCost: 0, totalCost: 0 };
    const consumption = Number(values?.consumption || 0);
    const provider = locality.waterProvider || "Concessionária de água não informada";
    list.replaceChildren(
      row("waterConsumption", "Consumo", `${formatNumber(consumption, 3)} m³ × ${currency(Number(settings.rate || 0))}/m³`, currency(Number(estimate.waterCost || 0))),
      row("sewer", "Taxa de esgoto", `${formatNumber(Number(settings.sewerPercent || 0), 0)}% · ${provider}`, currency(Number(estimate.sewerCost || 0))),
      row("fixedFee", "Taxa fixa", locality.waterProvider ? `Configuração para ${provider}` : "Valor configurado", currency(Number(settings.fixedFee || 0))),
      row("taxes", "Impostos", "Não identificado na estimativa atual", "—"),
      row("fine", "Multa", "Não identificada na estimativa atual", "—"),
      row("interest", "Juros", "Não identificados na estimativa atual", "—")
    );
    setText("#utility-detail-title", "Detalhamento de água");
    setText("#utility-detail-symbol", "●");
    setText("#utility-detail-total", currency(Number(estimate.totalCost || 0)));
    setText("#utility-detail-note", locality.waterProvider ? `Contexto reconhecido: ${provider}.` : "Valores estimados com base nas leituras e configurações atuais.");
  } else {
    const energy = snapshot.energy || {};
    const settings = energy.settings || {};
    const estimate = values?.estimate || { baseCost: 0, flagCost: 0, totalCost: 0 };
    const consumption = Number(values?.consumption || 0);
    const provider = locality.energyProvider || "Concessionária de energia não informada";
    list.replaceChildren(
      row("energyConsumption", "Consumo", `${formatNumber(consumption, 0)} kWh × ${currency(Number(settings.rate || 0))}/kWh`, currency(Number(estimate.baseCost || 0))),
      row("flag", "Bandeira tarifária", `${flagLabel(settings.flag)}${locality.energyProvider ? ` · ${provider}` : ""}`, currency(Number(estimate.flagCost || 0))),
      row("lighting", "Taxa de iluminação pública", locality.city ? `Município: ${locality.city}/${locality.state || ""}` : "Contribuição configurada", currency(Number(settings.lightingFee || 0))),
      row("taxes", "Impostos", "Não identificado na estimativa atual", "—"),
      row("fine", "Multa", "Não identificada na estimativa atual", "—"),
      row("interest", "Juros", "Não identificados na estimativa atual", "—")
    );
    setText("#utility-detail-title", "Detalhamento de energia");
    setText("#utility-detail-symbol", "ϟ");
    setText("#utility-detail-total", currency(Number(estimate.totalCost || 0)));
    setText("#utility-detail-note", locality.energyProvider ? `Contexto reconhecido: ${provider}.` : "Valores estimados com base nas leituras e configurações atuais.");
  }

  renderLocalityContext(locality);
  setText("#utility-detail-cycle", cycle?.label ? `Ciclo atual · ${cycle.label}` : `Ciclo de ${activeMeter === "energy" ? "energia" : "água"} não configurado`);
}

function readLocalityContext() {
  if (window.VOLT_LOCALITY_CONTEXT && typeof window.VOLT_LOCALITY_CONTEXT === "object") return window.VOLT_LOCALITY_CONTEXT;
  try { return JSON.parse(localStorage.getItem("volt:beta:locality-context-v1") || "{}"); } catch { return {}; }
}

function renderLocalityContext(locality) {
  const context = detailDialog.querySelector("#utility-detail-context");
  const provider = activeMeter === "water" ? locality.waterProvider : locality.energyProvider;
  const parts = [[locality.city, locality.state].filter(Boolean).join(" · "), provider].filter(Boolean);
  context.hidden = parts.length === 0;
  context.textContent = parts.join(" · ");
}

function row(key, title, subtitle, value) {
  const item = document.createElement("div");
  item.className = "energy-detail-row";
  item.dataset.kind = key;
  const icon = document.createElement("div"); icon.className = "energy-detail-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = icons[key] || "•";
  const copy = document.createElement("div"); copy.className = "energy-detail-copy";
  const strong = document.createElement("strong"); strong.textContent = title;
  const small = document.createElement("small"); small.textContent = subtitle;
  copy.append(strong, small);
  const amount = document.createElement("div"); amount.className = "energy-detail-value"; amount.textContent = value;
  const info = document.createElement("button"); info.type = "button"; info.className = "energy-detail-info"; info.textContent = "i"; info.setAttribute("aria-label", `Informação sobre ${title}`);
  info.addEventListener("click", (event) => { event.stopPropagation(); showExplanation(key, info); });
  item.append(icon, copy, amount, info);
  return item;
}

function clearExplanation() {
  if (detailPopoverTimer) window.clearTimeout(detailPopoverTimer);
  detailPopoverTimer = null;
  detailPopover?.remove();
  detailPopover = null;
}

function showExplanation(key, anchor) {
  clearExplanation();
  const [title, text] = explanations[key] || ["Informação", "Detalhe indisponível."];
  detailPopover = document.createElement("div");
  detailPopover.className = "energy-detail-popover";
  detailPopover.setAttribute("role", "status");
  detailPopover.setAttribute("aria-live", "polite");
  const heading = document.createElement("strong"); heading.textContent = title;
  const paragraph = document.createElement("p"); paragraph.textContent = text;
  detailPopover.append(heading, paragraph);
  ensureDialog().append(detailPopover);
  detailPopoverTimer = window.setTimeout(clearExplanation, 6500);
  anchor.focus();
}

function flagLabel(flag) { return ({ green: "Bandeira verde", yellow: "Bandeira amarela", red1: "Bandeira vermelha 1", red2: "Bandeira vermelha 2" })[flag] || "Bandeira configurada"; }
function setText(selector, value) { const element = detailDialog?.querySelector(selector) || document.querySelector(selector); if (element) element.textContent = value; }
function currency(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatNumber(value, digits = 0) { return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits }); }
