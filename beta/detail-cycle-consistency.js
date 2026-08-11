queueMicrotask(initializeDetailConsistency);

function initializeDetailConsistency() {
  document.addEventListener("pointerdown", handleImmediateClose, true);
  document.addEventListener("touchend", handleImmediateClose, true);
  document.addEventListener("click", handleCardOpen, true);
  window.addEventListener("volt:cycle-context", () => queueMicrotask(syncOpenDetail));
  window.addEventListener("volt:beta-data", () => queueMicrotask(syncOpenDetail));
}

function handleImmediateClose(event) {
  const button = event.target?.closest?.("[data-utility-detail-close]");
  if (!button) return;
  const dialog = button.closest("dialog.energy-detail-dialog");
  if (!dialog?.open) return;
  event.preventDefault();
  event.stopPropagation();
  try { dialog.close(); } catch { dialog.removeAttribute("open"); }
}

function handleCardOpen(event) {
  if (!event.target?.closest?.(".utility-card.energy,.utility-card.water")) return;
  queueMicrotask(syncOpenDetail);
}

function syncOpenDetail() {
  const dialog = document.querySelector("dialog.energy-detail-dialog[open]");
  if (!dialog) return;
  const meter = dialog.dataset.meter === "water" ? "water" : "energy";
  const values = window.VOLT_CYCLE_VALUES?.[meter];
  const cycle = window.VOLT_CYCLE_CONTEXT?.[meter];
  const api = window.VOLT_BETA_API;
  const snapshot = api?.getSnapshot?.();
  if (!values || !snapshot) return;

  const utility = snapshot[meter] || {};
  const settings = utility.settings || {};
  const estimate = values.estimate || {};
  const consumption = Number(values.consumption || 0);

  const cycleLabel = dialog.querySelector("#utility-detail-cycle");
  if (cycleLabel) {
    cycleLabel.textContent = cycle?.label
      ? `Ciclo atual · ${cycle.label}`
      : `Ciclo de ${meter === "energy" ? "energia" : "água"} não configurado`;
  }

  if (meter === "energy") {
    setRow(dialog, "energyConsumption", `${formatNumber(consumption, 0)} kWh × ${currency(Number(settings.rate || 0))}/kWh`, currency(Number(estimate.baseCost || 0)));
    setRowValue(dialog, "flag", currency(Number(estimate.flagCost || 0)));
    setRowValue(dialog, "lighting", currency(Number(settings.lightingFee || 0)));
  } else {
    setRow(dialog, "waterConsumption", `${formatNumber(consumption, 3)} m³ × ${currency(Number(settings.rate || 0))}/m³`, currency(Number(estimate.waterCost || 0)));
    setRowValue(dialog, "sewer", currency(Number(estimate.sewerCost || 0)));
    setRowValue(dialog, "fixedFee", currency(Number(settings.fixedFee || 0)));
  }

  const total = dialog.querySelector("#utility-detail-total");
  if (total) total.textContent = currency(Number(estimate.totalCost || 0));
}

function setRow(dialog, kind, subtitle, value) {
  const row = dialog.querySelector(`.energy-detail-row[data-kind="${kind}"]`);
  if (!row) return;
  const small = row.querySelector(".energy-detail-copy small");
  const amount = row.querySelector(".energy-detail-value");
  if (small) small.textContent = subtitle;
  if (amount) amount.textContent = value;
}

function setRowValue(dialog, kind, value) {
  const amount = dialog.querySelector(`.energy-detail-row[data-kind="${kind}"] .energy-detail-value`);
  if (amount) amount.textContent = value;
}

function currency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value, digits) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}
