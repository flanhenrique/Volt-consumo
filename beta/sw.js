// VOLT Service Worker
// Hotfix SEC-002 / TECH-004 — 2026-07-31
//
// Correção: a versão anterior armazenava em cache QUALQUER resposta GET,
// incluindo respostas autenticadas do Supabase. Em dispositivo compartilhado
// isso permitia que dados de um usuário fossem servidos a outro.
//
// Política atual: cache exclusivamente do shell estático same-origin,
// declarado em ASSETS. Nenhuma outra requisição é armazenada.

const CACHE = "volt-beta-shell-v57";

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
  "./energy-detail.js",
  "./energy-detail.css",
  "./platform-users.js",
  "./platform-users.css",
  "./locality-context.js",
  "./south-tariff-catalog.js",
  "./packages/app-environment/browser/index.js",
  "./packages/auth-client/browser/index.js",
  "./packages/consumption-domain/browser/index.js",
  "./packages/engine-core/browser/index.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

const SHELL_PATHS = new Set(
  ASSETS.map((asset) => new URL(asset, self.registration.scope).pathname)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableShellRequest(request) {
  if (request.method !== "GET") return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (url.origin !== self.location.origin) return false;
  if (!SHELL_PATHS.has(url.pathname)) return false;
  if (request.credentials === "include") return false;
  if (/\/(auth|rest|realtime|storage|functions)\//i.test(url.pathname)) return false;

  return true;
}

function isCacheableResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type !== "basic") return false;
  if (response.headers.has("set-cookie")) return false;

  const cacheControl = response.headers.get("cache-control") || "";
  if (/no-store|private/i.test(cacheControl)) return false;

  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (!isCacheableShellRequest(request)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isCacheableResponse(response)) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || caches.match("./index.html"))
      )
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "VOLT_CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }
});
