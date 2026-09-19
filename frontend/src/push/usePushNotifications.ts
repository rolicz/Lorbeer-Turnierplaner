import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePushSubscription,
  getPushConfig,
  listMyPushSubscriptions,
  putPushSubscription,
  sendPushTest,
} from "../api/push.api";
import type { PushNotificationLanguage, PushNotificationMode } from "../api/types";
import { qk } from "../api/queryKeys";
import { ApiError } from "../api/client";
import { readStored, writeStored } from "../utils/safeStorage";
import type { PushPlatform } from "./push";
import {
  detectPushPlatform,
  getBrowserPushSubscription,
  getPushPermission,
  isPushSupported,
  isStandaloneDisplayMode,
  rotateBrowserPushSubscription,
  serializePushSubscription,
  subscribeBrowserToPush,
} from "./push";
import type { PushSetupState } from "./pushSetup";
import { isPushDisabledByUser, pushSetupState, setPushDisabledByUser } from "./pushSetup";

const PUSH_LANGUAGE_STORAGE_KEY = "push_notification_language";
const PUSH_MODE_STORAGE_KEY = "push_notification_mode";
const FALLBACK_PUSH_LANGUAGE: PushNotificationLanguage = "steirisch";
const FALLBACK_PUSH_MODE: PushNotificationMode = "finished_only";
const BUILTIN_PUSH_LANGUAGES: { key: PushNotificationLanguage; label: string }[] = [
  { key: "steirisch", label: "Steirisch" },
  { key: "deutsch", label: "Deutsch" },
  { key: "english", label: "English" },
];
const BUILTIN_PUSH_MODES: { key: PushNotificationMode; label: string }[] = [
  { key: "finished_only", label: "Results & personal" },
  { key: "all", label: "Everything" },
  { key: "off", label: "Off" },
];

function normalizePushLanguage(value: string | null | undefined, fallback: PushNotificationLanguage): PushNotificationLanguage {
  return value === "english" || value === "deutsch" || value === "steirisch" ? value : fallback;
}

function loadStoredPushLanguage(): PushNotificationLanguage {
  if (typeof window === "undefined") return FALLBACK_PUSH_LANGUAGE;
  return normalizePushLanguage(readStored(PUSH_LANGUAGE_STORAGE_KEY), FALLBACK_PUSH_LANGUAGE);
}

function storePushLanguage(value: PushNotificationLanguage) {
  if (typeof window === "undefined") return;
  writeStored(PUSH_LANGUAGE_STORAGE_KEY, value);
}

function normalizePushMode(value: string | null | undefined, fallback: PushNotificationMode): PushNotificationMode {
  return value === "finished_only" || value === "all" || value === "off" ? value : fallback;
}

function loadStoredPushMode(): PushNotificationMode {
  if (typeof window === "undefined") return FALLBACK_PUSH_MODE;
  return normalizePushMode(readStored(PUSH_MODE_STORAGE_KEY), FALLBACK_PUSH_MODE);
}

function storePushMode(value: PushNotificationMode) {
  if (typeof window === "undefined") return;
  writeStored(PUSH_MODE_STORAGE_KEY, value);
}

/**
 * PUT this browser's subscription, and rotate it once if the server says it is dead.
 *
 * `PUT /push/subscription` answers **410** for an endpoint the push service has
 * rejected (P5): re-enabling it would resurrect a corpse that the next push kills
 * again, silently, for ever. The cure is a new endpoint, so unsubscribe, subscribe
 * again and PUT that — once. A second 410 is a real error and surfaces.
 *
 * Both writers (enable, and the auto-sync that repairs a subscription the server has
 * lost) go through here; there is no second copy of this rule.
 */
