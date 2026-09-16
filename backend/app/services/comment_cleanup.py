"""
Deleting a comment means deleting everything that hangs off it — in one place.

A comment is not a single row: it owns a read mark per player, a vote per player, an
image (a metadata row **and** a file on disk), a thread link to its parent, an author
link, and possibly the tournament's pin. Two callers destroy comments — the admin's
`DELETE /comments/{id}` and the 2v2 re-assign, which has to take the match-tied ones
with the schedule it rebuilds (Q5) — and a dependent table that only one of them knows
about is a bug waiting for the next feature. So both go through here.

Why re-assign must delete at all: `_delete_schedule` destroys the `Match` rows and
builds new ones, so every match id changes. `Comment.match_id` would be left pointing
at a dead id, nothing enforces the foreign key (A9 declined `PRAGMA foreign_keys=ON`
as too wide a change) and `match.id` has no AUTOINCREMENT — SQLite hands those ids out
again, so a stale comment would silently reattach itself to an unrelated future match.

The filesystem is deliberately *not* touched here: these functions only stage row
deletes in the caller's transaction and hand back the image paths, so the caller
unlinks after its commit and a failed transaction never leaves a hole where a file was.
"""
from __future__ import annotations

from sqlmodel import Session, select

from ..models import (
    Comment,
    CommentAuthorLink,
    CommentImageFile,
    CommentRead,
    CommentThreadLink,
    CommentVote,
    TournamentPinnedComment,
)


def with_reply_subtree(s: Session, tournament_id: int, root_ids: list[int] | set[int]) -> list[int]:
    """`root_ids` plus every reply under them, transitively (one tournament's threads)."""
    roots = {int(i) for i in root_ids}
    if not roots:
        return []

    links = s.exec(
        select(CommentThreadLink.comment_id, CommentThreadLink.parent_comment_id)
        .join(Comment, Comment.id == CommentThreadLink.comment_id)
        .where(Comment.tournament_id == tournament_id)
    ).all()
    children_by_parent: dict[int, list[int]] = {}
    for child_id, parent_id in links:
        children_by_parent.setdefault(int(parent_id), []).append(int(child_id))

    collected: set[int] = set()
    stack = list(roots)
    while stack:
        current = stack.pop()
        if current in collected:
            continue
        collected.add(current)
        stack.extend(children_by_parent.get(current, []))
    return sorted(collected)


def match_comment_ids(s: Session, tournament_id: int, match_ids: list[int]) -> list[int]:
    """Every comment filed under one of these matches, replies included.

    Tournament-wide comments are not touched: they survive a rebuilt schedule because
    they never named a match in the first place.
    """
    ids = [int(m) for m in match_ids]
    if not ids:
        return []
    roots = s.exec(
        select(Comment.id).where(Comment.tournament_id == tournament_id, Comment.match_id.in_(ids))
    ).all()
    return with_reply_subtree(s, tournament_id, [int(i) for i in roots])


def delete_comment_rows(s: Session, tournament_id: int, comment_ids: list[int]) -> list[str]:
    """Delete these comments and every row that hangs off them. Returns image paths to unlink.

    Does not commit — the caller owns the transaction.
    """
    ids = [int(i) for i in comment_ids]
    if not ids:
        return []
    id_set = set(ids)

    pin = s.get(TournamentPinnedComment, tournament_id)
    if pin is not None and pin.comment_id is not None and int(pin.comment_id) in id_set:
        s.delete(pin)

    image_paths: list[str] = []
    for img_row in s.exec(select(CommentImageFile).where(CommentImageFile.comment_id.in_(ids))).all():
        image_paths.append(img_row.file_path)
        s.delete(img_row)
    for rr in s.exec(select(CommentRead).where(CommentRead.comment_id.in_(ids))).all():
        s.delete(rr)
    for vr in s.exec(select(CommentVote).where(CommentVote.comment_id.in_(ids))).all():
        s.delete(vr)
    # Both directions: a link is dead whether the child or the parent is going away.
    for lk in s.exec(
        select(CommentThreadLink).where(
            CommentThreadLink.comment_id.in_(ids) | CommentThreadLink.parent_comment_id.in_(ids)
        )
    ).all():
        s.delete(lk)
    for al in s.exec(select(CommentAuthorLink).where(CommentAuthorLink.comment_id.in_(ids))).all():
        s.delete(al)
    for cm in s.exec(select(Comment).where(Comment.id.in_(ids))).all():
        s.delete(cm)

    return image_paths
