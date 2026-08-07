const energyDetailStyle = document.createElement("style");
energyDetailStyle.textContent = `
html[data-environment="beta"] .utility-card.energy { cursor: pointer; }
html[data-environment="beta"] .utility-card.energy:focus-visible { outline: 3px solid var(--lm-accent, #16c784); outline-offset: 4px; }
html[data-environment="beta"] .tariff-info-card { display: none; }
html[data-environment="beta"] .energy-detail-dialog { width: min(calc(100% - 20px), 560px); max-height: min(88dvh, 820px); margin: auto auto max(env(safe-area-inset-bottom), 10px); padding: 0; border: 1px solid var(--lm-glass-border); border-radius: 30px 30px 22px 22px; color: var(--lm-ink); background: color-mix(in srgb, var(--lm-canvas) 78%, transparent); box-shadow: 0 24px 80px rgba(0,0,0,.28); backdrop-filter: blur(28px) saturate(160%); -webkit-backdrop-filter: blur(28px) saturate(160%); }
html[data-environment="beta"] .energy-detail-dialog::backdrop { background: rgba(3,10,14,.48); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
html[data-environment="beta"] .energy-detail-sheet { display: grid; gap: 18px; padding: 22px; }
html[data-environment="beta"] .energy-detail-handle { width: 46px; height: 5px; margin: -6px auto 0; border-radius: 99px; background: color-mix(in srgb, var(--lm-ink) 26%, transparent); }
html[data-environment="beta"] .energy-detail-heading { display:flex; align-items:center; justify-content:space-between; gap:14px; }
html[data-environment="beta"] .energy-detail-title { display:flex; align-items:center; gap:10px; }
html[data-environment="beta"] .energy-detail-title span { display:grid; place-items:center; width:34px; height:34px; border-radius:50%; color:#0c8f62; background:rgba(22,199,132,.13); font-weight:900; }
html[data-environment="beta"] .energy-detail-title h2 { margin:0; font-size:clamp(21px,5vw,28px); }
html[data-environment="beta"] .energy-detail-cycle { margin:-8px 0 0; color:var(--lm-ink-soft); font-size:13px; }
html[data-environment="beta"] .energy-detail-list { display:grid; overflow:hidden; border:1px solid var(--lm-glass-border); border-radius:20px; background:var(--lm-glass-thin); }
html[data-environment="beta"] .energy-detail-row { display:grid; grid-template-columns:minmax(0,1fr) auto 28px; align-items:center; gap:12px; padding:15px 14px; }
html[data-environment="beta"] .energy-detail-row + .energy-detail-row { border-top:1px solid var(--lm-glass-border); }
html[data-environment="beta"] .energy-detail-copy { min-width:0; }
html[data-environment="beta"] .energy-detail-copy strong { display:block; font-size:15px; }
html[data-environment="beta"] .energy-detail-copy small { display:block; margin-top:3px; color:var(--lm-ink-soft); font-size:12px; line-height:1.35; }
html[data-environment="beta"] .energy-detail-value { text-align:right; font-weight:850; white-space:nowrap; }
html[data-environment="beta"] .energy-detail-info { display:grid; place-items:center; width:26px; height:26px; padding:0; border:1px solid color-mix(in srgb, var(--lm-accent, #16c784) 55%, transparent); border-radius:50%; color:var(--lm-accent-ink, #0c8f62); background:transparent; font-weight:900; }
html[data-environment="beta"] .energy-detail-total { display:flex; align-items:end; justify-content:space-between; gap:18px; padding:4px 2px 0; }
html[data-environment="beta"] .energy-detail-total span { color:var(--lm-accent-ink, #0c8f62); font-size:12px; font-weight:850; letter-spacing:.12em; }
html[data-environment="beta"] .energy-detail-total strong { font-size:clamp(28px,7vw,38px); }
html[data-environment="beta"] .energy-detail-note { margin:0; padding:13px 14px; border:1px solid var(--lm-glass-border); border-radius:16px; color:var(--lm-ink-soft); background:var(--lm-glass-thin); font-size:12px; line-height:1.45; }
html[data-environment="beta"] .energy-detail-popover { position:fixed; inset:auto 12px calc(var(--lm-nav-height, 72px) + env(safe-area-inset-bottom) + 18px); z-index:9999; max-width:520px; margin-inline:auto; padding:14px 16px; border:1px solid var(--lm-glass-border); border-radius:18px; color:var(--lm-ink); background:color-mix(in srgb, var(--lm-canvas) 88%, transparent); box-shadow:0 18px 48px rgba(0,0,0,.22); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); }
html[data-environment="beta"] .energy-detail-popover strong { display:block; margin-bottom:5px; }
html[data-environment="beta"] .energy-detail-popover p { margin:0; color:var(--lm-ink-soft); font-size:13px; line-height:1.4; }
@media (max-width:390px) { html[data-environment="beta"] .energy-detail-sheet { padding:18px 14px; } html[data-environment="beta"] .energy-detail-row { grid-template-columns:minmax(0,1fr) auto 26px; padding:13px 11px; gap:8px; } }
`;
document.head.append(energyDetailStyle);

const explanations = {
  consumption: ["Consumo", "Valor estimado da energia consumida no ciclo, calculado a partir dos kWh registrados e da tarifa configurada."],
  flag: ["Bandeira tarifária", "Adicional aplicado por kWh conforme a bandeira selecionada para o período. O valor exibido vem da configuração atual do Volt."],
  lighting: ["Taxa de iluminação pública", "Contribuição municipal de iluminação pública configurada no aplicativo. A cobrança real pode variar conforme o município e a fatura."],
  taxes: ["Impostos", "ICMS, PIS e COFINS podem compor a fatura. O Volt não inventa esses valores: quando não há dado confiável, o item fica como não identificado."],
  fine: ["Multa", "Cobrança por atraso ou outra penalidade informada pela concessionária. Só deve entrar no total quando houver valor real identificado."],
  interest: ["Juros", "Juros por atraso ou encargos financeiros da fatura. Só devem ser somados quando houver valor real identificado."],
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
    row("lighting", "Taxa de iluminação pública", "Valor configurado", currency(Number(settings.lightingFee || 0))),
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
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
