import { createEngineEvent, EngineEventBus, getEngineDefinition } from "@volt/engine-core";
const CALCULATION_ENGINE_DESCRIPTOR = getEngineDefinition("calculation-engine");
const DIVISION_SCALE = 12;
export class FormulaCatalog {
    #formulas = new Map();
    register(formula) {
        validateFormula(formula);
        const versions = this.#formulas.get(formula.id) ?? new Map();
        if (versions.has(formula.version))
            throw new Error(`Fórmula ${formula.id} v${formula.version} já registrada.`);
        versions.set(formula.version, deepFreeze(formula));
        this.#formulas.set(formula.id, versions);
    }
    resolve(formulaId, version) {
        const versions = this.#formulas.get(formulaId);
        if (!versions?.size)
            throw new Error(`Fórmula ${formulaId} não registrada.`);
        const selectedVersion = version ?? Math.max(...versions.keys());
        const formula = versions.get(selectedVersion);
        if (!formula)
            throw new Error(`Fórmula ${formulaId} v${selectedVersion} não registrada.`);
        if (!formula.enabled)
            throw new Error(`Fórmula ${formulaId} v${selectedVersion} desativada.`);
        return formula;
    }
}
export class CalculationEngine {
    descriptor = CALCULATION_ENGINE_DESCRIPTOR;
    #catalog;
    #eventBus;
    #cache = new Map();
    #audit = [];
    constructor(dependencies = {}) {
        this.#catalog = dependencies.catalog ?? new FormulaCatalog();
        this.#eventBus = dependencies.eventBus ?? new EngineEventBus();
    }
    register(formula) {
        this.#catalog.register(formula);
    }
    auditTrail() {
        return [...this.#audit];
    }
    clearCache() {
        this.#cache.clear();
    }
    async execute(input, context) {
        const formula = this.#catalog.resolve(input.formulaId, input.formulaVersion);
        const cacheKey = createCacheKey(formula, input.values);
        const cached = this.#cache.get(cacheKey);
        const baseOutput = cached ?? {
            formulaId: formula.id,
            formulaVersion: formula.version,
            value: evaluateFormula(formula.expression, input.values).toString(),
            unit: formula.unit
        };
        if (!cached)
            this.#cache.set(cacheKey, baseOutput);
        const output = { ...baseOutput, cached: Boolean(cached) };
        this.#audit.push(Object.freeze({
            formulaId: formula.id,
            formulaVersion: formula.version,
            tenantId: context.tenantId,
            userId: context.userId,
            correlationId: context.correlationId,
            occurredAt: new Date().toISOString(),
            result: output.value,
            cached: output.cached
        }));
        await this.#eventBus.publish(createEngineEvent(output.cached ? "calculation.cache.hit" : "calculation.executed", "calculation-engine", context, { formulaId: formula.id, formulaVersion: formula.version, result: output.value }));
        return {
            engineId: "calculation-engine",
            engineVersion: this.descriptor.version,
            correlationId: context.correlationId,
            output
        };
    }
}
class DecimalValue {
    coefficient;
    scale;
    constructor(coefficient, scale) {
        if (!Number.isInteger(scale) || scale < 0)
            throw new Error("Escala decimal inválida.");
        const normalized = normalize(coefficient, scale);
        this.coefficient = normalized.coefficient;
        this.scale = normalized.scale;
    }
    static parse(value) {
        const source = String(value).trim();
        if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(source))
            throw new Error(`Valor decimal inválido: ${source}.`);
        const sign = source.startsWith("-") ? -1n : 1n;
        const unsigned = source.replace(/^[+-]/, "");
        const [integer = "0", fraction = ""] = unsigned.split(".");
        return new DecimalValue(sign * BigInt(`${integer || "0"}${fraction}`), fraction.length);
    }
    add(other) {
        const scale = Math.max(this.scale, other.scale);
        return new DecimalValue(this.coefficient * pow10(scale - this.scale) + other.coefficient * pow10(scale - other.scale), scale);
    }
    subtract(other) {
        return this.add(new DecimalValue(-other.coefficient, other.scale));
    }
    multiply(other) {
        return new DecimalValue(this.coefficient * other.coefficient, this.scale + other.scale);
    }
    compare(other) {
        const scale = Math.max(this.scale, other.scale);
        const left = this.coefficient * pow10(scale - this.scale);
        const right = other.coefficient * pow10(scale - other.scale);
        return left < right ? -1 : left > right ? 1 : 0;
    }
    divide(other, scale = DIVISION_SCALE) {
        if (other.coefficient === 0n)
            throw new Error("Divisão por zero.");
        const numerator = this.coefficient * pow10(other.scale + scale);
        const denominator = other.coefficient * pow10(this.scale);
        return new DecimalValue(divideHalfEven(numerator, denominator), scale);
    }
    round(scale) {
        if (!Number.isInteger(scale) || scale < 0 || scale > 12)
            throw new Error("Escala de arredondamento inválida.");
        if (scale >= this.scale)
            return this;
        return new DecimalValue(divideHalfEven(this.coefficient, pow10(this.scale - scale)), scale);
    }
    toString() {
        const negative = this.coefficient < 0n;
        const digits = (negative ? -this.coefficient : this.coefficient).toString().padStart(this.scale + 1, "0");
        const integer = this.scale === 0 ? digits : digits.slice(0, -this.scale);
        const fraction = this.scale === 0 ? "" : digits.slice(-this.scale);
        return `${negative ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
    }
}
export function calculateConsumptionIndicators(readings, parameters, context) {
    assertCalculationContext(context);
    if (readings.length < 2)
        throw new Error("Ao menos duas leituras validadas são necessárias para calcular indicadores.");
    if (!Number.isInteger(parameters.projectionDays) || parameters.projectionDays <= 0) {
        throw new Error("Período de projeção inválido.");
    }
    const first = readings[0];
    const last = readings.at(-1);
    const consumption = DecimalValue.parse(last.value).subtract(DecimalValue.parse(first.value));
    const elapsedMilliseconds = parseTimestamp(last.measuredAt) - parseTimestamp(first.measuredAt);
    if (elapsedMilliseconds <= 0)
        throw new Error("Intervalo de cálculo deve ser positivo.");
    const elapsedDays = DecimalValue.parse(elapsedMilliseconds).divide(DecimalValue.parse(86400000));
    const dailyAverage = consumption.divide(elapsedDays);
    const projectedConsumption = dailyAverage.multiply(DecimalValue.parse(parameters.projectionDays));
    const intervalRates = calculateIntervalDailyRates(readings);
    const firstRate = intervalRates[0];
    const lastRate = intervalRates.at(-1);
    const trendPerDay = lastRate.subtract(firstRate);
    const trendPercent = firstRate.coefficient === 0n
        ? DecimalValue.parse(0)
        : trendPerDay.divide(firstRate).multiply(DecimalValue.parse(100));
    const minimumDailyConsumption = intervalRates.reduce((minimum, current) => current.compare(minimum) < 0 ? current : minimum, firstRate);
    const maximumDailyConsumption = intervalRates.reduce((maximum, current) => current.compare(maximum) > 0 ? current : maximum, firstRate);
    const scale = context.precisionScale;
    return deepFreeze({
        result: {
            consumption: consumption.round(scale).toString(),
            elapsedDays: elapsedDays.round(scale).toString(),
            dailyAverage: dailyAverage.round(scale).toString(),
            projectedConsumption: projectedConsumption.round(scale).toString(),
            trendPerDay: trendPerDay.round(scale).toString(),
            trendPercent: trendPercent.round(scale).toString(),
            minimumDailyConsumption: minimumDailyConsumption.round(scale).toString(),
            maximumDailyConsumption: maximumDailyConsumption.round(scale).toString(),
            intervalCount: intervalRates.length
        },
        precision: { scale, rounding: "half-even" },
        version: "consumption-indicators@1.0.0",
        timestamp: context.timestamp,
        metadata: {
            readingCount: readings.length,
            projectionDays: parameters.projectionDays,
            timezone: context.timezone
        }
    });
}
export function compareInvoiceWithReadings(invoice, readings, context) {
    assertCalculationContext(context);
    if (readings.length < 2)
        throw new Error("Ao menos duas leituras validadas são necessárias para comparar a fatura.");
    const first = readings[0];
    const last = readings.at(-1);
    const calculatedConsumption = DecimalValue.parse(last.value).subtract(DecimalValue.parse(first.value));
    const hours = DecimalValue.parse(3600000);
    const scale = context.precisionScale;
    const result = {
        consumptionDifference: calculatedConsumption.subtract(DecimalValue.parse(invoice.consumption)).round(scale).toString(),
        initialReadingDifference: DecimalValue.parse(first.value).subtract(DecimalValue.parse(invoice.initialReading)).round(scale).toString(),
        finalReadingDifference: DecimalValue.parse(last.value).subtract(DecimalValue.parse(invoice.finalReading)).round(scale).toString(),
        periodStartDifferenceHours: DecimalValue.parse(parseTimestamp(first.measuredAt) - parseTimestamp(invoice.periodStart))
            .divide(hours).round(scale).toString(),
        periodEndDifferenceHours: DecimalValue.parse(parseTimestamp(last.measuredAt) - parseTimestamp(invoice.periodEnd))
            .divide(hours).round(scale).toString()
    };
    return deepFreeze({
        result,
        precision: { scale, rounding: "half-even" },
        version: "invoice-comparison@1.0.0",
        timestamp: context.timestamp,
        metadata: {
            invoiceId: invoice.id,
            meterId: invoice.meterId,
            readingCount: readings.length,
            timezone: context.timezone
        }
    });
}
export function alignReadingsToBillingCycles(readings, referenceInvoice, context) {
    assertCalculationContext(context);
    const referenceStart = parseTimestamp(referenceInvoice.periodStart);
    const referenceEnd = parseTimestamp(referenceInvoice.periodEnd);
    const cycleDuration = referenceEnd - referenceStart;
    if (cycleDuration <= 0)
        throw new Error("Período de referência da fatura inválido.");
    const groups = new Map();
    for (const reading of readings) {
        const measuredAt = parseTimestamp(reading.measuredAt);
        const difference = measuredAt - referenceStart;
        const index = difference >= 0
            ? Math.max(0, Math.ceil(difference / cycleDuration) - 1)
            : -Math.ceil(Math.abs(difference) / cycleDuration);
        const readingIds = groups.get(index) ?? [];
        readingIds.push(reading.id);
        groups.set(index, readingIds);
    }
    const windows = [...groups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([index, readingIds]) => Object.freeze({
        index,
        periodStart: new Date(referenceStart + index * cycleDuration).toISOString(),
        periodEnd: new Date(referenceEnd + index * cycleDuration).toISOString(),
        readingIds: Object.freeze([...readingIds])
    }));
    return deepFreeze({
        result: windows,
        precision: { scale: 0, rounding: "half-even" },
        version: "billing-cycle-alignment@1.0.0",
        timestamp: context.timestamp,
        metadata: {
            invoiceId: referenceInvoice.id,
            readingCount: readings.length,
            cycleDurationHours: cycleDuration / 3600000,
            timezone: context.timezone
        }
    });
}
function calculateIntervalDailyRates(readings) {
    const rates = [];
    for (let index = 1; index < readings.length; index += 1) {
        const previous = readings[index - 1];
        const current = readings[index];
        const elapsedMilliseconds = parseTimestamp(current.measuredAt) - parseTimestamp(previous.measuredAt);
        if (elapsedMilliseconds <= 0)
            throw new Error("Intervalo de leitura deve ser positivo.");
        const difference = DecimalValue.parse(current.value).subtract(DecimalValue.parse(previous.value));
        const elapsedDays = DecimalValue.parse(elapsedMilliseconds).divide(DecimalValue.parse(86400000));
        rates.push(difference.divide(elapsedDays));
    }
    return rates;
}
function assertCalculationContext(context) {
    if (!Number.isFinite(Date.parse(context.timestamp)))
        throw new Error("Timestamp de cálculo inválido.");
    if (!context.timezone.trim())
        throw new Error("Timezone de cálculo obrigatório.");
    if (!Number.isInteger(context.precisionScale) || context.precisionScale < 0 || context.precisionScale > 12) {
        throw new Error("Precisão de cálculo inválida.");
    }
}
function parseTimestamp(value) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed))
        throw new Error(`Timestamp inválido: ${value}.`);
    return parsed;
}
function evaluateFormula(expression, values) {
    switch (expression.op) {
        case "input": {
            const value = values[expression.name];
            if (value === undefined)
                throw new Error(`Entrada ${expression.name} ausente.`);
            return DecimalValue.parse(value);
        }
        case "constant": return DecimalValue.parse(expression.value);
        case "add": return evaluateFormula(expression.left, values).add(evaluateFormula(expression.right, values));
        case "subtract": return evaluateFormula(expression.left, values).subtract(evaluateFormula(expression.right, values));
        case "multiply": return evaluateFormula(expression.left, values).multiply(evaluateFormula(expression.right, values));
        case "divide": return evaluateFormula(expression.left, values).divide(evaluateFormula(expression.right, values));
        case "round": return evaluateFormula(expression.value, values).round(expression.scale);
    }
}
function validateFormula(formula) {
    if (!formula.id.trim() || !formula.name.trim() || !formula.unit.trim())
        throw new Error("Metadados da fórmula incompletos.");
    if (!Number.isInteger(formula.version) || formula.version <= 0)
        throw new Error("Versão da fórmula inválida.");
    validateExpression(formula.expression);
}
function validateExpression(expression) {
    switch (expression.op) {
        case "input":
            if (!expression.name.trim())
                throw new Error("Nome da entrada obrigatório.");
            return;
        case "constant":
            DecimalValue.parse(expression.value);
            return;
        case "round":
            if (!Number.isInteger(expression.scale) || expression.scale < 0 || expression.scale > 12) {
                throw new Error("Escala de arredondamento inválida.");
            }
            validateExpression(expression.value);
            return;
        case "add":
        case "subtract":
        case "multiply":
        case "divide":
            validateExpression(expression.left);
            validateExpression(expression.right);
    }
}
function createCacheKey(formula, values) {
    const normalizedValues = Object.entries(values)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${DecimalValue.parse(value).toString()}`)
        .join("|");
    return `${formula.id}@${formula.version}|${normalizedValues}`;
}
function normalize(coefficient, scale) {
    let nextCoefficient = coefficient;
    let nextScale = scale;
    while (nextScale > 0 && nextCoefficient % 10n === 0n) {
        nextCoefficient /= 10n;
        nextScale -= 1;
    }
    return { coefficient: nextCoefficient, scale: nextScale };
}
function divideHalfEven(numerator, denominator) {
    const negative = (numerator < 0n) !== (denominator < 0n);
    const absoluteNumerator = numerator < 0n ? -numerator : numerator;
    const absoluteDenominator = denominator < 0n ? -denominator : denominator;
    const quotient = absoluteNumerator / absoluteDenominator;
    const remainder = absoluteNumerator % absoluteDenominator;
    const doubled = remainder * 2n;
    const rounded = doubled > absoluteDenominator || (doubled === absoluteDenominator && quotient % 2n !== 0n)
        ? quotient + 1n
        : quotient;
    return negative ? -rounded : rounded;
}
function pow10(exponent) {
    if (!Number.isInteger(exponent) || exponent < 0)
        throw new Error("Expoente decimal inválido.");
    return 10n ** BigInt(exponent);
}
function deepFreeze(value) {
    if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach((child) => deepFreeze(child));
    }
    return value;
}
//# sourceMappingURL=index.js.map