import type { BrowserPushSubscriptionPayload } from "../api/push.api";

export type PushPlatform = "ios" | "android" | "desktop";

type StandaloneNavigator = Navigator & { standalone?: boolean };

function hasWindowApis(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function isPushSupported(): boolean {
  return hasWindowApis() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  return isPushSupported() ? Notification.permission : "unsupported";
}

export function detectPushPlatform(): PushPlatform {
  if (!hasWindowApis()) return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

export function isStandaloneDisplayMode(): boolean {
  if (!hasWindowApis()) return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as StandaloneNavigator).standalone);
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!hasWindowApis() || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  void registration.update().catch(() => {
    // best-effort update check
  });
  return navigator.serviceWorker.ready;
}

export async function getBrowserPushSubscription(): Promise<PushSubscription | null> {
  const registration = await registerNotificationServiceWorker();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export function serializePushSubscription(subscription: PushSubscription): BrowserPushSubscriptionPayload {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error("Browser push subscription is incomplete.");
  }
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    contentEncoding: "aes128gcm",
    keys: { p256dh, auth },
    app_platform: detectPushPlatform(),
    app_standalone: isStandaloneDisplayMode(),
    user_agent: navigator.userAgent,
  };
}

export async function subscribeBrowserToPush(vapidPublicKey: string): Promise<PushSubscription> {
  const registration = await registerNotificationServiceWorker();
  if (!registration) {
    throw new Error("Service workers are not available in this browser.");
  }
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });
}
