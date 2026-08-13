import { normalizeLocality, resolveEnergyTariff } from "./tariff.js";

const DEFAULT_ENERGY_SETTINGS = Object.freeze({ rate: 0.89456, goal: 250, flag: "yellow", lightingFee: 32 });
const DEFAULT_WATER_SETTINGS = Object.freeze({ rate: 8, goal: 15, sewerPercent: 100, fixedFee: 0 });

export function createVoltService(config) {
  if (!window.supabase?.createClient) throw new Error("Biblioteca Supabase não carregada.");
  if (!config?.url || !config?.publishableKey) throw new Error("Configuração Supabase incompleta.");

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  return Object.freeze({
    client,
    async restoreSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session || null;
    },
    onAuthStateChange(handler) {
      const { data } = client.auth.onAuthStateChange((event, session) => handler(event, session));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },
    async requestPasswordReset(email) {
      const redirectTo = new URL("./", location.href).href;
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: "local" });
      if (error) throw error;
    },
    async getMfaState() {
      if (!client.auth.mfa) return { available: false, enrolled: false, currentLevel: "aal1", factorId: null };
      const [{ data: factors, error: factorError }, { data: assurance, error: assuranceError }] = await Promise.all([
        client.auth.mfa.listFactors(),
        client.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      if (factorError || assuranceError) throw factorError || assuranceError;
      const verified = factors?.totp?.find((factor) => factor.status === "verified") || null;
      return {
        available: true,
        enrolled: Boolean(verified),
        currentLevel: assurance?.currentLevel || "aal1",
        nextLevel: assurance?.nextLevel || assurance?.currentLevel || "aal1",
        factorId: verified?.id || null
      };
    },
    async verifyMfa(factorId, code) {
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      return this.restoreSession();
    },
    async loadApplicationData(session) {
      const user = session?.user;
      if (!user) throw new Error("Sessão sem usuário.");
      const identity = normalizeIdentity(user);
      const organization = await loadOrganization(client);
      const [energyReadings, energySettings, waterReadings, waterSettings, permissions] = await Promise.all([
        queryReadings(client, "beta_meter_readings"),
        querySettings(client, "beta_user_settings", user.id),
        queryReadings(client, "beta_water_readings"),
        querySettings(client, "beta_water_settings", user.id),
        queryPermissions(client)
      ]);
      const locality = normalizeLocality(user.user_metadata?.locality);
      const storedEnergy = energySettings ? mapEnergySettings(energySettings) : { ...DEFAULT_ENERGY_SETTINGS };
      const tariff = resolveEnergyTariff(locality, storedEnergy);
      if (tariff.resolution.automatic && Math.abs(tariff.settings.rate - storedEnergy.rate) > 0.0000005) {
        await persistEnergySettings(client, user.id, tariff.settings);
      }
      return {
        identity,
        account: { id: user.id, email: identity.email, displayName: identity.displayName },
        organization,
        permissions: { canManageUsers: Boolean(permissions?.can_manage_users), role: permissions?.role || organization?.role || null },
        readings: { energy: energyReadings, water: waterReadings },
        settings: {
          energy: tariff.settings,
          water: waterSettings ? mapWaterSettings(waterSettings) : { ...DEFAULT_WATER_SETTINGS }
        },
        tariff: tariff.resolution,
        locality,
        admin: null
      };
    },
    async updateDisplayName(displayName) {
      const value = String(displayName || "").trim();
      if (!value || value.length > 40) throw new Error("Informe um nome de exibição com até 40 caracteres.");
      const { data, error } = await client.auth.updateUser({ data: { display_name: value } });
      if (error) throw error;
      return normalizeIdentity(data.user);
    },
    async persistCycles(user, cycles) {
      const metadata = user?.user_metadata || {};
      const { data, error } = await client.auth.updateUser({ data: { ...metadata, cycles, cycles_updated_at: new Date().toISOString() } });
      if (error) throw error;
      return data.user;
    },
    async addReading(type, userId, reading) {
      const table = type === "energy" ? "beta_meter_readings" : "beta_water_readings";
      const { error } = await client.from(table).insert({ user_id: userId, value: reading.value, measured_at: reading.date });
      if (error) throw error;
      return queryReadings(client, table);
    },
    async saveEnergySettings(userId, settings) {
      await persistEnergySettings(client, userId, settings);
      return { ...settings };
    },
    async saveLocality(user, localityInput, currentSettings) {
      const locality = normalizeLocality(localityInput);
      if (locality.country !== "BR" || locality.state.length !== 2 || !locality.city) throw new Error("Informe país, UF e município.");
      const metadata = user?.user_metadata || {};
      const { data, error } = await client.auth.updateUser({ data: { ...metadata, locality, locality_updated_at: new Date().toISOString() } });
      if (error) throw error;
      const tariff = resolveEnergyTariff(locality, currentSettings);
      if (tariff.resolution.automatic && Math.abs(tariff.settings.rate - currentSettings.rate) > 0.0000005) {
        await persistEnergySettings(client, user.id, tariff.settings);
      }
      return { user: data.user, locality, tariff: tariff.resolution, energySettings: tariff.settings };
    },
    async saveWaterSettings(userId, settings) {
      const { error } = await client.from("beta_water_settings").upsert({
        user_id: userId, rate: settings.rate, goal: settings.goal,
        sewer_percent: settings.sewerPercent, fixed_fee: settings.fixedFee, updated_at: new Date().toISOString()
      });
      if (error) throw error;
      return { ...settings };
    },
    async loadAdministration() {
      const admin = await queryAdminPermission(client);
      if (!admin?.authorized) throw new Error("Acesso administrativo não autorizado.");
      return normalizeAdmin(admin);
    },
    async inviteMember(email, role) {
      const { data, error } = await client.rpc("beta_admin_invite_member", { p_email: email, p_role: role });
      if (error) throw error;
      if (!data?.token) throw new Error("O servidor não retornou o token do convite.");
      const url = new URL("./", location.href);
      url.searchParams.set("invite", data.token);
      return { invitationUrl: url.href, expiresAt: data.expires_at };
    }
  });
}

