queueMicrotask(cleanHome);
window.addEventListener("volt:beta-data", cleanHome);
window.addEventListener("volt:cycle-context", cleanHome);

let headingObserver;

function cleanHome() {
  document.querySelector(".organization-context")?.remove();
  document.querySelector(".tariff-info-card")?.remove();

  enforceCycleHeading();
  observeCycleHeading();

  const label = document.querySelector("#beta-cycle-label");
  const context = window.VOLT_CYCLE_CONTEXT;
  if (!label || !context) return;

  label.classList.add("cycle-lines");
  label.replaceChildren(
    makeLine("water", "●", "Água", context.water),
    makeLine("energy", "ϟ", "Energia", context.energy)
  );
}

function enforceCycleHeading() {
  const heading = document.querySelector("#beta-home .cycle-heading");
  const eyebrow = heading?.querySelector(".eyebrow");
  const title = heading?.querySelector("#beta-home-title");

  if (eyebrow && eyebrow.textContent !== "CICLO DE CONTAGEM") {
    eyebrow.textContent = "CICLO DE CONTAGEM";
  }
  if (title && title.textContent !== "Ciclos atuais") {
    title.textContent = "Ciclos atuais";
  }
}

function observeCycleHeading() {
  if (headingObserver) return;
  const heading = document.querySelector("#beta-home .cycle-heading");
  if (!heading) return;
  headingObserver = new MutationObserver(() => {
    enforceCycleHeading();
  });
  headingObserver.observe(heading, { childList: true, subtree: true, characterData: true });
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
