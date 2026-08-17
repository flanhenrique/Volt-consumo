import { VOLT_CONFIG } from "../config.js?v=20260813.7";
import { getApplicationStateSnapshot, StartupStatus } from "./app-state.js?v=20260813.7";
import { getBillingWorkflowSnapshot, startBillingWorkflow } from "./billing-workflow.js?v=20260813.7";
import { matchRegulatoryRuleForComponent } from "./regulatory-engine.js?v=20260813.7";

const BUILD = "20260817.2";
const RECONCILIATION_POLICY = Object.freeze({ matchingAmount: 1, smallAmount: 5, smallPercent: 3 });
const COMPONENT_DEFINITIONS = Object.freeze([
  { key: "energyAmount", category: "energy", code: "energy_consumption", label: "Consumo de energia", direction: "charge" },
  { key: "icmsAmount", percentKey: "icmsPercent", category: "tax", code: "icms", label: "ICMS", direction: "charge" },
  { key: "pisAmount", percentKey: "pisPercent", category: "tax", code: "pis", label: "PIS", direction: "charge" },
  { key: "cofinsAmount", percentKey: "cofinsPercent", category: "tax", code: "cofins", label: "COFINS", direction: "charge" },
  { key: "lightingAmount", category: "lighting", code: "public_lighting", label: "Iluminação pública (CIP/COSIP)", direction: "charge" },
  { key: "flagAmount", category: "flag", code: "tariff_flag", label: "Bandeira tarifária", direction: "charge" },
  { key: "socialTariffAmount", category: "benefit", code: "social_tariff", label: "Desconto Tarifa Social", direction: "credit" },
  { key: "lowIncomeSubsidyAmount", category: "benefit", code: "low_income_subsidy", label: "Subvenção Baixa Renda", direction: "credit" },
  { key: "itaipuAmount", category: "benefit", code: "itaipu_bonus", label: "Bônus Itaipu", direction: "credit" },
  { key: "otherDiscountAmount", category: "credit", code: "other_discount", label: "Outros descontos/créditos", direction: "credit" },
  { key: "otherChargeAmount", category: "fee", code: "other_charges", label: "Outros encargos", direction: "charge" }
]);

let observer = null;
let renderQueued = false;
let saving = false;

if (typeof window !== "undefined" && typeof document !== "undefined") boot();

function boot() {
  ensureStyles();
  startBillingWorkflow();
  document.addEventListener("submit", handleDetailSubmit, true);
  document.addEventListener("input", handleDetailInput, true);
  document.addEventListener("change", handleDetailInput, true);
  window.addEventListener("volt:startup-status", (event) => {
    if (event.detail?.status === StartupStatus.READY) queueRender();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-report-tab='energy']")) setTimeout(queueRender, 0);
  }, true);
  observeApplication();
  queueRender();
}

function ensureStyles() {
  if (document.querySelector('link[data-energy-invoice-detail-style="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `./styles/energy-invoice-detail.css?v=${BUILD}`;
  link.dataset.energyInvoiceDetailStyle = "true";
  document.head.append(link);
}

function observeApplication() {
  if (observer || !document.body) return;
  observer = new MutationObserver(() => queueRender());
  reconnectObserver();
}

function reconnectObserver() {
  if (!observer || !document.body) return;
  observer.observe(document.body, { childList: true, subtree: true });
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    observer?.disconnect();
    try {
      if (getApplicationStateSnapshot()?.status !== StartupStatus.READY) return;
      const snapshot = getBillingWorkflowSnapshot();
      enhanceCycleClosing(snapshot);
      renderEnergyInvoiceReport(snapshot);
    } finally {
      reconnectObserver();
    }
  });
}

