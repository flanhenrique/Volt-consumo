import OpenAI from "jsr:@openai/openai";
import { validateMeterVision } from "../../meter-read-core.mjs";

const allowedOrigin = Deno.env.get("VOLT_APP_ORIGIN") || "https://flanhenrique.github.io";
const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const schema = {
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
};

Deno.serve(async (request: Request) => {
  const headers = {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405, headers);
  const origin = request.headers.get("origin") || "";
  if (origin && origin !== allowedOrigin) return response({ error: "origin_not_allowed" }, 403, headers);
  if (!openai) return response({ error: "meter_reader_not_configured" }, 503, headers);

  let body: { imageDataUrl?: string };
  try {
    body = await request.json();
  } catch {
    return response({ error: "invalid_json" }, 400, headers);
  }

  const imageDataUrl = String(body.imageDataUrl || "");
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(imageDataUrl)) {
    return response({ error: "invalid_image" }, 400, headers);
  }
  if (imageDataUrl.length > 3_000_000) return response({ error: "image_too_large" }, 413, headers);

  try {
    const result = await openai.responses.create({
      model: Deno.env.get("OPENAI_METER_MODEL") || "gpt-5-mini",
      store: false,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Read only the LCD visible in this electricity-meter crop. Never guess an obscured digit. The valid cumulative screen is register 03 with unit kWh. Register 24 or kVArh is invalid. If this is a segment test screen or any required digit is uncertain because of glare, blur, angle or obstruction, return value null and the appropriate reason. Confidence describes visual certainty only."
          },
          { type: "input_image", image_url: imageDataUrl, detail: "high" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "volt_meter_reading",
          strict: true,
          schema
        }
      }
    });

    const candidate = JSON.parse(result.output_text);
    return response(validateMeterVision(candidate), 200, headers);
  } catch {
    return response({ error: "vision_provider_error" }, 502, headers);
  }
});

function response(value: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(value), { status, headers });
}
