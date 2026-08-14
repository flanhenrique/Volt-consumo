import { DISPLAY_TEMPLATE, VALUE_MODEL, REGISTER_MODEL, classifyRegionCoarse, classifyRegionDirect, classifyRegionAccurate, localDarkMap, testScreenMetrics, glareMetrics, leftBorder, normalizedEdge } from "./meter-ocr-classifier.js?v=20260813.7";
import { canvasGray, buildIntegral, resizeIntegralRegion, regionMean, meanGap, argmax, scoreToConfidence, safeLog, yieldControl } from "./meter-ocr-image.js?v=20260813.7";

const SCREEN_WIDTH = 720;
const SCREEN_HEIGHT = 220;
const TEMPLATE_WIDTH = 96;
const TEMPLATE_HEIGHT = 32;

export async function analyzeMeterImage(file, options = {}) {
  if (!(file instanceof Blob)) return review("Selecione uma foto válida do medidor.", "invalid-image");
  if (options.meterType && options.meterType !== "energy") {
    return review("A leitura automática local está calibrada para o medidor de energia. Informe a leitura manualmente.", "unsupported-meter");
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return review("A leitura automática local não está disponível neste navegador. Informe a leitura manualmente.", "unsupported-browser");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const frame = renderBitmap(bitmap);
    const display = await locateDisplay(frame);
    if (!display) return review("Não consegui localizar o visor. Centralize o medidor e tire outra foto.", "display-not-found");

    const screen = cropDisplay(frame, display.box);
    const screenGray = canvasGray(screen);
    const darkMap = localDarkMap(screenGray, SCREEN_WIDTH, SCREEN_HEIGHT, 10);
    const test = testScreenMetrics(darkMap);
    if (test.mean > 0.17 && test.denseColumns > 0.48) {
      return review("O visor está na tela de teste. Aguarde aparecer o registro 03 em kWh e tire outra foto.", "test-screen");
    }

    const glare = glareMetrics(screenGray, SCREEN_WIDTH, SCREEN_HEIGHT);
    if (glare.bright245 > 0.012 || glare.maxBrightColumn > 0.18) {
      return review("Há reflexo sobre os dígitos. Mude levemente o ângulo e tire outra foto; não vou adivinhar a leitura.", "reflection");
    }

    const register = await readRegister(screenGray, darkMap);
    if (!register || register.code !== "03") {
      return review("O visor não está no registro 03 de kWh. Aguarde a tela correta e tire outra foto.", "wrong-register");
    }

    const reading = await readValue(screenGray, darkMap);
    if (!reading || !/^\d{5}$/.test(reading.text) || reading.score < -1.05) {
      return review("Não consegui confirmar todos os dígitos com segurança. Tire outra foto ou informe a leitura manualmente.", "low-confidence");
    }

    return {
      value: Number(reading.text),
      register: "03",
      unit: "kWh",
      confidence: scoreToConfidence(reading.score),
      requiresConfirmation: true,
      message: `Leitura sugerida: ${reading.text} kWh. Confira os dígitos na foto antes de salvar.`
    };
  } catch (error) {
    console.warn("Local meter OCR failed", error);
    return review("Não consegui ler esta foto com segurança. Tire outra foto ou informe a leitura manualmente.", "processing-error");
  } finally {
    bitmap?.close?.();
  }
}

function review(message, reason) {
  return { value: null, confidence: 0, requiresConfirmation: true, reason, message };
}