function enhanceCycleClosing(snapshot) {
  for (const card of document.querySelectorAll(".volt-billing-card[data-service='energy']")) {
    const arrivalCopy = card.querySelector(".volt-billing-question .supporting-copy");
    if (arrivalCopy) arrivalCopy.textContent = "Se a fatura já chegou, informe a composição completa para concluir o ciclo: consumo faturado, tributos, iluminação, bandeira, descontos e total oficial.";
    const awaitingCopy = card.querySelector(".volt-billing-message .supporting-copy");
    if (awaitingCopy?.textContent?.includes("registre o total")) awaitingCopy.textContent = "Quando ela chegar, registre a composição detalhada para fechar o ciclo e conciliar o valor oficial.";
  }

  for (const form of document.querySelectorAll("form[data-bill-total-form]")) {
    const card = form.closest(".volt-billing-card");
    const unit = card ? snapshot.units.find((item) => item.id === card.dataset.unitId) : null;
    if (!card || unit?.service !== "energy") continue;
    const cycle = snapshot.cycles.find((item) => item.id === card.dataset.cycleId);
    if (!cycle) continue;
    form.replaceWith(buildDetailForm({ cycle, unit, bill: null, mode: "create" }));
  }

  for (const card of document.querySelectorAll(".volt-billing-card[data-service='energy']")) {
    if (card.querySelector("[data-energy-bill-detail-form]")) continue;
    const cycleId = card.dataset.cycleId;
    const unit = snapshot.units.find((item) => item.id === card.dataset.unitId);
    const cycle = snapshot.cycles.find((item) => item.id === cycleId);
    const bill = latestBillForCycle(snapshot.bills, cycleId);
    if (!unit || !cycle || !bill) continue;
    const components = snapshot.components.filter((item) => item.bill_id === bill.id);
    if (components.length) continue;
    const form = buildDetailForm({ cycle, unit, bill, mode: "complete" });
    const actions = card.querySelector(".volt-invoice-actions");
    if (actions) actions.before(form);
    else card.append(form);
  }

  for (const actions of document.querySelectorAll(".volt-billing-card[data-service='energy'] .volt-invoice-actions")) {
    const title = actions.querySelector("h3");
    const copy = actions.querySelector(".supporting-copy");
    if (title) title.textContent = "Complemento por foto";
    if (copy) copy.textContent = "Se preferir, use uma foto para complementar ou conferir os dados. A imagem é processada localmente e não é salva pelo VOLT.";
  }
}

function buildDetailForm({ cycle, unit, bill, mode }) {
  const form = document.createElement("form");
  form.className = "volt-energy-detail-form";
  form.dataset.energyBillDetailForm = cycle.id;
  form.dataset.unitId = unit.id;
  form.dataset.mode = mode;
  if (bill?.id) form.dataset.billId = bill.id;

  const heading = document.createElement("div");
  heading.className = "volt-energy-detail-heading";
  heading.innerHTML = `<div><p class="eyebrow">DETALHAMENTO DA FATURA</p><h3>${mode === "complete" ? "Complete a composição da fatura" : "Informe a composição antes de concluir"}</h3><p class="supporting-copy">Registre os valores exatamente como aparecem na conta. Campos que não existirem na sua fatura podem ficar em branco.</p></div><span class="status-pill" data-tone="warning">Obrigatório para fechar completo</span>`;

  const consumption = detailSection("Consumo faturado", [
    field("Consumo faturado (kWh)", "billedConsumption", "number", bill?.billed_consumption, { required: true, step: "0.001", min: "0" }),
    selectField("Método de faturamento", "billingMethod", bill?.billing_method || "metered", [
      ["metered", "Leitura do medidor"], ["average", "Média da concessionária"], ["estimated", "Estimado"], ["adjusted", "Ajustado"], ["not_identified", "Não identificado"]
    ]),
    field("Tarifa unitária (R$/kWh)", "energyRate", "number", "", { step: "0.000001", min: "0" }),
    field("Valor do consumo (R$)", "energyAmount", "number", "", { step: "0.01", min: "0" })
  ]);

  const taxes = detailSection("Tributos", [
    percentMoneyPair("ICMS", "icmsPercent", "icmsAmount"),
    percentMoneyPair("PIS", "pisPercent", "pisAmount"),
    percentMoneyPair("COFINS", "cofinsPercent", "cofinsAmount")
  ], "Informe a alíquota e o valor quando constarem na fatura. O VOLT não calcula imposto sem conhecer a base oficial.");

  const charges = detailSection("Cobranças adicionais", [
    field("Iluminação pública — CIP/COSIP (R$)", "lightingAmount", "number", "", { step: "0.01", min: "0" }),
    field("Bandeira tarifária (R$)", "flagAmount", "number", "", { step: "0.01", min: "0" }),
    field("Outros encargos (R$)", "otherChargeAmount", "number", "", { step: "0.01", min: "0" })
  ]);

  const discounts = detailSection("Descontos e benefícios", [
    field("Desconto Tarifa Social (R$)", "socialTariffAmount", "number", "", { step: "0.01", min: "0" }),
    field("Subvenção Baixa Renda (R$)", "lowIncomeSubsidyAmount", "number", "", { step: "0.01", min: "0" }),
    field("Bônus Itaipu (R$)", "itaipuAmount", "number", "", { step: "0.01", min: "0" }),
    field("Outros descontos/créditos (R$)", "otherDiscountAmount", "number", "", { step: "0.01", min: "0" })
  ], "Informe valores positivos; o VOLT registra esses itens como créditos e os subtrai da composição.");

  const total = detailSection("Fechamento", [
    field("Valor total da fatura (R$)", "invoiceTotal", "number", bill?.invoice_total ?? "", { required: true, step: "0.01", min: "0" })
  ]);

  const summary = document.createElement("div");
  summary.className = "volt-energy-composition";
  summary.dataset.energyComposition = "";

  const actions = document.createElement("div");
  actions.className = "volt-billing-actions";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary-button";
  submit.textContent = mode === "complete" ? "Salvar detalhamento da fatura" : "Concluir ciclo com fatura detalhada";
  const status = document.createElement("p");
  status.className = "status-message";
  status.dataset.energyBillStatus = "";
  actions.append(submit);

  form.append(heading, consumption, taxes, charges, discounts, total, summary, actions, status);
  setTimeout(() => updateCompositionSummary(form), 0);
  return form;
}

