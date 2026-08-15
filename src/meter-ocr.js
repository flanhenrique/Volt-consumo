const NUMERIC_CANDIDATE = /\b[0-9OIl|]{3,10}(?:[.,][0-9OIl|]{1,3})?\b/g;
const OCR_RUNTIME_URL = new URL("../ocr-runtime.html?v=20260813.7", import.meta.url).href;
const OCR_TIMEOUT_MS = 120000;

let runtimeFramePromise = null;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function numericToken(value) {
  const normalized = String(value || "")
    .replace(/[O]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function candidateScore(candidate, context) {
  const key = normalizeText(context).toLocaleLowerCase("pt-BR");
  const integerDigits = String(Math.trunc(Math.abs(candidate))).length;
  let score = 0;

  if (integerDigits >= 4 && integerDigits <= 7) score += 24;
  else if (integerDigits === 3 || integerDigits === 8) score += 8;
  else score -= 16;

  if (/\bkwh\b|kw\s*h/.test(key)) score += 120;
  if (/\bm3\b|m³|metro[s]? cubico[s]?/.test(key)) score += 100;

  if (/kvarh|kvar|energia reativa|reativ[ao]/.test(key)) score -= 180;
  if (/\b(id|serie|serial|n[oº°]?|numero|medidor|inmetro|portaria|calibracao)\b/.test(key)) score -= 70;
  if (/\b(hz|volts?|tensao|ampere[s]?|classe|fases?|fios?)\b/.test(key)) score -= 55;
  if (/\d{1,2}\/\d{4}|\d{2}\/\d{2}\/\d{2,4}/.test(key)) score -= 55;
  if (/barcode|codigo de barras/.test(key)) score -= 80;

  return score;
}

function extractBestCandidate(textInput) {
  const text = String(textInput || "");
  const lines = text.split(/\r?\n/).map(normalizeText).filter(Boolean);
  const candidates = [];

  for (const line of lines) {
    const matches = [...line.matchAll(new RegExp(NUMERIC_CANDIDATE.source, "g"))];
    for (const match of matches) {
      const value = numericToken(match[0]);
      if (value == null) continue;
      const start = Math.max(0, (match.index || 0) - 48);
      const end = Math.min(line.length, (match.index || 0) + match[0].length + 48);
      const context = line.slice(start, end);
      candidates.push({ value, score: candidateScore(value, context), context });
    }
  }

  candidates.sort((left, right) => right.score - left.score || String(Math.trunc(right.value)).length - String(Math.trunc(left.value)).length);
  return candidates[0] || null;
}

function interpretMeterText(text, engine) {
  const normalized = normalizeText(text).toLocaleLowerCase("pt-BR");
  const reactiveOnly = /kvarh|energia reativa/.test(normalized) && !/\bkwh\b|kw\s*h/.test(normalized);
  if (reactiveOnly) {
    return {
      value: null,
      engine,
      message: "O visor parece estar mostrando energia reativa (kVArh), não a leitura em kWh. Aguarde o visor mostrar kWh e tire outra foto."
    };
  }

  const candidate = extractBestCandidate(text);
  if (!candidate || candidate.score < 15) {
    return {
      value: null,
      engine,
      message: "A foto foi processada, mas não encontrei uma leitura confiável no visor. Aproxime o medidor, evite reflexos e fotografe quando o valor em kWh ou m³ estiver visível."
    };
  }

  return {
    value: candidate.value,
    engine,
    message: "Valor sugerido pela imagem. Confira o visor antes de confirmar."
  };
}

async function analyzeWithNativeDetector(file) {
  if (!("TextDetector" in globalThis) || !("createImageBitmap" in globalThis)) return null;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new globalThis.TextDetector();
      const blocks = await detector.detect(bitmap);
      const text = blocks.map((block) => String(block.rawValue || "")).filter(Boolean).join("\n");
      if (!text.trim()) return null;
      const result = interpretMeterText(text, "native_text_detector");
      return result.value !== null ? result : null;
    } finally {
      bitmap.close?.();
    }
  } catch {
    return null;
  }
}

function ensureRuntimeFrame() {
  if (runtimeFramePromise) return runtimeFramePromise;
  runtimeFramePromise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("document_unavailable"));
      return;
    }
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.title = "Processador OCR local do VOLT";
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.referrerPolicy = "no-referrer";
    frame.src = OCR_RUNTIME_URL;
    const timer = setTimeout(() => {
      frame.remove();
      runtimeFramePromise = null;
      reject(new Error("ocr_runtime_timeout"));
    }, 20000);
    frame.addEventListener("load", () => {
      clearTimeout(timer);
      resolve(frame);
    }, { once: true });
    frame.addEventListener("error", () => {
      clearTimeout(timer);
      frame.remove();
      runtimeFramePromise = null;
      reject(new Error("ocr_runtime_load_failed"));
    }, { once: true });
    document.body.append(frame);
  });
  return runtimeFramePromise;
}

async function analyzeWithFallbackRuntime(file) {
  const frame = await ensureRuntimeFrame();
  if (!frame.contentWindow || typeof MessageChannel === "undefined") throw new Error("ocr_runtime_unavailable");

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(new Error("ocr_timeout"));
    }, OCR_TIMEOUT_MS);

    channel.port1.onmessage = (event) => {
      const payload = event.data || {};
      if (payload.type !== "result") return;
      clearTimeout(timeout);
      channel.port1.close();
      if (!payload.ok) {
        reject(new Error(payload.error || "ocr_failed"));
        return;
      }
      resolve(interpretMeterText(payload.text || "", payload.engine || "tesseract_wasm"));
    };
    channel.port1.start?.();
    frame.contentWindow.postMessage({ type: "volt-ocr-analyze", file }, "*", [channel.port2]);
  });
}

export async function analyzeMeterImage(file) {
  if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
    return { value: null, message: "Escolha uma imagem válida do medidor." };
  }

  const native = await analyzeWithNativeDetector(file);
  if (native) return native;

  try {
    return await analyzeWithFallbackRuntime(file);
  } catch {
    return {
      value: null,
      message: "Não consegui concluir a leitura automática desta foto. Tente novamente com o visor bem enquadrado, sem reflexos e com kWh ou m³ visível; se necessário, informe o valor manualmente."
    };
  }
}
