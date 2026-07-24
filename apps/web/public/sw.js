// Kill switch: the previous version of this file cache-first-served "/"
// forever under a cache name that never changed across deployments, so once
// a browser had it installed, every visit re-served a stale page shell even
// on a fine connection — the old page's hashed CSS/JS then 404'd against
// newer deployments, leaving users stuck on a broken unstyled page until
// they knew to hard-refresh.
//
// This version replaces it for anyone who already has the old worker
// installed: it wipes every cache, unregisters itself, and reloads any open
// tabs so they fall back to plain network requests — no more offline
// shell-caching. Nothing registers a new service worker going forward
// (see components/pwa-register.tsx), so this file can be deleted entirely
// once existing installs have had a chance to pick up this version.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();

      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});
