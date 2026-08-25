const SCREEN_WIDTH = 720;
const SCREEN_HEIGHT = 220;
const GAUSS_SIGMA = 3;
const GAUSS_RADIUS = 9;
const GAUSS_KERNEL = gaussianKernel(GAUSS_SIGMA, GAUSS_RADIUS);

function canvasGray(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) gray[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return gray;
}

function buildIntegral(values, width, height) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += values[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  return integral;
}

function resizeIntegralRegion(integral, sourceWidth, sourceHeight, x, y, width, height, targetWidth, targetHeight) {
  const out = new Float32Array(targetWidth * targetHeight);
  const stride = sourceWidth + 1;
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const sy0 = clamp(y + Math.floor(ty * height / targetHeight), 0, sourceHeight - 1);
    const sy1 = clamp(y + Math.max(Math.floor((ty + 1) * height / targetHeight), Math.floor(ty * height / targetHeight) + 1), sy0 + 1, sourceHeight);
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const sx0 = clamp(x + Math.floor(tx * width / targetWidth), 0, sourceWidth - 1);
      const sx1 = clamp(x + Math.max(Math.floor((tx + 1) * width / targetWidth), Math.floor(tx * width / targetWidth) + 1), sx0 + 1, sourceWidth);
      const sum = integral[sy1 * stride + sx1] - integral[sy0 * stride + sx1] - integral[sy1 * stride + sx0] + integral[sy0 * stride + sx0];
      out[ty * targetWidth + tx] = sum / ((sx1 - sx0) * (sy1 - sy0));
    }
  }
  return out;
}

function resizeAreaWeighted(values, width, height, targetWidth, targetHeight) {
  const out = new Float32Array(targetWidth * targetHeight);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;
  for (let ty = 0; ty < targetHeight; ty += 1) {
    const y0 = ty * scaleY, y1 = (ty + 1) * scaleY;
    const sy0 = Math.floor(y0), sy1 = Math.min(height - 1, Math.ceil(y1) - 1);
    for (let tx = 0; tx < targetWidth; tx += 1) {
      const x0 = tx * scaleX, x1 = (tx + 1) * scaleX;
      const sx0 = Math.floor(x0), sx1 = Math.min(width - 1, Math.ceil(x1) - 1);
      let sum = 0, weight = 0;
      for (let sy = sy0; sy <= sy1; sy += 1) {
        const wy = Math.max(0, Math.min(y1, sy + 1) - Math.max(y0, sy));
        for (let sx = sx0; sx <= sx1; sx += 1) {
          const wx = Math.max(0, Math.min(x1, sx + 1) - Math.max(x0, sx));
          const w = wx * wy;
          sum += values[sy * width + sx] * w;
          weight += w;
        }
      }
      out[ty * targetWidth + tx] = sum / (weight || 1);
    }
  }
  return out;
}

function gaussianKernel(sigma, radius) {
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) { const value = Math.exp(-(i * i) / (2 * sigma * sigma)); kernel[i + radius] = value; sum += value; }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return kernel;
}

function gaussianBlur(values, width, height) {
  const horizontal = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -GAUSS_RADIUS; k <= GAUSS_RADIUS; k += 1) sum += values[y * width + clamp(x + k, 0, width - 1)] * GAUSS_KERNEL[k + GAUSS_RADIUS];
    horizontal[y * width + x] = sum;
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -GAUSS_RADIUS; k <= GAUSS_RADIUS; k += 1) sum += horizontal[clamp(y + k, 0, height - 1) * width + x] * GAUSS_KERNEL[k + GAUSS_RADIUS];
    out[y * width + x] = sum;
  }
  return out;
}

