import { VOLT_CONFIG } from "../config.js?v=20260813.7";
import { getApplicationStateSnapshot, StartupStatus } from "./app-state.js?v=20260813.7";
import { getCycleContext } from "./cycles.js?v=20260813.7";
import { calculateWaterEstimate } from "../packages/consumption-domain/browser/index.js?v=20260813.7";
import { forecastEnergyBill } from "../packages/consumption-domain/browser/billing-engine.js?v=20260813.7";
import { buildEnergyBillingRules, matchRegulatoryRuleForComponent, regulatoryProfileLabel } from "./regulatory-engine.js?v=20260813.7";
import { analyzeInvoiceImage } from "./invoice-ocr.js?v=20260813.7";
import { downloadExecutivePdf } from "./executive-pdf.js?v=20260813.7";

const RECONCILIATION_POLICY = Object.freeze({ matchingAmount: 1, smallAmount: 5, smallPercent: 3 });
const CACHE_VERSION = "billing-workflow-v1";

let started = false;
let refreshTimer = null;
let refreshing = false;
let pendingRefresh = false;
let pendingExtraction = null;
let cache = emptyCache();

function emptyCache() {
  return {
    version: CACHE_VERSION,
    units: [], cycles: [], readings: [], bills: [], components: [], reconciliations: [],
    estimates: [], rules: [], profiles: [], ruleApplications: [], extractions: []
  };
}

export function startBillingWorkflow() {
  if (started) return;
  started = true;
  ensureStyleSheet();
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  window.addEventListener("volt:startup-status", (event) => {
    if (event.detail?.status === StartupStatus.READY) queueRefresh();
  });
  if (document.documentElement.dataset.startupStatus === StartupStatus.READY) queueRefresh();
}

function ensureStyleSheet() {
  if (document.querySelector('link[data-volt-billing-style="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "./styles/billing-workflow.css?v=20260813.7";
  link.dataset.voltBillingStyle = "true";
  document.head.append(link);
}

function queueRefresh(delay = 40) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshDomain(), delay);
}

async function refreshDomain() {
  const state = getApplicationStateSnapshot();
  if (state.status !== StartupStatus.READY || !state.session?.access_token) return;
  if (refreshing) {
    pendingRefresh = true;
    return;
  }
  refreshing = true;
  try {
    let domain = await loadDomain();
    const cyclesChanged = await ensureOperationalCycles(domain.units, domain.cycles);
    if (cyclesChanged) domain.cycles = await list("billing_cycles", { order: "cycle_end.desc" });
    const estimatesChanged = await ensureClosedCycleEstimates(domain, state);
    if (estimatesChanged) domain.estimates = await list("bill_estimates", { order: "created_at.desc" });
    cache = domain;
    renderWorkflow(state);
  } catch (error) {
    console.warn("VOLT billing workflow unavailable", error instanceof Error ? error.message : "unknown_error");
    renderWorkflowError();
  } finally {
    refreshing = false;
    if (pendingRefresh) {
      pendingRefresh = false;
      queueRefresh(120);
    }
  }
}

async function loadDomain() {
  const [units, cycles, readings, bills, components, reconciliations, estimates, rules, profiles, ruleApplications, extractions] = await Promise.all([
    list("consumer_units", { status: "eq.active", order: "service.asc,created_at.asc" }),
    list("billing_cycles", { order: "cycle_end.desc" }),
    list("unit_meter_readings", { order: "measured_at.asc" }),
    list("bills", { order: "created_at.desc" }),
    list("bill_components", { order: "position.asc" }),
    list("reconciliations", { order: "created_at.desc" }),
    list("bill_estimates", { order: "created_at.desc" }),
    list("regulatory_rules", { status: "eq.published", order: "priority.asc,version.desc" }),
    list("regulatory_profiles", { order: "created_at.desc" }),
    list("rule_applications", { order: "created_at.desc" }),
    list("bill_extractions", { order: "processed_at.desc" })
  ]);
  return { version: CACHE_VERSION, units, cycles, readings, bills, components, reconciliations, estimates, rules, profiles, ruleApplications, extractions };
}

async function ensureOperationalCycles(units, cycles) {
  let changed = false;
  const today = localDateKey(new Date());
  for (const unit of units) {
    const start = Number(unit.cycle_start_day);
    const end = Number(unit.cycle_end_day);
    if (!Number.isInteger(start) || start < 1 || start > 31 || !Number.isInteger(end) || end < 1 || end > 31) continue;
    const context = getCycleContext({ start, end });
    const desired = [
      { range: context.previous, status: "awaiting_bill" },
      { range: context.current, status: "open" }
    ];
    for (const item of desired) {
      const cycleStart = localDateKey(item.range.start);
      const cycleEnd = localDateKey(item.range.end);
      const existing = cycles.find((cycle) => cycle.consumer_unit_id === unit.id && cycle.cycle_start === cycleStart && cycle.cycle_end === cycleEnd);
      if (!existing) {
        try {
          const rows = await insert("billing_cycles", {
            organization_id: unit.organization_id,
            consumer_unit_id: unit.id,
            cycle_start: cycleStart,
            cycle_end: cycleEnd,
            status: item.status,
            source_type: "user_informed",
            confidence: unit.cycle_preference_confidence === "confirmed" ? "confirmed" : "probable",
            bill_arrival_state: "not_asked"
          });
          if (rows[0]) cycles.push(rows[0]);
          changed = true;
        } catch (error) {
          if (!String(error?.message || "").includes("409")) throw error;
        }
      }
    }
  }

  for (const cycle of cycles) {
    if (cycle.cycle_end >= today) continue;
    if (!["open", "closed"].includes(cycle.status)) continue;
    await patch("billing_cycles", cycle.id, { status: "awaiting_bill", updated_at: new Date().toISOString() });
    cycle.status = "awaiting_bill";
    changed = true;
  }
  return changed;
}

