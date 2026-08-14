const NUMERIC_CANDIDATE = /\b\d{3,10}(?:[.,]\d{1,3})?\b/g;
const REGISTER_CODE = /\b(0?3|24)\b/;
const SEGMENTS = Object.freeze({
  0: [1, 1, 1, 1, 1, 1, 0],
  1: [0, 1, 1, 0, 0, 0, 0],
  2: [1, 1, 0, 1, 1, 0, 1],
  3: [1, 1, 1, 1, 0, 0, 1],
  4: [0, 1, 1, 0, 0, 1, 1],
  5: [1, 0, 1, 1, 0, 1, 1],
  6: [1, 0, 1, 1, 1, 1, 1],
  7: [1, 1, 1, 0, 0, 0, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1]
});
const SEGMENT_ZONES = Object.freeze([
  [.20, .04, .80, .20],
  [.70, .13, .96, .47],
  [.68, .53, .94, .87],
  [.18, .82, .78, .98],
  [.02, .53, .28, .89],
  [.04, .13, .30, .47],
  [.18, .42, .80, .60]
]);

export async function analyzeMeterImage(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return rejected("Escolha uma imagem válida do medidor.", "invalid-image");
  }
  if (!("createImageBitmap" in globalThis)) {
    return rejected("Este navegador não consegue preparar a imagem para leitura automática.", "bitmap-unavailable");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const frame = renderFrame(bitmap);
    const quality = inspectQuality(frame);
    if (quality.tooDark) return rejected("A foto está escura demais. Tire outra foto com mais luz.", "too-dark", quality);
    if (quality.glare >= .22) return rejected("Há reflexo forte sobre o visor. Mude o ângulo e tire outra foto.", "glare", quality);
    if (quality.sharpness < 5.5) return rejected("A foto está desfocada. Aproxime o medidor e tente novamente.", "blur", quality);

    const lcd = cropMeterDisplay(frame);
    const segmentReading = recognizeSevenSegmentValue(lcd);
    const detected = await detectTextMetadata(lcd, frame);
    return decideReading(segmentReading, detected, quality);
  } catch {
    return rejected("A foto não pôde ser analisada. Tire outra foto ou informe a leitura manualmente.", "processing-error");
  } finally {
    bitmap?.close?.();
  }
}

function renderFrame(bitmap) {
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / Math.max(bitmap.width, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context, width, height };
}

function cropMeterDisplay(frame) {
  const x = Math.round(frame.width * .08);
  const y = Math.round(frame.height * .31);
  const width = Math.round(frame.width * .76);
  const height = Math.round(frame.height * .18);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(frame.canvas, x, y, width, height, 0, 0, width, height);
  return { canvas, context, width, height };
}

function inspectQuality(frame) {
  const image = frame.context.getImageData(0, 0, frame.width, frame.height);
  const { data, width, height } = image;
  let sum = 0;
  let glare = 0;
  let gradient = 0;
  let samples = 0;
  const step = Math.max(1, Math.floor(Math.max(width, height) / 450));

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const i = (y * width + x) * 4;
      const current = luminance(data, i);
      sum += current;
      if (current >= 248) glare += 1;
      const right = luminance(data, i + step * 4);
      const down = luminance(data, i + step * width * 4);
      gradient += Math.abs(current - right) + Math.abs(current - down);
      samples += 1;
    }
  }

  const brightness = samples ? sum / samples : 0;
  return {
    brightness,
    glare: samples ? glare / samples : 1,
    sharpness: samples ? gradient / samples : 0,
    tooDark: brightness < 42
  };
}

