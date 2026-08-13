const api = window.VOLT_BETA_API;
let reminderTimer;

if (api) {
  initializeBetaExperience();
}

function initializeBetaExperience() {
  const dashboard = document.querySelector("#dashboard");
  const energyDialog = document.querySelector("#energy-reading-dialog");
  const waterDialog = document.querySelector("#water-reading-dialog");
  const energySettings = document.querySelector("#settings-form")?.closest("details");
  const waterSettings = document.querySelector("#water-settings-form")?.closest("details");
  const engines = document.querySelector("#engine-list")?.closest("section");
  energyDialog && document.body.append(energyDialog);
  waterDialog && document.body.append(waterDialog);

  const shell = document.createElement("div");
  shell.className = "beta-v2-shell";
  shell.innerHTML = betaShellMarkup();
  dashboard.append(shell);

  const advancedContent = shell.querySelector("#beta-advanced-content");
  [energySettings, waterSettings, engines].forEach((element) => element && advancedContent.append(element));

  removeLegacyDestructiveControls();
  bindNavigation(shell);
  bindReadingFlow(shell, energyDialog, waterDialog);
  bindInvitation(shell);
  bindAccount(shell);
  bindMfa(shell);
  bindOperationalHealth(shell);
  bindPreferences(shell);
  bindNotifications(shell);
  bindPrivacy(shell);
  bindHelp(shell);
  bindRestore(shell);
  bindAdministration(shell);

  window.setInterval(() => {
    const usersActive = document.querySelector("#beta-users")?.classList.contains("active");
    if (!document.hidden && usersActive) {
      Promise.all([api.refreshFeatureFlags(), api.refreshOperationalMetrics()]).catch(() => undefined);
    }
  }, 60_000);

  window.addEventListener("volt:beta-data", renderBetaExperience);
  window.addEventListener("volt:cycle-context", renderBetaExperience);
  window.addEventListener("focus", refreshBetaData);
  new MutationObserver(() => {
    if (!dashboard.hidden) {
      renderBetaExperience();
      requestAnimationFrame(resetPageScroll);
    }
  }).observe(dashboard, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleDailyReminder();
      refreshBetaData();
    }
  });
  renderBetaExperience();
  scheduleDailyReminder();
}

