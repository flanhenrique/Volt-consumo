const RELEASE_ID = "20260813.7";
const CACHE_REVISION = "20260813.7";
const CACHE_NAME = `volt-app-v4-atomic-${CACHE_REVISION}`;
const BOOTSTRAP_BUILD = "20260814.11";
const OWNED_CACHE_NAMES = new Set([
  CACHE_NAME,
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

const CORE_ASSETS = [
  "./",
  "./index.html",
  releaseAsset("./styles/tokens.css"),
  releaseAsset("./styles/glass.css"),
  releaseAsset("./styles/layout.css"),
  releaseAsset("./styles/components.css"),
  releaseAsset("./styles/pages.css"),
  releaseAsset("./styles/billing-workflow.css"),
  bootstrapAsset("./bootstrap.js"),
  bootstrapAsset("./app.js"),
  releaseAsset("./config.js"),
  "./manifest.webmanifest",
  "./version.json",
  "./icon.svg",
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
  bootstrapAsset("./src/consumption-reports.js"),
  bootstrapAsset("./src/home-dashboard-v2.js"),
  bootstrapAsset("./src/home-dashboard-sustainability.js"),
  bootstrapAsset("./src/pwa-update.js")
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME);
  for (const asset of CORE_ASSETS) await cache.add(asset);
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
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        clients.forEach((client) => client.postMessage({ type: "VOLT_UPDATED", release: RELEASE_ID, build: BOOTSTRAP_BUILD }));
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
