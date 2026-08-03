const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAMES = Object.freeze({
  access: "__Host-volt_access",
  refresh: "__Host-volt_refresh",
  csrf: "__Host-volt_csrf"
});
const ROUTES = new Set(["login", "session", "refresh", "logout", "signup", "email-verifications", "verify-email", "password-recoveries", "password-reset", "mfa-backup-codes", "mfa-backup-recovery"]);
const COMMON_PASSWORDS = new Set([
  "123456789012", "123456789123", "abcdefghijkl", "administrator", "iloveyou1234",
  "letmein123456", "password1234", "qwerty123456", "senha1234567", "volt12345678"
]);

function safeRequestId(request) {
  const supplied = request.headers.get("x-request-id") || "";
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function json(status, payload, requestId, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders, "x-request-id": requestId }
  });
}

function allowedOrigin(request, configuredOrigin) {
  try {
    const expected = new URL(configuredOrigin).origin;
    return request.headers.get("origin") === expected ? expected : "";
  } catch {
    return "";
  }
}

function corsHeaders(origin) {
  return origin ? {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type, x-csrf-token, x-request-id, traceparent",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "Origin"
  } : {};
}

function cookie(name, value, maxAge, httpOnly = true) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge};${httpOnly ? " HttpOnly;" : ""} Secure; SameSite=Lax`;
}

function clearCookie(name, httpOnly = true) {
  return cookie(name, "", 0, httpOnly);
}

function cookiesFrom(request) {
  const parsed = new Map();
  for (const pair of (request.headers.get("cookie") || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    try {
      parsed.set(name, decodeURIComponent(pair.slice(separator + 1).trim()));
    } catch {
      parsed.set(name, "");
    }
  }
  return parsed;
}

function routeFrom(request) {
  const route = new URL(request.url).pathname.split("/").filter(Boolean).at(-1) || "login";
  return ROUTES.has(route) ? route : route === "auth-login" ? "login" : "";
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length || left.length < 32) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function csrfIsValid(request, parsedCookies) {
  return timingSafeEqual(request.headers.get("x-csrf-token") || "", parsedCookies.get(COOKIE_NAMES.csrf) || "");
}

function validProviderSession(value) {
  return value && typeof value === "object"
    && typeof value.access_token === "string" && value.access_token.length > 20
    && typeof value.refresh_token === "string" && value.refresh_token.length > 20
    && Number.isFinite(Number(value.expires_in)) && Number(value.expires_in) > 0
    && value.user && typeof value.user.id === "string";
}

function sessionResponse(session, requestId, cors, csrfToken = crypto.randomUUID().replaceAll("-", "")) {
  const headers = new Headers({ ...cors, ...JSON_HEADERS, "x-request-id": requestId });
  headers.append("set-cookie", cookie(COOKIE_NAMES.access, session.access_token, Math.min(Number(session.expires_in), 3600)));
  headers.append("set-cookie", cookie(COOKIE_NAMES.refresh, session.refresh_token, 60 * 60 * 24 * 30));
  headers.append("set-cookie", cookie(COOKIE_NAMES.csrf, csrfToken, 60 * 60 * 24, false));
  return new Response(JSON.stringify({ authenticated: true, user: { id: session.user.id }, csrf_token: csrfToken }), { status: 200, headers });
}

function clearedSessionResponse(requestId, cors) {
  const headers = new Headers({ ...cors, "cache-control": "no-store", "x-request-id": requestId });
  headers.append("set-cookie", clearCookie(COOKIE_NAMES.access));
  headers.append("set-cookie", clearCookie(COOKIE_NAMES.refresh));
  headers.append("set-cookie", clearCookie(COOKIE_NAMES.csrf, false));
  return new Response(null, { status: 204, headers });
}

async function readCredentials(request, maxBodyBytes) {
  const body = await readJson(request, maxBodyBytes);
  const email = normalizedEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || password.length < 8 || password.length > 1024) throw new Error("invalid_credentials_shape");
  return { email, password };
}

async function readJson(request, maxBodyBytes) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBodyBytes) throw new Error("payload_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) throw new Error("payload_too_large");
  const body = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json_shape");
  return body;
}

function normalizedEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : "";
}

function passwordProblem(password) {
  if (typeof password !== "string") return "password_required";
  const length = [...password].length;
  if (length < 12) return "password_too_short";
  if (length > 128) return "password_too_long";
  const normalized = password.normalize("NFKC").toLowerCase();
  if (COMMON_PASSWORDS.has(normalized) || /^(.)\1+$/u.test(normalized)) return "password_too_common";
  return "";
}

async function providerFetch(fetchFn, url, init, timeoutMs) {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jwtClaims(token) {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

export function createAuthLoginHandler({ fetchFn = fetch, env, timeoutMs = 5000, maxBodyBytes = 4096 } = {}) {
  return async function authLoginHandler(request) {
    const requestId = safeRequestId(request);
    const origin = allowedOrigin(request, env("BETA_APP_ORIGIN"));
    const cors = corsHeaders(origin);
    const route = routeFrom(request);

    if (request.method === "OPTIONS") {
      return origin
        ? new Response(null, { status: 204, headers: { ...cors, "cache-control": "no-store", "x-request-id": requestId } })
        : json(403, { code: "origin_denied", request_id: requestId }, requestId);
    }
    if (!route) return json(404, { code: "not_found", request_id: requestId }, requestId, cors);
    if (!origin) return json(403, { code: "origin_denied", request_id: requestId }, requestId);
    if ((route === "session" && request.method !== "GET") || (route !== "session" && request.method !== "POST")) {
      return json(405, { code: "method_not_allowed", request_id: requestId }, requestId, cors);
    }
    if (["login", "signup", "email-verifications", "verify-email", "password-recoveries", "password-reset", "mfa-backup-codes", "mfa-backup-recovery"].includes(route)
      && (request.headers.get("content-type") || "").split(";", 1)[0].trim() !== "application/json") {
      return json(415, { code: "unsupported_media_type", request_id: requestId }, requestId, cors);
    }

    let baseUrl;
    const publicKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || "";
    try {
      baseUrl = new URL(env("SUPABASE_URL")).origin;
      if (!baseUrl.startsWith("https://") || !publicKey) throw new Error("invalid_configuration");
    } catch {
      return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    if (["mfa-backup-codes", "mfa-backup-recovery"].includes(route)) {
      let body;
      try { body = await readJson(request, maxBodyBytes); } catch {
        return json(400, { code: "invalid_request", request_id: requestId }, requestId, cors);
      }
      const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || "";
      const bearer = request.headers.get("authorization") || "";
      const accessToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!serviceKey || accessToken.length < 20) return json(401, { code: "authentication_required", request_id: requestId }, requestId, cors);
      const userResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/user`, {
        method: "GET", headers: { apikey: publicKey, authorization: `Bearer ${accessToken}`, "x-request-id": requestId }
      }, timeoutMs);
      let user;
      try { user = userResponse?.ok ? await userResponse.json() : null; } catch { user = null; }
      const claims = jwtClaims(accessToken);
      if (!user?.id || claims?.sub !== user.id) return json(401, { code: "authentication_required", request_id: requestId }, requestId, cors);
      const rpc = async (name, payload) => providerFetch(fetchFn, `${baseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify(payload)
      }, timeoutMs);

      if (route === "mfa-backup-codes") {
        if (claims.aal !== "aal2") return json(403, { code: "reauthentication_required", request_id: requestId }, requestId, cors);
        const codes = new Set();
        while (codes.size < 10) {
          const raw = crypto.getRandomValues(new Uint8Array(8));
          const hex = [...raw].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
          codes.add(hex.match(/.{4}/g).join("-"));
        }
        const displayedCodes = [...codes];
        const hashes = await Promise.all(displayedCodes.map((code) => sha256Hex(code.replaceAll("-", ""))));
        const stored = await rpc("beta_mfa_backup_replace", { p_user_id: user.id, p_code_hashes: hashes });
        if (!stored?.ok) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
        return json(201, { backup_codes: displayedCodes, count: 10, one_time_display: true, request_id: requestId }, requestId, cors);
      }

      const normalizedCode = typeof body.code === "string" ? body.code.trim().toUpperCase().replaceAll("-", "") : "";
      if (!/^[0-9A-F]{16}$/.test(normalizedCode)) return json(400, { code: "invalid_backup_code", request_id: requestId }, requestId, cors);
      const consumed = await rpc("beta_mfa_backup_consume", { p_user_id: user.id, p_code_hash: await sha256Hex(normalizedCode) });
      let result;
      try { result = consumed?.ok ? await consumed.json() : null; } catch { result = null; }
      if (!result) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      if (!result.accepted) {
        return json(result.blocked ? 429 : 400, {
          code: result.blocked ? "mfa_temporarily_blocked" : "invalid_backup_code",
          attempts_remaining: result.attempts_remaining,
          retry_after_seconds: result.retry_after_seconds,
          request_id: requestId
        }, requestId, cors);
      }

      const adminUser = await providerFetch(fetchFn, `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
        method: "GET", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "x-request-id": requestId }
      }, timeoutMs);
      let adminPayload;
      try { adminPayload = adminUser?.ok ? await adminUser.json() : null; } catch { adminPayload = null; }
      if (!adminPayload) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      for (const factor of (adminPayload.factors || []).filter((item) => item?.id)) {
        const removed = await providerFetch(fetchFn, `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}/factors/${encodeURIComponent(factor.id)}`, {
          method: "DELETE", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "x-request-id": requestId }
        }, timeoutMs);
        if (!removed?.ok) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      }
      const revoked = await providerFetch(fetchFn, `${baseUrl}/auth/v1/logout?scope=global`, {
        method: "POST", headers: { apikey: publicKey, authorization: `Bearer ${accessToken}`, "x-request-id": requestId }
      }, timeoutMs);
      if (!revoked?.ok) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      return json(200, { recovered: true, factors_removed: (adminPayload.factors || []).length, sessions_revoked: true, next: "login", request_id: requestId }, requestId, cors);
    }

    if (["password-recoveries", "password-reset"].includes(route)) {
      let body;
      try {
        body = await readJson(request, maxBodyBytes);
      } catch (error) {
        const status = error?.message === "payload_too_large" ? 413 : 400;
        return json(status, { code: status === 413 ? "payload_too_large" : "invalid_request", request_id: requestId }, requestId, cors);
      }
      const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (!serviceKey) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      const rpc = async (name, payload) => providerFetch(fetchFn, `${baseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify(payload)
      }, timeoutMs);

      if (route === "password-recoveries") {
        const email = normalizedEmail(body.email);
        if (!email) return json(400, { code: "invalid_request", request_id: requestId }, requestId, cors);
        const recoveryId = crypto.randomUUID();
        const stored = await rpc("beta_password_recovery_request", { p_email: email, p_request_id: recoveryId });
        if (!stored || !stored.ok) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);

        let redirectUrl;
        try {
          redirectUrl = new URL(env("AUTH_PASSWORD_REDIRECT_URL") || env("AUTH_EMAIL_REDIRECT_URL") || `${env("BETA_APP_ORIGIN")}/Volt-consumo/beta/`);
          if (redirectUrl.protocol !== "https:" || redirectUrl.origin !== new URL(env("BETA_APP_ORIGIN")).origin) throw new Error("invalid_redirect");
          redirectUrl.searchParams.set("password_recovery", recoveryId);
        } catch {
          return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
        }
        await providerFetch(fetchFn, `${baseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectUrl.href)}`, {
          method: "POST",
          headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({ email })
        }, timeoutMs);
        return json(202, { next: "check_email", request_id: requestId }, requestId, cors);
      }

      const recoveryId = typeof body.request_id === "string" ? body.request_id : "";
      const problem = passwordProblem(body.password);
      const bearer = request.headers.get("authorization") || "";
      const recoveryToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
      if (!/^[0-9a-f-]{36}$/i.test(recoveryId) || problem || recoveryToken.length < 20) {
        return json(400, { code: problem ? "weak_password" : "invalid_or_expired_link", request_id: requestId }, requestId, cors);
      }
      const userResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/user`, {
        method: "GET",
        headers: { apikey: publicKey, authorization: `Bearer ${recoveryToken}`, "x-request-id": requestId }
      }, timeoutMs);
      let recoveryUser;
      try { recoveryUser = userResponse?.ok ? await userResponse.json() : null; } catch { recoveryUser = null; }
      if (!recoveryUser || typeof recoveryUser.id !== "string") {
        return json(400, { code: "invalid_or_expired_link", request_id: requestId }, requestId, cors);
      }

      const claimed = await rpc("beta_password_recovery_claim", { p_request_id: recoveryId, p_user_id: recoveryUser.id });
      let claimAccepted = false;
      try { claimAccepted = claimed?.ok && await claimed.json() === true; } catch { claimAccepted = false; }
      if (!claimAccepted) return json(400, { code: "invalid_or_expired_link", request_id: requestId }, requestId, cors);
      const releaseClaim = () => rpc("beta_password_recovery_release", { p_request_id: recoveryId, p_user_id: recoveryUser.id });

      const updated = await providerFetch(fetchFn, `${baseUrl}/auth/v1/admin/users/${encodeURIComponent(recoveryUser.id)}`, {
        method: "PUT",
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ password: body.password })
      }, timeoutMs);
      if (!updated?.ok) {
        await releaseClaim();
        return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      }
      const revoked = await providerFetch(fetchFn, `${baseUrl}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { apikey: publicKey, authorization: `Bearer ${recoveryToken}`, "x-request-id": requestId }
      }, timeoutMs);
      if (!revoked?.ok && ![401, 403].includes(revoked?.status)) {
        await releaseClaim();
        return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      }
      const finalized = await rpc("beta_password_recovery_finalize", { p_request_id: recoveryId, p_user_id: recoveryUser.id });
      let finalizedOk = false;
      try { finalizedOk = finalized?.ok && await finalized.json() === true; } catch { finalizedOk = false; }
      return finalizedOk
        ? json(200, { reset: true, sessions_revoked: true, next: "login", request_id: requestId }, requestId, cors)
        : json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    if (["signup", "email-verifications", "verify-email"].includes(route)) {
      let body;
      try {
        body = await readJson(request, maxBodyBytes);
      } catch (error) {
        const status = error?.message === "payload_too_large" ? 413 : 400;
        return json(status, { code: status === 413 ? "payload_too_large" : "invalid_request", request_id: requestId }, requestId, cors);
      }
      const redirect = env("AUTH_EMAIL_REDIRECT_URL") || `${env("BETA_APP_ORIGIN")}/Volt-consumo/beta/`;
      let redirectUrl;
      try {
        redirectUrl = new URL(redirect);
        if (redirectUrl.protocol !== "https:" || redirectUrl.origin !== new URL(env("BETA_APP_ORIGIN")).origin) throw new Error("invalid_redirect");
      } catch {
        return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      }

      if (route === "signup") {
        const email = normalizedEmail(body.email);
        const problem = passwordProblem(body.password);
        const noticeVersion = env("PRIVACY_NOTICE_VERSION") || "1.0";
        if (!email || body.privacy_accepted !== true || body.privacy_notice_version !== noticeVersion) {
          return json(400, { code: "invalid_request", request_id: requestId }, requestId, cors);
        }
        if (problem) {
          return json(400, {
            code: "weak_password",
            guidance: "Use uma senha exclusiva entre 12 e 128 caracteres; frases longas e gerenciadores de senha são permitidos.",
            request_id: requestId
          }, requestId, cors);
        }
        const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl.href)}`, {
          method: "POST",
          headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({
            email,
            password: body.password,
            data: { privacy_notice_version: noticeVersion, privacy_notice_accepted_at: new Date().toISOString() }
          })
        }, timeoutMs);
        if (!providerResponse || providerResponse.status >= 500) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
        if (providerResponse.status === 429) return json(429, { code: "rate_limited", request_id: requestId }, requestId, cors);
        return json(202, { next: "verify_email", request_id: requestId }, requestId, cors);
      }

      if (route === "email-verifications") {
        const email = normalizedEmail(body.email);
        if (!email) return json(400, { code: "invalid_request", request_id: requestId }, requestId, cors);
        const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/resend?redirect_to=${encodeURIComponent(redirectUrl.href)}`, {
          method: "POST",
          headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
          body: JSON.stringify({ type: "signup", email })
        }, timeoutMs);
        if (!providerResponse || providerResponse.status >= 500) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
        if (providerResponse.status === 429) return json(429, { code: "rate_limited", request_id: requestId }, requestId, cors);
        return json(202, { next: "verify_email", request_id: requestId }, requestId, cors);
      }

      const tokenHash = typeof body.token_hash === "string" ? body.token_hash : "";
      if (!/^[A-Za-z0-9_-]{32,512}$/.test(tokenHash)) {
        return json(400, { code: "invalid_or_expired_link", request_id: requestId }, requestId, cors);
      }
      const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/verify`, {
        method: "POST",
        headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ type: "signup", token_hash: tokenHash })
      }, timeoutMs);
      if (!providerResponse || providerResponse.status >= 500) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      return providerResponse.ok
        ? json(200, { verified: true, next: "login", request_id: requestId }, requestId, cors)
        : json(400, { code: "invalid_or_expired_link", request_id: requestId }, requestId, cors);
    }

    if (route === "login") {
      let credentials;
      try {
        credentials = await readCredentials(request, maxBodyBytes);
      } catch (error) {
        const status = error?.message === "payload_too_large" ? 413 : 400;
        return json(status, { code: status === 413 ? "payload_too_large" : "invalid_request", request_id: requestId }, requestId, cors);
      }
      const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify(credentials)
      }, timeoutMs);
      if (!providerResponse) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      if (!providerResponse.ok) return json(401, { code: "invalid_credentials", request_id: requestId }, requestId, cors);
      let session;
      try { session = await providerResponse.json(); } catch { session = null; }
      return validProviderSession(session)
        ? sessionResponse(session, requestId, cors)
        : json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    const parsedCookies = cookiesFrom(request);
    const accessToken = parsedCookies.get(COOKIE_NAMES.access) || "";
    if (route === "session") {
      if (!accessToken) return json(401, { authenticated: false, code: "session_required", request_id: requestId }, requestId, cors);
      const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/user`, {
        method: "GET",
        headers: { apikey: publicKey, authorization: `Bearer ${accessToken}`, "x-request-id": requestId }
      }, timeoutMs);
      if (!providerResponse) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      if (!providerResponse.ok) return json(401, { authenticated: false, code: "session_expired", request_id: requestId }, requestId, cors);
      let user;
      try { user = await providerResponse.json(); } catch { user = null; }
      return user && typeof user.id === "string"
        ? json(200, { authenticated: true, user: { id: user.id }, csrf_token: parsedCookies.get(COOKIE_NAMES.csrf) || "" }, requestId, cors)
        : json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    if (!csrfIsValid(request, parsedCookies)) {
      return json(403, { code: "csrf_denied", request_id: requestId }, requestId, cors);
    }

    if (route === "refresh") {
      const refreshToken = parsedCookies.get(COOKIE_NAMES.refresh) || "";
      if (!refreshToken) return json(401, { authenticated: false, code: "session_required", request_id: requestId }, requestId, cors);
      const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify({ refresh_token: refreshToken })
      }, timeoutMs);
      if (!providerResponse) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
      if (!providerResponse.ok) return clearedSessionResponse(requestId, cors);
      let session;
      try { session = await providerResponse.json(); } catch { session = null; }
      return validProviderSession(session)
        ? sessionResponse(session, requestId, cors, parsedCookies.get(COOKIE_NAMES.csrf))
        : json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    if (!accessToken) return clearedSessionResponse(requestId, cors);
    const providerResponse = await providerFetch(fetchFn, `${baseUrl}/auth/v1/logout?scope=global`, {
      method: "POST",
      headers: { apikey: publicKey, authorization: `Bearer ${accessToken}`, "x-request-id": requestId }
    }, timeoutMs);
    if (!providerResponse) return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    if (!providerResponse.ok && ![401, 403].includes(providerResponse.status)) {
      return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }
    return clearedSessionResponse(requestId, cors);
  };
}