function betaShellMarkup() {
  return `
    <header class="beta-header">
      <div><p class="eyebrow">VOLT CONSUMO <span class="environment-badge">BETA v3</span></p><h1 id="beta-greeting">Olá!</h1></div>
      <button id="beta-theme-shortcut" class="icon-button" type="button" aria-label="Alternar tema">☾</button>
    </header>
    <main class="beta-content" id="beta-content">
      <section class="beta-page active" id="beta-home" data-page="home" aria-labelledby="beta-home-title">
        <div class="cycle-heading"><div><p class="eyebrow">CICLO DE CONTAGEM</p><h2 id="beta-home-title">Ciclo atual</h2></div><span id="beta-cycle-label" class="cycle-chip">—</span></div>
        <div class="utility-grid">
          <article class="utility-card water"><div class="utility-card-heading"><span class="utility-icon" aria-hidden="true">●</span><h3>Água</h3></div><div class="utility-card-content"><div><p>Consumo</p><strong id="beta-water-consumption">0 m³</strong></div><div class="financial-preview"><p>Estimativa</p><strong id="beta-water-cost">R$ 0,00</strong></div></div><small id="beta-water-comparison" class="cycle-comparison">Aguardando leituras</small></article>
          <article class="utility-card energy"><div class="utility-card-heading"><span class="utility-icon" aria-hidden="true">ϟ</span><h3>Energia</h3></div><div class="utility-card-content"><div><p>Consumo</p><strong id="beta-energy-consumption">0 kWh</strong></div><div class="financial-preview"><p>Estimativa</p><strong id="beta-energy-cost">R$ 0,00</strong></div></div><small id="beta-energy-comparison" class="cycle-comparison">Aguardando leituras</small></article>
        </div>
        <article class="cycle-summary-card financial-summary-card">
          <div class="summary-header"><div><p class="eyebrow">RESUMO FINANCEIRO</p><h2>Total estimado</h2></div><strong id="beta-financial-total" class="financial-total">R$ 0,00</strong></div>
          <div class="summary-values" id="beta-summary-values"></div>
          <div class="financial-insights"><p id="beta-financial-comparison">Aguardando leituras para comparar os ciclos.</p><p id="beta-cycle-forecast">Aguardando leituras para prever o encerramento.</p></div>
        </article>
      </section>

      <section class="beta-page" id="beta-readings" data-page="readings" aria-labelledby="beta-readings-title" hidden>
        <div class="page-heading"><div><p class="eyebrow">HISTÓRICO</p><h2 id="beta-readings-title">Leituras</h2></div><button class="secondary-button compact-action" type="button" data-new-reading>Nova leitura</button></div>
        <p id="beta-reading-status" class="note status-message" role="status" aria-live="polite"></p>
        <div id="beta-reading-empty" class="empty">Nenhuma leitura registrada ainda.</div>
        <ul id="beta-reading-list" class="beta-reading-list"></ul>
      </section>

      <section class="beta-page" id="beta-reports" data-page="reports" hidden></section>

      <section class="beta-page" id="beta-users" data-page="users" aria-labelledby="beta-users-title" hidden>
        <div class="page-heading"><div><p class="eyebrow">ORGANIZAÇÃO</p><h2 id="beta-users-title">Controle de usuários</h2></div><button id="beta-invite-user" class="primary-button compact-action" type="button">Convidar usuário</button></div>
        <div id="beta-admin-unavailable" class="admin-notice" hidden><strong>Administração indisponível</strong><p id="beta-admin-message">A atualização do banco precisa ser aplicada antes de usar este módulo.</p></div>
        <div id="beta-admin-workspace" hidden>
          <article class="admin-summary-card"><div><small>Organização</small><strong id="beta-organization-name">—</strong></div><div><small>Seu papel</small><strong id="beta-current-role">—</strong></div><div><small>Usuários ativos</small><strong id="beta-member-count">0</strong></div></article>
          <section class="settings-group" aria-labelledby="beta-operational-title"><div class="settings-row"><div><h3 id="beta-operational-title">Operação nas últimas 24 horas</h3><small>Métricas agregadas, sem conteúdo pessoal.</small></div><div class="inline-actions"><button id="beta-export-prometheus" class="secondary-button compact-action" type="button">Exportar Prometheus</button><button id="beta-refresh-operational" class="secondary-button compact-action" type="button">Atualizar métricas</button></div></div><div id="beta-operational-unavailable" class="admin-notice" hidden></div><div id="beta-operational-metrics" class="operational-metric-grid"><div><small>Eventos</small><strong id="beta-metric-events">0</strong></div><div><small>Erros</small><strong id="beta-metric-errors">0</strong></div><div><small>Taxa de erro</small><strong id="beta-metric-error-rate">0%</strong></div><div><small>Latência p95</small><strong id="beta-metric-latency">0 ms</strong></div></div><div id="beta-operational-components" class="operational-component-list"></div><details class="trace-timeline"><summary>Traces recentes (W3C/OpenTelemetry)</summary><div id="beta-trace-list" class="trace-list"></div></details><small id="beta-operational-refreshed">—</small></section>
          <section class="settings-group"><div class="settings-row"><div><h3>Usuários</h3><small>Gerencie papéis e acesso apenas desta organização.</small></div><label class="admin-search"><span class="sr-only">Buscar usuário</span><input id="beta-user-search" type="search" placeholder="Buscar por nome ou e-mail"></label></div><div id="beta-member-list" class="admin-member-list"></div></section>
          <section class="settings-group operational-alert-section" aria-labelledby="beta-alerts-title"><div class="settings-row"><div><h3 id="beta-alerts-title">Alertas operacionais</h3><small>Erros e lat&ecirc;ncia alta disparam automaticamente em menos de um minuto.</small></div><strong id="beta-firing-alert-count" class="alert-count">0 ativos</strong></div><div id="beta-operational-alerts" class="operational-alert-list"></div></section>
          <section class="settings-group"><h3>Convites pendentes</h3><div id="beta-invitation-list" class="admin-invitation-list"></div></section>
          <section class="settings-group" aria-labelledby="beta-feature-flags-title"><div class="settings-row"><div><h3 id="beta-feature-flags-title">Feature flags</h3><small>Rollout determinístico e kill switch com propagação automática.</small></div><small id="beta-feature-flags-refreshed">—</small></div><div id="beta-feature-flag-list" class="feature-flag-list"></div></section>
          <p id="beta-admin-status" class="note status-message" role="status" aria-live="polite"></p>
        </div>
      </section>

      <section class="beta-page" id="beta-settings" data-page="settings" aria-labelledby="beta-settings-title" hidden>
        <div class="page-heading"><div><p class="eyebrow">PREFERÊNCIAS</p><h2 id="beta-settings-title">Configurações</h2></div></div>
        <section class="settings-group"><div class="settings-row"><h3>Conta</h3><button id="beta-logout" class="text-button" type="button">Sair</button></div><form id="beta-account-form" class="form compact-form"><label><span>Nome de exibição</span><input id="beta-display-name" type="text" maxlength="40" autocomplete="name" placeholder="Como prefere ser chamado" required></label><label><span>E-mail</span><input id="beta-account-email" type="email" readonly aria-readonly="true"></label><p id="beta-account-status" class="note status-message full-row" role="status" aria-live="polite">Conta conectada</p><button class="secondary-button" type="submit">Salvar alterações</button></form></section>
        <section class="settings-group"><div class="settings-row"><div><h3>Autenticação em duas etapas</h3><small id="beta-mfa-status">Verificando proteção da conta…</small></div><button id="beta-mfa-action" class="secondary-button compact-action" type="button">Ativar</button></div><p class="note">Obrigatória para liberar o controle administrativo de usuários.</p></section>
        <section class="settings-group"><h3>Preferências</h3><form id="beta-preferences-form" class="form compact-form"><label><span>Idioma</span><select id="beta-language"><option value="pt-BR">Português (Brasil)</option><option value="auto">Automático do dispositivo</option></select></label><label><span>Tema</span><select id="beta-theme"><option value="system">Usar padrão do dispositivo</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label><label><span>Formato de data</span><select id="beta-date-format"><option value="short">20/07/2026, 18:52</option><option value="long">20 de julho de 2026, 18:52</option></select></label><button class="secondary-button" type="submit">Salvar preferências</button></form></section>
        <section class="settings-group"><h3>Ciclo de Contagem</h3><form id="beta-cycle-form" class="form two-column-form"><label><span>Dia de início</span><input id="beta-cycle-start" type="number" min="1" max="31" inputmode="numeric" required></label><label><span>Dia de encerramento</span><input id="beta-cycle-end" type="number" min="1" max="31" inputmode="numeric" required></label><button class="secondary-button full-row" type="submit">Salvar ciclo</button></form><p class="note">Datas são ajustadas automaticamente ao último dia de cada mês.</p></section>
        <section class="settings-group"><h3>Notificações</h3><label class="toggle-row"><span><strong>Lembrete diário</strong><small>“Faça o registro do seu consumo.”</small></span><input id="beta-reminder-enabled" type="checkbox"></label><label class="field-row"><span>Horário</span><input id="beta-reminder-time" type="time" value="19:00"></label><p class="note">Se já houver uma leitura no dia, nenhum lembrete será exibido.</p></section>
        <section class="settings-group"><h3>Ajuda e tutoriais</h3><p class="note">Aprenda a registrar corretamente a leitura e a identificar o ciclo na fatura.</p><div class="stack-actions"><button id="beta-onboarding-tutorial" class="secondary-button" type="button">Guia de boas-vindas</button><button id="beta-meter-tutorial" class="secondary-button" type="button">Como ler água e energia</button><button id="beta-bill-cycle-tutorial" class="secondary-button" type="button">Como identificar o ciclo da fatura</button></div></section>
        <section class="settings-group"><h3>Privacidade</h3><div class="stack-actions"><button id="beta-export-data" class="secondary-button" type="button">Exportar meus dados</button><button id="beta-lgpd" class="secondary-button" type="button">Privacidade e LGPD</button></div></section>
        <section class="settings-group"><div class="settings-row"><div><h3>Saúde do serviço</h3><small id="beta-health-status">Ainda não verificado</small></div><button id="beta-check-health" class="secondary-button compact-action" type="button">Verificar</button></div><p id="beta-health-details" class="note">Auth e banco serão testados sem enviar dados pessoais.</p></section>
        <details class="settings-group advanced-settings"><summary>Configurações Avançadas</summary><div id="beta-advanced-content" class="advanced-content"></div></details>
        <section class="settings-group danger-zone"><h3>Sistema</h3><p class="note">Restaura preferências e dados locais deste dispositivo. Leituras salvas na conta permanecem protegidas.</p><button id="beta-reset-app" class="danger-button" type="button">Restaurar Aplicativo</button></section>
      </section>
    </main>

    <button id="beta-reading-fab" class="beta-reading-fab" type="button" aria-label="Registrar Nova Leitura"><img src="./icon.svg" alt=""><span>Registrar Nova Leitura</span></button>
    <nav class="bottom-navigation" aria-label="Navegação principal">
      <button class="active" type="button" data-nav="home" aria-current="page"><span aria-hidden="true">⌂</span><small>Início</small></button>
      <button type="button" data-nav="readings"><span aria-hidden="true">≡</span><small>Leituras</small></button>
      <button type="button" data-nav="reports"><span aria-hidden="true">▥</span><small>Relatórios</small></button>
      <button id="beta-users-nav" type="button" data-nav="users" hidden><span aria-hidden="true">♙</span><small>Usuários</small></button>
      <button type="button" data-nav="settings"><span aria-hidden="true">⚙</span><small>Configurações</small></button>
    </nav>

    <dialog id="beta-reading-type-dialog" class="beta-dialog"><form method="dialog" class="dialog-card"><div class="section-heading"><div><p class="eyebrow">NOVA LEITURA</p><h2>O que deseja registrar?</h2></div><button class="icon-button" value="cancel" aria-label="Fechar">×</button></div><div class="reading-type-grid"><button class="utility-choice energy" type="button" data-reading-type="energy"><span aria-hidden="true">ϟ</span><strong>Energia</strong><small>Medidor em kWh</small></button><button class="utility-choice water" type="button" data-reading-type="water"><span aria-hidden="true">●</span><strong>Água</strong><small>Hidrômetro em m³</small></button></div></form></dialog>
    <dialog id="beta-edit-dialog" class="beta-dialog"><form id="beta-edit-form" class="dialog-card"><div class="section-heading"><div><p class="eyebrow">EDITAR LEITURA</p><h2 id="beta-edit-title">Leitura</h2></div><button id="beta-close-edit" class="icon-button" type="button" aria-label="Fechar">×</button></div><input id="beta-edit-original-date" type="hidden"><input id="beta-edit-type" type="hidden"><label><span>Leitura</span><input id="beta-edit-value" type="number" min="0" step="0.001" required></label><label><span>Data e hora</span><input id="beta-edit-date" type="datetime-local" required></label><p id="beta-edit-message" class="note status-message" role="status"></p><button class="primary-button" type="submit">Salvar alteração</button></form></dialog>
    <dialog id="beta-delete-dialog" class="beta-dialog"><form method="dialog" class="dialog-card"><h2>Excluir esta leitura?</h2><p>Somente o registro selecionado será removido.</p><div class="dialog-actions"><button class="secondary-button" value="cancel">Cancelar</button><button id="beta-confirm-delete" class="danger-button" value="confirm">Excluir leitura</button></div></form></dialog>

    <dialog id="beta-help-dialog" class="beta-dialog"><div class="dialog-card tutorial-dialog"><div class="section-heading"><div><p class="eyebrow">GUIA RÁPIDO</p><h2 id="beta-help-title">Tutorial</h2></div><button id="beta-close-help" class="icon-button" type="button" aria-label="Fechar">×</button></div><div id="beta-help-content"></div><button id="beta-help-done" class="primary-button" type="button">Entendi</button></div></dialog>
    <dialog id="beta-tariff-dialog" class="beta-dialog"><div class="dialog-card"><div class="section-heading"><div><p class="eyebrow">INFORMAÇÃO</p><h2 id="beta-tariff-dialog-title">Tarifa</h2></div><button id="beta-close-tariff" class="icon-button" type="button" aria-label="Fechar">×</button></div><p id="beta-tariff-dialog-text"></p><button id="beta-tariff-done" class="primary-button" type="button">Entendi</button></div></dialog>
    <dialog id="beta-reset-dialog" class="beta-dialog"><div class="dialog-card"><div id="beta-reset-step-one"><h2>Restaurar o aplicativo?</h2><p>Preferências e cópias locais deste dispositivo serão removidas. As leituras da sua conta não serão apagadas.</p><div class="dialog-actions"><button class="secondary-button" type="button" data-reset-cancel>Cancelar</button><button id="beta-reset-continue" class="danger-button" type="button">Continuar</button></div></div><div id="beta-reset-step-two" hidden><h2>Confirmação final</h2><label><span>Digite RESTAURAR para confirmar</span><input id="beta-reset-confirmation" autocomplete="off"></label><div class="dialog-actions"><button class="secondary-button" type="button" data-reset-cancel>Cancelar</button><button id="beta-reset-confirm" class="danger-button" type="button" disabled>Restaurar agora</button></div></div></div></dialog>
    <dialog id="beta-invite-dialog" class="beta-dialog"><form id="beta-invite-form" class="dialog-card"><div class="section-heading"><div><p class="eyebrow">NOVO ACESSO</p><h2>Convidar usuário</h2></div><button class="icon-button" type="button" data-close-admin-dialog aria-label="Fechar">×</button></div><label><span>E-mail</span><input id="beta-invite-email" type="email" autocomplete="email" required></label><label><span>Papel</span><select id="beta-invite-role"><option value="member">Membro</option><option value="viewer">Visualizador</option><option value="admin">Administrador</option></select></label><p class="note">O convite expira em 48 horas e fica restrito a esta organização.</p><button class="primary-button" type="submit">Registrar convite</button></form></dialog>
    <dialog id="beta-invite-created-dialog" class="beta-dialog"><div class="dialog-card"><div class="section-heading"><div><p class="eyebrow">CONVITE SEGURO</p><h2>Link criado</h2></div><button class="icon-button" type="button" data-close-invite-created aria-label="Fechar">×</button></div><p class="note">Envie este link apenas ao destinatário. O token aparece uma vez, expira em 48 horas e não é armazenado em texto aberto.</p><label><span>Link de uso único</span><input id="beta-created-invite-url" type="text" readonly aria-readonly="true"></label><div class="dialog-actions"><button id="beta-copy-invite-url" class="secondary-button" type="button">Copiar link</button><button class="primary-button" type="button" data-close-invite-created>Concluir</button></div><p id="beta-created-invite-status" class="note status-message" role="status" aria-live="polite"></p></div></dialog>
    <dialog id="beta-invitation-dialog" class="beta-dialog"><div class="dialog-card"><div class="section-heading"><div><p class="eyebrow">CONVITE</p><h2>Acesso a uma organização</h2></div></div><div id="beta-invitation-preview"><p>Você foi convidado para <strong id="beta-invitation-organization">—</strong>.</p><dl class="invitation-summary"><div><dt>Papel</dt><dd id="beta-invitation-role">—</dd></div><div><dt>Expiração</dt><dd id="beta-invitation-expiry">—</dd></div></dl><div class="dialog-actions"><button id="beta-decline-invitation" class="secondary-button" type="button">Recusar</button><button id="beta-accept-invitation" class="primary-button" type="button">Aceitar convite</button></div></div><p id="beta-invitation-message" class="note status-message" role="status" aria-live="polite"></p><button id="beta-close-invalid-invitation" class="secondary-button" type="button" hidden>Fechar</button></div></dialog>
    <dialog id="beta-member-dialog" class="beta-dialog"><form id="beta-member-form" class="dialog-card"><div class="section-heading"><div><p class="eyebrow">ACESSO</p><h2 id="beta-member-dialog-title">Editar usuário</h2></div><button class="icon-button" type="button" data-close-admin-dialog aria-label="Fechar">×</button></div><input id="beta-member-id" type="hidden"><label><span>Papel</span><select id="beta-member-role"><option value="member">Membro</option><option value="viewer">Visualizador</option><option value="admin">Administrador</option></select></label><label><span>Status</span><select id="beta-member-status"><option value="active">Ativo</option><option value="suspended">Suspenso</option><option value="removed">Removido</option></select></label><label><span>Justificativa</span><textarea id="beta-member-reason" minlength="5" maxlength="240" required></textarea></label><label id="beta-destructive-confirmation-row" hidden><span>Digite o e-mail para confirmar</span><input id="beta-member-confirmation" autocomplete="off"></label><button id="beta-save-member" class="primary-button" type="submit">Salvar acesso</button></form></dialog>
    <dialog id="beta-owner-transfer-dialog" class="beta-dialog"><form id="beta-owner-transfer-form" class="dialog-card"><div class="section-heading"><div><p class="eyebrow">PROPRIEDADE</p><h2>Transferir organização</h2></div><button class="icon-button" type="button" data-close-owner-transfer aria-label="Fechar">×</button></div><input id="beta-owner-successor-id" type="hidden"><p>A propriedade será transferida para <strong id="beta-owner-successor-email">—</strong>. O proprietário atual passará a administrador.</p><label><span>Justificativa</span><textarea id="beta-owner-transfer-reason" minlength="5" maxlength="240" required></textarea></label><label><span id="beta-owner-transfer-confirmation-label">Digite o nome da organização para confirmar</span><input id="beta-owner-transfer-confirmation" autocomplete="off" required></label><p class="note">A operação exige MFA AAL2 e ocorre em uma única transação.</p><div class="dialog-actions"><button class="secondary-button" type="button" data-close-owner-transfer>Cancelar</button><button id="beta-confirm-owner-transfer" class="danger-button" type="submit" disabled>Transferir propriedade</button></div></form></dialog>
  `;
}

