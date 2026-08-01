export * from "./consumption-contracts.js";
const ENGINE_CATALOG = Object.freeze([
    Object.freeze({
        id: "rule-engine",
        displayName: "Rule Engine",
        version: "0.2.0",
        lifecycle: "development",
        enabled: true,
        featureFlag: "engines.rule",
        capabilities: Object.freeze(["regras declarativas", "versionamento", "rastreabilidade"]),
        items: Object.freeze([
            Object.freeze({
                id: "RULE-000",
                title: "Descoberta do ciclo",
                description: "Mantém o estado Aprendendo Ciclo até a primeira fatura identificar o período oficial.",
                status: "available"
            }),
            Object.freeze({
                id: "RULE-001",
                title: "Validação de nova leitura",
                description: "Confere valor crescente, datas válidas e sequência cronológica, registrando qualquer inconsistência.",
                status: "available"
            }),
            Object.freeze({
                id: "RULE-002",
                title: "Reprocessamento dos indicadores",
                description: "Solicita novos indicadores derivados quando a leitura é confiável, sem modificar o histórico.",
                status: "available"
            }),
            Object.freeze({
                id: "RULE-003",
                title: "Validação pela fatura",
                description: "Compara a fatura com as leituras e cria divergência sem corrigir dados automaticamente.",
                status: "available"
            }),
            Object.freeze({
                id: "RULE-004",
                title: "Rastreabilidade",
                description: "Registra regra, horário, usuário, motivo, evento e resultado de cada decisão.",
                status: "available"
            })
        ])
    }),
    Object.freeze({
        id: "calculation-engine",
        displayName: "Calculation Engine",
        version: "0.2.0",
        lifecycle: "development",
        enabled: true,
        featureFlag: "engines.calculation",
        capabilities: Object.freeze(["cálculos versionados", "precisão decimal", "reprodutibilidade"]),
        items: Object.freeze([
            Object.freeze({
                id: "CALC-001",
                title: "Consumo e diferenças",
                description: "Calcula a evolução entre leituras validadas com precisão decimal.",
                status: "available"
            }),
            Object.freeze({
                id: "CALC-002",
                title: "Médias e indicadores",
                description: "Produz média diária, mínimos, máximos e quantidade de intervalos.",
                status: "available"
            }),
            Object.freeze({
                id: "CALC-003",
                title: "Projeções",
                description: "Projeta o consumo para um período configurável sem alterar os dados de origem.",
                status: "available"
            }),
            Object.freeze({
                id: "CALC-004",
                title: "Tendências e estatísticas",
                description: "Calcula variação diária e percentual para análise posterior pelo Rule Engine.",
                status: "available"
            }),
            Object.freeze({
                id: "CALC-005",
                title: "Comparação da fatura",
                description: "Retorna diferenças de consumo, leituras e período, sem decidir a compatibilidade.",
                status: "available"
            }),
            Object.freeze({
                id: "CALC-006",
                title: "Alinhamento do ciclo",
                description: "Agrupa o histórico conforme o ciclo descoberto na primeira fatura.",
                status: "available"
            })
        ])
    })
]);
const ALLOWED_TRANSITIONS = Object.freeze({
    development: Object.freeze(["ready", "disabled"]),
    ready: Object.freeze(["disabled"]),
    disabled: Object.freeze(["development"])
});
export class EngineUnavailableError extends Error {
    constructor(engineId, reason) {
        super(`Engine ${engineId} indisponível: ${reason}`);
        this.name = "EngineUnavailableError";
    }
}
export class EngineEventBus {
    #handlers = new Map();
    subscribe(eventType, handler) {
        const handlers = this.#handlers.get(eventType) ?? new Set();
        handlers.add(handler);
        this.#handlers.set(eventType, handlers);
        return () => handlers.delete(handler);
    }
    async publish(event) {
        const handlers = [
            ...(this.#handlers.get(event.type) ?? []),
            ...(this.#handlers.get("*") ?? [])
        ];
        await Promise.all(handlers.map(async (handler) => handler(event)));
    }
}
export class MemoryEngineLogger {
    #entries = [];
    write(entry) {
        this.#entries.push(Object.freeze({ ...entry, details: Object.freeze({ ...entry.details }) }));
    }
    list() {
        return [...this.#entries];
    }
}
export class MemoryEngineTelemetry {
    #counters = new Map();
    #observations = new Map();
    increment(metric, labels = {}) {
        const key = metricKey(metric, labels);
        this.#counters.set(key, (this.#counters.get(key) ?? 0) + 1);
    }
    observe(metric, value, labels = {}) {
        if (!Number.isFinite(value))
            throw new Error(`Observação inválida para ${metric}.`);
        const key = metricKey(metric, labels);
        const observations = this.#observations.get(key) ?? [];
        observations.push(value);
        this.#observations.set(key, observations);
    }
    counter(metric, labels = {}) {
        return this.#counters.get(metricKey(metric, labels)) ?? 0;
    }
    observations(metric, labels = {}) {
        return [...(this.#observations.get(metricKey(metric, labels)) ?? [])];
    }
}
export class InMemoryFeatureFlags {
    #flags = new Map();
    constructor(flags = {}) {
        Object.entries(flags).forEach(([flag, enabled]) => this.#flags.set(flag, enabled));
    }
    isEnabled(flag, _context) {
        return this.#flags.get(flag) ?? false;
    }
    set(flag, enabled) {
        this.#flags.set(flag, enabled);
    }
}
export class DependencyContainer {
    #dependencies = new Map();
    register(token, dependency) {
        if (!token.trim())
            throw new Error("Token de dependência obrigatório.");
        if (this.#dependencies.has(token))
            throw new Error(`Dependência ${token} já registrada.`);
        this.#dependencies.set(token, dependency);
    }
    resolve(token) {
        if (!this.#dependencies.has(token))
            throw new Error(`Dependência ${token} não registrada.`);
        return this.#dependencies.get(token);
    }
}
export class EngineLifecycleController {
    #current;
    #history = [];
    constructor(initial) {
        this.#current = initial;
    }
    get current() {
        return this.#current;
    }
    transition(to, reason) {
        if (!reason.trim())
            throw new Error("Motivo da transição obrigatório.");
        if (!ALLOWED_TRANSITIONS[this.#current].includes(to)) {
            throw new Error(`Transição inválida: ${this.#current} -> ${to}.`);
        }
        this.#history.push(Object.freeze({ from: this.#current, to, occurredAt: new Date().toISOString(), reason }));
        this.#current = to;
    }
    history() {
        return [...this.#history];
    }
}
export class EngineRegistry {
    #engines = new Map();
    #eventBus;
    #logger;
    #telemetry;
    #featureFlags;
    constructor(dependencies = {}) {
        this.#eventBus = dependencies.eventBus ?? new EngineEventBus();
        this.#logger = dependencies.logger ?? new MemoryEngineLogger();
        this.#telemetry = dependencies.telemetry ?? new MemoryEngineTelemetry();
        this.#featureFlags = dependencies.featureFlags ?? new InMemoryFeatureFlags();
    }
    register(engine) {
        if (this.#engines.has(engine.descriptor.id)) {
            throw new Error(`Engine ${engine.descriptor.id} já registrado.`);
        }
        this.#engines.set(engine.descriptor.id, engine);
    }
    listRegistered() {
        return [...this.#engines.values()].map((engine) => engine.descriptor);
    }
    health() {
        const checkedAt = new Date().toISOString();
        return [...this.#engines.values()].map(({ descriptor }) => ({
            engineId: descriptor.id,
            status: descriptor.enabled && descriptor.lifecycle !== "disabled" ? "healthy" : "unavailable",
            version: descriptor.version,
            checkedAt,
            reason: descriptor.enabled && descriptor.lifecycle !== "disabled" ? null : "engine desativado"
        }));
    }
    async execute(engineId, input, context) {
        validateContext(context);
        const engine = this.#engines.get(engineId);
        if (!engine)
            throw new EngineUnavailableError(engineId, "implementação não registrada");
        if (!engine.descriptor.enabled || engine.descriptor.lifecycle === "disabled") {
            throw new EngineUnavailableError(engineId, "engine desativado");
        }
        if (!this.#featureFlags.isEnabled(engine.descriptor.featureFlag, context)) {
            throw new EngineUnavailableError(engineId, "feature flag desativada");
        }
        const startedAt = Date.now();
        const labels = { engineId };
        this.#telemetry.increment("engine.execution.started", labels);
        this.#log("info", "Execução iniciada.", engineId, context, {});
        await this.#eventBus.publish(createEngineEvent("engine.execution.started", engineId, context, {}));
        try {
            const result = await engine.execute(input, context);
            const durationMs = Date.now() - startedAt;
            this.#telemetry.increment("engine.execution.completed", labels);
            this.#telemetry.observe("engine.execution.duration_ms", durationMs, labels);
            this.#log("info", "Execução concluída.", engineId, context, { durationMs });
            await this.#eventBus.publish(createEngineEvent("engine.execution.completed", engineId, context, { durationMs }));
            return result;
        }
        catch (error) {
            const errorName = error instanceof Error ? error.name : "UnknownError";
            this.#telemetry.increment("engine.execution.failed", { ...labels, errorName });
            this.#log("error", "Execução falhou.", engineId, context, { errorName });
            await this.#eventBus.publish(createEngineEvent("engine.execution.failed", engineId, context, { errorName }));
            throw error;
        }
    }
    #log(level, message, engineId, context, details) {
        this.#logger.write({
            level,
            message,
            engineId,
            occurredAt: new Date().toISOString(),
            correlationId: context.correlationId,
            tenantId: context.tenantId,
            details
        });
    }
}
export function createEngineEvent(type, engineId, context, payload) {
    return {
        id: `${context.correlationId}:${type}:${engineId}`,
        type,
        engineId,
        occurredAt: new Date().toISOString(),
        correlationId: context.correlationId,
        tenantId: context.tenantId,
        payload
    };
}
export function listEngineDefinitions() {
    return ENGINE_CATALOG;
}
export function getEngineDefinition(engineId) {
    const descriptor = ENGINE_CATALOG.find(({ id }) => id === engineId);
    if (!descriptor)
        throw new Error(`Definição do engine ${engineId} não encontrada.`);
    return descriptor;
}
function validateContext(context) {
    const required = [context.tenantId, context.userId, context.timezone, context.occurredAt, context.correlationId];
    if (required.some((value) => value.trim().length === 0)) {
        throw new Error("Contexto de execução do engine incompleto.");
    }
    if (!Number.isFinite(Date.parse(context.occurredAt))) {
        throw new Error("Data do contexto de execução inválida.");
    }
}
function metricKey(metric, labels) {
    const suffix = Object.entries(labels)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join(",");
    return suffix ? `${metric}{${suffix}}` : metric;
}
//# sourceMappingURL=index.js.map