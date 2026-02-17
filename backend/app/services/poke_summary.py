from __future__ import annotations

from sqlmodel import Session, select

from ..models import PlayerPoke


def player_poke_summary(s: Session) -> list[dict]:
    """
    Aggregated poke info per profile (including poke ids).
    Used for unread poke indicators without loading full profile content.
    """
    rows = s.exec(
        select(
            PlayerPoke.profile_player_id,
            PlayerPoke.id,
            PlayerPoke.created_at,
        ).order_by(
            PlayerPoke.profile_player_id,
            PlayerPoke.created_at,
            PlayerPoke.id,
        )
    ).all()

    out: dict[int, dict] = {}
    for profile_player_id, poke_id, created_at in rows:
        pid = int(profile_player_id)
        eid = int(poke_id)
        item = out.get(pid)
        if not item:
            item = {
                "profile_player_id": pid,
                "total_pokes": 0,
                "latest_poke_id": 0,
                "latest_created_at": None,
                "poke_ids": [],
            }
            out[pid] = item

        item["total_pokes"] += 1
        item["latest_poke_id"] = max(int(item["latest_poke_id"]), eid)
        item["latest_created_at"] = created_at if item["latest_created_at"] is None else max(item["latest_created_at"], created_at)
        item["poke_ids"].append(eid)

    return list(out.values())

