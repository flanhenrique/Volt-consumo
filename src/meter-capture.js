const LCD_WINDOW = Object.freeze({ x0: .08, y0: .28, x1: .92, y1: .53 });
const MAX_FRAME_WIDTH = 1200;
const MAX_CROP_WIDTH = 960;
const JPEG_QUALITY = .9;

export async function prepareMeterCrop(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return { ok: false, reason: "invalid-image", message: "Escolha uma foto válida do medidor." };
  }
  if (!("createImageBitmap" in globalThis)) {
    return { ok: false, reason: "unsupported-browser", message: "Este navegador não consegue preparar a foto automaticamente." };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const frame = renderScaled(bitmap, MAX_FRAME_WIDTH);
    const crop = cropLcdWindow(frame);
    const quality = inspectQuality(crop);

    if (quality.brightness < 32) {
      return { ok: false, reason: "too-dark", quality, message: "A área do visor está escura demais. Tire outra foto com mais luz." };
    }
    if (quality.sharpness < 3.2) {
      return { ok: false, reason: "blur", quality, message: "A área do visor está muito desfocada. Aproxime o celular e tente novamente." };
    }

    const imageDataUrl = crop.canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return {
      ok: true,
      imageDataUrl,
      quality,
      width: crop.width,
      height: crop.height,
      message: quality.glare > .035
        ? "Reflexo detectado. O servidor só aceitará a leitura se todos os dígitos estiverem visíveis."
        : "Visor preparado para análise."
    };
  } catch {
    return { ok: false, reason: "processing-error", message: "Não foi possível preparar a foto. Tire outra foto ou digite a leitura manualmente." };
  } finally {
    bitmap?.close?.();
  }
}

function renderScaled(bitmap, maxWidth) {
  const scale = Math.min(1, maxWidth / Math.max(bitmap.width, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, width, height);
  return { canvas, context, width, height };
}

function cropLcdWindow(frame) {
  const sourceX = Math.round(frame.width * LCD_WINDOW.x0);
  const sourceY = Math.round(frame.height * LCD_WINDOW.y0);
  const sourceWidth = Math.round(frame.width * (LCD_WINDOW.x1 - LCD_WINDOW.x0));
  const sourceHeight = Math.round(frame.height * (LCD_WINDOW.y1 - LCD_WINDOW.y0));
  const scale = Math.min(1, MAX_CROP_WIDTH / Math.max(sourceWidth, 1));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  context.drawImage(frame.canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
  return { canvas, context, width, height };
}

function inspectQuality(crop) {
  const image = crop.context.getImageData(0, 0, crop.width, crop.height);
  const step = Math.max(1, Math.round(Math.max(crop.width, crop.height) / 360));
  let brightness = 0;
  let sharpness = 0;
  let glare = 0;
  let samples = 0;

  for (let y = step; y < crop.height - step; y += step) {
    for (let x = step; x < crop.width - step; x += step) {
      const index = (y * crop.width + x) * 4;
      const current = luma(image.data, index);
      const right = luma(image.data, index + step * 4);
      const down = luma(image.data, index + step * crop.width * 4);
      brightness += current;
      sharpness += Math.abs(current - right) + Math.abs(current - down);
      glare += current >= 248 ? 1 : 0;
      samples += 1;
    }
  }

  return {
    brightness: samples ? brightness / samples : 0,
    sharpness: samples ? sharpness / samples : 0,
    glare: samples ? glare / samples : 1
  };
}

function luma(data, index) {
  return data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
}
