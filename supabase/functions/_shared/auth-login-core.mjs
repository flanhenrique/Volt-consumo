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
const ROUTES = new Set(["login", "session", "refresh", "logout"]);

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
    "access-control-allow-headers": "content-type, x-csrf-token, x-request-id, traceparent",
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
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBodyBytes) throw new Error("payload_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) throw new Error("payload_too_large");
  const body = JSON.parse(raw);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || password.length < 8 || password.length > 1024) {
    throw new Error("invalid_credentials_shape");
  }
  return { email, password };
}

async function providerFetch(fetchFn, url, init, timeoutMs) {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
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
    if (route === "login" && (request.headers.get("content-type") || "").split(";", 1)[0].trim() !== "application/json") {
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
