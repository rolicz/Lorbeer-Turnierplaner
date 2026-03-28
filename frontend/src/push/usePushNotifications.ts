import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePushSubscription,
  getPushConfig,
  listMyPushSubscriptions,
  putPushSubscription,
  sendPushTest,
} from "../api/push.api";
import type { PushPlatform } from "./push";
import {
  detectPushPlatform,
  getBrowserPushSubscription,
  getPushPermission,
  isPushSupported,
  isStandaloneDisplayMode,
  serializePushSubscription,
  subscribeBrowserToPush,
} from "./push";

function errText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error == null) return "Unknown error";
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export type PushNotificationsState = {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  platform: PushPlatform;
  standalone: boolean;
  browserEndpoint: string | null;
  browserSubscribed: boolean;
  deviceEnabled: boolean;
  configured: boolean;
  serverEnabled: boolean;
  serverReason: string | null;
  serverSubscriptionCount: number;
  loading: boolean;
  syncing: boolean;
  testing: boolean;
  error: string | null;
  clearError: () => void;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function usePushNotifications(token: string | null): PushNotificationsState {
  const qc = useQueryClient();
  const supported = useMemo(() => isPushSupported(), []);
  const platform = useMemo(() => detectPushPlatform(), []);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => getPushPermission());
  const [standalone, setStandalone] = useState<boolean>(() => isStandaloneDisplayMode());
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSyncKeyRef = useRef("");
  const autoSyncInFlightRef = useRef(false);
  const previousTokenRef = useRef<string | null>(token);

  const configQ = useQuery({
    queryKey: ["push", "config"],
    queryFn: getPushConfig,
    staleTime: 60_000,
  });
  const mySubscriptionsQ = useQuery({
    queryKey: ["push", "subscriptions", token],
    queryFn: () => listMyPushSubscriptions(token as string),
    enabled: !!token,
    staleTime: 15_000,
  });

  const refreshBrowserState = useCallback(async (): Promise<PushSubscription | null> => {
    setPermission(getPushPermission());
    setStandalone(isStandaloneDisplayMode());
    if (!supported) {
      setBrowserEndpoint(null);
      return null;
    }
    try {
      const subscription = await getBrowserPushSubscription();
      setBrowserEndpoint(subscription?.endpoint ?? null);
      return subscription;
    } catch {
      setBrowserEndpoint(null);
      return null;
    }
  }, [supported]);

  const refreshAll = useCallback(async () => {
    await refreshBrowserState();
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["push", "config"] }),
      qc.invalidateQueries({ queryKey: ["push", "subscriptions"] }),
    ]);
  }, [qc, refreshBrowserState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshBrowserState();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshBrowserState, token]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => {
      void refreshBrowserState();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshBrowserState]);

  useEffect(() => {
    const previousToken = previousTokenRef.current;
    previousTokenRef.current = token;
    if (!previousToken || token) return;
    void (async () => {
      const subscription = await getBrowserPushSubscription().catch(() => null);
      const endpoint = subscription?.endpoint ?? browserEndpoint;
      if (!endpoint) return;
      await deletePushSubscription(previousToken, endpoint).catch(() => {
        // logout cleanup is best-effort
      });
      await qc.invalidateQueries({ queryKey: ["push", "subscriptions"] });
    })();
  }, [browserEndpoint, qc, token]);

  const enableMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Login required for push notifications.");
      if (!supported) throw new Error("This browser does not support push notifications.");
      const config = configQ.data;
      if (!config?.enabled || !config.vapid_public_key) {
        throw new Error(config?.reason || "Push notifications are not configured on the server.");
      }
      const currentPermission = getPushPermission();
      let nextPermission = currentPermission;
      if (currentPermission !== "granted") {
        nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);
      }
      if (nextPermission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }
      const subscription = await subscribeBrowserToPush(config.vapid_public_key);
      await putPushSubscription(token, serializePushSubscription(subscription));
      return subscription.endpoint;
    },
    onSuccess: async (endpoint) => {
      setError(null);
      setBrowserEndpoint(endpoint);
      await refreshAll();
    },
    onError: (mutationError) => {
      setError(errText(mutationError));
    },
  });

  const disableMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Login required for push notifications.");
      const subscription = await getBrowserPushSubscription().catch(() => null);
      const endpoint = subscription?.endpoint ?? browserEndpoint;
      if (endpoint) {
        await deletePushSubscription(token, endpoint);
      }
      if (subscription) {
        await subscription.unsubscribe();
      }
      return endpoint ?? null;
    },
    onSuccess: async () => {
      setError(null);
      setBrowserEndpoint(null);
      await refreshAll();
    },
    onError: (mutationError) => {
      setError(errText(mutationError));
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Login required for push notifications.");
      await sendPushTest(token);
    },
    onSuccess: () => {
      setError(null);
    },
    onError: (mutationError) => {
      setError(errText(mutationError));
    },
  });

  useEffect(() => {
    if (!token || !supported || permission !== "granted") return;
    if (!configQ.data?.enabled || !browserEndpoint) return;

    const key = `${token}:${browserEndpoint}:${configQ.data.vapid_public_key}`;
    const endpoints = mySubscriptionsQ.data?.endpoints ?? [];
    if (endpoints.includes(browserEndpoint)) {
      autoSyncKeyRef.current = key;
      return;
    }
    if (autoSyncInFlightRef.current || autoSyncKeyRef.current === key) return;

    autoSyncKeyRef.current = key;
    autoSyncInFlightRef.current = true;
    void (async () => {
      const subscription = await getBrowserPushSubscription();
      if (!subscription) {
        autoSyncKeyRef.current = "";
        return;
      }
      await putPushSubscription(token, serializePushSubscription(subscription));
      await qc.invalidateQueries({ queryKey: ["push", "subscriptions", token] });
    })()
      .catch((syncError) => {
        autoSyncKeyRef.current = "";
        setError(errText(syncError));
      })
      .finally(() => {
        autoSyncInFlightRef.current = false;
      });
  }, [
    browserEndpoint,
    configQ.data?.enabled,
    configQ.data?.vapid_public_key,
    mySubscriptionsQ.data?.endpoints,
    permission,
    qc,
    supported,
    token,
  ]);

  const deviceEnabled =
    !!browserEndpoint &&
    permission === "granted" &&
    (mySubscriptionsQ.data?.endpoints ?? []).includes(browserEndpoint);

  return {
    supported,
    permission,
    platform,
    standalone,
    browserEndpoint,
    browserSubscribed: !!browserEndpoint,
    deviceEnabled,
    configured: !!configQ.data?.configured,
    serverEnabled: !!configQ.data?.enabled,
    serverReason: configQ.data?.reason ?? null,
    serverSubscriptionCount: mySubscriptionsQ.data?.count ?? 0,
    loading: configQ.isLoading || (!!token && mySubscriptionsQ.isLoading),
    syncing: enableMut.isPending || disableMut.isPending,
    testing: testMut.isPending,
    error,
    clearError: () => setError(null),
    enable: async () => {
      await enableMut.mutateAsync();
    },
    disable: async () => {
      await disableMut.mutateAsync();
    },
    sendTestNotification: async () => {
      await testMut.mutateAsync();
    },
    refresh: refreshAll,
  };
}
