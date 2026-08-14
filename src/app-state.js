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
  billing: { energy: null },
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

const ADMIN_VIEW_PATCH_KEYS = Object.freeze([
  "identity", "account", "readings", "historicalConsumption", "settings", "cycles", "billing",
  "tariff", "locality", "organization", "adminView", "activePage", "transitionSurface", "view", "error"
]);

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

  if (typeof globalThis !== "undefined") {
    globalThis.__VOLT_ADMIN_VIEW_BRIDGE__ = createAdminViewBridge({
      getState: () => state,
      publish,
      replaceState(nextState) { state = nextState; },
      subscribers
    });
  }
  return store;
}

function createAdminViewBridge(context) {
  const snapshot = () => sanitizeAdminViewState(context.getState());
  return Object.freeze({
    getState: snapshot,
    subscribe(subscriber) {
      if (typeof subscriber !== "function") throw new TypeError("Assinante administrativo inválido.");
      const wrapped = () => subscriber(snapshot());
      context.subscribers.add(wrapped);
      wrapped();
      return () => context.subscribers.delete(wrapped);
    },
    update(patch) {
      const current = context.getState();
      if (!current.permissions?.canManageUsers || current.status !== StartupStatus.READY) throw new Error("Visualização administrativa indisponível.");
      const safePatch = {};
      for (const key of ADMIN_VIEW_PATCH_KEYS) {
        if (Object.prototype.hasOwnProperty.call(patch || {}, key)) safePatch[key] = patch[key];
      }
      context.replaceState({ ...current, ...safePatch });
      context.publish();
    }
  });
}

function sanitizeAdminViewState(state) {
  return {
    status: state.status,
    authenticatedUserId: state.user?.id || null,
    identity: state.identity,
    account: state.account,
    readings: state.readings,
    historicalConsumption: state.historicalConsumption,
    settings: state.settings,
    cycles: state.cycles,
    billing: state.billing,
    tariff: state.tariff,
    locality: state.locality,
    permissions: state.permissions,
    organization: state.organization,
    admin: state.admin,
    adminView: state.adminView,
    activePage: state.activePage,
    transitionSurface: state.transitionSurface,
    view: state.view,
    error: state.error
  };
}