function detailSection(titleText, fields, noteText = "") {
  const section = document.createElement("fieldset");
  section.className = "volt-energy-detail-section";
  const legend = document.createElement("legend");
  legend.textContent = titleText;
  section.append(legend);
  if (noteText) {
    const note = document.createElement("p");
    note.className = "supporting-copy";
    note.textContent = noteText;
    section.append(note);
  }
  const grid = document.createElement("div");
  grid.className = "volt-energy-detail-grid";
  fields.forEach((node) => grid.append(node));
  section.append(grid);
  return section;
}

function field(labelText, name, type, value = "", attributes = {}) {
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = labelText;
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.inputMode = type === "number" ? "decimal" : "text";
  if (value !== null && value !== undefined && value !== "") input.value = String(value);
  for (const [key, item] of Object.entries(attributes)) {
    if (key === "required") input.required = Boolean(item);
    else input.setAttribute(key, String(item));
  }
  label.append(caption, input);
  return label;
}

function selectField(labelText, name, value, options) {
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = labelText;
  const select = document.createElement("select");
  select.name = name;
  for (const [optionValue, optionLabel] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.append(option);
  }
  label.append(caption, select);
  return label;
}

function percentMoneyPair(labelText, percentName, amountName) {
  const wrap = document.createElement("div");
  wrap.className = "volt-energy-percent-pair";
  wrap.append(
    field(`${labelText} (%)`, percentName, "number", "", { step: "0.0001", min: "0" }),
    field(`${labelText} (R$)`, amountName, "number", "", { step: "0.01", min: "0" })
  );
  return wrap;
}

function handleDetailInput(event) {
  const form = event.target.closest?.("[data-energy-bill-detail-form]");
  if (!form) return;
  if (event.target.name === "energyAmount" && event.isTrusted) {
    event.target.dataset.manual = String(event.target.value.trim() !== "");
    delete event.target.dataset.derived;
  }
  if (["billedConsumption", "energyRate"].includes(event.target.name)) deriveEnergyAmount(form);
  updateCompositionSummary(form);
}

function deriveEnergyAmount(form) {
  const amount = form.elements.namedItem("energyAmount");
  if (!amount || amount.dataset.manual === "true") return;
  const consumption = formNumber(form, "billedConsumption");
  const rate = formNumber(form, "energyRate");
  if (consumption == null || rate == null) return;
  amount.value = roundMoney(consumption * rate).toFixed(2);
  amount.dataset.derived = "true";
}

function updateCompositionSummary(form) {
  const summary = form.querySelector("[data-energy-composition]");
  if (!summary) return;
  const detail = readDetailForm(form);
  const components = buildComponents(detail);
  const explained = componentNetTotal(components);
  const total = detail.invoiceTotal;
  const difference = total == null ? null : roundMoney(total - explained);
  const charges = roundMoney(components.filter((item) => item.direction === "charge" && item.amount != null).reduce((sum, item) => sum + item.amount, 0));
  const credits = roundMoney(components.filter((item) => item.direction === "credit" && item.amount != null).reduce((sum, item) => sum + item.amount, 0));
  summary.replaceChildren(
    compositionMetric("Cobranças informadas", currency(charges)),
    compositionMetric("Descontos/créditos", credits ? `− ${currency(credits)}` : currency(0)),
    compositionMetric("Composição líquida", currency(explained)),
    compositionMetric("Diferença para o total", difference == null ? "—" : signedCurrency(difference))
  );
  summary.dataset.tone = difference == null || Math.abs(difference) <= 1 ? "success" : Math.abs(difference) <= 5 ? "warning" : "danger";
}

