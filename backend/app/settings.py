from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import json
import os

@dataclass(frozen=True)
class PlayerAccount:
    name: str
    password: str
    admin: bool = False

@dataclass(frozen=True)
class Settings:
    db_url: str
    player_accounts: tuple[PlayerAccount, ...]
    jwt_secret: str
    ws_require_auth: bool
    log_level: str
    push_vapid_public_key: str = ""
    push_vapid_private_key: str = ""
    push_vapid_subject: str = ""
    push_ttl_seconds: int = 300


def load_settings(
    *,
    secrets_path: str,
    db_url: str | None = None,
    jwt_secret: str | None = None,
    ws_require_auth: bool | None = None,
    log_level: str | None = None,
) -> Settings:
    secrets: dict = {}
    p = Path(secrets_path)
    if p.exists():
        secrets = json.loads(p.read_text(encoding="utf-8"))

    def env_pick(*keys: str) -> str | None:
        for key in keys:
            raw = os.environ.get(key)
            if raw is not None and str(raw).strip() != "":
                return str(raw)
        return None

    def pick(key: str, cli_val: str | None, default: str, *, env_key: str | None = None) -> str:
        env_value = env_pick(env_key or key.upper())
        secret_value = secrets.get(key)
        if cli_val:
            return cli_val
        if env_value:
            return env_value
        if secret_value not in (None, ""):
            return str(secret_value)
        return default

    def pick_int(key: str, default: int, *, env_key: str | None = None) -> int:
        raw = env_pick(env_key or key.upper())
        if raw is None:
            raw = secrets.get(key, default)
        try:
            value = int(raw)
        except Exception:
            return default
        return value if value > 0 else default

    def pick_bool(key: str, cli_val: bool | None, default: bool, *, env_key: str | None = None) -> bool:
        if cli_val is not None:
            return cli_val
        raw = env_pick(env_key or key.upper())
        if raw is None:
            raw = secrets.get(key, default)
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, str):
            return raw.strip().lower() in {"1", "true", "yes", "on"}
        return bool(raw)

    raw_accounts = secrets.get("player_accounts") or []
    accounts: list[PlayerAccount] = []
    if isinstance(raw_accounts, list):
        for raw in raw_accounts:
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("name") or "").strip()
            password = str(raw.get("password") or "")
            if not name or not password:
                continue
            admin = bool(raw.get("admin", False))
            accounts.append(PlayerAccount(name=name, password=password, admin=admin))

    push_vapid_private_key = pick("push_vapid_private_key", None, "", env_key="PUSH_VAPID_PRIVATE_KEY").strip()
    push_vapid_private_key_file = pick("push_vapid_private_key_file", None, "", env_key="PUSH_VAPID_PRIVATE_KEY_FILE").strip()
    if push_vapid_private_key_file:
        key_path = Path(push_vapid_private_key_file)
        candidate_paths: list[Path] = [key_path]
        if not key_path.is_absolute():
            candidate_paths.insert(0, p.parent / key_path)
        for resolved_key_path in candidate_paths:
            if resolved_key_path.exists() and resolved_key_path.is_file():
                push_vapid_private_key = resolved_key_path.read_text(encoding="utf-8").strip()
                break

    return Settings(
        db_url=pick("db_url", db_url, "sqlite:///./app.db", env_key="DB_URL"),
        player_accounts=tuple(accounts),
        jwt_secret=pick("jwt_secret", jwt_secret, "dev-change-me", env_key="JWT_SECRET"),
        ws_require_auth=pick_bool("ws_require_auth", ws_require_auth, False, env_key="WS_REQUIRE_AUTH"),
        log_level=pick("log_level", log_level, "INFO", env_key="LOG_LEVEL"),
        push_vapid_public_key=pick("push_vapid_public_key", None, "", env_key="PUSH_VAPID_PUBLIC_KEY").strip(),
        push_vapid_private_key=push_vapid_private_key,
        push_vapid_subject=pick("push_vapid_subject", None, "", env_key="PUSH_VAPID_SUBJECT").strip(),
        push_ttl_seconds=pick_int("push_ttl_seconds", 300, env_key="PUSH_TTL_SECONDS"),
    )
