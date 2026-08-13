(() => {
  const params = new URLSearchParams(location.search);
  const seededRole = params.get("session");
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
      order() { return Promise.resolve({ data: structuredClone(tables[table] || []), error: null }); },
      maybeSingle() { return Promise.resolve({ data: structuredClone((tables[table] || [])[0] || null), error: null }); },
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
    if (name === "beta_organization_context") return Promise.resolve({ data: {
      active_organization_id: "org-e2e",
      organizations: [{ id: "org-e2e", name: "Casa Volt", role: admin ? "owner" : "member", status: "active" }]
    }, error: null });
    if (name === "beta_admin_snapshot") return Promise.resolve({ data: admin ? {
      authorized: true,
      organization: { id: "org-e2e", name: "Casa Volt", status: "active" },
      membership: { id: "membership-e2e", role: "owner", status: "active" },
      members: [{ id: "membership-e2e", email: baseUser.email, display_name: baseUser.user_metadata.display_name, role: "owner", status: "active" }],
      invitations: []
    } : { authorized: false }, error: null });
    if (name === "beta_user_permissions") return Promise.resolve({ data: {
      can_manage_users: admin,
      role: admin ? "owner" : "member"
    }, error: null });
    if (name === "beta_admin_invite_member") return Promise.resolve({ data: { token: "a".repeat(64), expires_at: "2026-08-15T12:00:00.000Z" }, error: null });
    if (name === "beta_admin_bootstrap") return Promise.resolve({ data: { membership_id: "membership-e2e", organization_id: "org-e2e" }, error: null });
    return Promise.resolve({ data: null, error: null });
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
        listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
        getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
        challengeAndVerify: () => Promise.resolve({ data: {}, error: null })
      }
    }
  };

  window.__voltFake = { tables, getSession: () => session };
  window.supabase = { createClient: () => client };
})();
