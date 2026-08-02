/**
 * Volt Consumo — Beta v3 · camada de microinterações
 * ---------------------------------------------------------------------------
 * Estritamente visual. Este módulo não lê, calcula, valida nem persiste dado
 * algum: apenas observa o que a aplicação já faz e ajusta a apresentação.
 *
 * Responsabilidades:
 *   1. Material do cabeçalho conforme a rolagem
 *   2. Cápsula deslizante da navegação inferior
 *   3. Estado de carregamento dos botões de envio
 *
 * Se qualquer elemento esperado não existir, o módulo simplesmente não age —
 * nenhuma funcionalidade do produto depende dele.
 */

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");

start();

function start() {
  const shell = document.querySelector(".beta-v2-shell");
  if (!shell) return;

  enhanceHeader(shell);
  enhanceNavigation(shell);
  enhanceSubmitFeedback();
}

/* ==========================================================================
   1. Cabeçalho
   --------------------------------------------------------------------------
   O cabeçalho nasce transparente e só ganha vidro quando há conteúdo por
   baixo dele. Evita uma barra sólida flutuando sobre uma página no topo.
   ========================================================================== */

function enhanceHeader(shell) {
  const header = shell.querySelector(".beta-header");
  const content = shell.querySelector("#beta-content");
  if (!header || !content) return;

  const sync = () => {
    header.dataset.scrolled = String(content.scrollTop > 4 || window.scrollY > 4);
  };

  content.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

/* ==========================================================================
   2. Navegação inferior
   --------------------------------------------------------------------------
   Uma única cápsula percorre a barra em vez de quatro fundos acendendo e
   apagando. A posição é medida do próprio botão ativo, então acompanha
   qualquer largura de tela sem valores fixos.
   ========================================================================== */

function enhanceNavigation(shell) {
  const navigation = shell.querySelector(".bottom-navigation");
  if (!navigation) return;

  const indicator = document.createElement("span");
  indicator.className = "nav-indicator";
  indicator.dataset.ready = "false";
  indicator.setAttribute("aria-hidden", "true");
  navigation.prepend(indicator);

  const move = () => {
    const active = navigation.querySelector("button.active");
    if (!active) return;
    const bounds = active.getBoundingClientRect();
    const reference = navigation.getBoundingClientRect();
    if (bounds.width === 0) return;
    indicator.style.setProperty("--nav-indicator-width", `${bounds.width}px`);
    indicator.style.setProperty("--nav-indicator-x", `${bounds.left - reference.left}px`);
  };

  const release = () => {
    move();
    requestAnimationFrame(() => {
      indicator.dataset.ready = "true";
    });
  };

  navigation.addEventListener("click", () => requestAnimationFrame(move));
  window.addEventListener("resize", move, { passive: true });

  // A barra só tem largura mensurável depois que o painel deixa de estar
  // oculto; observar o atributo evita medir um elemento de tamanho zero.
  const dashboard = document.querySelector("#dashboard");
  if (dashboard) {
    new MutationObserver(() => {
      if (!dashboard.hidden) release();
    }).observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
    if (!dashboard.hidden) release();
    return;
  }

  release();
}

/* ==========================================================================
   3. Estado de carregamento
   --------------------------------------------------------------------------
   Marca o botão que disparou um envio enquanto a operação corre. O ouvinte é
   passivo: não cancela, não altera dados e não interfere no envio.
   ========================================================================== */

function enhanceSubmitFeedback() {
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method === "dialog") return;

      const button = event.submitter;
      if (!(button instanceof HTMLButtonElement) || button.dataset.loading === "true") return;

      button.dataset.loading = "true";
      const settle = () => {
        delete button.dataset.loading;
      };

      // A aplicação repinta a interface ao concluir; o estado é liberado no
      // próximo repinte estável ou por tempo, o que ocorrer primeiro.
      window.addEventListener("volt:beta-data", settle, { once: true });
      window.setTimeout(settle, REDUCED_MOTION.matches ? 240 : 900);
    },
    true
  );
}
