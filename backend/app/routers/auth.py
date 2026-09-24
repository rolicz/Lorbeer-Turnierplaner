"""The login surface (L2): password login, logout, the legacy-token exchange, my sessions.

Thin: the rules live in `services/sessions.py` (the row and the cookie),
`services/rate_limit.py` (slowing an attacker down), `services/groups.py` (what the session
means) and `services/passwords.py` (argon2id). L3 added register / redeem / reset /
password over `services/accounts.py`, `services/invites.py` and `services/reset_links.py`;
L8 the six passkey routes over `services/passkeys.py`.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from sqlmodel import Session, select

from ..auth import require_auth_claims
from ..db import get_session
from ..models import Account, Player
from ..schemas import (
    EmailBody,
    EmailVerifyBody,
    LoginBody,
    LogoutBody,
    PasskeyLoginVerifyBody,
    PasskeyRegisterVerifyBody,
    PasswordChangeBody,
    RedeemBody,
    RegisterBody,
    ResetBody,
)
from ..schemas.responses import EmailStatusOut, EmailVerifiedOut, MeOut, OkResponse, PasskeyOut, RevokedOut, SessionOut
from ..services.account_email import (
    MAIL_OFF,
    NOTHING_TO_SEND,
    SEND_FAILED,
    cancel_pending,
    consume_verification,
    discard_verification,
    email_key,
    email_status,
    ensure_email_free,
    pending_email_for,
    remove_email,
    request_verification,
    sweep_expired_verifications,
    validate_email,
    verification_url,
    verified_email_for,
)
from ..services.accounts import change_password, remove_password, session_out, set_password
from ..services.accounts import register as register_account
from ..services.auth_migration import name_key
from ..services.device_label import device_label
from ..services.groups import build_claims, current_group
from ..services.invites import redeem_invite
from ..services.legacy_jwt import claims_from_legacy_token
from ..services.mail import MailMessage, MailNotConfigured, MailSendError, MailTransport, mask_address
from ..services.mail_texts import email_changed_message, verify_email_message
from ..services.notifications import disable_push_subscription
from ..services.passkeys import (
    PasskeyConflict,
    PasskeyRefused,
    authentication_options,
    list_passkeys,
    passkey_out,
    registration_options,
    relying_party_for,
    remove_passkey,
    sweep_expired_challenges,
    verify_authentication,
    verify_registration,
)
from ..services.passwords import hash_password, hasher_for, validate_new_password, verify_password
from ..services.rate_limit import enforce, limits_for, record_failure, record_success
from ..services.reset_links import consume_reset, find_live_reset, link_origin
from ..services.sessions import (
    clear_session_cookie,
    cookie_secure_for,
    create_session,
    list_sessions,
    me_payload,
    revoke_all_sessions,
    revoke_session,
    session_ttl,
    set_session_cookie,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

WRONG_LOGIN = "Wrong username or password"

#: A hash to verify against when the name is unknown or the account has no password, so
#: an unknown name costs the same argon2 time as a wrong password — no timing oracle on
#: whether a name exists. Built once per hasher, lazily.
_DUMMY_HASHES: dict[int, str] = {}


def _dummy_hash(ph) -> str:
    key = id(ph)
    if key not in _DUMMY_HASHES:
        _DUMMY_HASHES[key] = hash_password(ph, "not-a-real-password")
    return _DUMMY_HASHES[key]


def _cookie_secure(request: Request) -> bool:
    return cookie_secure_for(request.app.state.settings, origin=request.headers.get("origin"), scheme=request.url.scheme)


def _me(request: Request, s: Session, claims: dict) -> dict:
    """`MeOut` for this request — `me_payload` with this server's answer to "can it send
    mail" (`app.state.mail.configured`, never the transport's kind)."""
    return me_payload(s, claims, email_available=bool(request.app.state.mail.configured))


