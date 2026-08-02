/**
 * Volt Consumo — Beta v3.1 · camada de microinterações e layout dinâmico
 * ---------------------------------------------------------------------------
 * Estritamente visual. Este módulo não lê, calcula, valida nem persiste dado
 * algum: apenas observa o que a aplicação já faz e ajusta a apresentação.
 *
 * Responsabilidades:
 *   1. Cor da barra de status acompanhando o tema
 *   2. Altura real da navegação devolvida ao sistema de layout
 *   3. Material do cabeçalho conforme a rolagem
 *   4. Cápsula deslizante da navegação inferior
 *   5. Estado de carregamento dos botões de envio
 *
 * Se qualquer elemento esperado não existir, o módulo simplesmente não age —
 * nenhuma funcionalidade do produto depende dele.
 */

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const DARK_SCHEME = window.matchMedia("(prefers-color-scheme: dark)");

start();

function start() {
  syncStatusBarColor();

  const shell = document.querySelector(".beta-v2-shell");
  if (!shell) return;

  measureNavigationHeight(shell);
  enhanceHeader(shell);
  enhanceNavigation(shell);
  enhanceSubmitFeedback();
}

/* ==========================================================================
   1. Barra de status
   --------------------------------------------------------------------------
   Sem isto o navegador pinta a faixa da barra de status com a cor declarada
   estaticamente no HTML, e aparece uma faixa clara acima do aplicativo. A cor
   passa a ser lida do próprio tema em vigor, então barra de status, cabeçalho
   e conteúdo formam uma superfície contínua nos dois temas.
   ========================================================================== */

function syncStatusBarColor() {
  const apply = () => {
    const canvas = getComputedStyle(document.documentElement)
      .getPropertyValue("--lm-canvas")
      .trim();
    if (!canvas) return;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.removeAttribute("media");
      meta.setAttribute("content", canvas);
    }
  };

  apply();

  // O tema muda por atributo na raiz (botão de tema) ou por preferência do
  // sistema quando nenhum tema foi fixado.
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });
  DARK_SCHEME.addEventListener("change", apply);
}

/* ==========================================================================
   2. Altura da navegação
   --------------------------------------------------------------------------
   `--lm-content-bottom` reserva a faixa do rodapé flutuante para que nenhum
   cartão termine escondido atrás dele. Essa reserva depende da altura real da
   barra, que muda com o tamanho de fonte do sistema e com o comprimento dos
   rótulos. Medir é mais confiável do que estimar.
   ========================================================================== */

function measureNavigationHeight(shell) {
  const navigation = shell.querySelector(".bottom-navigation");
  if (!navigation || typeof ResizeObserver === "undefined") return;

  const publish = () => {
    const height = Math.round(navigation.getBoundingClientRect().height);
    if (height > 0) {
      document.documentElement.style.setProperty("--lm-nav-height", `${height}px`);
    }
  };

  new ResizeObserver(publish).observe(navigation);
  publish();
}

/* ==========================================================================
   3. Cabeçalho
   --------------------------------------------------------------------------
   O cabeçalho nasce transparente e só ganha vidro quando há conteúdo por
   baixo dele. É o que permite que a primeira tela seja uma superfície só.
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
   4. Navegação inferior
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
   5. Estado de carregamento
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
