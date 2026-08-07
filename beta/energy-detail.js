const energyDetailStyle = document.createElement("style");
energyDetailStyle.textContent = `
.utility-card.energy { cursor:pointer; }
.utility-card.energy:focus-visible { outline:3px solid #19c98a; outline-offset:4px; }
.tariff-info-card { display:none !important; }

.energy-detail-dialog {
  position:fixed;
  inset:auto 10px max(env(safe-area-inset-bottom),10px) 10px;
  width:auto;
  max-width:560px;
  max-height:min(86dvh,820px);
  margin:0 auto;
  padding:0;
  overflow:hidden;
  border:1px solid rgba(151,177,191,.25);
  border-radius:30px 30px 24px 24px;
  color:#f5f8fa;
  background:rgba(7,18,26,.88);
  box-shadow:0 28px 90px rgba(0,0,0,.48);
  backdrop-filter:blur(34px) saturate(165%);
  -webkit-backdrop-filter:blur(34px) saturate(165%);
}
.energy-detail-dialog::backdrop {
  background:rgba(1,8,13,.62);
  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);
}
.energy-detail-sheet {
  display:grid;
  gap:18px;
  max-height:min(86dvh,820px);
  padding:14px 18px calc(22px + env(safe-area-inset-bottom));
  overflow-y:auto;
  overscroll-behavior:contain;
}
.energy-detail-handle {
  width:50px;
  height:5px;
  margin:0 auto 2px;
  border-radius:999px;
  background:rgba(226,237,242,.34);
}
.energy-detail-heading {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
}
.energy-detail-title {
  display:flex;
  align-items:center;
  gap:11px;
  min-width:0;
}
.energy-detail-title > span {
  display:grid;
  flex:0 0 36px;
  place-items:center;
  width:36px;
  height:36px;
  border:1px solid rgba(24,206,141,.35);
  border-radius:50%;
  color:#25d996;
  background:rgba(20,170,117,.16);
  box-shadow:inset 0 0 18px rgba(28,220,151,.08);
  font-size:21px;
  font-weight:900;
}
.energy-detail-title h2 {
  margin:0;
  color:#f5f8fa;
  font-size:clamp(21px,5.4vw,29px);
  line-height:1.08;
  letter-spacing:-.025em;
}
.energy-detail-heading .icon-button {
  display:grid;
  flex:0 0 44px;
  place-items:center;
  width:44px;
  height:44px;
  padding:0;
  border:1px solid rgba(170,190,201,.2);
  border-radius:50%;
  color:#f1f6f8;
  background:rgba(255,255,255,.07);
  font-size:26px;
}
.energy-detail-cycle {
  margin:-6px 0 0;
  color:#aebdc6;
  font-size:13px;
  line-height:1.4;
}
.energy-detail-list {
  display:grid;
  overflow:hidden;
  border:1px solid rgba(143,170,184,.22);
  border-radius:20px;
  background:rgba(18,34,44,.72);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.025);
}
.energy-detail-row {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto 30px;
  align-items:center;
  gap:12px;
  min-height:72px;
  padding:13px 14px;
}
.energy-detail-row + .energy-detail-row { border-top:1px solid rgba(143,170,184,.18); }
.energy-detail-copy {
  display:grid;
  grid-template-columns:38px minmax(0,1fr);
  column-gap:11px;
  align-items:center;
  min-width:0;
}
.energy-detail-row-icon {
  display:grid;
  grid-row:1 / span 2;
  place-items:center;
  width:38px;
  height:38px;
  border-radius:12px;
  font-size:20px;
  font-weight:900;
}
.energy-detail-row[data-detail-key="consumption"] .energy-detail-row-icon { color:#47eb8d; background:rgba(50,201,106,.14); }
.energy-detail-row[data-detail-key="flag"] .energy-detail-row-icon { color:#ffd74f; background:rgba(241,196,43,.14); }
.energy-detail-row[data-detail-key="lighting"] .energy-detail-row-icon { color:#b89aff; background:rgba(139,104,230,.15); }
.energy-detail-row[data-detail-key="taxes"] .energy-detail-row-icon { color:#55dc72; background:rgba(65,195,95,.13); }
.energy-detail-row[data-detail-key="fine"] .energy-detail-row-icon { color:#ff7777; background:rgba(229,82,82,.14); }
.energy-detail-row[data-detail-key="interest"] .energy-detail-row-icon { color:#f47ad5; background:rgba(214,70,178,.14); }
.energy-detail-copy strong {
  display:block;
  min-width:0;
  overflow:hidden;
  color:#f4f7f9;
  font-size:15px;
  line-height:1.25;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.energy-detail-copy small {
  display:block;
  min-width:0;
  margin-top:3px;
  overflow:hidden;
  color:#98aab5;
  font-size:12px;
  line-height:1.35;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.energy-detail-value {
  color:#f6f9fa;
  font-size:15px;
  font-weight:850;
  text-align:right;
  white-space:nowrap;
}
.energy-detail-value.muted { color:#8798a3; font-weight:700; }
.energy-detail-info {
  display:grid;
  place-items:center;
  width:27px;
  height:27px;
  padding:0;
  border:1px solid rgba(48,224,135,.8);
  border-radius:50%;
  color:#45e58d;
  background:transparent;
  font-size:13px;
  font-weight:900;
}
.energy-detail-total {
  display:grid;
  gap:5px;
  padding:4px 4px 0;
}
.energy-detail-total span {
  color:#42df8e;
  font-size:12px;
  font-weight:900;
  letter-spacing:.13em;
}
.energy-detail-total strong {
  color:#f7fafb;
  font-size:clamp(30px,8vw,40px);
  line-height:1;
  letter-spacing:-.02em;
}
.energy-detail-note {
  position:relative;
  margin:0;
  padding:14px 15px 14px 48px;
  border:1px solid rgba(143,170,184,.2);
  border-radius:17px;
  color:#a8b8c1;
  background:rgba(18,34,44,.54);
  font-size:12px;
  line-height:1.5;
}
.energy-detail-note::before {
  content:"✓";
  position:absolute;
  left:14px;
  top:50%;
  display:grid;
  place-items:center;
  width:23px;
  height:23px;
  border:1px solid #31db84;
  border-radius:50%;
  color:#31db84;
  transform:translateY(-50%);
  font-weight:900;
}
.energy-detail-popover {
  position:fixed;
  right:12px;
  bottom:calc(var(--lm-nav-height,72px) + env(safe-area-inset-bottom) + 18px);
  left:12px;
  z-index:9999;
  max-width:520px;
  margin-inline:auto;
  padding:14px 16px;
  border:1px solid rgba(143,170,184,.24);
  border-radius:18px;
  color:#f5f8fa;
  background:rgba(8,20,28,.94);
  box-shadow:0 18px 48px rgba(0,0,0,.36);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
}
.energy-detail-popover strong { display:block; margin-bottom:5px; }
.energy-detail-popover p { margin:0; color:#a8b8c1; font-size:13px; line-height:1.4; }

@media (max-width:390px) {
  .energy-detail-dialog { inset-inline:7px; }
  .energy-detail-sheet { gap:14px; padding-inline:12px; }
  .energy-detail-row { grid-template-columns:minmax(0,1fr) auto 27px; gap:8px; padding:12px 10px; }
  .energy-detail-copy { grid-template-columns:34px minmax(0,1fr); column-gap:8px; }
  .energy-detail-row-icon { width:34px; height:34px; border-radius:10px; font-size:17px; }
  .energy-detail-copy strong { font-size:14px; }
  .energy-detail-copy small { font-size:11px; }
  .energy-detail-value { font-size:14px; }
}
`;
document.head.append(energyDetailStyle);

