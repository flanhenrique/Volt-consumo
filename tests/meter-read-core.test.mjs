import test from "node:test";
import assert from "node:assert/strict";
import { createMeterReadHandler, validateVisionResult } from "../supabase/functions/_shared/meter-read-core.mjs";

test("accepts only confident register 03 kWh candidates", () => {
  assert.deepEqual(validateVisionResult({ register: "03", unit: "kWh", value: 28490, confidence: .94, reason: "ok" }, 28431), {
    status: "suggested",
    value: 28490,
    register: "03",
    unit: "kWh",
    confidence: .94,
    reason: "ok",
    requiresConfirmation: true
  });
});

test("rejects reactive register and low confidence", () => {
  assert.equal(validateVisionResult({ register: "24", unit: "kVArh", value: 10993, confidence: .99, reason: "wrong_register" }).reason, "wrong-register");
  assert.equal(validateVisionResult({ register: "03", unit: "kWh", value: 28490, confidence: .70, reason: "ok" }).reason, "low-confidence");
});

test("rejects readings that go backwards", () => {
  const result = validateVisionResult({ register: "03", unit: "kWh", value: 28425, confidence: .96, reason: "ok" }, 28431);
  assert.equal(result.status, "review");
  assert.equal(result.reason, "reading-decreased");
});

test("rejects test screen and unreadable values", () => {
  assert.equal(validateVisionResult({ register: null, unit: "unknown", value: null, confidence: .2, reason: "test_screen" }).reason, "test-screen");
  assert.equal(validateVisionResult({ register: "03", unit: "kWh", value: null, confidence: .5, reason: "reflection" }).reason, "reflection");
});

test("handler fails closed when API key is absent", async () => {
  const handler = createMeterReadHandler({ env: () => "" });
  const request = new Request("https://edge.test/meter-read", {
    method: "POST",
    headers: { origin: "https://flanhenrique.github.io", "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: "data:image/jpeg;base64,YQ==" })
  });
  const response = await handler(request);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "meter_reader_not_configured");
});

test("handler parses structured provider response and keeps human confirmation", async () => {
  const env = name => ({
    OPENAI_API_KEY: "test-key",
    OPENAI_METER_MODEL: "gpt-5-mini",
    VOLT_APP_ORIGIN: "https://flanhenrique.github.io"
  })[name] || "";
  const fetchFn = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, "json_schema");
    return Response.json({
      output: [{ content: [{ type: "output_text", text: JSON.stringify({ register: "03", unit: "kWh", value: 28490, confidence: .93, reason: "ok" }) }] }]
    });
  };
  const handler = createMeterReadHandler({ env, fetchFn });
  const request = new Request("https://edge.test/meter-read", {
    method: "POST",
    headers: { origin: "https://flanhenrique.github.io", "content-type": "application/json" },
    body: JSON.stringify({ imageDataUrl: "data:image/jpeg;base64,YQ==", previousValue: 28431 })
  });
  const response = await handler(request);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "suggested");
  assert.equal(result.value, 28490);
  assert.equal(result.requiresConfirmation, true);
});