function removeLegacyDestructiveControls() {
  document.querySelector("#clear-readings")?.remove();
  document.querySelector("#clear-water-readings")?.remove();
  document.querySelector("#clear-dialog")?.remove();
}

function bindNavigation(shell) {
  shell.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.nav)));
  shell.querySelector("#beta-theme-shortcut").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    api.setTheme(next);
    localStorage.setItem("volt-beta-v2-theme", next);
    shell.querySelector("#beta-theme").value = next;
  });
}

function showPage(pageName) {
  document.querySelectorAll(".beta-page").forEach((page) => {
    const active = page.dataset.page === pageName;
    page.hidden = !active;
    page.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-nav]").forEach((button) => {
    const active = button.dataset.nav === pageName;
    button.classList.toggle("active", active);
    active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
  });
  document.querySelector("#beta-reading-fab").hidden = ["reports", "settings", "users"].includes(pageName);
  renderBetaExperience();
  requestAnimationFrame(resetPageScroll);
}

function resetPageScroll() {
  document.querySelector("#beta-content")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function bindReadingFlow(shell, energyDialog, waterDialog) {
  const typeDialog = shell.querySelector("#beta-reading-type-dialog");
  shell.querySelectorAll("[data-new-reading], #beta-reading-fab").forEach((button) => button.addEventListener("click", () => typeDialog.showModal()));
  shell.querySelectorAll("[data-reading-type]").forEach((button) => button.addEventListener("click", () => {
    typeDialog.close();
    (button.dataset.readingType === "energy" ? energyDialog : waterDialog)?.showModal();
  }));
  shell.querySelector("#beta-close-edit").addEventListener("click", () => shell.querySelector("#beta-edit-dialog").close());
  shell.querySelector("#beta-edit-form").addEventListener("submit", handleEditSubmit);
  shell.querySelector("#beta-confirm-delete").addEventListener("click", handleDeleteConfirm);
}

function bindAccount(shell) {
  shell.querySelector("#beta-account-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const result = await api.updateDisplayName(shell.querySelector("#beta-display-name").value);
    button.disabled = false;
    setText("#beta-account-status", result.message);
  });
}

function bindInvitation(shell) {
  const dialog = shell.querySelector("#beta-invitation-dialog");
  const accept = shell.querySelector("#beta-accept-invitation");
  const decline = shell.querySelector("#beta-decline-invitation");
  accept.addEventListener("click", async () => {
    accept.disabled = true;
    decline.disabled = true;
    const result = await api.acceptInvitation();
    accept.disabled = false;
    decline.disabled = false;
    setText("#beta-invitation-message", result.message);
    if (result.ok) dialog.close();
  });
  decline.addEventListener("click", async () => {
    accept.disabled = true;
    decline.disabled = true;
    const result = await api.declineInvitation();
    setText("#beta-invitation-message", result.message);
    if (result.ok) dialog.close();
    accept.disabled = false;
    decline.disabled = false;
  });
  shell.querySelector("#beta-close-invalid-invitation").addEventListener("click", () => dialog.close());
  Promise.resolve().then(renderInvitation).catch(renderInvitation);
}

function renderInvitation() {
  const snapshot = api.getInvitationSnapshot();
  const dialog = document.querySelector("#beta-invitation-dialog");
  if (!dialog || !snapshot.present) return;
  document.querySelector("#beta-invitation-preview").hidden = !snapshot.available;
  document.querySelector("#beta-close-invalid-invitation").hidden = snapshot.available;
  setText("#beta-invitation-message", snapshot.message || "Confira o contexto antes de aceitar.");
  if (snapshot.available) {
    setText("#beta-invitation-organization", snapshot.organization?.name || "Organização");
    setText("#beta-invitation-role", roleLabel(snapshot.role));
    setText("#beta-invitation-expiry", new Date(snapshot.expiresAt).toLocaleString("pt-BR"));
  }
  if (!dialog.open) dialog.showModal();
}

function bindMfa(shell) {
  const action = shell.querySelector("#beta-mfa-action");
  action.addEventListener("click", async () => {
    action.disabled = true;
    const snapshot = api.getMfaSnapshot();
    const result = snapshot.enrolled ? await api.disableMfa() : await api.enableMfa();
    action.disabled = false;
    if (!result?.ok && result?.message) setText("#beta-mfa-status", result.message);
    renderBetaMfa();
  });
  Promise.resolve(api.refreshMfa()).then(renderBetaMfa).catch(renderBetaMfa);
}

