import { createEngineEvent } from "@volt/engine-core";
import { createEngineRuntime } from "./runtime.js";
export * from "./consumption-platform.js";
export * from "./runtime.js";
export class EnginePlatform {
    #runtime;
    constructor(calculationEngine, ruleEngine, runtime = createEngineRuntime()) {
        this.#runtime = runtime;
        this.#runtime.registry.register(calculationEngine);
        this.#runtime.registry.register(ruleEngine);
    }
    async process(event, context) {
        validateWorkflowEvent(event);
        this.#log("info", "Fluxo de motores iniciado.", context, { eventId: event.id, eventType: event.type });
        await this.#runtime.eventBus.publish(createEngineEvent("engine.workflow.started", "engine-platform", context, {
            eventId: event.id,
            eventType: event.type
        }));
        try {
            const calculation = await this.#runtime.registry.execute("calculation-engine", event.calculation, context);
            const numericResult = Number(calculation.output.value);
            const facts = {
                ...event.facts,
                [event.calculationFactName]: Number.isFinite(numericResult) ? numericResult : calculation.output.value
            };
            const ruleInput = event.ruleIds
                ? { facts, ruleIds: event.ruleIds }
                : { facts };
            const rules = await this.#runtime.registry.execute("rule-engine", ruleInput, context);
            const result = {
                eventId: event.id,
                status: "completed",
                calculation: calculation.output,
                rules: rules.output,
                correlationId: context.correlationId
            };
            this.#runtime.telemetry.increment("engine.workflow.completed", { eventType: event.type });
            this.#log("info", "Fluxo de motores concluído.", context, {
                eventId: event.id,
                formulaId: calculation.output.formulaId,
                matchedRules: rules.output.matchedRuleIds.length
            });
            await this.#runtime.eventBus.publish(createEngineEvent("engine.workflow.completed", "engine-platform", context, {
                eventId: event.id,
                status: result.status
            }));
            return result;
        }
        catch (error) {
            const errorName = error instanceof Error ? error.name : "UnknownError";
            this.#runtime.telemetry.increment("engine.workflow.failed", { eventType: event.type, errorName });
            this.#log("error", "Fluxo de motores falhou.", context, { eventId: event.id, errorName });
            await this.#runtime.eventBus.publish(createEngineEvent("engine.workflow.failed", "engine-platform", context, {
                eventId: event.id,
                errorName
            }));
            throw error;
        }
    }
    health() {
        return this.#runtime.registry.health();
    }
    logs() {
        return this.#runtime.logger.list();
    }
    runtime() {
        return this.#runtime;
    }
    #log(level, message, context, details) {
        this.#runtime.logger.write({
            level,
            message,
            engineId: "engine-platform",
            occurredAt: new Date().toISOString(),
            correlationId: context.correlationId,
            tenantId: context.tenantId,
            details
        });
    }
}
function validateWorkflowEvent(event) {
    if (!event.id.trim() || !event.type.trim() || !event.calculationFactName.trim()) {
        throw new Error("Evento do fluxo de motores incompleto.");
    }
    if (!event.calculation.formulaId.trim())
        throw new Error("Cálculo do fluxo sem fórmula.");
}
