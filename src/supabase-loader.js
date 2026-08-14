let loadingPromise = null;
let billingWorkflowStarted = false;
let authLockHardened = false;

const RUNTIME_LOAD_TIMEOUT_MS = 8000;
const SESSION_RECOVERY_TIMEOUT_MS = 3500;

async function runWithoutBrowserWebLock(_name, _acquireTimeout, operation) {
  return operation();
}

function delay(ms, value) {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}

function projectStorageKey(url) {
  try {
    const projectRef = new URL(url).hostname.split(".")[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return null;
  }
}

function normalizeSession(session, fallbackUser = null) {
  if (!session?.access_token || !session?.refresh_token) return null;
  const expiresIn = Number(session.expires_in || 3600);
  return {
    ...session,
    user: session.user || fallbackUser,
    expires_at: Number(session.expires_at || 0) || Math.floor(Date.now() / 1000) + expiresIn
  };
}

function readStoredSession(url) {
  try {
    const key = projectStorageKey(url);
    const raw = key ? localStorage.getItem(key) : null;
    if (!raw) return null;
    const session = normalizeSession(JSON.parse(raw));
    if (!session?.user) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + 30) return null;
    return session;
  } catch {
    return null;
  }
}

function persistStoredSession(url, session) {
  try {
    const key = projectStorageKey(url);
    const normalized = normalizeSession(session);
    if (!key || !normalized?.user) return normalized;
    localStorage.setItem(key, JSON.stringify(normalized));
    return normalized;
  } catch {
    return normalizeSession(session);
  }
}

function clearStoredSession(url) {
  try {
    const key = projectStorageKey(url);
    if (key) localStorage.removeItem(key);
  } catch {
    // Logout local deve continuar mesmo quando o armazenamento do navegador falhar.
  }
}

function jwtPayload(accessToken) {
  try {
    const encoded = String(accessToken || "").split(".")[1];
    if (!encoded) return {};
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

function factorSnapshot(session) {
  const factors = Array.isArray(session?.user?.factors) ? session.user.factors : [];
  return {
    all: factors,
    totp: factors.filter((factor) => factor.factor_type === "totp" && factor.status === "verified"),
    phone: factors.filter((factor) => factor.factor_type === "phone" && factor.status === "verified")
  };
}

async function authRequest(url, key, path, { method = "POST", accessToken = null, body } = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    "Content-Type": "application/json"
  };
  const response = await fetch(`${url}/auth/v1${path}`, {
    method,
    headers,
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || `Falha de autenticação (${response.status}).`);
    error.status = response.status;
    error.code = payload?.code || payload?.error_code || null;
    throw error;
  }
  return payload;
}

function hardenAuthClient(client, url, key) {
  if (!client?.auth) return client;

  let latestSession = readStoredSession(url);
  const auth = client.auth;
  const originalGetSession = auth.getSession.bind(auth);

  auth.getSession = async () => {
    latestSession ||= readStoredSession(url);
    if (latestSession) return { data: { session: latestSession }, error: null };
    const timeoutResult = Symbol("session-timeout");
    const result = await Promise.race([
      originalGetSession(),
      delay(SESSION_RECOVERY_TIMEOUT_MS, timeoutResult)
    ]);
    if (result === timeoutResult) {
      latestSession = readStoredSession(url);
      return { data: { session: latestSession }, error: null };
    }
    if (result?.data?.session) latestSession = result.data.session;
    return result;
  };

  auth.signInWithPassword = async (credentials) => {
    try {
      const payload = await authRequest(url, key, "/token?grant_type=password", {
        body: {
          email: credentials?.email,
          password: credentials?.password,
          gotrue_meta_security: { captcha_token: credentials?.options?.captchaToken }
        }
      });
      latestSession = persistStoredSession(url, normalizeSession(payload));
      return {
        data: { user: latestSession?.user || null, session: latestSession },
        error: latestSession ? null : new Error("O provedor não retornou uma sessão válida.")
      };
    } catch (error) {
      return { data: { user: null, session: null }, error };
    }
  };

  auth.signOut = async () => {
    const session = latestSession || readStoredSession(url);
    latestSession = null;
    clearStoredSession(url);
    if (session?.access_token) {
      try {
        await authRequest(url, key, "/logout?scope=local", { accessToken: session.access_token, body: {} });
      } catch {
        // A sessão local já foi removida; falha de rede não deve impedir o logout.
      }
    }
    return { error: null };
  };

  if (auth.mfa) {
    auth.mfa.listFactors = async () => {
      latestSession ||= readStoredSession(url);
      if (!latestSession) return { data: { all: [], totp: [], phone: [] }, error: null };
      return { data: factorSnapshot(latestSession), error: null };
    };

    auth.mfa.getAuthenticatorAssuranceLevel = async () => {
      latestSession ||= readStoredSession(url);
      if (!latestSession) return { data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] }, error: null };
      const payload = jwtPayload(latestSession.access_token);
      const factors = factorSnapshot(latestSession);
      const currentLevel = payload.aal || "aal1";
      const nextLevel = factors.totp.length || factors.phone.length ? "aal2" : currentLevel;
      return {
        data: {
          currentLevel,
          nextLevel,
          currentAuthenticationMethods: Array.isArray(payload.amr) ? payload.amr : []
        },
        error: null
      };
    };

    auth.mfa.challengeAndVerify = async ({ factorId, code }) => {
      latestSession ||= readStoredSession(url);
      if (!latestSession?.access_token) return { data: null, error: new Error("Sessão indisponível para validar o segundo fator.") };
      try {
        const challenge = await authRequest(url, key, `/factors/${encodeURIComponent(factorId)}/challenge`, {
          accessToken: latestSession.access_token,
          body: {}
        });
        const verified = await authRequest(url, key, `/factors/${encodeURIComponent(factorId)}/verify`, {
          accessToken: latestSession.access_token,
          body: { challenge_id: challenge?.id, code }
        });
        latestSession = persistStoredSession(url, normalizeSession(verified, latestSession.user)) || latestSession;
        return { data: verified, error: null };
      } catch (error) {
        return { data: null, error };
      }
    };
  }

  return client;
}

