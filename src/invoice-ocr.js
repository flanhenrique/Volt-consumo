const MONEY = /(?:R\$\s*)?(-?\d{1,6}(?:\.\d{3})*,\d{2})/i;
const NUMBER = /(-?\d+(?:[.,]\d+)?)/;
const DATE = /(\d{2}\/\d{2}\/\d{4})/;
const OCR_RUNTIME_URL = new URL("../ocr-runtime.html?v=20260813.7", import.meta.url).href;
const OCR_TIMEOUT_MS = 120000;

let runtimeFramePromise = null;

function normalizeText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function keyText(value) { return normalizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR"); }
function parsePtNumber(value) { const clean = String(value || "").replace(/R\$/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."); const number = Number(clean); return Number.isFinite(number) ? number : null; }
function isoDate(value) { const match = String(value || "").match(DATE); if (!match) return null; const [day, month, year] = match[1].split("/"); return `${year}-${month}-${day}`; }
function amountFromLine(line) { const matches = [...String(line || "").matchAll(new RegExp(MONEY.source, "gi"))]; return matches.length ? parsePtNumber(matches.at(-1)?.[1]) : null; }
function quantityFromLine(line) { const match = String(line || "").match(/(-?\d+(?:[.,]\d+)?)\s*(kwh|m3|m³)\b/i); if (!match) return { quantity: null, quantityUnit: null }; return { quantity: parsePtNumber(match[1]), quantityUnit: /kwh/i.test(match[2]) ? "kWh" : "m3" }; }
function billedConsumptionFromLine(line) {
  const source = String(line || "");
  const patterns = [/(?:consumo\s*)?\(?kwh\)?\s*[:=-]?\s*(\d+(?:[.,]\d+)?)/i, /(\d+(?:[.,]\d+)?)\s*kwh\b/i, /^\s*consumo\s+(\d+(?:[.,]\d+)?)\s+(?:a\b|x\b|r\$|=)/i];
  for (const pattern of patterns) { const match = source.match(pattern); if (match) return parsePtNumber(match[1]); }
  return null;
}
function unitRateFromLine(line) { const source = String(line || ""); const explicit = source.match(/(?:r\$\s*)?(\d+[.,]\d{4,8})\s*(?:r\$\s*\/\s*)?(?:kwh|m3|m³)/i); if (explicit) return parsePtNumber(explicit[1]); const decimals = [...source.matchAll(/(?<!\d)(\d+[.,]\d{4,8})(?!\d)/g)]; return decimals.length ? parsePtNumber(decimals.at(-1)?.[1]) : null; }
function percentageFromLine(line) { const match = String(line || "").match(/(-?\d+(?:[.,]\d+)?)\s*%/); return match ? parsePtNumber(match[1]) : null; }
function numberAfter(line, pattern) { const normalized = keyText(line); const index = normalized.search(pattern); if (index < 0) return null; const tail = normalized.slice(index).match(NUMBER); return tail ? parsePtNumber(tail[1]) : null; }

function classifyLine(line) {
  const key = keyText(line);
  const definitions = [
    ["icms", /\bicms\b/, "tax", "charge"], ["pis", /\bpis\b/, "tax", "charge"], ["cofins", /cofins/, "tax", "charge"],
    ["lighting_fee", /iluminacao|cosip|cip\b/, "lighting", "charge"], ["sewer", /esgoto/, "sewer", "charge"], ["tariff_flag", /bandeira/, "flag", "charge"],
    ["social_subsidy", /subvencao.*baixa renda|baixa renda.*subvencao/, "benefit", "credit"], ["social_tariff", /tarifa social/, "benefit", "credit"],
    ["itaipu_bonus", /itaipu|10\.438|art\.?\s*21/, "credit", "credit"], ["compensation", /compensacao|credito de energia|saldo de energia/, "credit", "credit"],
    ["energy_charge", /energia.*kwh|energia eletrica|energia ativa|\btusd\b|\bte\b|^consumo\b.*(?:r\$|=)/, "energy", "charge"],
    ["water_charge", /agua.*(?:m3|m³)|agua faturada|tarifa de agua/, "water", "charge"], ["other_fee", /multa|juros|taxa|encargo/, "fee", "charge"]
  ];
  for (const [code, matcher, category, direction] of definitions) if (matcher.test(key)) return { code, category, direction };
  return null;
}
function confidenceFor(value, high = 0.9) { return value == null || value === "" ? 0 : high; }
function hasUsefulInvoiceData(fields) { return Boolean(fields?.provider || fields?.cycleStart || fields?.cycleEnd || fields?.previousReading != null || fields?.currentReading != null || fields?.billedConsumption != null || fields?.invoiceTotal != null || fields?.dueDate || fields?.items?.length); }

export function extractInvoiceFieldsFromLines(linesInput) {
  const lines = (Array.isArray(linesInput) ? linesInput : String(linesInput || "").split(/\r?\n/)).map(normalizeText).filter(Boolean);
  const joined = lines.join("\n"); const key = keyText(joined);
  const fields = { provider: null, customerClass: null, cycleStart: null, cycleEnd: null, previousReading: null, currentReading: null, billedConsumption: null, billingMethod: null, invoiceTotal: null, dueDate: null, items: [] };
  const providerLine = lines.find((line) => /energia|aguas|saneamento|samae|celesc|ambar|amazonas/i.test(line) && line.length < 100); if (providerLine) fields.provider = providerLine;
  const classLine = lines.find((line) => /classe|subclasse|residencial|rural/i.test(line)); if (classLine) fields.customerClass = classLine;
  const cycleLine = lines.find((line) => /periodo|ciclo|leitura anterior|leitura atual/i.test(line) && (line.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length >= 2);
  if (cycleLine) { const dates = cycleLine.match(/\d{2}\/\d{2}\/\d{4}/g) || []; fields.cycleStart = isoDate(dates[0]); fields.cycleEnd = isoDate(dates[1]); }
  for (const line of lines) {
    const lineKey = keyText(line);
    if (!fields.dueDate && /vencimento/.test(lineKey)) fields.dueDate = isoDate(line);
    if (fields.previousReading == null && /leitura anterior/.test(lineKey)) fields.previousReading = numberAfter(line, /leitura anterior/);
    if (fields.currentReading == null && /leitura atual|leitura atualizada/.test(lineKey)) fields.currentReading = numberAfter(line, /leitura atual/);
    if (fields.billedConsumption == null && /consumo|\bkwh\b|\bm3\b|m³/.test(lineKey)) fields.billedConsumption = billedConsumptionFromLine(line);
    if (!fields.billingMethod && /media|estimad|leitura real|medido/.test(lineKey)) fields.billingMethod = /media|estimad/.test(lineKey) ? "average" : "metered";
    if (/total a pagar|valor total|total da fatura/.test(lineKey)) { const amount = amountFromLine(line); if (amount != null) fields.invoiceTotal = Math.abs(amount); }
    const classification = classifyLine(line);
    if (classification) {
      const amount = amountFromLine(line); let { quantity, quantityUnit } = quantityFromLine(line); const unitRate = unitRateFromLine(line); const percentage = percentageFromLine(line);
      const informationalFlag = classification.code === "tariff_flag" && /\binfo\b|informativ/.test(lineKey);
      if (classification.code === "energy_charge" && quantity == null) { const inferred = billedConsumptionFromLine(line); if (inferred != null) { quantity = inferred; quantityUnit = "kWh"; } }
      fields.items.push({ ...classification, direction: informationalFlag ? "neutral" : classification.direction, informational: informationalFlag, label: line.slice(0, 160), quantity, quantityUnit, unitRate, percentage, amount: amount == null ? null : Math.abs(amount), confidence: amount == null ? "probable" : "confirmed" });
    }
  }
  if (fields.billedConsumption == null) fields.billedConsumption = lines.map(billedConsumptionFromLine).find((value) => value != null) ?? null;
  if (fields.billedConsumption == null) { const match = key.match(/(\d+(?:[.,]\d+)?)\s*kwh/); if (match) fields.billedConsumption = parsePtNumber(match[1]); }
  const fieldConfidence = { provider: confidenceFor(fields.provider, 0.65), customerClass: confidenceFor(fields.customerClass, 0.6), cycleStart: confidenceFor(fields.cycleStart), cycleEnd: confidenceFor(fields.cycleEnd), previousReading: confidenceFor(fields.previousReading, 0.8), currentReading: confidenceFor(fields.currentReading, 0.8), billedConsumption: confidenceFor(fields.billedConsumption, 0.8), billingMethod: confidenceFor(fields.billingMethod, 0.7), invoiceTotal: confidenceFor(fields.invoiceTotal, 0.9), dueDate: confidenceFor(fields.dueDate, 0.8) };
  return { fields, fieldConfidence, lineCount: lines.length };
}

async function analyzeWithNativeDetector(file) {
  if (!("TextDetector" in globalThis) || !("createImageBitmap" in globalThis)) return null;
  try { const bitmap = await createImageBitmap(file); try { const detector = new globalThis.TextDetector(); const blocks = await detector.detect(bitmap); const lines = blocks.map((block) => normalizeText(block.rawValue)).filter(Boolean); if (!lines.length) return null; const result = extractInvoiceFieldsFromLines(lines); if (!hasUsefulInvoiceData(result.fields)) return null; return { ...result, engine: "native_text_detector" }; } finally { bitmap.close?.(); } } catch { return null; }
}
function ensureRuntimeFrame() {
  if (runtimeFramePromise) return runtimeFramePromise;
  runtimeFramePromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") { reject(new Error("document_unavailable")); return; }
    const frame = document.createElement("iframe"); frame.hidden = true; frame.title = "Processador OCR local do VOLT"; frame.setAttribute("sandbox", "allow-scripts"); frame.referrerPolicy = "no-referrer"; frame.src = OCR_RUNTIME_URL;
    const timer = setTimeout(() => { frame.remove(); runtimeFramePromise = null; reject(new Error("ocr_runtime_timeout")); }, 20000);
    frame.addEventListener("load", () => { clearTimeout(timer); resolve(frame); }, { once: true });
    frame.addEventListener("error", () => { clearTimeout(timer); frame.remove(); runtimeFramePromise = null; reject(new Error("ocr_runtime_load_failed")); }, { once: true });
    document.body.append(frame);
  });
  return runtimeFramePromise;
}
async function analyzeWithFallbackRuntime(file, onProgress) {
  const frame = await ensureRuntimeFrame(); if (!frame.contentWindow || typeof MessageChannel === "undefined") throw new Error("ocr_runtime_unavailable");
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel(); const timeout = setTimeout(() => { channel.port1.close(); reject(new Error("ocr_timeout")); }, OCR_TIMEOUT_MS);
    channel.port1.onmessage = (event) => { const payload = event.data || {}; if (payload.type === "progress") { if (typeof onProgress === "function") onProgress({ status: payload.status, progress: payload.fraction }); return; } if (payload.type !== "result") return; clearTimeout(timeout); channel.port1.close(); if (!payload.ok) { reject(new Error(payload.error || "ocr_failed")); return; } const result = extractInvoiceFieldsFromLines(String(payload.text || "").split(/\r?\n/)); if (!hasUsefulInvoiceData(result.fields)) { resolve(null); return; } resolve({ ...result, engine: payload.engine || "tesseract_wasm" }); };
    channel.port1.start?.(); frame.contentWindow.postMessage({ type: "volt-ocr-analyze", file }, "*", [channel.port2]);
  });
}
export async function analyzeInvoiceImage(file, options = {}) {
  if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) return { supported: false, fields: null, fieldConfidence: {}, message: "Escolha uma imagem válida da fatura." };
  const onProgress = typeof options?.onProgress === "function" ? options.onProgress : null;
  try {
    onProgress?.({ status: "Tentando leitura rápida no aparelho…", progress: 0.01 }); const native = await analyzeWithNativeDetector(file);
    if (native) return { supported: true, ...native, message: native.fields?.invoiceTotal == null ? "A fatura foi lida parcialmente. Revise os campos antes de confirmar." : "Dados sugeridos pela imagem. Revise antes de confirmar." };
    onProgress?.({ status: "Ativando OCR compatível com iPhone…", progress: 0.03 }); const fallback = await analyzeWithFallbackRuntime(file, onProgress);
    if (!fallback) return { supported: true, fields: null, fieldConfidence: {}, engine: "tesseract_wasm", message: "A foto foi processada, mas não encontrei dados confiáveis. Tente uma imagem mais nítida e enquadre a fatura inteira." };
    return { supported: true, ...fallback, message: fallback.fields?.invoiceTotal == null ? "A fatura foi lida parcialmente no aparelho. Revise os campos antes de confirmar." : "Dados sugeridos pela imagem. Revise antes de confirmar." };
  } catch { return { supported: true, fields: null, fieldConfidence: {}, message: "Não consegui concluir a leitura automática desta foto. A imagem não foi salva; tente novamente com a fatura inteira, bem iluminada e sem inclinação." }; }
}
