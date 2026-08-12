queueMicrotask(cleanHome);
window.addEventListener("volt:beta-data", cleanHome);
window.addEventListener("volt:cycle-context", cleanHome);

function cleanHome() {
  const home = document.querySelector("#beta-home");
  const shell = document.querySelector(".beta-v2-shell");
  if (!home || !shell) return;

  /* Organization context is a shell sibling, not a child of #beta-home. */
  shell.querySelector(":scope > .organization-context")?.remove();
  home.querySelector(".tariff-info-card")?.remove();

  const heading = home.querySelector(".cycle-heading");
  const eyebrow = heading?.querySelector(".eyebrow");
  const title = home.querySelector("#beta-home-title");

  if (eyebrow) eyebrow.textContent = "CICLO DE CONTAGEM";
  if (title) title.textContent = "Ciclos atuais";
}
