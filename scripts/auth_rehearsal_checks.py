"""L13 — the API half of the dress rehearsal. Called by `scripts/auth_rehearsal.sh`, never alone.
E5 added `email` (set, verify, change, recover, the limits, the hatch), `email-forward` and
`password-of`; a password this run changed on the new code (the email recovery's) is kept in
`state.json` and every later login reads it from there.

Every subcommand prints `PASS …` / `FAIL …` lines (and `INFO …` for numbers) and exits 1 when
anything failed. State that one step hands to a later one (a tournament id, an old JWT) lives in
`<work>/state.json`. It talks HTTP to 127.0.0.1 only and never opens a database for writing:
the one database read is `sqlite3 … mode=ro` for counts.

Run with the backend's venv python (it needs `httpx` and `PyJWT`, both already in it).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import statistics
import subprocess
import sys
import time
from email import message_from_bytes
from email import policy as email_policy
from pathlib import Path

import httpx

GROUP_PREFIX = "/g/altherren"
COOKIE = "lk_session"
COMPARE_PATHS = [
    "/cup/defs",
    "/cup?key=default",
    "/cup?key=bauernkranz",
    "/tournaments",
    "/stats/players",
    "/stats/ratings",
    "/friendlies",
    *[f"/stats/records?mode={m}&scope={s}" for m in ("overall", "1v1", "2v2") for s in ("tournaments", "both", "friendlies")],
]
# Compared after the rollback wrote one tournament: everything that one empty tournament
# cannot move. `/tournaments` and `/friendlies` are counted instead.
FORWARD_PATHS = [p for p in COMPARE_PATHS if p not in ("/tournaments", "/friendlies")]

FAILS = 0
#: Stamped per response (the time the stats were computed), so never equal across two calls.
VOLATILE_KEYS = {"generated_at"}


def report(ok: bool, name: str, detail: object = None) -> bool:
    global FAILS
    if not ok:
        FAILS += 1
    tail = "" if detail is None else f" — {detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)}"
    print(f"{'PASS' if ok else 'FAIL'} {name}{tail}", flush=True)
    return ok


def info(name: str, detail: object) -> None:
    print(f"INFO {name} — {detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)}", flush=True)


def load_state(work: Path) -> dict:
    p = work / "state.json"
    return json.loads(p.read_text()) if p.exists() else {}


def save_state(work: Path, **kv) -> None:
    st = load_state(work)
    st.update(kv)
    (work / "state.json").write_text(json.dumps(st, indent=2))


def accounts(shape: Path) -> list[dict]:
    return json.loads(shape.read_text(encoding="utf-8"))["player_accounts"]


def password_of(work: Path, x: dict) -> str:
    """The password the NEW code knows for this account right now: the shape's, unless this run
    changed it on the new code (the email recovery does). The old code only ever knows the shape's."""
    return load_state(work).get("password_overrides", {}).get(x["name"], x["password"])


def drop_players(v, ids: set[int]):
    """Remove the players this run created (the passkey-only newcomer) from a stats answer, so
    "identical to the baseline" still compares everything that existed before the run."""
    if not ids:
        return v
    if isinstance(v, list):
        out = []
        for x in v:
            if isinstance(x, dict):
                # a player row: `player_id`, or `id` beside `display_name`, or a nested `player`
                pid = x.get("player_id", x.get("id") if "display_name" in x else None)
                if isinstance(x.get("player"), dict):
                    pid = x["player"].get("id", pid)
                if pid in ids:
                    continue
            out.append(drop_players(x, ids))
        return out
    if isinstance(v, dict):
        return {k: drop_players(x, ids) for k, x in v.items()}
    return v


def db_count(db: Path, sql: str) -> int:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return int(con.execute(sql).fetchone()[0])
    finally:
        con.close()


def db_rows(db: Path, sql: str) -> list[tuple]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return list(con.execute(sql).fetchall())
    finally:
        con.close()


# ---- HTTP -------------------------------------------------------------------------------------


def new_login(base: str, name: str, password: str) -> tuple[int, str | None, dict | None]:
    r = httpx.post(f"{base}/auth/login", json={"username": name, "password": password}, timeout=30)
    cookie = r.cookies.get(COOKIE)
    return r.status_code, cookie, (r.json() if r.status_code == 200 else None)


def old_login(base: str, name: str, password: str) -> tuple[int, str | None]:
    r = httpx.post(f"{base}/auth/login", json={"username": name, "password": password}, timeout=30)
    return r.status_code, (r.json().get("token") if r.status_code == 200 else None)


def get(base: str, path: str, *, cookie: str | None = None, bearer: str | None = None) -> httpx.Response:
    headers = {}
    if cookie:
        headers["Cookie"] = f"{COOKIE}={cookie}"
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    return httpx.get(f"{base}{path}", headers=headers, timeout=60)


def strip_group(v):
    """New code prefixes every emitted app path with `/g/altherren`; the old code did not."""
    if isinstance(v, str):
        return v.replace(GROUP_PREFIX + "/", "/") if v.startswith(GROUP_PREFIX + "/") else v
    if isinstance(v, list):
        return [strip_group(x) for x in v]
    if isinstance(v, dict):
        return {k: strip_group(x) for k, x in v.items()}
    return v


def diff(old, new, path="$", out=None, added=None):
    """Differences between the old code's answer and the new one's. A key only the new
    code sends is collected in `added` (a new field is not a changed value)."""
    out = [] if out is None else out
    added = set() if added is None else added
    if isinstance(old, dict) and isinstance(new, dict):
        for k in old:
            if k in VOLATILE_KEYS:
                continue
            if k not in new:
                out.append(f"{path}.{k}: missing in new")
            else:
                diff(old[k], new[k], f"{path}.{k}", out, added)
        for k in new:
            if k not in old:
                added.add(re.sub(r"\[\d+\]", "[]", f"{path}.{k}"))
    elif isinstance(old, list) and isinstance(new, list):
        if len(old) != len(new):
            out.append(f"{path}: length {len(old)} → {len(new)}")
        for i, (a, b) in enumerate(zip(old, new)):
            diff(a, b, f"{path}[{i}]", out, added)
    elif old != new:
        out.append(f"{path}: {old!r} → {new!r}")
    return out, added