async function ensureClosedCycleEstimates(domain, state) {
  let changed = false;
  for (const cycle of domain.cycles) {
    if (!["closed", "awaiting_bill"].includes(cycle.status)) continue;
    if (domain.bills.some((bill) => bill.billing_cycle_id === cycle.id)) continue;
    if (domain.estimates.some((estimate) => estimate.billing_cycle_id === cycle.id)) continue;
    const unit = domain.units.find((candidate) => candidate.id === cycle.consumer_unit_id);
    if (!unit || unit.created_by !== state.user?.id) continue;
    const ownedSameService = domain.units.filter((candidate) => candidate.created_by === state.user?.id && candidate.service === unit.service);
    if (ownedSameService.length !== 1) continue;
    const measured = measuredConsumptionForCycle(domain.readings, unit.id, cycle);
    if (measured == null) continue;

    const estimate = calculateEstimate(unit, cycle, measured, domain, state);
    if (!estimate || estimate.total == null) continue;
    await insert("bill_estimates", {
      organization_id: unit.organization_id,
      consumer_unit_id: unit.id,
      billing_cycle_id: cycle.id,
      revision: 1,
      estimated_consumption: measured,
      estimated_total: roundMoney(estimate.total),
      currency: "BRL",
      engine_version: estimate.engine,
      inputs: estimate.inputs,
      output: estimate.output,
      source_type: "volt_calculated",
      confidence: estimate.confidence
    });
    changed = true;
  }
  return changed;
}

function calculateEstimate(unit, cycle, measured, domain, state) {
  if (unit.service === "water") {
    const settings = state.settings?.water;
    if (!settings) return null;
    const result = calculateWaterEstimate(measured, settings);
    return {
      total: result.totalCost,
      engine: "water-billing-v1",
      confidence: "probable",
      inputs: { measuredConsumptionM3: measured, rate: settings.rate, sewerPercent: settings.sewerPercent, fixedFee: settings.fixedFee },
      output: { ...result, note: "Estimativa fechada com as preferências de água disponíveis no encerramento do ciclo." }
    };
  }

  const settings = state.settings?.energy;
  if (!settings) return null;
  const regulatory = buildEnergyBillingRules({ rules: domain.rules, profiles: domain.profiles, unit, cycle });
  const flagRate = settings.flag === "green" ? 0 : finiteOrNull(regulatory.flagRates?.[settings.flag]);
  const result = forecastEnergyBill(measured, regulatory, {
    fallbackRate: settings.rate,
    flagRate: flagRate ?? 0,
    flagLabel: flagLabel(settings.flag),
    lightingFee: settings.lightingFee
  });
  return {
    total: result.totalCost,
    engine: result.engine,
    confidence: "probable",
    inputs: {
      measuredConsumptionKwh: measured,
      fallbackRate: settings.rate,
      flag: settings.flag,
      flagRate,
      flagRateSource: flagRate == null ? "not_identified" : "regulatory_rule",
      lightingFee: settings.lightingFee,
      regulatoryRules: regulatory.applied
    },
    output: { ...result, note: flagRate == null ? "Estimativa congelada no fechamento; taxa de bandeira não identificada e não cobrada." : "Estimativa congelada no fechamento; itens não identificados não são inventados." }
  };
}

function measuredConsumptionForCycle(readings, unitId, cycle) {
  const relevant = readings
    .filter((reading) => reading.consumer_unit_id === unitId)
    .sort((left, right) => Date.parse(left.measured_at) - Date.parse(right.measured_at));
  const start = new Date(`${cycle.cycle_start}T00:00:00`).getTime();
  const end = new Date(`${cycle.cycle_end}T23:59:59.999`).getTime();
  const base = relevant.filter((reading) => Date.parse(reading.measured_at) <= start).at(-1);
  const latest = relevant.filter((reading) => Date.parse(reading.measured_at) <= end).at(-1);
  if (!base || !latest || Date.parse(latest.measured_at) <= Date.parse(base.measured_at)) return null;
  const delta = Number(latest.value) - Number(base.value);
  return Number.isFinite(delta) && delta >= 0 ? delta : null;
}

function renderWorkflow(state) {
  const consumptionHost = ensureConsumptionHost();
  if (consumptionHost) {
    const service = state.view?.consumptionType === "water" ? "water" : "energy";
    const units = cache.units.filter((unit) => unit.service === service);
    consumptionHost.replaceChildren(...units.map((unit) => buildBillingCard(unit)).filter(Boolean));
    consumptionHost.hidden = units.length === 0;
  }
  renderFinancialReports();
  if (cache.bills.length) document.getElementById("energy-bill-legal-detail")?.remove();
}

