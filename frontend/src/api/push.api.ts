import { apiFetch } from "./client";
import type {
  PushConfigResponse,
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
};

export function getPushConfig(): Promise<PushConfigResponse> {
  return apiFetch("/push/config", { method: "GET" });
}

export function putPushSubscription(token: string, body: BrowserPushSubscriptionPayload): Promise<PushSubscriptionPutResponse> {
  return apiFetch("/push/subscription", {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
}

export function deletePushSubscription(token: string, endpoint: string): Promise<{ ok: boolean; disabled: boolean }> {
  return apiFetch("/push/subscription", {
    method: "DELETE",
    token,
    body: JSON.stringify({ endpoint }),
  });
}

export function listMyPushSubscriptions(token: string): Promise<PushSubscriptionsMineResponse> {
  return apiFetch("/push/subscriptions/me", { method: "GET", token });
}

export function sendPushTest(token: string): Promise<{ ok: boolean }> {
  return apiFetch("/push/test", { method: "POST", token });
}
