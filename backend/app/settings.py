from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json

@dataclass(frozen=True)
class Settings:
    db_url: str
    editor_password: str
    admin_password: str
    jwt_secret: str
    ws_require_auth: bool
    log_level: str


def load_settings(
    *,
    secrets_path: str,
    db_url: str | None = None,
    editor_password: str | None = None,
    admin_password: str | None = None,
    jwt_secret: str | None = None,
    ws_require_auth: bool | None = None,
    log_level: str | None = None,
) -> Settings:
    secrets: dict = {}
    p = Path(secrets_path)
    if p.exists():
        secrets = json.loads(p.read_text(encoding="utf-8"))

    def pick(key: str, cli_val: str | None, default: str) -> str:
        return cli_val or secrets.get(key) or default

    def pick_bool(key: str, cli_val: bool | None, default: bool) -> bool:
        if cli_val is not None:
            return cli_val
        raw = secrets.get(key, default)
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str):
            return raw.strip().lower() in {"1", "true", "yes", "on"}
        return bool(raw)

    return Settings(
        db_url=pick("db_url", db_url, "sqlite:///./app.db"),
        editor_password=pick("editor_password", editor_password, "change-me-editor"),
        admin_password=pick("admin_password", admin_password, "change-me-admin"),
        jwt_secret=pick("jwt_secret", jwt_secret, "dev-change-me"),
        ws_require_auth=pick_bool("ws_require_auth", ws_require_auth, False),
        log_level=pick("log_level", log_level, "INFO"),
    )
