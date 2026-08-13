const CROP_WINDOW = Object.freeze({ x0: .08, y0: .25, x1: .92, y1: .55 });
const MAX_FRAME_WIDTH = 1200;
const MAX_CROP_WIDTH = 960;

export async function analyzeMeterImage(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return { value: null, message: "Escolha uma imagem válida do medidor." };
  }
  if (!("createImageBitmap" in globalThis)) {
    return { value: null, message: "A leitura automática não está disponível neste navegador. Digite o valor do visor manualmente." };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const frame = renderScaled(bitmap, MAX_FRAME_WIDTH);
    const crop = cropDisplayWindow(frame);
    const quality = inspectQuality(crop);

    if (quality.brightness < 32) {
      return { value: null, message: "O visor está escuro demais. Tire outra foto com mais luz ou digite a leitura manualmente." };
    }
    if (quality.sharpness < 3.2) {
      return { value: null, message: "O visor está desfocado. Aproxime o celular e tire outra foto ou digite a leitura manualmente." };
    }

    const imageDataUrl = crop.canvas.toDataURL("image/jpeg", .9);
    const result = await requestMeterVision(imageDataUrl);

    if (result?.status === "suggested" && Number.isFinite(Number(result.value))) {
      const confidence = Math.round(Number(result.confidence || 0) * 100);
      return {
        value: Number(result.value),
        confidence: Number(result.confidence || 0),
        message: `Leitura sugerida com ${confidence}% de confiança. Confira o visor antes de confirmar.`
      };
    }

    return { value: null, message: reviewMessage(result) };
  } catch {
    return { value: null, message: "A leitura automática está indisponível agora. Digite o valor do visor manualmente e revise antes de confirmar." };
  } finally {
    bitmap?.close?.();
  }
}

function requestMeterVision(imageDataUrl) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      handler(value);
    };
    const detail = {
      imageDataUrl,
      handled: false,
      resolve: (value) => finish(resolve, value),
      reject: (error) => finish(reject, error)
    };
    const timeout = setTimeout(() => finish(reject, new Error("meter_reader_timeout")), 15000);
    window.dispatchEvent(new CustomEvent("volt:meter-read-request", { detail }));
    if (!detail.handled) finish(reject, new Error("meter_reader_unavailable"));
  });
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

function cropDisplayWindow(frame) {
  const sourceX = Math.round(frame.width * CROP_WINDOW.x0);
  const sourceY = Math.round(frame.height * CROP_WINDOW.y0);
  const sourceWidth = Math.round(frame.width * (CROP_WINDOW.x1 - CROP_WINDOW.x0));
  const sourceHeight = Math.round(frame.height * (CROP_WINDOW.y1 - CROP_WINDOW.y0));
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

function reviewMessage(result) {
  switch (result?.reason) {
    case "wrong-register":
      return "O visor não está no registro 03 em kWh. Aguarde a tela correta e tire outra foto.";
    case "test-screen":
      return "O medidor está na tela de teste. Aguarde a leitura normal e fotografe novamente.";
    case "reflection":
      return "O reflexo impede confirmar todos os dígitos. Mude levemente o ângulo e tire outra foto.";
    case "blur":
      return "Os dígitos estão desfocados. Aproxime o celular e tire outra foto.";
    case "low-confidence":
    case "unreadable":
      return "Não foi possível confirmar todos os dígitos com segurança. Tire outra foto ou digite a leitura manualmente.";
    default:
      return "A leitura não pôde ser confirmada automaticamente. Tire outra foto ou digite o valor manualmente.";
  }
}

function luma(data, index) {
  return data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722;
}