def fetch_set(base: str, paths: list[str], *, cookie=None, bearer=None) -> dict:
    res = {}
    for p in paths:
        r = get(base, p, cookie=cookie, bearer=bearer)
        res[p] = {"status": r.status_code, "body": r.json() if r.headers.get("content-type", "").startswith("application/json") else None}
    return res


def compare_to_baseline(work: Path, base: str, cookie: str, paths: list[str], label: str) -> None:
    baseline = json.loads((work / "baseline.json").read_text())
    now = fetch_set(base, paths, cookie=cookie)
    created = set(load_state(work).get("created_player_ids", []))
    all_added: set[str] = set()
    for p in paths:
        b, n = baseline[p], now[p]
        if n["status"] != 200:
            report(False, f"{label}: GET {p}", n["status"])
            continue
        d, added = diff(strip_group(b["body"]), drop_players(strip_group(n["body"]), created))
        all_added |= added
        report(not d, f"{label}: GET {p} identical to the old code's answer", d[:5] if d else None)
    if all_added:
        info(f"{label}: fields the new code adds (not a change of value)", sorted(all_added))


def cup_owner(body: dict) -> str | None:
    for k in ("owner", "current_owner", "holder"):
        v = body.get(k)
        if isinstance(v, dict):
            return v.get("display_name") or v.get("name")
        if isinstance(v, list):
            return ",".join((x.get("display_name") or x.get("name") or "?") for x in v)
    return None


# ---- steps ------------------------------------------------------------------------------------


def cmd_baseline(a) -> None:
    """The old code, booted on an untouched copy: what production serves today."""
    work = Path(a.work)
    acc = accounts(Path(a.shape))
    admin = next(x for x in acc if x.get("admin"))
    st, tok = old_login(a.base, admin["name"], admin["password"])
    report(st == 200 and bool(tok), f"baseline (old code): JWT login as {admin['name']}", st)
    data = fetch_set(a.base, COMPARE_PATHS, bearer=tok)
    bad = [p for p, v in data.items() if v["status"] != 200]
    report(not bad, f"baseline (old code): {len(COMPARE_PATHS)} reads answer 200", bad or None)
    (work / "baseline.json").write_text(json.dumps(data, ensure_ascii=False))
    info("baseline: tournaments served", len(data["/tournaments"]["body"]))
    info(
        "baseline: cup owners",
        {k: cup_owner(data[f"/cup?key={k}"]["body"]) for k in ("default", "bauernkranz")},
    )


def cmd_new_first(a) -> None:
    work, db = Path(a.work), Path(a.db)
    acc = accounts(Path(a.shape))
    base = a.base
    # the database the migration wrote
    groups = db_rows(db, 'select slug, name from "group"')
    report(groups == [("altherren", "Altherren")], "DB: one group, altherren / Altherren", groups)
    n_mem = db_count(db, "select count(*) from groupmembership")
    n_players = db_count(db, "select count(*) from player")
    report(n_mem == n_players, f"DB: {n_mem} memberships for {n_players} players")
    info("DB: membership roles", db_rows(db, "select role, count(*) from groupmembership group by role"))
    n_acc = db_count(db, "select count(*) from account")
    n_pw = db_count(db, "select count(*) from account where password_hash like '$argon2id$%'")
    report(n_pw == len(acc), f"DB: {n_pw} argon2id password hashes for {len(acc)} secrets accounts ({n_acc} account rows)")
    admins = db_rows(db, "select p.display_name from account a join player p on p.id = a.player_id where a.site_admin = 1")
    report([r[0] for r in admins] == [x["name"] for x in acc if x.get("admin")], "DB: site admins", [r[0] for r in admins])
    ungrouped = {t: db_count(db, f"select count(*) from {t} where group_id is null") for t in ("tournament", "friendlymatch", "featurerequest")}
    report(not any(ungrouped.values()), "DB: no tournament / friendly / idea without a group", ungrouped)
    info("DB: clubstarrating rows with group_id NULL (global, never backfilled — L12)", db_count(db, "select count(*) from clubstarrating where group_id is null"))
    info("DB: cup rows", db_rows(db, "select key, name from cup order by key"))

    # every account logs in, exactly as named and in lower case
    cookies = {}
    for x in acc:
        st, ck, me = new_login(base, x["name"], x["password"])
        ok = (
            st == 200
            and ck
            and me["player_name"] == x["name"]
            and me["site_admin"] == bool(x.get("admin"))
            and [g["slug"] for g in me["groups"]] == ["altherren"]
            and me["password_migrated"] is True
            and me["has_password"] is True
            and me["has_passkey"] is False
        )
        report(bool(ok), f"login {x['name']!r}", {"status": st, "role": me and me["role"], "groups": me and [(g["slug"], g["role"]) for g in me["groups"]]})
        cookies[x["name"]] = ck
    for x in acc[:2] + [y for y in acc if not y["password"].isascii()]:
        st, ck, me = new_login(base, x["name"].lower(), x["password"])
        report(st == 200 and me["player_name"] == x["name"], f"login by lower-case name {x['name'].lower()!r}", st)
    st, _, _ = new_login(base, acc[0]["name"], acc[0]["password"] + "x")
    report(st == 401, "a wrong password is 401", st)

    admin = next(x for x in acc if x.get("admin"))
    ck = cookies[admin["name"]]
    me = get(base, "/me", cookie=ck).json()
    info("GET /me keys", sorted(me))
    report(get(base, "/tournaments").status_code == 401, "GET /tournaments without a cookie is 401")
    tours = get(base, "/tournaments", cookie=ck).json()
    n_db = db_count(db, "select count(*) from tournament")
    report(len(tours) == n_db, f"GET /tournaments serves {len(tours)} = {n_db} rows in the DB")
    compare_to_baseline(work, base, ck, COMPARE_PATHS, "first boot")

    # the exchange: a JWT minted exactly as the old `create_token` did
    import jwt as pyjwt

    secret = json.loads(Path(a.shape).read_text())["jwt_secret"]
    pid = me["player_id"]
    now = int(time.time())
    minted = pyjwt.encode(
        {"sub": f"player:{pid}", "role": "admin", "player_id": pid, "player_name": admin["name"], "iat": now, "exp": now + 60 * 60 * 24 * 180},
        secret,
        algorithm="HS256",
    )
    r = httpx.post(f"{base}/auth/exchange", headers={"Authorization": f"Bearer {minted}"}, timeout=30)
    xck = r.cookies.get(COOKIE)
    report(r.status_code == 200 and bool(xck), "exchange: a JWT minted as the old create_token did → 200 + cookie", r.status_code)
    report(get(base, "/me", cookie=xck).status_code == 200 if xck else False, "exchange: /me with the exchanged cookie → 200")
    bad = pyjwt.encode({"player_id": pid, "role": "admin", "exp": now + 60}, "not-the-secret", algorithm="HS256")
    r = httpx.post(f"{base}/auth/exchange", headers={"Authorization": f"Bearer {bad}"}, timeout=30)
    report(r.status_code == 401, "exchange: a token signed with another secret → 401", r.status_code)

    # timing: GET /tournaments p50 with the gate, keep-alive
    with httpx.Client(base_url=base, headers={"Cookie": f"{COOKIE}={ck}"}, timeout=60) as c:
        for _ in range(5):
            c.get("/tournaments")
        ts = []
        for _ in range(50):
            t0 = time.perf_counter()
            c.get("/tournaments")
            ts.append((time.perf_counter() - t0) * 1000)
    info("GET /tournaments with the cookie, 50 requests", f"p50 {statistics.median(ts):.1f} ms, max {max(ts):.1f} ms")
    save_state(work, admin_cookie_first=ck, cookies_first=cookies)