function renderWorkflowError() {
  const host = ensureConsumptionHost();
  if (!host) return;
  const card = document.createElement("article");
  card.className = "volt-billing-card card glass-level-2";
  const title = document.createElement("strong");
  title.textContent = "Faturamento temporariamente indisponível";
  const body = document.createElement("p");
  body.className = "supporting-copy";
  body.textContent = "Leituras e consumo continuam disponíveis. Tente novamente ao abrir esta tela.";
  card.append(title, body);
  host.replaceChildren(card);
}

function ensureConsumptionHost() {
  const page = document.getElementById("page-consumption");
  if (!page) return null;
  let host = document.getElementById("volt-billing-workflow");
  if (!host) {
    host = document.createElement("section");
    host.id = "volt-billing-workflow";
    host.className = "volt-billing-stack";
    host.setAttribute("aria-label", "Faturamento e conciliação por ciclo");
    const analytics = page.querySelector(".analytics-grid");
    if (analytics) analytics.after(host);
    else page.append(host);
  }
  return host;
}

function buildBillingCard(unit) {
  const cycles = cache.cycles.filter((cycle) => cycle.consumer_unit_id === unit.id).sort((a, b) => b.cycle_end.localeCompare(a.cycle_end));
  const cycle = cycles.find((item) => item.status === "awaiting_bill") || cycles.find((item) => ["billed", "reconciled"].includes(item.status)) || cycles[0];
  if (!cycle) return null;
  const bills = cache.bills.filter((bill) => bill.billing_cycle_id === cycle.id).sort((a, b) => Number(b.revision) - Number(a.revision));
  const bill = bills[0] || null;
  const estimate = latestForCycle(cache.estimates, cycle.id);
  const reconciliation = bill ? cache.reconciliations.find((item) => item.bill_id === bill.id) || null : null;
  const components = bill ? cache.components.filter((item) => item.bill_id === bill.id) : [];

  const card = document.createElement("article");
  card.className = "volt-billing-card card glass-level-3";
  card.dataset.service = unit.service;
  card.dataset.cycleId = cycle.id;
  card.dataset.unitId = unit.id;

  const header = document.createElement("div");
  header.className = "volt-billing-header";
  const heading = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "FATURAMENTO DO CICLO";
  const title = document.createElement("h2");
  title.textContent = `${unit.service === "water" ? "Água" : "Energia"} · ${formatCycle(cycle)}`;
  heading.append(eyebrow, title);
  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.dataset.tone = billingTone(cycle, reconciliation);
  badge.textContent = billingStatus(cycle, bill, reconciliation);
  header.append(heading, badge);
  card.append(header);

  const facts = document.createElement("div");
  facts.className = "volt-billing-facts";
  facts.append(
    metric("Estimativa fechada", estimate?.estimated_total == null ? "Não identificada" : currency(estimate.estimated_total), estimate ? "VOLT calculado" : "Sem dados suficientes no fechamento"),
    metric("Fatura real", bill?.invoice_total == null ? "Não informada" : currency(bill.invoice_total), bill ? "Concessionária / usuário" : "Aguardando fatura")
  );
  card.append(facts);

  if (cycle.status === "open") {
    card.append(message("Ciclo em andamento", "A conciliação começa quando o ciclo fechar. A estimativa corrente permanece separada do valor real da concessionária."));
    return card;
  }

  if (!bill) {
    if (cycle.bill_arrival_state === "not_asked") card.append(buildArrivalQuestion(cycle));
    else if (cycle.bill_arrival_state === "not_arrived") card.append(buildAwaitingBill(cycle));
    else card.append(buildTotalForm(cycle));
    return card;
  }

  card.append(buildComparison(unit, bill, estimate, reconciliation));
  if (components.length) card.append(buildComponents(components));
  card.append(buildInvoiceActions(unit, cycle, bill));
  return card;
}

function buildArrivalQuestion(cycle) {
  const section = document.createElement("section");
  section.className = "volt-billing-question";
  const strong = document.createElement("strong");
  strong.textContent = "Sua fatura chegou?";
  const copy = document.createElement("p");
  copy.className = "supporting-copy";
  copy.textContent = "Se já chegou, basta informar o total primeiro. O detalhamento é opcional e só será pedido se ajudar na conciliação.";
  const actions = document.createElement("div");
  actions.className = "volt-billing-actions";
  actions.append(actionButton("Sim, chegou", "arrived", cycle.id, "primary-button"), actionButton("Ainda não", "not-arrived", cycle.id, "secondary-button"));
  section.append(strong, copy, actions);
  return section;
}

function buildAwaitingBill(cycle) {
  const section = message("Aguardando fatura", "O VOLT não vai insistir. Quando ela chegar, registre o total para comparar com a estimativa fechada.");
  section.append(actionButton("Registrar quando chegar", "arrived", cycle.id, "secondary-button"));
  return section;
}

