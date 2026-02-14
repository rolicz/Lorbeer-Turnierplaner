from fastapi import APIRouter, HTTPException, Request
from ..auth import create_token, role_for_password
from ..schemas import LoginBody

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
def login(request: Request, body: LoginBody) -> dict:
    role = role_for_password(request, body.password or "")
    if role is None:
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"token": create_token(request, role), "role": role}
