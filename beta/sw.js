// VOLT Service Worker — cache exclusivo do shell estático same-origin.
const CACHE = "volt-beta-shell-v84";

const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./styles.css",
  "./config.js",
  "./environment.js",
  "./app.js",
  "./volt-lumen-tokens.css",
  "./volt-lumen-components.css",
  "./beta-shell.js",
  "./beta-v3.css",
  "./beta-v3.js",
  "./startup-runtime.js",
  "./mercosur-region.js",
  "./uruguay-tariff-catalog.js",
  "./guided-experience.js",
  "./guided-experience.css",
  "./signup-confirmation.js",
  "./signup-confirmation.css",
  "./tutorial-ack.js",
  "./tutorial-ack.css",
  "./initial-bill-setup.js",
  "./initial-bill-setup.css",
  "./separate-cycles.js",
  "./cycle-authority.css",
  "./test-account-reset.js",
  "./test-account-onboarding-prefill.js",
  "./energy-detail.js",
  "./energy-detail.css",
  "./platform-users.js",
  "./platform-users.css",
  "./locality-context.js",
  "./regional-tariff-resolver.js",
  "./national-energy-catalog.js",
  "./south-tariff-catalog.js",
  "./home-cleanup.js",
  "./packages/app-environment/browser/index.js",
  "./packages/auth-client/browser/index.js",
  "./packages/consumption-domain/browser/index.js",
  "./packages/engine-core/browser/index.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

const SHELL_PATHS = new Set(ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function isCacheableShellRequest(request) {
  if (request.method !== "GET") return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  if (url.origin !== self.location.origin || !SHELL_PATHS.has(url.pathname)) return false;
  if (request.credentials === "include") return false;
  return !/\/(auth|rest|realtime|storage|functions)\//i.test(url.pathname);
}

function isCacheableResponse(response) {
  if (!response?.ok || response.type !== "basic" || response.headers.has("set-cookie")) return false;
  return !/no-store|private/i.test(response.headers.get("cache-control") || "");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheableShellRequest(request)) return;
  event.respondWith(fetch(request).then((response) => {
    if (isCacheableResponse(response)) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html"))));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "VOLT_CLEAR_CACHE") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});
