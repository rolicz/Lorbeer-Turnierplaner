"""The one reader of the pre-batch JWT (L2), kept for `POST /auth/exchange`.

Until the 2026-09 auth batch the login was an HS256 JWT in `localStorage`, good for 180
days. Nobody is logged out by the switch to cookie sessions because the first boot of the
new frontend trades that token for one session through the exchange endpoint — which
verifies it exactly as `app/auth.py` did at `cfc1669`. A later batch drops `jwt_secret`,
`PyJWT`, the endpoint and this module together (FEATURES_2026-09-auth.md, Deferred).
"""

from __future__ import annotations

import jwt


def claims_from_legacy_token(secret: str, token: str) -> dict | None:
    """`{player_id, player_name}` from a valid legacy token, else None.

    The token's `role` is deliberately **not** returned: what a person may do now comes from
    their account and memberships, never from a claim minted a season ago."""
    if not secret or not token:
        return None
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except Exception:  # noqa: BLE001 - any failure to verify is "not a valid token"
        return None
    try:
        player_id = int(payload.get("player_id"))
    except (TypeError, ValueError):
        return None
    return {"player_id": player_id, "player_name": str(payload.get("player_name") or "")}
