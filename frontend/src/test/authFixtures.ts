import type { MeResponse } from "../api/types";

/** The cached `GET /me` answer `AuthProvider` boots from (`ea_fc_me`); the key it reads. */
export const ME_STORAGE_KEY = "ea_fc_me";

/** A member of Altherren, editor, player 1 — enough for the shell to render. */
export function sessionFixture(over: Partial<MeResponse> = {}): MeResponse {
  return {
    role: "editor",
    player_id: 1,
    player_name: "Roli",
    site_admin: false,
    groups: [{ id: 1, slug: "altherren", name: "Altherren", role: "member" }],
    has_password: true,
    has_passkey: false,
    password_migrated: false,
    session_id: 1,
    // E1: whether the account can be recovered (`MeOut`'s five fields; the plan's defaults).
    email: null,
    email_pending: null,
    email_verified: false,
    email_available: true,
    login_secure: true,
    ...over,
  };
}

/**
 * Put a cached session in storage so a bare `<AuthProvider>` boots `authed` — the state
 * every shell component is rendered in. The provider still asks `/me` in an effect; in
 * jsdom that request fails without a status, which by design changes nothing (L4).
 */
export function seedSession(over: Partial<MeResponse> = {}): MeResponse {
  const me = sessionFixture(over);
  localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(me));
  return me;
}
