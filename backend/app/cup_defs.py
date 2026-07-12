from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

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


def load_cup_defs() -> list[CupDef]:
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
        eras: list[CupEra] = []
        seen_since: set[date] = set()
        for e in eras_raw:
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

    # Ensure there's always a default cup.
    if "default" not in set(keys):
        out.insert(0, CupDef(key="default", name="Cup", since_date=None))

    return out


def get_cup_def(key: str | None) -> CupDef:
    k = (key or "default").strip()
    for d in load_cup_defs():
        if d.key == k:
            return d
    raise KeyError(k)
