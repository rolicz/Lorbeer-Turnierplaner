import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

import { apiFetch } from "./client";
import type { MeResponse, Passkey } from "./types";

/**
 * Passkeys in the browser (L9) — the **only** module that calls `@simplewebauthn/browser`.
 *
 * Both ceremonies are three steps: the server mints the options (and a single-use
 * challenge), the browser's own sheet asks the authenticator, the server verifies. The
 * options travel untouched: the server emits them in exactly the JSON shape
 * `startRegistration` / `startAuthentication` take (L8), which is why `schema.d.ts`
 * types them as a plain object.
 *
 * **A cancelled system sheet is not an error.** Closing the Face ID / Touch ID / security
 * key sheet rejects with `NotAllowedError` (the spec folds "cancelled", "timed out" and
 * "no credential here" into that one name on purpose, so a page cannot probe what the
 * device holds) — both ceremonies answer `null` for it and the UI says nothing.
 */

/** The reader closed the sheet, or it timed out: say nothing. */
function isCancelled(e: unknown): boolean {
  return e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");
}

/** Does this browser do WebAuthn at all? (False off a secure context, e.g. the LAN IP over http.) */
export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn();
}

/** Is there a built-in authenticator (Face ID, Touch ID, Windows Hello) on this device? */
export function platformPasskeyAvailable(): Promise<boolean> {
  return platformAuthenticatorIsAvailable();
}

/** My passkeys, oldest first (`GET /auth/passkeys`). */
export function listPasskeys(): Promise<Passkey[]> {
  return apiFetch<Passkey[]>("/auth/passkeys", { method: "GET" });
}

/**
 * Add a passkey to my account. `label` empty → the server names it after the device
 * (`label` is a plain string on the wire — `null` is a 422).
 * Resolves `null` when the reader cancelled the sheet. An authenticator that already holds
 * one of my passkeys rejects with `InvalidStateError` (the server's `excludeCredentials`).
 */
export async function registerPasskey(label: string): Promise<Passkey | null> {
  const optionsJSON = await apiFetch<PublicKeyCredentialCreationOptionsJSON>("/auth/passkeys/register/options", {
    method: "POST",
  });
  let credential;
  try {
    credential = await startRegistration({ optionsJSON });
  } catch (e) {
    if (isCancelled(e)) return null;
    throw e;
  }
  return apiFetch<Passkey>("/auth/passkeys/register/verify", {
    method: "POST",
    body: JSON.stringify({ credential, label: label.trim() }),
  });
}

/**
 * Sign in with a passkey. No name is asked for and no credential list is sent: the
 * authenticator offers whatever it holds for this site, so nothing here can tell anyone
 * which accounts exist. Resolves `MeResponse` (the cookie rides back with it), or `null`
 * when the reader cancelled. Every refusal is the server's one 401.
 */
export async function loginWithPasskey(): Promise<MeResponse | null> {
  const optionsJSON = await apiFetch<PublicKeyCredentialRequestOptionsJSON>("/auth/passkeys/login/options", {
    method: "POST",
  });
  let credential;
  try {
    credential = await startAuthentication({ optionsJSON });
  } catch (e) {
    if (isCancelled(e)) return null;
    throw e;
  }
  return apiFetch<MeResponse>("/auth/passkeys/login/verify", {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

/**
 * Remove one of my passkeys. **This ends every session of the account, this one
 * included** — the answer carries `Set-Cookie … Max-Age=0` — so the caller goes to the
 * login screen afterwards. 409 when it is the last way in (no password, no other passkey).
 */
export function removePasskey(id: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/auth/passkeys/${id}`, { method: "DELETE" });
}
