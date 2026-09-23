"""Who the caller is, and what they may do (L2).

The auth gate (`app/auth_gate.py`) has already resolved the session cookie into
`request.state.claims` by the time a route runs; this module only *reads* it. There is no
bearer header, no JWT and no `reader` role any more: every route gets a real requirement.

    ROLE_ORDER: none < editor < owner < admin

`require_editor` (≥ editor — a plain member of the current group), `require_owner`
(≥ owner — new, for L3's group operations), `require_admin` (site admin, exactly today's
meaning; no admin route becomes an owner route in part 1). The `*_claims` variants hand the
claims dict to handlers that need the caller's identity.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request

from .auth_gate import NOT_LOGGED_IN

ROLE_ORDER: dict[str, int] = {"none": 0, "editor": 1, "owner": 2, "admin": 3}


def require_auth_claims(request: Request) -> dict:
    """The claims the gate wrote, or 401. Behind the gate this is unreachable except on a
    public path — where "not logged in" is exactly the right answer."""
    claims = getattr(request.state, "claims", None)
    if not claims:
        raise HTTPException(status_code=401, detail=NOT_LOGGED_IN)
    return claims


def _rank(claims: dict) -> int:
    role = str(claims.get("role") or "none")
    return ROLE_ORDER.get(role, 0)


def require_min_role(min_role: str):
    """A dependency that answers the caller's role, or 403 below `min_role`."""
    min_rank = ROLE_ORDER[min_role]

    def dep(claims: dict = Depends(require_auth_claims)) -> str:
        if _rank(claims) < min_rank:
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        return str(claims.get("role"))

    return dep


def require_min_role_claims(min_role: str):
    """Like `require_min_role`, but hands back the whole claims dict."""
    min_rank = ROLE_ORDER[min_role]

    def dep(claims: dict = Depends(require_auth_claims)) -> dict:
        if _rank(claims) < min_rank:
            raise HTTPException(status_code=403, detail="Insufficient privileges")
        return claims

    return dep


require_editor = require_min_role("editor")
require_owner = require_min_role("owner")
require_admin = require_min_role("admin")

require_editor_claims = require_min_role_claims("editor")
require_owner_claims = require_min_role_claims("owner")
require_admin_claims = require_min_role_claims("admin")
