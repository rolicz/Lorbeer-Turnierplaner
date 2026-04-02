from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

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
        return f"{joined} haben weiter angepoebelt."
    return f"{joined} ham weiter angepoebelt."


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

    string_context = _SafeFormatDict({k: "" if v is None else str(v) for k, v in prepared.items()})
    return (
        template["title"].format_map(string_context),
        template["body"].format_map(string_context),
    )
