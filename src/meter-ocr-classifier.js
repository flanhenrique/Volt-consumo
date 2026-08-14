import { METER_OCR_MODEL } from "./meter-ocr-model.js?v=20260813.7";
import { METER_OCR_COARSE_MODEL } from "./meter-ocr-coarse-model.js?v=20260813.7";
import { resizeIntegralRegion, cropArray, boxBlur, gaussianBlur, normalizeDark, resizeAreaWeighted, odd, minFilter, maxFilter, percentileHistogram } from "./meter-ocr-image.js?v=20260813.7";

const SCREEN_WIDTH = 720;
const SCREEN_HEIGHT = 220;
const COARSE_MODEL = decodeModel(METER_OCR_COARSE_MODEL);
const DIRECT_MODEL = decodeModel(METER_OCR_MODEL.direct, METER_OCR_MODEL);
const VALUE_MODEL = decodeModel(METER_OCR_MODEL.value, METER_OCR_MODEL);
const REGISTER_MODEL = decodeModel(METER_OCR_MODEL.register, METER_OCR_MODEL);
const DISPLAY_TEMPLATE = decodeUint8(METER_OCR_MODEL.displayTemplate);

function classifyRegionCoarse(integral, gray, x, y, width, height) {
  const resized = resizeIntegralRegion(integral, SCREEN_WIDTH, SCREEN_HEIGHT, x, y, width, height, 24, 36);
  return probabilities(COARSE_MODEL, featureFromSmall(resized, 24, 36, false));
}

function classifyRegionDirect(gray, x, y, width, height) {
  const patch = cropArray(gray, SCREEN_WIDTH, SCREEN_HEIGHT, x, y, width, height);
  return probabilities(DIRECT_MODEL, featureFromPatch(patch.data, patch.width, patch.height));
}

function classifyRegionAccurate(gray, x, y, width, height, model) {
  const region = cropArray(gray, SCREEN_WIDTH, SCREEN_HEIGHT, x, y, width, height);
  const digit = extractDigit(region.data, region.width, region.height);
  if (!digit) return null;
  return probabilities(model, featureFromPatch(digit.data, digit.width, digit.height));
}

function featureFromSmall(values, width, height, useGaussian = false) {
  const background = useGaussian ? gaussianBlur(values, width, height) : boxBlur(values, width, height, 4);
  const dark = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) dark[i] = Math.max(0, background[i] - values[i]);
  normalizeDark(dark);
  const f96 = resizeAreaWeighted(dark, width, height, 8, 12);
  return resizeAreaWeighted(f96, 8, 12, 6, 8);
}

function featureFromPatch(values, width, height) {
  const small = resizeAreaWeighted(values, width, height, 24, 36);
  const background = gaussianBlur(small, 24, 36);
  const dark = new Float32Array(small.length);
  for (let i = 0; i < small.length; i += 1) dark[i] = Math.max(0, background[i] - small[i]);
  normalizeDark(dark);
  const f96 = resizeAreaWeighted(dark, 24, 36, 8, 12);
  return resizeAreaWeighted(f96, 8, 12, 6, 8);
}

function extractDigit(values, width, height) {
  const kx = odd(Math.max(9, Math.floor(width / 4)));
  const ky = odd(Math.max(9, Math.floor(height / 10)));
  const closed = minFilter(maxFilter(values, width, height, kx, ky), width, height, kx, ky);
  const blackhat = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) blackhat[i] = Math.max(0, closed[i] - values[i]);
  const threshold = Math.max(10, percentileHistogram(blackhat, 0.75, 255));
  let mask = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) mask[i] = blackhat[i] > threshold ? 1 : 0;
  const top = Math.floor(height * 0.04);
  const bottom = Math.floor(height * 0.92);
  for (let y = 0; y < top; y += 1) mask.fill(0, y * width, (y + 1) * width);
  for (let y = bottom; y < height; y += 1) mask.fill(0, y * width, (y + 1) * width);
  mask = maxFilter(mask, width, height, 5, 5);
  for (let pass = 0; pass < 2; pass += 1) mask = minFilter(maxFilter(mask, width, height, 5, 9), width, height, 5, 9);
  const component = bestComponent(mask, width, height);
  if (!component) return null;
  const pad = Math.max(2, Math.floor(0.05 * Math.max(component.width, component.height)));
  const x = Math.max(0, component.x - pad);
  const y = Math.max(0, component.y - pad);
  const x2 = Math.min(width, component.x + component.width + pad);
  const y2 = Math.min(height, component.y + component.height + pad);
  return cropArray(values, width, height, x, y, x2 - x, y2 - y);
}

function bestComponent(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  let best = null;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || seen[index]) continue;
    const queue = [index];
    seen[index] = 1;
    let head = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const cy = Math.floor(current / width);
      const cx = current - cy * width;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (mask[ni] && !seen[ni]) { seen[ni] = 1; queue.push(ni); }
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (boxHeight <= height * 0.25 || boxWidth <= width * 0.08) continue;
    const center = minX + boxWidth / 2;
    const score = boxWidth * boxHeight - Math.abs(center - width / 2) * height * 0.3;
    if (!best || score > best.score) best = { score, x: minX, y: minY, width: boxWidth, height: boxHeight };
  }
  return best;
}