def _start_session(request: Request, response: Response, s: Session, *, player: Player, kind: str) -> dict:
    """Mint the session, set the cookie, answer `MeOut`. One path for every way in.

    A live session the request already carries is revoked first: the browser is about to
    overwrite that cookie, so its row could never be used again and would only sit in the
    device list for 90 days."""
    settings = request.app.state.settings
    old = getattr(request.state, "claims", None)
    if old and old.get("session_id") is not None:
        revoke_session(s, int(old["player_id"]), int(old["session_id"]))

    ttl = session_ttl(settings)
    user_agent = request.headers.get("user-agent", "")
    row, token = create_session(
        s,
        player_id=int(player.id),
        kind=kind,
        user_agent=user_agent,
        ip=str(getattr(request.state, "client_ip", "") or ""),
        ttl=ttl,
        device_label=device_label(user_agent),
    )
    s.commit()
    claims = build_claims(s, player_id=int(player.id), session_id=int(row.id))
    if claims is None:  # the account vanished between the check and the mint — not a login
        raise HTTPException(status_code=401, detail=WRONG_LOGIN)
    set_session_cookie(response, token, secure=_cookie_secure(request), max_age=int(ttl.total_seconds()))
    return _me(request, s, claims)


@router.post("/login", response_model=MeOut)
def login(request: Request, response: Response, body: LoginBody, s: Session = Depends(get_session)) -> dict:
    settings = request.app.state.settings
    username = str(body.username or "").strip()
    password = str(body.password or "")
    key = name_key(username)

    limits = limits_for("login", ip=str(getattr(request.state, "client_ip", "") or ""), account=key or None)
    enforce(request, limits)

    ph = hasher_for(settings.password_hash_profile)
    account = s.exec(select(Account).where(Account.name_key == key)).first() if key else None
    if account is None or not account.password_hash:
        # Same work as a real check, same answer: a wrong name and a wrong password are one 401.
        verify_password(ph, _dummy_hash(ph), password)
        ok, needs_rehash = False, False
    else:
        ok, needs_rehash = verify_password(ph, account.password_hash, password)

    if not ok:
        record_failure(request, limits)
        log.info("Login refused for %r from %s", username, getattr(request.state, "client_ip", "?"))
        raise HTTPException(status_code=401, detail=WRONG_LOGIN)

    record_success(request, limits)
    if needs_rehash:
        account.password_hash = hash_password(ph, password)
        s.add(account)

    player = s.get(Player, int(account.player_id))
    if player is None:
        raise HTTPException(status_code=401, detail=WRONG_LOGIN)
    return _start_session(request, response, s, player=player, kind="password")


