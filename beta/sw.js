// VOLT Service Worker — shell same-origin com cache sob demanda para módulos secundários.
const CACHE="volt-beta-shell-v95";
const CORE_ASSETS=[
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
  "./regional-auth.js",
  "./locality-context.js",
  "./regional-onboarding.js",
  "./signup-confirmation.js",
  "./signup-confirmation.css",
  "./south-tariff-catalog.js",
  "./uruguay-tariff-catalog.js",
  "./packages/app-environment/browser/index.js",
  "./packages/auth-client/browser/index.js",
  "./packages/consumption-domain/browser/index.js",
  "./packages/engine-core/browser/index.js",
  "./vendor/supabase/supabase.js",
  "./manifest.webmanifest",
  "./icon.svg"
];
const OPTIONAL_ASSETS=[
  "./regional-tariff-resolver.js",
  "./regional-home.js",
  "./regional-cycles.js",
  "./guided-experience.js",
  "./guided-experience.css",
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
  "./national-energy-catalog.js",
  "./uruguay-water-detail.js",
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./icon-192.png",
  "./icon-512.png"
];
const ASSETS=[...CORE_ASSETS,...OPTIONAL_ASSETS];
const SHELL_PATHS=new Set(ASSETS.map(asset=>new URL(asset,self.registration.scope).pathname));

self.addEventListener("install",event=>{
  // CORE inclui todas as dependências estáticas necessárias para analisar e
  // inicializar app.js/beta-v3.js. OCR e telas secundárias continuam fora do
  // precache e entram no cache somente quando forem requisitados.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function isCacheableShellRequest(request){
  if(request.method!=="GET")return false;
  let url;
  try{url=new URL(request.url);}catch{return false;}
  if(url.origin!==self.location.origin||!SHELL_PATHS.has(url.pathname))return false;
  if(request.credentials==="include")return false;
  return !/\/(auth|rest|realtime|storage|functions)\//i.test(url.pathname);
}

function isCacheableResponse(response){
  if(!response?.ok||response.type!=="basic"||response.headers.has("set-cookie"))return false;
  return !/no-store|private/i.test(response.headers.get("cache-control")||"");
}

self.addEventListener("fetch",event=>{
  const{request}=event;
  if(!isCacheableShellRequest(request))return;
  event.respondWith(
    fetch(request)
      .then(response=>{
        if(isCacheableResponse(response))caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(request,{ignoreSearch:true});
        if(cached)return cached;
        if(request.mode==="navigate")return caches.match("./index.html",{ignoreSearch:true});
        throw new Error("Volt: recurso indisponível offline");
      })
  );
});

self.addEventListener("message",event=>{
  if(event.data?.type==="VOLT_CLEAR_CACHE"){
    event.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(key=>caches.delete(key)))));
  }
});
