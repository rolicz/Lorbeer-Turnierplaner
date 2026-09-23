import { apiFetch } from "./client";
import type { AdminAccount, AuthSession, Invite, InviteCreated, ResetLink, RevokedCount } from "./types";

/**
 * The admin page (L6) over L3's `/admin/…` routes. `listAccounts`, the three invite calls
 * and `setMemberRole` answer an owner; the four session / reset-link calls are **site admin
 * only** (an owner gets 403), so the page hides them rather than offering and failing.
 */

/** Everybody the caller may see: a site admin every account, an owner the members of their groups. */
export function listAccounts(): Promise<AdminAccount[]> {
  return apiFetch<AdminAccount[]>("/admin/accounts", { method: "GET" });
}

/** A player's live devices; `current` marks the caller's own session. Site admin only. */
export function listAccountSessions(playerId: number): Promise<AuthSession[]> {
  return apiFetch<AuthSession[]>(`/admin/accounts/${playerId}/sessions`, { method: "GET" });
}

/** Sign one device out, whoever's it is. Site admin only. */
export function revokeSession(sessionId: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/sessions/${sessionId}`, { method: "DELETE" });
}

/** Sign every device of a player out — the caller's own included, when it is theirs. Site admin only. */
export function revokeAllSessions(playerId: number): Promise<RevokedCount> {
  return apiFetch<RevokedCount>(`/admin/accounts/${playerId}/revoke-sessions`, { method: "POST" });
}

/** A one-hour, single-use code for the current group. **The only response that carries the code.** */
export function createInvite(note: string): Promise<InviteCreated> {
  return apiFetch<InviteCreated>("/admin/invites", { method: "POST", body: JSON.stringify({ note }) });
}

/** The group's live codes — never the codes themselves. */
export function listInvites(): Promise<Invite[]> {
  return apiFetch<Invite[]>("/admin/invites", { method: "GET" });
}

export function revokeInvite(inviteId: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/invites/${inviteId}`, { method: "DELETE" });
}

/** A one-hour, single-use link that sets a new password. Site admin only; shown once. */
export function createResetLink(playerId: number): Promise<ResetLink> {
  return apiFetch<ResetLink>("/admin/reset-links", { method: "POST", body: JSON.stringify({ player_id: playerId }) });
}

/** Promote or demote a member. The last owner of a group cannot be demoted (409). */
export function setMemberRole(slug: string, playerId: number, role: "owner" | "member"): Promise<AdminAccount> {
  return apiFetch<AdminAccount>(`/admin/groups/${encodeURIComponent(slug)}/members/${playerId}/role`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}
