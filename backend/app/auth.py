import time
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlmodel import Session, select

from .models import Player

bearer = HTTPBearer(auto_error=False)

ROLE_ORDER = {"reader": 1, "editor": 2, "admin": 3}

def _normalize_name(name: str) -> str:
    return str(name or "").strip().casefold()


def _configured_account(request: Request, username: str) -> dict | None:
    target = _normalize_name(username)
    if not target:
        return None
    for acc in request.app.state.settings.player_accounts:
        if _normalize_name(acc.name) == target:
            return {"name": acc.name, "password": acc.password, "admin": bool(acc.admin)}
    return None


def create_token(request: Request, *, role: str, player_id: int, player_name: str) -> str:
    if role not in ROLE_ORDER:
        raise ValueError("invalid role")

    s = request.app.state.settings
    now = int(time.time())
    payload = {
        "sub": f"player:{int(player_id)}",
        "role": role,
        "player_id": int(player_id),
        "player_name": str(player_name),
        "iat": now,
        "exp": now + 60 * 60 * 24 * 180,
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")


def resolve_player_login(
    request: Request,
    s: Session,
    *,
    username: str,
    password: str,
) -> tuple[Player, str] | None:
    account = _configured_account(request, username)
    if account is None:
        return None
    if password != account["password"]:
        return None

    uname = _normalize_name(username)
    player = s.exec(
        select(Player).where(func.lower(Player.display_name) == uname).order_by(Player.id.asc())
    ).first()
    if player is None or player.id is None:
        return None

    role = "admin" if account["admin"] else "editor"
    return player, role

def decode_token(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict | None:
    if creds is None:
        return None
    s = request.app.state.settings
    try:
        return jwt.decode(creds.credentials, s.jwt_secret, algorithms=["HS256"])
    except Exception:
        return None


def decode_token_string(jwt_secret: str, token: str) -> dict | None:
    try:
        return jwt.decode(token, jwt_secret, algorithms=["HS256"])
    except Exception:
        return None


def require_auth_claims(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Missing token")

    s = request.app.state.settings
    try:
        payload = jwt.decode(creds.credentials, s.jwt_secret, algorithms=["HS256"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    role = payload.get("role")
    player_id_raw = payload.get("player_id")
    try:
        player_id = int(player_id_raw)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    if role not in ROLE_ORDER:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    payload["player_id"] = player_id
    return payload


def require_min_role(min_role: str):
    min_rank = ROLE_ORDER[min_role]

    def dep(
        claims: dict = Depends(require_auth_claims),
    ) -> str:
        role = claims.get("role")
        if role not in ROLE_ORDER or ROLE_ORDER[role] < min_rank:
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        return role

    return dep

require_editor = require_min_role("editor")
require_admin = require_min_role("admin")


def require_editor_claims(claims: dict = Depends(require_auth_claims)) -> dict:
    role = claims.get("role")
    if role not in ROLE_ORDER or ROLE_ORDER[role] < ROLE_ORDER["editor"]:
        raise HTTPException(status_code=403, detail="Insufficient privileges")
    return claims
