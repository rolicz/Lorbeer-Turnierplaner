from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .stats.records import record_kind

DEFAULT_NOTIFICATION_LANGUAGE = "steirisch"


class _SafeFormatDict(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return ""


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Any]:
    path = Path(__file__).resolve().parent.parent / "notification_texts.json"
    return json.loads(path.read_text(encoding="utf-8"))


def default_notification_language() -> str:
    return str(_catalog().get("default_language") or DEFAULT_NOTIFICATION_LANGUAGE)


def notification_language_options() -> list[dict[str, str]]:
    languages = _catalog().get("languages") or {}
    return [
        {"key": str(key), "label": str((payload or {}).get("label") or key.title())}
        for key, payload in languages.items()
    ]


def supported_notification_languages() -> tuple[str, ...]:
    return tuple(item["key"] for item in notification_language_options())


def normalize_notification_language(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in supported_notification_languages():
        return normalized
    return default_notification_language()


def _message_template(language: str, key: str) -> dict[str, str]:
    catalog = _catalog()
    languages = catalog.get("languages") or {}
    lang_payload = languages.get(language) or {}
    default_payload = languages.get(default_notification_language()) or {}
    message = (lang_payload.get("messages") or {}).get(key)
    if message is None:
        message = (default_payload.get("messages") or {}).get(key)
    if message is None:
        raise KeyError(f"Unknown notification text key: {key}")
    return {"title": str(message.get("title") or ""), "body": str(message.get("body") or "")}


def _mode_label(mode: str, language: str) -> str:
    value = str(mode or "").strip()
    if value in {"1v1", "2v2"}:
        return value
    if language == "deutsch":
        return "Friendly"
    if language == "english":
        return "friendly"
    return "Friendly"


_STATUS_LABELS: dict[str, dict[str, str]] = {
    "steirisch": {"new": "neich", "planned": "eiplant", "doing": "in Arbeit", "done": "fertig", "declined": "obglehnt"},
    "deutsch": {"new": "neu", "planned": "geplant", "doing": "in Arbeit", "done": "erledigt", "declined": "abgelehnt"},
    "english": {"new": "new", "planned": "planned", "doing": "in progress", "done": "done", "declined": "declined"},
}


def _status_label(status: str, language: str) -> str:
    """An idea's status, in the reader's language (P2, precedent `_mode_label`)."""
    value = str(status or "").strip().lower()
    table = _STATUS_LABELS.get(language) or _STATUS_LABELS["steirisch"]
    return table.get(value, value)


#: Every record's name in the two languages that are not English, keyed exactly as
#: `services/stats/records.py::RECORD_DEFS` keys them (M2). `RecordDef.label` is the
#: English one and stays verbatim; this is the same shape `_STATUS_LABELS` uses, so
#: every translated *word* in a push lives in this module and nowhere else.
#:
#: The consequence, stated so nobody is surprised: a push says "meiste Punkte is weg"
#: while the badge and the Stats page say "Most points", because the UI is English.
#: That is the split the app already lives with — but the two now have to be edited
#: together, which is why `tests/test_record_holders.py` fails the moment a record key
#: exists without an entry here.
_RECORD_LABELS: dict[str, dict[str, str]] = {
    "deutsch": {
        "most_titles": "meiste Turniersiege",
        "highest_elo": "höchstes Elo",
        "highest_elo_1v1": "höchstes Elo (1v1)",
        "highest_elo_2v2": "höchstes Elo (2v2)",
        "most_points": "meiste Punkte",
        "highest_ppm": "meiste Punkte pro Spiel",
        "most_played": "meiste Spiele",
        "most_goals_per_match": "meiste Tore pro Spiel",
        "win_streak": "längste Siegesserie",
        "unbeaten_streak": "längste Serie ohne Niederlage",
        "scoring_streak": "längste Torserie",
        "clean_sheet_streak": "längste Serie ohne Gegentor",
        "biggest_win": "höchster Sieg",
        "highest_scoring_match": "torreichstes Spiel",
        "most_goals_one_side": "meiste Tore einer Seite",
        "biggest_upset": "größte Überraschung (nach Elo)",
    },
    "steirisch": {
        "most_titles": "meiste Turniersiege",
        "highest_elo": "höchstes Elo",
        "highest_elo_1v1": "höchstes Elo (1v1)",
        "highest_elo_2v2": "höchstes Elo (2v2)",
        "most_points": "meiste Punkt",
        "highest_ppm": "meiste Punkt pro Match",
        "most_played": "meiste Matches",
        "most_goals_per_match": "meiste Tor pro Match",
        "win_streak": "längste Siegesserie",
        "unbeaten_streak": "längste Serie ohne Niederlog",
        "scoring_streak": "längste Torserie",
        "clean_sheet_streak": "längste Serie ohne Gegentor",
        "biggest_win": "höchster Sieg",
        "highest_scoring_match": "torreichstes Match",
        "most_goals_one_side": "meiste Tor vo ana Seitn",
        "biggest_upset": "greßte Überraschung (nach Elo)",
    },
}


def _record_label(record_key: str, english_label: str, language: str) -> str:
    """A record's name in the reader's language; the English stats label is the fallback.

    A key this catalog does not know (a newer backend, or a test that passes only the
    label) still renders a sentence — never an empty `{record}`.
    """
    table = _RECORD_LABELS.get(language) or {}
    return table.get(str(record_key or ""), str(english_label or ""))


def _join_names(names: list[str], language: str) -> str:
    """"A", "A und B", "A, B und C", "A, B und 2 weitere" — one list, one idiom.

    `_authors_line` grew its own copy of this before there was a second caller; it is
    left alone here because rewriting it onto this helper would change shipped text
    (see M2 Deviations — it is the next candidate, not this task's business).
    """
    unique = list(dict.fromkeys(str(name or "").strip() for name in names if str(name or "").strip()))
    if not unique:
        return ""
    if len(unique) == 1:
        return unique[0]
    conj = "and" if language == "english" else "und"
    if len(unique) == 2:
        return f"{unique[0]} {conj} {unique[1]}"
    if len(unique) == 3:
        return f"{unique[0]}, {unique[1]} {conj} {unique[2]}"
    remaining = len(unique) - 2
    if language == "english":
        return f"{unique[0]}, {unique[1]} and {remaining} others"
    if language == "deutsch":
        return f"{unique[0]}, {unique[1]} und {remaining} weitere"
    return f"{unique[0]}, {unique[1]} und no {remaining} weitere"


def _record_lines(*, record: str, gainers: list[str], losers: list[str], holders: list[str], language: str, kind: str = "record") -> dict[str, str]:
    """The three sentences a "record moved" push is built from (M2).

    `gainers_line` and `losers_line` are empty when nobody gained or lost, and carry
    their own trailing newline when they are not — so a template can simply concatenate
    them. `holders_line` is always one sentence, including "nobody holds it right now",
    which is a real answer (a record whose only holder's results were deleted).

    **Plural agreement is decided here, never in the template**: a language cannot pick
    "Holder"/"Holders" from inside a `{}` placeholder, and a template with an `{s}` in it
    is the drift this module exists to prevent.
    """
    # `record` is used by the English lines only: German and Styrian name the record in
    # the template's title and say "den Rekord" in the sentence, because the labels are
    # article-less noun phrases that read wrong after "hat sich …".
    gained = _join_names(gainers, language)
    lost = _join_names(losers, language)
    held = _join_names(holders, language)
    many_gained = len(list(dict.fromkeys(n for n in gainers if str(n or "").strip()))) > 1
    many_lost = len(list(dict.fromkeys(n for n in losers if str(n or "").strip()))) > 1
    holder_count = len(list(dict.fromkeys(n for n in holders if str(n or "").strip())))

    if language == "english":
        if kind == "lead":
            verb = "are" if many_gained else "is"
            gainers_line = f"{gained} {verb} top now.\n" if gained else ""
            verb = "were" if many_lost else "was"
            losers_line = f"{lost} {verb} overtaken.\n" if lost else ""
        else:
            gainers_line = f"{gained} took {record}.\n" if gained else ""
            losers_line = f"Taken from {lost}.\n" if lost else ""
        if holder_count == 0:
            holders_line = "Nobody leads it right now." if kind == "lead" else "Nobody holds it right now."
        elif holder_count == 1:
            holders_line = f"Top now: {held}." if kind == "lead" else f"Holder now: {held}."
        else:
            holders_line = f"Level at the top: {held}."
    elif language == "deutsch":
        if gained:
            # "den Rekord", not "{record}": the labels are article-less noun phrases
            # ("meiste Punkte"), and German wants an article here. The record is named
            # in the title of all three templates, so nothing is lost.
            if kind == "lead":
                verb = "sind" if many_gained else "ist"
                gainers_line = f"{gained} {verb} jetzt vorn.\n"
            else:
                verb = "haben" if many_gained else "hat"
                gainers_line = f"{gained} {verb} sich den Rekord geholt.\n"
        else:
            gainers_line = ""
        if lost:
            if kind == "lead":
                verb = "wurden" if many_lost else "wurde"
                losers_line = f"{lost} {verb} überholt.\n"
            else:
                verb = "sind" if many_lost else "ist"
                losers_line = f"{lost} {verb} nicht mehr vorn.\n"
        else:
            losers_line = ""
        if holder_count == 0:
            holders_line = "Aktuell ist niemand vorn."
        elif holder_count == 1:
            holders_line = f"Aktuell vorn: {held}."
        else:
            holders_line = f"Aktuell gleichauf vorn: {held}."
    else:
        if gained:
            if kind == "lead":
                verb = "san" if many_gained else "is"
                gainers_line = f"{gained} {verb} jetzt vorn.\n"
            else:
                verb = "ham" if many_gained else "hot"
                gainers_line = f"{gained} {verb} si'n Rekord gschnappt.\n"
        else:
            gainers_line = ""
        if lost:
            if kind == "lead":
                verb = "san" if many_lost else "is"
                losers_line = f"{lost} {verb} überholt worn.\n"
            else:
                verb = "san" if many_lost else "is"
                losers_line = f"{lost} {verb} nimma vorn.\n"
        else:
            losers_line = ""
        if holder_count == 0:
            holders_line = "Grod is kana vorn." if kind == "lead" else "Grod hot'n kana."
        elif holder_count == 1:
            holders_line = f"Jetzt vorn: {held}."
        else:
            holders_line = f"Jetzt gleichauf vorn: {held}."

    return {"gainers_line": gainers_line, "losers_line": losers_line, "holders_line": holders_line}


def _vote_line(vote_count: Any, language: str) -> str:
    """The "who else likes this" line, singular at one vote in every language.

    A literal "Jetzt san's 1" reads wrong (Roli, 2026-09-19, second pass), and so do
    "That makes 1 who like it" and its German twin — so all three templates take
    `{vote_line}` rather than an inline `{vote_count}`. The verb is **like**, matching
    the bell (`notificationText.ts`): the board's own word is "want", but a push and a
    bell describing the same act in two different words is the drift this batch exists
    to remove."""
    try:
        count = int(vote_count)
    except (TypeError, ValueError):
        count = 0
    if language == "steirisch":
        return "Jetzt mog des ana a." if count == 1 else f"Jetzt san's {count}, de des a wolln."
    if language == "deutsch":
        return "Jetzt mag das einer auch." if count == 1 else f"Jetzt sind es {count}, denen das gefällt."
    return "One person likes it so far." if count == 1 else f"That is {count} who like it."


def _authors_line(author_names: list[str], language: str) -> str:
    names = [str(name or "").strip() for name in author_names if str(name or "").strip()]
    unique_names = list(dict.fromkeys(names))
    if not unique_names:
        if language == "english":
            return "More players joined the pile-on."
        if language == "deutsch":
            return "Weitere Spieler haben nachgelegt."
        return "No a poar ham no nachg'legt."
    if len(unique_names) == 1:
        name = unique_names[0]
        if language == "english":
            return f"{name} came back for another poke."
        if language == "deutsch":
            return f"{name} hat gleich noch einmal nachgelegt."
        return f"{name} hot glei no amoi nachg'legt."
    if len(unique_names) == 2:
        if language == "english":
            joined = f"{unique_names[0]} and {unique_names[1]}"
        elif language == "deutsch":
            joined = f"{unique_names[0]} und {unique_names[1]}"
        else:
            joined = f"{unique_names[0]} und {unique_names[1]}"
    elif len(unique_names) == 3:
        if language == "english":
            joined = f"{unique_names[0]}, {unique_names[1]} and {unique_names[2]}"
        else:
            joined = f"{unique_names[0]}, {unique_names[1]} und {unique_names[2]}"
    else:
        remaining = len(unique_names) - 2
        if language == "english":
            joined = f"{unique_names[0]}, {unique_names[1]} and {remaining} others"
        elif language == "deutsch":
            joined = f"{unique_names[0]}, {unique_names[1]} und {remaining} weitere"
        else:
            joined = f"{unique_names[0]}, {unique_names[1]} und no {remaining} weitere"
    if language == "english":
        return f"{joined} kept the pokes coming."
    if language == "deutsch":
        return f"{joined} haben weiter angepöbelt."
    return f"{joined} ham weiter angepöbelt."


def render_notification_text(key: str, language: str | None, context: dict[str, Any] | None = None) -> tuple[str, str]:
    resolved_language = normalize_notification_language(language)
    template = _message_template(resolved_language, key)
    raw_context = dict(context or {})
    prepared: dict[str, Any] = dict(raw_context)

    if key == "comment_created" and not str(prepared.get("preview") or "").strip() and prepared.get("preview_is_image_only"):
        if resolved_language == "english":
            prepared["preview"] = "Image-only comment"
        elif resolved_language == "deutsch":
            prepared["preview"] = "Kommentar nur mit Bild"
        else:
            prepared["preview"] = "Nur a Bild im Kommentar"

    if "mode_label" not in prepared and "mode" in prepared:
        prepared["mode_label"] = _mode_label(str(prepared.get("mode") or ""), resolved_language)
    if "authors_line" not in prepared and "author_names" in prepared:
        prepared["authors_line"] = _authors_line(list(prepared.get("author_names") or []), resolved_language)
    if "status_label" not in prepared and "status" in prepared:
        prepared["status_label"] = _status_label(str(prepared.get("status") or ""), resolved_language)
    if "vote_line" not in prepared and "vote_count" in prepared:
        prepared["vote_line"] = _vote_line(prepared.get("vote_count"), resolved_language)
    if "record" in prepared or "record_key" in prepared:
        # The record's *name* is translated too (M2): `{record}` is no longer English
        # inside a German or Styrian push. The English stats label is the fallback.
        prepared["record"] = _record_label(
            str(prepared.get("record_key") or ""), str(prepared.get("record") or ""), resolved_language
        )
    if "record" in prepared and any(k in prepared for k in ("gainers", "losers", "holders")):
        prepared.update(
            _record_lines(
                kind=record_kind(str(prepared.get("record_key") or "")),
                record=str(prepared.get("record") or ""),
                gainers=list(prepared.get("gainers") or []),
                losers=list(prepared.get("losers") or []),
                holders=list(prepared.get("holders") or []),
                language=resolved_language,
            )
        )

    string_context = _SafeFormatDict({k: "" if v is None else str(v) for k, v in prepared.items()})
    return (
        template["title"].format_map(string_context),
        template["body"].format_map(string_context),
    )
