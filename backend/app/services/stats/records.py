"""The one computation of "who holds which record" (M1).

Every record the app shows lives here, once. The Records page, the Streaks page's
top rows, the profile's badge band and the "Rumpi took it from you" push all read
this module's answer, so a badge can never claim a record the Records page does
not show — the failure mode this file exists to make impossible.

**It adds no query of its own beyond `select(Player)`.** Every number is folded out
of the services the pages themselves call:

| group | folded from |
|---|---|
| `title` | `compute_stats_players(...)["tournaments"]` → `winner_player_id` |
| `elo` / `table` | `compute_stats_ratings(...)["rows"]` — the rows `useStandings` turns into the Table |
| `streak` | `compute_stats_streaks(...)["categories"]` → each category's `records` list |
| `match` | `finished_matches_with_players(...)` — the loader `/stats/players` uses |

The **empty-column rule** (not a minimum-matches floor, which Roli declined):
a table/elo record is held only among rows with `played > 0`. Without it six players
at the default Elo 1000 on an empty database would all "hold" Highest Elo, and a
newcomer who has never played would top Elo at 1000 over everyone who has. A
streak/title/match record with nothing to count simply has no holder.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Callable

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ...models import FriendlyMatch, FriendlyMatchSide, Player
from ...services.club_stars import StarRatingResolver
from ..paths import group_path
from .player_matches import friendly_group, friendly_stats_match_dict, stats_match_dict
from .players import compute_stats_players, finished_matches_with_players
from .ratings import compute_stats_ratings
from .scope import normalize_scope
from .streaks import compute_stats_streaks

# `scope.friendly_as_match_like` numbers a friendly's match-like wrapper from here, and
# `friendly_stats_match_dict` emits the same id — which is how a record row recovers the
# friendly it came from without a second query.
FRIENDLY_MATCH_ID_BASE = 2_000_000_000


@dataclass(frozen=True)
class RecordDef:
    """One record: what it is called, where it lives in Stats, and how it is ranked."""

    key: str
    group: str  # "title" | "elo" | "table" | "streak" | "match"
    label: str  # the English stats label — the push uses it inside every language
    explainer: str  # the one-line muted explainer the Records page shows
    sort_col: str | None  # table/elo: the `TABLE_COLS` key the Table sorts by
    mode: str | None  # elo: a fixed mode ("1v1"/"2v2"); None = the requested mode


RECORD_DEFS: tuple[RecordDef, ...] = (
    RecordDef("most_titles", "title", "Most tournament wins", "Tournaments won, with each player's most recent title.", None, None),
    RecordDef("highest_elo", "elo", "Highest Elo", "Highest Elo rating.", "rating", None),
    RecordDef("highest_elo_1v1", "elo", "Highest Elo (1v1)", "Highest Elo rating in 1v1.", "rating", "1v1"),
    RecordDef("highest_elo_2v2", "elo", "Highest Elo (2v2)", "Highest Elo rating in 2v2.", "rating", "2v2"),
    RecordDef("most_points", "table", "Most points", "Most points in the table.", "pts", None),
    RecordDef("highest_ppm", "table", "Highest pts / match", "Points per match, highest in the table.", "ppm", None),
    RecordDef("most_played", "table", "Most played", "Most matches played.", "played", None),
    RecordDef("most_goals_per_match", "table", "Most goals / match", "Goals per match, highest in the table.", "gpm", None),
    RecordDef("win_streak", "streak", "Win streak", "Consecutive wins.", None, None),
    RecordDef("unbeaten_streak", "streak", "Unbeaten streak", "Consecutive matches without losing.", None, None),
    RecordDef("scoring_streak", "streak", "Scoring streak", "Consecutive matches with at least 1 goal scored.", None, None),
    RecordDef("clean_sheet_streak", "streak", "Clean sheet streak", "Consecutive matches with 0 goals conceded.", None, None),
    RecordDef("biggest_win", "match", "Biggest win", "Largest goal difference in a finished match.", None, None),
    RecordDef("highest_scoring_match", "match", "Highest-scoring match", "Most goals in one match, both sides together.", None, None),
    RecordDef("most_goals_one_side", "match", "Most goals by one side", "The biggest single-side tally in a match.", None, None),
    RecordDef("biggest_upset", "match", "Biggest upset (by Elo)", "Win against the largest Elo gap between the two sides.", None, None),
)
RECORD_KEYS: tuple[str, ...] = tuple(d.key for d in RECORD_DEFS)
RECORD_DEF_BY_KEY: dict[str, RecordDef] = {d.key: d for d in RECORD_DEFS}


#: Which of the sixteen are *records* and which are *leads*.
#:
#: A record is a best-ever mark that stands on its own — the longest streak anyone has
#: ever run, the biggest win ever played. A lead is simply whoever is top of a running
#: tally right now: most points, highest Elo, most tournament wins. Calling the second
#: kind a "Rekord" in a push is wrong, and Roli said so (2026-09-19), so the two kinds
#: take different copy. `most_titles` is a lead: a cumulative count, like points.
_LEAD_GROUPS = frozenset({"title", "elo", "table"})


def record_kind(key: str) -> str:
    """`"record"` or `"lead"` — the only place that decides which copy a key takes."""
    d = RECORD_DEF_BY_KEY.get(key)
    return "lead" if d is not None and d.group in _LEAD_GROUPS else "record"

#: The four streak categories, in registry order — the keys `compute_stats_streaks` emits.
STREAK_KEYS: tuple[str, ...] = tuple(d.key for d in RECORD_DEFS if d.group == "streak")


def record_path(d: RecordDef, *, mode: str, scope: str) -> str:
    """Where this record lives in Stats. Table/Elo → the Table sorted by its column;
    a streak → the Streaks sub-view anchored at its section; a title or match record →
    the Records sub-view anchored at its section. One place decides this for the badge
    link and the push path alike."""
    m = d.mode or mode
    base = f"/stats?view=overview&sub={{sub}}&mode={m}&source={scope}"
    if d.group in ("table", "elo"):
        return group_path(base.format(sub="table") + f"&sort={d.sort_col}")
    if d.group == "streak":
        return group_path(base.format(sub="streaks") + f"&record={d.key}")
    return group_path(base.format(sub="records") + f"&record={d.key}")


# ---- table / elo -------------------------------------------------------


#: One value function per table/elo record — the same arithmetic `TABLE_COLS` does on
#: the same ratings row (`pages/stats/standings.ts`). Only rows with `played > 0` are
#: ever passed in, so the divisions cannot be by zero.
_TABLE_VALUES: dict[str, Callable[[dict[str, Any]], float]] = {
    "highest_elo": lambda r: float(r["rating"]),
    "highest_elo_1v1": lambda r: float(r["rating"]),
    "highest_elo_2v2": lambda r: float(r["rating"]),
    "most_points": lambda r: float(r["pts"]),
    "highest_ppm": lambda r: float(r["pts"]) / float(r["played"]),
    "most_played": lambda r: float(r["played"]),
    "most_goals_per_match": lambda r: float(r["gf"]) / float(r["played"]),
}


# ---- match records -----------------------------------------------------


def _side_by(m: Any, side: str) -> Any | None:
    for s in m.sides:
        if s.side == side:
            return s
    return None


def _goals(side: Any) -> int:
    return int(getattr(side, "goals", 0) or 0)


def _ids(side: Any) -> list[int]:
    return [int(p.id) for p in side.players if p.id is not None]


@dataclass(frozen=True)
class _MatchRow:
    """A finished match, reduced to what a record needs to rank and name it."""

    match: Any
    a_goals: int
    b_goals: int
    a_ids: tuple[int, ...]
    b_ids: tuple[int, ...]
    #: `tournament.date desc, tournament.id desc, order_index desc, id desc` — most recent first.
    sort_key: tuple[Any, ...]

    @property
    def decided(self) -> bool:
        return self.a_goals != self.b_goals

    @property
    def winner_ids(self) -> tuple[int, ...]:
        return self.a_ids if self.a_goals > self.b_goals else self.b_ids

    @property
    def loser_ids(self) -> tuple[int, ...]:
        return self.b_ids if self.a_goals > self.b_goals else self.a_ids


def _match_rows(s: Session, *, mode: str, scope: str) -> list[_MatchRow]:
    rows: list[_MatchRow] = []
    seen: set[int] = set()
    for m in finished_matches_with_players(s, mode=mode, scope=scope):
        mid = int(getattr(m, "id", 0) or 0)
        if mid in seen:
            continue
        a = _side_by(m, "A")
        b = _side_by(m, "B")
        if not a or not b:
            continue
        a_ids = _ids(a)
        b_ids = _ids(b)
        if not a_ids or not b_ids:
            continue
        seen.add(mid)
        t = getattr(m, "tournament", None)
        rows.append(
            _MatchRow(
                match=m,
                a_goals=_goals(a),
                b_goals=_goals(b),
                a_ids=tuple(a_ids),
                b_ids=tuple(b_ids),
                sort_key=(
                    getattr(t, "date", None) or date.min,
                    int(getattr(t, "id", 0) or 0),
                    int(getattr(m, "order_index", 0) or 0),
                    mid,
                ),
            )
        )
    return rows


def _top_rows(rows: list[_MatchRow], value: Callable[[_MatchRow], float]) -> tuple[float | None, list[_MatchRow]]:
    """Every match tied at the maximum — a record is shared, never "the first one found"."""
    if not rows:
        return None, []
    top = max(value(r) for r in rows)
    tied = [r for r in rows if value(r) == top]
    tied.sort(key=lambda r: r.sort_key, reverse=True)
    return top, tied


def _avg_elo(ids: tuple[int, ...], elo: dict[int, float]) -> float:
    if not ids:
        return 1000.0
    return sum(elo.get(pid, 1000.0) for pid in ids) / float(len(ids))


def _friendly_id(row: _MatchRow) -> int | None:
    """The `FriendlyMatch.id` behind a match-like wrapper, or None for a real match.

    The loader hands friendlies over as `scope.friendly_as_match_like` namespaces
    (no tournament, id offset by `FRIENDLY_MATCH_ID_BASE`) — enough to rank a record,
    not enough to render its row.
    """
    if getattr(row.match, "tournament_id", None) is not None:
        return None
    mid = int(getattr(row.match, "id", 0) or 0)
    return mid - FRIENDLY_MATCH_ID_BASE if mid >= FRIENDLY_MATCH_ID_BASE else None


def _friendlies_by_id(s: Session, ids: set[int]) -> dict[int, FriendlyMatch]:
    """The friendlies a record actually names, in one query — never one per row.

    The wrapper keeps no reference to the row it was built from and SQLAlchemy's
    identity map is weak, so the `FriendlyMatch` is gone by the time a record row is
    rendered. Ranking happens first and only the handful of matches that tie a record
    are re-read; with `scope=tournaments` — every badge, and the Records page's default
    — this set is empty and no query is made at all.
    """
    if not ids:
        return {}
    stmt = (
        select(FriendlyMatch)
        .where(FriendlyMatch.id.in_(ids))
        .options(selectinload(FriendlyMatch.sides).selectinload(FriendlyMatchSide.players))
    )
    return {int(fm.id): fm for fm in s.exec(stmt).all()}


def _match_payload(
    row: _MatchRow, stars: StarRatingResolver, friendlies: dict[int, FriendlyMatch]
) -> dict[str, Any] | None:
    """A record's match row, rendered exactly as `/stats/player-matches` renders one."""
    fid = _friendly_id(row)
    if fid is not None:
        fm = friendlies.get(fid)
        if fm is None:
            return None
        return {"tournament": friendly_group(fm), "match": friendly_stats_match_dict(fm, stars)}
    t = getattr(row.match, "tournament", None)
    if t is None or getattr(t, "id", None) is None:
        return None
    return {
        "tournament": {"id": int(t.id), "name": t.name, "date": t.date, "mode": t.mode, "status": t.status},
        "match": stats_match_dict(row.match, t.date, stars),
    }


