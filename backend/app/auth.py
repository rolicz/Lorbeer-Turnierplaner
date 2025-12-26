import time
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)

ROLE_ORDER = {"reader": 1, "editor": 2, "admin": 3}

def create_token(request: Request, role: str) -> str:
    if role not in ROLE_ORDER:
        raise ValueError("invalid role")

    s = request.app.state.settings
    now = int(time.time())
    payload = {"sub": "user", "role": role, "iat": now, "exp": now + 60 * 60 * 24 * 30}
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256")

def role_for_password(request: Request, pw: str) -> str | None:
    s = request.app.state.settings
    print(pw)
    print(s.admin_password)
    if pw == s.admin_password:
        return "admin"
    if pw == s.editor_password:
        return "editor"
    return None

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

def require_min_role(min_role: str):
    min_rank = ROLE_ORDER[min_role]

    def dep(
        request: Request,
        creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> str:
        if creds is None:
            raise HTTPException(status_code=401, detail="Missing token")

        s = request.app.state.settings
        try:
            payload = jwt.decode(creds.credentials, s.jwt_secret, algorithms=["HS256"])
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")

        role = payload.get("role")
        if role not in ROLE_ORDER or ROLE_ORDER[role] < min_rank:
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        return role

    return dep

require_editor = require_min_role("editor")
require_admin = require_min_role("admin")
