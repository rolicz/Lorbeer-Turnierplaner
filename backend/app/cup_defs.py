from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path


@dataclass(frozen=True)
class CupDef:
    key: str
    name: str
    since_date: date | None


def _cups_path() -> Path:
    # If set, use an external (mounted) config file path.
    p = os.getenv("CUPS_CONFIG_PATH")
    if p:
        return Path(p)
    # Fallback: config committed with the backend code.
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
        out.append(CupDef(key=key, name=name, since_date=since))

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
