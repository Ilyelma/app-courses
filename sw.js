// ============================================================================
// sw.js — Service worker : cache "app shell" pour un fonctionnement hors-ligne
// complet. Stratégie : cache-first pour les fichiers de l'application,
// avec repli réseau puis mise à jour du cache en tâche de fond.
// ============================================================================

const CACHE_NAME = "mescourses-cache-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/app.js",
  "./js/db.js",
  "./js/helpers.js",
  "./js/itemModal.js",
  "./js/shoppingMode.js",
  "./js/confirm.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      const fetchPromise = fetch(event.request)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkRes;
        })
        .catch(() => cached);

      // Cache-first pour une réactivité maximale hors-ligne ; sinon réseau.
      return cached || fetchPromise;
    })()
  );
});
