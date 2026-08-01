export const OFFICIAL_ENVIRONMENT = deepFreeze({
    id: "official",
    productName: "Volt",
    badge: null,
    storagePrefix: "volt",
    dataConfigGlobal: "VOLT_SUPABASE",
    dataTablePrefix: "",
    stable: true,
    featureFlags: {
        "engines.rule": true,
        "engines.calculation": true,
        "experimental.ocr": false,
        "experimental.ai": false,
        "experimental.dashboard": false,
        "experimental.integrations": false
    }
});
export const BETA_ENVIRONMENT = deepFreeze({
    id: "beta",
    productName: "Volt Beta",
    badge: "BETA",
    storagePrefix: "volt-beta",
    dataConfigGlobal: "VOLT_SUPABASE_BETA",
    dataTablePrefix: "beta_",
    stable: false,
    featureFlags: {
        "engines.rule": true,
        "engines.calculation": true,
        "experimental.ocr": true,
        "experimental.ai": true,
        "experimental.dashboard": true,
        "experimental.integrations": true
    }
});
export function resolveAppEnvironment(candidate) {
    if (isRecord(candidate) && candidate.id === "beta")
        return BETA_ENVIRONMENT;
    return OFFICIAL_ENVIRONMENT;
}
export function environmentStorageKey(environment, suffix) {
    if (!suffix.trim())
        throw new Error("Sufixo da chave de armazenamento obrigatório.");
    return `${environment.storagePrefix}-${suffix}`;
}
export function environmentTableName(environment, table) {
    if (!/^[a-z][a-z0-9_]*$/.test(table))
        throw new Error("Nome de tabela inválido.");
    return `${environment.dataTablePrefix}${table}`;
}
export function isFeatureEnabled(environment, flag) {
    return environment.featureFlags[flag];
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