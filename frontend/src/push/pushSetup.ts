import { readStored, removeStored, writeStored } from "../utils/safeStorage";

/**
 * "Does this device actually receive notifications?" — the decision, on its own, so it
 * can be tested without a browser (P5).
 *
 * Roli went days without push and had no idea: re-adding the PWA destroys the service
 * worker *and* the push subscription, and nothing said so. The detection therefore
 * never asks storage whether this device used to have push — a reinstall can wipe that
 * flag along with the subscription, which is exactly the case that broke. It asks the
 * browser: is there a subscription right now, and has this install ever been asked.
 *
 * - `"none"`    — nothing to say: no login, no support, no server, or a decided "no".
 * - `"ok"`      — a subscription exists.
 * - `"resubscribe"` — permission is granted but the subscription is gone (the browser
 *   dropped it, or `pushsubscriptionchange` fired): subscribing again needs no prompt,
 *   so the app does it silently instead of asking.
 * - `"needs-setup"` — nobody has ever decided on this install and there is no
 *   subscription: this is the device that receives nothing and does not know it.
 */
export type PushSetupState = "needs-setup" | "resubscribe" | "ok" | "none";

export function pushSetupState(i: {
  token: string | null;
  supported: boolean;
  serverEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  browserEndpoint: string | null;
  userDisabled: boolean;
}): PushSetupState {
  if (!i.token || !i.supported || !i.serverEnabled) return "none";
  if (i.permission === "denied") return "none"; // a decision, and it is respected
  if (i.browserEndpoint) return "ok";
  if (i.permission === "granted") return i.userDisabled ? "none" : "resubscribe";
  if (i.permission === "default") return "needs-setup";
  return "none";
}

/**
 * The notice is dismissed per install. `localStorage` is the right home for that
 * *because* it dies with the install: a reinstall wipes the subscription and the
 * dismissal together, so the device that just lost push is asked again. Detection
 * never reads this — only whether to keep quiet about it.
 */
export const PUSH_SETUP_DISMISSED_KEY = "push_setup_notice_dismissed";

/** Set by the Settings panel's "Disable on this device": a deliberate no, not a loss. */
export const PUSH_USER_DISABLED_KEY = "push_disabled_by_user";

export function isSetupNoticeDismissed(): boolean {
  return readStored(PUSH_SETUP_DISMISSED_KEY) === "1";
}

export function dismissSetupNotice(): void {
  writeStored(PUSH_SETUP_DISMISSED_KEY, "1");
}

export function isPushDisabledByUser(): boolean {
  return readStored(PUSH_USER_DISABLED_KEY) === "1";
}

export function setPushDisabledByUser(value: boolean): void {
  if (value) writeStored(PUSH_USER_DISABLED_KEY, "1");
  else removeStored(PUSH_USER_DISABLED_KEY);
}
