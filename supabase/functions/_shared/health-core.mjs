const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff"
});

function json(status, payload, requestId, method = "GET") {
  const body = method === "HEAD" ? null : JSON.stringify(payload);
  return new Response(body, { status, headers: { ...JSON_HEADERS, "x-request-id": requestId } });
}

function safeRequestId(request) {
  const supplied = request.headers.get("x-request-id") || "";
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function validatedBaseUrl(value, allowInsecure = false) {
  const url = new URL(value || "");
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) throw new Error("invalid_configuration");
  return url.origin;
}

async function dependencyCheck(fetchFn, url, init, timeoutMs) {
  try {
    const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

export function createHealthHandler({ fetchFn = fetch, env, now = () => new Date(), timeoutMs = 1500 } = {}) {
  return async function healthHandler(request) {
    const startedAt = Date.now();
    const requestId = safeRequestId(request);
    if (!['GET', 'HEAD'].includes(request.method)) {
      return json(405, { status: "error", code: "method_not_allowed", request_id: requestId }, requestId, request.method);
    }

    const probe = new URL(request.url).searchParams.get("probe") || "readiness";
    if (!['liveness', 'readiness', 'deep'].includes(probe)) {
      return json(400, { status: "error", code: "invalid_probe", request_id: requestId }, requestId, request.method);
    }
    if (probe === "liveness") {
      return json(200, { status: "healthy", probe, service: "volt-beta-health", version: "1", checked_at: now().toISOString(), request_id: requestId }, requestId, request.method);
    }

    let baseUrl;
    try {
      baseUrl = validatedBaseUrl(env("SUPABASE_URL"), env("ALLOW_INSECURE_HEALTH_URL") === "true");
    } catch {
      return json(503, { status: "unhealthy", probe, checks: { configuration: "down" }, request_id: requestId }, requestId, request.method);
    }

    if (probe === "deep") {
      const authorization = request.headers.get("authorization") || "";
      const publicKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY") || "";
      if (!authorization.startsWith("Bearer ") || !publicKey) {
        return json(401, { status: "unauthorized", probe, request_id: requestId }, requestId, request.method);
      }
      let deepResponse;
      try {
        deepResponse = await fetchFn(`${baseUrl}/rest/v1/rpc/beta_admin_health_snapshot`, {
          method: "POST",
          headers: { authorization, apikey: publicKey, "content-type": "application/json", "x-request-id": requestId },
          body: "{}",
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch {
        return json(503, { status: "unhealthy", probe, checks: { auth_database_rbac: "down" }, request_id: requestId }, requestId, request.method);
      }
      if ([401, 403].includes(deepResponse.status)) {
        return json(403, { status: "forbidden", probe, request_id: requestId }, requestId, request.method);
      }
      const deep = deepResponse.ok ? "up" : "down";
      const status = deep === "up" ? 200 : 503;
      return json(status, { status: status === 200 ? "healthy" : "unhealthy", probe, checks: { auth_database_rbac: deep }, duration_ms: Date.now() - startedAt, checked_at: now().toISOString(), request_id: requestId }, requestId, request.method);
    }

    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceKey) {
      return json(503, { status: "unhealthy", probe, checks: { configuration: "down" }, request_id: requestId }, requestId, request.method);
    }
    const headers = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "x-request-id": requestId };
    const [auth, database] = await Promise.all([
      dependencyCheck(fetchFn, `${baseUrl}/auth/v1/health`, { method: "GET", headers }, timeoutMs),
      dependencyCheck(fetchFn, `${baseUrl}/rest/v1/rpc/beta_service_readiness`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" }, timeoutMs)
    ]);
    const healthy = auth === "up" && database === "up";
    return json(healthy ? 200 : 503, { status: healthy ? "healthy" : "unhealthy", probe, checks: { auth, database }, duration_ms: Date.now() - startedAt, checked_at: now().toISOString(), request_id: requestId }, requestId, request.method);
  };
}
