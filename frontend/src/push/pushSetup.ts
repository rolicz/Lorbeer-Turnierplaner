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
 * - `"blocked"` — the permission is denied. P5 folded this into `"none"` ("a decision,
 *   and it is respected"); **Roli overruled that on 2026-09-23** after testing push on
 *   his phone: the app said nothing, for ever, to a device that receives nothing. It is
 *   its own state because it is the one the app **cannot** act on — `requestPermission()`
 *   resolves `denied` without showing anything, so nothing here may offer a button. All
 *   it can do is say so and name where the reader has to go (`PUSH_BLOCKED_*` below).
 */
export type PushSetupState = "needs-setup" | "resubscribe" | "blocked" | "ok" | "none";

export function pushSetupState(i: {
  /** A session exists — the app never asks about push on behalf of nobody. */
  loggedIn: boolean;
  supported: boolean;
  serverEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  browserEndpoint: string | null;
  userDisabled: boolean;
}): PushSetupState {
  if (!i.loggedIn || !i.supported || !i.serverEnabled) return "none";
  // Denied, unless this device also said no in Settings — that reader turned push off
  // here on purpose and is never told about it twice (P5's rule, kept).
  if (i.permission === "denied") return i.userDisabled ? "none" : "blocked";
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

/**
 * The one sentence the app says about a blocked device, and the one place it is written.
 * The bell's popover and the Settings panel both read these, so the two cannot drift.
 *
 * The hint names *where*, because the app has nowhere to send the reader inside itself:
 * once a permission is denied the browser will not prompt again, so a "Turn on" button
 * here would do nothing at all — and a button that silently does nothing is worse than
 * no button.
 */
export const PUSH_BLOCKED_TITLE = "Notifications are blocked on this device.";
export const PUSH_BLOCKED_HINT = "The app cannot ask again — allow them in your browser or device settings.";

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
