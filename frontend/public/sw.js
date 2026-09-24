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
 * Since L10 the worker reports the new endpoint itself: auth is the `lk_session` cookie
 * now, and a same-origin `fetch` from a service worker carries it like any page request
 * would (it used to be a bearer token in `localStorage`, which a worker cannot read). The
 * PUT names the endpoint it replaces, so the server moves this device's language and mode
 * onto the new row and disables the old one in the same request. When the browser hands
 * over no old subscription (Safari may not), the worker still re-subscribes — the key then
 * comes from `/api/push/config` — but leaves the report to the page, which knows the
 * settings.
 *
 * A 401 is still possible — an install whose session was revoked or has expired, or one
 * that was never logged in — and is swallowed: there is nobody to tell, and the page's
 * auto-sync (`usePushNotifications`, mounted app-wide) reports the endpoint on the next
 * launch after a login, exactly as before. Any other failure is swallowed the same way.
 *
 * The API is `/api` on this origin in production (Caddy) and in dev (vite's proxy, L0).
 */
const API_BASE = "/api";

async function vapidKeyFromServer() {
  try {
    const res = await fetch(`${API_BASE}/push/config`, { credentials: "same-origin" });
    if (!res.ok) return null;
    const config = await res.json();
    const raw = typeof config.vapid_public_key === "string" ? config.vapid_public_key : "";
    if (!raw) return null;
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (raw.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function platformFromUserAgent(ua) {
  const lower = String(ua || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(lower)) return "ios";
  if (/android/.test(lower)) return "android";
  return "desktop";
}

async function resubscribeAndReport(event) {
  const old = event.oldSubscription || null;
  let subscription = event.newSubscription || null;
  if (!subscription) {
    // No old subscription (Safari may send none): the key then comes from the server.
    const key = (old && old.options && old.options.applicationServerKey) || (await vapidKeyFromServer());
    if (!key) return;
    subscription = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  }
  // Without the old endpoint the server has no row to take this device's language and
  // mode from, and a row with the defaults would overwrite what the page remembers. That
  // case stays the page's to report on the next launch, as it was before L10.
  if (!old || !old.endpoint || old.endpoint === subscription.endpoint) return;
  const json = subscription.toJSON();
  if (!subscription.endpoint || !json.keys || !json.keys.p256dh || !json.keys.auth) return;
  const ua = self.navigator ? self.navigator.userAgent : "";
  try {
    // No language or mode: the server copies them from the row this one replaces.
    await fetch(`${API_BASE}/push/subscription`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime ?? null,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        contentEncoding: "aes128gcm",
        app_platform: platformFromUserAgent(ua),
        user_agent: ua,
        replaces_endpoint: old.endpoint,
      }),
    });
  } catch {
    // offline: the page's auto-sync reports it on the next launch
  }
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(resubscribeAndReport(event).catch(() => undefined));
});
