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

function readStoredSession(url) {
  try {
    const projectRef = new URL(url).hostname.split(".")[0];
    const raw = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.access_token || !session?.refresh_token || !session?.user) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + 30) return null;
    return session;
  } catch {
    return null;
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

function hardenAuthClient(client, url) {
  if (!client?.auth) return client;

  let latestSession = readStoredSession(url);
  const auth = client.auth;
  const originalGetSession = auth.getSession.bind(auth);
  const originalSignInWithPassword = auth.signInWithPassword.bind(auth);
  const originalSignOut = auth.signOut.bind(auth);

  auth.getSession = async () => {
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
    const result = await originalSignInWithPassword(credentials);
    if (result?.data?.session) latestSession = result.data.session;
    return result;
  };

  auth.signOut = async (options) => {
    latestSession = null;
    return originalSignOut(options);
  };

  if (auth.mfa) {
    const originalChallengeAndVerify = auth.mfa.challengeAndVerify?.bind(auth.mfa);

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

    if (originalChallengeAndVerify) {
      auth.mfa.challengeAndVerify = async (params) => {
        const result = await originalChallengeAndVerify(params);
        if (!result?.error) latestSession = readStoredSession(url) || latestSession;
        return result;
      };
    }
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
      return hardenAuthClient(client, url);
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
