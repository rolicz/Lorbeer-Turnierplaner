"""The admin surface (L3): accounts, their devices, invite codes, reset links, owner roles.

Thin, over `services/accounts.py`, `services/invites.py`, `services/reset_links.py`,
`services/sessions.py` and `services/groups.py`. Who may call what:

| route | who |
|---|---|
| `GET /admin/accounts` | owner+ (a site admin sees every player, an owner the members of their groups) |
| `POST/GET/DELETE /admin/invites…` | owner+ of the current group |
| `PUT /admin/groups/{slug}/members/{pid}/role` | an owner of *that* group, or a site admin |
| `GET /admin/accounts/{pid}/sessions`, `DELETE /admin/sessions/{sid}`, `POST /admin/accounts/{pid}/revoke-sessions`, `POST /admin/reset-links`, `GET /admin/mail-status` | **site admin only** — other people's devices, and a reset link takes an account over |

The whole router sits behind `require_owner`; the five site-admin routes add
`require_admin`. Behind the gate every `/admin/…` path also needs a membership in the
current group (or site admin).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..auth import require_admin, require_admin_claims, require_owner, require_owner_claims
from ..db import get_session
from ..models import Account, AuthSession, GroupMembership, InviteCode, Passkey, Player
from ..schemas import InviteCreateBody, MemberRoleBody, ResetLinkCreateBody
from ..schemas.responses import (
    AdminAccountOut,
    InviteCreatedOut,
    InviteOut,
    MailStatusOut,
    OkResponse,
    ResetLinkOut,
    RevokedOut,
    SessionOut,
)
from ..services.account_email import email_states
from ..services.accounts import live_session_stats, session_out
from ..services.groups import current_group, effective_role, group_by_slug, set_member_role
from ..services.invites import create_invite, list_live_invites, revoke_invite
from ..services.reset_links import create_reset, link_origin, reset_url
from ..services.sessions import list_sessions, revoke_all_sessions

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_owner)])


def _account_rows(s: Session, player_ids: list[int] | None) -> list[dict]:
    group = current_group(s)
    roles = {
        int(pid): str(role)
        for pid, role in s.exec(
            select(GroupMembership.player_id, GroupMembership.role).where(GroupMembership.group_id == int(group.id))
        ).all()
    }
    passkey_ids = {int(pid) for pid in s.exec(select(Passkey.player_id)).all()}
    email_by_player = email_states(s)
    stats = live_session_stats(s)
    stmt = select(Player, Account).join(Account, Account.player_id == Player.id).order_by(Player.display_name)
    if player_ids is not None:
        stmt = stmt.where(Player.id.in_(player_ids))
    out: list[dict] = []
    for player, account in s.exec(stmt).all():
        pid = int(player.id)
        count, last_seen = stats.get(pid, (0, None))
        out.append(
            {
                "player_id": pid,
                "display_name": player.display_name,
                "site_admin": bool(account.site_admin),
                "role": effective_role(site_admin=bool(account.site_admin), membership_role=roles.get(pid)),
                "password_origin": account.password_origin,
                "has_passkey": pid in passkey_ids,
                "email_state": email_by_player.get(pid, "none"),
                "login_secure": pid in passkey_ids or account.password_origin == "set",
                "session_count": count,
                "last_seen_at": last_seen,
            }
        )
    return out


def _visible_player_ids(s: Session, claims: dict) -> list[int] | None:
    """None = everyone (site admin); else the members of the caller's groups."""
    if claims.get("site_admin"):
        return None
    group_ids = [int(g["id"]) for g in claims.get("groups") or []]
    if not group_ids:
        return []
    return [int(pid) for pid in s.exec(select(GroupMembership.player_id).where(GroupMembership.group_id.in_(group_ids))).all()]


@router.get("/accounts", response_model=list[AdminAccountOut])
def list_accounts(s: Session = Depends(get_session), claims: dict = Depends(require_owner_claims)) -> list[dict]:
    return _account_rows(s, _visible_player_ids(s, claims))


def _get_account(s: Session, player_id: int) -> Account:
    account = s.get(Account, int(player_id))
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/accounts/{player_id}/sessions", response_model=list[SessionOut], dependencies=[Depends(require_admin)])
def list_account_sessions(player_id: int, s: Session = Depends(get_session), claims: dict = Depends(require_admin_claims)) -> list[dict]:
    """A player's live devices. `current` marks the caller's own session."""
    _get_account(s, player_id)
    mine = claims.get("session_id")
    return [session_out(row, mine) for row in list_sessions(s, int(player_id))]


