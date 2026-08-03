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
  bindOrganizationContext(shell);
  bindInvitation(shell);
  bindAccount(shell);
  bindMfa(shell);
  bindOperationalHealth(shell);
  bindPreferences(shell);
  bindNotifications(shell);
  bindPrivacy(shell);
  bindRestore(shell);
  bindReports(shell);
  bindAdministration(shell);

  window.setInterval(() => {
    if (!document.hidden) Promise.resolve(api.refreshFeatureFlags()).catch(() => undefined);
  }, 25_000);

  window.addEventListener("volt:beta-data", renderBetaExperience);
  window.addEventListener("focus", refreshBetaData);
  new MutationObserver(() => {
    if (!dashboard.hidden) renderBetaExperience();
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
    <section class="organization-context" aria-labelledby="beta-organization-context-label">
      <label for="beta-organization-context"><span id="beta-organization-context-label">Organização ativa</span><select id="beta-organization-context" aria-describedby="beta-organization-context-status"></select></label>
      <p id="beta-organization-context-status" class="note status-message" role="status" aria-live="polite"></p>
    </section>
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

      <section class="beta-page" id="beta-reports" data-page="reports" aria-labelledby="beta-reports-title" hidden>
        <div class="page-heading"><div><p class="eyebrow">ANÁLISE</p><h2 id="beta-reports-title">Relatórios</h2></div><button id="beta-export-pdf" class="secondary-button compact-action pdf-action" type="button">Exportar PDF</button></div>
        <article class="report-card"><h3>Consumo por leitura</h3><p class="note">Evolução entre registros consecutivos.</p><div id="beta-energy-chart" class="bar-chart" aria-label="Gráfico de consumo de energia"></div><div id="beta-energy-stats" class="report-stats"></div></article>
        <article class="report-card compact-comparison-card"><h3>Comparativo atual</h3><div id="beta-report-comparison" class="report-comparison"></div></article>
        <article class="report-card"><h3>Evolução da água</h3><p class="note">Variação entre leituras do hidrômetro.</p><div id="beta-water-chart" class="bar-chart water-chart" aria-label="Gráfico de consumo de água"></div></article>
      </section>

      <section class="beta-page" id="beta-users" data-page="users" aria-labelledby="beta-users-title" hidden>
        <div class="page-heading"><div><p class="eyebrow">ORGANIZAÇÃO</p><h2 id="beta-users-title">Controle de usuários</h2></div><button id="beta-invite-user" class="primary-button compact-action" type="button">Convidar usuário</button></div>
        <div id="beta-admin-unavailable" class="admin-notice" hidden><strong>Administração indisponível</strong><p id="beta-admin-message">A atualização do banco precisa ser aplicada antes de usar este módulo.</p></div>
        <div id="beta-admin-workspace" hidden>
          <article class="admin-summary-card"><div><small>Organização</small><strong id="beta-organization-name">—</strong></div><div><small>Seu papel</small><strong id="beta-current-role">—</strong></div><div><small>Usuários ativos</small><strong id="beta-member-count">0</strong></div></article>
          <section class="settings-group"><div class="settings-row"><div><h3>Usuários</h3><small>Gerencie papéis e acesso apenas desta organização.</small></div><label class="admin-search"><span class="sr-only">Buscar usuário</span><input id="beta-user-search" type="search" placeholder="Buscar por nome ou e-mail"></label></div><div id="beta-member-list" class="admin-member-list"></div></section>
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
  document.querySelector("#beta-reading-fab").hidden = pageName === "settings" || pageName === "users";
  document.querySelector("#beta-content").scrollTo({ top: 0, behavior: "smooth" });
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

function bindOrganizationContext(shell) {
  const selector = shell.querySelector("#beta-organization-context");
  selector.addEventListener("change", async () => {
    const previous = api.getOrganizationSnapshot().activeOrganizationId;
    selector.disabled = true;
    setText("#beta-organization-context-status", "Validando acesso e limpando os dados do contexto anterior…");
    const result = await api.switchOrganization(selector.value);
    selector.disabled = false;
    if (!result.ok) selector.value = previous || "";
    setText("#beta-organization-context-status", result.message);
    renderOrganizationContext();
  });
  Promise.resolve(api.refreshOrganizations()).then(renderOrganizationContext).catch(renderOrganizationContext);
}

function renderOrganizationContext() {
  const snapshot = api.getOrganizationSnapshot();
  const container = document.querySelector(".organization-context");
  const selector = document.querySelector("#beta-organization-context");
  if (!container || !selector) return;
  container.hidden = !snapshot.available || snapshot.organizations.length === 0;
  if (container.hidden) return;
  const currentOptions = [...selector.options].map((option) => option.value).join(",");
  const nextOptions = snapshot.organizations.map((organization) => organization.id).join(",");
  if (currentOptions !== nextOptions) {
    selector.replaceChildren(...snapshot.organizations.map((organization) => {
      const option = document.createElement("option");
      option.value = organization.id;
      option.textContent = `${organization.name} · ${roleLabel(organization.role)}`;
      return option;
    }));
  }
  selector.value = snapshot.activeOrganizationId || "";
  selector.disabled = snapshot.organizations.length < 2;
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

function bindReports(shell) {
  shell.querySelector("#beta-export-pdf").addEventListener("click", () => window.print());
}

function bindAdministration(shell) {
  const inviteDialog = shell.querySelector("#beta-invite-dialog");
  const createdDialog = shell.querySelector("#beta-invite-created-dialog");
  const memberDialog = shell.querySelector("#beta-member-dialog");
  const ownerTransferDialog = shell.querySelector("#beta-owner-transfer-dialog");
  shell.querySelectorAll("[data-close-admin-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  shell.querySelector("#beta-invite-user").addEventListener("click", () => inviteDialog.showModal());
  shell.querySelector("#beta-user-search").addEventListener("input", renderAdministration);
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
  Promise.all([api.refreshAdmin(), api.refreshFeatureFlags()]).then(renderAdministration).catch(renderAdministration);
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
  const cycle = getCycleRanges();
  const energyCurrent = cycleConsumption(snapshot.energy.readings, cycle.current);
  const energyPrevious = cycleConsumption(snapshot.energy.readings, cycle.previous);
  const waterCurrent = cycleConsumption(snapshot.water.readings, cycle.current);
  const waterPrevious = cycleConsumption(snapshot.water.readings, cycle.previous);
  const displayName = snapshot.account.displayName?.trim();
  setText("#beta-greeting", displayName ? `Olá, ${displayName}!` : "Olá!");
  const nameInput = document.querySelector("#beta-display-name");
  if (document.activeElement !== nameInput) nameInput.value = displayName || "";
  document.querySelector("#beta-account-email").value = snapshot.account.email || "";
  setText("#beta-cycle-label", `${formatShortDate(cycle.current.start)} – ${formatShortDate(cycle.current.end)}`);
  setText("#beta-energy-consumption", `${formatNumber(energyCurrent.consumption)} kWh`);
  setText("#beta-water-consumption", `${formatNumber(waterCurrent.consumption, 3)} m³`);
  setText("#beta-energy-cost", currency(api.estimateEnergy(energyCurrent.consumption).totalCost));
  setText("#beta-water-cost", currency(api.estimateWater(waterCurrent.consumption).totalCost));
  renderComparison("#beta-energy-comparison", energyCurrent, energyPrevious);
  renderComparison("#beta-water-comparison", waterCurrent, waterPrevious);
  renderFinancialSummary(snapshot, cycle, energyCurrent, energyPrevious, waterCurrent, waterPrevious);
  renderReadingHistory(snapshot);
  renderReports(snapshot, energyCurrent, waterCurrent);
  renderBetaMfa();
  renderOperationalHealth();
  renderOrganizationContext();
  renderInvitation();
  renderAdministration();
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

function renderReports(snapshot, energyCurrent, waterCurrent) {
  const energyDeltas = deltas(snapshot.energy.readings);
  renderBarChart("#beta-energy-chart", energyDeltas, "kWh");
  renderBarChart("#beta-water-chart", deltas(snapshot.water.readings), "m³");
  renderConsumptionStats("#beta-energy-stats", energyDeltas, "kWh");
  const comparison = document.querySelector("#beta-report-comparison");
  renderStatGrid(comparison, [
    ["Energia", `${formatNumber(energyCurrent.consumption)} kWh`],
    ["Água", `${formatNumber(waterCurrent.consumption, 3)} m³`],
    ["Valor estimado", currency(api.estimateEnergy(energyCurrent.consumption).totalCost + api.estimateWater(waterCurrent.consumption).totalCost)]
  ]);
}

function renderConsumptionStats(selector, values, unit) {
  const container = document.querySelector(selector);
  if (!values.length) {
    renderStatGrid(container, [["Maior consumo", `0 ${unit}`], ["Menor consumo", `0 ${unit}`], ["Consumo médio", `0 ${unit}`]]);
    return;
  }
  const numericValues = values.map((item) => item.value);
  const digits = unit === "m³" ? 3 : 1;
  renderStatGrid(container, [
    ["Maior consumo", `${formatNumber(Math.max(...numericValues), digits)} ${unit}`],
    ["Menor consumo", `${formatNumber(Math.min(...numericValues), digits)} ${unit}`],
    ["Consumo médio", `${formatNumber(numericValues.reduce((total, value) => total + value, 0) / numericValues.length, digits)} ${unit}`]
  ]);
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

function renderBarChart(selector, values, unit) {
  const container = document.querySelector(selector);
  if (!values.length) {
    container.innerHTML = '<p class="empty">Adicione ao menos duas leituras para visualizar a evolução.</p>';
    return;
  }
  const max = Math.max(...values.map((item) => item.value), 1);
  container.replaceChildren(...values.slice(-10).map((item) => {
    const bar = document.createElement("div");
    bar.className = "bar-column";
    const value = document.createElement("small");
    value.textContent = `${formatNumber(item.value, unit === "m³" ? 3 : 0)} ${unit}`;
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.style.height = `${Math.max(8, (item.value / max) * 100)}%`;
    track.append(fill);
    const date = document.createElement("time");
    date.dateTime = item.date;
    date.textContent = new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    bar.append(value, track, date);
    return bar;
  }));
}

function deltas(items) {
  return items.slice(1).map((item, index) => ({ date: item.date, value: Math.max(0, item.value - items[index].value) }));
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
