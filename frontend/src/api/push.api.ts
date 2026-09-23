import { apiFetch } from "./client";
import type {
  PushConfigResponse,
  PushNotificationLanguage,
  PushNotificationMode,
  PushSubscriptionPutResponse,
  PushSubscriptionsMineResponse,
} from "./types";

export type BrowserPushSubscriptionPayload = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  contentEncoding?: string;
  app_platform?: string;
  app_standalone?: boolean;
  user_agent?: string;
  notification_language?: PushNotificationLanguage;
  notification_mode?: PushNotificationMode;
  /** The endpoint this one replaces on this device (L10) — the server moves its settings
   *  and disables it in the same PUT. */
  replaces_endpoint?: string | null;
};

export function getPushConfig(): Promise<PushConfigResponse> {
  return apiFetch("/push/config", { method: "GET" });
}

export function putPushSubscription(body: BrowserPushSubscriptionPayload): Promise<PushSubscriptionPutResponse> {
  return apiFetch("/push/subscription", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deletePushSubscription(endpoint: string): Promise<{ ok: boolean; disabled: boolean }> {
  return apiFetch("/push/subscription", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export function listMyPushSubscriptions(): Promise<PushSubscriptionsMineResponse> {
  return apiFetch("/push/subscriptions/me", { method: "GET" });
}

export function sendPushTest(): Promise<{ ok: boolean }> {
  return apiFetch("/push/test", { method: "POST" });
}