function bindOperationalHealth(shell) {
  const button = shell.querySelector("#beta-check-health");
  button.addEventListener("click", async () => {
    button.disabled = true;
    await api.checkOperationalHealth();
    button.disabled = false;
    renderOperationalHealth();
  });
}

function renderOperationalHealth() {
  const health = api.getOperationalHealth();
  if (health.status === "unknown") return;
  setText("#beta-health-status", health.status === "healthy" ? "Operacional" : "Degradado");
  setText("#beta-health-details", `Autenticação: ${health.auth ? "OK" : "falha"} · Banco: ${health.database ? "OK" : "falha"} · ${health.durationMs} ms`);
}

function renderBetaMfa() {
  const snapshot = api.getMfaSnapshot();
  setText("#beta-mfa-status", !snapshot.available
    ? "MFA indisponível no provedor."
    : snapshot.enrolled
      ? `Ativo · sessão ${snapshot.currentLevel.toUpperCase()}`
      : "Ainda não configurado");
  const action = document.querySelector("#beta-mfa-action");
  if (action) action.textContent = snapshot.enrolled ? "Desativar" : "Ativar";
}

function bindPreferences(shell) {
  const saved = readPreference("preferences", { language: "pt-BR", theme: "system", dateFormat: "short" });
  shell.querySelector("#beta-language").value = saved.language;
  shell.querySelector("#beta-theme").value = saved.theme;
  shell.querySelector("#beta-date-format").value = saved.dateFormat;
  applyPreferredTheme(saved.theme);
  shell.querySelector("#beta-preferences-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const preferences = {
      language: shell.querySelector("#beta-language").value,
      theme: shell.querySelector("#beta-theme").value,
      dateFormat: shell.querySelector("#beta-date-format").value
    };
    savePreference("preferences", preferences);
    applyPreferredTheme(preferences.theme);
    renderBetaExperience();
  });

  const cycle = readPreference("cycle", { start: 1, end: 31 });
  shell.querySelector("#beta-cycle-start").value = cycle.start;
  shell.querySelector("#beta-cycle-end").value = cycle.end;
  shell.querySelector("#beta-cycle-form").addEventListener("submit", (event) => {
    event.preventDefault();
    savePreference("cycle", {
      start: Number(shell.querySelector("#beta-cycle-start").value),
      end: Number(shell.querySelector("#beta-cycle-end").value)
    });
    renderBetaExperience();
    showPage("home");
  });
}

function applyPreferredTheme(theme) {
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  api.setTheme(resolved);
}

function bindNotifications(shell) {
  const reminder = readPreference("reminder", { enabled: false, time: "19:00" });
  const enabled = shell.querySelector("#beta-reminder-enabled");
  const time = shell.querySelector("#beta-reminder-time");
  enabled.checked = reminder.enabled;
  time.value = reminder.time;
  enabled.addEventListener("change", async () => {
    if (enabled.checked && "Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") enabled.checked = false;
    }
    saveReminder(enabled.checked, time.value);
  });
  time.addEventListener("change", () => saveReminder(enabled.checked, time.value));
}

function saveReminder(enabled, time) {
  savePreference("reminder", { enabled, time });
  scheduleDailyReminder();
}

function scheduleDailyReminder() {
  clearTimeout(reminderTimer);
  const reminder = readPreference("reminder", { enabled: false, time: "19:00" });
  if (!reminder.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const [hour, minute] = reminder.time.split(":").map(Number);
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= new Date()) target.setDate(target.getDate() + 1);
  reminderTimer = setTimeout(() => {
    if (!hasReadingToday()) new Notification("Volt", { body: "Faça o registro do seu consumo.", icon: "./icon.svg" });
    scheduleDailyReminder();
  }, Math.min(target.getTime() - Date.now(), 2_147_000_000));
}

function hasReadingToday() {
  const snapshot = api.getSnapshot();
  const today = new Date().toDateString();
  return [...snapshot.energy.readings, ...snapshot.water.readings].some((item) => new Date(item.date).toDateString() === today);
}

function bindPrivacy(shell) {
  shell.querySelector("#beta-export-data").addEventListener("click", () => api.exportData());
  shell.querySelector("#beta-lgpd").addEventListener("click", () => document.querySelector("#open-settings")?.click());
  shell.querySelector("#beta-logout").addEventListener("click", () => document.querySelector("#logout")?.click());
}

function bindHelp(shell) {
  const dialog = shell.querySelector("#beta-help-dialog");
  const tariffDialog = shell.querySelector("#beta-tariff-dialog");
  const openHelp = (title, html) => {
    setText("#beta-help-title", title);
    shell.querySelector("#beta-help-content").innerHTML = html;
    dialog.showModal();
  };
  shell.querySelector("#beta-onboarding-tutorial").addEventListener("click", () => {
    if (typeof window.showOnboarding === "function") window.showOnboarding();
    if (typeof window.resetOnboardingStatus === "function") window.resetOnboardingStatus();
  });
  shell.querySelector("#beta-meter-tutorial").addEventListener("click", () => openHelp("Como fazer a leitura", `
    <div class="tutorial-steps"><section><strong>Energia</strong><p>Leia somente os dígitos que representam kWh. Ignore códigos do aparelho e símbolos. Fotografe o visor de frente, sem reflexo e com todos os números visíveis.</p></section><section><strong>Água</strong><p>Use os algarismos inteiros do hidrômetro. Em modelos com dígitos vermelhos ou ponteiros decimais, confirme na fatura qual parte representa m³.</p></section><section><strong>Antes de salvar</strong><p>Compare o número reconhecido pelo OCR com o visor. A leitura atual normalmente não pode ser menor que a anterior sem troca ou reinício do medidor.</p></section></div>`));
  shell.querySelector("#beta-bill-cycle-tutorial").addEventListener("click", () => openHelp("Como identificar o ciclo", `
    <div class="tutorial-steps"><section><strong>1. Encontre a data da leitura anterior</strong><p>Na fatura, procure “leitura anterior”, “data anterior” ou “período de consumo”.</p></section><section><strong>2. Encontre a última medição</strong><p>Procure “leitura atual” e use esse valor como primeira leitura no Volt. Não use o consumo faturado no lugar do número acumulado do medidor.</p></section><section><strong>3. Configure o ciclo</strong><p>Use os dias da leitura anterior e atual para definir o início e o encerramento do ciclo em Configurações.</p></section></div>`));
  ["#beta-close-help", "#beta-help-done"].forEach((selector) => shell.querySelector(selector).addEventListener("click", () => dialog.close()));
  const explanations = {
    energy: ["Tarifa de energia", "Valor aplicado por kWh consumido. O Volt usa a tarifa cadastrada nas preferências para estimar a conta."],
    flag: ["Bandeira tarifária", "Adicional definido para cada período. Verde não adiciona valor; amarela e vermelha acrescentam custo por kWh."],
    lighting: ["Iluminação pública", "Contribuição municipal que pode ser fixa ou calculada por faixa. O valor exato depende do município e da fatura."],
    sewer: ["Taxa de esgoto", "Normalmente é calculada como percentual do consumo de água, mas a regra varia por concessionária e localidade."],
    taxes: ["Impostos", "Tributos como ICMS, PIS e COFINS podem compor a fatura. Percentuais e base de cálculo variam por local e período."]
  };
  shell.querySelectorAll("[data-tariff-info]").forEach((button) => button.addEventListener("click", () => {
    const [title, text] = explanations[button.dataset.tariffInfo];
    setText("#beta-tariff-dialog-title", title);
    setText("#beta-tariff-dialog-text", text);
    tariffDialog.showModal();
  }));
  ["#beta-close-tariff", "#beta-tariff-done"].forEach((selector) => shell.querySelector(selector).addEventListener("click", () => tariffDialog.close()));
}