def cmd_old_rollback(a) -> None:
    work, db = Path(a.work), Path(a.db)
    acc = accounts(Path(a.shape))
    base = a.base
    tokens = {}
    for x in acc:
        st, tok = old_login(base, x["name"], x["password"])
        report(st == 200 and bool(tok), f"rollback: old JWT login {x['name']!r}", st)
        tokens[x["name"]] = tok
    admin = next(x for x in acc if x.get("admin"))
    tok = tokens[admin["name"]]
    me = get(base, "/me", bearer=tok)
    report(me.status_code == 200 and me.json().get("role") == "admin", "rollback: GET /me (bearer) → admin", me.status_code)
    tours = get(base, "/tournaments", bearer=tok)
    n_db = db_count(db, "select count(*) from tournament")
    report(tours.status_code == 200 and len(tours.json()) == n_db, f"rollback: GET /tournaments 200, {len(tours.json())} = {n_db} rows")
    baseline = json.loads((work / "baseline.json").read_text())
    created = set(load_state(work).get("created_player_ids", []))
    for p in ("/cup?key=default", "/cup?key=bauernkranz", "/stats/records?mode=overall&scope=tournaments", "/stats/players"):
        r = get(base, p, bearer=tok)
        d, _ = diff(baseline[p]["body"], drop_players(r.json(), created))
        report(r.status_code == 200 and not d, f"rollback: GET {p} identical to the baseline", d[:3] if d else None)
    for p in ("/friendlies", "/ideas", "/players"):
        report(get(base, p, bearer=tok).status_code == 200, f"rollback: GET {p} 200")
    players = get(base, "/players", bearer=tok).json()
    pids = [p["id"] for p in players][:2]
    r = httpx.post(
        f"{base}/tournaments",
        headers={"Authorization": f"Bearer {tok}"},
        json={"name": "L13 rollback rehearsal", "mode": "1v1", "player_ids": pids, "date": "2026-09-23"},
        timeout=60,
    )
    tid = r.json().get("id") if r.status_code == 200 else None
    report(r.status_code == 200 and tid is not None, "rollback: POST /tournaments (old code) → 200", {"status": r.status_code, "id": tid})
    gid = db_rows(db, f"select group_id from tournament where id = {int(tid)}") if tid else None
    report(gid == [(None,)], "rollback: the old code wrote it with group_id NULL", gid)
    r = httpx.post(
        f"{base}/tournaments/{tid}/comments",
        headers={"Authorization": f"Bearer {tok}"},
        json={"body": "Written while rolled back (L13)"},
        timeout=60,
    )
    cid = r.json().get("id") if r.status_code == 200 else None
    report(r.status_code == 200 and cid is not None, "rollback: POST a comment (old code) → 200", {"status": r.status_code, "id": cid})
    # E5: what the old code cannot know. A password set on the new code (the email recovery's)
    # does not carry back — the old code reads secrets.json — and a passkey-only account has no
    # password at all, so it cannot log in until `manage.py set-password` (the documented escape).
    for name, pw in load_state(work).get("password_overrides", {}).items():
        st, _ = old_login(base, name, pw)
        report(st == 401, f"rollback: {name}'s password set on the new code does not carry back (old code → {st}); secrets.json's still works")
    newcomer = load_state(work).get("passkey_only_name")
    if newcomer:
        st, _ = old_login(base, newcomer, "anything-at-all-15")
        report(st == 401, f"rollback: the passkey-only account {newcomer!r} cannot log in on the old code ({st}) — the documented consequence")
    save_state(work, rollback_tid=tid, rollback_cid=cid, rollback_jwt=tok, rollback_tournaments=len(tours.json()) + 1)


