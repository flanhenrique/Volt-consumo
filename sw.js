const CACHE_NAME = "volt-app-v3-liquid-glass";
const OWNED_CACHE_NAMES = new Set([CACHE_NAME, "volt-app-v2", "volt-app-v1", "volt-shell-v10", "volt-beta-shell-v96"]);
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles/tokens.css",
  "./styles/glass.css",
  "./styles/layout.css",
  "./styles/components.css",
  "./styles/pages.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./vendor/supabase/supabase.js",
  "./packages/consumption-domain/browser/index.js",
  "./data/national-energy-catalog.js",
  "./src/app-state.js",
  "./src/cycles.js",
  "./src/renderer.js",
  "./src/supabase-loader.js",
  "./src/tariff.js",
  "./src/volt-service.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
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
    const response = await fetch(request);
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
    const response = await fetch(request);
    if (!response.ok) {
      return new Response(null, { status: response.status, statusText: response.statusText });
    }
    if (response.ok) {
      const cacheCopy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheCopy)));
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || Response.error();
  }
}
