import assert from "node:assert/strict";
import { createShakeDetector } from "../src/shake-detector.js";

const detector = createShakeDetector({ threshold: 10, hitsRequired: 3, windowMs: 500, minGapMs: 50, cooldownMs: 1000 });

assert.equal(detector.sample({ x: 0, y: 0, z: 0, at: 0 }), false);
assert.equal(detector.sample({ x: 12, y: 0, z: 0, at: 100 }), false);
assert.equal(detector.sample({ x: -12, y: 0, z: 0, at: 200 }), false);
assert.equal(detector.sample({ x: 12, y: 0, z: 0, at: 300 }), true);
assert.equal(detector.sample({ x: -12, y: 0, z: 0, at: 400 }), false, "cooldown blocks a duplicate trigger");

const quiet = createShakeDetector({ threshold: 10, hitsRequired: 3, windowMs: 500 });
quiet.sample({ x: 0, y: 0, z: 0, at: 0 });
assert.equal(quiet.sample({ x: 1, y: 1, z: 1, at: 100 }), false);
assert.equal(quiet.sample({ x: 2, y: 2, z: 2, at: 200 }), false);
assert.equal(quiet.sample({ x: 3, y: 3, z: 3, at: 300 }), false);

console.log("shake-detector tests passed");
