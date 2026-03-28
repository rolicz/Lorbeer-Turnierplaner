from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..auth import require_auth_claims
from ..db import get_session
from ..models import PushSubscription
from ..schemas import PushSubscriptionBody, PushSubscriptionDeleteBody
from ..services.notifications import (
    PushMessage,
    disable_push_subscription,
    push_dispatcher_from_request,
    upsert_push_subscription,
)

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/config")
def get_push_config(request: Request) -> dict:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is None:
        return {"enabled": False, "vapid_public_key": "", "reason": "Push dispatcher is unavailable."}
    return {
        "enabled": dispatcher.enabled,
        "configured": dispatcher.configured,
        "vapid_public_key": dispatcher.public_key if dispatcher.enabled else "",
        "reason": dispatcher.disabled_reason,
        "ios_home_screen_required": True,
    }


@router.put("/subscription")
def put_subscription(
    request: Request,
    body: PushSubscriptionBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is None or not dispatcher.enabled:
        raise HTTPException(status_code=503, detail=dispatcher.disabled_reason if dispatcher else "Push is unavailable")

    try:
        row = upsert_push_subscription(
            s,
            player_id=int(claims.get("player_id")),
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            content_encoding=body.contentEncoding or "aes128gcm",
            user_agent=body.user_agent or request.headers.get("user-agent", ""),
            app_platform=body.app_platform or "",
            app_standalone=bool(body.app_standalone),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    s.commit()
    s.refresh(row)
    return {
        "ok": True,
        "id": int(row.id),
        "player_id": int(row.player_id),
        "endpoint": row.endpoint,
        "disabled": row.disabled_at is not None,
        "updated_at": row.updated_at,
    }


@router.delete("/subscription")
def delete_subscription(
    body: PushSubscriptionDeleteBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    disabled = disable_push_subscription(
        s,
        player_id=int(claims.get("player_id")),
        endpoint=body.endpoint,
    )
    if disabled:
        s.commit()
    return {"ok": True, "disabled": disabled}


@router.get("/subscriptions/me")
def list_my_subscriptions(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    rows = list(
        s.exec(
            select(PushSubscription).where(
                PushSubscription.player_id == int(claims.get("player_id")),
                PushSubscription.disabled_at.is_(None),
            )
        ).all()
    )
    return {"count": len(rows), "endpoints": [row.endpoint for row in rows]}


@router.post("/test")
def send_test_notification(
    request: Request,
    claims: dict = Depends(require_auth_claims),
) -> dict:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is None or not dispatcher.enabled:
        raise HTTPException(status_code=503, detail=dispatcher.disabled_reason if dispatcher else "Push is unavailable")

    player_name = str(claims.get("player_name") or "Player")
    dispatcher.enqueue_for_player(
        int(claims.get("player_id")),
        PushMessage(
            title="Push notifications enabled",
            body=f"Notifications are working for {player_name}.",
            path="/dashboard",
            tag=f"push-test-{int(claims.get('player_id'))}",
            event_type="push_test",
        ),
    )
    return {"ok": True}
