import { prepareMeterCrop } from "./meter-capture.js";

export function createMeterFlow({ getService, getState, setReadingMessage }) {
  const form = document.getElementById("reading-form");
  const typeInput = document.getElementById("reading-type");
  const valueInput = document.getElementById("reading-value");
  if (!form || !typeInput || !valueInput) throw new Error("Fluxo do medidor sem contrato DOM básico.");

  const ui = buildVisionUi(form, valueInput);
  let sequence = 0;
  let visionActive = false;

  ui.photo.addEventListener("change", (event) => void handlePhoto(event.target.files?.[0] || null));
  typeInput.addEventListener("change", syncType);
  form.addEventListener("submit", guardVisionConfirmation, { capture: true });
  document.querySelectorAll("[data-action='open-reading']").forEach((button) => {
    button.addEventListener("click", reset, { capture: true });
  });
  document.getElementById("reading-dialog")?.addEventListener("close", reset);
  syncType();

  return Object.freeze({ reset });

  function guardVisionConfirmation(event) {
    if (!visionActive || ui.reviewed.checked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setReadingMessage("Confira a leitura no visor e marque a confirmação antes de salvar.", true);
    ui.reviewed.focus();
  }

  async function handlePhoto(file) {
    const current = ++sequence;
    visionActive = Boolean(file);
    ui.reviewRow.hidden = !visionActive;
    ui.reviewed.checked = false;
    ui.preview.hidden = true;
    ui.preview.removeAttribute("src");
    setVisionMessage("");

    if (!file) return;
    if (typeInput.value !== "energy") {
      resetVisionOnly();
      return;
    }

    setVisionMessage("Preparando apenas a área do visor…");
    const prepared = await prepareMeterCrop(file);
    if (current !== sequence) return;
    if (!prepared.ok) {
      setVisionMessage(`${prepared.message} Você ainda pode digitar a leitura manualmente.`, true);
      return;
    }

    ui.preview.src = prepared.imageDataUrl;
    ui.preview.hidden = false;
    setVisionMessage("Visor recortado. Analisando a leitura…");

    try {
      const service = getService();
      if (!service?.analyzeMeterReading) throw new Error("Leitor visual indisponível.");
      const previousValue = latestReadingValue(getState()?.readings?.energy || []);
      const result = await service.analyzeMeterReading(prepared.imageDataUrl, previousValue);
      if (current !== sequence) return;

      if (result.status === "suggested" && Number.isFinite(Number(result.value))) {
        valueInput.value = String(result.value);
        const confidence = Math.round(Number(result.confidence || 0) * 100);
        setVisionMessage(`Leitura sugerida: ${formatInteger(result.value)} kWh · ${confidence}% de confiança. Confira o visor antes de confirmar.`);
        return;
      }

      valueInput.value = "";
      setVisionMessage(reviewMessage(result), true);
    } catch {
      if (current !== sequence) return;
      setVisionMessage("A leitura automática está indisponível agora. Digite o valor do visor manualmente e confira antes de salvar.", true);
    }
  }

  function syncType() {
    const energy = typeInput.value === "energy";
    ui.panel.hidden = !energy;
    if (!energy) resetVisionOnly();
  }

  function reset() {
    sequence += 1;
    visionActive = false;
    ui.photo.value = "";
    ui.reviewed.checked = false;
    ui.reviewRow.hidden = true;
    ui.preview.hidden = true;
    ui.preview.removeAttribute("src");
    setVisionMessage("");
    syncType();
  }

  function resetVisionOnly() {
    sequence += 1;
    visionActive = false;
    ui.photo.value = "";
    ui.reviewed.checked = false;
    ui.reviewRow.hidden = true;
    ui.preview.hidden = true;
    ui.preview.removeAttribute("src");
    setVisionMessage("");
  }

  function setVisionMessage(message, error = false) {
    ui.message.textContent = message;
    ui.message.dataset.error = String(Boolean(error));
  }
}

function buildVisionUi(form, valueInput) {
  const valueLabel = valueInput.closest("label");
  const panel = document.createElement("section");
  panel.id = "meter-vision-panel";
  panel.className = "meter-vision-panel";
  panel.setAttribute("aria-labelledby", "meter-vision-title");

  const heading = document.createElement("div");
  heading.className = "meter-vision-heading";
  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "LEITURA POR CÂMERA";
  const title = document.createElement("strong");
  title.id = "meter-vision-title";
  title.textContent = "Fotografe o visor";
  const privacy = document.createElement("small");
  privacy.textContent = "O Volt envia somente o recorte do LCD para análise.";
  titleWrap.append(eyebrow, title, privacy);
  heading.append(titleWrap);

  const photoLabel = document.createElement("label");
  photoLabel.className = "meter-photo-label secondary-button";
  photoLabel.textContent = "Tirar foto ou escolher imagem";
  const photo = document.createElement("input");
  photo.id = "reading-photo";
  photo.type = "file";
  photo.accept = "image/jpeg,image/png,image/webp";
  photo.setAttribute("capture", "environment");
  photoLabel.append(photo);

  const preview = document.createElement("img");
  preview.id = "meter-preview";
  preview.className = "meter-preview";
  preview.alt = "Recorte do visor do medidor preparado para análise";
  preview.hidden = true;

  const message = document.createElement("p");
  message.id = "meter-vision-message";
  message.className = "status-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  panel.append(heading, photoLabel, preview, message);
  valueLabel?.before(panel);

  const reviewRow = document.createElement("label");
  reviewRow.id = "reading-review-row";
  reviewRow.className = "checkbox-row meter-review-row";
  reviewRow.hidden = true;
  const reviewed = document.createElement("input");
  reviewed.id = "reading-reviewed";
  reviewed.type = "checkbox";
  const reviewText = document.createElement("span");
  reviewText.textContent = "Conferi a leitura sugerida diretamente no visor";
  reviewRow.append(reviewed, reviewText);
  valueLabel?.after(reviewRow);

  return { panel, photo, preview, message, reviewRow, reviewed };
}

function latestReadingValue(readings) {
  if (!Array.isArray(readings) || !readings.length) return null;
  const latest = [...readings]
    .filter((reading) => Number.isFinite(Number(reading?.value)))
    .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))[0];
  return latest ? Number(latest.value) : null;
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
    case "reading-decreased":
      return "A leitura detectada é menor que a leitura anterior. O Volt não vai sugerir esse valor.";
    case "low-confidence":
    case "unreadable":
      return "Não foi possível confirmar todos os dígitos com segurança. Tire outra foto ou digite a leitura manualmente.";
    default:
      return "A leitura não pôde ser confirmada automaticamente. Tire outra foto ou digite o valor manualmente.";
  }
}

function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value));
}
