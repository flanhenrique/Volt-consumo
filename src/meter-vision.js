const CRONOS_7023 = Object.freeze({
  id: "cronos-7023",
  expectedRegister: "03",
  expectedUnit: "kWh",
  displaySearch: Object.freeze({ x0: .08, y0: .28, x1: .92, y1: .50 }),
  lcdAspect: Object.freeze({ min: 2.45, max: 3.35 }),
  minComponentRatio: .025
});

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
  [.20, .03, .80, .19],
  [.70, .12, .97, .47],
  [.69, .53, .96, .88],
  [.19, .82, .81, .99],
  [.03, .53, .30, .89],
  [.04, .12, .31, .47],
  [.19, .42, .81, .60]
]);

export async function analyzeCronos7023(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return review("invalid-image", "Escolha uma foto válida do medidor.");
  }
  if (!("createImageBitmap" in globalThis)) {
    return review("unsupported-browser", "A leitura visual não está disponível neste navegador.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const frame = renderBitmap(bitmap, 900);
    const quality = inspectFrame(frame);
    if (quality.brightness < 38) return review("too-dark", "A foto está escura demais.", { quality });
    if (quality.sharpness < 4.8) return review("blur", "A foto está desfocada.", { quality });

    const lcd = locateLcd(frame, CRONOS_7023);
    if (!lcd) return review("lcd-not-found", "Não consegui localizar o visor com segurança.", { quality });
    if (lcd.confidence < .62) return review("lcd-low-confidence", "O visor não está enquadrado com confiança suficiente.", { quality, lcd: publicLcd(lcd) });

    const register = readDigits(lcd, { count: 2, x0: .01, x1: .31, y0: .02, y1: .58 });
    const value = readDigits(lcd, { count: 5, x0: .35, x1: .99, y0: .20, y1: .92 });

    if (!register || register.confidence < .58) {
      return review("register-unreadable", "Não consegui confirmar o código do registro.", { quality, lcd: publicLcd(lcd), register, value });
    }
    if (register.text !== CRONOS_7023.expectedRegister) {
      return review("wrong-register", `Registro ${register.text} detectado. Aguarde o registro ${CRONOS_7023.expectedRegister} em ${CRONOS_7023.expectedUnit}.`, { quality, lcd: publicLcd(lcd), register, value });
    }
    if (!value || value.confidence < .72) {
      return review("value-low-confidence", "O registro 03 apareceu, mas os dígitos da leitura não estão nítidos o suficiente.", { quality, lcd: publicLcd(lcd), register, value });
    }

    return {
      status: "suggested",
      value: Number(value.text),
      register: register.text,
      unit: CRONOS_7023.expectedUnit,
      confidence: Math.min(lcd.confidence, register.confidence, value.confidence),
      quality,
      lcd: publicLcd(lcd),
      diagnostics: { register, value },
      message: "Leitura sugerida pela imagem. Confira o visor antes de confirmar."
    };
  } catch {
    return review("processing-error", "A foto não pôde ser analisada.");
  } finally {
    bitmap?.close?.();
  }
}

export function validateMeterCandidate(candidate, previousValue = null) {
  const value = Number(candidate?.value);
  if (!Number.isFinite(value) || value < 0) return { valid: false, reason: "invalid-value" };
  if (candidate?.register !== "03" || candidate?.unit !== "kWh") return { valid: false, reason: "wrong-register" };
  if (previousValue !== null && Number.isFinite(Number(previousValue)) && value < Number(previousValue)) {
    return { valid: false, reason: "reading-decreased" };
  }
  return { valid: true, reason: null };
}