# ---- the computation ---------------------------------------------------


def compute_stats_records(s: Session, *, mode: str = "overall", scope: str = "tournaments") -> dict[str, Any]:
    mode_norm = str(mode or "overall").strip().lower()
    if mode_norm not in ("overall", "1v1", "2v2"):
        mode_norm = "overall"
    scope_norm = normalize_scope(scope)

    players = list(s.exec(select(Player)).all())
    name_by_id = {int(p.id): p.display_name for p in players if p.id is not None}

    def holder(pid: int, *, ongoing: bool = False) -> dict[str, Any]:
        return {"player": {"id": int(pid), "display_name": name_by_id.get(int(pid), f"#{pid}")}, "ongoing": bool(ongoing)}

    # --- the folds every group reads, each computed at most once ---
    ratings_cache: dict[str, list[dict[str, Any]]] = {}

    def ratings_rows(m: str) -> list[dict[str, Any]]:
        if m not in ratings_cache:
            ratings_cache[m] = compute_stats_ratings(s, mode=m, scope=scope_norm)["rows"]
        return ratings_cache[m]

    streak_cats = {
        c["key"]: c
        for c in compute_stats_streaks(s, mode=mode_norm, player_id=None, limit=200, scope=scope_norm)["categories"]
    }

    match_rows = _match_rows(s, mode=mode_norm, scope=scope_norm)
    # What each club was worth *on the day the match was played* (R4) — loaded once,
    # and the record rows carry the same answer `/stats/player-matches` carries.
    stars = StarRatingResolver.load(s)
    elo_by_id = {int(r["player"]["id"]): float(r["rating"]) for r in ratings_rows(mode_norm)}

    titles_leaders, titles_top = _titles(s, mode=mode_norm, scope=scope_norm)

    # Rank the match records first, then render: only the matches that actually tie a
    # record need their friendly re-read, and that is one query for all four of them.
    match_results = {d.key: _match_record(d.key, match_rows, elo_by_id) for d in RECORD_DEFS if d.group == "match"}
    friendlies = _friendlies_by_id(
        s,
        {fid for _, tied, _ in match_results.values() for r in tied if (fid := _friendly_id(r)) is not None},
    )

    records: list[dict[str, Any]] = []
    for d in RECORD_DEFS:
        entry: dict[str, Any] = {
            "key": d.key,
            "group": d.group,
            "label": d.label,
            "explainer": d.explainer,
            "path": record_path(d, mode=mode_norm, scope=scope_norm),
            "value": None,
            "holders": [],
            "leaders": [],
            "matches": [],
        }

        if d.group in ("table", "elo"):
            rows = ratings_rows(d.mode or mode_norm)
            value_of = _TABLE_VALUES[d.key]
            # The empty-column rule: an entry in the column at all, never a floor.
            candidates = [r for r in rows if int(r["played"]) > 0]
            if candidates:
                top = max(value_of(r) for r in candidates)
                entry["value"] = float(top)
                entry["holders"] = [holder(int(r["player"]["id"])) for r in candidates if value_of(r) == top]

        elif d.group == "streak":
            runs = (streak_cats.get(d.key) or {}).get("records") or []
            if runs:
                top = int(runs[0]["length"])
                entry["value"] = float(top)
                entry["holders"] = [
                    holder(int(r["player"]["id"]), ongoing=bool(r["ongoing"])) for r in runs if int(r["length"]) == top
                ]

        elif d.group == "title":
            if titles_leaders:
                entry["value"] = float(titles_top)
                entry["leaders"] = titles_leaders
                entry["holders"] = [holder(int(row["player"]["id"])) for row in titles_leaders if int(row["rank"]) == 1]

        else:  # match records
            value, tied, holder_ids = match_results[d.key]
            if tied:
                entry["value"] = float(value) if value is not None else None
                entry["holders"] = [holder(pid) for pid in holder_ids]
                entry["matches"] = [p for p in (_match_payload(r, stars, friendlies) for r in tied) if p is not None]

        records.append(entry)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "mode": mode_norm,
        "scope": scope_norm,
        "finished_matches": len(match_rows),
        "records": records,
    }


