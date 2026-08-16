import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import webpush from "npm:web-push@3.6.7";

type NotificationRow = {
  id: string;
  recipient_user_id: string;
  event_type: string;
  title: string;
  body: string;
  priority: "normal" | "high" | "critical";
  data: Record<string, unknown> | null;
  dismissed_at: string | null;
  push_delivered_at: string | null;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: number | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function errorLabel(error: unknown): string {
  if (error && typeof error === "object" && "statusCode" in error) {
    return `push_${String((error as { statusCode?: unknown }).statusCode ?? "failed")}`;
  }
  return "push_failed";
}

async function markPushResult(notificationId: string, delivered: boolean, error: string | null) {
  await admin
    .from("beta_notifications")
    .update({
      push_attempted_at: new Date().toISOString(),
      push_delivered_at: delivered ? new Date().toISOString() : null,
      push_error: error,
    })
    .eq("id", notificationId);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_configuration_unavailable" }, 503);

    const dispatchToken = request.headers.get("x-volt-dispatch-token") ?? "";
    if (!dispatchToken) return json({ error: "unauthorized" }, 401);

    const { data: authorized, error: tokenError } = await admin.rpc("beta_verify_push_dispatch_token", {
      p_token: dispatchToken,
    });
    if (tokenError || authorized !== true) return json({ error: "unauthorized" }, 401);

    let notificationId = "";
    try {
      const payload = await request.json() as { notification_id?: unknown };
      notificationId = typeof payload.notification_id === "string" ? payload.notification_id : "";
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(notificationId)) return json({ error: "invalid_notification_id" }, 400);

    const { data: notification, error: notificationError } = await admin
      .from("beta_notifications")
      .select("id,recipient_user_id,event_type,title,body,priority,data,dismissed_at,push_delivered_at")
      .eq("id", notificationId)
      .maybeSingle<NotificationRow>();
    if (notificationError) return json({ error: "notification_lookup_failed" }, 500);
    if (!notification) return json({ status: "notification_missing" }, 202);
    if (notification.push_delivered_at) return json({ status: "already_delivered" }, 200);
    if (notification.dismissed_at) return json({ status: "dismissed" }, 202);

    const { data: preferences, error: preferenceError } = await admin
      .from("beta_notification_preferences")
      .select("notifications_enabled,push_enabled")
      .eq("user_id", notification.recipient_user_id)
      .maybeSingle();
    if (preferenceError) return json({ error: "preference_lookup_failed" }, 500);
    if (!preferences?.notifications_enabled || !preferences?.push_enabled) {
      return json({ status: "push_disabled" }, 202);
    }

    const { data: secretData, error: secretError } = await admin.rpc("beta_push_dispatch_secrets");
    const secrets = secretData as { subject?: string; public_key?: string; private_key?: string } | null;
    if (secretError || !secrets?.public_key || !secrets?.private_key || !secrets?.subject) {
      await markPushResult(notification.id, false, "vapid_configuration_unavailable");
      return json({ error: "push_configuration_unavailable" }, 503);
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("beta_push_subscriptions")
      .select("id,endpoint,p256dh,auth,expiration_time")
      .eq("user_id", notification.recipient_user_id)
      .returns<PushSubscriptionRow[]>();
    if (subscriptionsError) return json({ error: "subscription_lookup_failed" }, 500);
    if (!subscriptions?.length) {
      await markPushResult(notification.id, false, "no_active_subscription");
      return json({ status: "no_active_subscription" }, 202);
    }

    webpush.setVapidDetails(secrets.subject, secrets.public_key, secrets.private_key);

    const payload = JSON.stringify({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      tag: `volt-${notification.event_type}-${notification.id}`,
      url: `./?notification=${encodeURIComponent(notification.id)}`,
      renotify: notification.priority !== "normal",
      silent: false,
    });

    let delivered = 0;
    const failures: string[] = [];

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expiration_time,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          {
            TTL: notification.priority === "critical" ? 600 : 300,
            urgency: notification.priority === "critical" ? "high" : "normal",
          },
        );
        delivered += 1;
      } catch (error) {
        const statusCode = Number((error as { statusCode?: unknown })?.statusCode ?? 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("beta_push_subscriptions").delete().eq("id", subscription.id);
          failures.push("expired_subscription");
        } else {
          failures.push(errorLabel(error));
        }
      }
    }

    const error = failures.length ? [...new Set(failures)].join(",") : null;
    await markPushResult(notification.id, delivered > 0, error);

    return json({ status: delivered > 0 ? "delivered" : "not_delivered", delivered, failed: failures.length }, delivered > 0 ? 200 : 202);
  },
};
