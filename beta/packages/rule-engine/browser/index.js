import { createEngineEvent, EngineEventBus, getEngineDefinition } from "@volt/engine-core";
export * from "./consumption-rules.js";
const RULE_ENGINE_DESCRIPTOR = getEngineDefinition("rule-engine");
export class RuleDefinitionParser {
    parse(source) {
        const candidate = typeof source === "string" ? parseJson(source) : source;
        if (!isRecord(candidate))
            throw new Error("Regra deve ser um objeto.");
        const id = requiredString(candidate.id, "id");
        const name = requiredString(candidate.name, "name");
        const version = requiredPositiveInteger(candidate.version, "version");
        const priority = requiredInteger(candidate.priority, "priority");
        if (typeof candidate.enabled !== "boolean")
            throw new Error("enabled deve ser booleano.");
        const condition = parseExpression(candidate.condition, "condition");
        if (!isRecord(candidate.outcome))
            throw new Error("outcome deve ser um objeto.");
        const outcome = Object.fromEntries(Object.entries(candidate.outcome).map(([key, value]) => [key, parseRuleValue(value, `outcome.${key}`)]));
        if (Object.keys(outcome).length === 0)
            throw new Error("outcome deve possuir ao menos um campo.");
        return deepFreeze({ id, name, version, priority, enabled: candidate.enabled, condition, outcome });
    }
}
export class RuleCatalog {
    #rules = new Map();
    register(rule) {
        const versions = this.#rules.get(rule.id) ?? new Map();
        if (versions.has(rule.version))
            throw new Error(`Regra ${rule.id} v${rule.version} já registrada.`);
        versions.set(rule.version, rule);
        this.#rules.set(rule.id, versions);
    }
    latest(ruleId) {
        const versions = this.#rules.get(ruleId);
        if (!versions?.size)
            return undefined;
        const latestVersion = Math.max(...versions.keys());
        return versions.get(latestVersion);
    }
    active(ruleIds) {
        const selectedIds = ruleIds ? new Set(ruleIds) : null;
        return [...this.#rules.keys()]
            .filter((ruleId) => selectedIds?.has(ruleId) ?? true)
            .map((ruleId) => this.latest(ruleId))
            .filter((rule) => Boolean(rule?.enabled))
            .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
    }
}
export class RuleEngine {
    descriptor = RULE_ENGINE_DESCRIPTOR;
    #catalog;
    #eventBus;
    #audit = [];
    constructor(dependencies = {}) {
        this.#catalog = dependencies.catalog ?? new RuleCatalog();
        this.#eventBus = dependencies.eventBus ?? new EngineEventBus();
    }
    register(rule) {
        this.#catalog.register(rule);
    }
    auditTrail() {
        return [...this.#audit];
    }
    async execute(input, context) {
        if (!isRecord(input.facts))
            throw new Error("Fatos da avaliação devem ser um objeto.");
        const explanations = [];
        const matchedRules = [];
        for (const rule of this.#catalog.active(input.ruleIds)) {
            const predicates = [];
            const matched = evaluateExpression(rule.condition, input.facts, "condition", predicates);
            explanations.push({ ruleId: rule.id, ruleVersion: rule.version, matched, predicates });
            this.#audit.push(Object.freeze({
                ruleId: rule.id,
                ruleVersion: rule.version,
                tenantId: context.tenantId,
                userId: context.userId,
                correlationId: context.correlationId,
                occurredAt: new Date().toISOString(),
                matched
            }));
            await this.#eventBus.publish(createEngineEvent("rule.evaluated", "rule-engine", context, {
                ruleId: rule.id,
                ruleVersion: rule.version,
                matched
            }));
            if (matched)
                matchedRules.push(rule);
        }
        const { outcome, conflicts } = resolveOutcomes(matchedRules);
        for (const conflict of conflicts) {
            await this.#eventBus.publish(createEngineEvent("rule.conflict.detected", "rule-engine", context, conflict));
        }
        return {
            engineId: "rule-engine",
            engineVersion: this.descriptor.version,
            correlationId: context.correlationId,
            output: {
                matchedRuleIds: matchedRules.map(({ id }) => id),
                outcome,
                conflicts,
                explanations
            }
        };
    }
}
function evaluateExpression(expression, facts, path, explanations) {
    if ("all" in expression) {
        return expression.all.map((child, index) => evaluateExpression(child, facts, `${path}.all[${index}]`, explanations))
            .every(Boolean);
    }
    if ("any" in expression) {
        return expression.any.map((child, index) => evaluateExpression(child, facts, `${path}.any[${index}]`, explanations))
            .some(Boolean);
    }
    if ("not" in expression)
        return !evaluateExpression(expression.not, facts, `${path}.not`, explanations);
    const actual = getFact(facts, expression.field);
    const matched = compare(actual, expression.operator, expression.expected);
    explanations.push({
        path,
        field: expression.field,
        operator: expression.operator,
        actual,
        expected: expression.expected,
        matched
    });
    return matched;
}
function compare(actual, operator, expected) {
    switch (operator) {
        case "eq": return Object.is(actual, expected);
        case "neq": return !Object.is(actual, expected);
        case "gt": return typeof actual === "number" && typeof expected === "number" && actual > expected;
        case "gte": return typeof actual === "number" && typeof expected === "number" && actual >= expected;
        case "lt": return typeof actual === "number" && typeof expected === "number" && actual < expected;
        case "lte": return typeof actual === "number" && typeof expected === "number" && actual <= expected;
        case "in": return Array.isArray(expected) && expected.some((value) => Object.is(value, actual));
        case "contains": return (typeof actual === "string" && typeof expected === "string" && actual.includes(expected))
            || (Array.isArray(actual) && actual.some((value) => Object.is(value, expected)));
        case "exists": return expected === false ? actual === undefined : actual !== undefined;
    }
}
function resolveOutcomes(rules) {
    const winners = new Map();
    for (const rule of rules) {
        for (const [key, value] of Object.entries(rule.outcome)) {
            const winner = winners.get(key);
            if (!winner || rule.priority > winner.priority) {
                winners.set(key, { priority: rule.priority, ruleIds: [rule.id], values: [value] });
            }
            else if (rule.priority === winner.priority && !winner.values.some((candidate) => Object.is(candidate, value))) {
                winner.ruleIds.push(rule.id);
                winner.values.push(value);
            }
        }
    }
    const conflicts = [...winners.entries()]
        .filter(([, value]) => value.values.length > 1)
        .map(([key, value]) => ({ key, priority: value.priority, ruleIds: value.ruleIds, values: value.values }));
    const conflictKeys = new Set(conflicts.map(({ key }) => key));
    const outcome = Object.fromEntries([...winners.entries()].filter(([key]) => !conflictKeys.has(key)).map(([key, value]) => [key, value.values[0]]));
    return { outcome, conflicts };
}
function parseExpression(value, path) {
    if (!isRecord(value))
        throw new Error(`${path} deve ser uma expressão.`);
    if (Array.isArray(value.all)) {
        if (!value.all.length)
            throw new Error(`${path}.all não pode ser vazio.`);
        return deepFreeze({ all: value.all.map((child, index) => parseExpression(child, `${path}.all[${index}]`)) });
    }
    if (Array.isArray(value.any)) {
        if (!value.any.length)
            throw new Error(`${path}.any não pode ser vazio.`);
        return deepFreeze({ any: value.any.map((child, index) => parseExpression(child, `${path}.any[${index}]`)) });
    }
    if (value.not !== undefined)
        return deepFreeze({ not: parseExpression(value.not, `${path}.not`) });
    const field = requiredString(value.field, `${path}.field`);
    if (!isRuleOperator(value.operator))
        throw new Error(`${path}.operator inválido.`);
    const expected = Array.isArray(value.expected)
        ? value.expected.map((item, index) => parseRuleValue(item, `${path}.expected[${index}]`))
        : value.expected === undefined
            ? undefined
            : parseRuleValue(value.expected, `${path}.expected`);
    if (value.operator !== "exists" && expected === undefined)
        throw new Error(`${path}.expected obrigatório.`);
    return expected === undefined
        ? deepFreeze({ field, operator: value.operator })
        : deepFreeze({ field, operator: value.operator, expected });
}
function getFact(facts, field) {
    return field.split(".").reduce((value, key) => isRecord(value) ? value[key] : undefined, facts);
}
function isRuleOperator(value) {
    return typeof value === "string" && ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists"].includes(value);
}
function parseRuleValue(value, path) {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    throw new Error(`${path} possui valor inválido.`);
}
function requiredString(value, path) {
    if (typeof value !== "string" || !value.trim())
        throw new Error(`${path} deve ser texto não vazio.`);
    return value;
}
function requiredInteger(value, path) {
    if (typeof value !== "number" || !Number.isInteger(value))
        throw new Error(`${path} deve ser inteiro.`);
    return value;
}
function requiredPositiveInteger(value, path) {
    const parsed = requiredInteger(value, path);
    if (parsed <= 0)
        throw new Error(`${path} deve ser maior que zero.`);
    return parsed;
}
function parseJson(source) {
    try {
        return JSON.parse(source);
    }
    catch {
        throw new Error("JSON da regra inválido.");
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepFreeze(value) {
    if (value && typeof value === "object") {
        Object.freeze(value);
        Object.values(value).forEach((child) => deepFreeze(child));
    }
    return value;
}
//# sourceMappingURL=index.js.map