function recognizeSevenSegmentValue(lcd) {
  const gray = grayscale(lcd.context.getImageData(0, 0, lcd.width, lcd.height));
  const darkness = localDarkness(gray, lcd.width, lcd.height, 9);
  const integral = integralImage(darkness, lcd.width, lcd.height);
  let best = null;

  const minHeight = Math.max(34, Math.floor(lcd.height * .20));
  const maxHeight = Math.max(minHeight, Math.floor(lcd.height * .43));

  for (let digitHeight = minHeight; digitHeight <= maxHeight; digitHeight += 8) {
    const digitWidth = Math.max(17, Math.round(digitHeight * .50));
    for (const pitchMultiplier of [.98, 1.06, 1.14]) {
      const pitch = Math.max(digitWidth + 1, Math.round(digitWidth * pitchMultiplier));
      const totalWidth = pitch * 4 + digitWidth;
      const xStart = Math.floor(lcd.width * .38);
      const xEnd = Math.floor(lcd.width * .94) - totalWidth;
      if (xEnd <= xStart) continue;

      for (let y = Math.floor(lcd.height * .28); y <= Math.floor(lcd.height * .62); y += 8) {
        for (let x = xStart; x <= xEnd; x += 8) {
          const digits = [];
          const scores = [];
          const margins = [];

          for (let index = 0; index < 5; index += 1) {
            const sample = classifyDigit(integral, lcd.width, lcd.height, x + pitch * index, y, digitWidth, digitHeight);
            digits.push(sample.digit);
            scores.push(sample.score);
            margins.push(sample.margin);
          }

          const meanScore = mean(scores);
          const score = meanScore + mean(margins) * .25 - standardDeviation(scores) * .15;
          if (!best || score > best.score) {
            best = {
              value: Number(digits.join("")),
              text: digits.join(""),
              score,
              margin: mean(margins),
              confidence: sevenSegmentConfidence(score, mean(margins)),
              bounds: { x, y, width: totalWidth, height: digitHeight }
            };
          }
        }
      }
    }
  }

  return best;
}

function classifyDigit(integral, width, height, x, y, digitWidth, digitHeight) {
  const values = SEGMENT_ZONES.map(([x0, y0, x1, y1]) => rectMean(
    integral,
    width,
    height,
    Math.round(x + x0 * digitWidth),
    Math.round(y + y0 * digitHeight),
    Math.round(x + x1 * digitWidth),
    Math.round(y + y1 * digitHeight)
  ));

  let best = { digit: 0, score: -Infinity };
  let second = -Infinity;

  for (const [digitText, pattern] of Object.entries(SEGMENTS)) {
    const active = [];
    const inactive = [];
    pattern.forEach((enabled, index) => (enabled ? active : inactive).push(values[index]));
    const activeMean = mean(active);
    const inactiveMean = inactive.length ? mean(inactive) : mean(values) * .35;
    const score = activeMean - inactiveMean + Math.min(...active) * .15;

    if (score > best.score) {
      second = best.score;
      best = { digit: Number(digitText), score };
    } else if (score > second) {
      second = score;
    }
  }

  return { ...best, margin: best.score - second };
}

async function detectTextMetadata(lcd, frame) {
  if (!("TextDetector" in globalThis)) return { available: false, text: "", candidates: [], register: null, unit: null, test: false };

  try {
    const detector = new globalThis.TextDetector();
    const groups = [];
    for (const source of [lcd.canvas, frame.canvas]) {
      const blocks = await detector.detect(source);
      groups.push(...blocks.map((block) => String(block.rawValue || "").trim()).filter(Boolean));
    }
    const text = groups.join(" ").toUpperCase();
    const candidates = groups
      .flatMap((group) => group.match(NUMERIC_CANDIDATE) || [])
      .map((candidate) => Number(candidate.replace(",", ".")))
      .filter(Number.isFinite)
      .filter((value) => value >= 1000 && value <= 99999999);

    const registerMatch = text.match(REGISTER_CODE);
    const unit = /\bKVARH\b/.test(text) ? "kVArh" : /\bKWH\b/.test(text) ? "kWh" : null;
    return {
      available: true,
      text,
      candidates: [...new Set(candidates)],
      register: registerMatch ? registerMatch[1].padStart(2, "0") : null,
      unit,
      test: /\bTEST\b/.test(text) || /888888/.test(text.replace(/\D/g, ""))
    };
  } catch {
    return { available: false, text: "", candidates: [], register: null, unit: null, test: false };
  }
}

