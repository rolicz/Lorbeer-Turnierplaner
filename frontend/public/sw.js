self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Lorbeerkranz";
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: payload.icon || "/android-chrome-192x192.png",
      badge: payload.badge || "/favicon-32x32.png",
      tag: payload.tag || undefined,
      data: {
        path: typeof data.path === "string" ? data.path : "/",
        event_type: data.event_type || "generic",
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawPath = event.notification?.data?.path;
  const path = typeof rawPath === "string" && rawPath.startsWith("/") ? rawPath : "/";
  const targetUrl = new URL(path, self.location.origin).toString();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== self.location.origin) continue;
        return client.focus().then(() => {
          if ("navigate" in client) {
            return client.navigate(targetUrl);
          }
          return undefined;
        });
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

/**
 * The browser replaced or dropped this subscription (a PWA reinstall, a key rotation,
 * Safari expiring it). Without this handler the app simply stops receiving pushes and
 * says nothing — the failure P5 exists to end.
 *
 * The service worker cannot tell the server about the new endpoint itself: auth is a
 * bearer token in `localStorage`, which a worker cannot read, and there is no cookie
 * session. So it re-subscribes with the same application server key and the page
 * reports the new endpoint on the next launch (`usePushNotifications`, mounted
 * app-wide). Re-subscribing here is what keeps that next launch cheap and silent.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const key =
    event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  );
});
