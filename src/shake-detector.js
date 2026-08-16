const DEFAULT_OPTIONS = Object.freeze({
  threshold: 22,
  hitsRequired: 3,
  windowMs: 850,
  minGapMs: 70,
  cooldownMs: 4500
});

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function createShakeDetector(options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  let previous = null;
  let hits = [];
  let lastHitAt = -Infinity;
  let cooldownUntil = -Infinity;

  function reset() {
    previous = null;
    hits = [];
    lastHitAt = -Infinity;
    cooldownUntil = -Infinity;
  }

  function sample(input = {}) {
    const x = finite(input.x);
    const y = finite(input.y);
    const z = finite(input.z);
    const at = finite(input.at) ?? Date.now();
    if (x === null || y === null || z === null) return false;

    const current = { x, y, z };
    if (!previous) {
      previous = current;
      return false;
    }

    const impulse = Math.abs(x - previous.x) + Math.abs(y - previous.y) + Math.abs(z - previous.z);
    previous = current;

    if (at < cooldownUntil || impulse < settings.threshold) return false;
    if (at - lastHitAt < settings.minGapMs) return false;

    hits = hits.filter((timestamp) => at - timestamp <= settings.windowMs);
    hits.push(at);
    lastHitAt = at;

    if (hits.length < settings.hitsRequired) return false;

    hits = [];
    cooldownUntil = at + settings.cooldownMs;
    return true;
  }

  return Object.freeze({ sample, reset });
}
