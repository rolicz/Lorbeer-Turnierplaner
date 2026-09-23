from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from ..auth import require_auth_claims
from ..db import get_session
from ..models import PushSubscription
from ..schemas import PushSubscriptionBody, PushSubscriptionDeleteBody
from ..schemas.responses import (
    OkResponse,
    PushConfigOut,
    PushDisableOut,
    PushSubscriptionResultOut,
    PushSubscriptionsListOut,
)
from ..services.notification_texts import default_notification_language, notification_language_options
from ..services.notifications import (
    disable_push_subscription,
    list_push_subscriptions_for_player,
    localized_push_message,
    notification_mode_options,
    push_dispatcher_from_request,
    push_subscription_language,
    push_subscription_mode,
    retire_replaced_push_subscription,
    upsert_push_subscription,
)
from ..services.paths import group_path

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/config", response_model=PushConfigOut)
def get_push_config(request: Request) -> dict:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is None:
        return {
            "enabled": False,
            "configured": False,
            "vapid_public_key": "",
            "reason": "Push dispatcher is unavailable.",
            "ios_home_screen_required": True,
            "default_notification_language": default_notification_language(),
            "notification_languages": notification_language_options(),
            "default_notification_mode": "finished_only",
            "notification_modes": notification_mode_options(),
        }
    return {
        "enabled": dispatcher.enabled,
        "configured": dispatcher.configured,
        "vapid_public_key": dispatcher.public_key if dispatcher.enabled else "",
        "reason": dispatcher.disabled_reason,
        "ios_home_screen_required": True,
        "default_notification_language": default_notification_language(),
        "notification_languages": notification_language_options(),
        "default_notification_mode": "finished_only",
        "notification_modes": notification_mode_options(),
    }


@router.put("/subscription", response_model=PushSubscriptionResultOut)
def put_subscription(
    request: Request,
    body: PushSubscriptionBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    dispatcher = push_dispatcher_from_request(request)
    if dispatcher is None or not dispatcher.enabled:
        raise HTTPException(status_code=503, detail=dispatcher.disabled_reason if dispatcher else "Push is unavailable")

    # A subscription the push service itself rejected (404/410) is a corpse, not a
    # paused device: `_deliver_one` disabled it because APNs/FCM said the endpoint is
    # gone, and it will say so again. `upsert_push_subscription` clears `disabled_at`,
    # so a client that kept the dead endpoint used to resurrect it on every launch and
    # kill it again on the next push, silently, for ever (P5). Refusing with 410 tells
    # the client to rotate (unsubscribe -> subscribe -> PUT a *new* endpoint); the new
    # endpoint is a different row and is accepted normally. A row a client disabled
    # itself carries no rejection status and is re-enabled as before.
    endpoint_norm = str(body.endpoint or "").strip()
    if endpoint_norm:
        dead = s.exec(select(PushSubscription).where(PushSubscription.endpoint == endpoint_norm)).first()
        if dead is not None and dead.disabled_at is not None and dead.last_http_status in (404, 410):
            raise HTTPException(status_code=410, detail="The push service no longer knows this endpoint; subscribe again")

    player_id = int(claims.get("player_id"))
    # A device replacing its own endpoint (a 410 rotation, or `sw.js` answering
    # `pushsubscriptionchange` with the session cookie) keeps its language and mode and
    # stops leaving the old row enabled behind it (L10). Explicit values in the body win.
    inherited = retire_replaced_push_subscription(
        s, player_id=player_id, replaces_endpoint=body.replaces_endpoint, new_endpoint=endpoint_norm
    )
    language = body.notification_language
    mode = body.notification_mode
    if inherited is not None:
        language = language or inherited.notification_language
        mode = mode or inherited.notification_mode

    try:
        row = upsert_push_subscription(
            s,
            player_id=player_id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
            content_encoding=body.contentEncoding or "aes128gcm",
            user_agent=body.user_agent or request.headers.get("user-agent", ""),
            app_platform=body.app_platform or "",
            app_standalone=bool(body.app_standalone),
            notification_language=language,
            notification_mode=mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    s.commit()
    s.refresh(row)
    notification_language = push_subscription_language(s, row.id)
    notification_mode = push_subscription_mode(s, row.id)
    return {
        "ok": True,
        "id": int(row.id),
        "player_id": int(row.player_id),
        "endpoint": row.endpoint,
        "disabled": row.disabled_at is not None,
        "updated_at": row.updated_at,
        "notification_language": notification_language,
        "notification_mode": notification_mode,
    }


@router.delete("/subscription", response_model=PushDisableOut)
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


@router.get("/subscriptions/me", response_model=PushSubscriptionsListOut)
def list_my_subscriptions(
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    subscriptions = list_push_subscriptions_for_player(s, int(claims.get("player_id")))
    return {
        "count": len(subscriptions),
        "endpoints": [row["endpoint"] for row in subscriptions],
        "subscriptions": subscriptions,
    }


@router.post("/test", response_model=OkResponse)
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
        localized_push_message(
            "push_test",
            path=group_path("/dashboard"),
            tag=f"push-test-{int(claims.get('player_id'))}",
            event_type="push_test",
            player_name=player_name,
        ),
    )
    return {"ok": True}
