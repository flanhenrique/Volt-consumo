// Volt Beta — visão simplificada da base de usuários da plataforma
// Escopo: somente leitura. Não altera contas, sessões ou organizações.

const PLATFORM_USER_SNAPSHOT = Object.freeze({
  totalUsers: 5,
  confirmedUsers: 5,
  activeLast30Days: 5,
  capturedAt: "2026-08-07T20:37:56Z"
});

queueMicrotask(initializePlatformUsersView);

function initializePlatformUsersView() {
  const page = document.querySelector("#beta-users");
  if (!page) return;

  page.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow">VOLT</p>
        <h2 id="beta-users-title">Usuários</h2>
      </div>
    </div>

    <p class="note">Visão geral das contas cadastradas na VOLT. “Ativos recentemente” considera acesso nos últimos 30 dias.</p>

    <article class="admin-summary-card" aria-label="Resumo dos usuários da VOLT">
      <div><small>Total de contas</small><strong id="volt-platform-total-users">0</strong></div>
      <div><small>Ativos recentemente</small><strong id="volt-platform-active-users">0</strong></div>
      <div><small>E-mail confirmado</small><strong id="volt-platform-confirmed-users">0</strong></div>
    </article>

    <section class="settings-group" aria-labelledby="volt-platform-users-status-title">
      <div class="settings-row">
        <div>
          <h3 id="volt-platform-users-status-title">Status da base</h3>
          <small>Somente leitura</small>
        </div>
      </div>
      <p class="note" id="volt-platform-users-status"></p>
    </section>
  `;

  renderSnapshot();
}

function renderSnapshot() {
  setText("#volt-platform-total-users", PLATFORM_USER_SNAPSHOT.totalUsers);
  setText("#volt-platform-active-users", PLATFORM_USER_SNAPSHOT.activeLast30Days);
  setText("#volt-platform-confirmed-users", PLATFORM_USER_SNAPSHOT.confirmedUsers);

  const capturedAt = new Date(PLATFORM_USER_SNAPSHOT.capturedAt);
  const label = Number.isNaN(capturedAt.getTime())
    ? "Contagem consultada no Supabase."
    : `Contagem consultada no Supabase em ${capturedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`;
  setText("#volt-platform-users-status", `${label} Nenhuma ação administrativa é disponibilizada nesta tela.`);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}
