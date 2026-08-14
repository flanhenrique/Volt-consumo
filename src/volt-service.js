import { normalizeLocality, resolveEnergyTariff } from "./tariff.js?v=20260813.7";
import { renderLegalBillDetail } from "./bill-detail.js?v=20260813.7";
import { buildEnergyBillingRules } from "./regulatory-engine.js?v=20260813.7";

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
      const [organization, energyReadings, energySettings, waterReadings, waterSettings, permissions, sqlBilling] = await Promise.all([
        loadOrganization(client),
        queryReadings(client, "beta_meter_readings"),
        querySettings(client, "beta_user_settings", user.id),
        queryReadings(client, "beta_water_readings"),
        querySettings(client, "beta_water_settings", user.id),
        queryPermissions(client),
        loadSqlBillingContext(client, user.id)
      ]);
      const locality = normalizeLocality(user.user_metadata?.locality);
      const energyBill = normalizeEnergyBillingReference(user.user_metadata?.energy_billing_reference);
      const storedEnergy = energySettings ? mapEnergySettings(energySettings) : { ...DEFAULT_ENERGY_SETTINGS };
      const tariff = resolveEnergyTariff(locality, storedEnergy);
      activateSqlBillingContext(sqlBilling, tariff.settings.rate);
      renderLegalBillDetail(globalThis.__VOLT_BILLING_CONTEXT__?.profile || null, energyBill);
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
        billing: { energy: energyBill },
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
      const sqlBilling = await loadSqlBillingContext(client, user.id);
      activateSqlBillingContext(sqlBilling, tariff.settings.rate);
      renderLegalBillDetail(globalThis.__VOLT_BILLING_CONTEXT__?.profile || null, normalizeEnergyBillingReference(data.user?.user_metadata?.energy_billing_reference));
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
      const admin = await queryPlatformUsers(client);
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

export function normalizeEnergyBillingReference(value) {
  if (!value || typeof value !== "object") return null;
  return {
    cycleStart: value.cycleStart || null,
    cycleEnd: value.cycleEnd || null,
    measuredConsumptionKwh: finiteOrNull(value.measuredConsumptionKwh),
    billedConsumptionKwh: finiteOrNull(value.billedConsumptionKwh),
    billingBasis: String(value.billingBasis || "metered"),
    invoiceTotal: finiteOrNull(value.invoiceTotal),
    items: Array.isArray(value.items) ? value.items.map((item, index) => ({
      category: String(item?.category || "other"),
      code: String(item?.code || `item_${index + 1}`),
      label: String(item?.label || item?.code || `Item ${index + 1}`),
      quantityKwh: finiteOrNull(item?.quantityKwh),
      unitRate: finiteOrNull(item?.unitRate),
      amount: finiteOrNull(item?.amount),
      amountStatus: String(item?.amountStatus || ""),
      forecastable: item?.forecastable !== false,
      extraordinary: Boolean(item?.extraordinary)
    })) : []
  };
}

async function loadOrganization(client) {
  const context = await rpcData(client, "beta_organization_context");
  if (!context?.active_organization_id) throw new Error("Sua conta ainda não possui um contexto de organização válido.");
  const active = (context.organizations || []).find((item) => item.id === context.active_organization_id);
  if (!active) throw new Error("O contexto ativo da conta não pôde ser confirmado.");
  return { id: active.id, name: active.name, role: active.role };
}

async function loadSqlBillingContext(client, userId) {
  try {
    const [{ data: units, error: unitError }, { data: rules, error: ruleError }, { data: profiles, error: profileError }] = await Promise.all([
      client.from("consumer_units").select("*").eq("service", "energy").eq("status", "active"),
      client.from("regulatory_rules").select("*").eq("status", "published").order("priority"),
      client.from("regulatory_profiles").select("*").order("created_at", { ascending: false })
    ]);
    if (unitError || ruleError || profileError) return null;
    const owned = (units || []).filter((unit) => unit.created_by === userId);
    if (owned.length !== 1) return null;
    return { unit: owned[0], rules: rules || [], profiles: profiles || [] };
  } catch {
    return null;
  }
}

function activateSqlBillingContext(context, fallbackRate) {
  if (!context?.unit) {
    globalThis.__VOLT_BILLING_CONTEXT__ = null;
    return;
  }
  const resolved = buildEnergyBillingRules({ rules: context.rules, profiles: context.profiles, unit: context.unit, cycle: null });
  const compatibleBenefits = resolved.benefits.map((benefit) => benefit.type === "free_kwh_credit"
    ? { ...benefit, type: "per_kwh_credit", rate: Number(fallbackRate) || 0 }
    : benefit);
  globalThis.__VOLT_BILLING_CONTEXT__ = {
    profile: {
      id: "sql-regulatory-current",
      version: "regulatory-sql-v1",
      provider: context.unit.distributor || "",
      label: "Regras regulatórias confirmadas no Supabase",
      validFrom: null,
      active: true,
      legalBenefits: [],
      rules: { tariffBands: resolved.tariffBands, benefits: compatibleBenefits, charges: resolved.charges },
      appliedRules: resolved.applied
    }
  };
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

async function queryPlatformUsers(client) {
  const { data, error } = await client.rpc("beta_platform_users_snapshot");
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

function finiteOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function persistEnergySettings(client, userId, settings) {
  const { error } = await client.from("beta_user_settings").upsert({
    user_id: userId, rate: settings.rate, goal: settings.goal, flag: settings.flag,
    lighting_fee: settings.lightingFee, updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

function normalizeAdmin(data) {
  const accounts = Array.isArray(data.users) ? data.users.map((account) => ({
    id: account.id,
    email: String(account.email || ""),
    displayName: String(account.name || account.email || "Usuário"),
    createdAt: account.created_at,
    confirmedAt: account.confirmed_at,
    lastSignInAt: account.last_sign_in_at,
    status: account.confirmed_at ? "confirmed" : "pending"
  })) : [];
  return {
    totalUsers: Number(data.total_users) || accounts.length,
    confirmedUsers: Number(data.confirmed_users) || 0,
    activeLast30Days: Number(data.active_last_30_days) || 0,
    accounts
  };
}
