import { alignReadingsToBillingCycles, calculateConsumptionIndicators, compareInvoiceWithReadings } from "@volt/calculation-engine";
import { createEngineEvent, EngineUnavailableError } from "@volt/engine-core";
import { ConsumptionRuleEngine } from "@volt/rule-engine";
import { createEngineRuntime } from "./runtime.js";
export class ConsumptionEvolutionPlatform {
    #runtime;
    #rules;
    constructor(runtime = createEngineRuntime(), rules = new ConsumptionRuleEngine(runtime.eventBus)) {
        this.#runtime = runtime;
        this.#rules = rules;
    }
    async processReading(input, context) {
        this.#assertEnginesEnabled(context);
        const emittedEvents = [];
        const event = createEngineEvent("reading.registered", "engine-platform", context, input.reading);
        await this.#publish(event, emittedEvents);
        this.#log("info", "Nova leitura recebida pelos motores.", context, {
            readingId: input.reading.id,
            meterId: input.reading.meterId
        });
        const evaluation = await this.#rules.evaluateReading({
            event,
            reading: input.reading,
            history: input.history,
            invoices: input.invoices
        }, context);
        const originalHistory = Object.freeze([...input.history, input.reading]);
        const decisions = [...evaluation.decisions];
        let indicators = null;
        if (evaluation.shouldRecalculate) {
            const calculationContext = createCalculationContext(context, input.precisionScale);
            const calculation = calculateConsumptionIndicators([...originalHistory].sort((left, right) => left.measuredAt.localeCompare(right.measuredAt)), { projectionDays: input.projectionDays }, calculationContext);
            const recalculatedEvent = createEngineEvent("indicators.recalculated", "engine-platform", context, {
                sourceEventId: event.id,
                calculationVersion: calculation.version
            });
            await this.#publish(recalculatedEvent, emittedEvents);
            const finalDecision = await this.#rules.finalizeRecalculation(recalculatedEvent, evaluation.confidence, calculation.version, context);
            decisions.push(finalDecision);
            indicators = Object.freeze({
                id: `${context.correlationId}:indicators`,
                sourceEventId: event.id,
                readingIds: Object.freeze(originalHistory.map(({ id }) => id)),
                cycle: evaluation.cycle,
                calculation,
                createdAt: context.occurredAt
            });
        }
        const statusEvent = createEngineEvent("status.changed", "engine-platform", context, {
            readingId: input.reading.id,
            confidence: evaluation.confidence
        });
        await this.#publish(statusEvent, emittedEvents);
        this.#runtime.telemetry.increment("consumption.reading.processed", {
            confidence: evaluation.confidence,
            reliable: String(evaluation.reliable)
        });
        this.#log("info", "Leitura processada pelos motores.", context, {
            readingId: input.reading.id,
            confidence: evaluation.confidence,
            indicatorsRecalculated: Boolean(indicators)
        });
        return Object.freeze({
            confidence: evaluation.confidence,
            reliable: evaluation.reliable,
            cycle: evaluation.cycle,
            originalHistory,
            indicators,
            decisions: Object.freeze(decisions),
            emittedEvents: Object.freeze(emittedEvents)
        });
    }
    async processInvoice(input, context) {
        this.#assertEnginesEnabled(context);
        const emittedEvents = [];
        const event = createEngineEvent("invoice.registered", "engine-platform", context, input.invoice);
        await this.#publish(event, emittedEvents);
        const calculationContext = createCalculationContext(context, input.precisionScale);
        const comparison = compareInvoiceWithReadings(input.invoice, input.periodReadings, calculationContext);
        const evaluation = await this.#rules.evaluateInvoice({
            event,
            invoice: input.invoice,
            invoices: input.previousInvoices,
            comparison: comparison.result,
            thresholds: input.thresholds
        }, context);
        const validatedEvent = createEngineEvent("invoice.validated", "engine-platform", context, {
            invoiceId: input.invoice.id,
            compatible: evaluation.compatible
        });
        await this.#publish(validatedEvent, emittedEvents);
        const divergence = evaluation.compatible
            ? null
            : Object.freeze({ invoiceId: input.invoice.id, reasons: evaluation.divergenceReasons });
        if (divergence) {
            await this.#publish(createEngineEvent("divergence.found", "engine-platform", context, divergence), emittedEvents);
        }
        const alignedHistory = alignReadingsToBillingCycles(input.completeHistory, input.invoice, calculationContext);
        const reprocessedIndicators = input.previousInvoices.length === 0 && input.completeHistory.length >= 2
            ? calculateConsumptionIndicators([...input.completeHistory].sort((left, right) => left.measuredAt.localeCompare(right.measuredAt)), { projectionDays: input.projectionDays }, calculationContext)
            : null;
        const readingById = new Map(input.completeHistory.map((reading) => [reading.id, reading]));
        const reprocessedPeriods = input.previousInvoices.length === 0
            ? alignedHistory.result
                .map(({ readingIds }) => readingIds.map((readingId) => readingById.get(readingId)).filter((reading) => Boolean(reading)))
                .filter((readings) => readings.length >= 2)
                .map((readings) => calculateConsumptionIndicators(readings, { projectionDays: input.projectionDays }, calculationContext))
            : [];
        if (reprocessedIndicators) {
            await this.#publish(createEngineEvent("indicators.recalculated", "engine-platform", context, {
                sourceEventId: event.id,
                reason: "billing-cycle-discovered",
                calculationVersion: reprocessedIndicators.version
            }), emittedEvents);
        }
        await this.#publish(createEngineEvent("status.changed", "engine-platform", context, {
            invoiceId: input.invoice.id,
            confidence: evaluation.confidence
        }), emittedEvents);
        this.#runtime.telemetry.increment("consumption.invoice.processed", {
            compatible: String(evaluation.compatible),
            confidence: evaluation.confidence
        });
        this.#log("info", "Fatura utilizada como auditoria das leituras.", context, {
            invoiceId: input.invoice.id,
            compatible: evaluation.compatible,
            originalReadingsChanged: false
        });
        return Object.freeze({
            confidence: evaluation.confidence,
            compatible: evaluation.compatible,
            cycle: evaluation.cycle,
            comparison,
            divergence,
            reprocessedIndicators,
            alignedHistory,
            reprocessedPeriods: Object.freeze(reprocessedPeriods),
            decisions: evaluation.decisions,
            emittedEvents: Object.freeze(emittedEvents)
        });
    }
    auditTrail() {
        return this.#rules.auditTrail();
    }
    logs() {
        return this.#runtime.logger.list();
    }
    #assertEnginesEnabled(context) {
        if (!this.#runtime.flags.isEnabled("engines.rule", context)) {
            throw new EngineUnavailableError("rule-engine", "feature flag desativada");
        }
        if (!this.#runtime.flags.isEnabled("engines.calculation", context)) {
            throw new EngineUnavailableError("calculation-engine", "feature flag desativada");
        }
    }
    async #publish(event, emittedEvents) {
        await this.#runtime.eventBus.publish(event);
        emittedEvents.push(event.type);
    }
    #log(level, message, context, details) {
        this.#runtime.logger.write({
            level,
            message,
            engineId: "engine-platform",
            occurredAt: context.occurredAt,
            correlationId: context.correlationId,
            tenantId: context.tenantId,
            details
        });
    }
}
function createCalculationContext(context, precisionScale) {
    return {
        timestamp: context.occurredAt,
        timezone: context.timezone,
        precisionScale
    };
}