def cmd_new_forward(a) -> None:
    work, db = Path(a.work), Path(a.db)
    acc = accounts(Path(a.shape))
    base = a.base
    st_ = load_state(work)
    tid, cid = st_["rollback_tid"], st_["rollback_cid"]
    gid = db_rows(db, f"select group_id from tournament where id = {int(tid)}")
    report(gid == [(1,)], "roll forward: the rollback's tournament now has group_id 1", gid)
    cookies = {}
    for x in acc:
        st, ck, me = new_login(base, x["name"], password_of(work, x))
        report(st == 200 and me["player_name"] == x["name"], f"roll forward: login {x['name']!r}", st)
        cookies[x["name"]] = ck
    admin = next(x for x in acc if x.get("admin"))
    ck = cookies[admin["name"]]
    tours = get(base, "/tournaments", cookie=ck).json()
    report(len(tours) == st_["rollback_tournaments"] and any(t["id"] == tid for t in tours), f"roll forward: GET /tournaments lists {len(tours)}, the rollback's included")
    cm = get(base, f"/tournaments/{tid}/comments", cookie=ck)
    body = cm.json() if cm.status_code == 200 else {}
    ids = [c["id"] for c in body.get("comments", [])] if isinstance(body, dict) else [c["id"] for c in body]
    report(cid in ids, "roll forward: the comment written while rolled back is there", {"status": cm.status_code, "ids": ids})
    r = httpx.post(f"{base}/auth/exchange", headers={"Authorization": f"Bearer {st_['rollback_jwt']}"}, timeout=30)
    xck = r.cookies.get(COOKIE)
    report(r.status_code == 200 and bool(xck), "roll forward: exchange the JWT the OLD code minted → 200 + cookie", r.status_code)
    report(bool(xck) and get(base, "/me", cookie=xck).status_code == 200, "roll forward: /me with it → 200")
    # Every first-boot session survives the rollback and the roll forward — except those the
    # email recovery in step 3 ended on purpose (it ends every other session of that account).
    ended = set(st_.get("password_overrides", {}))
    for name, first in st_.get("cookies_first", {"": st_["admin_cookie_first"]}).items():
        want = 401 if name in ended else 200
        got = get(base, "/me", cookie=first).status_code
        what = "stays ended (the email recovery ended it)" if want == 401 else "is still live"
        report(got == want, f"roll forward: {name or admin['name']}'s session from the first boot {what}", got)
    compare_to_baseline(work, base, ck, FORWARD_PATHS, "roll forward")
    n_pk = db_count(db, "select count(*) from passkey")
    info("roll forward: passkey rows", n_pk)


def run_manage(a, *args, stdin: str | None = None) -> subprocess.CompletedProcess:
    cmd = [a.py, "manage.py", "--secrets", a.secrets, "--db-url", f"sqlite:///{a.db}", *args]
    # E5: the same mail environment as the stack — the file sink, never an SMTP key.
    env = {k: v for k, v in os.environ.items() if not k.startswith("SMTP_") and k not in ("MAIL_DEV_SMTP", "MAIL_SINK_DIR")}
    env["APP_ENV"] = "development"
    if getattr(a, "mail", ""):
        env["MAIL_SINK_DIR"] = a.mail
    return subprocess.run(cmd, cwd=a.backend, input=stdin, capture_output=True, text=True, timeout=120, env=env)


