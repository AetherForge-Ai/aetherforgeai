/** Installable shell. Push is not subscribed here. Served as JavaScript from /sw.js. */
export const PWA_WORKER_SCRIPT = `/* Shell cache for the installable site. Push is not subscribed here. */
const CACHE = "aetherforge-shell-v1";
const SHELL = ["/offline", "/site.webmanifest", "/brand/aetherforge-icon-192.png", "/brand/aetherforge-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Goal b16 M-10: drop any older cache so nothing but the current shell stays.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

// Goal b16 M-10: sign-out sends "aetherforge-clear"; every cache is removed.
self.addEventListener("message", (event) => {
  if (event.data === "aetherforge-clear") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Network only. Responses are never written to the cache, so no portfolio data is stored.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const offline = await caches.match("/offline");
        if (offline) return offline;
      }
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    })
  );
});
`;
