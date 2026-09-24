"""Cup definitions (L12: the database is the source, `cups.json` the seed).

A cup is a `Cup` row of one group with its `CupEra` rows; `load_cup_defs` reads them for
the current group. The JSON file at `CUPS_CONFIG_PATH` (or the bundled `cups.json`) is
**the seed**: `seed_cups_from_file` imports it once, into an empty `cup` table, at boot —
after that the rows are authoritative and editing the file changes nothing. The file is
still read and validated at every boot (`read_cups_file`), so a malformed one still
refuses to boot, exactly as before.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine
    from sqlmodel import Session

log = logging.getLogger(__name__)

CUP_ERA_MODES = ("1v1", "2v2", "any")


@dataclass(frozen=True)
class CupEra:
    since: date
    mode: str  # "1v1" | "2v2" | "any"


@dataclass(frozen=True)
class CupDef:
    key: str
    name: str
    since_date: date | None
    eras: list[CupEra] = field(default_factory=list)

    def active_era_mode(self, d: date) -> str:
        """Mode of the era active for a tournament dated `d`.

        The active era is the LAST era with `since <= d`; before the earliest
        era (or when there are no eras) the mode is implicitly ``"any"``.
        `eras` is kept sorted by `since` ascending by ``load_cup_defs()``.
        """
        mode = "any"
        for era in self.eras:
            if era.since <= d:
                mode = era.mode
            else:
                break
        return mode


def _cups_path() -> Path:
    # Prefer an external (mounted) config file path, but fall back to the bundled default
    # if the path doesn't exist. This avoids hard-failing on fresh deployments.
    p = os.getenv("CUPS_CONFIG_PATH")
    if p:
        candidate = Path(p)
        if candidate.exists() and candidate.is_file():
            return candidate
    return Path(__file__).resolve().parent / "cups.json"


def read_cups_file() -> list[CupDef]:
    """The cups the seed file defines, validated — raises `ValueError` on a malformed one.

    Returns the file's cups only; the synthesized "default" cup is `_with_default`'s job,
    at read time, so it is never written into the database."""
    p = _cups_path()
    if not p.exists():
        raise ValueError(f"cups config not found: {p}")
    raw = json.loads(p.read_text(encoding="utf-8"))
    cups = raw.get("cups", [])
    out: list[CupDef] = []
    for c in cups:
        key = str(c.get("key", "")).strip()
        name = str(c.get("name", "")).strip()
        since_raw = c.get("since_date", None)
        since = None
        if since_raw not in (None, ""):
            since = date.fromisoformat(str(since_raw))
        if not key:
            raise ValueError("cups config: cup key is required")
        if not name:
            raise ValueError(f"cups config: cup name is required (key={key})")

        eras_raw = c.get("eras", []) or []
        if not isinstance(eras_raw, list):
            raise ValueError(f"cups config: 'eras' must be a list of objects (key={key})")
        eras: list[CupEra] = []
        seen_since: set[date] = set()
        for e in eras_raw:
            if not isinstance(e, dict):
                raise ValueError(f"cups config: era entries must be objects with 'since'/'mode' (key={key})")
            since_e = e.get("since", None)
            if since_e in (None, ""):
                raise ValueError(f"cups config: era 'since' is required (key={key})")
            era_since = date.fromisoformat(str(since_e))
            mode_e = str(e.get("mode", "")).strip()
            if mode_e not in CUP_ERA_MODES:
                raise ValueError(
                    f"cups config: invalid era mode {mode_e!r} (key={key}); "
                    f"expected one of {CUP_ERA_MODES}"
                )
            if era_since in seen_since:
                raise ValueError(f"cups config: duplicate era 'since' {era_since} (key={key})")
            seen_since.add(era_since)
            eras.append(CupEra(since=era_since, mode=mode_e))
        eras.sort(key=lambda x: x.since)

        out.append(CupDef(key=key, name=name, since_date=since, eras=eras))

    keys = [c.key for c in out]
    if len(set(keys)) != len(keys):
        raise ValueError("cups config: duplicate cup keys")

    return out


def _with_default(defs: list[CupDef]) -> list[CupDef]:
    # Ensure there's always a default cup.
    if "default" not in {c.key for c in defs}:
        return [CupDef(key="default", name="Cup", since_date=None), *defs]
    return defs


def _read_rows(s: Session) -> list[CupDef]:
    from sqlmodel import select

    from .models import Cup
    from .models import CupEra as CupEraRow
    from .services.groups import current_group

    try:
        group_id = int(current_group(s).id)
    except LookupError:  # before the boot migration has created the group: no cups yet
        return []
    cups = s.exec(select(Cup).where(Cup.group_id == group_id).order_by(Cup.sort_order, Cup.id)).all()
    if not cups:
        return []
    eras = s.exec(
        select(CupEraRow).where(CupEraRow.cup_id.in_([int(c.id) for c in cups])).order_by(CupEraRow.since)
    ).all()
    by_cup: dict[int, list[CupEra]] = {}
    for e in eras:
        by_cup.setdefault(int(e.cup_id), []).append(CupEra(since=e.since, mode=e.mode))
    return [CupDef(key=c.key, name=c.name, since_date=c.since_date, eras=by_cup.get(int(c.id), [])) for c in cups]


def load_cup_defs(s: Session | None = None) -> list[CupDef]:
    """The current group's cups, `eras` sorted by `since` — from the `Cup`/`CupEra` rows.

    Opens its own session when none is given (the `StarRatingResolver.load` shape)."""
    if s is not None:
        return _with_default(_read_rows(s))
    from sqlmodel import Session as _Session

    from .db import get_engine

    with _Session(get_engine()) as own:
        return _with_default(_read_rows(own))


def get_cup_def(key: str | None, s: Session | None = None) -> CupDef:
    k = (key or "default").strip()
    for d in load_cup_defs(s):
        if d.key == k:
            return d
    raise KeyError(k)


def import_cup_defs(s: Session, group_id: int, defs: list[CupDef]) -> int:
    """Write `defs` as `group_id`'s cups, in order, eras included. Adds to the session; the
    caller commits. The one writer of `Cup`/`CupEra` — the boot seed uses it, and so does
    a test that needs a different set of cups."""
    from .models import Cup
    from .models import CupEra as CupEraRow

    for idx, d in enumerate(defs):
        row = Cup(group_id=int(group_id), key=d.key, name=d.name, since_date=d.since_date, sort_order=idx)
        s.add(row)
        s.flush()
        for e in d.eras:
            s.add(CupEraRow(cup_id=int(row.id), since=e.since, mode=e.mode))
    return len(defs)


def replace_cup_defs(s: Session, group_id: int, defs: list[CupDef]) -> int:
    """`group_id`'s cups become exactly `defs` (the old rows and their eras go). Adds to the
    session; the caller commits."""
    from sqlmodel import select

    from .models import Cup
    from .models import CupEra as CupEraRow

    for cup in s.exec(select(Cup).where(Cup.group_id == int(group_id))).all():
        for era in s.exec(select(CupEraRow).where(CupEraRow.cup_id == int(cup.id))).all():
            s.delete(era)
        s.delete(cup)
    s.flush()
    return import_cup_defs(s, group_id, defs)


def seed_cups_from_file(engine: Engine) -> int:
    """`init_db()` hook: when the `cup` table is empty, import the seed file's cups for the
    current group (`altherren`) and return how many; otherwise 0 — the rows are the
    source now. Needs the group, so it runs after the auth migration; without one it
    imports nothing and the next boot that has one does it.

    Also says, once per boot, when the file and the rows have drifted apart: someone
    hand-edited the seed expecting it to take effect, and it will not."""
    from sqlmodel import Session as _Session
    from sqlmodel import select

    from .models import Cup
    from .services.groups import current_group

    file_defs = read_cups_file()
    with _Session(engine) as s:
        try:
            group_id = int(current_group(s).id)
        except LookupError:
            log.info("Cups import skipped: no group exists yet")
            return 0
        if s.exec(select(Cup.id)).first() is None:
            n = import_cup_defs(s, group_id, file_defs)
            s.commit()
            return n
        if _with_default(file_defs) != load_cup_defs(s):
            log.warning(
                "Cups: %s differs from the database; the database is the source since the first import"
                " — the file is only a seed now",
                _cups_path(),
            )
        return 0