function renderBitmap(bitmap) {
  const maxWidth = 1100;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function locateDisplay(frame) {
  const half = document.createElement("canvas");
  half.width = Math.max(1, Math.round(frame.width * 0.5));
  half.height = Math.max(1, Math.round(frame.height * 0.5));
  const context = half.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, 0, 0, half.width, half.height);
  const gray = canvasGray(half);
  const integral = buildIntegral(gray, half.width, half.height);
  const template = DISPLAY_TEMPLATE;
  let bestScore = Infinity;
  let bestBox = null;
  let iterations = 0;

  for (let widthRatio = 0.40; widthRatio < 0.72; widthRatio += 0.04) {
    const windowWidth = Math.floor(half.width * widthRatio);
    for (const aspect of [2.8, 3.0, 3.2, 3.4, 3.6]) {
      const windowHeight = Math.floor(windowWidth / aspect);
      if (windowHeight < 30) continue;
      const yEnd = Math.floor(half.height * 0.52) - windowHeight;
      const xEnd = Math.floor(half.width * 0.94) - windowWidth;
      for (let y = Math.floor(half.height * 0.28); y <= yEnd; y += 6) {
        for (let x = Math.floor(half.width * 0.06); x <= xEnd; x += 8) {
          const patch = resizeIntegralRegion(integral, half.width, half.height, x, y, windowWidth, windowHeight, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
          const edge = normalizedEdge(patch, TEMPLATE_WIDTH, TEMPLATE_HEIGHT);
          let score = 0;
          for (let i = 0; i < edge.length; i += 1) score += Math.abs(edge[i] - template[i] / 255);
          score /= edge.length;
          if (score < bestScore) {
            bestScore = score;
            bestBox = { x: x * 2, y: y * 2, width: windowWidth * 2, height: windowHeight * 2 };
          }
          iterations += 1;
          if ((iterations & 255) === 0) await yieldControl();
        }
      }
    }
  }

  if (!bestBox || bestScore > 0.32) return null;
  return { box: bestBox, score: bestScore };
}

function cropDisplay(frame, box) {
  const expanded = expandBox(box, frame.width, frame.height);
  const canvas = document.createElement("canvas");
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, expanded.x, expanded.y, expanded.width, expanded.height, 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  return canvas;
}

function expandBox(box, maxWidth, maxHeight) {
  const left = box.width * 0.081;
  const right = box.width * 0.079;
  const top = box.height * 0.082;
  const bottom = box.height * 0.075;
  const x = Math.max(0, Math.round(box.x - left));
  const y = Math.max(0, Math.round(box.y - top));
  const x2 = Math.min(maxWidth, Math.round(box.x + box.width + right));
  const y2 = Math.min(maxHeight, Math.round(box.y + box.height + bottom));
  return { x, y, width: Math.max(1, x2 - x), height: Math.max(1, y2 - y) };
}

async function readRegister(gray, darkMap) {
  const coarse = [];
  const left = leftBorder(gray, SCREEN_WIDTH, SCREEN_HEIGHT);
  const integral = buildIntegral(gray, SCREEN_WIDTH, SCREEN_HEIGHT);
  for (const y of [0, 5, 10, 15]) {
    for (const height of [80, 85, 90, 95, 100]) {
      for (const width of [40, 42, 44, 46, 48, 50]) {
        for (let start = Math.max(5, left - 10); start <= Math.min(160, left + 10); start += 2) {
          const p0 = classifyRegionCoarse(integral, gray, start, y, width, height);
          const p1 = classifyRegionCoarse(integral, gray, start + width, y, width, height);
          const gap = regionMean(darkMap, SCREEN_WIDTH, SCREEN_HEIGHT, start + width - 2, y, 5, height);
          coarse.push(candidateRegister("03", [0, 3], p0, p1, start, width, y, height, left, gap));
          coarse.push(candidateRegister("24", [2, 4], p0, p1, start, width, y, height, left, gap));
        }
      }
    }
  }
  coarse.sort((a, b) => b.score - a.score);
  const accurate = [];
  for (const candidate of coarse.slice(0, 160)) {
    const p0 = classifyRegionAccurate(gray, candidate.start, candidate.y, candidate.width, candidate.height, REGISTER_MODEL);
    const p1 = classifyRegionAccurate(gray, candidate.start + candidate.width, candidate.y, candidate.width, candidate.height, REGISTER_MODEL);
    if (!p0 || !p1) continue;
    const digits = candidate.code === "03" ? [0, 3] : [2, 4];
    const score = safeLog(p0[digits[0]]) + safeLog(p1[digits[1]]) - 2 * candidate.gap - 0.03 * Math.abs(candidate.start - left);
    accurate.push({ ...candidate, score });
  }
  accurate.sort((a, b) => b.score - a.score);
  return accurate[0] || null;
}

function candidateRegister(code, digits, p0, p1, start, width, y, height, left, gap) {
  return {
    code,
    start,
    width,
    y,
    height,
    gap,
    score: safeLog(p0[digits[0]]) + safeLog(p1[digits[1]]) - 2 * gap - 0.03 * Math.abs(start - left)
  };
}

async function readValue(gray, darkMap) {
  const integral = buildIntegral(gray, SCREEN_WIDTH, SCREEN_HEIGHT);
  const coarse = [];
  let loops = 0;
  for (const y of [40, 45, 50, 55, 60, 65]) {
    for (const height of [130, 140, 150, 160]) {
      if (y + height > SCREEN_HEIGHT - 2) continue;
      for (const width of [54, 56, 58, 60, 62, 64, 66, 68, 70, 72]) {
        for (let start = 250; start <= 385; start += 10) {
          if (start + 5 * width > SCREEN_WIDTH - 5) continue;
          const digits = [];
          const probabilities = [];
          for (let index = 0; index < 5; index += 1) {
            const probs = classifyRegionCoarse(integral, gray, start + index * width, y, width, height);
            const best = argmax(probs);
            digits.push(best.index);
            probabilities.push(best.value);
          }
          const gap = meanGap(darkMap, start, width, y, height, 5);
          coarse.push({ start, width, y, height, gap, score: probabilities.reduce((sum, value) => sum + safeLog(value), 0) - 2 * gap, text: digits.join("") });
          loops += 1;
          if ((loops & 127) === 0) await yieldControl();
        }
      }
    }
  }
  coarse.sort((a, b) => b.score - a.score);

  const direct = [];
  for (const candidate of coarse.slice(0, 500)) {
    const digits = [];
    const probabilities = [];
    for (let index = 0; index < 5; index += 1) {
      const probs = classifyRegionDirect(gray, candidate.start + index * candidate.width, candidate.y, candidate.width, candidate.height);
      const best = argmax(probs);
      digits.push(best.index);
      probabilities.push(best.value);
    }
    direct.push({
      ...candidate,
      text: digits.join(""),
      score: probabilities.reduce((sum, value) => sum + safeLog(value), 0) - 2 * candidate.gap
    });
  }
  direct.sort((a, b) => b.score - a.score);

  const accurate = [];
  for (const candidate of direct.slice(0, 40)) {
    const digits = [];
    const probabilities = [];
    let valid = true;
    for (let index = 0; index < 5; index += 1) {
      const probs = classifyRegionAccurate(gray, candidate.start + index * candidate.width, candidate.y, candidate.width, candidate.height, VALUE_MODEL);
      if (!probs) { valid = false; break; }
      const best = argmax(probs);
      digits.push(best.index);
      probabilities.push(best.value);
    }
    if (!valid) continue;
    accurate.push({
      ...candidate,
      text: digits.join(""),
      score: probabilities.reduce((sum, value) => sum + safeLog(value), 0) - 2 * candidate.gap
    });
  }
  accurate.sort((a, b) => b.score - a.score);
  return accurate[0] || null;
}