async function putSubscriptionRotatingOn410(args: {
  token: string;
  subscription: PushSubscription;
  language: PushNotificationLanguage;
  mode: PushNotificationMode;
  vapidPublicKey: string;
}): Promise<string> {
  try {
    await putPushSubscription(args.token, serializePushSubscription(args.subscription, args.language, args.mode));
    return args.subscription.endpoint;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 410 || !args.vapidPublicKey) throw error;
    const rotated = await rotateBrowserPushSubscription(args.vapidPublicKey);
    await putPushSubscription(args.token, serializePushSubscription(rotated, args.language, args.mode));
    return rotated.endpoint;
  }
}

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
  /** Does this device receive notifications, and if not, whose move is it (P5). */
  setupState: PushSetupState;
  loading: boolean;
  syncing: boolean;
  testing: boolean;
  availableLanguages: { key: PushNotificationLanguage; label: string }[];
  selectedLanguage: PushNotificationLanguage;
  setLanguage: (language: PushNotificationLanguage) => Promise<void>;
  availableModes: { key: PushNotificationMode; label: string }[];
  selectedMode: PushNotificationMode;
  setMode: (mode: PushNotificationMode) => Promise<void>;
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
  const [selectedLanguage, setSelectedLanguage] = useState<PushNotificationLanguage>(() => loadStoredPushLanguage());
  const [selectedMode, setSelectedMode] = useState<PushNotificationMode>(() => loadStoredPushMode());
  const [preferencesSyncing, setPreferencesSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserChecked, setBrowserChecked] = useState(false);
  const [userDisabled, setUserDisabled] = useState<boolean>(() => isPushDisabledByUser());
  const autoSyncKeyRef = useRef("");
  const autoSyncInFlightRef = useRef(false);
  const autoResubscribeRef = useRef("");
  const previousTokenRef = useRef<string | null>(token);

  const configQ = useQuery({
    queryKey: qk.push.config(),
    queryFn: getPushConfig,
    staleTime: 60_000,
  });
  const mySubscriptionsQ = useQuery({
    queryKey: qk.push.subscriptions(token),
    queryFn: () => listMyPushSubscriptions(token as string),
    enabled: !!token,
    staleTime: 15_000,
  });
  const defaultLanguage = normalizePushLanguage(configQ.data?.default_notification_language, FALLBACK_PUSH_LANGUAGE);
  const defaultMode = normalizePushMode(configQ.data?.default_notification_mode, FALLBACK_PUSH_MODE);
  const availableLanguages = configQ.data?.notification_languages?.length ? configQ.data.notification_languages : BUILTIN_PUSH_LANGUAGES;
  const availableModes = configQ.data?.notification_modes?.length ? configQ.data.notification_modes : BUILTIN_PUSH_MODES;
  const currentSubscription = useMemo(
    () => mySubscriptionsQ.data?.subscriptions?.find((row) => row.endpoint === browserEndpoint) ?? null,
    [browserEndpoint, mySubscriptionsQ.data?.subscriptions],
  );

  /** The device's own answer, kept in storage so a relaunch still knows it. */
  const rememberUserDisabled = useCallback((value: boolean) => {
    setPushDisabledByUser(value);
    setUserDisabled(value);
  }, []);

  const refreshBrowserState = useCallback(async (): Promise<PushSubscription | null> => {
    setPermission(getPushPermission());
    setStandalone(isStandaloneDisplayMode());
    if (!supported) {
      setBrowserEndpoint(null);
      setBrowserChecked(true);
      return null;
    }
    try {
      const subscription = await getBrowserPushSubscription();
      setBrowserEndpoint(subscription?.endpoint ?? null);
      return subscription;
    } catch {
      setBrowserEndpoint(null);
      return null;
    } finally {
      // "no subscription" and "not asked yet" look identical from outside, and the
      // notice must never claim the first while it is still the second.
      setBrowserChecked(true);
    }
  }, [supported]);

  const refreshAll = useCallback(async () => {
    await refreshBrowserState();
    await Promise.all([
      qc.invalidateQueries({ queryKey: qk.push.config() }),
      qc.invalidateQueries({ queryKey: qk.push.subscriptionsAll() }),
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
      await qc.invalidateQueries({ queryKey: qk.push.subscriptionsAll() });
    })();
  }, [browserEndpoint, qc, token]);

  useEffect(() => {
    if (currentSubscription?.notification_language) {
      const nextLanguage = normalizePushLanguage(currentSubscription.notification_language, defaultLanguage);
      setSelectedLanguage(nextLanguage);
      storePushLanguage(nextLanguage);
      return;
    }
    const stored = loadStoredPushLanguage();
    const nextLanguage = normalizePushLanguage(stored, defaultLanguage);
    setSelectedLanguage((current) => (current === nextLanguage ? current : nextLanguage));
  }, [currentSubscription?.notification_language, defaultLanguage]);

  useEffect(() => {
    if (currentSubscription?.notification_mode) {
      const nextMode = normalizePushMode(currentSubscription.notification_mode, defaultMode);
      setSelectedMode(nextMode);
      storePushMode(nextMode);
      return;
    }
    const stored = loadStoredPushMode();
    const nextMode = normalizePushMode(stored, defaultMode);
    setSelectedMode((current) => (current === nextMode ? current : nextMode));
  }, [currentSubscription?.notification_mode, defaultMode]);

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
      return putSubscriptionRotatingOn410({
        token,
        subscription,
        language: selectedLanguage,
        mode: selectedMode,
        vapidPublicKey: config.vapid_public_key,
      });
    },
    onSuccess: async (endpoint) => {
      setError(null);
      setBrowserEndpoint(endpoint);
      // This device said yes. A later "granted but no subscription" is then the
      // browser having dropped it, and is repaired silently (P5).
      rememberUserDisabled(false);
      storePushLanguage(selectedLanguage);
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
      // A deliberate no: never silently re-subscribe this device behind its back.
      rememberUserDisabled(true);
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
      const endpoint = await putSubscriptionRotatingOn410({
        token,
        subscription,
        language: selectedLanguage,
        mode: selectedMode,
        vapidPublicKey: configQ.data?.vapid_public_key ?? "",
      });
      setBrowserEndpoint(endpoint);
      await qc.invalidateQueries({ queryKey: qk.push.subscriptions(token) });
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
    selectedLanguage,
    selectedMode,
    supported,
    token,
  ]);

  const deviceEnabled = !!browserEndpoint && permission === "granted" && (mySubscriptionsQ.data?.endpoints ?? []).includes(browserEndpoint);

  const setupState = pushSetupState({
    token,
    supported,
    serverEnabled: !!configQ.data?.enabled,
    permission,
    browserEndpoint,
    userDisabled,
  });

  // Permission is granted but the subscription is gone — the browser dropped it, or
  // `pushsubscriptionchange` fired and the service worker re-subscribed without being
  // able to tell the server (it has no bearer token). Subscribing again needs no
  // prompt, so repair it here, once per token+key, rather than asking the reader to
  // notice. `browserChecked` keeps "not asked yet" from looking like "gone".
  useEffect(() => {
    if (!browserChecked || setupState !== "resubscribe") return;
    const key = `${token ?? ""}:${configQ.data?.vapid_public_key ?? ""}`;
    if (autoResubscribeRef.current === key) return;
    autoResubscribeRef.current = key;
    enableMut.mutate();
    // `enableMut` is stable enough for this: the ref, not the dependency list, is what
    // makes it fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserChecked, configQ.data?.vapid_public_key, setupState, token]);

  const syncSubscriptionPreferences = useCallback(
    async (language: PushNotificationLanguage, mode: PushNotificationMode) => {
      const nextLanguage = normalizePushLanguage(language, defaultLanguage);
      const nextMode = normalizePushMode(mode, defaultMode);
      if (!token || !supported) return;
      const subscription = await getBrowserPushSubscription().catch(() => null);
      const endpoint = subscription?.endpoint ?? browserEndpoint;
      if (!subscription || !endpoint) return;
      if (!(mySubscriptionsQ.data?.endpoints ?? []).includes(endpoint)) return;
      setPreferencesSyncing(true);
      try {
        await putPushSubscription(token, serializePushSubscription(subscription, nextLanguage, nextMode));
        await qc.invalidateQueries({ queryKey: qk.push.subscriptions(token) });
        setError(null);
      } catch (preferencesError) {
        setError(errText(preferencesError));
      } finally {
        setPreferencesSyncing(false);
      }
    },
    [browserEndpoint, defaultLanguage, defaultMode, mySubscriptionsQ.data?.endpoints, qc, supported, token],
  );

  const updateLanguage = useCallback(
    async (language: PushNotificationLanguage) => {
      const nextLanguage = normalizePushLanguage(language, defaultLanguage);
      setSelectedLanguage(nextLanguage);
      storePushLanguage(nextLanguage);
      await syncSubscriptionPreferences(nextLanguage, selectedMode);
    },
    [defaultLanguage, selectedMode, syncSubscriptionPreferences],
  );

  const updateMode = useCallback(
    async (mode: PushNotificationMode) => {
      const nextMode = normalizePushMode(mode, defaultMode);
      setSelectedMode(nextMode);
      storePushMode(nextMode);
      await syncSubscriptionPreferences(selectedLanguage, nextMode);
    },
    [defaultMode, selectedLanguage, syncSubscriptionPreferences],
  );

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
    setupState,
    loading: configQ.isLoading || (!!token && mySubscriptionsQ.isLoading) || (supported && !browserChecked),
    syncing: enableMut.isPending || disableMut.isPending || preferencesSyncing,
    testing: testMut.isPending,
    availableLanguages,
    selectedLanguage,
    setLanguage: updateLanguage,
    availableModes,
    selectedMode,
    setMode: updateMode,
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