function compositionMetric(label, value) {
  const node = document.createElement("div");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  node.append(small, strong);
  return node;
}

async function handleDetailSubmit(event) {
  const form = event.target.closest?.("[data-energy-bill-detail-form]");
  if (!form) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (saving) return;

  const detail = readDetailForm(form);
  const status = form.querySelector("[data-energy-bill-status]");
  if (detail.billedConsumption == null || detail.billedConsumption < 0) {
    setStatus(status, "Informe o consumo faturado em kWh.", true);
    return;
  }
  if (detail.invoiceTotal == null || detail.invoiceTotal < 0) {
    setStatus(status, "Informe o valor total da fatura.", true);
    return;
  }

  saving = true;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  setStatus(status, "Salvando o detalhamento e conciliando a fatura…");
  try {
    const snapshot = getBillingWorkflowSnapshot();
    const cycle = snapshot.cycles.find((item) => item.id === form.dataset.energyBillDetailForm);
    const unit = snapshot.units.find((item) => item.id === form.dataset.unitId);
    if (!cycle || unit?.service !== "energy") throw new Error("energy_cycle_not_found");
    await saveDetailedInvoice({ snapshot, cycle, unit, existingBillId: form.dataset.billId || null, detail });
    setStatus(status, "Fatura detalhada salva.");
    requestBillingRefresh();
  } catch (error) {
    console.warn("VOLT detailed energy invoice failed", error instanceof Error ? error.message : "unknown_error");
    setStatus(status, "Não foi possível salvar o detalhamento da fatura.", true);
  } finally {
    saving = false;
    if (submit) submit.disabled = false;
  }
}

function readDetailForm(form) {
  const detail = {
    billedConsumption: formNumber(form, "billedConsumption"),
    billingMethod: String(form.elements.namedItem("billingMethod")?.value || "not_identified"),
    energyRate: formNumber(form, "energyRate"),
    invoiceTotal: formNumber(form, "invoiceTotal")
  };
  for (const definition of COMPONENT_DEFINITIONS) {
    detail[definition.key] = formNumber(form, definition.key);
    if (definition.percentKey) detail[definition.percentKey] = formNumber(form, definition.percentKey);
  }
  return detail;
}

