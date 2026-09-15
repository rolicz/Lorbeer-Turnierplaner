"""The catalog of areas an idea / feature request can name (R5).

An area is one of the app's own destinations, plus the two answers that are not a
destination at all ("not about one page", "several pages"). The catalog lives here,
in code, and **never** in a foreign key: `FeatureRequestArea.area` is a plain string,
so a request keeps naming the page it was about even after the app stops having that
page.

That is the whole reason for the `retired` flag and for the rule that goes with it:

    **A key is never deleted from this tuple — only marked `retired=True`.**

A retired area is not offered when writing a new request (`selectable` is False), but
it still resolves to a human label for the old requests that carry it, and the Ideas
page still offers it as a filter while any request uses it. A key that is missing from
the catalog entirely (a hand-written DB row, or a deletion made against this rule) is
not dropped either: `area_label` hands the raw key back and the page renders it as a
plain tag, because silently losing "which page was this about" is worse than an ugly
label.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AreaDef:
    key: str
    label: str
    #: Retired areas stay in the catalog (so old requests keep a label) but cannot
    #: be chosen for a new one.
    retired: bool = False


#: Declaration order is the order the chips render in: the two scope answers first,
#: then the destinations in the order the app's own navigation lists them.
AREA_DEFS: tuple[AreaDef, ...] = (
    AreaDef("general", "Not about one page"),
    AreaDef("several", "Several pages"),
    AreaDef("dashboard", "Dashboard"),
    AreaDef("tournaments", "Tournaments"),
    AreaDef("match", "Match page"),
    AreaDef("friendlies", "Friendlies"),
    AreaDef("stats", "Stats"),
    AreaDef("players", "Players"),
    AreaDef("profile", "Profile"),
    AreaDef("clubs", "Clubs"),
    AreaDef("settings", "Settings"),
)

#: The two answers that say "not one page". They are mutually exclusive with each
#: other and with every destination: "the Stats page, and also not about one page"
#: is not a thing anyone means, and allowing it would make the area filter lie.
SCOPE_AREAS: frozenset[str] = frozenset({"general", "several"})

_BY_KEY: dict[str, AreaDef] = {a.key: a for a in AREA_DEFS}
_ORDER: dict[str, int] = {a.key: i for i, a in enumerate(AREA_DEFS)}


def area_defs() -> tuple[AreaDef, ...]:
    return AREA_DEFS


def is_known_area(key: str) -> bool:
    return str(key) in _BY_KEY


def is_selectable_area(key: str) -> bool:
    entry = _BY_KEY.get(str(key))
    return entry is not None and not entry.retired


def area_label(key: str) -> str:
    """The catalog label, or the raw key for an area this build no longer knows."""
    entry = _BY_KEY.get(str(key))
    return entry.label if entry is not None else str(key)


def sort_areas(keys: list[str]) -> list[str]:
    """Catalog order, with unknown keys kept and pushed to the end (alphabetically)."""
    known = sorted((k for k in keys if k in _ORDER), key=lambda k: _ORDER[k])
    unknown = sorted(k for k in keys if k not in _ORDER)
    return known + unknown


def normalize_areas(values: list[str] | None) -> tuple[list[str], str | None]:
    """Clean a submitted area list.

    Returns ``(areas, error)``: ``error`` is a message for a 400, or ``None``.
    Rules: at least one area, every key selectable, and a scope answer
    ("general" / "several") stands alone.
    """
    seen: list[str] = []
    for raw in values or []:
        key = str(raw or "").strip().lower()
        if not key:
            continue
        if not is_known_area(key):
            return [], f"Unknown area '{key}'"
        if not is_selectable_area(key):
            return [], f"Area '{key}' is no longer available"
        if key not in seen:
            seen.append(key)
    if not seen:
        return [], "Pick at least one area"
    scopes = [k for k in seen if k in SCOPE_AREAS]
    if scopes and len(seen) > 1:
        return [], f"'{area_label(scopes[0])}' cannot be combined with another area"
    return sort_areas(seen), None
