// VOLT Service Worker — cache limitado ao shell oficial.
const CACHE_PREFIX = "volt-shell-";
const CACHE = `${CACHE_PREFIX}v11`;
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg"
];
const SHELL_PATHS = new Set(CORE_ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isShellRequest(request) {
  if (request.method !== "GET") return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return false;
  if (request.credentials === "include") return false;
  return true;
}

function isCacheableResponse(response) {
  if (!response?.ok || response.type !== "basic" || response.bodyUsed || response.headers.has("set-cookie")) return false;
  return !/no-store|private/i.test(response.headers.get("cache-control") || "");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isShellRequest(request)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        let copy = null;
        if (isCacheableResponse(response)) {
          try {
            copy = response.clone();
          } catch {
            copy = null;
          }
        }
        if (copy) {
          void caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html", { ignoreSearch: true });
        throw new Error("Volt: recurso indisponível offline");
      })
  );
});
