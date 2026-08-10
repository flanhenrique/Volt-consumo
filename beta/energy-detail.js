import "./platform-users.js";

installUtilityDetailStyles();

async function installUtilityDetailStyles() {
  const href = new URL("./energy-detail.css?v=62", import.meta.url);

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
  flag: ["Bandeira tarifária", "Adicional aplicado por kWh conforme a bandeira selecionada para o período. O valor exibido vem da configuração atual do Volt."],
  lighting: ["Taxa de iluminação pública", "Contribuição municipal de iluminação pública configurada no aplicativo. A cobrança real pode variar conforme o município e a fatura."],
  waterConsumption: ["Consumo de água", "Valor estimado da água consumida no ciclo, calculado a partir dos m³ registrados e da tarifa configurada."],
  sewer: ["Taxa de esgoto", "Percentual configurado sobre o valor do consumo de água. A regra real pode variar conforme a concessionária."],
  fixedFee: ["Taxa fixa", "Valor fixo configurado para a conta de água, quando aplicável."],
  taxes: ["Impostos", "Tributos podem compor a fatura. O Volt não inventa esses valores: quando não há dado confiável, o item fica como não identificado."],
  fine: ["Multa", "Cobrança por atraso ou outra penalidade informada pela concessionária. Só deve entrar no total quando houver valor real identificado."],
  interest: ["Juros", "Juros por atraso ou encargos financeiros da fatura. Só devem ser somados quando houver valor real identificado."]
};

const icons = {
  energyConsumption: "ϟ",
  flag: "⚑",
  lighting: "⌁",
  waterConsumption: "●",
  sewer: "≈",
  fixedFee: "+",
  taxes: "%",
  fine: "!",
  interest: "%"
};

let detailDialog;
let detailPopover;
let activeMeter = "energy";

queueMicrotask(initializeUtilityDetails);
window.addEventListener("volt:beta-data", refreshUtilityDetail);

function initializeUtilityDetails() {
  if (!window.VOLT_BETA_API) return;
  bindCard("energy", ".utility-card.energy", "Energia. Abrir detalhamento da composição estimada");
  bindCard("water", ".utility-card.water", "Água. Abrir detalhamento da composição estimada");
  ensureDialog();
}

function bindCard(meter, selector, label) {
  const card = document.querySelector(selector);
  if (!card) return;
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
  detailDialog.innerHTML = `
    <div class="energy-detail-sheet">
      <div class="energy-detail-handle" aria-hidden="true"></div>
      <div class="energy-detail-heading">
        <div class="energy-detail-title"><span id="utility-detail-symbol" aria-hidden="true">ϟ</span><h2 id="utility-detail-title">Detalhamento de energia</h2></div>
        <button class="icon-button" type="button" data-utility-detail-close aria-label="Fechar">×</button>
      </div>
      <p class="energy-detail-cycle" id="utility-detail-cycle">Ciclo atual</p>
      <div class="energy-detail-list" id="utility-detail-list"></div>
      <div class="energy-detail-total"><div><span>TOTAL ESTIMADO</span></div><strong id="utility-detail-total">R$ 0,00</strong></div>
      <p class="energy-detail-note" id="utility-detail-note"></p>
    </div>`;
  document.body.append(detailDialog);
  detailDialog.querySelector("[data-utility-detail-close]").addEventListener("click", () => detailDialog.close());
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) detailDialog.close();
  });
  return detailDialog;
}

function openUtilityDetail(meter) {
  activeMeter = meter;
  ensureDialog();
  renderUtilityDetail();
  if (!detailDialog.open) detailDialog.showModal();
}

function refreshUtilityDetail() {
  if (detailDialog?.open) renderUtilityDetail();
}

