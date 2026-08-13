(() => {
  const listeners = new Set();
  const rpcCalls = [];
  window.__VOLT_FAKE_RPC_CALLS = rpcCalls;
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "flanhenriquee@icloud.com",
    user_metadata: {
      display_name: "Flan Teste",
      name: "Flan Teste",
      locality: { country: "BR", state: "RS", city: "Porto Alegre" },
      cycles: {
        energy: { start: 1, end: 31 },
        water: { start: 1, end: 31 }
      }
    }
  };

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 2, 9, 0, 0).toISOString();
  const latest = new Date(now.getFullYear(), now.getMonth(), Math.max(3, Math.min(now.getDate(), 12)), 9, 0, 0).toISOString();

  const tableData = {
    beta_meter_readings: [
      { value: 1000, measured_at: first },
      { value: 1167, measured_at: latest }
    ],
    beta_water_readings: [
      { value: 300, measured_at: first },
      { value: 304.25, measured_at: latest }
    ],
    beta_user_settings: {
      user_id: user.id,
      rate: 0.86,
      goal: 220,
      flag: "green",
      lighting_fee: 18.5
    },
    beta_water_settings: {
      user_id: user.id,
      rate: 8.3,
      goal: 15,
      sewer_percent: 80,
      fixed_fee: 12
    }
  };

  function session() {
    return {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user
    };
  }

  function notify(event = "USER_UPDATED") {
    const current = { user, ...session() };
    queueMicrotask(() => {
      for (const callback of listeners) callback(event, current);
    });
  }

  function clone(value) {
    return value == null ? value : structuredClone(value);
  }

  function createClient(_url, _key, options = {}) {
    const touch = async (table) => {
      const fetchFn = options?.global?.fetch;
      if (typeof fetchFn !== "function") return;
      try {
        await fetchFn(`${location.origin}/rest/v1/${table}`, { method: "GET" });
      } catch {
        // O smoke valida o fluxo do cliente; a resposta é fornecida em memória.
      }
    };

    const auth = {
      onAuthStateChange(callback) {
        listeners.add(callback);
        queueMicrotask(() => callback("INITIAL_SESSION", session()));
        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
      },
      async getSession() {
        return { data: { session: session() }, error: null };
      },
      async getUser() {
        return { data: { user: clone(user) }, error: null };
      },
      async updateUser(payload = {}) {
        if (payload.data && typeof payload.data === "object") {
          user.user_metadata = { ...(user.user_metadata || {}), ...clone(payload.data) };
          notify("USER_UPDATED");
        }
        return { data: { user: clone(user) }, error: null };
      },
      async signOut() {
        return { error: null };
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null };
      },
      mfa: {
        async listFactors() {
          return { data: { totp: [{ id: "factor-1", status: "verified", friendly_name: "Volt" }] }, error: null };
        },
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null };
        },
        async enroll() {
          return { data: { id: "factor-2", totp: { secret: "TESTSECRET", qr_code: "data:image/svg+xml,<svg/>" } }, error: null };
        },
        async unenroll() {
          return { data: {}, error: null };
        },
        async challengeAndVerify() {
          return { data: {}, error: null };
        }
      }
    };

    function from(table) {
      const state = { operation: "select", payload: null };
      const finishSelect = async (single = false) => {
        await touch(table);
        const stored = tableData[table];
        const data = single
          ? clone(Array.isArray(stored) ? (stored[0] || null) : (stored || null))
          : clone(Array.isArray(stored) ? stored : (stored ? [stored] : []));
        return { data, error: null, status: 200, statusText: "OK" };
      };
      const finishWrite = async () => {
        await touch(table);
        return { data: clone(state.payload), error: null, status: 200, statusText: "OK" };
      };
      const builder = {
        select() {
          state.operation = "select";
          return builder;
        },
        order() {
          return finishSelect(false);
        },
        maybeSingle() {
          return finishSelect(true);
        },
        single() {
          return finishSelect(true);
        },
        insert(payload) {
          state.operation = "insert";
          state.payload = payload;
          return Promise.resolve(finishWrite());
        },
        upsert(payload) {
          state.operation = "upsert";
          state.payload = payload;
          if (table === "beta_user_settings") tableData[table] = { ...(tableData[table] || {}), ...clone(payload) };
          if (table === "beta_water_settings") tableData[table] = { ...(tableData[table] || {}), ...clone(payload) };
          return Promise.resolve(finishWrite());
        },
        update(payload) {
          state.operation = "update";
          state.payload = payload;
          return builder;
        },
        delete() {
          state.operation = "delete";
          return builder;
        },
        eq() {
          if (state.operation === "select") return builder;
          return Promise.resolve(finishWrite());
        },
        then(resolve, reject) {
          return finishSelect(false).then(resolve, reject);
        }
      };
      return builder;
    }

    async function rpc(name) {
      rpcCalls.push(name);
      const responses = {
        beta_admin_bootstrap: {},
        beta_organization_context: {
          active_organization_id: "org-test",
          organizations: [{ id: "org-test", name: "Organização Teste", role: "owner", status: "active" }]
        },
        beta_admin_snapshot: {
          authorized: true,
          organization: { id: "org-test", name: "Organização Teste" },
          membership: { id: "membership-test", role: "owner", status: "active" },
          members: [{ id: "membership-test", display_name: "Flan Teste", email: user.email, role: "owner", status: "active" }],
          invitations: []
        },
        beta_feature_flags_snapshot: { can_manage: true, flags: [], refreshed_at: new Date().toISOString() },
        beta_admin_operational_snapshot: { events: 0, errors: 0, warnings: 0, error_rate: 0, latency_p50_ms: 0, latency_p95_ms: 0, components: [], recent_spans: [], alerts: [], generated_at: new Date().toISOString() }
      };
      return { data: clone(responses[name] ?? {}), error: null, status: 200, statusText: "OK" };
    }

    return { auth, from, rpc };
  }

  window.supabase = { createClient };
})();
