"""Events on an idea: written, removed, marked read — and **who cares about one**.

This module is the only place that touches `FeatureRequestEvent` /
`FeatureRequestEventRead`, and the only place that answers "who should hear about
this". Both channels ask the same question — push (P2) and the bell (P3) — and they
must answer it identically: if they ever disagree, a phone buzzes for something the
bell never shows, and nobody notices because the two are never compared. So the rule
lives here once, in `idea_event_audience`, and `idea_event_reaches` is the same
function asked about one person.

The rule (Roli, 2026-09-19), per event kind, **never including the actor**:

* ``created`` — the admins. Identity of an admin is the caller's business: push
  passes `admin_player_ids(request, s)` (the accounts in `secrets.json`), the bell
  passes the viewer when the token says `role == "admin"`.
* ``comment`` — the idea's author **plus every player who has already commented on
  that idea**. Participation, not permission: an admin who commented is a
  participant like anyone else, an admin who has not still hears nothing. The set is
  computed from the comment rows themselves, so a deleted comment takes its author
  out again (if they have no other comment there).
* ``vote`` — the idea's author alone. A like is about the idea, not the conversation.
* ``status`` — the idea's author alone. Triage is an answer to the author.

None of the writers commit; the router owns the transaction, as everywhere else.
"""
from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

from sqlmodel import Session, select

from ..models import (
    FeatureRequest,
    FeatureRequestComment,
    FeatureRequestEvent,
    FeatureRequestEventRead,
)

#: Every kind an idea event can have, in the order they appear in an idea's life.
IDEA_EVENT_KINDS: tuple[str, ...] = ("created", "comment", "vote", "status")

#: The kinds that are about one idea's own author (the other one is "created").
_AUTHOR_KINDS: frozenset[str] = frozenset({"comment", "vote", "status"})


# ---- writing ------------------------------------------------------------


def record_idea_event(
    s: Session,
    *,
    request_id: int,
    kind: str,
    actor_player_id: int,
    comment_id: int | None = None,
    status: str = "",
    status_note: str = "",
    now: dt.datetime | None = None,
) -> FeatureRequestEvent:
    """Log one event **and mark it read for the actor**. Does not commit.

    The actor's read row is written here for the same reason the guestbook writes
    one for the author of an entry: nobody is told about their own action, and a
    read row is a cheaper guarantee of that than a filter every reader has to
    remember.
    """
    moment = now or dt.datetime.utcnow()
    event = FeatureRequestEvent(
        request_id=int(request_id),
        kind=str(kind),
        actor_player_id=int(actor_player_id),
        comment_id=int(comment_id) if comment_id is not None else None,
        status=str(status or ""),
        status_note=str(status_note or ""),
        created_at=moment,
    )
    s.add(event)
    s.flush()
    s.add(
        FeatureRequestEventRead(
            player_id=int(actor_player_id), event_id=int(event.id), read_at=moment
        )
    )
    return event


def delete_idea_events(
    s: Session,
    *,
    request_id: int,
    kind: str | None = None,
    actor_player_id: int | None = None,
    comment_id: int | None = None,
) -> int:
    """Delete matching events and their read rows. Returns how many. No commit."""
    stmt = select(FeatureRequestEvent).where(FeatureRequestEvent.request_id == int(request_id))
    if kind is not None:
        stmt = stmt.where(FeatureRequestEvent.kind == str(kind))
    if actor_player_id is not None:
        stmt = stmt.where(FeatureRequestEvent.actor_player_id == int(actor_player_id))
    if comment_id is not None:
        stmt = stmt.where(FeatureRequestEvent.comment_id == int(comment_id))

    events = s.exec(stmt).all()
    if not events:
        return 0
    event_ids = [int(e.id) for e in events]
    for row in s.exec(
        select(FeatureRequestEventRead).where(FeatureRequestEventRead.event_id.in_(event_ids))
    ).all():
        s.delete(row)
    for event in events:
        s.delete(event)
    return len(events)


def delete_idea_comments(s: Session, *, request_id: int) -> int:
    """Delete every comment row of an idea. Returns how many. No commit.

    The events that name them go through `delete_idea_events(request_id=…)`; this
    only removes the rows the comments themselves live in.
    """
    rows = s.exec(
        select(FeatureRequestComment).where(FeatureRequestComment.request_id == int(request_id))
    ).all()
    for row in rows:
        s.delete(row)
    return len(rows)


