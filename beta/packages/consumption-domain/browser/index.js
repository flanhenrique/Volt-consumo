const MILLISECONDS_PER_DAY = 86400000;
const MILLISECONDS_PER_HOUR = 3600000;
function finiteOrZero(value) {
    return Number.isFinite(value) ? value : 0;
}
function nonNegative(value) {
    return Math.max(0, finiteOrZero(value));
}
function elapsedMilliseconds(firstDate, lastDate) {
    const first = Date.parse(firstDate);
    const last = Date.parse(lastDate);
    if (!Number.isFinite(first) || !Number.isFinite(last))
        return 0;
    return Math.max(0, last - first);
}
function roundHalfEven(value, decimalPlaces) {
    const factor = 10 ** decimalPlaces;
    const scaled = value * factor;
    const integer = Math.floor(scaled);
    const fraction = scaled - integer;
    if (Math.abs(fraction - 0.5) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4) {
        return (integer % 2 === 0 ? integer : integer + 1) / factor;
    }
    return Math.round(scaled) / factor;
}
export function validateMeterReadings(readings) {
    for (let index = 0; index < readings.length; index += 1) {
        const current = readings[index];
        if (!current || !Number.isFinite(current.value) || current.value < 0 || !Number.isFinite(Date.parse(current.date))) {
            return { valid: false, errorCode: "SCHEMA_INVALIDO" };
        }
        const previous = readings[index - 1];
        if (previous && (Date.parse(current.date) <= Date.parse(previous.date) || current.value < previous.value)) {
            return { valid: false, errorCode: "INCOERENCIA_TEMPORAL" };
        }
    }
    return { valid: true, errorCode: null };
}
export function calculateConsumptionSummary(readings) {
    const validation = validateMeterReadings(readings);
    if (!validation.valid) {
        return {
            valid: false,
            errorCode: validation.errorCode,
            first: Number.isFinite(readings.at(0)?.value) ? readings.at(0)?.value ?? null : null,
            last: Number.isFinite(readings.at(-1)?.value) ? readings.at(-1)?.value ?? null : null,
            consumption: null,
            elapsedDays: null,
            dailyAverage: null
        };
    }
    const first = readings.at(0)?.value ?? 0;
    const last = readings.at(-1)?.value ?? first;
    const consumption = roundHalfEven(last - first, 3);
    const elapsed = readings.length > 1
        ? elapsedMilliseconds(readings.at(0)?.date ?? "", readings.at(-1)?.date ?? "")
        : MILLISECONDS_PER_DAY;
    const elapsedDays = Math.max(1, elapsed / MILLISECONDS_PER_DAY);
    return {
        valid: true,
        errorCode: null,
        first: finiteOrZero(first),
        last: finiteOrZero(last),
        consumption,
        elapsedDays,
        dailyAverage: consumption / elapsedDays
    };
}
export function calculateGoalProgress(consumption, goal) {
    if (!Number.isFinite(goal) || goal <= 0)
        return 0;
    return Math.min(100, Math.round(nonNegative(consumption) / goal * 100));
}
/**
 * Baseline linear do PWA legado.
 *
 * Esta função caracteriza o comportamento existente durante a migração
 * Strangler. Ela não implementa nem certifica o forecast oficial do PRD-008,
 * que exige baseline, backtesting, versionamento e intervalo calibrado.
 */
export function forecastLegacyLinear(readings, cycleDays = 30) {
    const validation = validateMeterReadings(readings);
    if (!validation.valid) {
        return {
            valid: false,
            errorCode: validation.errorCode,
            usage: 0,
            confidence: "baixa",
            uncertainty: 0.3
        };
    }
    if (readings.length < 2 || !Number.isFinite(cycleDays) || cycleDays <= 0) {
        return { valid: true, errorCode: null, usage: 0, confidence: "baixa", uncertainty: 0.3 };
    }
    const recent = readings.slice(-8);
    const elapsedDays = elapsedMilliseconds(recent.at(0)?.date ?? "", recent.at(-1)?.date ?? "")
        / MILLISECONDS_PER_DAY;
    const usage = nonNegative((recent.at(-1)?.value ?? 0) - (recent.at(0)?.value ?? 0));
    const daily = elapsedDays > 0 ? usage / elapsedDays : 0;
    const confidence = recent.length >= 6 && elapsedDays >= 14
        ? "alta"
        : recent.length >= 3 && elapsedDays >= 5
            ? "média"
            : "baixa";
    return {
        valid: true,
        errorCode: null,
        usage: nonNegative(daily * cycleDays),
        confidence,
        uncertainty: confidence === "alta" ? 0.1 : confidence === "média" ? 0.18 : 0.3
    };
}
export function calculateEnergyEstimate(consumption, input) {
    const safeConsumption = nonNegative(consumption);
    const baseCost = safeConsumption * nonNegative(input.rate);
    const flagCost = safeConsumption * nonNegative(input.flagRate);
    return {
        baseCost,
        flagCost,
        totalCost: baseCost + flagCost + nonNegative(input.lightingFee)
    };
}
export function calculateWaterEstimate(consumption, input) {
    const waterCost = nonNegative(consumption) * nonNegative(input.rate);
    const sewerCost = waterCost * (nonNegative(input.sewerPercent) / 100);
    return {
        waterCost,
        sewerCost,
        totalCost: waterCost + sewerCost + nonNegative(input.fixedFee)
    };
}
export function detectContinuousWaterFlow(readings) {
    const validation = validateMeterReadings(readings);
    if (!validation.valid) {
        return {
            valid: false,
            errorCode: validation.errorCode,
            suspicious: false,
            elapsedHours: 0,
            litersPerHour: 0
        };
    }
    const lastPair = readings.slice(-2);
    if (lastPair.length !== 2) {
        return { valid: true, errorCode: null, suspicious: false, elapsedHours: 0, litersPerHour: 0 };
    }
    const elapsedHours = elapsedMilliseconds(lastPair[0]?.date ?? "", lastPair[1]?.date ?? "")
        / MILLISECONDS_PER_HOUR;
    const liters = nonNegative((lastPair[1]?.value ?? 0) - (lastPair[0]?.value ?? 0)) * 1000;
    const litersPerHour = elapsedHours > 0 ? liters / elapsedHours : 0;
    return {
        valid: true,
        errorCode: null,
        suspicious: elapsedHours >= 2 && elapsedHours <= 24 && litersPerHour >= 1,
        elapsedHours,
        litersPerHour
    };
}
