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

from fastapi import HTTPException
from sqlmodel import Session, select

from ..api_utils import conflict, forbidden
from ..models import Account, Group, GroupMembership, Player
from .auth_migration import DEFAULT_GROUP_NAME, DEFAULT_GROUP_SLUG

__all__ = [
    "DEFAULT_GROUP_NAME",
    "DEFAULT_GROUP_SLUG",
    "build_claims",
    "current_group",
    "effective_role",
    "ensure_shared_group",
    "group_by_slug",
    "group_prefix_for_push",
    "is_member",
    "memberships_for",
    "roster_for",
    "set_member_role",
    "shares_group",
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


# ---- owner operations, the roster, push (L3) --------------------------------------------


def group_by_slug(s: Session, slug: str) -> Group | None:
    return s.exec(select(Group).where(Group.slug == str(slug or "").strip().lower())).first()


def set_member_role(s: Session, *, group_id: int, player_id: int, role: str, actor_claims: dict) -> GroupMembership:
    """Make a member an owner, or an owner a member. The actor must own **that** group or be
    a site admin (403 otherwise); the target must be a member of it (404); the last owner
    cannot be demoted by anyone (409) — a group always has someone who can invite. Several
    owners are fine. The caller commits."""
    if role not in MEMBERSHIP_ROLES:
        raise ValueError(f"unknown membership role: {role!r}")
    if not actor_claims.get("site_admin"):
        actor = s.get(GroupMembership, (int(group_id), int(actor_claims.get("player_id") or 0)))
        if actor is None or actor.role != "owner":
            forbidden("Only an owner of this group can change roles")
    membership = s.get(GroupMembership, (int(group_id), int(player_id)))
    if membership is None:
        raise HTTPException(status_code=404, detail="Not a member of this group")
    if membership.role == role:
        return membership
    if membership.role == "owner" and role != "owner":
        owners = s.exec(
            select(GroupMembership.player_id).where(GroupMembership.group_id == int(group_id), GroupMembership.role == "owner")
        ).all()
        if len(owners) <= 1:
            conflict("A group needs at least one owner — make someone else an owner first")
    membership.role = role
    s.add(membership)
    s.flush()
    return membership


def roster_for(s: Session, claims: dict) -> list[Player]:
    """The players this caller may see in rosters, pickers and stats: the members of every
    group the caller is in; a site admin sees everyone. A registered account nobody has
    invited yet is therefore in nobody's roster. Sorted by display name."""
    if claims.get("site_admin"):
        return list(s.exec(select(Player).order_by(Player.display_name)).all())
    group_ids = [int(g["id"]) for g in claims.get("groups") or []]
    if not group_ids:
        return []
    member_ids = select(GroupMembership.player_id).where(GroupMembership.group_id.in_(group_ids))
    return list(s.exec(select(Player).where(Player.id.in_(member_ids)).order_by(Player.display_name)).all())


def shares_group(s: Session, claims: dict, player_id: int) -> bool:
    """Whether the caller may see this player's profile, wall and pokes: a site admin sees
    everyone, anyone sees themselves, and otherwise the two must have at least one group in
    common. The caller's groups come from the claims (the gate already resolved them); the
    target's are one indexed lookup."""
    if claims.get("site_admin"):
        return True
    if int(claims.get("player_id") or 0) == int(player_id):
        return True
    group_ids = [int(g["id"]) for g in claims.get("groups") or []]
    if not group_ids:
        return False
    row = s.exec(
        select(GroupMembership.group_id).where(
            GroupMembership.player_id == int(player_id), GroupMembership.group_id.in_(group_ids)
        )
    ).first()
    return row is not None


def ensure_shared_group(s: Session, claims: dict, player_id: int) -> None:
    """403 "Not in your group" unless the caller shares a group with this player (L11).

    The server half of the one rule `PlayerLink` answers in the browser: a profile — and
    everything hung off it (the wall, the pokes, the avatar and header image) — is openable
    only by someone who shares a group with its player, the site admin excepted. A player
    that does not exist is let through, so the endpoint's own 404 still answers it."""
    if s.get(Player, int(player_id)) is None:
        return
    if not shares_group(s, claims, player_id):
        forbidden("Not in your group")


def group_prefix_for_push(s: Session, player_id: int, group_id: int | None = None) -> str:
    """`"<Group name> · "` when the recipient is in two or more groups, else `""` — a push
    names its group only when the reader could not otherwise tell which one it is about.
    `group_id` is the group the event belongs to; part 1 has one, so it defaults to the
    current group."""
    count = len(s.exec(select(GroupMembership.group_id).where(GroupMembership.player_id == int(player_id))).all())
    if count < 2:
        return ""
    group = s.get(Group, int(group_id)) if group_id is not None else None
    if group is None:
        try:
            group = current_group(s)
        except LookupError:
            return ""
    return f"{group.name} · "
