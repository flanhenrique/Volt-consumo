const RELEASE_ID = "20260814.9";
const CACHE_REVISION = "20260814.9";
const CACHE_NAME = `volt-app-recovery-${CACHE_REVISION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateRecoveryBuild());
});

async function activateRecoveryBuild() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE_NAME && name.startsWith("volt-")).map((name) => caches.delete(name)));
  await self.clients.claim();

  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(clients.map(async (client) => {
    client.postMessage({ type: "VOLT_UPDATED", release: RELEASE_ID, build: CACHE_REVISION });
    if (typeof client.navigate !== "function") return;

    try {
      const target = new URL(client.url);
      if (target.searchParams.get("volt_build") === CACHE_REVISION) return;
      target.searchParams.set("volt_build", CACHE_REVISION);
      await client.navigate(target.href);
    } catch {
      // A próxima abertura ainda será controlada por este worker e usará rede sem cache.
    }
  }));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(networkFirstAsset(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_VOLT_CACHE") {
    event.waitUntil(clearVoltCaches());
  }
});

async function clearVoltCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith("volt-")).map((name) => caches.delete(name)));
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match("./index.html")) || Response.error();
  }
}

async function networkFirstAsset(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || Response.error();
  }
}
