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
    log_level: str
    cup_initial_owner_player_id: int


def load_settings(
    *,
    secrets_path: str,
    db_url: str | None = None,
    editor_password: str | None = None,
    admin_password: str | None = None,
    jwt_secret: str | None = None,
    log_level: str | None = None,
    cup_initial_owner_player_id: int | None = None,
) -> Settings:
    secrets: dict = {}
    p = Path(secrets_path)
    if p.exists():
        secrets = json.loads(p.read_text(encoding="utf-8"))

    def pick(key: str, cli_val: str | None, default: str) -> str:
        return cli_val or secrets.get(key) or default

    return Settings(
        db_url=pick("db_url", db_url, "sqlite:///./app.db"),
        editor_password=pick("editor_password", editor_password, "change-me-editor"),
        admin_password=pick("admin_password", admin_password, "change-me-admin"),
        jwt_secret=pick("jwt_secret", jwt_secret, "dev-change-me"),
        log_level=pick("log_level", log_level, "INFO"),
        cup_initial_owner_player_id=int(pick("cup_initial_owner_player_id", cup_initial_owner_player_id, "1")),
    )
