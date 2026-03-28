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
