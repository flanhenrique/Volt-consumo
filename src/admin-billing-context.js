import { VOLT_CONFIG } from "../config.js?v=20260825.4";
import { renderLegalBillDetail } from "./bill-detail.js?v=20260825.4";

const STORE_WAIT_LIMIT = 80;
let store = null;
let waitAttempts = 0;
let syncingTargetId = null;
let syncedTargetId = null;

boot();

function boot() {
  store = globalThis.__VOLT_ADMIN_VIEW_BRIDGE__ || null;
  if (!store) {
    waitAttempts += 1;
    if (waitAttempts < STORE_WAIT_LIMIT) window.setTimeout(boot, 50);
    return;
  }
  store.subscribe(handleState);
}

function handleState(state) {
  const targetId = state?.adminView?.targetId || null;
  if (!targetId) {
    syncingTargetId = null;
    syncedTargetId = null;
    return;
  }
  if (targetId === syncedTargetId || targetId === syncingTargetId) return;
  void hydrateCanonicalBilling(targetId, state);
}

async function hydrateCanonicalBilling(targetId, state) {
  syncingTargetId = targetId;
  try {
    const snapshot = await fetchSnapshot(targetId);
    if (!snapshot?.authorized || !snapshot?.found) return;

    const cycles = buildExactCycles(snapshot.billing_cycles, state.cycles, snapshot.latest_bill);
    const billing = normalizeLatestBill(snapshot.latest_bill, snapshot.billing_cycles) || state.billing?.energy || null;
    const historicalConsumption = {
      energy: normalizeMonthlyHistory(snapshot.monthly_history),
      water: state.historicalConsumption?.water || []
    };

    store.update({
      cycles: { ...state.cycles, energy: cycles },
      billing: { ...state.billing, energy: billing },
      historicalConsumption
    });

    renderLegalBillDetail(globalThis.__VOLT_BILLING_CONTEXT__?.profile || null, billing);
    syncedTargetId = targetId;
  } catch (error) {
    console.warn("VOLT canonical admin billing context unavailable", error instanceof Error ? error.message : "unknown_error");
  } finally {
    syncingTargetId = null;
  }
}

async function fetchSnapshot(userId) {
  if (!window.supabase?.createClient) throw new Error("Supabase runtime unavailable");
  const client = window.supabase.createClient(VOLT_CONFIG.url, VOLT_CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData?.session) throw new Error("Administrative session unavailable");
  const { data, error } = await client.rpc("beta_admin_user_view_snapshot", { p_user_id: userId });
  if (error) throw error;
  return data;
}

function buildExactCycles(rows, fallbackCycles, latestBill) {
  const cycles = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: row?.id || null,
      start: calendarKey(row?.cycle_start),
      end: calendarKey(row?.cycle_end),
      status: String(row?.status || ""),
      sourceType: String(row?.source_type || ""),
      confidence: String(row?.confidence || "")
    }))
    .filter((row) => row.start && row.end)
    .sort((left, right) => left.start.localeCompare(right.start));

  const today = calendarKey(new Date());
  const current = [...cycles].reverse().find((row) => row.status === "open" && (!today || row.start <= today && row.end >= today))
    || [...cycles].reverse().find((row) => row.status === "open")
    || [...cycles].reverse().find((row) => !today || row.start <= today && row.end >= today)
    || cycles.at(-1)
    || null;

  const previous = current
    ? [...cycles].reverse().find((row) => row !== current && row.end <= current.start && ["billed", "reconciled", "closed", "awaiting_bill"].includes(row.status))
      || [...cycles].reverse().find((row) => row !== current && row.start < current.start)
      || null
    : null;

  const fallback = fallbackCycles?.energy || fallbackCycles || { start: 1, end: 31 };
  if (!current) return fallback;

  const billMatchesPrevious = Boolean(previous?.id && latestBill?.billing_cycle_id === previous.id);
  const closingMeterValue = billMatchesPrevious ? finiteOrNull(latestBill?.extraction_metadata?.current_meter_value) : null;
  const measuredPrevious = billMatchesPrevious ? finiteOrNull(latestBill?.measured_consumption) : null;
  const exactCurrent = { start: current.start, end: current.end };
  const exactPrevious = previous ? { start: previous.start, end: previous.end } : null;
  if (closingMeterValue != null && previous?.end === current.start) exactCurrent.baselineValue = closingMeterValue;
  if (exactPrevious && measuredPrevious != null) exactPrevious.fixedConsumption = measuredPrevious;

  return {
    start: Number(current.start.slice(8, 10)) || Number(fallback.start) || 1,
    end: Number(current.end.slice(8, 10)) || Number(fallback.end) || 31,
    exactCurrent,
    exactPrevious,
    sourceType: current.sourceType,
    confidence: current.confidence
  };
}

function normalizeLatestBill(input, cycleRows) {
  if (!input || typeof input !== "object") return null;
  const cycle = (Array.isArray(cycleRows) ? cycleRows : []).find((row) => row?.id === input.billing_cycle_id) || null;
  const items = (Array.isArray(input.components) ? input.components : []).map((item, index) => {
    const rawAmount = finiteOrNull(item?.amount);
    const direction = String(item?.direction || "charge");
    const amount = rawAmount == null ? null : direction === "credit" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    return {
      category: String(item?.category || "other"),
      code: String(item?.code || `item_${index + 1}`),
      label: String(item?.label || item?.code || `Item ${index + 1}`),
      quantityKwh: String(item?.quantity_unit || "").toLowerCase() === "kwh" ? finiteOrNull(item?.quantity) : null,
      unitRate: finiteOrNull(item?.unit_rate),
      amount,
      amountStatus: rawAmount == null ? "not_confirmed" : "confirmed",
      forecastable: item?.code !== "itaipu_art21",
      extraordinary: item?.code === "itaipu_art21"
    };
  });
  return {
    cycleStart: cycle?.cycle_start || input.extraction_metadata?.previous_reading_date || null,
    cycleEnd: cycle?.cycle_end || input.extraction_metadata?.current_reading_date || null,
    measuredConsumptionKwh: finiteOrNull(input.measured_consumption),
    billedConsumptionKwh: finiteOrNull(input.billed_consumption),
    billingBasis: String(input.billing_method || "metered"),
    invoiceTotal: finiteOrNull(input.invoice_total),
    issuedAt: input.issued_at || null,
    dueDate: input.due_date || null,
    status: String(input.status || "received"),
    sourceType: String(input.source_type || "bill_identified"),
    confidence: String(input.confidence || "confirmed"),
    items
  };
}

function normalizeMonthlyHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      referenceMonth: calendarKey(row?.reference_month),
      value: Number(row?.consumption_kwh),
      basis: String(row?.consumption_basis || "billed"),
      sourceType: String(row?.source_type || "bill_identified"),
      confidence: String(row?.confidence || "not_identified")
    }))
    .filter((row) => row.referenceMonth && Number.isFinite(row.value))
    .sort((left, right) => left.referenceMonth.localeCompare(right.referenceMonth));
}

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calendarKey(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