function bindRestore(shell) {
  const dialog = shell.querySelector("#beta-reset-dialog");
  const first = shell.querySelector("#beta-reset-step-one");
  const second = shell.querySelector("#beta-reset-step-two");
  const confirmation = shell.querySelector("#beta-reset-confirmation");
  const confirmButton = shell.querySelector("#beta-reset-confirm");
  shell.querySelector("#beta-reset-app").addEventListener("click", () => {
    first.hidden = false;
    second.hidden = true;
    confirmation.value = "";
    confirmButton.disabled = true;
    dialog.showModal();
  });
  shell.querySelector("#beta-reset-continue").addEventListener("click", () => {
    first.hidden = true;
    second.hidden = false;
    confirmation.focus();
  });
  shell.querySelectorAll("[data-reset-cancel]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  confirmation.addEventListener("input", () => { confirmButton.disabled = confirmation.value !== "RESTAURAR"; });
  confirmButton.addEventListener("click", () => api.resetApplication());
}

function bindAdministration(shell) {
  const inviteDialog = shell.querySelector("#beta-invite-dialog");
  const createdDialog = shell.querySelector("#beta-invite-created-dialog");
  const memberDialog = shell.querySelector("#beta-member-dialog");
  const ownerTransferDialog = shell.querySelector("#beta-owner-transfer-dialog");
  shell.querySelectorAll("[data-close-admin-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  shell.querySelector("#beta-invite-user").addEventListener("click", () => inviteDialog.showModal());
  shell.querySelector("#beta-user-search").addEventListener("input", renderAdministration);
  shell.querySelector("#beta-refresh-operational").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    await api.refreshOperationalMetrics();
    event.currentTarget.disabled = false;
    renderOperationalMetrics();
  });
  shell.querySelector("#beta-export-prometheus").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    const result = await api.exportOperationalMetrics();
    event.currentTarget.disabled = false;
    setText("#beta-admin-status", result.message);
  });
  shell.querySelector("#beta-operational-alerts").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target.closest("form[data-alert-id]");
    if (!form) return;
    const button = event.submitter;
    button.disabled = true;
    const result = await api.acknowledgeOperationalAlert({ alertId: form.dataset.alertId, reason: form.elements.reason.value.trim() });
    button.disabled = false;
    setText("#beta-admin-status", result.message);
    if (result.ok) renderOperationalMetrics();
  });
  shell.querySelector("#beta-invite-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = await api.inviteMember({ email: shell.querySelector("#beta-invite-email").value.trim(), role: shell.querySelector("#beta-invite-role").value });
    setText("#beta-admin-status", result.message);
    if (result.ok) {
      event.target.reset();
      inviteDialog.close();
      shell.querySelector("#beta-created-invite-url").value = result.invitationUrl;
      setText("#beta-created-invite-status", "");
      createdDialog.showModal();
      renderAdministration();
    }
  });
  shell.querySelectorAll("[data-close-invite-created]").forEach((button) => button.addEventListener("click", () => {
    shell.querySelector("#beta-created-invite-url").value = "";
    createdDialog.close();
  }));
  shell.querySelector("#beta-copy-invite-url").addEventListener("click", async () => {
    const field = shell.querySelector("#beta-created-invite-url");
    try {
      await navigator.clipboard.writeText(field.value);
      setText("#beta-created-invite-status", "Link copiado.");
    } catch {
      field.select();
      setText("#beta-created-invite-status", "Selecione e copie o link manualmente.");
    }
  });
  shell.querySelector("#beta-member-status").addEventListener("change", syncDestructiveConfirmation);
  shell.querySelector("#beta-member-confirmation").addEventListener("input", syncDestructiveConfirmation);
  shell.querySelector("#beta-member-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = shell.querySelector("#beta-member-status").value;
    const expected = event.target.dataset.email || "";
    if (status !== "active" && shell.querySelector("#beta-member-confirmation").value !== expected) {
      setText("#beta-admin-status", "Digite o e-mail do usuário para confirmar a ação.");
      return;
    }
    const result = await api.updateMember({ membershipId: shell.querySelector("#beta-member-id").value, role: shell.querySelector("#beta-member-role").value, status, reason: shell.querySelector("#beta-member-reason").value.trim() });
    setText("#beta-admin-status", result.message);
    if (result.ok) { memberDialog.close(); renderAdministration(); }
  });
  shell.querySelectorAll("[data-close-owner-transfer]").forEach((button) => button.addEventListener("click", () => ownerTransferDialog.close()));
  shell.querySelector("#beta-owner-transfer-confirmation").addEventListener("input", syncOwnerTransferConfirmation);
  shell.querySelector("#beta-owner-transfer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const snapshot = api.getAdminSnapshot();
    if (shell.querySelector("#beta-owner-transfer-confirmation").value !== snapshot.organization?.name) return;
    const button = shell.querySelector("#beta-confirm-owner-transfer");
    button.disabled = true;
    const result = await api.transferOwner({
      membershipId: shell.querySelector("#beta-owner-successor-id").value,
      reason: shell.querySelector("#beta-owner-transfer-reason").value.trim()
    });
    setText("#beta-admin-status", result.message);
    if (result.ok) ownerTransferDialog.close();
    button.disabled = false;
    renderAdministration();
  });
  Promise.all([api.refreshAdmin(), api.refreshFeatureFlags(), api.refreshOperationalMetrics()]).then(renderAdministration).catch(renderAdministration);
}

function syncDestructiveConfirmation() {
  const destructive = document.querySelector("#beta-member-status").value !== "active";
  const row = document.querySelector("#beta-destructive-confirmation-row");
  row.hidden = !destructive;
  document.querySelector("#beta-member-confirmation").required = destructive;
}

function renderAdministration() {
  const snapshot = api.getAdminSnapshot();
  const nav = document.querySelector("#beta-users-nav");
  nav.hidden = !snapshot.authorized;
  document.querySelector("#beta-admin-unavailable").hidden = snapshot.available;
  document.querySelector("#beta-admin-workspace").hidden = !snapshot.available || !snapshot.authorized;
  if (!snapshot.available) { setText("#beta-admin-message", snapshot.message || "Administração indisponível."); return; }
  if (!snapshot.authorized) return;
  setText("#beta-organization-name", snapshot.organization?.name || "Organização");
  setText("#beta-current-role", roleLabel(snapshot.membership?.role));
  setText("#beta-member-count", String(snapshot.members.filter((member) => member.status === "active").length));
  const query = document.querySelector("#beta-user-search").value.trim().toLocaleLowerCase("pt-BR");
  const members = snapshot.members.filter((member) => `${member.display_name} ${member.email}`.toLocaleLowerCase("pt-BR").includes(query));
  const memberList = document.querySelector("#beta-member-list");
  memberList.replaceChildren(...members.map(createMemberRow));
  if (!members.length) memberList.append(createEmptyMessage("Nenhum usuário encontrado."));
  const invitationList = document.querySelector("#beta-invitation-list");
  invitationList.replaceChildren(...snapshot.invitations.map(createInvitationRow));
  if (!snapshot.invitations.length) invitationList.append(createEmptyMessage("Nenhum convite pendente."));
  renderFeatureFlags();
  renderOperationalMetrics();
}