function formNumber(form, name) {
  const value = form.elements.namedItem(name)?.value;
  if (value == null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildComponents(detail) {
  const components = [];
  for (const definition of COMPONENT_DEFINITIONS) {
    let amount = detail[definition.key];
    let sourceType = "user_informed";
    let confidence = "confirmed";
    if (definition.code === "energy_consumption" && amount == null && detail.billedConsumption != null && detail.energyRate != null) {
      amount = roundMoney(detail.billedConsumption * detail.energyRate);
      sourceType = "volt_calculated";
      confidence = "probable";
    }
    const percentage = definition.percentKey ? detail[definition.percentKey] : null;
    const hasEvidence = amount != null || percentage != null || definition.code === "energy_consumption" && (detail.billedConsumption != null || detail.energyRate != null);
    if (!hasEvidence) continue;
    components.push({
      ...definition,
      amount: amount == null ? null : Math.abs(roundMoney(amount)),
      percentage,
      quantity: definition.code === "energy_consumption" ? detail.billedConsumption : null,
      quantityUnit: definition.code === "energy_consumption" ? "kWh" : null,
      unitRate: definition.code === "energy_consumption" ? detail.energyRate : null,
      sourceType,
      confidence: amount == null ? "probable" : confidence
    });
  }
  return components;
}

async function saveDetailedInvoice({ snapshot, cycle, unit, existingBillId, detail }) {
  const estimate = latestForCycle(snapshot.estimates, cycle.id);
  const existingBill = existingBillId ? snapshot.bills.find((item) => item.id === existingBillId) : null;
  let bill = existingBill;

  const billPayload = {
    billing_method: allowedBillingMethod(detail.billingMethod),
    measured_consumption: existingBill?.measured_consumption ?? estimate?.estimated_consumption ?? null,
    billed_consumption: detail.billedConsumption,
    estimated_total: existingBill?.estimated_total ?? estimate?.estimated_total ?? null,
    invoice_total: roundMoney(detail.invoiceTotal),
    currency: "BRL",
    source_type: "user_informed",
    confidence: "confirmed",
    status: "validated",
    input_method: "manual_detail",
    extraction_status: "validated",
    extraction_metadata: { source: "manual_detail", validated_at: new Date().toISOString(), raw_document_retained: false },
    raw_document_retained: false,
    updated_at: new Date().toISOString()
  };

  if (existingBill) {
    const rows = await patch("bills", existingBill.id, billPayload);
    bill = rows[0] || { ...existingBill, ...billPayload };
  } else {
    const previousBills = snapshot.bills.filter((item) => item.billing_cycle_id === cycle.id).sort((a, b) => Number(b.revision) - Number(a.revision));
    const previous = previousBills[0] || null;
    const rows = await insert("bills", {
      organization_id: unit.organization_id,
      consumer_unit_id: unit.id,
      billing_cycle_id: cycle.id,
      revision: previous ? Number(previous.revision) + 1 : 1,
      supersedes_bill_id: previous?.id || null,
      received_at: new Date().toISOString(),
      ...billPayload
    });
    bill = rows[0];
  }
  if (!bill) throw new Error("bill_not_saved");

  const components = buildComponents(detail);
  const componentRows = components.map((component, index) => ({
    organization_id: bill.organization_id,
    bill_id: bill.id,
    position: index + 1,
    category: component.category,
    code: component.code,
    label: component.label,
    direction: component.direction,
    quantity: component.quantity,
    quantity_unit: component.quantityUnit,
    unit_rate: component.unitRate,
    percentage: component.percentage,
    amount: component.amount,
    source_type: component.sourceType,
    confidence: component.confidence,
    evidence_text: "Detalhamento informado pelo usuário no fechamento do ciclo"
  }));
  const inserted = componentRows.length ? await insert("bill_components", componentRows) : [];
  await linkManualRegulatoryEvidence(snapshot, unit, bill, inserted);

  await patch("billing_cycles", cycle.id, {
    status: "billed",
    bill_arrival_state: "arrived",
    bill_arrival_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  await persistManualReconciliation(snapshot, bill, inserted, estimate?.estimated_total ?? null);
}

async function linkManualRegulatoryEvidence(snapshot, unit, bill, components) {
  const profiledCodes = new Set();
  for (const component of components) {
    const rule = matchRegulatoryRuleForComponent(snapshot.rules, component);
    if (!rule) continue;
    const existingApplication = snapshot.ruleApplications.find((item) =>
      item.bill_id === bill.id && item.regulatory_rule_id === rule.id && item.bill_component_id === component.id
    );
    if (!existingApplication) {
      await insert("rule_applications", {
        organization_id: bill.organization_id,
        regulatory_rule_id: rule.id,
        consumer_unit_id: unit.id,
        billing_cycle_id: bill.billing_cycle_id,
        bill_id: bill.id,
        bill_component_id: component.id,
        engine_stage: "billing",
        outcome: component.amount == null ? "possible" : "confirmed",
        effect_amount: component.amount == null ? null : component.direction === "credit" ? -Number(component.amount) : Number(component.amount),
        source_type: "user_informed",
        confidence: component.amount == null ? "probable" : "confirmed",
        explanation: "Regra ligada ao item informado manualmente no detalhamento da fatura."
      });
    }
    const existingProfile = snapshot.profiles
      .filter((item) => item.consumer_unit_id === unit.id && item.rule_code === rule.code)
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0] || null;
    if ((!existingProfile || existingProfile.state !== "confirmed_on_bill") && !profiledCodes.has(rule.code)) {
      await insert("regulatory_profiles", {
        organization_id: bill.organization_id,
        consumer_unit_id: unit.id,
        rule_code: rule.code,
        regulatory_rule_id: rule.id,
        state: "confirmed_on_bill",
        source_type: "user_informed",
        confidence: component.amount == null ? "probable" : "confirmed",
        evidence_bill_id: bill.id,
        details: { evidence_component_id: component.id, amount_confirmed: component.amount != null, input_method: "manual_detail" }
      });
      profiledCodes.add(rule.code);
    }
  }
}

async function persistManualReconciliation(snapshot, bill, components, estimateTotal) {
  const knownComponents = components.filter((item) => item.amount != null);
  const missingAmounts = components.filter((item) => item.amount == null).length;
  const componentTotal = componentNetTotal(knownComponents);
  const hasComponents = components.length > 0;
  const comparisonTotal = hasComponents ? Math.max(0, componentTotal) : finiteOrNull(estimateTotal);
  if (comparisonTotal == null) return;

  const invoiceTotal = Number(bill.invoice_total);
  const difference = roundMoney(invoiceTotal - comparisonTotal);
  const percent = invoiceTotal === 0 ? null : roundMoney(Math.abs(difference) / Math.abs(invoiceTotal) * 100);
  const classification = classifyDifference(difference, percent);
  const status = missingAmounts > 0
    ? "partially_reconciled"
    : classification === "matching" ? "reconciled" : classification === "small_difference" ? "partially_reconciled" : "not_reconciled";
  const measuredMinusBilled = bill.measured_consumption == null || bill.billed_consumption == null
    ? null
    : roundMoney(Number(bill.measured_consumption) - Number(bill.billed_consumption));
  const nextAction = missingAmounts > 0
    ? "Informe o valor dos itens que ainda têm apenas percentual ou identificação."
    : classification === "relevant_difference" ? "Revise o detalhamento: a composição informada não fecha com o total oficial da fatura." : null;
  const payload = {
    organization_id: bill.organization_id,
    bill_id: bill.id,
    calculated_total: Math.max(0, roundMoney(comparisonTotal)),
    invoice_total: invoiceTotal,
    difference_amount: difference,
    difference_percent: percent,
    measured_minus_billed: measuredMinusBilled,
    classification,
    status,
    engine_version: "reconciliation-manual-detail-v1",
    diagnostics: { basis: hasComponents ? "manual_bill_components" : "estimate_comparison", missing_component_amounts: missingAmounts },
    policy: {
      matching_amount_brl: RECONCILIATION_POLICY.matchingAmount,
      small_difference_amount_brl: RECONCILIATION_POLICY.smallAmount,
      small_difference_percent: RECONCILIATION_POLICY.smallPercent
    },
    next_action: nextAction,
    source_type: "volt_calculated",
    confidence: hasComponents && missingAmounts === 0 ? "confirmed" : "probable",
    updated_at: new Date().toISOString()
  };
  const existing = snapshot.reconciliations.find((item) => item.bill_id === bill.id);
  if (existing) await patch("reconciliations", existing.id, payload);
  else await insert("reconciliations", payload);
}

function requestBillingRefresh() {
  window.dispatchEvent(new CustomEvent("volt:startup-status", { detail: { status: StartupStatus.READY, reason: "energy_invoice_detail_saved" } }));
  setTimeout(queueRender, 250);
}

function renderEnergyInvoiceReport(snapshot) {
  const panel = document.querySelector('[data-report-panel="energy"]');
  if (!panel) return;
  let host = panel.querySelector('[data-volt-energy-invoice-detail-report="true"]');
  if (!host) {
    host = document.createElement("section");
    host.className = "volt-energy-invoice-report card glass-level-3";
    host.dataset.voltEnergyInvoiceDetailReport = "true";
    panel.append(host);
  }

  const energyUnitIds = new Set(snapshot.units.filter((unit) => unit.service === "energy").map((unit) => unit.id));
  const rows = filterRowsBySelectedPeriod(latestBillsPerCycle(snapshot.bills)
    .filter((bill) => energyUnitIds.has(bill.consumer_unit_id))
    .map((bill) => ({
      bill,
      cycle: snapshot.cycles.find((cycle) => cycle.id === bill.billing_cycle_id),
      components: snapshot.components.filter((component) => component.bill_id === bill.id),
      reconciliation: snapshot.reconciliations.find((item) => item.bill_id === bill.id) || null
    }))
    .filter((item) => item.cycle)
    .sort((left, right) => right.cycle.cycle_end.localeCompare(left.cycle.cycle_end)));

  host.replaceChildren(reportHeading());
  if (!rows.length) {
    host.append(reportMessage("Nenhuma fatura de energia registrada", "Quando um ciclo for concluído com a fatura, o detalhamento financeiro aparecerá aqui."));
    return;
  }
  for (const row of rows) host.append(invoiceReportCard(row));
}

function filterRowsBySelectedPeriod(rows) {
  const period = document.querySelector("[data-report-period]")?.value || "6m";
  if (period === "all") return rows;
  if (period === "cycle") return rows.slice(0, 1);
  const months = period === "3m" ? 3 : 6;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return rows.filter((item) => item.cycle.cycle_end >= cutoffKey);
}

function reportHeading() {
  const header = document.createElement("div");
  header.className = "volt-energy-report-heading";
  header.innerHTML = '<div><p class="eyebrow">FATURA DETALHADA</p><h2>Composição financeira da energia</h2><p class="supporting-copy">Consumo, tributos, iluminação pública, bandeira, descontos e participação de cada item no total da fatura.</p></div>';
  return header;
}

function invoiceReportCard({ bill, cycle, components, reconciliation }) {
  const article = document.createElement("article");
  article.className = "volt-energy-invoice-report-row";
  const head = document.createElement("header");
  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = formatCycle(cycle);
  const small = document.createElement("small");
  small.textContent = bill.billing_method === "average" ? "Faturamento por média" : bill.billing_method === "metered" ? "Leitura do medidor" : "Critério da concessionária";
  copy.append(strong, small);
  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.dataset.tone = reconciliation?.classification === "relevant_difference" ? "danger" : reconciliation?.classification === "small_difference" ? "warning" : "success";
  badge.textContent = reconciliation?.status === "reconciled" ? "Conciliada" : components.length ? "Detalhada" : "Detalhamento pendente";
  head.append(copy, badge);
  article.append(head);

  if (!components.length) {
    article.append(reportMessage("Fatura registrada apenas com o total", "Complete o detalhamento no card do ciclo em Consumo para separar valor de energia, impostos, iluminação, descontos e demais itens."));
    article.append(reportTotals(bill, components));
    return article;
  }

  const metrics = document.createElement("div");
  metrics.className = "volt-energy-report-metrics";
  const energy = components.find((item) => item.category === "energy" || item.code === "energy_consumption");
  const taxes = sumCategory(components, "tax");
  const lighting = sumCategory(components, "lighting");
  const discounts = sumDirections(components, "credit");
  metrics.append(
    reportMetric("Consumo faturado", bill.billed_consumption == null ? "—" : `${formatNumber(bill.billed_consumption, 3)} kWh`),
    reportMetric("Valor do consumo", energy?.amount == null ? "—" : currency(energy.amount)),
    reportMetric("Impostos", currency(taxes)),
    reportMetric("Iluminação pública", currency(lighting)),
    reportMetric("Descontos/créditos", discounts ? `− ${currency(discounts)}` : currency(0)),
    reportMetric("Total da fatura", currency(bill.invoice_total))
  );
  article.append(metrics);

  const list = document.createElement("ul");
  list.className = "volt-energy-component-list";
  for (const component of [...components].sort((a, b) => Number(a.position) - Number(b.position))) {
    list.append(componentReportRow(component, bill.invoice_total));
  }
  article.append(list, reportTotals(bill, components));
  return article;
}

function componentReportRow(component, invoiceTotal) {
  const item = document.createElement("li");
  const main = document.createElement("div");
  const label = document.createElement("strong");
  label.textContent = component.label || component.code;
  const meta = document.createElement("small");
  const details = [];
  if (component.quantity != null) details.push(`${formatNumber(component.quantity, component.quantity_unit === "kWh" ? 3 : 2)} ${component.quantity_unit || ""}`.trim());
  if (component.unit_rate != null) details.push(`R$ ${formatRate(component.unit_rate, 6)}/kWh`);
  if (component.percentage != null) details.push(`Alíquota ${formatNumber(component.percentage, 4)}%`);
  if (component.amount != null && Number(invoiceTotal) > 0) details.push(`${formatNumber(Number(component.amount) / Number(invoiceTotal) * 100, 1)}% da fatura`);
  meta.textContent = details.length ? details.join(" · ") : categoryLabel(component.category);
  main.append(label, meta);
  const amount = document.createElement("strong");
  amount.className = component.direction === "credit" ? "is-credit" : "";
  amount.textContent = component.amount == null ? "Valor não informado" : component.direction === "credit" ? `− ${currency(component.amount)}` : currency(component.amount);
  item.append(main, amount);
  return item;
}

function reportTotals(bill, components) {
  const wrap = document.createElement("div");
  wrap.className = "volt-energy-report-totals";
  const charges = sumDirections(components, "charge");
  const credits = sumDirections(components, "credit");
  const net = componentNetTotal(components);
  const difference = roundMoney(Number(bill.invoice_total || 0) - net);
  wrap.append(
    reportMetric("Cobranças", currency(charges)),
    reportMetric("Créditos", credits ? `− ${currency(credits)}` : currency(0)),
    reportMetric("Composição líquida", currency(net)),
    reportMetric("Não detalhado", signedCurrency(difference))
  );
  return wrap;
}

function reportMetric(label, value) {
  const node = document.createElement("div");
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  node.append(small, strong);
  return node;
}

function reportMessage(titleText, bodyText) {
  const box = document.createElement("div");
  box.className = "volt-energy-report-message";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const body = document.createElement("p");
  body.className = "supporting-copy";
  body.textContent = bodyText;
  box.append(title, body);
  return box;
}

function latestBillForCycle(bills, cycleId) {
  return bills.filter((item) => item.billing_cycle_id === cycleId).sort((a, b) => Number(b.revision || 1) - Number(a.revision || 1))[0] || null;
}

function latestBillsPerCycle(bills) {
  const map = new Map();
  for (const bill of bills) {
    const current = map.get(bill.billing_cycle_id);
    if (!current || Number(bill.revision || 1) > Number(current.revision || 1)) map.set(bill.billing_cycle_id, bill);
  }
  return [...map.values()];
}

function latestForCycle(items, cycleId) {
  return items.filter((item) => item.billing_cycle_id === cycleId).sort((a, b) => Number(b.revision || 1) - Number(a.revision || 1))[0] || null;
}

function componentNetTotal(components) {
  return roundMoney(components.reduce((total, item) => {
    if (item.amount == null) return total;
    const amount = Math.abs(Number(item.amount));
    if (!Number.isFinite(amount)) return total;
    if (item.direction === "credit") return total - amount;
    if (item.direction === "charge") return total + amount;
    return total;
  }, 0));
}

function sumCategory(components, category) {
  return roundMoney(components.filter((item) => item.category === category && item.amount != null).reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0));
}

function sumDirections(components, direction) {
  return roundMoney(components.filter((item) => item.direction === direction && item.amount != null).reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0));
}

function classifyDifference(difference, percent) {
  const absolute = Math.abs(Number(difference) || 0);
  if (absolute <= RECONCILIATION_POLICY.matchingAmount) return "matching";
  if (absolute <= RECONCILIATION_POLICY.smallAmount || percent != null && percent <= RECONCILIATION_POLICY.smallPercent) return "small_difference";
  return "relevant_difference";
}

function allowedBillingMethod(value) {
  return ["metered", "average", "estimated", "adjusted"].includes(value) ? value : "not_identified";
}

function categoryLabel(category) {
  const labels = { energy: "Energia", tax: "Tributo", lighting: "Iluminação pública", flag: "Bandeira tarifária", benefit: "Benefício", credit: "Crédito", fee: "Encargo" };
  return labels[category] || "Item da fatura";
}

function setStatus(node, message, error = false) {
  if (!node) return;
  node.textContent = message;
  node.dataset.error = String(Boolean(error));
}

function ensureAuth() {
  const token = getApplicationStateSnapshot()?.session?.access_token;
  if (!token) throw new Error("session_required");
  return token;
}

async function insert(table, body) {
  return request(table, { method: "POST", body, prefer: "return=representation" });
}

async function patch(table, id, body) {
  return request(table, { method: "PATCH", query: { id: `eq.${id}` }, body, prefer: "return=representation" });
}

async function request(table, { method = "GET", query = {}, body, prefer } = {}) {
  const token = ensureAuth();
  const url = new URL(`/rest/v1/${table}`, VOLT_CONFIG.url);
  for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
  const headers = { apikey: VOLT_CONFIG.publishableKey, Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${table}_${method}_${response.status}${detail ? `:${detail.slice(0, 160)}` : ""}`);
  }
  if (response.status === 204) return [];
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : data ? [data] : [];
}

function formatCycle(cycle) {
  return `${formatDate(cycle.cycle_start)} – ${formatDate(cycle.cycle_end)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : String(value);
}

function formatRate(value, decimals = 6) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function signedCurrency(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) < 0.005) return currency(0);
  return number < 0 ? `− ${currency(Math.abs(number))}` : `+ ${currency(number)}`;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function finiteOrNull(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? null : number;
}