function localDarkMap(gray, width, height, radius) {
  const background = boxBlur(gray, width, height, radius);
  const dark = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) dark[i] = Math.max(0, background[i] - gray[i]);
  normalizeDark(dark);
  return dark;
}

function testScreenMetrics(dark) {
  let sum = 0;
  let count = 0;
  let denseColumns = 0;
  for (let x = 0; x < SCREEN_WIDTH; x += 1) {
    let column = 0;
    for (let y = 45; y < 185; y += 1) {
      const value = dark[y * SCREEN_WIDTH + x];
      sum += value;
      column += value;
      count += 1;
    }
    if (column / 140 > 0.16) denseColumns += 1;
  }
  return { mean: sum / count, denseColumns: denseColumns / SCREEN_WIDTH };
}

function glareMetrics(gray, width, height) {
  let bright245 = 0;
  let count = 0;
  let maxBrightColumn = 0;
  for (let x = 240; x < Math.min(width, 715); x += 1) {
    let column = 0;
    let columnCount = 0;
    for (let y = 35; y < Math.min(height, 210); y += 1) {
      const value = gray[y * width + x];
      if (value > 245) { bright245 += 1; column += 1; }
      columnCount += 1;
      count += 1;
    }
    maxBrightColumn = Math.max(maxBrightColumn, column / columnCount);
  }
  return { bright245: bright245 / count, maxBrightColumn };
}

function leftBorder(gray, width, height) {
  const y0 = Math.floor(height * 0.08);
  const y1 = Math.floor(height * 0.95);
  const slice = [];
  for (let y = y0; y < y1; y += 1) for (let x = 0; x < width; x += 1) slice.push(gray[y * width + x]);
  slice.sort((a, b) => a - b);
  const median = slice[Math.floor(slice.length / 2)] || 1;
  const scores = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    let hits = 0;
    for (let y = y0; y < y1; y += 1) if (gray[y * width + x] < median * 0.58) hits += 1;
    scores[x] = hits / Math.max(1, y1 - y0);
  }
  let bestX = 5, best = -1;
  for (let x = 5; x < Math.floor(width * 0.25); x += 1) {
    let smooth = 0;
    for (let k = -3; k <= 3; k += 1) smooth += scores[Math.max(0, Math.min(width - 1, x + k))];
    if (smooth > best) { best = smooth; bestX = x; }
  }
  return bestX;
}

function normalizedEdge(gray, width, height) {
  const edge = new Float32Array(gray.length);
  let max = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] + gray[i - width + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + width - 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      const value = Math.hypot(gx, gy);
      edge[i] = value;
      max = Math.max(max, value);
    }
  }
  const p90 = percentileHistogram(edge, 0.90, Math.max(1, max), 64) || 1;
  for (let i = 0; i < edge.length; i += 1) edge[i] = Math.min(1, edge[i] / p90);
  return edge;
}

function probabilities(model, features) {
  const logits = new Float64Array(10);
  let max = -Infinity;
  for (let digit = 0; digit < 10; digit += 1) {
    let value = model.intercepts[digit] / model.scale;
    const offset = digit * model.featureCount;
    for (let feature = 0; feature < model.featureCount; feature += 1) value += (model.coefficients[offset + feature] / model.scale) * features[feature];
    logits[digit] = value;
    max = Math.max(max, value);
  }
  let total = 0;
  for (let digit = 0; digit < 10; digit += 1) { logits[digit] = Math.exp(logits[digit] - max); total += logits[digit]; }
  for (let digit = 0; digit < 10; digit += 1) logits[digit] /= total || 1;
  return logits;
}

function decodeModel(data, parent = data) {
  const featureCount = parent.featureCount || data.featureCount;
  const scale = parent.scale || data.scale;
  const coefficients = decodeInt16(data.coefficients);
  const intercepts = decodeInt16(data.intercepts);
  if (coefficients.length !== featureCount * 10 || intercepts.length !== 10) throw new Error("Modelo OCR local inválido.");
  return { featureCount, scale, coefficients, intercepts };
}

function decodeInt16(base64) {
  const bytes = decodeUint8(base64);
  const values = new Int16Array(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < values.length; i += 1) values[i] = view.getInt16(i * 2, true);
  return values;
}

function decodeUint8(base64) {
  const binary = atob(base64);
  const values = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) values[i] = binary.charCodeAt(i);
  return values;
}

export { DISPLAY_TEMPLATE, VALUE_MODEL, REGISTER_MODEL, classifyRegionCoarse, classifyRegionDirect, classifyRegionAccurate, localDarkMap, testScreenMetrics, glareMetrics, leftBorder, normalizedEdge };
