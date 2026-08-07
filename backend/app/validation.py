import re

# flag-icons codes: ISO 3166-1 alpha-2, optionally a subdivision (e.g. "gb-eng").
_NATION_CODE_RE = re.compile(r"^[a-z]{2}(-[a-z]{2,3})?$")


def validate_nation_code(value: str) -> str:
    v = (value or "").strip().lower()
    if not _NATION_CODE_RE.match(v):
        raise ValueError("nation must be a country code like 'de' or 'gb-eng'")
    return v


def validate_star_rating(value: float) -> float:
    v = float(value)
    if v < 0.5 or v > 5.0:
        raise ValueError("star_rating must be between 0.5 and 5.0")
    if (v * 2) % 1 != 0:
        raise ValueError("star_rating must be in 0.5 steps")
    return v
