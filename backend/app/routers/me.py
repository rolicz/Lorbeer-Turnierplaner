from fastapi import APIRouter, Depends

from ..auth import require_auth_claims
from ..schemas.responses import MeOut

router = APIRouter(tags=["auth"])


@router.get("/me", response_model=MeOut)
def me(claims: dict = Depends(require_auth_claims)) -> dict:
    return {
        "role": claims.get("role"),
        "player_id": claims.get("player_id"),
        "player_name": claims.get("player_name"),
        "sub": claims.get("sub"),
        "iat": claims.get("iat"),
        "exp": claims.get("exp"),
    }
