const energyDetailStylesheet = document.createElement("link");
energyDetailStylesheet.rel = "stylesheet";
energyDetailStylesheet.href = "./energy-detail.css";
document.head.append(energyDetailStylesheet);

const explanations = {
  consumption: ["Consumo", "Valor estimado da energia consumida no ciclo, calculado a partir dos kWh registrados e da tarifa configurada."],
  flag: ["Bandeira tarifária", "Adicional aplicado por kWh conforme a bandeira selecionada para o período. O valor exibido vem da configuração atual do Volt."],
  lighting: ["Taxa de iluminação pública", "Contribuição municipal de iluminação pública configurada no aplicativo. A cobrança real pode variar conforme o município e a fatura."],
  taxes: ["Impostos", "ICMS, PIS e COFINS podem compor a fatura. O Volt não inventa esses valores: quando não há dado confiável, o item fica como não identificado."],
  fine: ["Multa", "Cobrança por atraso ou outra penalidade informada pela concessionária. Só deve entrar no total quando houver valor real identificado."],
  interest: ["Juros", "Juros por atraso ou encargos financeiros da fatura. Só devem ser somados quando houver valor real identificado."]
};

const icons = {
  consumption: "ϟ",
  flag: "⚑",
  lighting: "⌁",
  taxes: "%",
  fine: "!",
  interest: "%"
};

let detailDialog;
let detailPopover;

queueMicrotask(initializeEnergyDetail);
window.addEventListener("volt:beta-data", refreshEnergyDetail);

function initializeEnergyDetail() {
  const card = document.querySelector(".utility-card.energy");
  if (!card || !window.VOLT_BETA_API) return;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-haspopup", "dialog");
  card.setAttribute("aria-label", "Energia. Abrir detalhamento da composição estimada");
  card.addEventListener("click", openEnergyDetail);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEnergyDetail();
    }
  });
  ensureDialog();
}

function ensureDialog() {
  if (detailDialog?.isConnected) return detailDialog;
  detailDialog = document.createElement("dialog");
  detailDialog.className = "energy-detail-dialog";
  detailDialog.setAttribute("aria-labelledby", "energy-detail-title");
  detailDialog.innerHTML = `
    <div class="energy-detail-sheet">
      <div class="energy-detail-handle" aria-hidden="true"></div>
      <div class="energy-detail-heading">
        <div class="energy-detail-title"><span aria-hidden="true">ϟ</span><h2 id="energy-detail-title">Detalhamento de energia</h2></div>
        <button class="icon-button" type="button" data-energy-detail-close aria-label="Fechar">×</button>
      </div>
      <p class="energy-detail-cycle" id="energy-detail-cycle">Ciclo atual</p>
      <div class="energy-detail-list" id="energy-detail-list"></div>
      <div class="energy-detail-total"><div><span>TOTAL ESTIMADO</span></div><strong id="energy-detail-total">R$ 0,00</strong></div>
      <p class="energy-detail-note">Valores estimados com base nas leituras e configurações atuais. Impostos, multa e juros só entram no total quando houver dado confiável identificado.</p>
    </div>`;
  document.body.append(detailDialog);
  detailDialog.querySelector("[data-energy-detail-close]").addEventListener("click", () => detailDialog.close());
  detailDialog.addEventListener("click", (event) => {
    if (event.target === detailDialog) detailDialog.close();
  });
  return detailDialog;
}

function openEnergyDetail() {
  ensureDialog();
  renderEnergyDetail();
  if (!detailDialog.open) detailDialog.showModal();
}

function refreshEnergyDetail() {
  if (detailDialog?.open) renderEnergyDetail();
}

function renderEnergyDetail() {
  const snapshot = window.VOLT_BETA_API?.getSnapshot?.();
  if (!snapshot?.energy) return;
  const estimate = snapshot.energy.estimate || {};
  const settings = snapshot.energy.settings || {};
  const consumption = Number(snapshot.energy.summary?.consumption || 0);
  const flagRate = Math.max(0, Number(estimate.flagCost || 0));
  const rows = [
    row("consumption", "Consumo", `${formatNumber(consumption, 0)} kWh × ${currency(Number(settings.rate || 0))}/kWh`, currency(Number(estimate.baseCost || 0))),
    row("flag", "Bandeira tarifária", flagLabel(settings.flag), currency(flagRate)),
    row("lighting", "Taxa de iluminação pública", "Contribuição configurada", currency(Number(settings.lightingFee || 0))),
    row("taxes", "Impostos", "Não identificado na estimativa atual", "—"),
    row("fine", "Multa", "Não identificada na estimativa atual", "—"),
    row("interest", "Juros", "Não identificados na estimativa atual", "—")
  ];
  const list = detailDialog.querySelector("#energy-detail-list");
  list.replaceChildren(...rows);
  detailDialog.querySelector("#energy-detail-total").textContent = currency(Number(estimate.totalCost || 0));
  const cycleLabel = document.querySelector("#beta-cycle-label")?.textContent?.trim();
  detailDialog.querySelector("#energy-detail-cycle").textContent = cycleLabel && cycleLabel !== "—" ? `Ciclo atual · ${cycleLabel}` : "Ciclo atual";
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
