// Volt Beta — a organização interna não faz parte da experiência pessoal do proprietário.
// Mantemos a lógica de organização disponível no backend, mas removemos o seletor visual
// do shell principal para não confundir administração da VOLT com organização de membros.

queueMicrotask(() => {
  document.querySelector(".organization-context")?.remove();
});