def cmd_escape(a) -> None:
    acc = accounts(Path(a.shape))
    base = a.base
    admin = next(x for x in acc if x.get("admin"))
    others = [x for x in acc if not x.get("admin")]
    berni = next((x for x in acc if not x["password"].isascii()), others[0])
    flo = next(x for x in others if x is not berni)

    work = Path(a.work)
    admin_pw = password_of(work, admin)

    # 1. reset-link (lower case: the command matches names case-insensitively)
    st0, ck_before, _ = new_login(base, admin["name"], admin_pw)
    p = run_manage(a, "reset-link", "--player", admin["name"].lower())
    out = p.stdout.strip()
    report(p.returncode == 0 and "/g/altherren/reset#" in out, f"reset-link --player {admin['name'].lower()} → exit {p.returncode}", re.sub(r"#\S+", "#<token>", out))
    token = re.search(r"#(\S+)", out).group(1) if "#" in out else ""
    newpw = "Rehearsal reset 2026!"
    r = httpx.post(f"{base}/auth/reset", json={"token": token, "password": newpw}, timeout=30)
    report(r.status_code == 200 and r.json().get("site_admin") is True, "reset: POST /auth/reset with that token → 200, still site admin", r.status_code)
    report(get(base, "/me", cookie=ck_before).status_code == 401, "reset: the session from before the reset is ended")
    r2 = httpx.post(f"{base}/auth/reset", json={"token": token, "password": newpw + "x"}, timeout=30)
    report(r2.status_code == 400, "reset: the same link a second time → 400", r2.status_code)
    report(new_login(base, admin["name"], newpw)[0] == 200, "reset: the new password logs in")
    report(new_login(base, admin["name"], admin_pw)[0] == 401, "reset: the old password is 401")

    # 2. set-password (piped: two lines on stdin), on the non-ASCII account
    pw2 = "Grüß Gott wieder 2"
    p = run_manage(a, "set-password", "--player", berni["name"].upper(), stdin=f"{pw2}\n{pw2}\n")
    report(p.returncode == 0, f"set-password --player {berni['name'].upper()} (piped) → exit {p.returncode}", (p.stdout + p.stderr).strip())
    report(pw2 not in p.stdout + p.stderr, "set-password: the password is not echoed")
    report(new_login(base, berni["name"], pw2)[0] == 200, f"set-password: {berni['name']} logs in with the new one")
    p = run_manage(a, "set-password", "--player", berni["name"], stdin="one-password-1\nanother-pw-2\n")
    report(p.returncode != 0, f"set-password with two different entries → exit {p.returncode}, nothing stored", (p.stderr).strip())

    # 3. make-admin and --revoke
    p = run_manage(a, "make-admin", "--player", flo["name"])
    st, ck, me = new_login(base, flo["name"], flo["password"])
    report(p.returncode == 0 and me and me["site_admin"] is True and me["role"] == "admin", f"make-admin --player {flo['name']} → exit {p.returncode}, /me admin", p.stdout.strip())
    p = run_manage(a, "make-admin", "--player", flo["name"], "--revoke")
    me = get(base, "/me", cookie=ck).json()
    report(p.returncode == 0 and me["site_admin"] is False and me["role"] == "editor", f"make-admin --revoke → exit {p.returncode}, /me {me['role']}", p.stdout.strip())

    # 4. invite, and register with the code
    p = run_manage(a, "invite", "--group", "altherren", "--note", "L13 rehearsal")
    m = re.search(r"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b", p.stdout)
    report(p.returncode == 0 and bool(m), f"invite --group altherren → exit {p.returncode}", p.stdout.strip())
    r = httpx.post(f"{base}/auth/register", json={"code": m.group(0) if m else "", "display_name": "Rehearsal Newcomer", "password": "newcomer-password-1"}, timeout=30)
    nck = r.cookies.get(COOKIE)
    ok = r.status_code == 200 and [g["slug"] for g in r.json().get("groups", [])] == ["altherren"]
    report(ok, "register with the code → 200, a member of altherren", {"status": r.status_code, "role": r.json().get("role") if r.status_code == 200 else r.text[:120]})
    report(bool(nck) and get(base, "/tournaments", cookie=nck).status_code == 200, "the newcomer reads /tournaments")
    p = run_manage(a, "invite", "--group", "nope")
    report(p.returncode == 1, f"invite --group nope → exit {p.returncode}", p.stderr.strip())

    # 5. sessions, and --revoke-all
    ck_a = new_login(base, admin["name"], newpw)[1]
    p = run_manage(a, "sessions", "--player", admin["name"])
    report(p.returncode == 0, f"sessions --player {admin['name']} → exit {p.returncode}", p.stdout.strip().splitlines()[0] if p.stdout.strip() else p.stderr.strip())
    p = run_manage(a, "sessions", "--player", admin["name"], "--revoke-all")
    report(p.returncode == 0 and p.stdout.startswith("Revoked"), f"sessions --revoke-all → exit {p.returncode}", p.stdout.strip())
    report(get(base, "/me", cookie=ck_a).status_code == 401, "sessions --revoke-all: the admin's cookie is 401 now")
    p = run_manage(a, "reset-link", "--player", "Nobody")
    report(p.returncode == 1, f"reset-link --player Nobody → exit {p.returncode}", p.stderr.strip())

    # 6. E5 — verify-email and mail-test, against this run's file sink
    if a.mail:
        mail = Path(a.mail)
        taken = load_state(work).get("hand_verified_email")
        other = next(x for x in others if x is not berni and x is not flo)
        if taken:
            p = run_manage(a, "verify-email", "--player", other["name"], "--email", taken.upper())
            report(p.returncode == 1 and "nothing stored" in p.stderr, f"verify-email with an address verified on another account (any case) → exit {p.returncode}", p.stderr.strip())
        n0 = len(sink_messages(mail))
        p = run_manage(a, "mail-test", "--to", "x@example.test")
        new = wait_for_mail(mail, n0)
        report(
            p.returncode == 0 and p.stdout.startswith("Mail: file sink at") and len(new) == 1 and new[0]["to"] == "x@example.test",
            f"mail-test --to x@example.test → exit {p.returncode}, one more file in the sink",
            p.stdout.strip().splitlines()[0] if p.stdout.strip() else p.stderr.strip(),
        )
        # the gate's own shape on a development box: refused by the guard before anything connects
        fake = "not-a-real-password-e5"
        p = run_manage(a, "mail-test", "--to", "x@example.test", "--host", "smtp.invalid", "--user", "u@example.test", "--from", "no-reply@lorbeerkranz.xyz", stdin=fake + "\n")
        out = p.stdout + p.stderr
        report(p.returncode == 1 and "development server" in out and fake not in out, f"mail-test --host … on a development server → exit {p.returncode}, refused, the password not echoed", p.stderr.strip()[:140])
        report(len(sink_messages(mail)) == n0 + 1, "the refused mail-test wrote nothing")


# ---- E5: email -------------------------------------------------------------------------------

URL_RE = re.compile(r"https?://\S+")


def sink_messages(mail: Path) -> list[dict]:
    """Every message the file sink wrote, oldest first (`mail_sink_link.py`'s order)."""

    def order(path: Path) -> tuple[str, int]:
        stamp, _, seq = path.stem.partition("-")
        return stamp, int(seq) if seq.isdigit() else 0

    out = []
    for path in sorted(mail.glob("*.eml"), key=order):
        msg = message_from_bytes(path.read_bytes(), policy=email_policy.default)
        body = msg.get_body(preferencelist=("plain",))
        text = body.get_content() if body is not None else ""
        out.append({"path": path.name, "to": str(msg["To"] or ""), "subject": str(msg["Subject"] or ""), "text": text, "links": URL_RE.findall(text)})
    return out


