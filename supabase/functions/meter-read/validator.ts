export function validateMeterVision(candidate: Record<string, unknown>) {
  const register = typeof candidate.register === "string" ? candidate.register.trim().padStart(2, "0") : null;
  const unit = ["kWh", "kVArh", "unknown"].includes(String(candidate.unit)) ? String(candidate.unit) : "unknown";
  const value = Number.isInteger(candidate.value) && Number(candidate.value) >= 0 ? Number(candidate.value) : null;
  const rawConfidence = Number(candidate.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0;
  const reason = String(candidate.reason || "unreadable");

  if (reason === "test_screen") return review("test-screen", register, unit, confidence);
  if (register !== "03" || unit !== "kWh") return review("wrong-register", register, unit, confidence);
  if (value === null) return review(reason === "reflection" ? "reflection" : reason === "blur" ? "blur" : "unreadable", register, unit, confidence);
  if (confidence < .82) return review("low-confidence", register, unit, confidence, value);
  return { status: "suggested", value, register: "03", unit: "kWh", confidence, reason: "ok", requiresConfirmation: true };
}

function review(reason: string, register: string | null, unit: string, confidence: number, value: number | null = null) {
  return { status: "review", value, register, unit, confidence, reason, requiresConfirmation: true };
}