function renderBitmap(bitmap, maxWidth) {
  const scale = Math.min(1, maxWidth / Math.max(bitmap.width, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context, width, height };
}

function inspectFrame(frame) {
  const image = frame.context.getImageData(0, 0, frame.width, frame.height);
  const step = Math.max(1, Math.round(Math.max(frame.width, frame.height) / 420));
  let brightness = 0;
  let sharpness = 0;
  let glare = 0;
  let count = 0;
  for (let y = step; y < frame.height - step; y += step) {
    for (let x = step; x < frame.width - step; x += step) {
      const i = (y * frame.width + x) * 4;
      const current = luma(image.data, i);
      const right = luma(image.data, i + step * 4);
      const down = luma(image.data, i + step * frame.width * 4);
      brightness += current;
      sharpness += Math.abs(current - right) + Math.abs(current - down);
      glare += current >= 249 ? 1 : 0;
      count += 1;
    }
  }
  return {
    brightness: count ? brightness / count : 0,
    sharpness: count ? sharpness / count : 0,
    glare: count ? glare / count : 1
  };
}

function locateLcd(frame, profile) {
  const x0 = Math.round(frame.width * profile.displaySearch.x0);
  const y0 = Math.round(frame.height * profile.displaySearch.y0);
  const x1 = Math.round(frame.width * profile.displaySearch.x1);
  const y1 = Math.round(frame.height * profile.displaySearch.y1);
  const width = x1 - x0;
  const height = y1 - y0;
  const image = frame.context.getImageData(x0, y0, width, height);
  const sample = 3;
  const mw = Math.ceil(width / sample);
  const mh = Math.ceil(height / sample);
  const mask = new Uint8Array(mw * mh);

  for (let my = 0; my < mh; my += 1) {
    for (let mx = 0; mx < mw; mx += 1) {
      const px = Math.min(width - 1, mx * sample);
      const py = Math.min(height - 1, my * sample);
      const i = (py * width + px) * 4;
      const hsv = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
      if (hsv.h >= 28 && hsv.h <= 115 && hsv.s >= .045 && hsv.s <= .64 && hsv.v >= .24) mask[my * mw + mx] = 1;
    }
  }

  const components = connectedComponents(mask, mw, mh);
  let best = null;
  for (const component of components) {
    if (component.area < mw * mh * profile.minComponentRatio) continue;
    const cw = (component.maxX - component.minX + 1) * sample;
    const ch = (component.maxY - component.minY + 1) * sample;
    const aspect = cw / Math.max(ch, 1);
    if (aspect < 2.0 || aspect > 3.8) continue;
    const aspectDistance = Math.abs(aspect - 2.85);
    const centerX = x0 + (component.minX + component.maxX + 1) * sample / 2;
    const centerY = y0 + (component.minY + component.maxY + 1) * sample / 2;
    const centerPenalty = Math.abs(centerX / frame.width - .5) + Math.abs(centerY / frame.height - .39) * .8;
    const fill = component.area / Math.max(1, (component.maxX - component.minX + 1) * (component.maxY - component.minY + 1));
    const score = 1 - Math.min(1, aspectDistance / 1.2) * .45 - Math.min(1, centerPenalty) * .35 + Math.min(fill, .7) * .2;
    if (!best || score > best.confidence) {
      best = {
        x: x0 + component.minX * sample,
        y: y0 + component.minY * sample,
        width: cw,
        height: ch,
        confidence: clamp(score, 0, .98),
        aspect
      };
    }
  }
  if (!best) return null;

  const paddingX = Math.round(best.width * .035);
  const paddingY = Math.round(best.height * .06);
  best.x = clamp(Math.round(best.x - paddingX), 0, frame.width - 1);
  best.y = clamp(Math.round(best.y - paddingY), 0, frame.height - 1);
  best.width = Math.min(frame.width - best.x, Math.round(best.width + paddingX * 2));
  best.height = Math.min(frame.height - best.y, Math.round(best.height + paddingY * 2));
  const canvas = createCanvas(best.width, best.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(frame.canvas, best.x, best.y, best.width, best.height, 0, 0, best.width, best.height);
  return { ...best, canvas, context };
}

function connectedComponents(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const output = [];
  const stack = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || visited[start]) continue;
      visited[start] = 1;
      stack.push(start);
      let area = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length) {
        const index = stack.pop();
        const cy = Math.floor(index / width);
        const cx = index - cy * width;
        area += 1;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
      output.push({ area, minX, maxX, minY, maxY });
    }
  }
  return output;
}

