"""Groups, memberships and the effective role (L2).

Part 1 has exactly one group (`altherren`, seeded by the boot migration); part 2 will teach
`current_group` to read the slug from the URL and every reader to filter by it. Until then
this module is the **one** place that answers three questions:

- which group is "the" group right now (`current_group`),
- which groups a player is in, and as what (`memberships_for`),
- what a caller may do here, given who they are and where they are (`effective_role`).

`build_claims` folds those into the claims dict the auth gate writes into `request.state`
and the login endpoints return — one builder, so the gate and a fresh login cannot disagree
about what a session means.
"""

from __future__ import annotations

from sqlmodel import Session, select

from ..models import Account, Group, GroupMembership, Player
from .auth_migration import DEFAULT_GROUP_NAME, DEFAULT_GROUP_SLUG

__all__ = [
    "DEFAULT_GROUP_NAME",
    "DEFAULT_GROUP_SLUG",
    "build_claims",
    "current_group",
    "effective_role",
    "is_member",
    "memberships_for",
]

#: Membership roles, as stored in `GroupMembership.role`.
MEMBERSHIP_ROLES: tuple[str, ...] = ("owner", "member")


def current_group(s: Session) -> Group:
    """The group every request is about in part 1: the `altherren` row.

    Raises `LookupError` when no group exists at all, which only happens before `init_db()`
    has run the boot migration — the gate treats that as "no membership" rather than a 500."""
    group = s.exec(select(Group).where(Group.slug == DEFAULT_GROUP_SLUG)).first()
    if group is None:
        group = s.exec(select(Group).order_by(Group.id.asc())).first()
    if group is None:
        raise LookupError("no group exists yet — init_db() has not run the auth migration")
    return group


def memberships_for(s: Session, player_id: int) -> list[tuple[Group, str]]:
    """Every group this player is in, with the membership role, oldest group first."""
    rows = s.exec(
        select(Group, GroupMembership.role)
        .join(GroupMembership, GroupMembership.group_id == Group.id)
        .where(GroupMembership.player_id == int(player_id))
        .order_by(Group.id.asc())
    ).all()
    return [(group, str(role)) for group, role in rows]


def is_member(s: Session, player_id: int, group_id: int) -> bool:
    return s.get(GroupMembership, (int(group_id), int(player_id))) is not None


def effective_role(*, site_admin: bool, membership_role: str | None) -> str:
    """What the caller is *here*: `admin` (site admin, everywhere) › `owner` › `editor`
    (a plain member — today's editor) › `none` (a session with no membership)."""
    if site_admin:
        return "admin"
    if membership_role == "owner":
        return "owner"
    if membership_role == "member":
        return "editor"
    return "none"


def build_claims(s: Session, *, player_id: int, session_id: int | None) -> dict | None:
    """The claims dict behind `request.state.claims`, or None when the player has no account.

    Shape: `{player_id, player_name, role, site_admin, session_id, groups: [{id, slug, name,
    role}]}` — `role` is the effective role in the current group, `groups[].role` the raw
    membership role. Everything a router used to read off the JWT (`player_id`,
    `player_name`, `role`) keeps its name."""
    # One query for the account and the player (the gate runs this on every request).
    pair = s.exec(
        select(Account, Player).join(Player, Player.id == Account.player_id).where(Account.player_id == int(player_id))
    ).first()
    if pair is None:
        return None
    account, player = pair

    memberships = memberships_for(s, int(player_id))
    # The current group is the default slug (part 1); when the player is in it, the row is
    # already in hand. Only a non-member pays for `current_group`'s own lookup.
    role_here: str | None = None
    group_here = next((group for group, _ in memberships if group.slug == DEFAULT_GROUP_SLUG), None)
    if group_here is None:
        try:
            group_here = current_group(s)
        except LookupError:
            group_here = None
    if group_here is not None:
        for group, role in memberships:
            if group.id == group_here.id:
                role_here = role
                break

    return {
        "player_id": int(player_id),
        "player_name": player.display_name,
        "role": effective_role(site_admin=bool(account.site_admin), membership_role=role_here),
        "site_admin": bool(account.site_admin),
        "session_id": int(session_id) if session_id is not None else None,
        "groups": [
            {
                "id": int(group.id),
                "slug": group.slug,
                "name": group.name,
                "role": role,
            }
            for group, role in memberships
        ],
    }