function renderOperationalMetrics() {
  const snapshot = api.getOperationalSnapshot();
  const unavailable = document.querySelector("#beta-operational-unavailable");
  const metrics = document.querySelector("#beta-operational-metrics");
  const components = document.querySelector("#beta-operational-components");
  const traces = document.querySelector("#beta-trace-list");
  const alerts = document.querySelector("#beta-operational-alerts");
  if (!unavailable || !metrics || !components || !traces || !alerts) return;
  unavailable.hidden = snapshot.available;
  metrics.hidden = !snapshot.available;
  components.hidden = !snapshot.available;
  traces.closest("details").hidden = !snapshot.available;
  alerts.closest("section").hidden = !snapshot.available;
  if (!snapshot.available) {
    unavailable.textContent = snapshot.message || "Métricas operacionais indisponíveis.";
    setText("#beta-operational-refreshed", "—");
    return;
  }
  setText("#beta-metric-events", String(snapshot.events));
  setText("#beta-metric-errors", String(snapshot.errors));
  setText("#beta-metric-error-rate", `${snapshot.errorRate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
  setText("#beta-metric-latency", `${snapshot.latencyP95Ms} ms`);
  const firingAlerts = snapshot.alerts.filter((alert) => alert.status === "firing");
  setText("#beta-firing-alert-count", `${firingAlerts.length} ${firingAlerts.length === 1 ? "ativo" : "ativos"}`);
  alerts.replaceChildren(...snapshot.alerts.map(createOperationalAlertRow));
  if (!snapshot.alerts.length) alerts.append(createEmptyMessage("Nenhum alerta operacional no per\u00edodo."));
  components.replaceChildren(...snapshot.components.map((item) => {
    const row = document.createElement("div");
    const name = document.createElement("span"); name.textContent = item.component;
    const value = document.createElement("strong"); value.textContent = `${item.events} eventos · ${item.errors} erros`;
    row.append(name, value);
    return row;
  }));
  if (!snapshot.components.length) components.append(createEmptyMessage("Nenhum evento no período."));
  traces.replaceChildren(...snapshot.recentSpans.map((span) => {
    const row = document.createElement("article");
    const operation = document.createElement("strong"); operation.textContent = `${span.component} · ${span.operation}`;
    const identifiers = document.createElement("code"); identifiers.textContent = `trace ${span.trace_id} · span ${span.span_id}`;
    const meta = document.createElement("small"); meta.textContent = `${span.duration_ms ?? 0} ms · ${new Date(span.created_at).toLocaleString("pt-BR")}`;
    row.append(operation, identifiers, meta);
    return row;
  }));
  if (!snapshot.recentSpans.length) traces.append(createEmptyMessage("Nenhum span instrumentado no período."));
  setText("#beta-operational-refreshed", snapshot.generatedAt ? `Atualizado ${new Date(snapshot.generatedAt).toLocaleString("pt-BR")}` : "Atualizado");
}

function createOperationalAlertRow(alert) {
  const row = document.createElement(alert.status === "firing" ? "form" : "article");
  row.className = `operational-alert-row ${alert.severity} ${alert.status}`;
  if (alert.status === "firing") row.dataset.alertId = String(alert.id);
  const heading = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${alert.severity === "critical" ? "Cr\u00edtico" : "Aviso"} \u00b7 ${alert.component}`;
  const rule = document.createElement("small");
  rule.textContent = `${operationalRuleLabel(alert.rule_key)} \u00b7 ${new Date(alert.fired_at).toLocaleString("pt-BR")}`;
  heading.append(title, rule);
  row.append(heading);
  if (alert.status === "firing") {
    const reason = document.createElement("input");
    reason.name = "reason";
    reason.required = true;
    reason.minLength = 10;
    reason.maxLength = 500;
    reason.placeholder = "A\u00e7\u00e3o tomada (m\u00ednimo 10 caracteres)";
    reason.setAttribute("aria-label", `A\u00e7\u00e3o tomada para alerta ${alert.id}`);
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "secondary-button compact-action";
    button.textContent = "Reconhecer";
    row.append(reason, button);
  } else {
    const state = document.createElement("span");
    state.className = "alert-acknowledged";
    state.textContent = `Reconhecido ${new Date(alert.acknowledged_at).toLocaleString("pt-BR")}`;
    row.append(state);
  }
  return row;
}

function operationalRuleLabel(rule) {
  return ({ "runtime-error": "Erro de execu\u00e7\u00e3o", "operation-failed": "Opera\u00e7\u00e3o falhou", "high-latency": "Lat\u00eancia acima de 2 s" })[rule] || "Regra operacional";
}

function renderFeatureFlags() {
  const snapshot = api.getFeatureFlagsSnapshot();
  const list = document.querySelector("#beta-feature-flag-list");
  if (!list) return;
  if (!snapshot.available) {
    list.replaceChildren(createEmptyMessage(snapshot.message || "Feature flags indisponíveis até a atualização do banco."));
    setText("#beta-feature-flags-refreshed", "Indisponível");
    return;
  }
  setText("#beta-feature-flags-refreshed", snapshot.refreshedAt ? `Atualizado ${new Date(snapshot.refreshedAt).toLocaleTimeString("pt-BR")}` : "Atualizado");
  list.replaceChildren(...snapshot.flags.map(createFeatureFlagRow));
}

function createFeatureFlagRow(flag) {
  const form = document.createElement("form");
  form.className = "feature-flag-row";
  form.dataset.key = flag.key;
  const heading = document.createElement("div");
  const key = document.createElement("strong"); key.textContent = flag.key;
  const description = document.createElement("small"); description.textContent = flag.description;
  heading.append(key, description);
  const enabledLabel = document.createElement("label"); enabledLabel.className = "compact-toggle";
  const enabledText = document.createElement("span"); enabledText.textContent = "Ativa";
  const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.name = "enabled"; enabled.checked = flag.enabled;
  enabledLabel.append(enabledText, enabled);
  const rolloutLabel = document.createElement("label"); rolloutLabel.className = "flag-rollout";
  const rolloutText = document.createElement("span"); rolloutText.textContent = "Rollout %";
  const rollout = document.createElement("input"); rollout.type = "number"; rollout.name = "rollout"; rollout.min = "0"; rollout.max = "100"; rollout.value = String(flag.rollout_percentage); rollout.required = true;
  rolloutLabel.append(rolloutText, rollout);
  const killLabel = document.createElement("label"); killLabel.className = "compact-toggle danger-text";
  const killText = document.createElement("span"); killText.textContent = "Kill switch";
  const kill = document.createElement("input"); kill.type = "checkbox"; kill.name = "killSwitch"; kill.checked = flag.kill_switch;
  killLabel.append(killText, kill);
  const reason = document.createElement("input"); reason.name = "reason"; reason.placeholder = "Justificativa da alteração"; reason.minLength = 5; reason.maxLength = 240; reason.required = true;
  const save = document.createElement("button"); save.type = "submit"; save.className = "secondary-button compact-action"; save.textContent = "Salvar flag";
  form.append(heading, enabledLabel, rolloutLabel, killLabel, reason, save);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    const result = await api.updateFeatureFlag({ key: flag.key, enabled: enabled.checked, rolloutPercentage: Number(rollout.value), killSwitch: kill.checked, reason: reason.value.trim() });
    setText("#beta-admin-status", result.message);
    save.disabled = false;
    if (result.ok) renderFeatureFlags();
  });
  return form;
}

function createMemberRow(member) {
  const row = document.createElement("article");
  row.className = "admin-member-row";
  const identity = document.createElement("div");
  const name = document.createElement("strong"); name.textContent = member.display_name || member.email;
  const email = document.createElement("small"); email.textContent = member.email;
  identity.append(name, email);
  const meta = document.createElement("div"); meta.className = "admin-member-meta";
  const role = document.createElement("span"); role.textContent = roleLabel(member.role);
  const status = document.createElement("span"); status.className = `status-chip ${member.status}`; status.textContent = statusLabel(member.status);
  meta.append(role, status);
  const actions = document.createElement("div"); actions.className = "admin-member-actions";
  const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-button"; edit.textContent = "Gerenciar";
  edit.addEventListener("click", () => openMemberDialog(member));
  actions.append(edit);
  const snapshot = api.getAdminSnapshot();
  if (member.status === "active" && member.role !== "owner" && ["owner", "admin"].includes(snapshot.membership?.role)) {
    const transfer = document.createElement("button"); transfer.type = "button"; transfer.className = "text-button danger-text"; transfer.textContent = "Transferir propriedade";
    transfer.addEventListener("click", () => openOwnerTransferDialog(member));
    actions.append(transfer);
  }
  row.append(identity, meta, actions);
  return row;
}

function openOwnerTransferDialog(member) {
  const snapshot = api.getAdminSnapshot();
  document.querySelector("#beta-owner-successor-id").value = member.id;
  setText("#beta-owner-successor-email", member.email);
  document.querySelector("#beta-owner-transfer-reason").value = "";
  document.querySelector("#beta-owner-transfer-confirmation").value = "";
  setText("#beta-owner-transfer-confirmation-label", `Digite ${snapshot.organization?.name || "o nome da organização"} para confirmar`);
  document.querySelector("#beta-confirm-owner-transfer").disabled = true;
  document.querySelector("#beta-owner-transfer-dialog").showModal();
}

function syncOwnerTransferConfirmation() {
  const snapshot = api.getAdminSnapshot();
  document.querySelector("#beta-confirm-owner-transfer").disabled = document.querySelector("#beta-owner-transfer-confirmation").value !== snapshot.organization?.name;
}

function createInvitationRow(invitation) {
  const row = document.createElement("article"); row.className = "admin-invitation-row";
  const identity = document.createElement("div");
  const email = document.createElement("strong"); email.textContent = invitation.email;
  const expiry = document.createElement("small"); expiry.textContent = `Expira em ${new Date(invitation.expires_at).toLocaleString("pt-BR")}`;
  identity.append(email, expiry);
  const role = document.createElement("span"); role.textContent = roleLabel(invitation.role);
  row.append(identity, role);
  return row;
}

function openMemberDialog(member) {
  const form = document.querySelector("#beta-member-form");
  form.dataset.email = member.email;
  document.querySelector("#beta-member-id").value = member.id;
  document.querySelector("#beta-member-role").value = member.role;
  document.querySelector("#beta-member-status").value = member.status;
  document.querySelector("#beta-member-reason").value = "";
  document.querySelector("#beta-member-confirmation").value = "";
  setText("#beta-member-dialog-title", member.display_name || member.email);
  syncDestructiveConfirmation();
  document.querySelector("#beta-member-dialog").showModal();
}

function createEmptyMessage(text) { const message = document.createElement("p"); message.className = "empty"; message.textContent = text; return message; }
function roleLabel(role) { return ({ owner: "Proprietário", admin: "Administrador", member: "Membro", viewer: "Visualizador" })[role] || role; }
function statusLabel(status) { return ({ active: "Ativo", suspended: "Suspenso", removed: "Removido" })[status] || status; }

function refreshBetaData() {
  Promise.resolve(api.refreshData()).catch(() => undefined);
}