def wait_for_mail(mail: Path, n0: int, want: int = 1, timeout: float = 10.0) -> list[dict]:
    """The messages written after the first `n0`, once there are `want` of them (a send after
    the answer is a background task, so it lands a moment after the response)."""
    deadline = time.monotonic() + timeout
    while True:
        msgs = sink_messages(mail)
        if len(msgs) >= n0 + want or time.monotonic() > deadline:
            return msgs[n0:]
        time.sleep(0.1)


def token_of(link: str) -> str:
    return link.split("#", 1)[1] if "#" in link else ""


def post(base: str, path: str, body: dict | None = None, *, cookie: str | None = None, method: str = "POST") -> httpx.Response:
    headers = {"Cookie": f"{COOKIE}={cookie}"} if cookie else {}
    return httpx.request(method, f"{base}{path}", json=body, headers=headers, timeout=30)


def cmd_email(a) -> None:
    """Email end to end over the API, on the migrated copy: set → the link from the sink →
    verify (no session) → change (the old address is told, with no link) → recover → a new
    password, and the earlier session ends → the unknown address and the per-address limit →
    `verify-email` by hand. Then no token and no full address in any log."""
    work, mail = Path(a.work), Path(a.mail)
    acc = accounts(Path(a.shape))
    base = a.base
    admin = next(x for x in acc if x.get("admin"))
    a1, a2 = "roli@example.test", "roli.new@example.test"

    st, ck1, me = new_login(base, admin["name"], password_of(work, admin))
    report(st == 200 and me["email_available"] is True and me["email_verified"] is False and me["email"] is None, "email: /me before — email_available, nothing verified", {k: me and me.get(k) for k in ("email_available", "email_verified", "login_secure")})

    # set → the link
    n0 = len(sink_messages(mail))
    r = post(base, "/auth/email", {"email": a1}, cookie=ck1, method="PUT")
    body = r.json() if r.status_code == 200 else r.text[:120]
    report(r.status_code == 200 and body["email"] is None and body["email_pending"] == a1, f"email: PUT /auth/email {a1} → 200, pending", body)
    new = wait_for_mail(mail, n0)
    m = new[-1] if new else {"to": "", "links": [], "subject": ""}
    report(len(new) == 1 and m["to"] == a1, "email: one message in the sink, to that address", [(x["to"], x["subject"]) for x in new])
    report(len(m["links"]) == 1 and re.search(r"/g/altherren/verify-email#[A-Za-z0-9_-]{20,}$", m["links"][0] if m["links"] else ""), "email: exactly one link, the token in the fragment", re.sub(r"#\S+", "#<token>", m["links"][0]) if m["links"] else None)
    tok1 = token_of(m["links"][0]) if m["links"] else ""
    report(get(base, "/me", cookie=ck1).json()["email_verified"] is False, "email: a pending address verifies nothing yet")

    # verify, with no session (the link opens in Safari)
    r = post(base, "/auth/email/verify", {"token": tok1})
    report(r.status_code == 200 and r.json().get("email") == a1, "email: POST /auth/email/verify with no cookie → 200", r.status_code)
    me = get(base, "/me", cookie=ck1).json()
    report(me["email_verified"] is True and me["email"] == a1 and me["email_pending"] is None, "email: /me now verified", {k: me.get(k) for k in ("email", "email_pending", "email_verified")})
    r = post(base, "/auth/email/verify", {"token": tok1})
    report(r.status_code == 400, "email: the same link again → 400", r.status_code)

    # change: the old address stays until the new one is verified, then it is told, with no link
    n0 = len(sink_messages(mail))
    r = post(base, "/auth/email", {"email": a2}, cookie=ck1, method="PUT")
    body = r.json() if r.status_code == 200 else r.text[:120]
    report(r.status_code == 200 and body["email"] == a1 and body["email_pending"] == a2, "email: a change keeps the verified address until the new one is confirmed", body)
    new = wait_for_mail(mail, n0)
    tok2 = token_of(new[-1]["links"][0]) if new and new[-1]["links"] and new[-1]["to"] == a2 else ""
    n0 = len(sink_messages(mail))
    r = post(base, "/auth/email/verify", {"token": tok2})
    report(r.status_code == 200 and r.json().get("email") == a2, "email: the new address verified → 200", r.status_code)
    new = wait_for_mail(mail, n0)
    report(len(new) == 1 and new[0]["to"] == a1 and not new[0]["links"], "email: the OLD address got the notice, and it carries no link", [(x["to"], x["subject"], len(x["links"])) for x in new])
    report(get(base, "/me", cookie=ck1).json()["email"] == a2, "email: /me names the new address")

    # recovery by email → a new password → the earlier session is ended
    n0 = len(sink_messages(mail))
    r = post(base, "/auth/recover", {"email": a2.upper()})
    known = r.content
    report(r.status_code == 200 and r.json() == {"ok": True} and "set-cookie" not in r.headers, "recover: POST /auth/recover (upper case) → 200 {ok: true}, no cookie", r.status_code)
    new = wait_for_mail(mail, n0)
    link = new[-1]["links"][0] if new and new[-1]["links"] else ""
    report(len(new) == 1 and new[0]["to"] == a2 and re.search(r"/g/altherren/reset#[A-Za-z0-9_-]{20,}$", link), "recover: one message, to the verified address, the reset link in its fragment", [(x["to"], x["subject"]) for x in new])
    rtok = token_of(link)
    r = post(base, "/auth/reset", {"token": rtok, "password": "fourteen-chars"})
    report(r.status_code == 400 and "15" in r.text, "recover: a 14-character password → 400, the floor is 15", r.text[:100])
    newpw = "Recovered by mail 1"
    r = post(base, "/auth/reset", {"token": rtok, "password": newpw})
    rck = r.cookies.get(COOKIE)
    report(r.status_code == 200 and r.json().get("player_name") == admin["name"] and bool(rck), f"recover: POST /auth/reset with the emailed token and {len(newpw)} characters → 200, signed in as {admin['name']}", r.status_code)
    report(get(base, "/me", cookie=ck1).status_code == 401, "recover: the session from before the recovery is ended")
    report(post(base, "/auth/reset", {"token": rtok, "password": newpw + "x"}).status_code == 400, "recover: the link a second time → 400")
    report(new_login(base, admin["name"], newpw)[0] == 200, "recover: the new password logs in")
    report(new_login(base, admin["name"], password_of(work, admin))[0] == 401, "recover: the old password is 401")
    overrides = load_state(work).get("password_overrides", {})
    overrides[admin["name"]] = newpw
    save_state(work, password_overrides=overrides, admin_cookie_recovered=rck, admin_email=a2)

    # an unknown address: the same answer, and nothing sent
    n0 = len(sink_messages(mail))
    r = post(base, "/auth/recover", {"email": "nobody@example.test"})
    report(r.status_code == 200 and r.content == known, "recover: an unknown address → the byte-identical answer", r.status_code)
    time.sleep(1.5)
    report(len(sink_messages(mail)) == n0, "recover: … and no new file in the sink (1.5 s later)")

    # the per-address limit: 3 per hour, counted for every request
    codes = [post(base, "/auth/recover", {"email": a2}).status_code for _ in range(2)]
    r = post(base, "/auth/recover", {"email": a2})
    report(codes == [200, 200] and r.status_code == 429 and int(r.headers.get("retry-after", "0")) > 0, "recover: the 4th request for one address → 429 with Retry-After", {"before": codes, "4th": r.status_code, "retry-after": r.headers.get("retry-after")})
    wait_for_mail(mail, n0, want=2)

    # the hand-verify hatch, on another account
    other = [x for x in acc if not x.get("admin")][-1]
    addr = f"{other['name'].lower()}@example.test"
    n0 = len(sink_messages(mail))
    p = run_manage(a, "verify-email", "--player", other["name"], "--email", addr)
    report(p.returncode == 0 and p.stdout.startswith(f"Email {addr} verified by hand"), f"verify-email --player {other['name']} → exit {p.returncode}", p.stdout.strip())
    time.sleep(0.5)
    report(len(sink_messages(mail)) == n0, "verify-email sends nothing")
    rows = {x["display_name"]: x for x in get(base, "/admin/accounts", cookie=rck).json()}
    report(rows[other["name"]]["email_state"] == "verified" and rows[admin["name"]]["email_state"] == "verified", "GET /admin/accounts shows both addresses verified", {n: rows[n]["email_state"] for n in rows})
    r = get(base, "/admin/mail-status", cookie=rck)
    report(r.status_code == 200 and r.json().get("configured") is True and "file sink" in r.json().get("description", ""), "GET /admin/mail-status → the file sink", r.json() if r.status_code == 200 else r.status_code)
    save_state(work, hand_verified_email=addr)
    info("sink after the API walk", [(x["to"], x["subject"], len(x["links"])) for x in sink_messages(mail)])
    no_secrets_in_logs(work, mail, "email")


