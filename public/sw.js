/* Shell cache for the installable site. Push is not subscribed here. */
const CACHE = "aetherforge-shell-v1";
const SHELL = ["/offline", "/site.webmanifest", "/brand/aetherforge-icon-192.png", "/brand/aetherforge-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
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
