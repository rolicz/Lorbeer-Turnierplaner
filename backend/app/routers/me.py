from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..auth import require_auth_claims
from ..db import get_session
from ..models import (
    Comment,
    CommentAuthorLink,
    CommentRead,
    CommentThreadLink,
    Player,
    PlayerGuestbookEntry,
    PlayerGuestbookRead,
    PlayerPoke,
    PlayerPokeRead,
)
from ..schemas.responses import MeOut

router = APIRouter(tags=["auth"])

# Personal in-app notifications: replies to the viewer's comments, pokes on their
# profile, and guestbook entries on their profile. Built entirely from existing
# read tables (no new storage) and keyed to the real logged-in player.
_NOTIF_LIMIT = 50
_SNIPPET_MAX = 90


@router.get("/me", response_model=MeOut)
def me(claims: dict = Depends(require_auth_claims)) -> dict:
    return {
        "role": claims.get("role"),
        "player_id": claims.get("player_id"),
        "player_name": claims.get("player_name"),
        "sub": claims.get("sub"),
        "iat": claims.get("iat"),
        "exp": claims.get("exp"),
    }


def _snippet(body: str | None) -> str:
    text = " ".join(str(body or "").split())
    if len(text) > _SNIPPET_MAX:
        return text[: _SNIPPET_MAX - 1].rstrip() + "…"
    return text


@router.get("/me/notifications")
def my_notifications(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    me_id = int(claims.get("player_id") or 0)
    if me_id <= 0:
        return {"items": [], "unread_count": 0}

    items: list[dict] = []
    author_ids: set[int] = set()

    # --- A) Replies to comments I really wrote (incl. ones shown as "General") ---
    authored_ids: set[int] = set(
        s.exec(
            select(CommentAuthorLink.comment_id).where(
                CommentAuthorLink.real_author_player_id == me_id
            )
        ).all()
    )
    # Legacy comments (no author link) fall back to the displayed author.
    legacy_mine: set[int] = set(
        s.exec(
            select(Comment.id).where(
                Comment.author_player_id == me_id,
                ~select(CommentAuthorLink.comment_id)
                .where(CommentAuthorLink.comment_id == Comment.id)
                .exists(),
            )
        ).all()
    )
    my_parent_ids = authored_ids | legacy_mine

    if my_parent_ids:
        reply_ids = set(
            s.exec(
                select(CommentThreadLink.comment_id).where(
                    CommentThreadLink.parent_comment_id.in_(my_parent_ids)
                )
            ).all()
        )
        if reply_ids:
            reply_author = dict(
                s.exec(
                    select(CommentAuthorLink.comment_id, CommentAuthorLink.real_author_player_id).where(
                        CommentAuthorLink.comment_id.in_(reply_ids)
                    )
                ).all()
            )
            read_ids = set(
                s.exec(
                    select(CommentRead.comment_id).where(
                        CommentRead.player_id == me_id,
                        CommentRead.comment_id.in_(reply_ids),
                    )
                ).all()
            )
            replies = s.exec(select(Comment).where(Comment.id.in_(reply_ids))).all()
            for c in replies:
                real_author = reply_author.get(int(c.id), c.author_player_id)
                if real_author == me_id:
                    continue  # don't notify me about my own replies
                if int(c.id) in read_ids:
                    continue
                if c.author_player_id is not None:
                    author_ids.add(int(c.author_player_id))
                items.append(
                    {
                        "kind": "comment_reply",
                        "id": int(c.id),
                        "tournament_id": int(c.tournament_id),
                        "match_id": int(c.match_id) if c.match_id is not None else None,
                        "author_player_id": int(c.author_player_id) if c.author_player_id is not None else None,
                        "snippet": _snippet(c.body),
                        "created_at": c.created_at.isoformat(),
                        "path": f"/live/{int(c.tournament_id)}?comment={int(c.id)}",
                    }
                )

    # --- B) Guestbook entries left on my profile ---
    gb_entries = s.exec(
        select(PlayerGuestbookEntry)
        .where(
            PlayerGuestbookEntry.profile_player_id == me_id,
            PlayerGuestbookEntry.author_player_id != me_id,
        )
        .order_by(PlayerGuestbookEntry.created_at.desc())
        .limit(100)
    ).all()
    if gb_entries:
        gb_read = set(
            s.exec(
                select(PlayerGuestbookRead.guestbook_entry_id).where(
                    PlayerGuestbookRead.player_id == me_id
                )
            ).all()
        )
        for e in gb_entries:
            if int(e.id) in gb_read:
                continue
            author_ids.add(int(e.author_player_id))
            items.append(
                {
                    "kind": "guestbook",
                    "id": int(e.id),
                    "profile_player_id": int(e.profile_player_id),
                    "author_player_id": int(e.author_player_id),
                    "snippet": _snippet(e.body),
                    "created_at": e.created_at.isoformat(),
                    "path": f"/profiles/{me_id}#guestbook-entry-{int(e.id)}",
                }
            )

    # --- C) Pokes ("anpöbeln") on my profile ---
    pokes = s.exec(
        select(PlayerPoke)
        .where(
            PlayerPoke.profile_player_id == me_id,
            PlayerPoke.author_player_id != me_id,
        )
        .order_by(PlayerPoke.created_at.desc())
        .limit(100)
    ).all()
    if pokes:
        poke_read = set(
            s.exec(
                select(PlayerPokeRead.poke_id).where(PlayerPokeRead.player_id == me_id)
            ).all()
        )
        for k in pokes:
            if int(k.id) in poke_read:
                continue
            author_ids.add(int(k.author_player_id))
            items.append(
                {
                    "kind": "poke",
                    "id": int(k.id),
                    "profile_player_id": int(k.profile_player_id),
                    "author_player_id": int(k.author_player_id),
                    "snippet": "",
                    "created_at": k.created_at.isoformat(),
                    "path": f"/profiles/{me_id}",
                }
            )

    # Resolve author display names in one query.
    name_by_id: dict[int, str] = {}
    if author_ids:
        for pid, name in s.exec(
            select(Player.id, Player.display_name).where(Player.id.in_(author_ids))
        ).all():
            name_by_id[int(pid)] = name
    for it in items:
        apid = it.get("author_player_id")
        it["author_name"] = name_by_id.get(int(apid), "General") if apid is not None else "General"

    # Newest first; unread_count is the full count, items are capped.
    items.sort(key=lambda it: it["created_at"], reverse=True)
    return {"items": items[:_NOTIF_LIMIT], "unread_count": len(items)}