function readDigits(lcd, region) {
  const sx = Math.round(lcd.width * region.x0);
  const sy = Math.round(lcd.height * region.y0);
  const sw = Math.max(1, Math.round(lcd.width * (region.x1 - region.x0)));
  const sh = Math.max(1, Math.round(lcd.height * (region.y1 - region.y0)));
  const image = lcd.context.getImageData(sx, sy, Math.min(sw, lcd.width - sx), Math.min(sh, lcd.height - sy));
  const gray = grayscale(image);
  const dark = localDarkness(gray, image.width, image.height, Math.max(3, Math.round(image.height * .06)));
  const integral = integralImage(dark, image.width, image.height);
  let best = null;

  const minHeight = Math.max(16, Math.round(image.height * .45));
  const maxHeight = Math.max(minHeight, Math.round(image.height * .90));
  for (let digitHeight = minHeight; digitHeight <= maxHeight; digitHeight += Math.max(2, Math.round(image.height * .06))) {
    const digitWidth = Math.max(8, Math.round(digitHeight * .48));
    for (const pitchFactor of [1.02, 1.12, 1.22]) {
      const pitch = Math.round(digitWidth * pitchFactor);
      const totalWidth = pitch * (region.count - 1) + digitWidth;
      if (totalWidth > image.width) continue;
      const xStep = Math.max(2, Math.round(image.width * .025));
      const yStep = Math.max(2, Math.round(image.height * .04));
      for (let y = 0; y + digitHeight <= image.height; y += yStep) {
        for (let x = 0; x + totalWidth <= image.width; x += xStep) {
          const digits = [];
          const scores = [];
          const margins = [];
          for (let d = 0; d < region.count; d += 1) {
            const classified = classifyDigit(integral, image.width, image.height, x + d * pitch, y, digitWidth, digitHeight);
            digits.push(classified.digit);
            scores.push(classified.score);
            margins.push(classified.margin);
          }
          const raw = average(scores) + average(margins) * .22 - deviation(scores) * .12;
          const confidence = segmentConfidence(raw, average(margins));
          if (!best || confidence > best.confidence) best = { text: digits.join(""), confidence, raw, margin: average(margins) };
        }
      }
    }
  }
  return best;
}

function classifyDigit(integral, width, height, x, y, digitWidth, digitHeight) {
  const samples = SEGMENT_ZONES.map(([x0, y0, x1, y1]) => rectMean(
    integral, width, height,
    Math.round(x + x0 * digitWidth), Math.round(y + y0 * digitHeight),
    Math.round(x + x1 * digitWidth), Math.round(y + y1 * digitHeight)
  ));
  let bestDigit = 0;
  let bestScore = -Infinity;
  let secondScore = -Infinity;
  for (const [text, pattern] of Object.entries(SEGMENTS)) {
    const active = [];
    const inactive = [];
    pattern.forEach((on, index) => (on ? active : inactive).push(samples[index]));
    const score = average(active) - (inactive.length ? average(inactive) : 0) + Math.min(...active) * .12;
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestDigit = Number(text);
    } else if (score > secondScore) secondScore = score;
  }
  return { digit: bestDigit, score: bestScore, margin: bestScore - secondScore };
}

function grayscale(image) {
  const out = new Float32Array(image.width * image.height);
  for (let p = 0, i = 0; p < out.length; p += 1, i += 4) out[p] = luma(image.data, i);
  return out;
}

function localDarkness(gray, width, height, radius) {
  const source = integralImage(gray, width, height);
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const background = rectMean(source, width, height, x - radius, y - radius, x + radius + 1, y + radius + 1);
      out[y * width + x] = Math.max(0, background - gray[y * width + x]);
    }
  }
  return out;
}

function integralImage(values, width, height) {
  const stride = width + 1;
  const out = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += values[(y - 1) * width + x - 1];
      out[y * stride + x] = out[(y - 1) * stride + x] + row;
    }
  }
  return out;
}

function rectMean(integral, width, height, x0, y0, x1, y1) {
  const left = clamp(x0, 0, width);
  const top = clamp(y0, 0, height);
  const right = clamp(Math.max(left + 1, x1), 0, width);
  const bottom = clamp(Math.max(top + 1, y1), 0, height);
  const stride = width + 1;
  const sum = integral[bottom * stride + right] - integral[top * stride + right] - integral[bottom * stride + left] + integral[top * stride + left];
  return sum / Math.max(1, (right - left) * (bottom - top));
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? delta / max : 0, v: max };
}

function luma(data, index) {
  return data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
}

function segmentConfidence(score, margin) {
  return clamp(clamp((score - 9) / 13, 0, 1) * .72 + clamp((margin - 1.5) / 7, 0, 1) * .28, 0, .99);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function deviation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function publicLcd(lcd) {
  return { x: lcd.x, y: lcd.y, width: lcd.width, height: lcd.height, aspect: lcd.aspect, confidence: lcd.confidence };
}

function review(reason, message, extra = {}) {
  return { status: "review", value: null, register: null, unit: null, confidence: 0, reason, message, ...extra };
}

function createCanvas(width, height) {
  if ("OffscreenCanvas" in globalThis) return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
