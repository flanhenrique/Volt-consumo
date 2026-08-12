import { normalizeRegionalContext } from "./mercosur-region.js";

const LOCALITY_KEY = "volt:beta:locality-context-v1";
queueMicrotask(applyRegionalCycles);
window.addEventListener("volt:beta-data", applyRegionalCycles);
window.addEventListener("volt:cycle-context", applyRegionalCycles);
window.addEventListener("volt:locality-context", applyRegionalCycles);

function applyRegionalCycles() {
  const context = readContext();
  if (context.country !== "UY") return;
  localizeCycleHeader(context);
  localizeCycleSettings();
  localizeReadingHistory(context);
  localizeReports();
}

function localizeCycleHeader(context) {
  setText(".cycle-heading .eyebrow", "CICLOS DE MEDICIÓN");
  setText("#beta-home-title", "Ciclos actuales");
  const cycle = window.VOLT_CYCLE_CONTEXT || {};
  const label = document.querySelector("#beta-cycle-label");
  if (!label) return;
  label.classList.add("cycle-lines");
  label.replaceChildren(
    cycleLine("water", "●", "Agua", cycle.water, context),
    cycleLine("energy", "ϟ", "Energía", cycle.energy, context)
  );
}

function cycleLine(type, icon, name, cycle, context) {
  const row = document.createElement("span"); row.className = `cycle-line ${type}`;
  const symbol = document.createElement("b"); symbol.className = "cycle-line-icon"; symbol.textContent = icon; symbol.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  const utility = document.createElement("strong"); utility.textContent = name;
  const range = document.createElement("small"); range.textContent = cycle?.current ? formatRange(cycle.current, context) : "No configurado";
  copy.append(utility, range); row.append(symbol, copy); return row;
}

function localizeCycleSettings() {
  const energyForm = document.querySelector("#beta-energy-cycle-form");
  const group = energyForm?.closest(".settings-group");
  if (!group) return;
  const heading = group.querySelector("h3"); if (heading) heading.textContent = "Ciclos de medición";
  const note = group.querySelector(":scope > .note"); if (note) note.textContent = "Energía y agua tienen ciclos independientes. Cada servicio mantiene su propio período.";
  localizeCycleForm("energy", "Energía", "energía");
  localizeCycleForm("water", "Agua", "agua");
}
function localizeCycleForm(type, title, lower) {
  const form = document.querySelector(`#beta-${type}-cycle-form`); if (!form) return;
  const strong = form.querySelector("strong"); if (strong) strong.textContent = title;
  const spans = form.querySelectorAll("label span"); if (spans[0]) spans[0].textContent = "Día de inicio"; if (spans[1]) spans[1].textContent = "Día de cierre";
  const button = form.querySelector("button[type=submit]"); if (button) button.textContent = `Guardar ciclo de ${lower}`;
}

function localizeReadingHistory(context) {
  setText("#beta-readings .eyebrow", "HISTORIAL");
  setText("#beta-readings-title", "Lecturas");
  const action = document.querySelector("#beta-readings [data-new-reading]"); if (action) action.textContent = "Nueva lectura";
  setText("#beta-reading-empty", "Todavía no hay lecturas registradas.");
  document.querySelectorAll("#beta-reading-list .beta-reading-item").forEach((item) => {
    const meta = item.querySelector(".reading-info small");
    if (meta) meta.textContent = meta.textContent.replace(/^Energia · /, "Energía · ").replace(/^Água · /, "Agua · ").replace(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/, (_,d,m,y,h,min) => new Intl.DateTimeFormat(context.locale || "es-UY", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(`${y}-${m}-${d}T${h}:${min}:00`)));
    const summary = item.querySelector("summary"); if (summary) summary.setAttribute("aria-label", "Acciones de la lectura");
    const buttons = item.querySelectorAll("button"); if (buttons[0]) buttons[0].textContent = "Editar"; if (buttons[1]) buttons[1].textContent = "Eliminar";
  });
}

function localizeReports() {
  setText("#beta-reports .eyebrow", "ANÁLISIS"); setText("#beta-reports-title", "Informes");
  const pdf = document.querySelector("#beta-export-pdf"); if (pdf) pdf.textContent = "Exportar PDF";
  const cards = document.querySelectorAll("#beta-reports .report-card h3");
  if (cards[0]) cards[0].textContent = "Consumo por lectura";
  if (cards[1]) cards[1].textContent = "Comparación actual";
  if (cards[2]) cards[2].textContent = "Evolución del agua";
  const notes = document.querySelectorAll("#beta-reports .report-card > .note");
  if (notes[0]) notes[0].textContent = "Evolución entre registros consecutivos.";
  if (notes[1]) notes[1].textContent = "Variación entre lecturas del medidor de agua.";
}

function formatRange(range, context) { const formatter = new Intl.DateTimeFormat(context.locale || "es-UY", {day:"2-digit",month:"short"}); return `${formatter.format(new Date(range.start)).replace(".","")} – ${formatter.format(new Date(range.end)).replace(".","")}`; }
function readContext(){if(window.VOLT_REGION_CONTEXT)return normalizeRegionalContext(window.VOLT_REGION_CONTEXT);try{return normalizeRegionalContext(JSON.parse(localStorage.getItem(LOCALITY_KEY)||"{}"));}catch{return normalizeRegionalContext({});}}
function setText(selector,value){const element=document.querySelector(selector);if(element)element.textContent=value;}