def no_secrets_in_logs(work: Path, mail: Path, label: str) -> None:
    """No token of any message, no full address, no body line in any of the new code's logs."""
    logs = sorted(work.glob("new*.log"))
    text = "\n".join(p.read_text(errors="replace") for p in logs)
    msgs = sink_messages(mail)
    tokens = {token_of(link) for m in msgs for link in m["links"] if "#" in link}
    hits = sum(text.count(t) for t in tokens if t)
    report(hits == 0, f"{label}: none of the {len(tokens)} tokens in the sink appears in {len(logs)} new-code logs", hits)
    addrs = {m["to"] for m in msgs}
    hits = {ad: text.count(ad) for ad in addrs if text.count(ad)}
    report(not hits, f"{label}: no full address in the logs, only masked ones ({len(addrs)} addresses)", hits or None)
    lines = {ln.strip() for m in msgs for ln in m["text"].splitlines() if len(ln.strip()) > 25 and not URL_RE.search(ln)}
    hits = [ln for ln in lines if ln in text]
    report(not hits, f"{label}: no body line in the logs ({len(lines)} distinct lines checked)", hits[:2] or None)


def cmd_passkey_only(a) -> None:
    """After the browser registered a passkey-only account: the rows are what E2 promises."""
    work, db = Path(a.work), Path(a.db)
    rows = db_rows(db, f"select p.id, a.password_hash, a.password_origin, a.webauthn_user_handle from player p join account a on a.player_id = p.id where p.display_name = '{a.name}'")
    ok = len(rows) == 1 and rows[0][1] is None and rows[0][2] == "none" and bool(rows[0][3])
    report(ok, f"passkey-only: {a.name!r} has an account with no password (origin none) and a user handle", [(r[0], r[1], r[2]) for r in rows])
    if not rows:
        return
    pid = rows[0][0]
    report(db_count(db, f"select count(*) from passkey where player_id = {pid}") == 1, "passkey-only: exactly one passkey")
    report(db_rows(db, f"select role from groupmembership where player_id = {pid}") == [("member",)], "passkey-only: a member of the group")
    report(db_count(db, f"select count(*) from invitecode where redeemed_by = {pid}") == 1, "passkey-only: the invite is spent, by this player")
    report(db_count(db, "select count(*) from registrationintent") == 0, "passkey-only: no registration intent left behind")
    save_state(work, created_player_ids=sorted(set(load_state(work).get("created_player_ids", [])) | {pid}), passkey_only_name=a.name)


