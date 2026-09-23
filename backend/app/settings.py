from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger(__name__)

#: The environments `APP_ENV` may name. Anything else refuses to boot, so a typo such as
#: `prod` cannot quietly switch the production guards off.
APP_ENVS: tuple[str, ...] = ("production", "development", "test")

@dataclass(frozen=True)
class PlayerAccount:
    name: str
    password: str
    admin: bool = False

@dataclass(frozen=True)
class Settings:
    db_url: str
    player_accounts: tuple[PlayerAccount, ...]
    log_level: str
    #: Kept only for `POST /auth/exchange` (L2), which trades the pre-batch JWT for a cookie
    #: session; empty means the exchange answers 410. Deleted together with `PyJWT`,
    #: `services/legacy_jwt.py` and the endpoint by the batch after the auth batch is proven.
    jwt_secret: str = ""
    push_vapid_public_key: str = ""
    push_vapid_private_key: str = ""
    push_vapid_subject: str = ""
    push_ttl_seconds: int = 300
    # --- auth (the 2026-09 auth batch, L1) ---------------------------------------------
    #: The one origin the app is served from in pinned mode; the WebAuthn origin (L8) and
    #: the cookie's `Secure` flag (L2) follow it.
    auth_origin: str = "https://lorbeerkranz.xyz"
    auth_rp_id: str = "lorbeerkranz.xyz"
    auth_rp_name: str = "Lorbeerkranz"
    #: Dev only: derive the relying party from the request's `Origin`. Refused in production.
    auth_dev_origin: bool = False
    #: "production" | "development" | "test".
    app_env: str = "development"
    #: How many reverse proxies stand in front of the backend (Caddy = 1); the client IP is
    #: read that many entries from the right of `X-Forwarded-For` (L2).
    trusted_proxy_hops: int = 0
    #: `services/passwords.py` profile: "default" (argon2id, RFC 9106) | "test" (fast).
    password_hash_profile: str = "default"
    session_ttl_days: int = 90


class AuthConfigError(RuntimeError):
    """The server is configured in a way that is unsafe to serve logins from."""


def assert_auth_config_safe(settings: Settings) -> None:
    """Refuse to start on an unsafe auth configuration; warn on a merely inaccurate one.

    Called by `create_app` before anything else, so a refused boot names the setting in
    its last log line. Every setting it names lives in `docker-compose.yml` or has a
    production default in code — none of them is a `secrets.json` key that must exist.
    """
    # Imported lazily: `passwords` imports argon2, and `settings` is imported by tools
    # that never hash anything.
    from .services.passwords import PASSWORD_HASH_PROFILES

    if settings.app_env not in APP_ENVS:
        raise AuthConfigError(f"APP_ENV={settings.app_env!r} is not one of {', '.join(APP_ENVS)}.")
    if settings.password_hash_profile not in PASSWORD_HASH_PROFILES:
        raise AuthConfigError(
            f"PASSWORD_HASH_PROFILE={settings.password_hash_profile!r} is not one of {', '.join(PASSWORD_HASH_PROFILES)}."
        )
    if settings.auth_dev_origin and settings.app_env == "production":
        raise AuthConfigError(
            "AUTH_DEV_ORIGIN is set on a production server — refusing to derive the WebAuthn origin from requests. Unset it."
        )
    if not settings.auth_dev_origin and not settings.auth_origin.startswith("https://"):
        raise AuthConfigError("AUTH_ORIGIN must be https in pinned mode (or set AUTH_DEV_ORIGIN=1 for development).")
    if settings.app_env == "production" and settings.password_hash_profile != "default":
        raise AuthConfigError(
            f"PASSWORD_HASH_PROFILE={settings.password_hash_profile!r} on a production server — only 'default' may hash real passwords."
        )
    if settings.app_env == "production" and settings.trusted_proxy_hops < 1:
        # A wrong count degrades accuracy, never safety — and a crash here is a lock-out.
        log.warning(
            "TRUSTED_PROXY_HOPS=%s on a production server: the client IP cannot be read from "
            "X-Forwarded-For, so every caller shares one rate-limit bucket. Set it to 1 behind Caddy.",
            settings.trusted_proxy_hops,
        )


def load_settings(
    *,
    secrets_path: str,
    db_url: str | None = None,
    jwt_secret: str | None = None,
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

    def pick_non_negative_int(key: str, default: int, *, env_key: str | None = None) -> int:
        raw = env_pick(env_key or key.upper())
        if raw is None:
            raw = secrets.get(key, default)
        try:
            value = int(raw)
        except Exception:
            return default
        return value if value >= 0 else default

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
        log_level=pick("log_level", log_level, "INFO", env_key="LOG_LEVEL"),
        jwt_secret=pick("jwt_secret", jwt_secret, "", env_key="JWT_SECRET"),
        push_vapid_public_key=pick("push_vapid_public_key", None, "", env_key="PUSH_VAPID_PUBLIC_KEY").strip(),
        push_vapid_private_key=push_vapid_private_key,
        push_vapid_subject=pick("push_vapid_subject", None, "", env_key="PUSH_VAPID_SUBJECT").strip(),
        push_ttl_seconds=pick_int("push_ttl_seconds", 300, env_key="PUSH_TTL_SECONDS"),
        auth_origin=pick("auth_origin", None, "https://lorbeerkranz.xyz", env_key="AUTH_ORIGIN").strip().rstrip("/"),
        auth_rp_id=pick("auth_rp_id", None, "lorbeerkranz.xyz", env_key="AUTH_RP_ID").strip(),
        auth_rp_name=pick("auth_rp_name", None, "Lorbeerkranz", env_key="AUTH_RP_NAME").strip(),
        auth_dev_origin=pick_bool("auth_dev_origin", None, False, env_key="AUTH_DEV_ORIGIN"),
        app_env=pick("app_env", None, "development", env_key="APP_ENV").strip().lower(),
        trusted_proxy_hops=pick_non_negative_int("trusted_proxy_hops", 0, env_key="TRUSTED_PROXY_HOPS"),
        password_hash_profile=pick("password_hash_profile", None, "default", env_key="PASSWORD_HASH_PROFILE").strip(),
        session_ttl_days=pick_int("session_ttl_days", 90, env_key="SESSION_TTL_DAYS"),
    )
