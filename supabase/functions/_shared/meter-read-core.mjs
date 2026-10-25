const RESPONSE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    register: { type: ["string", "null"] },
    unit: { type: "string", enum: ["kWh", "kVArh", "unknown"] },
    value: { type: ["integer", "null"], minimum: 0 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", enum: ["ok", "wrong_register", "test_screen", "reflection", "blur", "unreadable"] }
  },
  required: ["register", "unit", "value", "confidence", "reason"]
});

const INSTRUCTION = [
  "You are reading the LCD crop of an electricity meter, usually a Cronos 7023.",
  "Read only characters that are visibly present on the LCD. Never infer or repair an obscured digit.",
  "The valid cumulative consumption screen is register 03 with unit kWh.",
  "Register 24 or unit kVArh is not a valid consumption reading.",
  "If the display is a segment/test screen, use reason test_screen.",
  "If glare, blur or obstruction makes any required digit uncertain, return value null and the matching reason.",
  "Confidence must reflect visual certainty, not plausibility of the number."
].join(" ");

export function createMeterReadHandler({ env, fetchFn = fetch }) {
  return async function meterReadHandler(request) {
    const origin = request.headers.get("origin") || "";
    const allowedOrigin = env("VOLT_APP_ORIGIN") || "https://flanhenrique.github.io";
    const headers = corsHeaders(origin, allowedOrigin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, headers);
    if (origin && origin !== allowedOrigin) return json({ error: "origin_not_allowed" }, 403, headers);

    const apiKey = env("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "meter_reader_not_configured" }, 503, headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, headers);
    }

    const imageDataUrl = String(body?.imageDataUrl || "");
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageDataUrl)) {
      return json({ error: "invalid_image" }, 400, headers);
    }
    if (imageDataUrl.length > 3_000_000) return json({ error: "image_too_large" }, 413, headers);

    const previousValue = body?.previousValue === null || body?.previousValue === undefined ? null : Number(body.previousValue);
    if (previousValue !== null && (!Number.isFinite(previousValue) || previousValue < 0)) {
      return json({ error: "invalid_previous_value" }, 400, headers);
    }

    const response = await fetchFn("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: env("OPENAI_METER_MODEL") || "gpt-5-mini",
        store: false,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: INSTRUCTION },
            { type: "input_image", image_url: imageDataUrl, detail: "high" }
          ]
        }],
        text: {
          format: {
            type: "json_schema",
            name: "volt_meter_reading",
            strict: true,
            schema: RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!response.ok) {
      const requestId = response.headers.get("x-request-id") || null;
      return json({ error: "vision_provider_error", status: response.status, requestId }, 502, headers);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return json({ error: "vision_invalid_response" }, 502, headers);
    }

    const outputText = extractOutputText(payload);
    if (!outputText) return json({ error: "vision_empty_response" }, 502, headers);

    let candidate;
    try {
      candidate = JSON.parse(outputText);
    } catch {
      return json({ error: "vision_invalid_json" }, 502, headers);
    }

    const result = validateVisionResult(candidate, previousValue);
    return json(result, 200, headers);
  };
}

export function validateVisionResult(candidate, previousValue = null) {
  const register = typeof candidate?.register === "string" ? candidate.register.trim().padStart(2, "0") : null;
  const unit = ["kWh", "kVArh", "unknown"].includes(candidate?.unit) ? candidate.unit : "unknown";
  const value = Number.isInteger(candidate?.value) && candidate.value >= 0 ? candidate.value : null;
  const confidence = Number.isFinite(candidate?.confidence) ? Math.max(0, Math.min(1, Number(candidate.confidence))) : 0;
  const providerReason = String(candidate?.reason || "unreadable");

  if (providerReason === "test_screen") return review("test-screen", register, unit, confidence);
  if (register !== "03" || unit !== "kWh") return review("wrong-register", register, unit, confidence);
  if (value === null) return review(providerReason === "reflection" ? "reflection" : providerReason === "blur" ? "blur" : "unreadable", register, unit, confidence);
  if (confidence < .82) return review("low-confidence", register, unit, confidence, value);
  if (previousValue !== null && Number.isFinite(Number(previousValue)) && value < Number(previousValue)) {
    return review("reading-decreased", register, unit, confidence, value);
  }

  return {
    status: "suggested",
    value,
    register: "03",
    unit: "kWh",
    confidence,
    reason: "ok",
    requiresConfirmation: true
  };
}

function review(reason, register, unit, confidence, value = null) {
  return {
    status: "review",
    value,
    register,
    unit,
    confidence,
    reason,
    requiresConfirmation: true
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function corsHeaders(origin, allowedOrigin) {
  return {
    "access-control-allow-origin": origin === allowedOrigin ? allowedOrigin : allowedOrigin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    vary: "Origin"
  };
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, "content-type": "application/json; charset=utf-8" }
  });
}
