const TESSERACT_VERSION = "7.0.0";
const WORKER_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`;
const CORE_URL = `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`;
const LANGUAGE_URL = "https://tessdata.projectnaptha.com/4.0.0_fast";
const MAX_IMAGE_SIDE = 2400;

let workerPromise = null;
let recognitionQueue = Promise.resolve();

function progress(port, status, fraction = null) {
  port.postMessage({ type: "progress", status, fraction: Number.isFinite(fraction) ? fraction : null });
}

async function getWorker(port) {
  if (workerPromise) return workerPromise;
  if (!globalThis.Tesseract?.createWorker) throw new Error("tesseract_unavailable");
  progress(port, "Carregando OCR local…", 0.05);
  workerPromise = globalThis.Tesseract.createWorker("por", 1, {
    workerPath: WORKER_URL,
    corePath: CORE_URL,
    langPath: LANGUAGE_URL,
    logger(message) {
      if (message?.status === "recognizing text" && Number.isFinite(message.progress)) {
        progress(port, "Lendo a fatura…", Math.max(0.1, Math.min(0.98, message.progress)));
      }
    }
  }).catch((error) => {
    workerPromise = null;
    throw error;
  });
  return workerPromise;
}

async function prepareImage(file) {
  if (!("createImageBitmap" in globalThis)) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    try {
      const image = context.getImageData(0, 0, width, height);
      const pixels = image.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
        const enhanced = Math.max(0, Math.min(255, ((luminance - 128) * 1.22) + 128));
        pixels[index] = enhanced;
        pixels[index + 1] = enhanced;
        pixels[index + 2] = enhanced;
      }
      context.putImageData(image, 0, 0);
    } catch {
      // If pixel access is unavailable, keep the resized original image.
    }
    return canvas;
  } finally {
    bitmap.close?.();
  }
}

async function recognize(file, port) {
  if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
    throw new Error("invalid_image");
  }
  progress(port, "Preparando a imagem…", 0.02);
  const source = await prepareImage(file);
  const worker = await getWorker(port);
  progress(port, "Lendo a fatura…", 0.1);
  const result = await worker.recognize(source, { rotateAuto: true });
  const text = String(result?.data?.text || "").trim();
  progress(port, "Leitura concluída.", 1);
  return text;
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  if (event.data?.type !== "volt-ocr-analyze") return;
  const port = event.ports?.[0];
  if (!port) return;
  const file = event.data.file;
  recognitionQueue = recognitionQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const text = await recognize(file, port);
        port.postMessage({ type: "result", ok: true, engine: "tesseract_wasm", text });
      } catch (error) {
        port.postMessage({ type: "result", ok: false, engine: "tesseract_wasm", error: error instanceof Error ? error.message : "ocr_failed" });
      } finally {
        port.close();
      }
    });
});