function decideReading(segmentReading, detected, quality) {
  if (detected.test) {
    return rejected("O medidor está na tela de teste. Aguarde aparecer a leitura de consumo em kWh.", "test-screen", quality, detected);
  }
  if (detected.register === "24" || detected.unit === "kVArh") {
    return rejected("Esta tela mostra energia reativa (kVArh), não a leitura de consumo. Aguarde o registro 03 em kWh.", "wrong-register", quality, detected);
  }

  const detectorValue = chooseDetectorValue(detected);
  const registerConfirmed = detected.register === "03" || detected.unit === "kWh";

  if (segmentReading && segmentReading.confidence >= .84 && (!detected.available || registerConfirmed)) {
    if (detectorValue !== null && detectorValue !== segmentReading.value) {
      return rejected("A imagem gerou duas leituras diferentes. Tire outra foto para evitar registrar um valor incorreto.", "conflicting-readings", quality, detected, segmentReading);
    }
    return accepted(segmentReading.value, segmentReading.confidence, "seven-segment", quality, detected, segmentReading);
  }

  if (registerConfirmed && detectorValue !== null) {
    return accepted(detectorValue, .78, "text-detector-validated", quality, detected, segmentReading);
  }

  return rejected(
    "Não foi possível confirmar o registro 03 em kWh com segurança. Tire outra foto mais reta ou informe a leitura manualmente.",
    "low-confidence",
    quality,
    detected,
    segmentReading
  );
}

function chooseDetectorValue(detected) {
  if (!detected?.candidates?.length) return null;
  const plausible = detected.candidates
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => String(Math.trunc(right)).length - String(Math.trunc(left)).length);
  return plausible[0] ?? null;
}

function accepted(value, confidence, method, quality, detected, segmentReading) {
  return {
    value,
    confidence,
    status: "suggested",
    reason: null,
    method,
    quality,
    detected: sanitizeDetected(detected),
    segmentReading,
    message: `Leitura sugerida com ${Math.round(confidence * 100)}% de confiança. Confira o visor antes de confirmar.`
  };
}

function rejected(message, reason, quality = null, detected = null, segmentReading = null) {
  return {
    value: null,
    confidence: 0,
    status: "review",
    reason,
    method: null,
    quality,
    detected: sanitizeDetected(detected),
    segmentReading,
    message
  };
}

function sanitizeDetected(detected) {
  if (!detected) return null;
  return {
    available: Boolean(detected.available),
    register: detected.register || null,
    unit: detected.unit || null,
    test: Boolean(detected.test),
    candidates: Array.isArray(detected.candidates) ? detected.candidates.slice(0, 8) : []
  };
}

function createCanvas(width, height) {
  if ("OffscreenCanvas" in globalThis) return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function luminance(data, index) {
  return data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
}

function grayscale(imageData) {
  const output = new Float32Array(imageData.width * imageData.height);
  for (let pixel = 0, source = 0; pixel < output.length; pixel += 1, source += 4) {
    output[pixel] = luminance(imageData.data, source);
  }
  return output;
}

function localDarkness(gray, width, height, radius) {
  const sourceIntegral = integralImage(gray, width, height);
  const output = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const background = rectMean(sourceIntegral, width, height, x - radius, y - radius, x + radius + 1, y + radius + 1);
      output[y * width + x] = Math.max(0, background - gray[y * width + x]);
    }
  }
  return output;
}

function integralImage(values, width, height) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += values[(y - 1) * width + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
    }
  }
  return integral;
}

function rectMean(integral, width, height, x0, y0, x1, y1) {
  const left = Math.max(0, Math.min(width, x0));
  const top = Math.max(0, Math.min(height, y0));
  const right = Math.max(left + 1, Math.min(width, x1));
  const bottom = Math.max(top + 1, Math.min(height, y1));
  const stride = width + 1;
  const sum =
    integral[bottom * stride + right] -
    integral[top * stride + right] -
    integral[bottom * stride + left] +
    integral[top * stride + left];
  return sum / ((right - left) * (bottom - top));
}

function sevenSegmentConfidence(score, margin) {
  const scorePart = clamp((score - 13) / 10, 0, 1);
  const marginPart = clamp((margin - 2) / 8, 0, 1);
  return clamp(scorePart * .72 + marginPart * .28, 0, .99);
}

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function standardDeviation(values) {
  if (!values.length) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
