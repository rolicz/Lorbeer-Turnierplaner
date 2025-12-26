from fastapi import APIRouter, Depends, HTTPException

from ..auth import decode_token

router = APIRouter(tags=["auth"])


@router.get("/me")
def me(claims: dict | None = Depends(decode_token)) -> dict:
    if claims is None:
        # returning 401 is usually better than returning role:null,
        # because it clearly tells the frontend "not logged in"
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {
        "role": claims.get("role"),
        "sub": claims.get("sub"),
        "iat": claims.get("iat"),
        "exp": claims.get("exp"),
    }
