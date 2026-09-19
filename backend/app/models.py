import datetime as dt
from typing import List, Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


class TournamentPlayer(SQLModel, table=True):
    tournament_id: int = Field(foreign_key="tournament.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class MatchSidePlayer(SQLModel, table=True):
    __mapper_args__ = {"confirm_deleted_rows": False}
    match_side_id: int = Field(foreign_key="matchside.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class FriendlyMatchSidePlayer(SQLModel, table=True):
    __mapper_args__ = {"confirm_deleted_rows": False}
    friendly_match_side_id: int = Field(foreign_key="friendlymatchside.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)


class Tournament(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    name: str
    mode: str = Field(index=True)  # "1v1" | "2v2"
    status: str = Field(default="draft", index=True)

    date: dt.date = Field(default_factory=dt.date.today)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)

    settings_json: str = Field(default="{}")

    players: List["Player"] = Relationship(back_populates="tournaments", link_model=TournamentPlayer)
    matches: List["Match"] = Relationship(back_populates="tournament")

    # Decider for drawn tournaments
    # type: "none" | "penalties" | "match" | "scheresteinpapier"
    decider_type: str = Field(default="none")

    decider_winner_player_id: int | None = Field(default=None, foreign_key="player.id")
    decider_loser_player_id: int | None = Field(default=None, foreign_key="player.id")

    decider_winner_goals: int | None = Field(default=None)
    decider_loser_goals: int | None = Field(default=None)


class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    display_name: str = Field(index=True, unique=True)

    tournaments: List["Tournament"] = Relationship(back_populates="players", link_model=TournamentPlayer)


class PlayerProfile(SQLModel, table=True):
    """
    Extensible profile payload for player-facing features.
    Keep this separate from Player to avoid destructive schema migrations.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    bio: str = Field(default="")
    extras_json: str = Field(default="{}")
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerAvatarFile(SQLModel, table=True):
    """
    Preferred avatar storage (metadata in DB, bytes on disk/object storage).
    Metadata-only row for filesystem-backed avatar storage.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerHeaderImageFile(SQLModel, table=True):
    """
    Profile header image storage (metadata in DB, bytes on disk/object storage).
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookEntry(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_player_id: int = Field(foreign_key="player.id", index=True)
    author_player_id: int = Field(foreign_key="player.id", index=True)
    body: str
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookThreadLink(SQLModel, table=True):
    """
    Optional parent-child relation for guestbook threads.
    Top-level entries have no row in this table.
    """
    entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    parent_entry_id: int = Field(foreign_key="playerguestbookentry.id", index=True)


class PlayerGuestbookVote(SQLModel, table=True):
    """
    Per-player vote for a guestbook entry.
    value: +1 (upvote) or -1 (downvote)
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    guestbook_entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    value: int = Field(default=1)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookRead(SQLModel, table=True):
    """
    Per-player read tracking for guestbook entries.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    guestbook_entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerSubjectSnapshot(SQLModel, table=True):
    """What a profile's header image, About text or avatar was at one moment (K1).

    Avatars and header images are one file per player, overwritten on every upload
    (`avatars/{player_id}.{ext}`), so the first guestbook entry filed against the current
    image copies it aside and points at the copy; a later entry on the same version finds
    this row and shares the copy. Images nobody commented on are never kept — Roli's call:
    the storage tracks the conversation, not the upload history. The About text is the
    `text` column and needs no file.

    The version is the source row's `updated_at` at capture time, so "one copy per
    version" is a constraint, not a convention. Written by
    `services/guestbook_subjects.py` only; a row whose last entry is deleted goes with it,
    file included, and `init_db()` sweeps whatever a rollback leaves behind (A9).
    """
    __table_args__ = (UniqueConstraint("player_id", "kind", "source_updated_at", name="uq_subject_snapshot_version"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(foreign_key="player.id", index=True)
    kind: str = Field(index=True)  # "header_image" | "about" | "avatar"
    #: The source row's `updated_at` when this was captured — the version identity.
    source_updated_at: dt.datetime = Field(index=True)
    #: kind == "about": the About text as it was. Images: "".
    text: str = Field(default="")
    #: Images: the pinned copy. About: all three empty.
    content_type: str = Field(default="")
    file_path: str = Field(default="", index=True)
    file_size: int = Field(default=0)
    captured_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerGuestbookEntrySubject(SQLModel, table=True):
    """Which snapshot a guestbook entry is about — one row per tagged root entry, none for
    an untagged entry or a reply (the `PlayerGuestbookThreadLink` shape)."""
    entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
    snapshot_id: int = Field(foreign_key="playersubjectsnapshot.id", index=True)


class PlayerPoke(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_player_id: int = Field(foreign_key="player.id", index=True)
    author_player_id: int = Field(foreign_key="player.id", index=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class PlayerPokeRead(SQLModel, table=True):
    """
    Per-player read tracking for profile pokes.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    poke_id: int = Field(foreign_key="playerpoke.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class League(SQLModel, table=True):
    """
    Backend-managed lookup table.
    Clubs reference leagues by ID, so renaming a league does not break history.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    # flag-icons compatible country code (ISO 3166-1 alpha-2, optionally with a
    # GB subdivision suffix, e.g. "de", "gb-eng"). NULL = no flag.
    nation: Optional[str] = Field(default=None)

    clubs: List["Club"] = Relationship(back_populates="league")



class Club(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("name", "game", name="uq_club_name_game"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    game: str = Field(index=True)
    star_rating: float = Field(default=3.0, ge=0.5, le=5.0)

    # optional league assignment
    league_id: int = Field(foreign_key="league.id", index=True)
    league: League = Relationship(back_populates="clubs")

class ClubStarRating(SQLModel, table=True):
    """
    What a club was worth, and since when.

    `Club.star_rating` stays the *current* value — everything that asks "how good is
    this club today" (the pickers, the clubs page, the prematch odds) keeps reading it.
    This table answers the other question: "what was it worth on the day that match was
    played". One row per club per day; a row is valid from `valid_from` until the next
    row for the same club, and the earliest row also answers every date before it (the
    history starts where the record starts, it does not claim the club did not exist).

    A new table rather than a column on `MatchSide`, because the question Roli asked is
    about the *club* moving, not about one match's stake.
    """

    __table_args__ = (UniqueConstraint("club_id", "valid_from", name="uq_clubstar_club_day"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    club_id: int = Field(foreign_key="club.id", index=True)
    stars: float = Field(ge=0.5, le=5.0)
    #: The day the rating started to apply. A date, not a timestamp: a match carries a
    #: date, and "which rating did this Saturday's match use" is a question about days.
    valid_from: dt.date = Field(index=True)
    #: When the row was written. Differs from `valid_from` for a recovered row.
    changed_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    #: Where the row came from — "live" (a star edit through the API or the seeder),
    #: "seed" (the first row `init_db` writes for a club that has no history yet) or
    #: "recovered" (reconstructed from a backup snapshot, so `valid_from` is an upper
    #: bound, not the exact day). The UI has to be able to say which.
    source: str = Field(default="live", index=True)


class ClubCrestFile(SQLModel, table=True):
    """
    Club crest storage (metadata in DB, bytes on disk) — same pattern as
    PlayerAvatarFile. Filled by the crest sync tool or admin upload; clubs
    without a row fall back to the generated monogram badge in the frontend.
    """
    club_id: int = Field(foreign_key="club.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tournament_id: int = Field(foreign_key="tournament.id", index=True)

    leg: int = Field(default=1, index=True)  # 1 or 2

    order_index: int = Field(default=0, index=True)
    state: str = Field(default="scheduled", index=True)  # scheduled/playing/finished

    started_at: Optional[dt.datetime] = None
    finished_at: Optional[dt.datetime] = None

    tournament: "Tournament" = Relationship(back_populates="matches")
    sides: List["MatchSide"] = Relationship(back_populates="match")


class FriendlyMatch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    mode: str = Field(index=True)  # "1v1" | "2v2"
    state: str = Field(default="finished", index=True)  # scheduled/playing/finished

    date: dt.date = Field(default_factory=dt.date.today, index=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)

    source: str = Field(default="tools", index=True)

    sides: List["FriendlyMatchSide"] = Relationship(back_populates="friendly_match")


class MatchSide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", index=True)

    side: str = Field(index=True)  # "A" | "B"
    club_id: Optional[int] = Field(default=None, foreign_key="club.id")
    goals: int = Field(default=0)

    match: "Match" = Relationship(back_populates="sides")
    players: List["Player"] = Relationship(link_model=MatchSidePlayer)


class FriendlyMatchSide(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    friendly_match_id: int = Field(foreign_key="friendlymatch.id", index=True)

    side: str = Field(index=True)  # "A" | "B"
    club_id: Optional[int] = Field(default=None, foreign_key="club.id")
    goals: int = Field(default=0)

    friendly_match: "FriendlyMatch" = Relationship(back_populates="sides")
    players: List["Player"] = Relationship(link_model=FriendlyMatchSidePlayer)


class Comment(SQLModel, table=True):
    """
    Tournament comments.
    - match_id = NULL => tournament-wide comment
    - match_id set => comment tied to a specific match (stable even if order_index changes)
    - author_player_id = NULL => "General"
    """
    id: Optional[int] = Field(default=None, primary_key=True)

    tournament_id: int = Field(foreign_key="tournament.id", index=True)
    match_id: Optional[int] = Field(default=None, foreign_key="match.id", index=True)

    author_player_id: Optional[int] = Field(default=None, foreign_key="player.id", index=True)
    body: str

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentRead(SQLModel, table=True):
    """
    Per-player read tracking for tournament comments.
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentVote(SQLModel, table=True):
    """
    Per-player vote for a tournament comment.
    value: +1 (upvote) or -1 (downvote)
    """
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    value: int = Field(default=1)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class CommentImageFile(SQLModel, table=True):
    """
    Preferred comment image storage (metadata in DB, bytes on disk/object storage).
    Metadata-only row for filesystem-backed comment-image storage.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class TournamentPinnedComment(SQLModel, table=True):
    """
    Keep pin state in a dedicated table to avoid altering existing Tournament rows
    (this project uses create_all() without migrations).
    """
    tournament_id: int = Field(foreign_key="tournament.id", primary_key=True)
    comment_id: Optional[int] = Field(default=None, foreign_key="comment.id")
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)


class CommentThreadLink(SQLModel, table=True):
    """
    Optional parent-child relation for comment threads (mirrors PlayerGuestbookThreadLink).
    Top-level comments have no row here. Additive table, so existing comments stay roots.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    parent_comment_id: int = Field(foreign_key="comment.id", index=True)


class TournamentCreatorLink(SQLModel, table=True):
    """
    The logged-in player who created a tournament (mirrors CommentAuthorLink).
    Used by the grace window: only the creator may delete their own tournament,
    and only within `services/authorization.GRACE_WINDOW` of creating it.
    Additive: tournaments created before this table shipped have no row and stay admin-only.
    """
    tournament_id: int = Field(foreign_key="tournament.id", primary_key=True)
    creator_player_id: int = Field(foreign_key="player.id", index=True)


class FriendlyCreatorLink(SQLModel, table=True):
    """
    The logged-in player who created a friendly match (same rule as TournamentCreatorLink).
    Additive: friendlies created before this table shipped have no row and stay admin-only.
    """
    friendly_match_id: int = Field(foreign_key="friendlymatch.id", primary_key=True)
    creator_player_id: int = Field(foreign_key="player.id", index=True)


class CommentAuthorLink(SQLModel, table=True):
    """
    The real author of a comment (the logged-in player who created it), recorded even
    when the comment is displayed as "General". Used to enforce author-only editing.
    Additive: legacy comments have no row and fall back to author_player_id / admin-only.
    """
    comment_id: int = Field(foreign_key="comment.id", primary_key=True)
    real_author_player_id: int = Field(foreign_key="player.id", index=True)


class PushSubscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    player_id: int = Field(foreign_key="player.id", index=True)
    endpoint: str = Field(index=True, unique=True)
    endpoint_hash: str = Field(index=True)
    p256dh: str
    auth: str
    content_encoding: str = Field(default="aes128gcm")

    user_agent: str = Field(default="")
    app_platform: str = Field(default="")
    app_standalone: bool = Field(default=False)

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    last_success_at: Optional[dt.datetime] = Field(default=None, index=True)
    last_failure_at: Optional[dt.datetime] = Field(default=None, index=True)
    last_error: str = Field(default="")
    last_http_status: Optional[int] = Field(default=None)
    failure_count: int = Field(default=0)
    disabled_at: Optional[dt.datetime] = Field(default=None, index=True)


class PushSubscriptionPreference(SQLModel, table=True):
    subscription_id: int = Field(foreign_key="pushsubscription.id", primary_key=True)
    notification_language: str = Field(default="steirisch", index=True)
    notification_mode: str = Field(default="finished_only", index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class FeatureRequest(SQLModel, table=True):
    """
    An idea / change request / bug report posted from the Ideas page (R5).

    Posting requires a login, so the author is never NULL (unlike a Comment, which
    may be shown as "General"): a request is something the group answers, and an
    unattributed one cannot be asked about. `status`/`status_note` are the admin's
    answer; everything else belongs to the author.
    """
    id: Optional[int] = Field(default=None, primary_key=True)

    author_player_id: int = Field(foreign_key="player.id", index=True)

    title: str
    body: str = Field(default="")

    kind: str = Field(default="feature", index=True)  # "feature" | "change" | "bug"
    status: str = Field(default="new", index=True)  # "new" | "planned" | "doing" | "done" | "declined"
    # Why the status is what it is ("already in Stats", "after FC 27"). Admin-written.
    status_note: str = Field(default="")

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    #: When the *author's own* text last changed. `updated_at` moves for a status
    #: change and an image too, so it cannot answer "was this rewritten?" — and a
    #: byline that says "edited" because someone triaged the idea is a lie.
    edited_at: dt.datetime | None = Field(default=None)


class FeatureRequestArea(SQLModel, table=True):
    """
    Which part of the app a request is about. A child table, not a column, because a
    request names several areas — and because the catalog of areas is code
    (`app/feature_areas.py`), never a foreign key: a destination the app later drops
    still has to label the old requests that name it.
    """
    request_id: int = Field(foreign_key="featurerequest.id", primary_key=True)
    area: str = Field(primary_key=True)


class FeatureRequestVote(SQLModel, table=True):
    """
    One "+1" per player per request — the row's existence *is* the vote.

    Deliberately not the (-1|+1) value column that CommentVote carries: a feature
    board asks "who else wants this", and a downvote on a friend's idea answers a
    different question nobody asked.
    """
    request_id: int = Field(foreign_key="featurerequest.id", primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class FeatureRequestImageFile(SQLModel, table=True):
    """
    Screenshot attached to a request (metadata in DB, bytes on disk) —
    the same pattern as CommentImageFile, stored under `uploads/ideas/`.
    """
    request_id: int = Field(foreign_key="featurerequest.id", primary_key=True)
    content_type: str
    file_path: str = Field(index=True)
    file_size: int
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class FeatureRequestComment(SQLModel, table=True):
    """
    A flat comment under an idea (P1).

    No thread link, no image, no vote — Roli's "it can stay a flat list" — and **no
    editing**: a typo is fixed by deleting and reposting, which is why there is no
    `edited_at` here and why `updated_at` never moves away from `created_at` (it is
    kept because every sibling table carries it, not because anything writes it).
    The author is never NULL: commenting needs a login, exactly like posting an idea.
    """
    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: int = Field(foreign_key="featurerequest.id", index=True)
    author_player_id: int = Field(foreign_key="player.id", index=True)

    body: str

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
    updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class FeatureRequestEvent(SQLModel, table=True):
    """
    Something that happened to an idea and somebody may want to hear about:
    kind "created" | "comment" | "vote" | "status".

    One event log rather than four read tables: a status change is not a row anywhere
    else, and a vote has no id of its own, so a per-kind read table would have needed
    a three-column key. The bell derives from these rows minus
    `FeatureRequestEventRead`, the way it derives the other three kinds from their
    tables — so an unvote takes its event, a deleted comment takes its event, and a
    deleted idea takes all of them.
    """
    id: Optional[int] = Field(default=None, primary_key=True)

    request_id: int = Field(foreign_key="featurerequest.id", index=True)
    kind: str = Field(index=True)
    actor_player_id: int = Field(foreign_key="player.id", index=True)
    comment_id: Optional[int] = Field(default=None, foreign_key="featurerequestcomment.id", index=True)

    #: kind == "status": the status as it was set (the bell shows the word).
    status: str = Field(default="")
    #: kind == "status": the note as it was set.
    status_note: str = Field(default="")

    created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class FeatureRequestEventRead(SQLModel, table=True):
    """Who has already seen which idea event. The actor's own row is written with
    the event, so nobody is ever told about their own action."""
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    event_id: int = Field(foreign_key="featurerequestevent.id", primary_key=True)
    read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class RecordHolder(SQLModel, table=True):
    """Who held which record the last time anyone looked (M2).

    Records are computed live everywhere a reader sees them
    (`services/stats/records.py`); this table only remembers the previous answer, so
    "Rumpi took it from you" has something to diff against. Written by
    `services/record_holders.py::reconcile_record_holders` and nothing else — and read
    by nothing else either, which is what makes a rollback to code that predates it
    harmless.

    A key that some later deploy drops from `RECORD_DEFS` leaves its rows behind; they
    are orphans nobody reads, not data to migrate.
    """
    record_key: str = Field(primary_key=True)
    player_id: int = Field(foreign_key="player.id", primary_key=True)
    since: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


class RecordKeyState(SQLModel, table=True):
    """One row per record key that has been reconciled at least once.

    This is what makes seeding honest. A key with **no row** is computed and stored
    *silently* — the first boot on a database that predates the table, and a record kind
    added in a later deploy, must not announce every current holder as a brand-new one
    (sixteen records times six players, all at once). A key **with** a row and no
    `RecordHolder` rows means nobody holds it, which is a real answer and not a missing one.
    """
    record_key: str = Field(primary_key=True)
    computed_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
    holder_count: int = Field(default=0)
