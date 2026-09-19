"""
A guestbook entry can be *about* something on the profile — the header image, the About
text or the avatar (K1). This module is the only place that reads or writes
`PlayerSubjectSnapshot` and `PlayerGuestbookEntrySubject`.

Why a snapshot exists at all: an avatar and a header image are **one file per player,
overwritten in place** (`avatars/{player_id}.{ext}`), and the About text is a single
`PlayerProfile.bio` column. Change any of them and every comment written about the old
one would silently point at the new one. So the **first** entry filed against the current
version pins it — the file is copied aside once, the text is snapshotted once — and later
entries on that same version share the pin. Nothing nobody commented on is kept: the
storage tracks the conversation, not the upload history (Roli, 2026-09-19).

The version is the source row's `updated_at` at capture time
(`PlayerHeaderImageFile.updated_at` / `PlayerAvatarFile.updated_at` / the bio's
`PlayerProfile.updated_at`), which is what makes "one copy per version" a unique
constraint rather than a convention.

`current` — "is this still what the profile shows" — is computed **here**, server-side,
and the frontend renders it and never re-derives the rule (the A10 shape).
"""
from __future__ import annotations

import datetime as dt

from sqlmodel import Session, select

from ..models import (
    PlayerAvatarFile,
    PlayerGuestbookEntry,
    PlayerGuestbookEntrySubject,
    PlayerHeaderImageFile,
    PlayerProfile,
    PlayerSubjectSnapshot,
)
from .file_storage import (
    GUESTBOOK_SUBJECT_DIR,
    delete_media,
    list_media,
    media_path_for_guestbook_subject,
    read_media,
    write_media,
)

SUBJECT_KINDS: tuple[str, ...] = ("header_image", "about", "avatar")
IMAGE_KINDS: tuple[str, ...] = ("header_image", "avatar")

_LABEL = {"header_image": "header image", "about": "About text", "avatar": "avatar"}
_IMAGE_ROW_CLS = {"header_image": PlayerHeaderImageFile, "avatar": PlayerAvatarFile}


class SubjectUnavailable(Exception):
    """The subject is not on the profile right now — the router answers 409 with the message."""


def normalize_subject_kind(raw: str | None) -> str | None:
    """'' / None → None; a known kind → itself; anything else → ValueError."""
    kind = str(raw or "").strip()
    if not kind:
        return None
    if kind not in SUBJECT_KINDS:
        raise ValueError(f"Unknown subject kind: {kind}")
    return kind


def _unavailable(kind: str) -> SubjectUnavailable:
    """The 409's words: what changed under you, and which thing it was."""
    return SubjectUnavailable(f"There is no {_LABEL.get(kind, kind)} to comment on right now")


def find_or_create_snapshot(
    s: Session,
    *,
    player_id: int,
    kind: str,
    now: dt.datetime | None = None,
) -> PlayerSubjectSnapshot:
    """The snapshot of the *current* version of this subject, made if it does not exist.

    Called by the router **before** the entry is inserted, so a subject that is not there
    costs nothing: it raises `SubjectUnavailable` and no row has been written yet. The
    pinned copy is written before the commit, exactly as every `upsert_media_row` write
    is today, so a commit that then fails leaves a file with no row — which
    `sweep_orphan_subjects` removes on the next boot. Does not commit.
    """
    kind = normalize_subject_kind(kind) or ""
    if kind not in SUBJECT_KINDS:
        raise ValueError(f"Unknown subject kind: {kind}")
    captured_at = now or dt.datetime.utcnow()

    text = ""
    content_type = ""
    data: bytes | None = None
    if kind == "about":
        profile = s.get(PlayerProfile, int(player_id))
        text = str(profile.bio or "").strip() if profile is not None else ""
        if profile is None or not text:
            raise _unavailable(kind)
        version = profile.updated_at
    else:
        row = s.get(_IMAGE_ROW_CLS[kind], int(player_id))
        if row is None:
            raise _unavailable(kind)
        version = row.updated_at
        content_type = row.content_type

    existing = s.exec(
        select(PlayerSubjectSnapshot).where(
            PlayerSubjectSnapshot.player_id == int(player_id),
            PlayerSubjectSnapshot.kind == kind,
            PlayerSubjectSnapshot.source_updated_at == version,
        )
    ).first()
    if existing is not None:
        # Two entries about the same picture share one copy.
        return existing

    if kind != "about":
        # A metadata row whose file is gone is the same "not there" as no row at all —
        # `get_player_header_image` 404s it for the same reason.
        data = read_media(row.file_path)
        if data is None:
            raise _unavailable(kind)

    snap = PlayerSubjectSnapshot(
        player_id=int(player_id),
        kind=kind,
        source_updated_at=version,
        text=text,
        content_type=content_type,
        file_path="",
        file_size=0,
        captured_at=captured_at,
    )
    s.add(snap)
    s.flush()  # the id is the pinned copy's filename

    if data is not None:
        rel_path = media_path_for_guestbook_subject(int(snap.id), content_type)
        snap.file_size = write_media(rel_path, data)
        snap.file_path = rel_path
        s.add(snap)
        s.flush()
    return snap


