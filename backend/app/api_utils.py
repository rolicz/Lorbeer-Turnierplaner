from __future__ import annotations

from typing import NoReturn, TypeVar

from fastapi import HTTPException
from sqlmodel import Session, SQLModel

T = TypeVar("T", bound=SQLModel)

# Convention: use these helpers for all non-404 error responses.
#   400 bad_request  — invalid input (missing/malformed field, constraint violation)
#   403 forbidden    — caller lacks permission for this action
#   404 get_or_404   — resource does not exist
#   409 conflict     — request is valid but conflicts with current state
#   413              — raise HTTPException(413, ...) directly (no helper needed; rare)


def get_or_404(session: Session, model: type[T], ident: int, *, name: str | None = None) -> T:
    obj = session.get(model, ident)
    if obj is None:
        label = name or model.__name__
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return obj


def bad_request(msg: str) -> NoReturn:
    raise HTTPException(status_code=400, detail=msg)


def forbidden(msg: str) -> NoReturn:
    raise HTTPException(status_code=403, detail=msg)


def conflict(msg: str) -> NoReturn:
    raise HTTPException(status_code=409, detail=msg)