@router.post("/logout", response_model=OkResponse)
def logout(
    request: Request,
    response: Response,
    body: LogoutBody | None = None,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """End this device's session. With `push_endpoint`, also disable that device's push
    subscription in the same request, so no client-side hook has to race the session's end."""
    pid = int(claims["player_id"])
    if claims.get("session_id") is not None:
        revoke_session(s, pid, int(claims["session_id"]))
    endpoint = str((body.push_endpoint if body else "") or "").strip()
    if endpoint:
        disable_push_subscription(s, player_id=pid, endpoint=endpoint)
    s.commit()
    clear_session_cookie(response, secure=_cookie_secure(request))
    return {"ok": True}


@router.post("/exchange", response_model=MeOut)
def exchange(request: Request, response: Response, s: Session = Depends(get_session)) -> dict:
    """Trade the pre-batch JWT (`Authorization: Bearer <token>`) for one cookie session.

    This is what keeps "nobody is logged out by the deploy" true: the first boot of the new
    frontend finds the old token in `localStorage` and comes here. Answers **410** once
    `jwt_secret` is empty — the day a later batch retires the legacy login for good."""
    settings = request.app.state.settings
    if not settings.jwt_secret:
        raise HTTPException(status_code=410, detail="The old login has been retired — log in again")

    auth = str(request.headers.get("authorization") or "")
    token = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    limits = limits_for("login", ip=str(getattr(request.state, "client_ip", "") or ""))
    enforce(request, limits)

    legacy = claims_from_legacy_token(settings.jwt_secret, token)
    account = s.get(Account, int(legacy["player_id"])) if legacy else None
    player = s.get(Player, int(account.player_id)) if account else None
    if legacy is None or account is None or player is None:
        record_failure(request, limits)
        raise HTTPException(status_code=401, detail="Invalid token")

    record_success(request, limits)
    return _start_session(request, response, s, player=player, kind="exchange")


# ---- my sessions -----------------------------------------------------------------------


@router.get("/sessions", response_model=list[SessionOut])
def my_sessions(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> list[dict]:
    """The caller's own live sessions, newest activity first."""
    current = claims.get("session_id")
    return [session_out(row, current) for row in list_sessions(s, int(claims["player_id"]))]


@router.delete("/sessions/{session_id}", response_model=OkResponse)
def revoke_my_session(
    session_id: int,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Sign one of my devices out. An id that is not mine is a 404, not a 403 — there is
    nothing to learn about other people's sessions here."""
    if not revoke_session(s, int(claims["player_id"]), int(session_id)):
        raise HTTPException(status_code=404, detail="Session not found")
    s.commit()
    return {"ok": True}


@router.post("/sessions/revoke-others", response_model=RevokedOut)
def revoke_my_other_sessions(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """Sign every other device out; this one stays."""
    keep = claims.get("session_id")
    revoked = revoke_all_sessions(s, int(claims["player_id"]), keep=int(keep) if keep is not None else None)
    s.commit()
    return {"revoked": revoked}


# ---- register, redeem, reset, password (L3) --------------------------------------------


def _client_ip(request: Request) -> str:
    return str(getattr(request.state, "client_ip", "") or "")


def _counted(request: Request, limits, fn):
    """Run `fn` under `limits`: a 429 before it runs, every 4xx it raises counted as a
    failure, a success recorded. One wrapper, so no endpoint forgets a half."""
    enforce(request, limits)
    try:
        result = fn()
    except HTTPException as exc:
        if 400 <= exc.status_code < 500:
            record_failure(request, limits)
        raise
    record_success(request, limits)
    return result


@router.post("/register", response_model=MeOut)
def register(request: Request, response: Response, body: RegisterBody, s: Session = Depends(get_session)) -> dict:
    """A new account from an invite code: the player, the account, the membership in the
    code's group and the code spent in one transaction, then a session. Public.

    Rate-limited as *redeem* (per IP and one global bucket, no account bucket — there is no
    account yet). A code that is unknown, expired or spent is one generic 400; a taken name
    is 409 "That name is taken", answered only once the code has proven valid."""
    ph = hasher_for(request.app.state.settings.password_hash_profile)
    limits = limits_for("redeem", ip=_client_ip(request))
    player = _counted(
        request,
        limits,
        lambda: register_account(s, code=body.code, display_name=body.display_name, password=body.password, hasher=ph),
    )
    return _start_session(request, response, s, player=player, kind="register")


@router.post("/redeem", response_model=MeOut)
def redeem(request: Request, body: RedeemBody, s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """An existing account joins the code's group as a member (never as an owner). A session
    is required, a membership is not — this is how a registered-but-uninvited account, or a
    member of another group, gets in. Same *redeem* limits and the same generic refusal as
    register; 409 when already a member (the code stays unspent)."""
    pid = int(claims["player_id"])
    limits = limits_for("redeem", ip=_client_ip(request))
    _counted(request, limits, lambda: redeem_invite(s, code=body.code, player_id=pid))
    s.commit()
    fresh = build_claims(s, player_id=pid, session_id=claims.get("session_id"))
    return _me(request, s, fresh or claims)


@router.post("/reset", response_model=MeOut)
def reset_password(request: Request, response: Response, body: ResetBody, s: Session = Depends(get_session)) -> dict:
    """Redeem a reset link: set the new password, spend the token, end **every** session of
    that player, and start a fresh one here. Public, rate-limited as *reset*. Unknown,
    expired and used tokens are one generic 400; a password that is too short is refused
    before the token is spent, so the link still works for a second try."""
    ph = hasher_for(request.app.state.settings.password_hash_profile)
    limits = limits_for("reset", ip=_client_ip(request))

    def run() -> Player:
        find_live_reset(s, body.token)
        validate_new_password(body.password)
        account = consume_reset(s, body.token)
        set_password(s, account, body.password, ph, origin="set")
        revoke_all_sessions(s, int(account.player_id))
        player = s.get(Player, int(account.player_id))
        if player is None:  # an account without its player: nothing to log into
            raise HTTPException(status_code=400, detail="That reset link is not valid")
        return player

    player = _counted(request, limits, run)
    log.info("Password reset by link for player %s; every other session ended", player.id)
    return _start_session(request, response, s, player=player, kind="reset")


def _my_account(s: Session, claims: dict) -> Account:
    account = s.get(Account, int(claims["player_id"]))
    if account is None:  # unreachable behind the gate: a session always has an account
        raise HTTPException(status_code=401, detail="Not logged in")
    return account


@router.post("/password", response_model=MeOut)
def change_my_password(
    request: Request,
    body: PasswordChangeBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Set or change my password. With a password on the account the current one is
    required (403 when wrong); rate-limited like login on my own account key, so a stolen
    session cannot be used to guess the password behind it. Other devices stay signed in."""
    ph = hasher_for(request.app.state.settings.password_hash_profile)
    account = _my_account(s, claims)
    limits = limits_for("login", ip=_client_ip(request), account=account.name_key)
    _counted(request, limits, lambda: change_password(s, account, body.current_password, body.new_password, ph))
    s.commit()
    return _me(request, s, claims)


@router.delete("/password", response_model=MeOut)
def remove_my_password(request: Request, s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """Drop my password — 409 unless a passkey keeps a way in."""
    remove_password(s, _my_account(s, claims))
    s.commit()
    return _me(request, s, claims)


# ---- passkeys (L8) ----------------------------------------------------------------------

PASSKEY_LOGIN_REFUSED = "That passkey could not be used to log in"
PASSKEY_REGISTER_REFUSED = "That passkey could not be registered"
PASSKEY_ORIGIN_REFUSED = "Passkeys are not available from this origin"
PASSKEY_LAST_WAY_IN = "Set a password before removing your last passkey — an account needs one way in"
PASSKEY_ALREADY_REGISTERED = "That passkey is already registered"


def _relying_party(request: Request):
    """The one decision (`services/passkeys.relying_party_for`), from this request's
    `Origin` header — never its `Host`."""
    return relying_party_for(request.app.state.settings, origin=request.headers.get("origin"))


@router.post("/passkeys/register/options")
def passkey_register_options(request: Request, s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """Options for `navigator.credentials.create()` — a session is all it takes (no
    membership needed: `/auth/` is an account path). Refuses an origin the relying party
    rule does not admit (400; the caller is logged in, so naming the reason leaks nothing)."""
    rp = _relying_party(request)
    if rp is None:
        raise HTTPException(status_code=400, detail=PASSKEY_ORIGIN_REFUSED)
    sweep_expired_challenges(s)
    account = _my_account(s, claims)
    player = s.get(Player, int(account.player_id))
    if player is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return registration_options(s, account, player, rp)


@router.post("/passkeys/register/verify", response_model=PasskeyOut)
def passkey_register_verify(
    request: Request,
    body: PasskeyRegisterVerifyBody,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Store the credential the browser made. 400 with the same sentence for every way a
    ceremony can fail (the reason goes to the log), 409 for a credential id already stored."""
    rp = _relying_party(request)
    if rp is None:
        raise HTTPException(status_code=400, detail=PASSKEY_ORIGIN_REFUSED)
    account = _my_account(s, claims)
    try:
        row = verify_registration(
            s,
            account,
            rp,
            body.credential,
            label=body.label,
            user_agent_label=device_label(request.headers.get("user-agent", "")),
        )
    except PasskeyRefused as exc:
        log.info("Passkey registration refused for player %s: %s", account.player_id, exc.reason)
        raise HTTPException(status_code=400, detail=PASSKEY_REGISTER_REFUSED) from None
    except PasskeyConflict:
        raise HTTPException(status_code=409, detail=PASSKEY_ALREADY_REGISTERED) from None
    return passkey_out(row)


@router.get("/passkeys", response_model=list[PasskeyOut])
def my_passkeys(s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> list[dict]:
    """The caller's own passkeys, oldest first."""
    return [passkey_out(row) for row in list_passkeys(s, int(claims["player_id"]))]


@router.delete("/passkeys/{passkey_id}", response_model=OkResponse)
def remove_my_passkey(
    passkey_id: int,
    request: Request,
    response: Response,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Remove one of my passkeys — found among *my* rows (404 otherwise) — and end every
    session of mine, this one included, so a lost device holds nothing live. 409 when it is
    the last passkey and there is no password: an account keeps one way in."""
    account = _my_account(s, claims)
    try:
        if not remove_passkey(s, account, int(passkey_id)):
            raise HTTPException(status_code=404, detail="Passkey not found")
    except PasskeyConflict:
        raise HTTPException(status_code=409, detail=PASSKEY_LAST_WAY_IN) from None
    s.commit()
    clear_session_cookie(response, secure=_cookie_secure(request))
    return {"ok": True}


@router.post("/passkeys/login/options")
def passkey_login_options(request: Request, s: Session = Depends(get_session)) -> dict:
    """Options for `navigator.credentials.get()`: public, no identifier asked for, no
    `allowCredentials` sent. Every mint counts against the *passkey* buckets (per IP and
    global), so the challenge table cannot be filled from one address; a bad origin is
    the same generic 401 the verify step gives."""
    limits = limits_for("passkey", ip=_client_ip(request))
    enforce(request, limits)
    rp = _relying_party(request)
    if rp is None:
        record_failure(request, limits)
        raise HTTPException(status_code=401, detail=PASSKEY_LOGIN_REFUSED)
    sweep_expired_challenges(s)
    options = authentication_options(s, rp)
    record_failure(request, limits)  # a minted challenge is an attempt; counted like one
    return options


@router.post("/passkeys/login/verify", response_model=MeOut)
def passkey_login_verify(request: Request, response: Response, body: PasskeyLoginVerifyBody, s: Session = Depends(get_session)) -> dict:
    """Sign in with the assertion: one generic 401 for every refusal (unknown credential,
    replayed challenge, wrong origin, bad signature, backwards counter, no user
    verification — each logged with its real reason), else a session `kind="passkey"`
    through the same path every other login takes."""
    limits = limits_for("passkey", ip=_client_ip(request))

    def run() -> Player:
        rp = _relying_party(request)
        if rp is None:
            raise HTTPException(status_code=401, detail=PASSKEY_LOGIN_REFUSED)
        try:
            account, _row = verify_authentication(s, rp, body.credential)
        except PasskeyRefused as exc:
            log.info("Passkey login refused from %s: %s", _client_ip(request) or "?", exc.reason)
            raise HTTPException(status_code=401, detail=PASSKEY_LOGIN_REFUSED) from None
        player = s.get(Player, int(account.player_id))
        if player is None:
            raise HTTPException(status_code=401, detail=PASSKEY_LOGIN_REFUSED)
        return player

    player = _counted(request, limits, run)
    return _start_session(request, response, s, player=player, kind="passkey")


# ---- the account's email (E1) -----------------------------------------------------------
#
# The order in every sending route is the L16 rule: mint the token row, build the message
# (plain strings), **commit**, and only then send — no transaction is open across the
# network call. These handlers are sync, so FastAPI already runs them in the threadpool and
# the blocking `send` never touches the event loop (`send_off_loop` is for async callers).
# Background notices close over a built `MailMessage` and the transport, never the session
# or the request.


def _send_quietly(transport: MailTransport, message: MailMessage) -> None:
    """A background notice: a failure is logged (masked recipient, kind, class) and
    swallowed — the answer has already gone out."""
    try:
        transport.send(message)
    except (MailSendError, MailNotConfigured) as exc:
        log.warning("Notice to %s (%s) not sent: %s", mask_address(message.to), message.kind, type(exc).__name__)


def _player_name(s: Session, player_id: int) -> str:
    player = s.get(Player, int(player_id))
    return player.display_name if player is not None else ""


def _email_limits(request: Request, account: Account):
    return limits_for("email", ip=_client_ip(request), account=account.name_key)


def _mail_or_409(request: Request) -> MailTransport:
    transport = request.app.state.mail
    if not transport.configured:
        raise HTTPException(status_code=409, detail=MAIL_OFF)
    return transport


def _mint_and_send(request: Request, s: Session, account: Account, email: str, limits) -> dict:
    """Mint the token, commit, send. A send that fails takes its token row with it (a fresh
    short transaction) and answers 502 — no live link is left behind for a mail that never
    left. Every call that reaches the send counts against the *email* buckets."""
    transport = request.app.state.mail
    pid = int(account.player_id)
    sweep_expired_verifications(s)
    row, token = request_verification(s, account, email)
    row_id = int(row.id)
    url = verification_url(link_origin(request), token, group_slug=current_group(s).slug)
    message = verify_email_message(to=email, name=_player_name(s, pid), url=url)
    s.commit()

    record_failure(request, limits)  # a send is an attempt, whatever happens next
    try:
        transport.send(message)
    except (MailSendError, MailNotConfigured) as exc:
        discard_verification(s, row_id)
        s.commit()
        log.warning("Verification mail for player %s not sent (%s); its token was discarded", pid, type(exc).__name__)
        raise HTTPException(status_code=502, detail=SEND_FAILED) from None
    log.info("Verification link sent for player %s to %s", pid, mask_address(email))
    return email_status(s, pid)


@router.put("/email", response_model=EmailStatusOut)
def set_my_email(request: Request, body: EmailBody, s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """Ask to use an address: a 24-hour link goes to it, and the address becomes the
    account's only once that link is opened (the verified one, if any, stays until then).

    409 when this server cannot send, 400 for something that is not an address, 409 when
    the address is verified or pending on another account; the account's own verified
    address answers 200 and sends nothing (a pending change is given up). 502 when the
    send fails — and then no token is left. Rate-limited as *email* on my account key."""
    account = _my_account(s, claims)
    pid = int(account.player_id)
    limits = _email_limits(request, account)
    enforce(request, limits)
    _mail_or_409(request)
    try:
        email = validate_email(body.email)
        key = email_key(email)
        current = verified_email_for(s, pid)
        if current is not None and email_key(current) == key:
            cancel_pending(s, pid)
            s.commit()
            return email_status(s, pid)
        ensure_email_free(s, key, except_player_id=pid)
    except HTTPException:
        record_failure(request, limits)
        raise
    return _mint_and_send(request, s, account, email, limits)


@router.post("/email/resend", response_model=EmailStatusOut)
def resend_my_email(request: Request, s: Session = Depends(get_session), claims: dict = Depends(require_auth_claims)) -> dict:
    """A fresh link for the pending address (the old link stops working). 409 "Nothing to
    send" when no address is pending; the same limits as `PUT /auth/email`."""
    account = _my_account(s, claims)
    pid = int(account.player_id)
    limits = _email_limits(request, account)
    enforce(request, limits)
    _mail_or_409(request)
    pending = pending_email_for(s, pid)
    if pending is None:
        raise HTTPException(status_code=409, detail=NOTHING_TO_SEND)
    try:
        ensure_email_free(s, email_key(pending), except_player_id=pid)
    except HTTPException:
        record_failure(request, limits)
        raise
    return _mint_and_send(request, s, account, pending, limits)


@router.delete("/email", response_model=EmailStatusOut)
def remove_my_email(
    request: Request,
    background: BackgroundTasks,
    s: Session = Depends(get_session),
    claims: dict = Depends(require_auth_claims),
) -> dict:
    """Forget my address — the verified one and any pending one. The removed verified
    address is told, after the answer, with no link in the message."""
    account = _my_account(s, claims)
    pid = int(account.player_id)
    removed = remove_email(s, account)
    notice = email_changed_message(to=removed, name=_player_name(s, pid)) if removed else None
    s.commit()
    if notice is not None:
        log.info("Email removed for player %s; telling %s", pid, mask_address(notice.to))
        background.add_task(_send_quietly, request.app.state.mail, notice)
    return email_status(s, pid)


@router.post("/email/verify", response_model=EmailVerifiedOut)
def verify_email(request: Request, body: EmailVerifyBody, background: BackgroundTasks, s: Session = Depends(get_session)) -> dict:
    """Open a verification link: **public** (the link opens in a mail app's browser, with
    no session), and a POST — the page asks for a tap, because a mail scanner follows
    links and a GET that confirmed would be confirmed by the scanner. The token proves the
    mailbox: it verifies the address for the account it was minted for, whoever is logged
    in here. Unknown, used, expired and lost-the-race tokens are one generic 400. Rate-
    limited as *reset*. When a different verified address is replaced, it is told, with
    no link."""
    limits = limits_for("reset", ip=_client_ip(request))
    account, previous = _counted(request, limits, lambda: consume_verification(s, body.token))
    pid = int(account.player_id)
    email = verified_email_for(s, pid) or ""
    notice = email_changed_message(to=previous, name=_player_name(s, pid)) if previous else None
    s.commit()
    if notice is not None:
        log.info("Email changed for player %s; telling the previous address %s", pid, mask_address(notice.to))
        background.add_task(_send_quietly, request.app.state.mail, notice)
    return {"ok": True, "email": email}