function buildTotalForm(cycle) {
  const form = document.createElement("form");
  form.className = "volt-billing-total-form";
  form.dataset.billTotalForm = cycle.id;
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = "Valor total da fatura";
  const input = document.createElement("input");
  input.name = "invoiceTotal";
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.inputMode = "decimal";
  input.placeholder = "0,00";
  input.required = true;
  label.append(caption, input);
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "primary-button";
  button.textContent = "Comparar com o VOLT";
  const status = document.createElement("p");
  status.className = "status-message";
  status.dataset.billFormStatus = cycle.id;
  form.append(label, button, status);
  return form;
}

function buildComparison(unit, bill, estimate, reconciliation) {
  const section = document.createElement("section");
  section.className = "volt-billing-comparison";
  const title = document.createElement("h3");
  title.textContent = "Comparação e conciliação";
  const unitLabel = unit.service === "water" ? "m³" : "kWh";
  const decimals = unit.service === "water" ? 3 : 0;
  const grid = document.createElement("div");
  grid.className = "volt-billing-facts";
  grid.append(
    metric("Consumo medido pelo VOLT", bill.measured_consumption == null ? "Não identificado" : `${formatNumber(bill.measured_consumption, decimals)} ${unitLabel}`, "Medição física acompanhada"),
    metric("Consumo faturado", bill.billed_consumption == null ? "Não informado" : `${formatNumber(bill.billed_consumption, decimals)} ${unitLabel}`, bill.billing_method === "average" ? "Faturado por média" : "Concessionária"),
    metric("Estimativa no fechamento", estimate?.estimated_total == null ? "Não identificada" : currency(estimate.estimated_total), estimate?.engine_version || "Sem snapshot"),
    metric("Valor real", currency(bill.invoice_total), "Fatura recebida")
  );
  section.append(title, grid);
  if (reconciliation) {
    const result = document.createElement("div");
    result.className = "volt-reconciliation-result";
    const strong = document.createElement("strong");
    strong.textContent = reconciliationLabel(reconciliation.classification);
    const copy = document.createElement("p");
    copy.className = "supporting-copy";
    copy.textContent = reconciliationText(reconciliation);
    result.append(strong, copy);
    section.append(result);
  } else {
    section.append(message("Comparação indisponível", "A fatura foi salva, mas não havia uma estimativa fechada com dados suficientes para comparar sem inventar valores."));
  }
  return section;
}

function buildComponents(components) {
  const section = document.createElement("section");
  section.className = "volt-bill-components";
  const title = document.createElement("h3");
  title.textContent = "Itens identificados na fatura";
  const list = document.createElement("ul");
  for (const component of components.sort((a, b) => Number(a.position) - Number(b.position))) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = component.label || component.code;
    const value = document.createElement("strong");
    value.textContent = component.amount == null ? "Valor não identificado" : `${component.direction === "credit" ? "− " : ""}${currency(component.amount)}`;
    const source = document.createElement("small");
    source.textContent = `${component.source_type || "origem não identificada"} · ${component.confidence || "confiança não identificada"}`;
    item.append(label, value, source);
    list.append(item);
  }
  section.append(title, list);
  return section;
}

function buildInvoiceActions(unit, cycle, bill) {
  const section = document.createElement("section");
  section.className = "volt-invoice-actions";
  const title = document.createElement("h3");
  title.textContent = "Detalhamento opcional";
  const copy = document.createElement("p");
  copy.className = "supporting-copy";
  copy.textContent = "Use a foto quando quiser explicar diferenças. A imagem é processada localmente e não é salva pelo VOLT.";
  const label = document.createElement("label");
  label.className = "secondary-button volt-file-button";
  label.textContent = "Analisar foto da fatura";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.dataset.invoiceImage = bill.id;
  input.dataset.unitId = unit.id;
  input.dataset.cycleId = cycle.id;
  label.append(input);
  const result = document.createElement("div");
  result.className = "volt-ocr-result";
  result.dataset.ocrResult = bill.id;
  const pdf = actionButton("Gerar PDF executivo", "pdf", cycle.id, "secondary-button");
  pdf.dataset.billId = bill.id;
  section.append(title, copy, label, result, pdf);
  return section;
}

function renderFinancialReports() {
  const panelSpecs = [
    ["overview", null],
    ["energy", "energy"],
    ["water", "water"]
  ];
  for (const [mode, service] of panelSpecs) {
    const panel = document.querySelector(`[data-report-panel="${mode}"]`);
    if (!panel) continue;
    let host = panel.querySelector(`[data-volt-financial-report="${mode}"]`);
    if (!host) {
      host = document.createElement("section");
      host.className = "volt-financial-report card glass-level-3";
      host.dataset.voltFinancialReport = mode;
      panel.append(host);
    }
    const bills = cache.bills
      .map((bill) => ({ bill, cycle: cache.cycles.find((cycle) => cycle.id === bill.billing_cycle_id), unit: cache.units.find((unit) => unit.id === bill.consumer_unit_id) }))
      .filter((item) => item.cycle && item.unit && (!service || item.unit.service === service))
      .sort((a, b) => b.cycle.cycle_end.localeCompare(a.cycle.cycle_end));
    host.replaceChildren(buildFinancialHeading());
    if (!bills.length) {
      host.append(message("Sem faturas conciliadas neste relatório", "O financeiro aparece somente quando existe uma fatura real registrada. Estimativas de consumo permanecem nas seções anteriores."));
      continue;
    }
    for (const item of uniqueLatestPerUnit(bills)) host.append(buildFinancialRow(item));
  }
}

