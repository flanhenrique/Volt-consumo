// VOLT Service Worker
// Hotfix SEC-002 / TECH-004 — 2026-07-31
//
// Correção: a versão anterior armazenava em cache QUALQUER resposta GET,
// incluindo respostas autenticadas do Supabase. Em dispositivo compartilhado
// isso permitia que dados de um usuário fossem servidos a outro.
//
// Política atual: cache exclusivamente do shell estático same-origin,
// declarado em ASSETS. Nenhuma outra requisição é armazenada.

const CACHE = "volt-beta-shell-v42";

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
  "./packages/app-environment/browser/index.js",
  "./packages/consumption-domain/browser/index.js",
  "./packages/engine-core/browser/index.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

// Caminhos do shell que podem ser servidos do cache (same-origin apenas).
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

/**
 * Determina se a requisição pode ser cacheada.
 * Regras (todas obrigatórias):
 *  1. Método GET
 *  2. Mesma origem do service worker
 *  3. Caminho pertence ao shell estático declarado em ASSETS
 *  4. Requisição não carrega credenciais
 *  5. Não é uma navegação para rota autenticada
 */
function isCacheableShellRequest(request) {
  if (request.method !== "GET") return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  // Regra 2 — bloqueia Supabase, CDNs e qualquer terceiro.
  if (url.origin !== self.location.origin) return false;

  // Regra 3 — allowlist explícita.
  if (!SHELL_PATHS.has(url.pathname)) return false;

  // Regra 4 — nunca cachear requisição com credenciais.
  if (request.credentials === "include") return false;

  // Regra 5 — defesa adicional contra rotas sensíveis.
  if (/\/(auth|rest|realtime|storage|functions)\//i.test(url.pathname)) return false;

  return true;
}

/**
 * Respostas que não devem ser persistidas mesmo vindo do shell.
 */
function isCacheableResponse(response) {
  if (!response || !response.ok) return false;
  if (response.type !== "basic") return false; // exclui opaque e cors
  if (response.headers.has("set-cookie")) return false;

  const cacheControl = response.headers.get("cache-control") || "";
  if (/no-store|private/i.test(cacheControl)) return false;

  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Requisições não-GET seguem direto para a rede, sem interceptação.
  if (request.method !== "GET") return;

  // Tudo que não for shell estático same-origin passa direto para a rede.
  // Nenhuma leitura de cache, nenhuma escrita em cache.
  if (!isCacheableShellRequest(request)) return;

  // Shell estático: network-first com fallback para cache offline.
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

/**
 * Permite que a aplicação limpe o cache no logout.
 * Uso no app: navigator.serviceWorker.controller?.postMessage({ type: "VOLT_CLEAR_CACHE" })
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "VOLT_CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
    );
  }
});