function hardenSupabaseAuthLock() {
  if (authLockHardened || !window.supabase?.createClient) return;

  const runtime = window.supabase;
  const originalCreateClient = runtime.createClient.bind(runtime);
  const hardenedRuntime = Object.create(runtime);

  Object.defineProperty(hardenedRuntime, "createClient", {
    configurable: false,
    enumerable: true,
    writable: false,
    value(url, key, options = {}) {
      const client = originalCreateClient(url, key, {
        ...options,
        auth: {
          ...(options.auth || {}),
          lock: runWithoutBrowserWebLock
        }
      });
      return hardenAuthClient(client, url, key);
    }
  });

  window.supabase = hardenedRuntime;
  authLockHardened = true;
}

function startBillingWorkflow() {
  if (billingWorkflowStarted) return;
  billingWorkflowStarted = true;
  void import("./billing-workflow.js?v=20260813.7")
    .then((module) => module.startBillingWorkflow?.())
    .catch((error) => console.warn("VOLT billing workflow unavailable", error instanceof Error ? error.message : "unknown_error"));
}

export function loadSupabaseRuntime() {
  if (window.supabase?.createClient) {
    hardenSupabaseAuthLock();
    startBillingWorkflow();
    return Promise.resolve();
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const runtimeUrl = new URL("../vendor/supabase/supabase.js", import.meta.url);
    runtimeUrl.searchParams.set("v", "20260814.8");
    script.src = runtimeUrl.href;
    script.async = true;
    script.dataset.voltDependency = "supabase";

    const timeoutId = window.setTimeout(() => {
      reject(new Error("O carregamento da autenticação demorou demais. Tente novamente."));
    }, RUNTIME_LOAD_TIMEOUT_MS);

    script.addEventListener("load", () => {
      window.clearTimeout(timeoutId);
      if (window.supabase?.createClient) {
        hardenSupabaseAuthLock();
        startBillingWorkflow();
        resolve();
      } else reject(new Error("O runtime Supabase foi carregado sem expor createClient."));
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timeoutId);
      reject(new Error("Não foi possível carregar o runtime Supabase."));
    }, { once: true });
    document.head.append(script);
  }).catch((error) => {
    loadingPromise = null;
    throw error;
  });

  return loadingPromise;
}
