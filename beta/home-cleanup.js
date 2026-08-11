queueMicrotask(cleanHome);
window.addEventListener("volt:beta-data", cleanHome);

function cleanHome() {
  document.querySelector(".organization-context")?.remove();
  document.querySelector(".tariff-info-card")?.remove();

  const heading = document.querySelector(".cycle-heading");
  const eyebrow = heading?.querySelector(".eyebrow");
  if (eyebrow) eyebrow.textContent = "CICLOS DE CONTAGEM";

  const title = document.querySelector("#beta-home-title");
  if (title) title.textContent = "Ciclos";

  const label = document.querySelector("#beta-cycle-label");
  const context = window.VOLT_CYCLE_CONTEXT;
  if (!label || !context) return;

  if (!label.querySelector(".cycle-line")) {
    label.classList.add("cycle-lines");
    label.replaceChildren(
      makeLine("water", "💧", "Água", context.water),
      makeLine("energy", "ϟ", "Energia", context.energy)
    );
  }
}

function makeLine(type, icon, name, item) {
  const row = document.createElement("span");
  row.className = `cycle-line ${type}`;
  const symbol = document.createElement("b");
  symbol.className = "cycle-line-icon";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = icon;
  const copy = document.createElement("span");
  const utility = document.createElement("strong");
  utility.textContent = name;
  const range = document.createElement("small");
  range.textContent = item?.label || "Não configurado";
  copy.append(utility, range);
  row.append(symbol, copy);
  return row;
}
