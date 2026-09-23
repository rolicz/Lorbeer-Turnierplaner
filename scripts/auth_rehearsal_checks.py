"""L13 — the API half of the dress rehearsal. Called by `scripts/auth_rehearsal.sh`, never alone.

Every subcommand prints `PASS …` / `FAIL …` lines (and `INFO …` for numbers) and exits 1 when
anything failed. State that one step hands to a later one (a tournament id, an old JWT) lives in
`<work>/state.json`. It talks HTTP to 127.0.0.1 only and never opens a database for writing:
the one database read is `sqlite3 … mode=ro` for counts.

Run with the backend's venv python (it needs `httpx` and `PyJWT`, both already in it).
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import statistics
import subprocess
import sys
import time
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
    all_added: set[str] = set()
    for p in paths:
        b, n = baseline[p], now[p]
        if n["status"] != 200:
            report(False, f"{label}: GET {p}", n["status"])
            continue
        d, added = diff(strip_group(b["body"]), strip_group(n["body"]))
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
    save_state(work, admin_cookie_first=ck)


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
    for p in ("/cup?key=default", "/cup?key=bauernkranz", "/stats/records?mode=overall&scope=tournaments", "/stats/players"):
        r = get(base, p, bearer=tok)
        d, _ = diff(baseline[p]["body"], r.json())
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
        st, ck, me = new_login(base, x["name"], x["password"])
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
    report(get(base, "/me", cookie=st_["admin_cookie_first"]).status_code == 200, "roll forward: the session from the first boot is still live")
    compare_to_baseline(work, base, ck, FORWARD_PATHS, "roll forward")
    n_pk = db_count(db, "select count(*) from passkey")
    info("roll forward: passkey rows", n_pk)


def run_manage(a, *args, stdin: str | None = None) -> subprocess.CompletedProcess:
    cmd = [a.py, "manage.py", "--secrets", a.secrets, "--db-url", f"sqlite:///{a.db}", *args]
    return subprocess.run(cmd, cwd=a.backend, input=stdin, capture_output=True, text=True, timeout=120)


def cmd_escape(a) -> None:
    acc = accounts(Path(a.shape))
    base = a.base
    admin = next(x for x in acc if x.get("admin"))
    others = [x for x in acc if not x.get("admin")]
    berni = next((x for x in acc if not x["password"].isascii()), others[0])
    flo = next(x for x in others if x is not berni)

    # 1. reset-link (lower case: the command matches names case-insensitively)
    st0, ck_before, _ = new_login(base, admin["name"], admin["password"])
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
    report(new_login(base, admin["name"], admin["password"])[0] == 401, "reset: the old password is 401")

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
    a = ap.parse_args()
    {
        "baseline": cmd_baseline,
        "new-first": cmd_new_first,
        "old-rollback": cmd_old_rollback,
        "new-forward": cmd_new_forward,
        "escape": cmd_escape,
        "prod-guard": cmd_prod_guard,
        "hash-timing": cmd_hash_timing,
    }[a.step](a)
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
