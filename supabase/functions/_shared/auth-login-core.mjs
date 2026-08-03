const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer"
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAMES = Object.freeze({ access: "__Host-volt_access", refresh: "__Host-volt_refresh" });

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
    "access-control-allow-headers": "content-type, x-request-id, traceparent",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin"
  } : {};
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function validProviderSession(value) {
  return value && typeof value === "object"
    && typeof value.access_token === "string" && value.access_token.length > 20
    && typeof value.refresh_token === "string" && value.refresh_token.length > 20
    && Number.isFinite(Number(value.expires_in)) && Number(value.expires_in) > 0
    && value.user && typeof value.user.id === "string";
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

export function createAuthLoginHandler({ fetchFn = fetch, env, timeoutMs = 5000, maxBodyBytes = 4096 } = {}) {
  return async function authLoginHandler(request) {
    const requestId = safeRequestId(request);
    const origin = allowedOrigin(request, env("BETA_APP_ORIGIN"));
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return origin
        ? new Response(null, { status: 204, headers: { ...cors, "cache-control": "no-store", "x-request-id": requestId } })
        : json(403, { code: "origin_denied", request_id: requestId }, requestId);
    }
    if (request.method !== "POST") {
      return json(405, { code: "method_not_allowed", request_id: requestId }, requestId, cors);
    }
    if (!origin) return json(403, { code: "origin_denied", request_id: requestId }, requestId);
    if ((request.headers.get("content-type") || "").split(";", 1)[0].trim() !== "application/json") {
      return json(415, { code: "unsupported_media_type", request_id: requestId }, requestId, cors);
    }

    let credentials;
    try {
      credentials = await readCredentials(request, maxBodyBytes);
    } catch (error) {
      const status = error?.message === "payload_too_large" ? 413 : 400;
      return json(status, { code: status === 413 ? "payload_too_large" : "invalid_request", request_id: requestId }, requestId, cors);
    }

    let baseUrl;
    const publicKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || "";
    try {
      baseUrl = new URL(env("SUPABASE_URL")).origin;
      if (!baseUrl.startsWith("https://") || !publicKey) throw new Error("invalid_configuration");
    } catch {
      return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    let providerResponse;
    try {
      providerResponse = await fetchFn(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
        body: JSON.stringify(credentials),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    if (!providerResponse.ok) {
      return json(401, { code: "invalid_credentials", request_id: requestId }, requestId, cors);
    }

    let session;
    try {
      session = await providerResponse.json();
    } catch {
      return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }
    if (!validProviderSession(session)) {
      return json(503, { code: "service_unavailable", request_id: requestId }, requestId, cors);
    }

    const headers = new Headers({ ...cors, ...JSON_HEADERS, "x-request-id": requestId });
    headers.append("set-cookie", cookie(COOKIE_NAMES.access, session.access_token, Math.min(Number(session.expires_in), 3600)));
    headers.append("set-cookie", cookie(COOKIE_NAMES.refresh, session.refresh_token, 60 * 60 * 24 * 30));
    return new Response(JSON.stringify({ authenticated: true, user: { id: session.user.id } }), { status: 200, headers });
  };
}

