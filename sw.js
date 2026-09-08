// ============================================================================
// sw.js — Service worker : cache "app shell" pour un fonctionnement hors-ligne.
//
// Stratégie : NETWORK-FIRST avec repli sur le cache.
// (L'ancienne stratégie cache-first servait indéfiniment une version périmée
//  du code : toute mise à jour déployée restait invisible pour l'utilisateur.)
// ============================================================================

const CACHE_NAME = "mescourses-cache-v4";

// N'inclure ici que des fichiers qui existent réellement : cache.addAll()
// rejette en bloc si une seule ressource est absente, ce qui fait échouer
// l'installation du service worker et laisse l'ancien actif indéfiniment.
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
      // Mise en cache tolérante aux erreurs : un fichier manquant ne doit
      // jamais empêcher l'installation du service worker.
      await Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
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
      try {
        const networkRes = await fetch(event.request);
        if (networkRes && networkRes.ok) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkRes;
      } catch {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        throw new Error("Ressource indisponible hors-ligne");
      }
    })()
  );
});