function renderUtilityDetail() {
  const snapshot = window.VOLT_BETA_API?.getSnapshot?.();
  if (!snapshot) return;
  detailDialog.dataset.meter = activeMeter;
  const list = detailDialog.querySelector("#utility-detail-list");
  if (activeMeter === "water") {
    const water = snapshot.water || {};
    const estimate = water.estimate || {};
    const settings = water.settings || {};
    const consumption = Number(water.summary?.consumption || 0);
    const rows = [
      row("waterConsumption", "Consumo", `${formatNumber(consumption, 3)} m³ × ${currency(Number(settings.rate || 0))}/m³`, currency(Number(estimate.waterCost || 0))),
      row("sewer", "Taxa de esgoto", `${formatNumber(Number(settings.sewerPercent || 0), 0)}% sobre o consumo de água`, currency(Number(estimate.sewerCost || 0))),
      row("fixedFee", "Taxa fixa", "Valor configurado", currency(Number(settings.fixedFee || 0))),
      row("taxes", "Impostos", "Não identificado na estimativa atual", "—"),
      row("fine", "Multa", "Não identificada na estimativa atual", "—"),
      row("interest", "Juros", "Não identificados na estimativa atual", "—")
    ];
    list.replaceChildren(...rows);
    detailDialog.querySelector("#utility-detail-title").textContent = "Detalhamento de água";
    detailDialog.querySelector("#utility-detail-symbol").textContent = "●";
    detailDialog.querySelector("#utility-detail-total").textContent = currency(Number(estimate.totalCost || 0));
    detailDialog.querySelector("#utility-detail-note").textContent = "Valores estimados com base nas leituras e configurações atuais. Impostos, multa e juros só entram no total quando houver dado confiável identificado.";
  } else {
    const energy = snapshot.energy || {};
    const estimate = energy.estimate || {};
    const settings = energy.settings || {};
    const consumption = Number(energy.summary?.consumption || 0);
    const rows = [
      row("energyConsumption", "Consumo", `${formatNumber(consumption, 0)} kWh × ${currency(Number(settings.rate || 0))}/kWh`, currency(Number(estimate.baseCost || 0))),
      row("flag", "Bandeira tarifária", flagLabel(settings.flag), currency(Number(estimate.flagCost || 0))),
      row("lighting", "Taxa de iluminação pública", "Contribuição configurada", currency(Number(settings.lightingFee || 0))),
      row("taxes", "Impostos", "Não identificado na estimativa atual", "—"),
      row("fine", "Multa", "Não identificada na estimativa atual", "—"),
      row("interest", "Juros", "Não identificados na estimativa atual", "—")
    ];
    list.replaceChildren(...rows);
    detailDialog.querySelector("#utility-detail-title").textContent = "Detalhamento de energia";
    detailDialog.querySelector("#utility-detail-symbol").textContent = "ϟ";
    detailDialog.querySelector("#utility-detail-total").textContent = currency(Number(estimate.totalCost || 0));
    detailDialog.querySelector("#utility-detail-note").textContent = "Valores estimados com base nas leituras e configurações atuais. Impostos, multa e juros só entram no total quando houver dado confiável identificado.";
  }
  const cycleLabel = document.querySelector("#beta-cycle-label")?.textContent?.trim();
  detailDialog.querySelector("#utility-detail-cycle").textContent = cycleLabel && cycleLabel !== "—" ? `Ciclo atual · ${cycleLabel}` : "Ciclo atual";
}

function row(key, title, subtitle, value) {
  const item = document.createElement("div");
  item.className = "energy-detail-row";
  item.dataset.kind = key;
  const icon = document.createElement("div");
  icon.className = "energy-detail-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = icons[key] || "•";
  const copy = document.createElement("div");
  copy.className = "energy-detail-copy";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = subtitle;
  copy.append(strong, small);
  const amount = document.createElement("div");
  amount.className = "energy-detail-value";
  amount.textContent = value;
  const info = document.createElement("button");
  info.type = "button";
  info.className = "energy-detail-info";
  info.textContent = "i";
  info.setAttribute("aria-label", `Informação sobre ${title}`);
  info.addEventListener("click", (event) => {
    event.stopPropagation();
    showExplanation(key, info);
  });
  item.append(icon, copy, amount, info);
  return item;
}

function showExplanation(key, anchor) {
  detailPopover?.remove();
  const [title, text] = explanations[key] || ["Informação", "Detalhe indisponível."];
  detailPopover = document.createElement("div");
  detailPopover.className = "energy-detail-popover";
  detailPopover.setAttribute("role", "status");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  detailPopover.append(heading, paragraph);
  document.body.append(detailPopover);
  window.setTimeout(() => detailPopover?.remove(), 6500);
  anchor.focus();
}

function flagLabel(flag) {
  return ({ green: "Bandeira verde", yellow: "Bandeira amarela", red1: "Bandeira vermelha 1", red2: "Bandeira vermelha 2" })[flag] || "Bandeira configurada";
}

function currency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