def mark_idea_events_read(
    s: Session, *, player_id: int, request_id: int, now: dt.datetime | None = None
) -> int:
    """Mark every event on this idea read for this player. Returns how many were new.

    "Read" means "you opened it": the board calls this when the `?idea=` deep link is
    consumed and when a viewer expands an idea's comments. Idempotent — a second call
    marks 0.
    """
    event_ids = [
        int(eid)
        for eid in s.exec(
            select(FeatureRequestEvent.id).where(FeatureRequestEvent.request_id == int(request_id))
        ).all()
    ]
    if not event_ids:
        return 0
    already = {
        int(eid)
        for eid in s.exec(
            select(FeatureRequestEventRead.event_id).where(
                FeatureRequestEventRead.player_id == int(player_id),
                FeatureRequestEventRead.event_id.in_(event_ids),
            )
        ).all()
    }
    moment = now or dt.datetime.utcnow()
    marked = 0
    for eid in event_ids:
        if eid in already:
            continue
        s.add(FeatureRequestEventRead(player_id=int(player_id), event_id=eid, read_at=moment))
        marked += 1
    return marked


# ---- the audience -------------------------------------------------------


def idea_comment_participants(s: Session, request_id: int) -> set[int]:
    """Everyone who has a comment on this idea *right now*.

    Read live from the comment rows, never cached: that is what makes a deleted
    comment stop notifying its author (unless they said something else there).
    """
    rows = s.exec(
        select(FeatureRequestComment.author_player_id).where(
            FeatureRequestComment.request_id == int(request_id)
        )
    ).all()
    return {int(pid) for pid in rows}


def idea_event_audience(
    s: Session,
    *,
    request_id: int,
    kind: str,
    actor_player_id: int,
    idea_author_player_id: int | None = None,
    admin_player_ids: Iterable[int] = (),
) -> list[int]:
    """Who should hear about this event — the one answer both channels use.

    `idea_author_player_id` is a shortcut for a caller that already holds the idea
    row; leave it out and the author is looked up. `admin_player_ids` is only read
    for `kind == "created"`, because "who is an admin" is not this module's business:
    push resolves it from the accounts, the bell from the token's role.

    The actor is removed last, in every case. An unknown kind addresses nobody.
    """
    kind = str(kind or "")
    audience: set[int] = set()

    if kind == "created":
        audience |= {int(pid) for pid in admin_player_ids}
    elif kind in _AUTHOR_KINDS:
        author = idea_author_player_id
        if author is None:
            fr = s.get(FeatureRequest, int(request_id))
            author = int(fr.author_player_id) if fr is not None else None
        if author is not None:
            audience.add(int(author))
        if kind == "comment":
            # Once you have said something in a thread you hear the replies,
            # whoever you are. Role is not consulted here on purpose.
            audience |= idea_comment_participants(s, request_id)
    else:
        return []

    audience.discard(int(actor_player_id))
    return sorted(audience)


def idea_event_reaches(
    s: Session,
    event: FeatureRequestEvent,
    *,
    player_id: int,
    is_admin: bool,
    idea_author_player_id: int | None = None,
) -> bool:
    """Does this event reach this player? The same rule, asked about one person.

    Written in terms of `idea_event_audience` so the bell cannot drift from the push:
    being an admin is passed as "the admin list is me", which is exactly what
    `created` asks about.

    A caller that reads many events (the bell) should narrow the candidates in SQL
    first — events on ideas this player authored, events on ideas this player has
    commented on, and `created` events for an admin — and then let this function
    decide. The SQL is a narrowing; **this** is the rule.
    """
    me = int(player_id)
    return me in idea_event_audience(
        s,
        request_id=int(event.request_id),
        kind=str(event.kind),
        actor_player_id=int(event.actor_player_id),
        idea_author_player_id=idea_author_player_id,
        admin_player_ids=(me,) if is_admin else (),
    )


def idea_ids_commented_on_by(s: Session, player_id: int) -> list[int]:
    """The ideas this player has a comment on — the candidate narrowing for a reader
    of many events (the bell). The audience rule itself stays in the two functions
    above; this only keeps a query from scanning every event in the table.
    """
    rows = s.exec(
        select(FeatureRequestComment.request_id).where(
            FeatureRequestComment.author_player_id == int(player_id)
        )
    ).all()
    return sorted({int(rid) for rid in rows})
