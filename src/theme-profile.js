const STORAGE_PREFIX = "volt-user-theme:";

const PALETTES = Object.freeze({
  volt: Object.freeze({
    id: "volt",
    label: "VOLT",
    light: Object.freeze({ accent: "#00a878", strong: "#007f60", soft: "rgba(0, 168, 120, .14)" }),
    dark: Object.freeze({ accent: "#39dfa9", strong: "#64edbd", soft: "rgba(48, 207, 157, .15)" })
  }),
  azure: Object.freeze({
    id: "azure",
    label: "Azure",
    light: Object.freeze({ accent: "#1787e8", strong: "#0f66bd", soft: "rgba(23, 135, 232, .14)" }),
    dark: Object.freeze({ accent: "#55b7ff", strong: "#8dceff", soft: "rgba(85, 183, 255, .16)" })
  }),
  violet: Object.freeze({
    id: "violet",
    label: "Violet",
    light: Object.freeze({ accent: "#7c5cff", strong: "#6242d4", soft: "rgba(124, 92, 255, .14)" }),
    dark: Object.freeze({ accent: "#a68cff", strong: "#c0b1ff", soft: "rgba(166, 140, 255, .16)" })
  }),
  amber: Object.freeze({
    id: "amber",
    label: "Amber",
    light: Object.freeze({ accent: "#d98a12", strong: "#a66300", soft: "rgba(217, 138, 18, .14)" }),
    dark: Object.freeze({ accent: "#ffbd4a", strong: "#ffd27d", soft: "rgba(255, 189, 74, .16)" })
  }),
  coral: Object.freeze({
    id: "coral",
    label: "Coral",
    light: Object.freeze({ accent: "#ea6157", strong: "#c1433b", soft: "rgba(234, 97, 87, .14)" }),
    dark: Object.freeze({ accent: "#ff887f", strong: "#ffaaa4", soft: "rgba(255, 136, 127, .16)" })
  }),
  teal: Object.freeze({
    id: "teal",
    label: "Teal",
    light: Object.freeze({ accent: "#00a7a0", strong: "#007d78", soft: "rgba(0, 167, 160, .14)" }),
    dark: Object.freeze({ accent: "#48ded6", strong: "#7cebe6", soft: "rgba(72, 222, 214, .16)" })
  })
});

let activePalette = "volt";

function normalizePalette(paletteId) {
  return Object.prototype.hasOwnProperty.call(PALETTES, paletteId) ? paletteId : "volt";
}

function activeMode() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyPalette(paletteId = activePalette) {
  activePalette = normalizePalette(paletteId);
  const root = document.documentElement;
  const values = PALETTES[activePalette][activeMode()];
  root.dataset.userPalette = activePalette;
  root.style.setProperty("--volt-accent", values.accent);
  root.style.setProperty("--volt-accent-strong", values.strong);
  root.style.setProperty("--volt-accent-soft", values.soft);
  return activePalette;
}

function storageKey(userScope) {
  const normalized = String(userScope || "").trim();
  return normalized ? `${STORAGE_PREFIX}${normalized}` : null;
}

function saveUserProfile(userScope, profile = {}) {
  const key = storageKey(userScope);
  if (!key) return null;
  const palette = normalizePalette(profile.palette);
  const payload = { palette };
  localStorage.setItem(key, JSON.stringify(payload));
  applyPalette(palette);
  return payload;
}

function loadUserProfile(userScope) {
  const key = storageKey(userScope);
  if (!key) return { palette: activePalette };
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return { palette: normalizePalette(parsed.palette) };
  } catch {
    return { palette: "volt" };
  }
}

function applyUserProfile(userScope) {
  const profile = loadUserProfile(userScope);
  applyPalette(profile.palette);
  return profile;
}

function availablePalettes() {
  return Object.values(PALETTES).map(({ id, label, light, dark }) => ({ id, label, light: { ...light }, dark: { ...dark } }));
}

function refreshMode() {
  return applyPalette(activePalette);
}

window.VoltThemeProfile = Object.freeze({
  applyPalette,
  applyUserProfile,
  availablePalettes,
  loadUserProfile,
  refreshMode,
  saveUserProfile
});

applyPalette("volt");
