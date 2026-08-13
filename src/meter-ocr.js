const NUMERIC_CANDIDATE = /\b\d{3,10}(?:[.,]\d{1,3})?\b/g;

export async function analyzeMeterImage(file) {
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return { value: null, message: "Escolha uma imagem válida do medidor." };
  }

  if (!("TextDetector" in globalThis) || !("createImageBitmap" in globalThis)) {
    return {
      value: null,
      message: "A leitura automática não está disponível neste navegador. Digite o valor do visor manualmente."
    };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const detector = new globalThis.TextDetector();
    const blocks = await detector.detect(bitmap);
    bitmap.close?.();
    const candidates = blocks
      .flatMap((block) => String(block.rawValue || "").match(NUMERIC_CANDIDATE) || [])
      .map((candidate) => Number(candidate.replace(",", ".")))
      .filter(Number.isFinite)
      .sort((left, right) => String(Math.trunc(right)).length - String(Math.trunc(left)).length);
    return candidates.length
      ? { value: candidates[0], message: "Valor sugerido. Revise antes de confirmar." }
      : { value: null, message: "Nenhum número confiável foi detectado. Digite o valor do visor manualmente." };
  } catch {
    return { value: null, message: "A foto não pôde ser lida automaticamente. Digite o valor e revise antes de confirmar." };
  }
}