def _titles(s: Session, *, mode: str, scope: str) -> tuple[list[dict[str, Any]], int]:
    """Most tournament wins — counted off `/stats/players`' own tournament list.

    Competition ranking (1, 1, 3), most recent title first per player, exactly as the
    Records page counted it in the browser before M1.
    """
    payload = compute_stats_players(s, mode=mode, lastN=0, scope=scope)
    tournaments = payload.get("tournaments") or []
    name_by_id = {int(p["player_id"]): p["display_name"] for p in payload.get("players") or []}
    if not tournaments or not name_by_id:
        return [], 0

    # Most recent won tournament first, so the first hit per player is the latest.
    chrono = sorted(tournaments, key=lambda t: (str(t["date"]), int(t["id"])), reverse=True)
    counts: dict[int, dict[str, Any]] = {}
    for t in chrono:
        if t.get("status") != "done" or t.get("winner_player_id") is None:
            continue
        pid = int(t["winner_player_id"])
        cur = counts.setdefault(pid, {"count": 0, "latest": None})
        cur["count"] += 1
        if cur["latest"] is None:
            cur["latest"] = {"id": int(t["id"]), "name": t["name"], "date": t["date"], "mode": t["mode"], "status": t["status"]}
    if not counts:
        return [], 0

    ordered = sorted(counts.items(), key=lambda kv: -int(kv[1]["count"]))
    leaders: list[dict[str, Any]] = []
    rank, prev = 0, -1
    for i, (pid, v) in enumerate(ordered):
        if int(v["count"]) != prev:
            rank, prev = i + 1, int(v["count"])
        leaders.append(
            {
                "player": {"id": pid, "display_name": name_by_id.get(pid, f"#{pid}")},
                "count": int(v["count"]),
                "rank": rank,
                "latest": v["latest"],
            }
        )
    return leaders, int(leaders[0]["count"])


