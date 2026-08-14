import { VOLT_CONFIG } from "../config.js?v=20260813.7";
import { renderLegalBillDetail } from "./bill-detail.js?v=20260813.7";

const STORE_WAIT_LIMIT = 80;
let store = null;
let waitAttempts = 0;
let syncingUserId = null;
let syncedUserId = null;

boot();

function boot() {
  store = globalThis.__VOLT_CANONICAL_SYNC_BRIDGE__ || null;
  if (!store) {
    waitAttempts += 1;
    if (waitAttempts < STORE_WAIT_LIMIT) window.setTimeout(boot, 50);
    return;
  }
  store.subscribe(handleState);
}

function handleState(state) {
  const userId = state?.authenticatedUserId || null;
  if (state?.status !== "READY" || state?.adminView || !userId) {
    if (!state?.adminView) {
      syncingUserId = null;
      syncedUserId = null;
    }
    return;
  }
  if (userId === syncedUserId || userId === syncingUserId) return;
  void hydrateOwnCanonicalBilling(userId, state);
}

async function hydrateOwnCanonicalBilling(userId, state) {
  syncingUserId = userId;
  try {
    const snapshot = await loadOwnBillingSnapshot(userId);
    if (!snapshot?.unit) {
      syncedUserId = userId;
      return;
    }

    const cycles = buildExactCycles(snapshot.billingCycles, state.cycles, snapshot.latestBill);
    const billing = normalizeLatestBill(snapshot.latestBill, snapshot.billingCycles) || state.billing?.energy || null;
    const historicalConsumption = {
      energy: normalizeMonthlyHistory(snapshot.monthlyHistory),
      water: state.historicalConsumption?.water || []
    };

    store.update({
      cycles: { ...state.cycles, energy: cycles },
      billing: { ...state.billing, energy: billing },
      historicalConsumption
    });
    renderLegalBillDetail(globalThis.__VOLT_BILLING_CONTEXT__?.profile || null, billing);
    syncedUserId = userId;
  } catch (error) {
    console.warn("VOLT canonical billing context unavailable", error instanceof Error ? error.message : "unknown_error");
  } finally {
    syncingUserId = null;
  }
}

async function loadOwnBillingSnapshot(userId) {
  if (!window.supabase?.createClient) throw new Error("Supabase runtime unavailable");
  const client = window.supabase.createClient(VOLT_CONFIG.url, VOLT_CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData?.session || sessionData.session.user?.id !== userId) throw new Error("Signed-in session unavailable");

  const { data: units, error: unitError } = await client
    .from("consumer_units")
    .select("id, organization_id, created_by, service, status")
    .eq("created_by", userId)
    .eq("service", "energy")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (unitError) throw unitError;
  const unit = units?.[0] || null;
  if (!unit) return { unit: null, billingCycles: [], latestBill: null, monthlyHistory: [] };

  const [cyclesResponse, billsResponse, historyResponse] = await Promise.all([
    client.from("billing_cycles")
      .select("id, cycle_start, cycle_end, status, source_type, confidence, bill_arrival_state")
      .eq("consumer_unit_id", unit.id)
      .order("cycle_start"),
    client.from("bills")
      .select("id, billing_cycle_id, issued_at, due_date, billing_method, measured_consumption, billed_consumption, invoice_total, currency, source_type, confidence, status, extraction_metadata, created_at")
      .eq("consumer_unit_id", unit.id)
      .in("status", ["received", "reconciled"])
      .order("issued_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1),
    client.from("monthly_consumption_history")
      .select("reference_month, consumption_kwh, consumption_basis, source_type, confidence")
      .eq("consumer_unit_id", unit.id)
      .order("reference_month")
  ]);
  if (cyclesResponse.error || billsResponse.error || historyResponse.error) throw cyclesResponse.error || billsResponse.error || historyResponse.error;

  const latestBill = billsResponse.data?.[0] || null;
  if (latestBill) {
    const { data: components, error: componentsError } = await client
      .from("bill_components")
      .select("position, category, code, label, direction, quantity, quantity_unit, unit_rate, percentage, amount, source_type, confidence, evidence_text")
      .eq("bill_id", latestBill.id)
      .order("position");
    if (componentsError) throw componentsError;
    latestBill.components = components || [];
  }

  return {
    unit,
    billingCycles: cyclesResponse.data || [],
    latestBill,
    monthlyHistory: historyResponse.data || []
  };
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
    items: normalizeComponents(input.components)
  };
}

function normalizeComponents(rows) {
  return (Array.isArray(rows) ? rows : []).map((item, index) => {
    const rawAmount = finiteOrNull(item?.amount);
    const direction = String(item?.direction || "charge");
    return {
      category: String(item?.category || "other"),
      code: String(item?.code || `item_${index + 1}`),
      label: String(item?.label || item?.code || `Item ${index + 1}`),
      quantityKwh: String(item?.quantity_unit || "").toLowerCase() === "kwh" ? finiteOrNull(item?.quantity) : null,
      unitRate: finiteOrNull(item?.unit_rate),
      amount: rawAmount == null ? null : direction === "credit" ? -Math.abs(rawAmount) : Math.abs(rawAmount),
      amountStatus: rawAmount == null ? "not_confirmed" : "confirmed",
      forecastable: item?.code !== "itaipu_art21",
      extraordinary: item?.code === "itaipu_art21"
    };
  });
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
