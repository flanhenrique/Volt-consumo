queueMicrotask(cleanHome);
window.addEventListener("volt:beta-data", cleanHome);

function cleanHome() {
  const home = document.querySelector("#beta-home");
  if (!home) return;

  home.querySelector(".organization-context")?.remove();
  home.querySelector(".tariff-info-card")?.remove();

  const heading = home.querySelector(".cycle-heading");
  const eyebrow = heading?.querySelector(".eyebrow");
  const title = home.querySelector("#beta-home-title");

  if (eyebrow) eyebrow.textContent = "CICLO DE CONTAGEM";
  if (title) title.textContent = "Ciclos atuais";
}
