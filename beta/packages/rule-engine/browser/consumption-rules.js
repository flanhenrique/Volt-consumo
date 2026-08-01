import { createEngineEvent, EngineEventBus } from "@volt/engine-core";
export class ConsumptionRuleEngine {
    #eventBus;
    #audit = [];
    constructor(eventBus = new EngineEventBus()) {
        this.#eventBus = eventBus;
    }
    auditTrail() {
        return [...this.#audit];
    }
    async evaluateReading(input, context) {
        if (input.event.type !== "reading.registered" && input.event.type !== "reading.changed") {
            throw new Error(`Evento ${input.event.type} não é compatível com validação de leitura.`);
        }
        const decisions = [];
        const cycle = await this.#discoverCycle(input.event, input.invoices, context, decisions);
        const reasons = validateReading(input.reading, input.history);
        const reliable = reasons.length === 0;
        const confidence = reliable
            ? cycle.status === "known" ? "reliable" : "learning-cycle"
            : "low-confidence";
        await this.#record({
            ruleId: "RULE-001",
            context,
            event: input.event,
            reason: reliable ? "Leitura cronológica, crescente e sem inconsistências básicas." : reasons.join("; "),
            action: "update-status",
            result: { reliable, confidence }
        }, decisions);
        if (reliable) {
            await this.#record({
                ruleId: "RULE-002",
                context,
                event: input.event,
                reason: "Leitura confiável; indicadores derivados devem ser recalculados sem alterar o histórico.",
                action: "recalculate-indicators",
                result: { requested: true }
            }, decisions);
        }
        await this.#recordTrace(input.event, context, decisions);
        return deepFreeze({
            confidence,
            reliable,
            cycle,
            shouldRecalculate: reliable,
            reasons,
            decisions
        });
    }
    async evaluateInvoice(input, context) {
        if (input.event.type !== "invoice.registered" && input.event.type !== "invoice.validated") {
            throw new Error(`Evento ${input.event.type} não é compatível com validação de fatura.`);
        }
        assertThresholds(input.thresholds);
        const decisions = [];
        const cycle = await this.#discoverCycle(input.event, [...input.invoices, input.invoice], context, decisions);
        const divergenceReasons = compareAgainstThresholds(input.comparison, input.thresholds);
        const compatible = divergenceReasons.length === 0;
        await this.#record({
            ruleId: "RULE-003",
            context,
            event: input.event,
            reason: compatible
                ? "Fatura compatível com as leituras registradas; os dados foram apenas conferidos."
                : `Fatura divergente: ${divergenceReasons.join("; ")}`,
            action: compatible ? "update-status" : "create-divergence",
            result: { compatible, confidence: compatible ? "verified" : "reliable" }
        }, decisions);
        await this.#recordTrace(input.event, context, decisions);
        return deepFreeze({
            confidence: compatible ? "verified" : "reliable",
            compatible,
            cycle,
            divergenceReasons,
            decisions
        });
    }
    async finalizeRecalculation(event, confidence, calculationVersion, context) {
        const decisions = [];
        await this.#record({
            ruleId: "RULE-002",
            context,
            event,
            reason: "Indicadores derivados recalculados; histórico original preservado.",
            action: "update-status",
            result: { confidence, calculationVersion, historicalRecordsChanged: false }
        }, decisions);
        return decisions[0];
    }
    async #discoverCycle(event, invoices, context, decisions) {
        const firstInvoice = [...invoices].sort((left, right) => left.registeredAt.localeCompare(right.registeredAt))[0];
        const cycle = firstInvoice
            ? {
                status: "known",
                periodStartDay: dayOfMonth(firstInvoice.periodStart),
                periodEndDay: dayOfMonth(firstInvoice.periodEnd),
                closingDay: dayOfMonth(firstInvoice.closingDate),
                sourceInvoiceId: firstInvoice.id
            }
            : {
                status: "unknown",
                periodStartDay: null,
                periodEndDay: null,
                closingDay: null,
                sourceInvoiceId: null
            };
        await this.#record({
            ruleId: "RULE-000",
            context,
            event,
            reason: firstInvoice
                ? "Primeira fatura disponível; ciclo identificado e histórico derivado deve ser reprocessado."
                : "Nenhuma fatura oficial disponível; o Volt permanece aprendendo o ciclo sem penalizar os dados.",
            action: firstInvoice ? "reprocess-history" : "learn-cycle",
            result: {
                cycleStatus: cycle.status,
                sourceInvoiceId: cycle.sourceInvoiceId,
                periodStartDay: cycle.periodStartDay,
                periodEndDay: cycle.periodEndDay,
                closingDay: cycle.closingDay
            }
        }, decisions);
        return cycle;
    }
    async #recordTrace(event, context, decisions) {
        await this.#record({
            ruleId: "RULE-004",
            context,
            event,
            reason: "Decisões vinculadas ao usuário, tenant, evento e correlação.",
            action: "none",
            result: { tracedDecisions: decisions.length }
        }, decisions);
    }
    async #record(input, decisions) {
        const decision = deepFreeze({
            ruleId: input.ruleId,
            ruleVersion: "1.0.0",
            executedAt: input.context.occurredAt,
            userId: input.context.userId,
            tenantId: input.context.tenantId,
            reason: input.reason,
            event: { id: input.event.id, type: input.event.type },
            action: input.action,
            result: input.result
        });
        this.#audit.push(decision);
        decisions.push(decision);
        await this.#eventBus.publish(createEngineEvent("rule.decision.recorded", "rule-engine", input.context, decision));
    }
}
function validateReading(reading, history) {
    const reasons = [];
    if (!reading.id.trim() || !reading.meterId.trim())
        reasons.push("identificação da leitura incompleta");
    if (!isNonNegativeDecimal(reading.value))
        reasons.push("valor da leitura inválido");
    if (!Number.isFinite(Date.parse(reading.measuredAt)) || !Number.isFinite(Date.parse(reading.recordedAt))) {
        reasons.push("data da leitura inválida");
    }
    const previous = [...history]
        .filter(({ meterId }) => meterId === reading.meterId)
        .sort((left, right) => left.measuredAt.localeCompare(right.measuredAt))
        .at(-1);
    if (previous && Date.parse(reading.measuredAt) <= Date.parse(previous.measuredAt)) {
        reasons.push("sequência cronológica inválida");
    }
    if (previous && isNonNegativeDecimal(reading.value) && compareDecimalStrings(reading.value, previous.value) <= 0) {
        reasons.push("leitura deve ser maior que a anterior");
    }
    return reasons;
}
function compareAgainstThresholds(comparison, thresholds) {
    const reasons = [];
    if (absoluteNumber(comparison.consumptionDifference) > thresholds.consumption)
        reasons.push("consumo divergente");
    if (absoluteNumber(comparison.initialReadingDifference) > thresholds.reading)
        reasons.push("leitura inicial divergente");
    if (absoluteNumber(comparison.finalReadingDifference) > thresholds.reading)
        reasons.push("leitura final divergente");
    if (absoluteNumber(comparison.periodStartDifferenceHours) > thresholds.periodHours)
        reasons.push("início do período divergente");
    if (absoluteNumber(comparison.periodEndDifferenceHours) > thresholds.periodHours)
        reasons.push("fim do período divergente");
    return reasons;
}
function assertThresholds(thresholds) {
    if ([thresholds.consumption, thresholds.reading, thresholds.periodHours]
        .some((value) => !Number.isFinite(value) || value < 0)) {
        throw new Error("Limites de comparação da fatura inválidos.");
    }
}
function dayOfMonth(value) {
    const match = /^\d{4}-\d{2}-(\d{2})/.exec(value);
    if (!match?.[1])
        throw new Error(`Data de ciclo inválida: ${value}.`);
    return Number(match[1]);
}
function isNonNegativeDecimal(value) {
    return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}
function compareDecimalStrings(left, right) {
    const [leftInteger = "0", leftFraction = ""] = left.split(".");
    const [rightInteger = "0", rightFraction = ""] = right.split(".");
    const integerLength = Math.max(leftInteger.length, rightInteger.length);
    const fractionLength = Math.max(leftFraction.length, rightFraction.length);
    const normalizedLeft = `${leftInteger.padStart(integerLength, "0")}${leftFraction.padEnd(fractionLength, "0")}`;
    const normalizedRight = `${rightInteger.padStart(integerLength, "0")}${rightFraction.padEnd(fractionLength, "0")}`;
    return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}
function absoluteNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        throw new Error(`Métrica de comparação inválida: ${value}.`);
    return Math.abs(parsed);
}
function deepFreeze(value) {
    if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach((child) => deepFreeze(child));
    }
    return value;
}
//# sourceMappingURL=consumption-rules.js.map