function buildFinancialHeading() {
  const header = document.createElement("div");
  header.className = "volt-financial-heading";
  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "FINANCEIRO";
  const title = document.createElement("h2");
  title.textContent = "Fatura real e conciliação";
  const note = document.createElement("p");
  note.className = "supporting-copy";
  note.textContent = "Esta seção vem após consumo e comparação. Valores reais da concessionária não substituem as medições do VOLT.";
  copy.append(eyebrow, title, note);
  header.append(copy);
  return header;
}

function buildFinancialRow({ bill, cycle, unit }) {
  const row = document.createElement("article");
  row.className = "volt-financial-row";
  const reconciliation = cache.reconciliations.find((item) => item.bill_id === bill.id) || null;
  const estimate = latestForCycle(cache.estimates, cycle.id);
  const title = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${unit.service === "water" ? "Água" : "Energia"} · ${formatCycle(cycle)}`;
  const note = document.createElement("small");
  note.textContent = reconciliation ? reconciliationLabel(reconciliation.classification) : "Sem comparação disponível";
  title.append(strong, note);
  const values = document.createElement("div");
  values.className = "volt-financial-values";
  values.append(metric("Estimativa", estimate?.estimated_total == null ? "—" : currency(estimate.estimated_total), "VOLT"), metric("Fatura", currency(bill.invoice_total), "Real"));
  const button = actionButton("PDF executivo", "pdf", cycle.id, "secondary-button");
  button.dataset.billId = bill.id;
  row.append(title, values, button);
  return row;
}

async function handleClick(event) {
  const button = event.target.closest("[data-billing-action]");
  if (!button) return;
  const action = button.dataset.billingAction;
  const cycleId = button.dataset.cycleId;
  try {
    button.disabled = true;
    if (action === "not-arrived") {
      await patch("billing_cycles", cycleId, { bill_arrival_state: "not_arrived", bill_arrival_updated_at: new Date().toISOString(), status: "awaiting_bill", updated_at: new Date().toISOString() });
      await refreshDomain();
      return;
    }
    if (action === "arrived") {
      await patch("billing_cycles", cycleId, { bill_arrival_state: "arrived", bill_arrival_updated_at: new Date().toISOString(), status: "awaiting_bill", updated_at: new Date().toISOString() });
      await refreshDomain();
      return;
    }
    if (action === "pdf") {
      const billId = button.dataset.billId;
      const data = executiveData(cycleId, billId);
      if (data) downloadExecutivePdf(data, `volt-executivo-${data.unit.service}-${data.cycle.cycle_end}.pdf`);
      return;
    }
    if (action === "confirm-ocr") {
      await confirmPendingExtraction(button.dataset.billId);
      return;
    }
  } catch (error) {
    console.warn("VOLT billing action failed", error instanceof Error ? error.message : "unknown_error");
  } finally {
    button.disabled = false;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest("[data-bill-total-form]");
  if (!form) return;
  event.preventDefault();
  const cycleId = form.dataset.billTotalForm;
  const input = form.elements.namedItem("invoiceTotal");
  const total = Number(input?.value);
  const status = form.querySelector(`[data-bill-form-status="${cycleId}"]`);
  if (!Number.isFinite(total) || total < 0) {
    if (status) status.textContent = "Informe um valor válido.";
    return;
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  if (status) status.textContent = "Salvando e comparando…";
  try {
    await saveInvoiceTotal(cycleId, total);
    await refreshDomain();
  } catch (error) {
    if (status) status.textContent = "Não foi possível salvar a fatura.";
    console.warn("VOLT invoice total failed", error instanceof Error ? error.message : "unknown_error");
  } finally {
    submit.disabled = false;
  }
}

async function handleChange(event) {
  const input = event.target.closest("[data-invoice-image]");
  if (!input) return;
  const file = input.files?.[0];
  const billId = input.dataset.invoiceImage;
  const host = document.querySelector(`[data-ocr-result="${billId}"]`);
  if (!file || !host) return;
  host.textContent = "Analisando a imagem localmente…";
  pendingExtraction = null;
  const result = await analyzeInvoiceImage(file);
  input.value = "";
  if (!result.fields) {
    host.textContent = result.message;
    return;
  }
  pendingExtraction = {
    billId,
    unitId: input.dataset.unitId,
    cycleId: input.dataset.cycleId,
    fields: result.fields,
    fieldConfidence: result.fieldConfidence
  };
  host.replaceChildren(buildOcrPreview(result, billId));
}

function buildOcrPreview(result, billId) {
  const section = document.createElement("section");
  section.className = "volt-ocr-preview";
  const title = document.createElement("strong");
  title.textContent = "Dados sugeridos — confirme antes de salvar";
  const list = document.createElement("ul");
  const fields = result.fields;
  const entries = [
    ["Distribuidora/prestadora", fields.provider || "Não identificada"],
    ["Classe", fields.customerClass || "Não identificada"],
    ["Ciclo", fields.cycleStart && fields.cycleEnd ? `${formatDate(fields.cycleStart)} – ${formatDate(fields.cycleEnd)}` : "Não identificado"],
    ["Consumo faturado", fields.billedConsumption == null ? "Não identificado" : String(fields.billedConsumption)],
    ["Método de faturamento", fields.billingMethod || "Não identificado"],
    ["Total lido", fields.invoiceTotal == null ? "Não identificado" : currency(fields.invoiceTotal)],
    ["Itens reconhecidos", String(fields.items?.length || 0)]
  ];
  for (const [label, value] of entries) {
    const item = document.createElement("li");
    const small = document.createElement("small");
    small.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(small, strong);
    list.append(item);
  }
  const button = actionButton("Confirmar dados identificados", "confirm-ocr", null, "primary-button");
  button.dataset.billId = billId;
  const note = document.createElement("p");
  note.className = "supporting-copy";
  note.textContent = result.message;
  section.append(title, list, note, button);
  return section;
}

async function saveInvoiceTotal(cycleId, invoiceTotal) {
  const cycle = cache.cycles.find((item) => item.id === cycleId);
  if (!cycle) throw new Error("cycle_not_found");
  const unit = cache.units.find((item) => item.id === cycle.consumer_unit_id);
  if (!unit) throw new Error("unit_not_found");
  const previousBills = cache.bills.filter((bill) => bill.billing_cycle_id === cycleId).sort((a, b) => Number(b.revision) - Number(a.revision));
  const previous = previousBills[0] || null;
  const revision = previous ? Number(previous.revision) + 1 : 1;
  const estimate = latestForCycle(cache.estimates, cycleId);
  const rows = await insert("bills", {
    organization_id: unit.organization_id,
    consumer_unit_id: unit.id,
    billing_cycle_id: cycle.id,
    revision,
    supersedes_bill_id: previous?.id || null,
    billing_method: "not_identified",
    measured_consumption: estimate?.estimated_consumption ?? null,
    billed_consumption: null,
    estimated_total: estimate?.estimated_total ?? null,
    invoice_total: roundMoney(invoiceTotal),
    currency: "BRL",
    source_type: "user_informed",
    confidence: "confirmed",
    status: "received",
    received_at: new Date().toISOString(),
    input_method: "user_total",
    extraction_status: "not_analyzed",
    extraction_metadata: {},
    raw_document_retained: false
  });
  const bill = rows[0];
  if (!bill) throw new Error("bill_not_created");
  await patch("billing_cycles", cycle.id, { status: "billed", bill_arrival_state: "arrived", bill_arrival_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  if (estimate?.estimated_total != null) await persistReconciliation(bill, estimate.estimated_total, [], "estimate_comparison");
}

async function persistReconciliation(bill, comparisonTotal, components, basis) {
  const invoiceTotal = Number(bill.invoice_total);
  const calculatedTotal = Math.max(0, roundMoney(comparisonTotal));
  if (!Number.isFinite(invoiceTotal) || !Number.isFinite(calculatedTotal)) return null;
  const difference = roundMoney(invoiceTotal - calculatedTotal);
  const percent = invoiceTotal === 0 ? null : roundMoney(Math.abs(difference) / Math.abs(invoiceTotal) * 100);
  const classification = classifyDifference(difference, percent);
  const missingAmounts = components.filter((item) => item.amount == null).length;
  const status = missingAmounts > 0
    ? "partially_reconciled"
    : classification === "matching" ? "reconciled" : classification === "small_difference" ? "partially_reconciled" : "not_reconciled";
  const measuredMinusBilled = bill.measured_consumption == null || bill.billed_consumption == null
    ? null
    : roundMoney(Number(bill.measured_consumption) - Number(bill.billed_consumption));
  const nextAction = missingAmounts > 0
    ? "Identificar valores ainda não confirmados na fatura."
    : classification === "relevant_difference" ? "Detalhar a fatura para localizar tributos, taxas, créditos ou diferenças de faturamento." : null;
  const payload = {
    organization_id: bill.organization_id,
    bill_id: bill.id,
    calculated_total: calculatedTotal,
    invoice_total: invoiceTotal,
    difference_amount: difference,
    difference_percent: percent,
    measured_minus_billed: measuredMinusBilled,
    classification,
    status,
    engine_version: "reconciliation-v1",
    diagnostics: { basis, missing_component_amounts: missingAmounts },
    policy: { matching_amount_brl: RECONCILIATION_POLICY.matchingAmount, small_difference_amount_brl: RECONCILIATION_POLICY.smallAmount, small_difference_percent: RECONCILIATION_POLICY.smallPercent },
    next_action: nextAction,
    source_type: "volt_calculated",
    confidence: basis === "bill_components" && missingAmounts === 0 ? "confirmed" : "probable"
  };
  const existing = cache.reconciliations.find((item) => item.bill_id === bill.id);
  return existing ? patch("reconciliations", existing.id, payload) : insert("reconciliations", payload);
}

async function confirmPendingExtraction(billId) {
  const pending = pendingExtraction;
  if (!pending || pending.billId !== billId) return;
  const bill = cache.bills.find((item) => item.id === billId);
  const unit = cache.units.find((item) => item.id === pending.unitId);
  if (!bill || !unit) return;

  await insert("bill_extractions", {
    organization_id: bill.organization_id,
    consumer_unit_id: unit.id,
    billing_cycle_id: pending.cycleId || null,
    bill_id: bill.id,
    extractor_version: "invoice-text-detector-v1",
    file_kind: "image",
    extracted_fields: pending.fields,
    field_confidence: pending.fieldConfidence,
    validation_state: "validated",
    validated_fields: pending.fields,
    source_type: "bill_identified",
    confidence: "confirmed"
  });

  const billPatch = {
    billing_method: allowedBillingMethod(pending.fields.billingMethod),
    billed_consumption: finiteOrNull(pending.fields.billedConsumption),
    due_date: pending.fields.dueDate || null,
    source_type: "bill_identified",
    confidence: "confirmed",
    extraction_status: "validated",
    extraction_metadata: { extractor: "invoice-text-detector-v1", validated_at: new Date().toISOString(), raw_document_retained: false },
    input_method: "image_ocr",
    updated_at: new Date().toISOString()
  };
  await patch("bills", bill.id, billPatch);

  const unitPatch = {};
  if (!unit.distributor && pending.fields.provider) unitPatch.distributor = pending.fields.provider;
  if (!unit.class && pending.fields.customerClass) unitPatch.class = pending.fields.customerClass;
  if (Object.keys(unitPatch).length) await patch("consumer_units", unit.id, { ...unitPatch, updated_at: new Date().toISOString() });

  const existingComponents = cache.components.filter((item) => item.bill_id === bill.id);
  let position = existingComponents.reduce((maximum, item) => Math.max(maximum, Number(item.position) || 0), 0) + 1;
  const insertedComponents = [];
  for (const item of Array.isArray(pending.fields.items) ? pending.fields.items : []) {
    const duplicate = existingComponents.some((component) => component.code === item.code && component.amount != null && item.amount != null && Math.abs(Number(component.amount) - Number(item.amount)) < 0.01);
    if (duplicate) continue;
    const rows = await insert("bill_components", {
      organization_id: bill.organization_id,
      bill_id: bill.id,
      position: position++,
      category: item.category || "other",
      code: item.code || `ocr_item_${position}`,
      label: item.label || item.code || "Item identificado",
      direction: item.direction || "neutral",
      quantity: finiteOrNull(item.quantity),
      quantity_unit: item.quantityUnit || null,
      unit_rate: finiteOrNull(item.unitRate),
      percentage: finiteOrNull(item.percentage),
      amount: item.amount == null ? null : Math.abs(Number(item.amount)),
      source_type: "bill_identified",
      confidence: item.amount == null ? "probable" : "confirmed",
      evidence_text: item.label || null
    });
    if (rows[0]) insertedComponents.push(rows[0]);
  }

  await linkRegulatoryEvidence(unit, bill, [...existingComponents, ...insertedComponents]);
  const allComponents = [...existingComponents, ...insertedComponents];
  if (allComponents.length) {
    const explained = roundMoney(allComponents.reduce((total, item) => {
      if (item.amount == null) return total;
      if (item.direction === "credit") return total - Number(item.amount);
      if (item.direction === "charge") return total + Number(item.amount);
      return total;
    }, 0));
    const enrichedBill = { ...bill, ...billPatch };
    await persistReconciliation(enrichedBill, Math.max(0, explained), allComponents, "bill_components");
  }
  pendingExtraction = null;
  await refreshDomain();
}

async function linkRegulatoryEvidence(unit, bill, components) {
  const profiledRuleCodes = new Set();
  for (const component of components) {
    const rule = matchRegulatoryRuleForComponent(cache.rules, component);
    if (!rule) continue;
    const existingApp = cache.ruleApplications.find((item) => item.bill_id === bill.id && item.regulatory_rule_id === rule.id && item.bill_component_id === component.id);
    if (!existingApp) {
      await insert("rule_applications", {
        organization_id: bill.organization_id,
        regulatory_rule_id: rule.id,
        consumer_unit_id: unit.id,
        billing_cycle_id: bill.billing_cycle_id,
        bill_id: bill.id,
        bill_component_id: component.id,
        engine_stage: "billing",
        outcome: component.amount == null ? "possible" : "confirmed",
        effect_amount: component.amount == null ? null : (component.direction === "credit" ? -Number(component.amount) : Number(component.amount)),
        source_type: "bill_identified",
        confidence: component.amount == null ? "probable" : "confirmed",
        explanation: "Regra ligada diretamente à linha identificada na fatura para impedir dupla contagem."
      });
    }
    const profile = latestProfile(unit.id, rule.code);
    if ((!profile || profile.state !== "confirmed_on_bill") && !profiledRuleCodes.has(rule.code)) {
      await insert("regulatory_profiles", {
        organization_id: bill.organization_id,
        consumer_unit_id: unit.id,
        rule_code: rule.code,
        regulatory_rule_id: rule.id,
        state: "confirmed_on_bill",
        source_type: "bill_identified",
        confidence: "confirmed",
        evidence_bill_id: bill.id,
        details: { evidence_component_id: component.id, amount_confirmed: component.amount != null }
      });
      profiledRuleCodes.add(rule.code);
    }
  }
}

function executiveData(cycleId, billId) {
  const cycle = cache.cycles.find((item) => item.id === cycleId);
  const bill = cache.bills.find((item) => item.id === billId);
  if (!cycle || !bill) return null;
  const unit = cache.units.find((item) => item.id === cycle.consumer_unit_id);
  if (!unit) return null;
  return {
    unit,
    cycle,
    bill,
    estimate: latestForCycle(cache.estimates, cycle.id),
    reconciliation: cache.reconciliations.find((item) => item.bill_id === bill.id) || null,
    components: cache.components.filter((item) => item.bill_id === bill.id),
    regulatoryProfiles: cache.profiles.filter((item) => item.consumer_unit_id === unit.id && (!item.evidence_bill_id || item.evidence_bill_id === bill.id))
  };
}

function ensureAuth() {
  const state = getApplicationStateSnapshot();
  const token = state.session?.access_token;
  if (!token) throw new Error("session_required");
  return token;
}

async function list(table, filters = {}) {
  const query = { select: "*", ...filters };
  return request(table, { query });
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
  const headers = {
    apikey: VOLT_CONFIG.publishableKey,
    Authorization: `Bearer ${token}`,
    Accept: "application/json"
  };
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

function latestForCycle(items, cycleId) {
  return items.filter((item) => item.billing_cycle_id === cycleId).sort((a, b) => Number(b.revision || 1) - Number(a.revision || 1))[0] || null;
}

function latestProfile(unitId, ruleCode) {
  return cache.profiles.filter((item) => item.consumer_unit_id === unitId && item.rule_code === ruleCode).sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0] || null;
}

function uniqueLatestPerUnit(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.unit.id)) return false;
    seen.add(item.unit.id);
    return true;
  });
}

function classifyDifference(difference, percent) {
  const absolute = Math.abs(Number(difference) || 0);
  if (absolute <= RECONCILIATION_POLICY.matchingAmount) return "matching";
  if (absolute <= RECONCILIATION_POLICY.smallAmount || (percent != null && percent <= RECONCILIATION_POLICY.smallPercent)) return "small_difference";
  return "relevant_difference";
}

function actionButton(label, action, cycleId, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.billingAction = action;
  if (cycleId) button.dataset.cycleId = cycleId;
  button.textContent = label;
  return button;
}

function metric(label, value, note) {
  const item = document.createElement("div");
  item.className = "volt-billing-metric";
  const small = document.createElement("small");
  small.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const detail = document.createElement("span");
  detail.textContent = note || "";
  item.append(small, strong, detail);
  return item;
}

function message(titleText, bodyText) {
  const section = document.createElement("div");
  section.className = "volt-billing-message";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const body = document.createElement("p");
  body.className = "supporting-copy";
  body.textContent = bodyText;
  section.append(title, body);
  return section;
}

function billingStatus(cycle, bill, reconciliation) {
  if (reconciliation?.status === "reconciled") return "Conciliado";
  if (reconciliation?.status === "partially_reconciled") return "Conciliação parcial";
  if (reconciliation?.status === "not_reconciled") return "Revisar diferença";
  if (bill) return "Fatura registrada";
  if (cycle.bill_arrival_state === "not_arrived") return "Aguardando fatura";
  if (cycle.status === "awaiting_bill") return "Ciclo fechado";
  return "Ciclo aberto";
}

function billingTone(cycle, reconciliation) {
  if (reconciliation?.classification === "relevant_difference") return "danger";
  if (reconciliation?.classification === "small_difference") return "warning";
  if (reconciliation?.classification === "matching") return "success";
  return cycle.status === "awaiting_bill" ? "warning" : "success";
}

function reconciliationLabel(value) {
  const labels = { matching: "Batendo", small_difference: "Pequena diferença", relevant_difference: "Diferença relevante" };
  return labels[value] || "Não conciliado";
}

function reconciliationText(item) {
  const difference = Number(item.difference_amount) || 0;
  const base = difference === 0 ? "Estimativa e fatura estão alinhadas." : `Diferença de ${signedCurrency(difference)} entre a referência calculada e a fatura.`;
  return item.next_action ? `${base} ${item.next_action}` : base;
}

function formatCycle(cycle) {
  return `${formatDate(cycle.cycle_start)} – ${formatDate(cycle.cycle_end)}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : String(value);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function flagLabel(value) {
  const labels = { green: "Bandeira verde", yellow: "Bandeira amarela", red1: "Bandeira vermelha patamar 1", red2: "Bandeira vermelha patamar 2" };
  return labels[value] || "Bandeira tarifária";
}

function allowedBillingMethod(value) {
  return ["metered", "average", "estimated", "adjusted"].includes(value) ? value : "not_identified";
}

function currency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function signedCurrency(value) {
  const number = Number(value) || 0;
  return number < 0 ? `− ${currency(Math.abs(number))}` : `+ ${currency(number)}`;
}

function formatNumber(value, decimals) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(value) || 0);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function finiteOrNull(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? null : number;
}

export function getBillingWorkflowSnapshot() {
  return structuredClone(cache);
}

export function describeRegulatoryState(unitId) {
  return cache.profiles.filter((profile) => profile.consumer_unit_id === unitId).map((profile) => ({ ...profile, label: regulatoryProfileLabel(profile.state) }));
}
