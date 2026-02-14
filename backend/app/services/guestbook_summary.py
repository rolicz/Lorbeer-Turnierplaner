from __future__ import annotations

from sqlmodel import Session, select

from ..models import PlayerGuestbookEntry


def player_guestbook_summary(s: Session) -> list[dict]:
    """
    Aggregated guestbook info per profile (including entry ids).
    Used for local "unseen guestbook" indicators without fetching every profile body.
    """
    rows = s.exec(
        select(
            PlayerGuestbookEntry.profile_player_id,
            PlayerGuestbookEntry.id,
            PlayerGuestbookEntry.created_at,
        ).order_by(
            PlayerGuestbookEntry.profile_player_id,
            PlayerGuestbookEntry.created_at,
            PlayerGuestbookEntry.id,
        )
    ).all()

    out: dict[int, dict] = {}
    for profile_player_id, entry_id, created_at in rows:
        pid = int(profile_player_id)
        eid = int(entry_id)
        item = out.get(pid)
        if not item:
            item = {
                "profile_player_id": pid,
                "total_entries": 0,
                "latest_entry_id": 0,
                "latest_created_at": None,
                "entry_ids": [],
            }
            out[pid] = item

        item["total_entries"] += 1
        item["latest_entry_id"] = max(int(item["latest_entry_id"]), eid)
        item["latest_created_at"] = created_at if item["latest_created_at"] is None else max(item["latest_created_at"], created_at)
        item["entry_ids"].append(eid)

    return list(out.values())
