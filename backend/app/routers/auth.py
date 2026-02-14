from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session

from ..auth import create_token, resolve_player_login
from ..db import get_session
from ..schemas import LoginBody

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(request: Request, body: LoginBody, s: Session = Depends(get_session)) -> dict:
    username = str(body.username or "").strip()
    password = str(body.password or "")
    resolved = resolve_player_login(request, s, username=username, password=password)
    if resolved is None:
        raise HTTPException(status_code=401, detail="Wrong username/password")

    player, role = resolved
    token = create_token(request, role=role, player_id=int(player.id), player_name=player.display_name)
    return {
        "token": token,
        "role": role,
        "player_id": int(player.id),
        "player_name": player.display_name,
    }