def attach_subject(s: Session, *, entry_id: int, snapshot_id: int) -> None:
    """Adds the link. A stale row for this entry id (A9: ids are reused) is replaced. No commit."""
    link = s.get(PlayerGuestbookEntrySubject, int(entry_id))
    if link is None:
        link = PlayerGuestbookEntrySubject(entry_id=int(entry_id), snapshot_id=int(snapshot_id))
    else:
        link.snapshot_id = int(snapshot_id)
    s.add(link)


def subject_payload(snap: PlayerSubjectSnapshot, *, current: bool) -> dict:
    return {
        "kind": snap.kind,
        "snapshot_id": int(snap.id),
        "captured_at": snap.captured_at,
        "text": snap.text or "",
        "has_image": bool(snap.file_path),
        "current": bool(current),
    }


def subjects_for_entries(s: Session, *, player_id: int, entry_ids: list[int]) -> dict[int, dict]:
    """entry_id → subject payload for every tagged entry among `entry_ids`.

    `current` is version equality for an image (the live row exists and its `updated_at`
    is the snapshot's) and **text** equality for the About: re-saving the same words is a
    new version but not a change, and the chip must not call it one.
    """
    ids = [int(i) for i in entry_ids]
    if not ids:
        return {}

    rows = s.exec(
        select(PlayerGuestbookEntrySubject.entry_id, PlayerSubjectSnapshot)
        .join(PlayerSubjectSnapshot, PlayerSubjectSnapshot.id == PlayerGuestbookEntrySubject.snapshot_id)
        .where(PlayerGuestbookEntrySubject.entry_id.in_(ids))
    ).all()
    if not rows:
        return {}

    header = s.get(PlayerHeaderImageFile, int(player_id))
    avatar = s.get(PlayerAvatarFile, int(player_id))
    profile = s.get(PlayerProfile, int(player_id))
    live_version = {
        "header_image": header.updated_at if header is not None else None,
        "avatar": avatar.updated_at if avatar is not None else None,
    }
    live_bio = str(profile.bio or "").strip() if profile is not None else ""

    out: dict[int, dict] = {}
    for entry_id, snap in rows:
        if snap.kind == "about":
            current = (snap.text or "") == live_bio and bool(live_bio)
        else:
            version = live_version.get(snap.kind)
            current = version is not None and version == snap.source_updated_at
        out[int(entry_id)] = subject_payload(snap, current=current)
    return out


def release_subjects(s: Session, *, entry_ids: list[int]) -> list[str]:
    """Delete the links of these entries, then every snapshot left with no link.

    Returns the file paths to unlink **after** the caller commits — the
    `comment_cleanup` contract: rows only, so a failed commit never leaves a hole where
    a file was. No commit.
    """
    ids = [int(i) for i in entry_ids]
    if not ids:
        return []

    links = s.exec(
        select(PlayerGuestbookEntrySubject).where(PlayerGuestbookEntrySubject.entry_id.in_(ids))
    ).all()
    if not links:
        return []
    snapshot_ids = {int(link.snapshot_id) for link in links}
    for link in links:
        s.delete(link)
    s.flush()

    still_linked = {
        int(sid)
        for sid in s.exec(
            select(PlayerGuestbookEntrySubject.snapshot_id).where(
                PlayerGuestbookEntrySubject.snapshot_id.in_(sorted(snapshot_ids))
            )
        ).all()
    }
    paths: list[str] = []
    for sid in sorted(snapshot_ids - still_linked):
        snap = s.get(PlayerSubjectSnapshot, sid)
        if snap is None:
            continue
        if snap.file_path:
            paths.append(snap.file_path)
        s.delete(snap)
    s.flush()
    return paths


def sweep_orphan_subjects(engine) -> int:
    """Whatever a rollback left behind: links whose entry is gone, snapshots with no link
    (file unlinked with the row), and files under `guestbook_subjects/` with no row.

    Old code knows neither table, so an entry deleted while rolled back leaves its link
    and its pinned copy — and `playerguestbookentry.id` has no AUTOINCREMENT (A9), so the
    next entry to take that id would silently inherit the old subject. Returns how many
    rows + stray files went. Idempotent; called from `init_db()`.
    """
    removed = 0
    paths_to_unlink: list[str] = []
    with Session(engine) as s:
        links = s.exec(select(PlayerGuestbookEntrySubject)).all()
        if links:
            entry_ids = {int(link.entry_id) for link in links}
            alive = {
                int(i)
                for i in s.exec(
                    select(PlayerGuestbookEntry.id).where(PlayerGuestbookEntry.id.in_(sorted(entry_ids)))
                ).all()
            }
            for link in links:
                if int(link.entry_id) not in alive:
                    s.delete(link)
                    removed += 1
            s.flush()

        linked = {int(sid) for sid in s.exec(select(PlayerGuestbookEntrySubject.snapshot_id)).all()}
        snaps = s.exec(select(PlayerSubjectSnapshot)).all()
        keep_files: set[str] = set()
        for snap in snaps:
            if int(snap.id) in linked:
                if snap.file_path:
                    keep_files.add(snap.file_path)
                continue
            if snap.file_path:
                paths_to_unlink.append(snap.file_path)
            s.delete(snap)
            removed += 1

        if removed:
            s.commit()

    for path in paths_to_unlink:
        delete_media(path)

    # A file nothing points at — a copy written by a transaction that then failed, or
    # one whose row a rollback deleted.
    for rel_path in list_media(GUESTBOOK_SUBJECT_DIR):
        if rel_path in keep_files:
            continue
        delete_media(rel_path)
        removed += 1

    return removed