export function normalizeIdentity(user) {
  const metadata = user?.user_metadata || {};
  const email = String(user?.email || "").trim();
  const displayName = String(metadata.display_name || metadata.name || email.split("@")[0] || "Usuário").trim();
  return { displayName, email };
}

async function loadOrganization(client) {
  const context = await rpcData(client, "beta_organization_context");
  if (!context?.active_organization_id) throw new Error("Sua conta ainda não possui um contexto de organização válido.");
  const active = (context.organizations || []).find((item) => item.id === context.active_organization_id);
  if (!active) throw new Error("O contexto ativo da conta não pôde ser confirmado.");
  return { id: active.id, name: active.name, role: active.role };
}

async function queryReadings(client, table) {
  const { data, error } = await client.from(table).select("value, measured_at").order("measured_at");
  if (error) throw error;
  return (data || []).map((item) => ({ value: Number(item.value), date: item.measured_at }));
}

async function querySettings(client, table, userId) {
  const columns = table === "beta_user_settings" ? "rate, goal, flag, lighting_fee" : "rate, goal, sewer_percent, fixed_fee";
  const { data, error } = await client.from(table).select(columns).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function queryAdminPermission(client) {
  const { data, error } = await client.rpc("beta_admin_snapshot");
  if (error) throw error;
  return data || { authorized: false };
}

async function queryPermissions(client) {
  const { data, error } = await client.rpc("beta_user_permissions");
  if (error) throw error;
  return data || { can_manage_users: false, role: null };
}

async function rpcData(client, name, parameters, allowFailure = false) {
  const response = parameters === undefined ? await client.rpc(name) : await client.rpc(name, parameters);
  if (response.error && !allowFailure) throw response.error;
  return response.error ? null : response.data;
}

function mapEnergySettings(data) {
  return { rate: Number(data.rate), goal: Number(data.goal), flag: data.flag, lightingFee: Number(data.lighting_fee) };
}

function mapWaterSettings(data) {
  return { rate: Number(data.rate), goal: Number(data.goal), sewerPercent: Number(data.sewer_percent), fixedFee: Number(data.fixed_fee) };
}

async function persistEnergySettings(client, userId, settings) {
  const { error } = await client.from("beta_user_settings").upsert({
    user_id: userId, rate: settings.rate, goal: settings.goal, flag: settings.flag,
    lighting_fee: settings.lightingFee, updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

function normalizeAdmin(data) {
  return {
    organization: data.organization || null,
    membership: data.membership || null,
    members: Array.isArray(data.members) ? data.members : [],
    invitations: Array.isArray(data.invitations) ? data.invitations : []
  };
}
