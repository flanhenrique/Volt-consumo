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
  settings: { energy: null, water: null },
  cycles: { energy: null, water: null },
  tariff: null,
  locality: null,
  permissions: { canManageUsers: false, role: null },
  organization: null,
  admin: null,
  activePage: "home",
  transitionSurface: null,
  view: { consumptionType: "energy", consumptionPeriod: "cycle", theme: "system", accent: "emerald" },
  error: null
});

export function createApplicationStore() {
  let state = structuredClone(initialState);
  const subscribers = new Set();

  const publish = () => subscribers.forEach((subscriber) => subscriber(state));

  return Object.freeze({
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
}