function boxBlur(values, width, height, radius) {
  const integral = buildIntegral(values, width, height);
  const stride = width + 1;
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

function maxFilter(values, width, height, kx, ky) { return extremaFilter(values, width, height, kx, ky, true); }
function minFilter(values, width, height, kx, ky) { return extremaFilter(values, width, height, kx, ky, false); }

function extremaFilter(values, width, height, kx, ky, isMax) {
  const horizontal = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  const rx = Math.floor(kx / 2), ry = Math.floor(ky / 2);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let best = isMax ? -Infinity : Infinity;
    for (let dx = -rx; dx <= rx; dx += 1) {
      const value = values[y * width + clamp(x + dx, 0, width - 1)];
      best = isMax ? Math.max(best, value) : Math.min(best, value);
    }
    horizontal[y * width + x] = best;
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let best = isMax ? -Infinity : Infinity;
    for (let dy = -ry; dy <= ry; dy += 1) {
      const value = horizontal[clamp(y + dy, 0, height - 1) * width + x];
      best = isMax ? Math.max(best, value) : Math.min(best, value);
    }
    out[y * width + x] = best;
  }
  return out;
}

function cropArray(values, width, height, x, y, cropWidth, cropHeight) {
  const x0 = clamp(Math.floor(x), 0, width - 1), y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(Math.ceil(x + cropWidth), x0 + 1, width), y1 = clamp(Math.ceil(y + cropHeight), y0 + 1, height);
  const out = new Float32Array((x1 - x0) * (y1 - y0));
  const outWidth = x1 - x0;
  for (let row = y0; row < y1; row += 1) out.set(values.subarray(row * width + x0, row * width + x1), (row - y0) * outWidth);
  return { data: out, width: outWidth, height: y1 - y0 };
}

function normalizeDark(values) {
  const scale = percentileHistogram(values, 0.95, 255, 256) + 1e-4;
  for (let i = 0; i < values.length; i += 1) values[i] = Math.min(1, Math.max(0, values[i] / scale));
}

function percentileHistogram(values, percentile, maxValue = 255, bins = 256) {
  const histogram = new Uint32Array(bins);
  for (const raw of values) {
    const value = Math.max(0, Math.min(maxValue, raw));
    const bin = Math.min(bins - 1, Math.floor(value / maxValue * (bins - 1)));
    histogram[bin] += 1;
  }
  const target = Math.max(1, Math.ceil(values.length * percentile));
  let total = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    total += histogram[bin];
    if (total >= target) return maxValue * (bin + 0.5) / bins;
  }
  return maxValue;
}

function regionMean(values, width, height, x, y, regionWidth, regionHeight) {
  const x0 = clamp(Math.floor(x), 0, width - 1), y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(Math.ceil(x + regionWidth), x0 + 1, width), y1 = clamp(Math.ceil(y + regionHeight), y0 + 1, height);
  let sum = 0, count = 0;
  for (let yy = y0; yy < y1; yy += 1) for (let xx = x0; xx < x1; xx += 1) { sum += values[yy * width + xx]; count += 1; }
  return sum / Math.max(1, count);
}

function meanGap(darkMap, start, width, y, height, digits) {
  let sum = 0;
  for (let index = 1; index < digits; index += 1) sum += regionMean(darkMap, SCREEN_WIDTH, SCREEN_HEIGHT, start + index * width - 2, y, 5, height);
  return sum / Math.max(1, digits - 1);
}

function argmax(values) {
  let index = 0, value = values[0];
  for (let i = 1; i < values.length; i += 1) if (values[i] > value) { index = i; value = values[i]; }
  return { index, value };
}

function scoreToConfidence(score) {
  return Math.max(0.5, Math.min(0.99, 1 - Math.max(0, -score) / 3));
}

function safeLog(value) { return Math.log(Math.max(1e-9, value)); }
function odd(value) { const integer = Math.max(1, Math.floor(value)); return integer % 2 ? integer : integer + 1; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function yieldControl() { return new Promise((resolve) => setTimeout(resolve, 0)); }

export { canvasGray, buildIntegral, resizeIntegralRegion, resizeAreaWeighted, gaussianBlur, boxBlur, maxFilter, minFilter, cropArray, normalizeDark, percentileHistogram, regionMean, meanGap, argmax, scoreToConfidence, safeLog, odd, clamp, yieldControl };