def cmd_email_forward(a) -> None:
    """After the rollback and forward: every verified address and the passkey-only account are
    still there, and the new code reads them."""
    work, db = Path(a.work), Path(a.db)
    acc = accounts(Path(a.shape))
    st_ = load_state(work)
    admin = next(x for x in acc if x.get("admin"))
    rows = db_rows(db, "select p.display_name, e.email, e.verified_at is not null from accountemail e join player p on p.id = e.player_id order by p.id")
    info("roll forward: accountemail", rows)
    want = {admin["name"]: st_.get("admin_email")}
    other = [x for x in acc if not x.get("admin")][-1]
    if st_.get("hand_verified_email"):
        want[other["name"]] = st_["hand_verified_email"]
    if st_.get("passkey_only_name"):
        want[st_["passkey_only_name"]] = "neuling.new@example.test"
    have = {r[0]: r[1] for r in rows if r[2]}
    report(all(have.get(k) == v for k, v in want.items() if v), "roll forward: every verified address survived", {k: have.get(k) for k in want})
    st, ck, me = new_login(a.base, admin["name"], password_of(work, admin))
    report(st == 200 and me["email_verified"] is True and me["email"] == st_.get("admin_email"), f"roll forward: {admin['name']}'s /me — the recovered password logs in, the address verified", me and {k: me.get(k) for k in ("email", "email_verified")})
    name = st_.get("passkey_only_name")
    if name:
        rows = db_rows(db, f"select a.password_hash is null, (select count(*) from passkey k where k.player_id = p.id) from player p join account a on a.player_id = p.id where p.display_name = '{name}'")
        report(rows == [(1, 1)], f"roll forward: the passkey-only account {name!r} is still there, no password, one passkey", rows)


def cmd_open_intent(a) -> None:
    """A passkey-only registration whose sheet was never answered (options, no verify): it leaves
    one `RegistrationIntent` row and no account — so the rollback also runs with that table
    populated, and the code stays unspent."""
    db = Path(a.db)
    p = run_manage(a, "invite", "--group", "altherren", "--note", "E5 unanswered sheet")
    m = re.search(r"\b[A-Z0-9]{4}-[A-Z0-9]{4}\b", p.stdout)
    n_players = db_count(db, "select count(*) from player")
    r = httpx.post(
        f"{a.base}/auth/register/passkey/options",
        json={"code": m.group(0) if m else "", "display_name": "Never Answered"},
        headers={"Origin": a.origin},
        timeout=30,
    )
    ok = r.status_code == 200 and "challenge" in r.json()
    report(ok, "an unanswered passkey-only registration: options → 200, the sheet is never answered", r.status_code)
    report(db_count(db, "select count(*) from registrationintent") == 1 and db_count(db, "select count(*) from player") == n_players, "… one registration intent, no new player, the code unspent")


def cmd_logs(a) -> None:
    no_secrets_in_logs(Path(a.work), Path(a.mail), "all new-code logs")


def cmd_password_of(a) -> None:
    x = next(y for y in accounts(Path(a.shape)) if y["name"] == a.name)
    print(password_of(Path(a.work), x))


def cmd_prod_guard(a) -> None:
    """The docker-compose environment (APP_ENV=production, no dev origin), on the migrated copy."""
    acc = accounts(Path(a.shape))
    base = a.base
    r = httpx.get(f"{base}/health", timeout=10)
    report(r.status_code == 200, "production env: /health from loopback → 200 (the healthcheck's path)", r.status_code)
    report(httpx.get(f"{base}/tournaments", timeout=10).status_code == 401, "production env: anonymous /tournaments → 401")
    x = next(y for y in acc if not y.get("admin") and y["name"] != "Berni")
    r = httpx.post(f"{base}/auth/login", json={"username": x["name"], "password": x["password"]}, timeout=30)
    sc = r.headers.get("set-cookie", "")
    report(r.status_code == 200 and "Secure" in sc and "HttpOnly" in sc, f"production env: login {x['name']} → 200, cookie Secure + HttpOnly", sc.split(";", 1)[1].strip() if ";" in sc else sc)
    body = r.json() if r.status_code == 200 else {}
    report(body.get("email_available") is False, "production env, mail off: MeOut.email_available is false (the strip asks for no address)", body.get("email_available"))
    r = httpx.post(f"{base}/auth/recover", json={"email": "nobody@example.test"}, timeout=30)
    report(r.status_code == 200 and r.json() == {"ok": True}, "production env, mail off: POST /auth/recover still answers {ok: true}", r.status_code)


def cmd_hash_timing(a) -> None:
    sys.path.insert(0, a.backend)
    from app.services.passwords import hash_password, hasher_for

    ph = hasher_for("default")
    ts = []
    for i in range(10):
        t0 = time.perf_counter()
        hash_password(ph, f"Grüß Gott timing {i}")
        ts.append((time.perf_counter() - t0) * 1000)
    info("hash_password (default profile) × 10", f"median {statistics.median(ts):.1f} ms, min {min(ts):.1f}, max {max(ts):.1f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("step")
    ap.add_argument("--work", required=True)
    ap.add_argument("--shape", required=True)
    ap.add_argument("--base", default="")
    ap.add_argument("--db", default="")
    ap.add_argument("--py", default=sys.executable)
    ap.add_argument("--backend", default="")
    ap.add_argument("--secrets", default="")
    ap.add_argument("--mail", default="")
    ap.add_argument("--name", default="")
    ap.add_argument("--origin", default="")
    a = ap.parse_args()
    {
        "baseline": cmd_baseline,
        "new-first": cmd_new_first,
        "old-rollback": cmd_old_rollback,
        "new-forward": cmd_new_forward,
        "escape": cmd_escape,
        "prod-guard": cmd_prod_guard,
        "hash-timing": cmd_hash_timing,
        "email": cmd_email,
        "passkey-only": cmd_passkey_only,
        "email-forward": cmd_email_forward,
        "password-of": cmd_password_of,
        "open-intent": cmd_open_intent,
        "logs": cmd_logs,
    }[a.step](a)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
