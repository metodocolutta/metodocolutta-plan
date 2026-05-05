// Service worker de Colutta.
// Estrategia:
//  - index.html / "/" -> network-first (siempre intenta traer la ultima version;
//    si no hay red, devuelve la copia del cache). Esto evita que los usuarios
//    queden "atrapados" en una version vieja despues de un deploy.
//  - resto de los assets (manifest, iconos, etc.) -> cache-first.
//  - El nombre del cache cambia cada deploy (CACHE_VERSION) para purgar el viejo.
//
// IMPORTANTE: cada vez que subas un nuevo deploy, cambia CACHE_VERSION.
// Podes automatizarlo con un script o tag de git, pero como minimo bumpealo a mano.
const CACHE_VERSION = "2026-05-03-1";   // cambialo en cada deploy
const CACHE = "colutta-" + CACHE_VERSION;
const ASSETS = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla todo si un solo recurso falla -- cacheamos uno por uno
      // ignorando errores individuales para que el SW siempre se instale.
      .then(c => Promise.all(ASSETS.map(a => c.add(a).catch(() => null))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Helper: es una peticion al index/raiz que merece estrategia network-first?
function isAppShell(url){
  if(url.origin !== self.location.origin) return false;
  return url.pathname === "/" || url.pathname.endsWith("/index.html");
}

self.addEventListener("fetch", e => {
  // No interceptamos POST/PUT/DELETE -- ni nada que no sea GET.
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // No interceptamos llamadas a la API de Supabase ni a otros origenes:
  // siempre van por red. Si estan offline, fallan limpiamente.
  if(url.origin !== self.location.origin) return;

  if(isAppShell(url)){
    // Network-first para el HTML principal: siempre tratamos de traer lo nuevo.
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Cacheamos la version nueva para uso offline
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(c => c || caches.match("/index.html"))
        )
    );
    return;
  }

  // Resto de assets locales: cache-first con fallback a red.
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => cached))
  );
});

// Permite forzar update desde la pagina: postMessage({type:"SKIP_WAITING"}).
self.addEventListener("message", e => {
  if(e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
