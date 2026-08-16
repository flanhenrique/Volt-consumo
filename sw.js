const RELEASE_ID = "20260813.7";
const CACHE_REVISION = "20260816.4";
const CACHE_NAME = `volt-app-v4-atomic-${CACHE_REVISION}`;
const BOOTSTRAP_BUILD = "20260815.10";
const UPDATE_BUILD = "20260816.4";
const OWNED_CACHE_NAMES = new Set([
  CACHE_NAME,
  "volt-app-v4-atomic-20260816.3",
  "volt-app-v4-atomic-20260816.2",
  "volt-app-v4-atomic-20260816.1",
  "volt-app-v4-atomic-20260815.17",
  "volt-app-v4-atomic-20260815.16",
  "volt-app-v4-atomic-20260815.15",
  "volt-app-v4-atomic-20260815.14",
  "volt-app-v4-atomic-20260815.13",
  "volt-app-v4-atomic-20260815.12",
  "volt-app-v4-atomic-20260815.11",
  "volt-app-v4-atomic-20260815.10",
  "volt-app-v4-atomic-20260815.9",
  "volt-app-v4-atomic-20260815.8",
  "volt-app-v4-atomic-20260815.7",
  "volt-app-v4-atomic-20260815.6",
  "volt-app-v4-atomic-20260815.5",
  "volt-app-v4-atomic-20260815.4",
  "volt-app-v4-atomic-20260815.3",
  "volt-app-v4-atomic-20260815.2",
  "volt-app-v4-atomic-20260815.1",
  "volt-app-v4-atomic-20260814.17",
  "volt-app-v4-atomic-20260814.16",
  "volt-app-v4-atomic-20260814.15",
  "volt-app-v4-atomic-20260814.14",
  "volt-app-v4-atomic-20260814.13",
  "volt-app-v4-atomic-20260814.12",
  "volt-app-v4-atomic-20260813.7",
  "volt-app-recovery-20260814.10",
  "volt-app-recovery-20260814.9",
  "volt-app-v4-atomic-20260814.8",
  "volt-app-v4-atomic-20260814.7",
  "volt-app-v4-atomic-20260814.5",
  "volt-app-v4-atomic-20260814.4",
  "volt-app-v4-atomic-20260814.3",
  "volt-app-v4-atomic-20260813.6",
  "volt-app-v3-liquid-glass",
  "volt-app-v2",
  "volt-app-v1",
  "volt-shell-v10",
  "volt-beta-shell-v96"
]);
const releaseAsset = (path) => `${path}?v=${RELEASE_ID}`;
const bootstrapAsset = (path) => `${path}?v=${BOOTSTRAP_BUILD}`;
const updateAsset = (path) => `${path}?v=${UPDATE_BUILD}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  releaseAsset("./styles/tokens.css"),
  releaseAsset("./styles/glass.css"),
  releaseAsset("./styles/layout.css"),
  releaseAsset("./styles/components.css"),
  releaseAsset("./styles/pages.css"),
  releaseAsset("./styles/billing-workflow.css"),
  updateAsset("./styles/startup-splash.css"),
  updateAsset("./styles/auth-desktop.css"),
  updateAsset("./styles/mobile-polish.css"),
  updateAsset("./styles/dialog-fix.css"),
  updateAsset("./styles/easter-egg.css"),
  updateAsset("./styles/pwa-install.css"),
  updateAsset("./styles/notifications.css"),
  bootstrapAsset("./bootstrap.js"),
  bootstrapAsset("./app.js"),
  releaseAsset("./config.js"),
  "./manifest.webmanifest",
  "./version.json",
  "./styles.css",
  "./terms.html",
  "./privacy.html",
  "./licenses.html",
  "./about.html",
  "./icon.svg",
  "./icon-maskable.svg",
  "./icon-192.png",
  "./icon-512.png",
  releaseAsset("./vendor/supabase/supabase.js"),
  releaseAsset("./packages/consumption-domain/browser/index.js"),
  releaseAsset("./packages/consumption-domain/browser/billing-engine.js"),
  releaseAsset("./data/national-energy-catalog.js"),
  releaseAsset("./src/app-state.js"),
  releaseAsset("./src/bill-detail.js"),
  releaseAsset("./src/cycles.js"),
  releaseAsset("./src/meter-ocr.js"),
  releaseAsset("./src/renderer.js"),
  releaseAsset("./src/supabase-loader.js"),
  releaseAsset("./src/tariff.js"),
  releaseAsset("./src/volt-service.js"),
  releaseAsset("./src/billing-workflow.js"),
  releaseAsset("./src/regulatory-engine.js"),
  releaseAsset("./src/invoice-ocr.js"),
  "./ocr-runtime.html",
  releaseAsset("./src/invoice-ocr-runtime.js"),
  releaseAsset("./src/executive-pdf.js"),
  updateAsset("./src/consumption-reports.js"),
  updateAsset("./src/home-dashboard-v2.js"),
  updateAsset("./src/home-dashboard-sustainability.js"),
  updateAsset("./src/pwa-install.js"),
  updateAsset("./src/pwa-update.js"),
  updateAsset("./src/easter-egg.js"),
  updateAsset("./styles/pwa-update.css"),
  updateAsset("./src/admin-user-view.js"),
  updateAsset("./src/admin-billing-context.js"),
  updateAsset("./src/canonical-billing-context.js"),
  updateAsset("./src/notifications.js")
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
});

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  const total = CORE_ASSETS.length;
  let completed = 0;

  await notifyClients({ type: "VOLT_UPDATE_PROGRESS", phase: "download", progress: 12, completed, total });

  for (const asset of CORE_ASSETS) {
    await cache.add(asset);
    completed += 1;
    const progress = 12 + Math.round((completed / total) * 58);
    await notifyClients({ type: "VOLT_UPDATE_PROGRESS", phase: "download", progress, completed, total });
  }

  await notifyClients({ type: "VOLT_UPDATE_PROGRESS", phase: "install", progress: 74, completed, total });
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => OWNED_CACHE_NAMES.has(name) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(async () => {
        await notifyClients({ type: "VOLT_UPDATE_PROGRESS", phase: "install", progress: 92 });
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        clients.forEach((client) => {
          client.postMessage({ type: "VOLT_UPDATE_PROGRESS", phase: "complete", progress: 100 });
          client.postMessage({ type: "VOLT_UPDATED", release: RELEASE_ID, build: UPDATE_BUILD });
        });
      })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request, event));
    return;
  }

  event.respondWith(assetResponse(request, event));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_VOLT_CACHE") {
    event.waitUntil(Promise.all([...OWNED_CACHE_NAMES].map((name) => caches.delete(name))));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json?.() || {};
  } catch {
    payload = { body: event.data?.text?.() || "" };
  }

  const title = String(payload.title || "VOLT");
  const options = {
    body: String(payload.body || "Você tem uma nova notificação."),
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: String(payload.tag || payload.id || "volt-notification"),
    renotify: Boolean(payload.renotify),
    silent: Boolean(payload.silent),
    data: {
      url: String(payload.url || "./"),
      notificationId: payload.id || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.registration.scope).href;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOriginClient = clients.find((client) => {
      try { return new URL(client.url).origin === new URL(targetUrl).origin; }
      catch { return false; }
    });

    if (sameOriginClient) {
      if ("navigate" in sameOriginClient) await sameOriginClient.navigate(targetUrl);
      await sameOriginClient.focus();
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});

async function navigationResponse(request, event) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cacheCopy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", cacheCopy)));
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match("./index.html")) || Response.error();
  }
}

async function assetResponse(request, event) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (!response.ok) return response;
    const cacheCopy = response.clone();
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy)));
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || Response.error();
  }
}
