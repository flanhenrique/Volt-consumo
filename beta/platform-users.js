// Volt Beta — diretório global de usuários da plataforma
// Somente leitura. Os dados são obtidos por RPC protegida; nada pessoal fica embutido no bundle público.

installPlatformUsersStyles();

function installPlatformUsersStyles() {
  if (document.querySelector('link[data-platform-users-styles]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./platform-users.css?v=57", import.meta.url).href;
  link.dataset.platformUsersStyles = "true";
  document.head.append(link);
}

let platformUsersClient = null;
let platformUsersSnapshot = null;

queueMicrotask(initializePlatformUsersView);
window.addEventListener("volt:beta-data", () => {
  if (document.querySelector("#beta-users") && !platformUsersSnapshot) loadPlatformUsers();
});

function initializePlatformUsersView() {
  const page = document.querySelector("#beta-users");
  if (!page) return;

  page.innerHTML = `
    <div class="page-heading platform-users-heading">
      <div>
        <p class="eyebrow">VOLT</p>
        <h2 id="beta-users-title">Usuários</h2>
        <p class="note">Visualização dos usuários cadastrados na plataforma.</p>
      </div>
    </div>

    <article class="admin-summary-card platform-user-summary" aria-label="Resumo dos usuários da VOLT">
      <div><small>Total de contas</small><strong id="volt-platform-total-users">—</strong></div>
      <div><small>Ativos recentemente</small><strong id="volt-platform-active-users">—</strong></div>
      <div><small>E-mails confirmados</small><strong id="volt-platform-confirmed-users">—</strong></div>
    </article>

    <section class="platform-users-toolbar" aria-label="Filtros de usuários">
      <label class="platform-user-search">
        <span>Buscar</span>
        <input id="platform-user-query" type="search" placeholder="Nome ou e-mail" autocomplete="off">
      </label>
      <label class="platform-user-filter">
        <span>Status</span>
        <select id="platform-user-status-filter">
          <option value="all">Todos</option>
          <option value="active_recently">Ativos recentemente</option>
          <option value="inactive_recently">Sem acesso recente</option>
          <option value="pending_confirmation">Pendentes de confirmação</option>
        </select>
      </label>
    </section>

    <p class="note platform-users-definition">Ativo recentemente = último acesso nos últimos 30 dias. Esta tela é somente leitura.</p>

    <section class="platform-users-panel" aria-labelledby="platform-users-list-title">
      <div class="platform-users-panel-heading">
        <h3 id="platform-users-list-title">Contas</h3>
        <span id="platform-users-count" class="status-chip active">Carregando…</span>
      </div>
      <div id="platform-users-feedback" class="note" role="status" aria-live="polite"></div>
      <div id="platform-users-list"></div>
    </section>
  `;

  page.querySelector("#platform-user-query")?.addEventListener("input", renderPlatformUsers);
  page.querySelector("#platform-user-status-filter")?.addEventListener("change", renderPlatformUsers);
  loadPlatformUsers();
}

async function loadPlatformUsers() {
  const feedback = document.querySelector("#platform-users-feedback");
  if (!feedback) return;
  feedback.textContent = "Atualizando usuários…";

  try {
    const config = window.VOLT_SUPABASE_BETA;
    if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) throw new Error("client_unavailable");

    platformUsersClient ||= window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    const { data: sessionData } = await platformUsersClient.auth.getSession();
    if (!sessionData?.session) throw new Error("session_required");

    const { data, error } = await platformUsersClient.rpc("beta_platform_users_snapshot");
    if (error) throw error;

    platformUsersSnapshot = normalizeSnapshot(data);
    setText("#volt-platform-total-users", platformUsersSnapshot.totalUsers);
    setText("#volt-platform-active-users", platformUsersSnapshot.activeLast30Days);
    setText("#volt-platform-confirmed-users", platformUsersSnapshot.confirmedUsers);
    feedback.textContent = platformUsersSnapshot.generatedAt
      ? `Atualizado em ${formatDateTime(platformUsersSnapshot.generatedAt)}.`
      : "Dados atualizados.";
    renderPlatformUsers();
  } catch (error) {
    console.warn("Volt: diretório global de usuários indisponível", error);
    platformUsersSnapshot = null;
    setText("#platform-users-count", "Indisponível");
    feedback.textContent = "Não foi possível consultar a base global de usuários nesta sessão.";
    document.querySelector("#platform-users-list")?.replaceChildren();
  }
}

function normalizeSnapshot(data) {
  const source = data && typeof data === "object" ? data : {};
  return {
    totalUsers: Number(source.total_users || 0),
    confirmedUsers: Number(source.confirmed_users || 0),
    activeLast30Days: Number(source.active_last_30_days || 0),
    generatedAt: source.generated_at || null,
    users: Array.isArray(source.users) ? source.users.map((user) => ({
      name: String(user?.name || "Usuário"),
      email: String(user?.email || "—"),
      status: String(user?.status || "inactive_recently"),
      createdAt: user?.created_at || null,
      confirmedAt: user?.confirmed_at || null,
      lastSignInAt: user?.last_sign_in_at || null
    })) : []
  };
}

function renderPlatformUsers() {
  const container = document.querySelector("#platform-users-list");
  if (!container || !platformUsersSnapshot) return;

  const query = (document.querySelector("#platform-user-query")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const filter = document.querySelector("#platform-user-status-filter")?.value || "all";
  const users = platformUsersSnapshot.users.filter((user) => {
    const matchesFilter = filter === "all" || user.status === filter;
    const haystack = `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR");
    return matchesFilter && (!query || haystack.includes(query));
  });

  setText("#platform-users-count", `${users.length} ${users.length === 1 ? "usuário" : "usuários"}`);
  container.replaceChildren();

  if (!users.length) {
    const empty = document.createElement("p");
    empty.className = "note platform-users-empty";
    empty.textContent = "Nenhum usuário corresponde aos filtros.";
    container.append(empty);
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "platform-users-table-wrap";
  const table = document.createElement("table");
  table.className = "platform-users-table";
  table.innerHTML = `<thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Último acesso</th><th>Criado em</th></tr></thead>`;
  const tbody = document.createElement("tbody");
  users.forEach((user) => tbody.append(buildDesktopRow(user)));
  table.append(tbody);
  tableWrap.append(table);

  const cards = document.createElement("div");
  cards.className = "platform-users-cards";
  users.forEach((user) => cards.append(buildMobileCard(user)));

  container.append(tableWrap, cards);
}

function buildDesktopRow(user) {
  const tr = document.createElement("tr");
  tr.append(
    cell(user.name, "platform-user-name"),
    cell(user.email, "platform-user-email"),
    statusCell(user),
    cell(user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "—"),
    cell(user.createdAt ? formatDateTime(user.createdAt) : "—")
  );
  return tr;
}

function buildMobileCard(user) {
  const article = document.createElement("article");
  article.className = "platform-user-card";

  const header = document.createElement("div");
  header.className = "platform-user-card-header";
  const identity = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = user.name;
  const email = document.createElement("small");
  email.textContent = user.email;
  identity.append(name, email);
  header.append(identity, statusBadge(user.status));

  const meta = document.createElement("dl");
  meta.className = "platform-user-meta";
  meta.append(
    metaItem("Último acesso", user.lastSignInAt ? formatDateTime(user.lastSignInAt) : "—"),
    metaItem("Criado em", user.createdAt ? formatDateTime(user.createdAt) : "—"),
    metaItem("E-mail", user.confirmedAt ? "Confirmado" : "Pendente")
  );

  article.append(header, meta);
  return article;
}

function statusCell(user) {
  const td = document.createElement("td");
  td.append(statusBadge(user.status));
  return td;
}

function statusBadge(status) {
  const span = document.createElement("span");
  span.className = `platform-user-status ${status}`;
  const labels = {
    active_recently: "Ativo recentemente",
    inactive_recently: "Sem acesso recente",
    pending_confirmation: "Pendente de confirmação"
  };
  span.textContent = labels[status] || "Sem acesso recente";
  return span;
}

function cell(value, className = "") {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = value;
  return td;
}

function metaItem(label, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  wrapper.append(dt, dd);
  return wrapper;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}
