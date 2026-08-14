const RELEASE_ID = "20260814.1";
const CACHE_NAME = `volt-app-v4-atomic-${RELEASE_ID}`;
const OWNED_CACHE_NAMES = new Set([CACHE_NAME, "volt-app-v4-atomic-20260813.7", "volt-app-v4-atomic-20260813.6", "volt-app-v3-liquid-glass", "volt-app-v2", "volt-app-v1", "volt-shell-v10", "volt-beta-shell-v96"]);
const releaseAsset = (path) => `${path}?v=${RELEASE_ID}`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  releaseAsset("./styles/tokens.css"),
  releaseAsset("./styles/glass.css"),
  releaseAsset("./styles/layout.css"),
  releaseAsset("./styles/components.css"),
  releaseAsset("./styles/pages.css"),
  releaseAsset("./styles/billing-workflow.css"),
  releaseAsset("./app.js"),
  releaseAsset("./config.js"),
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  releaseAsset("./vendor/supabase/supabase.js"),
  "./packages/consumption-domain/browser/index.js?v=20260813.7",
  "./packages/consumption-domain/browser/billing-engine.js?v=20260814.1",
  "./packages/consumption-domain/browser/billing-engine.js",
  releaseAsset("./data/national-energy-catalog.js"),
  "./data/energy-billing-profiles.js",
  "./src/app-state.js?v=20260813.7",
  "./src/bill-detail.js?v=20260813.7",
  "./src/cycles.js?v=20260813.7",
  "./src/meter-ocr.js?v=20260813.7",
  "./src/renderer.js?v=20260813.7",
  "./src/supabase-loader.js?v=20260813.7",
  "./src/tariff.js?v=20260813.7",
  "./src/volt-service.js?v=20260813.7",
  "./src/billing-workflow.js?v=20260814.1",
  "./src/regulatory-engine.js?v=20260814.1",
  "./src/invoice-ocr.js?v=20260814.1",
  "./src/executive-pdf.js?v=20260814.1"
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
      .then((names) => Promise.all(names.filter((name) => OWNED_CACHE_NAMES.has(name) && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
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
    if (!response.ok) {
      return new Response(null, { status: response.status, statusText: response.statusText });
    }
    const cacheCopy = response.clone();
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy)));
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || Response.error();
  }
}