function renderBetaExperience() {
  const snapshot = api.getSnapshot();
  const activePage = document.querySelector(".beta-page.active")?.dataset.page || "home";
  const legacyDisplayName = document.querySelector("#user-name")?.textContent?.trim() || "";
  const displayName = snapshot.account.displayName?.trim() || legacyDisplayName;

  setText("#beta-greeting", displayName ? `Olá, ${displayName}!` : "Olá!");
  const nameInput = document.querySelector("#beta-display-name");
  if (nameInput && document.activeElement !== nameInput) nameInput.value = displayName || "";
  const emailInput = document.querySelector("#beta-account-email");
  if (emailInput) emailInput.value = snapshot.account.email || "";

  renderInvitation();
  renderAdministrationNavigation();

  if (activePage === "readings") {
    renderReadingHistory(snapshot);
    return;
  }
  if (activePage === "users") {
    renderAdministration();
    return;
  }
  if (activePage === "settings") {
    renderBetaMfa();
    renderOperationalHealth();
    return;
  }
  if (activePage !== "home") return;

  const canonicalContext = window.VOLT_CYCLE_CONTEXT;
  const canonicalValues = window.VOLT_CYCLE_VALUES;
  if (canonicalContext && canonicalValues) {
    renderCanonicalHome(snapshot, canonicalContext, canonicalValues);
    return;
  }

  const cycle = getCycleRanges();
  const energyCurrent = cycleConsumption(snapshot.energy.readings, cycle.current);
  const energyPrevious = cycleConsumption(snapshot.energy.readings, cycle.previous);
  const waterCurrent = cycleConsumption(snapshot.water.readings, cycle.current);
  const waterPrevious = cycleConsumption(snapshot.water.readings, cycle.previous);
  setText("#beta-cycle-label", `${formatShortDate(cycle.current.start)} – ${formatShortDate(cycle.current.end)}`);
  setText("#beta-energy-consumption", `${formatNumber(energyCurrent.consumption)} kWh`);
  setText("#beta-water-consumption", `${formatNumber(waterCurrent.consumption, 3)} m³`);
  setText("#beta-energy-cost", currency(api.estimateEnergy(energyCurrent.consumption).totalCost));
  setText("#beta-water-cost", currency(api.estimateWater(waterCurrent.consumption).totalCost));
  renderComparison("#beta-energy-comparison", energyCurrent, energyPrevious);
  renderComparison("#beta-water-comparison", waterCurrent, waterPrevious);
  renderFinancialSummary(snapshot, cycle, energyCurrent, energyPrevious, waterCurrent, waterPrevious);
}

function renderAdministrationNavigation() {
  const nav = document.querySelector("#beta-users-nav");
  if (!nav) return;
  nav.hidden = !api.getAdminSnapshot().authorized;
}

function renderCanonicalHome(snapshot, context, values) {
  const energyCurrent = cycleEvidence(snapshot.energy.readings, context.energy?.current);
  const energyPrevious = cycleEvidence(snapshot.energy.readings, context.energy?.previous);
  const waterCurrent = cycleEvidence(snapshot.water.readings, context.water?.current);
  const waterPrevious = cycleEvidence(snapshot.water.readings, context.water?.previous);
  energyCurrent.consumption = Number(values.energy?.consumption || 0);
  waterCurrent.consumption = Number(values.water?.consumption || 0);

  renderCanonicalCycleHeader(context);
  setText("#beta-energy-consumption", `${formatNumber(energyCurrent.consumption)} kWh`);
  setText("#beta-water-consumption", `${formatNumber(waterCurrent.consumption, 3)} m³`);

  if (window.VOLT_REGION_CONTEXT?.country === "UY") return;

  setText("#beta-energy-cost", currency(values.energy?.estimate?.totalCost || 0));
  setText("#beta-water-cost", currency(values.water?.estimate?.totalCost || 0));
  renderComparison("#beta-energy-comparison", energyCurrent, energyPrevious);
  renderComparison("#beta-water-comparison", waterCurrent, waterPrevious);
  renderCanonicalFinancialSummary(snapshot, context, values, energyCurrent, energyPrevious, waterCurrent, waterPrevious);
}

function renderCanonicalCycleHeader(context) {
  setText("#beta-home-title", "Ciclos atuais");
  const label = document.querySelector("#beta-cycle-label");
  if (!label) return;
  label.classList.add("cycle-lines");
  label.replaceChildren(
    canonicalCycleLine("water", "●", "Água", context.water),
    canonicalCycleLine("energy", "ϟ", "Energia", context.energy)
  );
}

function canonicalCycleLine(type, icon, name, context) {
  const row = document.createElement("span");
  row.className = `cycle-line ${type}`;
  const symbol = document.createElement("b");
  symbol.className = "cycle-line-icon";
  symbol.textContent = icon;
  symbol.setAttribute("aria-hidden", "true");
  const copy = document.createElement("span");
  const utility = document.createElement("strong");
  utility.textContent = name;
  const range = document.createElement("small");
  range.textContent = context?.label || "Não configurado";
  copy.append(utility, range);
  row.append(symbol, copy);
  return row;
}

function cycleEvidence(items, range) {
  if (!range) return { consumption: 0, count: 0 };
  const sorted = [...items].sort((left, right) => new Date(left.date) - new Date(right.date));
  const base = sorted.filter((item) => new Date(item.date) <= range.start).at(-1);
  const latest = sorted.filter((item) => new Date(item.date) <= range.end).at(-1);
  if (base && latest && new Date(latest.date) > new Date(base.date)) {
    return { consumption: Math.max(0, Number(latest.value) - Number(base.value)), count: 2 };
  }
  const selected = sorted.filter((item) => {
    const date = new Date(item.date);
    return date >= range.start && date <= range.end;
  });
  return {
    consumption: selected.length > 1 ? Math.max(0, Number(selected.at(-1).value) - Number(selected[0].value)) : 0,
    count: selected.length
  };
}

function renderCanonicalFinancialSummary(snapshot, context, values, energyCurrent, energyPrevious, waterCurrent, waterPrevious) {
  const energyCost = Number(values.energy?.estimate?.totalCost || 0);
  const waterCost = Number(values.water?.estimate?.totalCost || 0);
  const totalCost = energyCost + waterCost;
  const previousEnergyCost = context.energy ? api.estimateEnergy(energyPrevious.consumption).totalCost : 0;
  const previousWaterCost = context.water ? api.estimateWater(waterPrevious.consumption).totalCost : 0;
  const previousTotal = previousEnergyCost + previousWaterCost;
  const container = document.querySelector("#beta-summary-values");
  setText("#beta-financial-total", currency(totalCost));
  renderStatGrid(container, [["Energia", currency(energyCost)], ["Água", currency(waterCost)], ["Total geral", currency(totalCost)]]);

  const comparison = document.querySelector("#beta-financial-comparison");
  comparison.classList.remove("increase", "decrease", "steady");
  const hasCurrentEvidence = energyCurrent.count >= 2 || waterCurrent.count >= 2;
  const hasPreviousEvidence = energyPrevious.count >= 2 || waterPrevious.count >= 2;
  if (!hasCurrentEvidence || !hasPreviousEvidence || previousTotal <= 0) {
    comparison.textContent = "Aguardando leituras para comparar os ciclos.";
  } else {
    const difference = ((totalCost - previousTotal) / previousTotal) * 100;
    const increased = difference > 0.1;
    const decreased = difference < -0.1;
    comparison.textContent = increased || decreased
      ? `${increased ? "▲ +" : "▼ -"}${Math.abs(difference).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em relação ao ciclo anterior.`
      : "• Mesmo valor estimado do ciclo anterior.";
    comparison.classList.add(increased ? "increase" : decreased ? "decrease" : "steady");
  }

  const energyForecast = snapshot.energy.forecast;
  const waterForecast = snapshot.water.forecast;
  const energyDays = context.energy?.current ? Math.max(1, Math.ceil((context.energy.current.end - context.energy.current.start) / 86_400_000)) : 0;
  const waterDays = context.water?.current ? Math.max(1, Math.ceil((context.water.current.end - context.water.current.start) / 86_400_000)) : 0;
  const hasEnergyForecast = Boolean(context.energy && energyForecast.valid && energyForecast.usage > 0);
  const hasWaterForecast = Boolean(context.water && waterForecast.valid && waterForecast.usage > 0);
  if (!hasEnergyForecast && !hasWaterForecast) {
    setText("#beta-cycle-forecast", "Aguardando leituras para prever o encerramento.");
    return;
  }
  const forecastEnergyCost = hasEnergyForecast ? api.estimateEnergy(energyForecast.usage * energyDays / 30).totalCost : 0;
  const forecastWaterCost = hasWaterForecast ? api.estimateWater(waterForecast.usage * waterDays / 30).totalCost : 0;
  const confidence = weakestConfidence(hasEnergyForecast ? energyForecast.confidence : "alta", hasWaterForecast ? waterForecast.confidence : "alta");
  setText("#beta-cycle-forecast", `Previsão de encerramento: ${currency(forecastEnergyCost + forecastWaterCost)} · confiança ${confidence}.`);
}

