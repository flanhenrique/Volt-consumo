(() => {
  const params = new URLSearchParams(location.search);
  const seededRole = params.get("session");
  const dataDelay = Math.max(0, Number(params.get("dataDelay")) || 0);
  const resolveData = (value) => dataDelay
    ? new Promise((resolve) => setTimeout(() => resolve(value), dataDelay))
    : Promise.resolve(value);
  const stored = localStorage.getItem("volt-e2e-session");
  const baseUser = {
    id: "user-volt-e2e",
    email: "ana@volt.test",
    user_metadata: {
      display_name: localStorage.getItem("volt-e2e-name") || "Ana Volt",
      cycles: { energy: { start: 10, end: 9 }, water: { start: 5, end: 4 } }
    }
  };
  let session = seededRole || stored ? { user: baseUser, access_token: "token-e2e" } : null;
  if (session) localStorage.setItem("volt-e2e-session", "1");
  let listener = null;
  const admin = seededRole === "admin" || localStorage.getItem("volt-e2e-admin") === "1";
  const mfaRequired = seededRole === "mfa";
  let mfaLevel = "aal1";
  if (admin) localStorage.setItem("volt-e2e-admin", "1");

  const tables = {
    beta_meter_readings: [
      { value: 1000, measured_at: "2026-07-10T12:00:00.000Z" },
      { value: 1125, measured_at: "2026-08-09T12:00:00.000Z" }
    ],
    beta_water_readings: [
      { value: 400, measured_at: "2026-07-05T12:00:00.000Z" },
      { value: 406.25, measured_at: "2026-08-04T12:00:00.000Z" }
    ],
    beta_user_settings: [{ rate: .9, goal: 250, flag: "green", lighting_fee: 20 }],
    beta_water_settings: [{ rate: 8, goal: 15, sewer_percent: 100, fixed_fee: 0 }]
  };

  function query(table) {
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order() { return resolveData({ data: structuredClone(tables[table] || []), error: null }); },
      maybeSingle() { return resolveData({ data: structuredClone((tables[table] || [])[0] || null), error: null }); },
      insert(payload) {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          if (table.endsWith("readings")) tables[table].push({ value: Number(row.value), measured_at: row.measured_at });
        }
        return Promise.resolve({ data: null, error: null });
      },
      upsert(payload) {
        const normalized = table === "beta_user_settings"
          ? { rate: payload.rate, goal: payload.goal, flag: payload.flag, lighting_fee: payload.lighting_fee }
          : { rate: payload.rate, goal: payload.goal, sewer_percent: payload.sewer_percent, fixed_fee: payload.fixed_fee };
        tables[table] = [normalized];
        return Promise.resolve({ data: null, error: null });
      }
    };
    return builder;
  }

  function rpc(name, payload) {
    if (name === "beta_organization_context") return resolveData({ data: {
      active_organization_id: "org-e2e",
      organizations: [{ id: "org-e2e", name: "Casa Volt", role: admin ? "owner" : "member", status: "active" }]
    }, error: null });
    if (name === "beta_platform_users_snapshot") return resolveData({ data: admin ? {
      authorized: true,
      total_users: 3,
      confirmed_users: 2,
      active_last_30_days: 2,
      users: [
        { id: baseUser.id, email: baseUser.email, name: baseUser.user_metadata.display_name, created_at: "2026-07-01T12:00:00.000Z", confirmed_at: "2026-07-01T12:01:00.000Z", last_sign_in_at: "2026-08-13T12:00:00.000Z", status: "confirmed" },
        { id: "user-2", email: "ana@example.com", name: "Ana Volt", created_at: "2026-07-05T12:00:00.000Z", confirmed_at: "2026-07-05T12:01:00.000Z", last_sign_in_at: "2026-08-12T12:00:00.000Z", status: "confirmed" },
        { id: "user-3", email: "conta.pendente@example.com", name: "Conta pendente", created_at: "2026-08-10T12:00:00.000Z", confirmed_at: null, last_sign_in_at: null, status: "pending_confirmation" }
      ]
    } : { authorized: false }, error: null });
    if (name === "beta_user_permissions") return resolveData({ data: {
      can_manage_users: admin,
      role: admin ? "owner" : "member"
    }, error: null });
    if (name === "beta_admin_invite_member") return resolveData({ data: { token: "a".repeat(64), expires_at: "2026-08-15T12:00:00.000Z" }, error: null });
    if (name === "beta_admin_bootstrap") return resolveData({ data: { membership_id: "membership-e2e", organization_id: "org-e2e" }, error: null });
    return resolveData({ data: null, error: null });
  }

  const client = {
    from: query,
    rpc,
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      onAuthStateChange(callback) {
        listener = callback;
        queueMicrotask(() => callback("INITIAL_SESSION", session));
        return { data: { subscription: { unsubscribe() { listener = null; } } } };
      },
      async signInWithPassword({ email }) {
        baseUser.email = email;
        session = { user: baseUser, access_token: "token-e2e" };
        localStorage.setItem("volt-e2e-session", "1");
        queueMicrotask(() => listener?.("SIGNED_IN", session));
        return { data: { session, user: baseUser }, error: null };
      },
      async signUp({ email }) {
        baseUser.email = email;
        session = { user: baseUser, access_token: "token-e2e" };
        localStorage.setItem("volt-e2e-session", "1");
        queueMicrotask(() => listener?.("SIGNED_IN", session));
        return { data: { session, user: baseUser }, error: null };
      },
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
      async signOut() {
        session = null;
        localStorage.removeItem("volt-e2e-session");
        localStorage.removeItem("volt-e2e-admin");
        queueMicrotask(() => listener?.("SIGNED_OUT", null));
        return { error: null };
      },
      async updateUser({ data }) {
        baseUser.user_metadata = { ...baseUser.user_metadata, ...data };
        if (data.display_name) localStorage.setItem("volt-e2e-name", data.display_name);
        session = { ...session, user: baseUser };
        queueMicrotask(() => listener?.("USER_UPDATED", session));
        return { data: { user: baseUser }, error: null };
      },
      mfa: {
        listFactors: () => Promise.resolve({ data: { totp: mfaRequired ? [{ id: "factor-e2e", status: "verified" }] : [] }, error: null }),
        getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: mfaLevel, nextLevel: mfaRequired ? "aal2" : "aal1" }, error: null }),
        challengeAndVerify: () => {
          mfaLevel = "aal2";
          return Promise.resolve({ data: {}, error: null });
        }
      }
    }
  };

  window.__voltFake = { tables, getSession: () => session };
  window.supabase = { createClient: () => client };
})();
