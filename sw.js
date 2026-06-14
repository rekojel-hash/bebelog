/* ─────────────────────────────────────────────────────────────────
   BébéLog — Service Worker  v2.0
   Stratégie : Cache-first pour les assets, Network-first pour les
   requêtes dynamiques. Fonctionne 100% hors-ligne après 1ère visite.
───────────────────────────────────────────────────────────────── */

const CACHE      = "bebelog-v2";
const CDN_CACHE  = "bebelog-cdn-v2";

/* Assets locaux à précacher dès l'installation */
const LOCAL_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./sw.js"
];

/* CDN externes (React, Babel, Fonts) – mis en cache au 1er accès */
const CDN_ORIGINS = [
  "https://unpkg.com",
  "https://cdnjs.cloudflare.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com"
];

// ── Install : précache app shell ──────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(LOCAL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate : purge vieux caches ────────────────────────────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch : stratégie hybride ────────────────────────────────────
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Ne pas intercepter les POST/PUT ou les requêtes chrome-extension
  if (e.request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  const isCDN   = CDN_ORIGINS.some(o => e.request.url.startsWith(o));
  const isLocal = url.origin === self.location.origin;

  if (isCDN) {
    // CDN : Cache-first (stale-while-revalidate)
    e.respondWith(
      caches.open(CDN_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fresh = fetch(e.request).then(resp => {
            if (resp && resp.status === 200) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fresh;
        })
      )
    );
    return;
  }

  if (isLocal) {
    // Assets locaux : Cache-first, fallback réseau puis /index.html
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp && resp.status === 200) cache.put(e.request, resp.clone());
            return resp;
          }).catch(() => cache.match("./index.html"));
        })
      )
    );
  }
});

// ── Message : force update depuis l'UI ───────────────────────────
self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
