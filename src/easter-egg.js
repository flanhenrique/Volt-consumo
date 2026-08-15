const REQUIRED_TAPS = 7;
const TAP_WINDOW_MS = 3200;
const AUTO_CLOSE_MS = 8500;

let tapCount = 0;
let lastTapAt = 0;
let resetTimer = null;
let closeTimer = null;
let activeOverlay = null;

function dashboardIsVisible() {
  const dashboard = document.getElementById("dashboard");
  return Boolean(dashboard && !dashboard.hidden);
}

function isVoltBrandTrigger(target) {
  if (!(target instanceof Element)) return null;
  const symbol = target.closest("#dashboard .brand-lockup .brand-symbol");
  if (!symbol) return null;
  return symbol.closest(".brand-lockup");
}

function clearCharge(brand) {
  if (brand) delete brand.dataset.easterCharge;
  tapCount = 0;
  lastTapAt = 0;
  if (resetTimer) window.clearTimeout(resetTimer);
  resetTimer = null;
}

function armReset(brand) {
  if (resetTimer) window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => clearCharge(brand), TAP_WINDOW_MS);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function buildBolt() {
  const wrap = makeElement("div", "volt-easter-bolt");
  wrap.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#icon-bolt");
  svg.append(use);
  wrap.append(svg);
  return wrap;
}

function closeEasterEgg() {
  if (!activeOverlay) return;
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = null;
  document.documentElement.classList.remove("volt-easter-active");
  activeOverlay.classList.add("volt-easter-leaving");
  const overlay = activeOverlay;
  activeOverlay = null;
  window.setTimeout(() => overlay.remove(), 360);
}

function openEasterEgg() {
  if (activeOverlay) return;

  const overlay = makeElement("section", "volt-easter-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "volt-easter-title");

  const field = makeElement("div", "volt-easter-field");
  for (let index = 0; index < 6; index += 1) {
    const pulse = makeElement("span", `volt-easter-pulse volt-easter-pulse-${index + 1}`);
    pulse.setAttribute("aria-hidden", "true");
    field.append(pulse);
  }

  const card = makeElement("div", "volt-easter-card glass-modal glass-shine");
  const label = makeElement("p", "volt-easter-kicker", "VOLT // PROTOCOLO 001");
  const title = makeElement("h1", "volt-easter-title", "Carga máxima atingida.");
  title.id = "volt-easter-title";
  const copy = makeElement("p", "volt-easter-copy", "Consumo virou informação. Informação virou controle.");
  const origin = makeElement("p", "volt-easter-origin", "Desenvolvido em Manaus, Amazonas • 2026");
  const build = makeElement("p", "volt-easter-build", `BUILD ${globalThis.__VOLT_BUILD__ || "VOLT"}`);
  const close = makeElement("button", "volt-easter-close", "Voltar ao VOLT");
  close.type = "button";
  close.addEventListener("click", closeEasterEgg);

  card.append(buildBolt(), label, title, copy, origin, build, close);
  overlay.append(field, card);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeEasterEgg();
  });

  document.body.append(overlay);
  activeOverlay = overlay;
  document.documentElement.classList.add("volt-easter-active");
  window.requestAnimationFrame(() => overlay.classList.add("volt-easter-visible"));
  close.focus({ preventScroll: true });
  closeTimer = window.setTimeout(closeEasterEgg, AUTO_CLOSE_MS);
}

document.addEventListener("click", (event) => {
  if (!dashboardIsVisible() || activeOverlay) return;
  const brand = isVoltBrandTrigger(event.target);
  if (!brand) return;

  const now = Date.now();
  if (lastTapAt && now - lastTapAt > TAP_WINDOW_MS) tapCount = 0;
  lastTapAt = now;
  tapCount += 1;
  brand.dataset.easterCharge = String(Math.min(tapCount, REQUIRED_TAPS - 1));
  armReset(brand);

  if (tapCount < REQUIRED_TAPS) return;
  clearCharge(brand);
  openEasterEgg();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeOverlay) closeEasterEgg();
});
