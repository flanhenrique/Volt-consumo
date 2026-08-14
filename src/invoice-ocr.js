const MONEY = /(?:R\$\s*)?(-?\d{1,6}(?:\.\d{3})*,\d{2})/i;
const NUMBER = /(-?\d+(?:[.,]\d+)?)/;
const DATE = /(\d{2}\/\d{2}\/\d{4})/;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function keyText(value) {
  return normalizeText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function parsePtNumber(value) {
  const clean = String(value || "").replace(/R\$/gi, "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const number = Number(clean);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  const match = String(value || "").match(DATE);
  if (!match) return null;
  const [day, month, year] = match[1].split("/");
  return `${year}-${month}-${day}`;
}

function amountFromLine(line) {
  const matches = [...String(line || "").matchAll(new RegExp(MONEY.source, "gi"))];
  return matches.length ? parsePtNumber(matches.at(-1)?.[1]) : null;
}

function numberAfter(line, pattern) {
  const normalized = keyText(line);
  const index = normalized.search(pattern);
  if (index < 0) return null;
  const tail = normalized.slice(index).match(NUMBER);
  return tail ? parsePtNumber(tail[1]) : null;
}

function classifyLine(line) {
  const key = keyText(line);
  const definitions = [
    ["icms", /\bicms\b/, "tax", "charge"],
    ["pis", /\bpis\b/, "tax", "charge"],
    ["cofins", /cofins/, "tax", "charge"],
    ["lighting_fee", /iluminacao|cosip|cip\b/, "lighting", "charge"],
    ["sewer", /esgoto/, "sewer", "charge"],
    ["tariff_flag", /bandeira/, "flag", "charge"],
    ["social_subsidy", /subvencao.*baixa renda|baixa renda.*subvencao/, "benefit", "credit"],
    ["social_tariff", /tarifa social/, "benefit", "credit"],
    ["itaipu_bonus", /itaipu|10\.438|art\.?\s*21/, "credit", "credit"],
    ["compensation", /compensacao|credito de energia|saldo de energia/, "credit", "credit"],
    ["other_fee", /multa|juros|taxa|encargo/, "fee", "charge"]
  ];
  for (const [code, matcher, category, direction] of definitions) {
    if (matcher.test(key)) return { code, category, direction };
  }
  return null;
}

function confidenceFor(value, high = 0.9) {
  return value == null || value === "" ? 0 : high;
}

export function extractInvoiceFieldsFromLines(linesInput) {
  const lines = (Array.isArray(linesInput) ? linesInput : String(linesInput || "").split(/\r?\n/)).map(normalizeText).filter(Boolean);
  const joined = lines.join("\n");
  const key = keyText(joined);
  const fields = {
    provider: null,
    customerClass: null,
    cycleStart: null,
    cycleEnd: null,
    previousReading: null,
    currentReading: null,
    billedConsumption: null,
    billingMethod: null,
    invoiceTotal: null,
    dueDate: null,
    items: []
  };

  const providerLine = lines.find((line) => /energia|aguas|saneamento|samae|celesc|ambar|amazonas/i.test(line) && line.length < 100);
  if (providerLine) fields.provider = providerLine;

  const classLine = lines.find((line) => /classe|subclasse|residencial|rural/i.test(line));
  if (classLine) fields.customerClass = classLine;

  const cycleLine = lines.find((line) => /periodo|ciclo|leitura anterior|leitura atual/i.test(line) && (line.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length >= 2);
  if (cycleLine) {
    const dates = cycleLine.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    fields.cycleStart = isoDate(dates[0]);
    fields.cycleEnd = isoDate(dates[1]);
  }

  for (const line of lines) {
    const lineKey = keyText(line);
    if (!fields.dueDate && /vencimento/.test(lineKey)) fields.dueDate = isoDate(line);
    if (fields.previousReading == null && /leitura anterior/.test(lineKey)) fields.previousReading = numberAfter(line, /leitura anterior/);
    if (fields.currentReading == null && /leitura atual|leitura atualizada/.test(lineKey)) fields.currentReading = numberAfter(line, /leitura atual/);
    if (fields.billedConsumption == null && /consumo.*kwh|kwh.*consumo|consumo.*m3/.test(lineKey)) {
      const candidates = [...line.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kwh|m3|m³)/gi)];
      if (candidates.length) fields.billedConsumption = parsePtNumber(candidates[0][1]);
    }
    if (!fields.billingMethod && /media|estimad|leitura real|medido/.test(lineKey)) {
      fields.billingMethod = /media|estimad/.test(lineKey) ? "average" : "metered";
    }
    if (/total a pagar|valor total|total da fatura/.test(lineKey)) {
      const amount = amountFromLine(line);
      if (amount != null) fields.invoiceTotal = Math.abs(amount);
    }

    const classification = classifyLine(line);
    if (classification) {
      const amount = amountFromLine(line);
      fields.items.push({
        ...classification,
        label: line.slice(0, 120),
        amount: amount == null ? null : Math.abs(amount),
        confidence: amount == null ? "probable" : "confirmed"
      });
    }
  }

  if (fields.billedConsumption == null) {
    const match = key.match(/(\d+(?:[.,]\d+)?)\s*kwh/);
    if (match) fields.billedConsumption = parsePtNumber(match[1]);
  }

  const fieldConfidence = {
    provider: confidenceFor(fields.provider, 0.65),
    customerClass: confidenceFor(fields.customerClass, 0.6),
    cycleStart: confidenceFor(fields.cycleStart),
    cycleEnd: confidenceFor(fields.cycleEnd),
    previousReading: confidenceFor(fields.previousReading, 0.8),
    currentReading: confidenceFor(fields.currentReading, 0.8),
    billedConsumption: confidenceFor(fields.billedConsumption, 0.8),
    billingMethod: confidenceFor(fields.billingMethod, 0.7),
    invoiceTotal: confidenceFor(fields.invoiceTotal, 0.9),
    dueDate: confidenceFor(fields.dueDate, 0.8)
  };

  return { fields, fieldConfidence, lineCount: lines.length };
}

export async function analyzeInvoiceImage(file) {
  if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
    return { supported: false, fields: null, fieldConfidence: {}, message: "Escolha uma imagem válida da fatura." };
  }
  if (!("TextDetector" in globalThis) || !("createImageBitmap" in globalThis)) {
    return {
      supported: false,
      fields: null,
      fieldConfidence: {},
      message: "A leitura automática de fatura não está disponível neste navegador. Informe o total manualmente."
    };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const detector = new globalThis.TextDetector();
    const blocks = await detector.detect(bitmap);
    bitmap.close?.();
    const lines = blocks.map((block) => normalizeText(block.rawValue)).filter(Boolean);
    const result = extractInvoiceFieldsFromLines(lines);
    return {
      supported: true,
      ...result,
      message: result.fields?.invoiceTotal == null
        ? "A fatura foi lida parcialmente. Revise os campos antes de confirmar."
        : "Dados sugeridos pela imagem. Revise antes de confirmar."
    };
  } catch {
    return {
      supported: true,
      fields: null,
      fieldConfidence: {},
      message: "A imagem não pôde ser interpretada. Informe o total manualmente."
    };
  }
}