@router.delete("/sessions/{session_id}", response_model=OkResponse, dependencies=[Depends(require_admin)])
def revoke_any_session(session_id: int, s: Session = Depends(get_session)) -> dict:
    row = s.get(AuthSession, int(session_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    s.delete(row)
    s.commit()
    log.info("Admin revoked session %s of player %s", session_id, row.player_id)
    return {"ok": True}


@router.post("/accounts/{player_id}/revoke-sessions", response_model=RevokedOut, dependencies=[Depends(require_admin)])
def revoke_account_sessions(player_id: int, s: Session = Depends(get_session)) -> dict:
    """Sign every device of this player out — the caller's own included, when it is theirs."""
    _get_account(s, player_id)
    revoked = revoke_all_sessions(s, int(player_id))
    s.commit()
    log.info("Admin revoked %s session(s) of player %s", revoked, player_id)
    return {"revoked": revoked}


@router.get("/mail-status", response_model=MailStatusOut, dependencies=[Depends(require_admin)])
def mail_status(request: Request) -> dict:
    """Whether this server can send email, and how — the boot line's words (host and
    sender, never the login mailbox or the password). Site admin only."""
    transport = request.app.state.mail
    return {"configured": bool(transport.configured), "description": str(transport.description)}


# ---- invites -----------------------------------------------------------------------------


def _invite_out(s: Session, row: InviteCode, slug: str) -> dict:
    creator = s.get(Player, int(row.created_by)) if row.created_by is not None else None
    return {
        "id": int(row.id),
        "group_slug": slug,
        "note": row.note or "",
        "created_at": row.created_at,
        "expires_at": row.expires_at,
        "created_by": {"id": int(creator.id), "display_name": creator.display_name} if creator else None,
    }


@router.post("/invites", response_model=InviteCreatedOut)
def create_invite_code(body: InviteCreateBody, s: Session = Depends(get_session), claims: dict = Depends(require_owner_claims)) -> dict:
    """A one-hour, single-use code for the current group. **The only time it is readable.**"""
    group = current_group(s)
    row, code = create_invite(s, group_id=int(group.id), created_by=int(claims["player_id"]), note=body.note)
    s.commit()
    log.info("Invite %s created for group %s by player %s", row.id, group.slug, claims["player_id"])
    return {"id": int(row.id), "code": code, "group_slug": group.slug, "note": row.note, "expires_at": row.expires_at}


@router.get("/invites", response_model=list[InviteOut])
def list_invites(s: Session = Depends(get_session)) -> list[dict]:
    """The live codes of the current group — never the codes themselves."""
    group = current_group(s)
    return [_invite_out(s, row, group.slug) for row in list_live_invites(s, int(group.id))]


@router.delete("/invites/{invite_id}", response_model=OkResponse)
def delete_invite(invite_id: int, s: Session = Depends(get_session)) -> dict:
    group = current_group(s)
    if not revoke_invite(s, invite_id, int(group.id)):
        raise HTTPException(status_code=404, detail="Invite not found")
    s.commit()
    return {"ok": True}


# ---- reset links -------------------------------------------------------------------------


@router.post("/reset-links", response_model=ResetLinkOut, dependencies=[Depends(require_admin)])
def create_reset_link(
    request: Request,
    body: ResetLinkCreateBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_admin_claims),
) -> dict:
    """A one-hour, single-use link that sets a new password — also how a player who never
    had a login gets one. Site admin only: a reset takes the account over."""
    _get_account(s, body.player_id)
    row, token = create_reset(s, player_id=int(body.player_id), created_by=int(claims["player_id"]))
    s.commit()
    log.info("Reset link %s created for player %s by player %s", row.id, body.player_id, claims["player_id"])
    return {"player_id": int(body.player_id), "url": reset_url(link_origin(request), token, group_slug=current_group(s).slug), "expires_at": row.expires_at}


# ---- roles -------------------------------------------------------------------------------


@router.put("/groups/{slug}/members/{player_id}/role", response_model=AdminAccountOut)
def put_member_role(
    slug: str,
    player_id: int,
    body: MemberRoleBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_owner_claims),
) -> dict:
    """Promote a member to owner or demote an owner to member. Several owners are fine; the
    last one cannot be demoted (409)."""
    group = group_by_slug(s, slug)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    set_member_role(s, group_id=int(group.id), player_id=int(player_id), role=body.role, actor_claims=claims)
    s.commit()
    log.info("Player %s is now %s of %s (set by player %s)", player_id, body.role, group.slug, claims["player_id"])
    rows = _account_rows(s, [int(player_id)])
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    return rows[0]

