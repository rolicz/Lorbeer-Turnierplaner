import { useMemo } from "react";
import { Bell, RotateCw } from "lucide-react";
import Button from "../primitives/Button";
import { usePushNotifications } from "../../push/usePushNotifications";

function statusLabel(opts: {
  supported: boolean;
  token: string | null;
  configured: boolean;
  serverEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  deviceEnabled: boolean;
}): string {
  if (!opts.token) return "Login required";
  if (!opts.supported) return "Unsupported";
  if (!opts.configured) return "Server setup missing";
  if (!opts.serverEnabled) return "Server unavailable";
  if (opts.permission === "denied") return "Blocked";
  if (opts.deviceEnabled) return "Enabled";
  if (opts.permission === "granted") return "Permission granted";
  return "Disabled";
}

/** Inline notifications controls for the Settings page (no dropdown/portal). */
export default function PushNotificationsSettings({ token }: { token: string | null }) {
  const push = usePushNotifications(token);

  const label = useMemo(
    () =>
      statusLabel({
        supported: push.supported,
        token,
        configured: push.configured,
        serverEnabled: push.serverEnabled,
        permission: push.permission,
        deviceEnabled: push.deviceEnabled,
      }),
    [push.configured, push.deviceEnabled, push.permission, push.serverEnabled, push.supported, token],
  );

  const statusTone = push.deviceEnabled
    ? "text-accent"
    : push.permission === "denied"
      ? "text-red-300"
      : "text-text-muted";

  if (!token) {
    return <div className="text-sm text-text-muted">Log in to manage notifications on this device.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={
              "grid h-9 w-9 place-items-center rounded-xl " +
              (push.deviceEnabled ? "bg-accent/15 text-accent" : "bg-bg-card-chip/60 text-text-muted")
            }
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <div className="text-sm font-medium text-text-normal">Push notifications</div>
            <div className={`text-xs ${statusTone}`}>{label}</div>
          </div>
        </div>
        <button
          type="button"
          title="Refresh status"
          className="icon-button inline-flex h-9 w-9 items-center justify-center"
          onClick={() => void push.refresh()}
          disabled={push.loading || push.syncing || push.testing}
        >
          <RotateCw className={"h-4 w-4 " + (push.loading || push.syncing ? "animate-spin" : "")} aria-hidden="true" />
        </button>
      </div>

      <p className="rounded-lg bg-bg-card-chip/35 p-3 text-xs text-text-muted">
        Default notifications cover finished tournaments and anpoebeln aimed at you. Switch to <b>Everything</b> for
        live comments, goals, all anpoebeln and score changes, or <b>Off</b> to stay subscribed but silent.
      </p>

      {/* Mode + language */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="input-label">Mode</div>
          <select
            className="select-field"
            value={push.selectedMode}
            onChange={(e) => void push.setMode(e.target.value as typeof push.selectedMode)}
            disabled={push.syncing || push.testing}
          >
            {push.availableModes.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="input-label">Language</div>
          <select
            className="select-field"
            value={push.selectedLanguage}
            onChange={(e) => void push.setLanguage(e.target.value as typeof push.selectedLanguage)}
            disabled={push.syncing || push.testing}
          >
            {push.availableLanguages.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Diagnostics */}
      <div className="space-y-1 text-xs text-text-muted">
        <div>Permission: <span className="text-text-normal">{push.permission}</span></div>
        <div>Account devices subscribed: <span className="text-text-normal">{push.serverSubscriptionCount}</span></div>
        <div>This device: <span className="text-text-normal">{push.deviceEnabled ? "linked" : "not linked"}</span></div>
      </div>

      {push.platform === "ios" && !push.standalone ? (
        <div className="rounded-lg bg-bg-card-chip/35 p-3 text-xs text-text-muted">
          On iPhone/iPad, install the app to the Home Screen first — web push only works from the installed PWA.
        </div>
      ) : null}
      {!push.supported ? (
        <div className="rounded-lg bg-bg-card-chip/35 p-3 text-xs text-text-muted">
          This browser does not expose the required Service Worker and Push APIs.
        </div>
      ) : null}
      {(!push.configured || !push.serverEnabled) ? (
        <div className="rounded-lg bg-bg-card-chip/35 p-3 text-xs text-text-muted">
          {push.serverReason || "Push notifications are not configured on the server."}
        </div>
      ) : null}
      {push.error ? (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-100">
          <div>{push.error}</div>
          <button type="button" className="mt-2 text-[11px] font-medium underline underline-offset-2" onClick={push.clearError}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {push.deviceEnabled ? (
          <Button variant="ghost" onClick={() => void push.disable()} disabled={push.syncing || push.testing}>
            {push.syncing ? "Disabling…" : "Disable on this device"}
          </Button>
        ) : (
          <Button
            onClick={() => void push.enable()}
            disabled={!push.supported || !push.serverEnabled || push.syncing || push.testing}
          >
            {push.syncing ? "Enabling…" : "Enable on this device"}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => void push.sendTestNotification()}
          disabled={!push.deviceEnabled || push.syncing || push.testing}
        >
          {push.testing ? "Sending…" : "Send test"}
        </Button>
      </div>
    </div>
  );
}
