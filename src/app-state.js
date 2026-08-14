export const StartupStatus = Object.freeze({
  BOOTING: "BOOTING",
  SIGNED_OUT: "SIGNED_OUT",
  RESTORING_SESSION: "RESTORING_SESSION",
  MFA_REQUIRED: "MFA_REQUIRED",
  LOADING_ACCOUNT: "LOADING_ACCOUNT",
  LOADING_DATA: "LOADING_DATA",
  READY: "READY",
  ERROR: "ERROR"
});

const initialState = Object.freeze({
  status: StartupStatus.BOOTING,
  session: null,
  user: null,
  identity: null,
  account: null,
  readings: { energy: [], water: [] },
  historicalConsumption: { energy: [], water: [] },
  settings: { energy: null, water: null },
  cycles: { energy: null, water: null },
  tariff: null,
  locality: null,
  permissions: { canManageUsers: false, role: null },
  organization: null,
  admin: null,
  adminView: null,
  activePage: "home",
  transitionSurface: null,
  view: { consumptionType: "energy", consumptionPeriod: "cycle", theme: "system", accent: "emerald" },
  error: null
});

let latestApplicationState = structuredClone(initialState);

export function getApplicationStateSnapshot() {
  return latestApplicationState;
}

export function createApplicationStore() {
  let state = structuredClone(initialState);
  latestApplicationState = state;
  const subscribers = new Set();

  const publish = () => {
    latestApplicationState = state;
    subscribers.forEach((subscriber) => subscriber(state));
    if (typeof document !== "undefined") document.documentElement.dataset.startupStatus = state.status;
    if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
      window.dispatchEvent(new CustomEvent("volt:startup-status", { detail: { status: state.status } }));
    }
  };

  const store = Object.freeze({
    getState: () => state,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      subscriber(state);
      return () => subscribers.delete(subscriber);
    },
    setStatus(status, error = null) {
      if (!Object.values(StartupStatus).includes(status)) throw new TypeError(`Estado de startup desconhecido: ${status}`);
      state = { ...state, status, error };
      publish();
    },
    update(patch) {
      state = { ...state, ...patch };
      publish();
    },
    resetPrivateState() {
      const view = { ...state.view };
      state = { ...structuredClone(initialState), status: StartupStatus.SIGNED_OUT, view };
      publish();
    }
  });

  // Extensão administrativa do próprio VOLT usa somente a API pública do store.
  // Nenhum token, senha ou cliente Supabase é exposto por esta referência.
  if (typeof globalThis !== "undefined") globalThis.__VOLT_APP_STORE__ = store;
  return store;
}
