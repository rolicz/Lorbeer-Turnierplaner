from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException
from sqlmodel import Session, SQLModel

T = TypeVar("T", bound=SQLModel)


def get_or_404(session: Session, model: type[T], ident: int, *, name: str | None = None) -> T:
    obj = session.get(model, ident)
    if obj is None:
        label = name or model.__name__
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return obj