const explanations = {
  consumption: ["Consumo", "Valor estimado da energia consumida no ciclo, calculado a partir dos kWh registrados e da tarifa configurada."],
  flag: ["Bandeira tarifária", "Adicional aplicado por kWh conforme a bandeira selecionada para o período. O valor exibido vem da configuração atual do Volt."],
  lighting: ["Taxa de iluminação pública", "Contribuição municipal de iluminação pública configurada no aplicativo. A cobrança real pode variar conforme o município e a fatura."],
  taxes: ["Impostos", "ICMS, PIS e COFINS podem compor a fatura. O Volt não inventa esses valores: quando não há dado confiável, o item fica como não identificado."],
  fine: ["Multa", "Cobrança por atraso ou outra penalidade informada pela concessionária. Só deve entrar no total quando houver valor real identificado."],
  interest: ["Juros", "Juros por atraso ou encargos financeiros da fatura. Só devem ser somados quando houver valor real identificado."]
};

const rowIcons = {
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
      <div class="energy-detail-total"><span>TOTAL ESTIMADO</span><strong id="energy-detail-total">R$ 0,00</strong></div>
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
  const rows = [
    row("consumption", "Consumo", `${formatNumber(consumption, 0)} kWh × ${rateCurrency(Number(settings.rate || 0))}/kWh`, currency(Number(estimate.baseCost || 0))),
    row("flag", "Bandeira tarifária", flagLabel(settings.flag), currency(Number(estimate.flagCost || 0))),
    row("lighting", "Taxa de iluminação pública", "Contribuição configurada", currency(Number(settings.lightingFee || 0))),
    row("taxes", "Impostos", "Não identificado na estimativa atual", "—", true),
    row("fine", "Multa", "Não identificada na estimativa atual", "—", true),
    row("interest", "Juros", "Não identificados na estimativa atual", "—", true)
  ];
  detailDialog.querySelector("#energy-detail-list").replaceChildren(...rows);
  detailDialog.querySelector("#energy-detail-total").textContent = currency(Number(estimate.totalCost || 0));
  const cycleLabel = document.querySelector("#beta-cycle-label")?.textContent?.trim();
  detailDialog.querySelector("#energy-detail-cycle").textContent = cycleLabel && cycleLabel !== "—" ? `Ciclo atual · ${cycleLabel}` : "Ciclo atual";
}

function row(key, title, subtitle, value, muted = false) {
  const item = document.createElement("div");
  item.className = "energy-detail-row";
  item.dataset.detailKey = key;

  const copy = document.createElement("div");
  copy.className = "energy-detail-copy";
  const icon = document.createElement("span");
  icon.className = "energy-detail-row-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = rowIcons[key] || "•";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = subtitle;
  copy.append(icon, strong, small);

  const amount = document.createElement("div");
  amount.className = `energy-detail-value${muted ? " muted" : ""}`;
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

  item.append(copy, amount, info);
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
  return Number(value || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

function rateCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL", minimumFractionDigits:2, maximumFractionDigits:4 });
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits:digits });
}
