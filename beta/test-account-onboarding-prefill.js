const TEST_ACCOUNT_EMAIL = "walflanribeiro@gmail.com";
const TEST_ENERGY_CYCLE = Object.freeze({ start: 17, end: 16 });
const TEST_WATER_CYCLE = Object.freeze({ start: 1, end: 31 });

queueMicrotask(initializeTestOnboardingPrefill);

function initializeTestOnboardingPrefill() {
  waitForSetupDialog();
  window.addEventListener("volt:beta-data", () => {
    const dialog = document.querySelector("#initial-bill-setup-dialog");
    if (dialog?.open) prefillTestSetup(dialog);
  });
}

function waitForSetupDialog(attempt = 0) {
  const dialog = document.querySelector("#initial-bill-setup-dialog");
  if (!dialog) {
    if (attempt < 100) window.setTimeout(() => waitForSetupDialog(attempt + 1), 100);
    return;
  }

  new MutationObserver(() => {
    if (dialog.open) window.setTimeout(() => prefillTestSetup(dialog), 40);
  }).observe(dialog, { attributes: true, attributeFilter: ["open"] });

  if (dialog.open) prefillTestSetup(dialog);
}

function prefillTestSetup(dialog, attempt = 0) {
  const snapshot = window.VOLT_BETA_API?.getSnapshot?.();
  const email = snapshot?.account?.email?.trim().toLowerCase() || "";
  if (email !== TEST_ACCOUNT_EMAIL) return;

  const energyCycleStart = dialog.querySelector("#initial-energy-cycle-start");
  const energyCycleEnd = dialog.querySelector("#initial-energy-cycle-end");
  const waterCycleStart = dialog.querySelector("#initial-water-cycle-start");
  const waterCycleEnd = dialog.querySelector("#initial-water-cycle-end");
  if ((!energyCycleStart || !energyCycleEnd) && attempt < 25) {
    window.setTimeout(() => prefillTestSetup(dialog, attempt + 1), 40);
    return;
  }

  const energyReadings = sortedReadings(snapshot?.energy?.readings);
  const waterReadings = sortedReadings(snapshot?.water?.readings);

  setValue(energyCycleStart, TEST_ENERGY_CYCLE.start);
  setValue(energyCycleEnd, TEST_ENERGY_CYCLE.end);
  setValue(waterCycleStart, TEST_WATER_CYCLE.start);
  setValue(waterCycleEnd, TEST_WATER_CYCLE.end);

  const hasEnergyPair = fillReadingPair(dialog, "energy", energyReadings);
  const hasWaterPair = fillReadingPair(dialog, "water", waterReadings);

  setUtilityEnabled(dialog, "energy", hasEnergyPair);
  setUtilityEnabled(dialog, "water", hasWaterPair);

  const heading = dialog.querySelector(".initial-bill-setup-head h2");
  if (heading) heading.textContent = "Confira os dados da última fatura";
  const intro = dialog.querySelector(".initial-bill-setup-head p:last-child");
  if (intro) intro.textContent = "Conta de teste: os dados já estão preenchidos. Confira e toque em OK para continuar.";

  const note = dialog.querySelector(".initial-setup-note");
  if (note) {
    note.textContent = hasWaterPair
      ? "Energia e água foram preenchidas com os dados salvos desta conta de teste."
      : "Energia foi preenchida com os dados salvos. Água permanece desmarcada porque esta conta não possui duas leituras de água salvas.";
  }

  dialog.querySelectorAll("[data-setup-skip]").forEach((button) => { button.hidden = true; });
  const save = dialog.querySelector("#initial-setup-save");
  if (save) save.textContent = "OK e continuar";

  const status = dialog.querySelector("#initial-bill-setup-status");
  if (status) status.textContent = "Dados de teste carregados. Nenhuma leitura será apagada ao confirmar.";

  dialog.dataset.testPrefilled = "true";
}

function sortedReadings(items) {
  return Array.isArray(items)
    ? [...items]
        .filter((item) => Number.isFinite(Number(item?.value)) && !Number.isNaN(new Date(item?.date).getTime()))
        .sort((left, right) => new Date(left.date) - new Date(right.date))
    : [];
}

function fillReadingPair(dialog, type, readings) {
  if (readings.length < 2) return false;
  const previous = readings[0];
  const current = readings.at(-1);
  setValue(dialog.querySelector(`#initial-${type}-previous`), previous.value);
  setValue(dialog.querySelector(`#initial-${type}-previous-date`), toLocalInputValue(previous.date));
  setValue(dialog.querySelector(`#initial-${type}-current`), current.value);
  setValue(dialog.querySelector(`#initial-${type}-current-date`), toLocalInputValue(current.date));
  return true;
}

function setUtilityEnabled(dialog, type, enabled) {
  const checkbox = dialog.querySelector(`#initial-${type}-enabled`);
  if (!checkbox) return;
  checkbox.checked = enabled;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));

  const readingFields = dialog.querySelector(`[data-setup-section="${type}"]`);
  if (readingFields) readingFields.hidden = !enabled;
  const cycleFields = dialog.querySelector(`[data-separate-cycle="${type}"]`);
  if (cycleFields) cycleFields.hidden = !enabled;
}

function setValue(input, value) {
  if (!input || value === undefined || value === null) return;
  input.value = String(value);
}

function toLocalInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
