const CACHE = "my-diet-v2";
const SCOPE = self.registration ? self.registration.scope : "./";

// Every route is a static trailingSlash export, so the whole app shell can be
// precached — offline then works even for routes never visited online.
const ROUTES = [
  "",
  "today/",
  "meals/",
  "intake/",
  "schedule/",
  "weight/",
  "review/",
  "settings/",
];
const PRECACHE = [...ROUTES.map((r) => SCOPE + r), SCOPE + "manifest.webmanifest"];

// Only same-origin GETs matching these are ever cached, so storage stays
// bounded: hashed _next/static assets turn over with each deploy (old caches
// are deleted on activate via the CACHE name bump).
function isCacheable(url) {
  if (!url.pathname.startsWith(new URL(SCOPE).pathname)) return false;
  return true;
}

function isImmutableAsset(url) {
  return url.pathname.includes("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (!isCacheable(url)) return;

  // Fingerprinted chunks never change under the same URL: cache-first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      })()
    );
    return;
  }

  // HTML and everything else: network-first with cache fallback.
  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match(SCOPE);
          if (shell) return shell;
        }
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const data = event.notification.data || {};
  let path = "today/";
  if (data.kind === "weighIn") path = "weight/";
  else if (data.kind === "review") path = "review/";
  const url = new URL(path, scope).toString();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();
  const title = data.title || "my-diet";
  const body = data.body || "";
  const scope = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: scope + "icons/icon-192.png",
      badge: scope + "icons/icon-192.png",
    })
  );
});
