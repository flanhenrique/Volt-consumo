const REQUIRED_TAPS = 3;
const TAP_WINDOW_MS = 1800;
const AUTO_CLOSE_MS = 6200;
const COOLDOWN_MS = 7000;
const CONFETTI_COUNT = 64;
const BRAND_SELECTOR = "#dashboard .brand-lockup";

let tapCount = 0;
let lastTapAt = 0;
let resetTimer = null;
let closeTimer = null;
let activeOverlay = null;
let cooldownUntil = 0;

function dashboardIsVisible() {
  const dashboard = document.getElementById("dashboard");
  return Boolean(dashboard && !dashboard.hidden);
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

function svgElement(tag, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function buildBull() {
  const wrap = makeElement("div", "caprichoso-bull");
  wrap.setAttribute("aria-hidden", "true");

  const svg = svgElement("svg", { viewBox: "0 0 260 230", role: "img" });
  const glow = svgElement("circle", { cx: "130", cy: "116", r: "94", class: "caprichoso-bull-glow" });

  const leftHorn = svgElement("path", {
    d: "M92 74C63 63 41 45 30 19c20 16 41 22 66 18 5 14 4 25-4 37Z",
    class: "caprichoso-horn"
  });
  const rightHorn = svgElement("path", {
    d: "M168 74c29-11 51-29 62-55-20 16-41 22-66 18-5 14-4 25 4 37Z",
    class: "caprichoso-horn"
  });

  const leftEar = svgElement("path", {
    d: "M93 76C67 67 55 71 44 91c20 3 34 11 47 24 6-14 7-26 2-39Z",
    class: "caprichoso-ear"
  });
  const rightEar = svgElement("path", {
    d: "M167 76c26-9 38-5 49 15-20 3-34 11-47 24-6-14-7-26-2-39Z",
    class: "caprichoso-ear"
  });

  const head = svgElement("path", {
    d: "M130 52c-35 0-61 28-61 67 0 26 9 53 23 73 10 15 22 25 38 25s28-10 38-25c14-20 23-47 23-73 0-39-26-67-61-67Z",
    class: "caprichoso-head"
  });

  const muzzle = svgElement("path", {
    d: "M99 169c8-13 19-19 31-19s23 6 31 19c-3 25-14 40-31 40s-28-15-31-40Z",
    class: "caprichoso-muzzle"
  });

  const leftEye = svgElement("path", { d: "M94 124c8-8 18-8 27 0-8 7-18 7-27 0Z", class: "caprichoso-eye" });
  const rightEye = svgElement("path", { d: "M139 124c9-8 19-8 27 0-9 7-19 7-27 0Z", class: "caprichoso-eye" });
  const leftNostril = svgElement("ellipse", { cx: "116", cy: "180", rx: "5", ry: "3", class: "caprichoso-nostril" });
  const rightNostril = svgElement("ellipse", { cx: "144", cy: "180", rx: "5", ry: "3", class: "caprichoso-nostril" });

  const star = svgElement("path", {
    d: "M130 78l6.6 13.4 14.8 2.1-10.7 10.4 2.5 14.7-13.2-7-13.2 7 2.5-14.7-10.7-10.4 14.8-2.1L130 78Z",
    class: "caprichoso-star"
  });

  svg.append(glow, leftHorn, rightHorn, leftEar, rightEar, head, muzzle, leftEye, rightEye, leftNostril, rightNostril, star);
  wrap.append(svg);
  return wrap;
}

function buildConfetti() {
  const layer = makeElement("div", "caprichoso-confetti");
  layer.setAttribute("aria-hidden", "true");
  const variants = ["blue", "white", "silver"];

  for (let index = 0; index < CONFETTI_COUNT; index += 1) {
    const piece = makeElement("i", `caprichoso-confetti-piece is-${variants[index % variants.length]}`);
    const x = (index * 37 + 11) % 101;
    const drift = ((index * 29) % 121) - 60;
    const delay = ((index * 83) % 950) / 1000;
    const duration = 2.6 + ((index * 17) % 18) / 10;
    const spin = 360 + ((index * 47) % 720);
    const scale = 0.7 + ((index * 13) % 8) / 10;
    piece.style.setProperty("--x", `${x}vw`);
    piece.style.setProperty("--drift", `${drift}px`);
    piece.style.setProperty("--delay", `${delay}s`);
    piece.style.setProperty("--duration", `${duration}s`);
    piece.style.setProperty("--spin", `${spin}deg`);
    piece.style.setProperty("--scale", String(scale));
    layer.append(piece);
  }

  return layer;
}

function closeEasterEgg() {
  if (!activeOverlay) return;
  if (closeTimer) window.clearTimeout(closeTimer);
  closeTimer = null;
  document.documentElement.classList.remove("volt-easter-active");
  activeOverlay.classList.add("volt-easter-leaving");
  const overlay = activeOverlay;
  activeOverlay = null;
  cooldownUntil = Date.now() + COOLDOWN_MS;
  window.setTimeout(() => overlay.remove(), 520);
}

function openEasterEgg() {
  if (activeOverlay || Date.now() < cooldownUntil) return;

  const overlay = makeElement("section", "volt-easter-overlay caprichoso-celebration");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "caprichoso-champion-title");

  const light = makeElement("div", "caprichoso-light");
  light.setAttribute("aria-hidden", "true");

  const stage = makeElement("div", "caprichoso-stage");
  const kicker = makeElement("p", "caprichoso-kicker", "59º FESTIVAL DE PARINTINS");
  const title = makeElement("h1", "caprichoso-title");
  title.id = "caprichoso-champion-title";
  title.append(
    makeElement("span", "caprichoso-name", "CAPRICHOSO"),
    makeElement("span", "caprichoso-champion", "CAMPEÃO 2026")
  );
  const message = makeElement("p", "caprichoso-message", "A estrela azul brilhou mais uma vez.");
  const place = makeElement("p", "caprichoso-place", "PARINTINS • AMAZONAS");

  stage.append(kicker, buildBull(), title, message, place);
  overlay.append(light, buildConfetti(), stage);

  overlay.addEventListener("click", () => closeEasterEgg(), { once: true });

  document.body.append(overlay);
  activeOverlay = overlay;
  document.documentElement.classList.add("volt-easter-active");
  window.requestAnimationFrame(() => overlay.classList.add("volt-easter-visible"));
  closeTimer = window.setTimeout(closeEasterEgg, AUTO_CLOSE_MS);
}

function registerBrandTap(brand) {
  if (!dashboardIsVisible() || activeOverlay || Date.now() < cooldownUntil) return;
  if (!(brand instanceof Element)) return;

  const now = Date.now();
  if (lastTapAt && now - lastTapAt > TAP_WINDOW_MS) tapCount = 0;
  lastTapAt = now;
  tapCount += 1;
  brand.dataset.easterCharge = String(Math.min(tapCount, REQUIRED_TAPS - 1));
  armReset(brand);

  if (tapCount < REQUIRED_TAPS) return;
  clearCharge(brand);
  openEasterEgg();
}

function prepareBrandTrigger(brand) {
  if (!(brand instanceof HTMLElement) || brand.dataset.easterPrepared === "true") return;
  brand.dataset.easterPrepared = "true";
  brand.style.touchAction = "manipulation";
  brand.style.webkitTapHighlightColor = "transparent";
  brand.style.userSelect = "none";
  brand.style.webkitUserSelect = "none";

  brand.querySelectorAll("svg, use, img, .brand-symbol, .brand-name").forEach((child) => {
    if (child instanceof HTMLElement || child instanceof SVGElement) child.style.pointerEvents = "none";
  });

  brand.addEventListener("click", (event) => {
    if (!dashboardIsVisible() || activeOverlay || Date.now() < cooldownUntil) return;
    event.preventDefault();
    event.stopPropagation();
    registerBrandTap(brand);
  });
}

document.querySelectorAll(BRAND_SELECTOR).forEach(prepareBrandTrigger);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeOverlay) closeEasterEgg();
});
