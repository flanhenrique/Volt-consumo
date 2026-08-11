const TEST_ACCOUNT_EMAIL = "walflanribeiro@gmail.com";
const CONFIG = window.VOLT_SUPABASE_BETA || {};

let client = null;

queueMicrotask(initializeTestAccountReset);

function initializeTestAccountReset() {
  waitForResetButton();
}

function waitForResetButton(attempt = 0) {
  const button = document.querySelector("#beta-reset-confirm");
  if (!button) {
    if (attempt < 80) window.setTimeout(() => waitForResetButton(attempt + 1), 100);
    return;
  }
  button.addEventListener("click", interceptTestReset, true);
}

function getClient() {
  if (client) return client;
  if (!window.supabase?.createClient || !CONFIG.url || !CONFIG.publishableKey) return null;
  client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return client;
}

async function interceptTestReset(event) {
  const email = window.VOLT_BETA_API?.getSnapshot?.().account?.email?.trim().toLowerCase() || "";
  if (email !== TEST_ACCOUNT_EMAIL) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Restaurando…";

  const status = ensureStatus();
  status.textContent = "Preparando uma nova experiência sem apagar leituras nem configurações salvas.";

  try {
    const supabase = getClient();
    if (!supabase) throw new Error("auth_unavailable");

    const { data, error } = await supabase.auth.getUser();
    const user = data?.user;
    if (error || !user || String(user.email || "").toLowerCase() !== TEST_ACCOUNT_EMAIL) {
      throw new Error("wrong_session");
    }

    const metadata = user.user_metadata || {};
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...metadata,
        guided_tutorial_notice_version: null,
        guided_tutorial_acknowledged_at: null,
        initial_bill_setup_state: null,
        initial_bill_setup_at: null,
        test_fresh_start_at: new Date().toISOString()
      }
    });
    if (updateError) throw updateError;

    clearLocalBetaState();
    await clearBetaCaches();
    await supabase.auth.signOut({ scope: "local" });
    location.reload();
  } catch (error) {
    console.warn("Volt: não foi possível reiniciar a conta de teste", error);
    status.textContent = "Não foi possível restaurar a experiência agora. Nenhum dado foi apagado. Tente novamente.";
    button.disabled = false;
    button.textContent = "Restaurar aplicativo";
  }
}

function clearLocalBetaState() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("volt-beta-")) localStorage.removeItem(key);
  }
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("volt-beta-")) sessionStorage.removeItem(key);
  }
}

async function clearBetaCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("volt-beta-")).map((key) => caches.delete(key)));
}

function ensureStatus() {
  const dialog = document.querySelector("#beta-reset-dialog");
  let status = dialog?.querySelector("#beta-test-reset-status");
  if (status) return status;
  status = document.createElement("p");
  status.id = "beta-test-reset-status";
  status.className = "note status-message";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  dialog?.querySelector("#beta-reset-step-two")?.append(status);
  return status;
}
