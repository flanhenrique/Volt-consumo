import { EngineEventBus, EngineRegistry, InMemoryFeatureFlags, MemoryEngineLogger, MemoryEngineTelemetry } from "@volt/engine-core";
export function createEngineRuntime(featureFlags = DEFAULT_ENGINE_FLAGS) {
    const eventBus = new EngineEventBus();
    const logger = new MemoryEngineLogger();
    const telemetry = new MemoryEngineTelemetry();
    const flags = new InMemoryFeatureFlags(featureFlags);
    const registry = new EngineRegistry({ eventBus, logger, telemetry, featureFlags: flags });
    return { eventBus, logger, telemetry, flags, registry };
}
const DEFAULT_ENGINE_FLAGS = Object.freeze({
    "engines.calculation": true,
    "engines.rule": true
});