def _match_record(
    key: str, rows: list[_MatchRow], elo_by_id: dict[int, float]
) -> tuple[float | None, list[_MatchRow], list[int]]:
    """value, every match tied at it, and the players who hold it.

    Who holds a match record is the one thing the four differ on: a win belongs to the
    winners, a goal fest to **both** sides (the loser of a 7:6 made it too — Roli), and
    the biggest single-side tally to the side that scored it.
    """
    if key == "biggest_win":
        decided = [r for r in rows if r.decided]
        value, tied = _top_rows(decided, lambda r: float(abs(r.a_goals - r.b_goals)))
        holders = _dedup(pid for r in tied for pid in r.winner_ids)
        return value, tied, holders

    if key == "highest_scoring_match":
        value, tied = _top_rows(rows, lambda r: float(r.a_goals + r.b_goals))
        holders = _dedup(pid for r in tied for pid in (*r.a_ids, *r.b_ids))
        return value, tied, holders

    if key == "most_goals_one_side":
        value, tied = _top_rows(rows, lambda r: float(max(r.a_goals, r.b_goals)))
        scorers: list[int] = []
        for r in tied:
            top = max(r.a_goals, r.b_goals)
            if r.a_goals == top:
                scorers.extend(r.a_ids)
            if r.b_goals == top:
                scorers.extend(r.b_ids)
        return value, tied, _dedup(scorers)

    if key == "biggest_upset":
        decided = [r for r in rows if r.decided]
        gap = {
            int(r.match.id): _avg_elo(r.loser_ids, elo_by_id) - _avg_elo(r.winner_ids, elo_by_id)
            for r in decided
        }
        value, tied = _top_rows(decided, lambda r: gap[int(r.match.id)])
        # Only an actual upset is a record: the favourite winning is not one.
        if value is None or value <= 0:
            return None, [], []
        return value, tied, _dedup(pid for r in tied for pid in r.winner_ids)

    raise KeyError(key)  # pragma: no cover - the registry is the only caller


def _dedup(ids: Any) -> list[int]:
    """Holder ids, each once, in first-seen order."""
    out: list[int] = []
    for pid in ids:
        if pid not in out:
            out.append(int(pid))
    return out