function renderFinancialSummary(snapshot, cycle, energyCurrent, energyPrevious, waterCurrent, waterPrevious) {
  const energyCost = api.estimateEnergy(energyCurrent.consumption).totalCost;
  const waterCost = api.estimateWater(waterCurrent.consumption).totalCost;
  const totalCost = energyCost + waterCost;
  const previousEnergyCost = api.estimateEnergy(energyPrevious.consumption).totalCost;
  const previousWaterCost = api.estimateWater(waterPrevious.consumption).totalCost;
  const previousTotal = previousEnergyCost + previousWaterCost;
  const container = document.querySelector("#beta-summary-values");
  setText("#beta-financial-total", currency(totalCost));
  renderStatGrid(container, [
    ["Energia", currency(energyCost)],
    ["Água", currency(waterCost)],
    ["Total geral", currency(totalCost)]
  ]);

  const comparison = document.querySelector("#beta-financial-comparison");
  comparison.classList.remove("increase", "decrease", "steady");
  if (energyCurrent.count < 2 || energyPrevious.count < 2) {
    comparison.textContent = "Aguardando leituras para comparar os ciclos.";
  } else {
    const difference = previousTotal > 0 ? ((totalCost - previousTotal) / previousTotal) * 100 : 0;
    const increased = difference > 0.1;
    const decreased = difference < -0.1;
    comparison.textContent = increased || decreased
      ? `${increased ? "▲ +" : "▼ -"}${Math.abs(difference).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em relação ao ciclo anterior.`
      : "• Mesmo valor estimado do ciclo anterior.";
    comparison.classList.add(increased ? "increase" : decreased ? "decrease" : "steady");
  }

  const cycleDays = Math.max(1, Math.ceil((cycle.current.end - cycle.current.start) / 86_400_000));
  const energyForecast = snapshot.energy.forecast;
  const waterForecast = snapshot.water.forecast;
  const forecastAvailable = (energyForecast.valid && energyForecast.usage > 0) || (waterForecast.valid && waterForecast.usage > 0);
  if (!forecastAvailable) {
    setText("#beta-cycle-forecast", "Aguardando leituras para prever o encerramento.");
    return;
  }
  const forecastEnergyCost = api.estimateEnergy(energyForecast.usage * cycleDays / 30).totalCost;
  const forecastWaterCost = api.estimateWater(waterForecast.usage * cycleDays / 30).totalCost;
  const confidence = weakestConfidence(energyForecast.confidence, waterForecast.confidence);
  setText("#beta-cycle-forecast", `Previsão de encerramento: ${currency(forecastEnergyCost + forecastWaterCost)} · confiança ${confidence}.`);
}

function renderReadingHistory(snapshot) {
  const all = [
    ...snapshot.energy.readings.map((item) => ({ ...item, type: "energy", unit: "kWh", label: "Energia" })),
    ...snapshot.water.readings.map((item) => ({ ...item, type: "water", unit: "m³", label: "Água" }))
  ].sort((left, right) => new Date(right.date) - new Date(left.date));
  const list = document.querySelector("#beta-reading-list");
  list.replaceChildren(...all.map(buildBetaReadingItem));
  document.querySelector("#beta-reading-empty").hidden = all.length > 0;
}

function buildBetaReadingItem(reading) {
  const item = document.createElement("li");
  item.className = "beta-reading-item";
  const icon = document.createElement("span");
  icon.className = `reading-icon ${reading.type}`;
  icon.textContent = reading.type === "energy" ? "ϟ" : "●";
  const info = document.createElement("div");
  info.className = "reading-info";
  const strong = document.createElement("strong");
  strong.textContent = `${formatNumber(reading.value, reading.type === "water" ? 3 : 0)} ${reading.unit}`;
  const meta = document.createElement("small");
  meta.textContent = `${reading.label} · ${formatReadingDate(reading.date)}`;
  info.append(strong, meta);
  const menu = document.createElement("details");
  menu.className = "reading-menu";
  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", `Ações da leitura de ${reading.label}`);
  summary.textContent = "⋮";
  const actions = document.createElement("div");
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "Editar";
  edit.addEventListener("click", () => openEditDialog(reading));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-text";
  remove.textContent = "Excluir";
  remove.addEventListener("click", () => openDeleteDialog(reading));
  actions.append(edit, remove);
  menu.append(summary, actions);
  item.append(icon, info, menu);
  return item;
}

function openEditDialog(reading) {
  const dialog = document.querySelector("#beta-edit-dialog");
  setText("#beta-edit-title", `Leitura de ${reading.label}`);
  document.querySelector("#beta-edit-original-date").value = reading.date;
  document.querySelector("#beta-edit-type").value = reading.type;
  document.querySelector("#beta-edit-value").value = reading.value;
  document.querySelector("#beta-edit-date").value = toLocalInputValue(reading.date);
  setText("#beta-edit-message", "");
  dialog.showModal();
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const result = await api.updateReading({
    type: document.querySelector("#beta-edit-type").value,
    originalDate: document.querySelector("#beta-edit-original-date").value,
    value: document.querySelector("#beta-edit-value").value,
    date: document.querySelector("#beta-edit-date").value
  });
  setText("#beta-edit-message", result.message);
  if (result.ok) document.querySelector("#beta-edit-dialog").close();
}

let pendingDeletion;
function openDeleteDialog(reading) {
  pendingDeletion = reading;
  document.querySelector("#beta-delete-dialog").showModal();
}

async function handleDeleteConfirm() {
  if (!pendingDeletion) return;
  const result = await api.deleteReading({ type: pendingDeletion.type, date: pendingDeletion.date });
  setText("#beta-reading-status", result.message);
  pendingDeletion = null;
}

function renderStatGrid(container, items) {
  container.replaceChildren(...items.map(([label, value]) => {
    const item = document.createElement("div");
    const caption = document.createElement("small");
    caption.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    item.append(caption, strong);
    return item;
  }));
}

function getCycleRanges() {
  const preference = readPreference("cycle", { start: 1, end: 31 });
  const now = new Date();
  const start = occurrenceOnOrBefore(now, preference.start);
  const end = occurrenceAfter(start, preference.end);
  if (now > end) {
    const nextStart = occurrenceAfter(start, preference.start);
    return { current: { start: nextStart, end: occurrenceAfter(nextStart, preference.end) }, previous: { start, end } };
  }
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = occurrenceOnOrBefore(previousEnd, preference.start);
  return { current: { start, end }, previous: { start: previousStart, end: previousEnd } };
}

function occurrenceOnOrBefore(reference, day) {
  const candidate = dateWithClampedDay(reference.getFullYear(), reference.getMonth(), day);
  if (candidate <= reference) return candidate;
  return dateWithClampedDay(reference.getFullYear(), reference.getMonth() - 1, day);
}

function occurrenceAfter(reference, day) {
  let candidate = dateWithClampedDay(reference.getFullYear(), reference.getMonth(), day, true);
  if (candidate <= reference) candidate = dateWithClampedDay(reference.getFullYear(), reference.getMonth() + 1, day, true);
  return candidate;
}

function dateWithClampedDay(year, month, day, endOfDay = false) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}

function cycleConsumption(items, range) {
  const selected = items.filter((item) => {
    const date = new Date(item.date);
    return date >= range.start && date <= range.end;
  });
  return {
    consumption: selected.length > 1 ? Math.max(0, selected.at(-1).value - selected[0].value) : 0,
    count: selected.length
  };
}

function renderComparison(selector, current, previous) {
  const element = document.querySelector(selector);
  element.classList.remove("increase", "decrease", "steady");
  if (current.count < 2 || previous.count < 2 || previous.consumption <= 0) {
    element.textContent = "Aguardando leituras";
    return;
  }
  const difference = ((current.consumption - previous.consumption) / previous.consumption) * 100;
  if (Math.abs(difference) < 0.1) {
    element.textContent = "• 0% em relação ao ciclo anterior";
    element.classList.add("steady");
    return;
  }
  const increased = difference > 0;
  element.textContent = `${increased ? "▲ +" : "▼ -"}${Math.abs(difference).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. ciclo anterior`;
  element.classList.add(increased ? "increase" : "decrease");
}

function weakestConfidence(...levels) {
  const rank = { baixa: 0, média: 1, alta: 2 };
  return levels.filter((level) => level in rank).sort((left, right) => rank[left] - rank[right])[0] || "baixa";
}

function formatReadingDate(date) {
  const preference = readPreference("preferences", { dateFormat: "short" });
  const options = preference.dateFormat === "long"
    ? { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };
  return new Date(date).toLocaleString("pt-BR", options);
}

function formatShortDate(date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function formatNumber(value, digits = 1) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });
}

function currency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toLocalInputValue(value) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function preferenceKey(name) {
  return `volt-beta-v2-${name}`;
}

function readPreference(name, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(preferenceKey(name)) || "{}") };
  } catch {
    return fallback;
  }
}

function savePreference(name, value) {
  localStorage.setItem(preferenceKey(name), JSON.stringify(value));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}
