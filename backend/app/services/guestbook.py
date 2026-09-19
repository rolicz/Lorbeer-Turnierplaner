from __future__ import annotations

import datetime as dt

from sqlmodel import Session, select

from ..models import (
    Player,
    PlayerGuestbookEntry,
    PlayerGuestbookThreadLink,
    PlayerGuestbookVote,
)
from .guestbook_subjects import subjects_for_entries

GUESTBOOK_EDIT_WINDOW = dt.timedelta(hours=1)


def guestbook_can_edit(
    entry: PlayerGuestbookEntry,
    *,
    viewer_id: int | None,
    is_admin: bool,
    now: dt.datetime | None = None,
) -> bool:
    if is_admin:
        return True
    if viewer_id is None or int(entry.author_player_id) != int(viewer_id):
        return False
    return (now or dt.datetime.utcnow()) - entry.created_at <= GUESTBOOK_EDIT_WINDOW


def guestbook_entry_payload(
    *,
    entry: PlayerGuestbookEntry,
    author_display_name: str,
    parent_entry_id: int | None = None,
    upvotes: int = 0,
    downvotes: int = 0,
    my_vote: int | None = None,
    can_edit: bool = False,
    subject: dict | None = None,
) -> dict:
    return {
        "id": int(entry.id),
        "profile_player_id": int(entry.profile_player_id),
        "author_player_id": int(entry.author_player_id),
        "author_display_name": author_display_name,
        "parent_entry_id": int(parent_entry_id) if parent_entry_id is not None else None,
        "body": entry.body,
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "upvotes": int(upvotes),
        "downvotes": int(downvotes),
        "my_vote": int(my_vote) if my_vote in (-1, 1) else 0,
        "can_edit": bool(can_edit),
        # What the entry is about, as it was then (K1) — `None` for an untagged entry
        # and for every reply. `current` inside it is the server's answer, not the
        # frontend's.
        "subject": subject,
    }


def list_guestbook_entries(s: Session, player_id: int, claims: dict | None) -> list[dict]:
    rows = s.exec(
        select(PlayerGuestbookEntry)
        .where(PlayerGuestbookEntry.profile_player_id == player_id)
        .order_by(PlayerGuestbookEntry.created_at.desc(), PlayerGuestbookEntry.id.desc())
    ).all()
    entry_ids = [int(row.id) for row in rows]

    parent_by_entry_id: dict[int, int | None] = {}
    votes_by_entry_id: dict[int, dict[str, int]] = {}
    my_vote_by_entry_id: dict[int, int] = {}
    subject_by_entry_id = subjects_for_entries(s, player_id=int(player_id), entry_ids=entry_ids)
    if entry_ids:
        links = s.exec(
            select(PlayerGuestbookThreadLink.entry_id, PlayerGuestbookThreadLink.parent_entry_id).where(
                PlayerGuestbookThreadLink.entry_id.in_(entry_ids)
            )
        ).all()
        parent_by_entry_id = {int(entry_id): int(parent_entry_id) for entry_id, parent_entry_id in links}

        vote_rows = s.exec(
            select(PlayerGuestbookVote.guestbook_entry_id, PlayerGuestbookVote.value).where(
                PlayerGuestbookVote.guestbook_entry_id.in_(entry_ids)
            )
        ).all()
        for entry_id, value in vote_rows:
            eid = int(entry_id)
            slot = votes_by_entry_id.setdefault(eid, {"up": 0, "down": 0})
            if int(value) > 0:
                slot["up"] += 1
            elif int(value) < 0:
                slot["down"] += 1

        if claims and claims.get("player_id") is not None:
            viewer_player_id = int(claims.get("player_id"))
            my_rows = s.exec(
                select(PlayerGuestbookVote.guestbook_entry_id, PlayerGuestbookVote.value).where(
                    PlayerGuestbookVote.player_id == viewer_player_id,
                    PlayerGuestbookVote.guestbook_entry_id.in_(entry_ids),
                )
            ).all()
            my_vote_by_entry_id = {int(entry_id): int(value) for entry_id, value in my_rows}

    author_ids = sorted({int(row.author_player_id) for row in rows})
    authors = s.exec(select(Player).where(Player.id.in_(author_ids))).all() if author_ids else []
    author_name_by_id = {int(p.id): p.display_name for p in authors}
    viewer_id = int(claims["player_id"]) if claims and claims.get("player_id") is not None else None
    is_admin = bool(claims and str(claims.get("role") or "") == "admin")
    now = dt.datetime.utcnow()

    return [
        guestbook_entry_payload(
            entry=row,
            author_display_name=author_name_by_id.get(int(row.author_player_id), f"Player #{int(row.author_player_id)}"),
            parent_entry_id=parent_by_entry_id.get(int(row.id)),
            upvotes=votes_by_entry_id.get(int(row.id), {}).get("up", 0),
            downvotes=votes_by_entry_id.get(int(row.id), {}).get("down", 0),
            my_vote=my_vote_by_entry_id.get(int(row.id), 0),
            can_edit=guestbook_can_edit(row, viewer_id=viewer_id, is_admin=is_admin, now=now),
            subject=subject_by_entry_id.get(int(row.id)),
        )
        for row in rows
    ]
