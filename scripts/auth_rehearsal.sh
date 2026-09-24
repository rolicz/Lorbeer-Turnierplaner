#!/usr/bin/env bash
# L13 — the auth batch's dress rehearsal on a copy of production (FEATURES_2026-09-auth.md),
# extended by E5 to email, recovery and the two new passkey ceremonies
# (FEATURES_2026-09-auth-email.md). Written for bash: run it as `bash scripts/auth_rehearsal.sh …`
# or directly (the shebang) — never `zsh script`, which does not word-split the way this expects.
#
#   scripts/auth_rehearsal.sh <deploy-snapshot-dir> <secrets-shape.json> [--no-browser]
#
#   <deploy-snapshot-dir>  e.g. backup/deploy/20260920-151542 — selected by its snapshot.json
#                          "kind": "deploy", never by name. Opened READ-ONLY: only `cp`/`rsync`
#                          read from it, and the script checks afterwards that nothing in it changed.
#   <secrets-shape.json>   production's secrets.json *shape* — the real display names and admin
#                          flags, throwaway passwords, a throwaway jwt_secret. Never the real file.
#                          It is copied; the original is not edited.
#
# Everything happens in a fresh `mktemp -d` outside the repo. It never touches backup/,
# backend/app.db, backend/data/ or .git (the old code comes from `git archive`). Push rows are
# deleted from the copy before anything boots, and no VAPID key is ever set. No `smtp_*` key is
# ever set either: the new code always boots with MAIL_SINK_DIR=$WORK/mail (a file sink that
# delivers nowhere), and the run asserts no log ever says `Mail: SMTP`.
#
# What it does, in order (every step prints PASS / FAIL / INFO lines; the exit code is the
# number of failed steps, capped at 1):
#   0  copy the snapshot; delete push subscriptions from the copy
#   1  baseline: boot the OLD code (ROLLBACK_SHA, default ce55a53 — what production runs) on an
#      untouched copy and record what it serves (cups, stats, records, tournaments)
#   2  `manage.py auth-preflight` against the copy, before any boot (exit code + report)
#   3  first boot of THIS tree on the copy: the migration's log lines, `Mail: file sink`, every
#      account logs in, the same answers as the baseline, the JWT exchange, timing; a passkey is
#      registered in Chromium and old deep links are opened (unless --no-browser); then email
#      over the API (`checks email`: set, verify, change, recover, the limits, verify-email)
#   3b a restart (it empties the in-memory rate-limit buckets), then the browser email walk
#      (`email_e2e.mjs`): a passkey-only registration with an invite code, verify by tap in a
#      cookie-less context and change it, recovery by email to a new passkey (unless --no-browser)
#   4  roll back: the OLD code on the SAME file — boots, reads, JWT login, writes a tournament
#      and a comment; the three email tables are byte-identical afterwards
#   5  roll forward: this tree again — the backfill picks up the old code's row, nothing lost,
#      the old code's JWT exchanges, the passkeys from step 3 sign in from a fresh browser, the
#      verified emails and the passkey-only account are still there
#   6  a third boot (must migrate nothing), the five escape-hatch commands, verify-email and
#      mail-test against the sink
#   7  docker-compose's production environment, twice: with MAIL_SINK_DIR still set the boot
#      guard must refuse; without it it boots, logs `Mail: off`, and /health, Secure as before
#   8  hash_password timing; the snapshot is unchanged; no `Mail: SMTP` line anywhere
#
# Ports (E5's row): backend 8276, old backend 8277, vite 8286 (B_NEW / B_OLD / V override them).
# KEEP_WORK=1 keeps the work dir.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP="${1:?usage: $0 <deploy-snapshot-dir> <secrets-shape.json> [--no-browser]}"
SHAPE="${2:?usage: $0 <deploy-snapshot-dir> <secrets-shape.json> [--no-browser]}"
BROWSER=1
[ "${3:-}" = "--no-browser" ] && BROWSER=0
ROLLBACK_SHA="${ROLLBACK_SHA:-ce55a53}"
B_NEW="${B_NEW:-8276}"
B_OLD="${B_OLD:-8277}"
V="${V:-8286}"
PY="$REPO/backend/.venv/bin/python"
PLAYWRIGHT="${PLAYWRIGHT:-/home/roli/projects/racer/node_modules/playwright-core}"
export PLAYWRIGHT

SNAP="$(cd "$SNAP" && pwd)"
SHAPE="$(cd "$(dirname "$SHAPE")" && pwd)/$(basename "$SHAPE")"
FAILS=0
PIDS=()

say() { printf '\n==== %s\n' "$*"; }
fail() { echo "FAIL $*"; FAILS=$((FAILS + 1)); }
pass() { echo "PASS $*"; }
info() { echo "INFO $*"; }

kind="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["kind"])' "$SNAP/snapshot.json" 2>/dev/null || true)"
[ "$kind" = "deploy" ] || { echo "refused: $SNAP/snapshot.json kind is '$kind', not 'deploy'"; exit 2; }
for p in $B_NEW $B_OLD $V; do
  if ss -ltn | grep -qE ":$p\b"; then echo "refused: port $p is in use"; exit 2; fi
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/auth-rehearsal.XXXXXX")"
case "$WORK" in "$REPO"/*) echo "refused: work dir inside the repo"; exit 2 ;; esac
DB="$WORK/rh.db"
MAIL="$WORK/mail"
mkdir -p "$MAIL"
touch "$WORK/stamp"

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && kill "$pid" 2>/dev/null && wait "$pid" 2>/dev/null
  done
  if [ "${KEEP_WORK:-0}" = "1" ]; then echo "work dir kept: $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT

# start_backend <tree-backend-dir> <port> <db> <log> [ENV=VAL…] → sets SRV_PID
start_backend() {
  local dir="$1" port="$2" db="$3" log="$4"
  shift 4
  (cd "$dir" && exec env -u DB_URL -u JWT_SECRET -u CUPS_CONFIG_PATH -u UPLOADS_DIR \
    PUSH_VAPID_PUBLIC_KEY= PUSH_VAPID_PRIVATE_KEY= PUSH_VAPID_PRIVATE_KEY_FILE= \
    UPLOADS_DIR="$WORK/uploads" CUPS_CONFIG_PATH="$WORK/cups.json" "$@" \
    "$PY" run.py --host 127.0.0.1 --port "$port" --secrets "$WORK/secrets.json" --db-url "sqlite:///$db") \
    >"$log" 2>&1 &
  SRV_PID=$!
  PIDS+=("$SRV_PID")
  local i
  for i in $(seq 1 180); do
    if ! kill -0 "$SRV_PID" 2>/dev/null; then echo "--- backend died; log tail:"; tail -30 "$log"; return 1; fi
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/health")" = "200" ] && return 0
    sleep 0.5
  done
  echo "--- backend never answered /health"; tail -30 "$log"; return 1
}
stop() { kill "$1" 2>/dev/null; wait "$1" 2>/dev/null; }
boot_lines() { grep -E "Cup defs|Auth migra|Cups imported|the file is only a seed|seeded|swept|backfilled|reconciled|DB initialized|Mail: |Traceback|Error" "$1" | sed -E 's/^.*(INFO|WARNING|ERROR)[^A-Za-z]*//' | sed 's/^/  log: /'; }
checks() { "$PY" "$REPO/scripts/auth_rehearsal_checks.py" "$@" --work "$WORK" --shape "$SHAPE" || FAILS=$((FAILS + 1)); }
browser() { (cd "$REPO/frontend" && node "$REPO/scripts/auth_rehearsal_browser.mjs" "$@") || FAILS=$((FAILS + 1)); }
email_browser() { (cd "$REPO/frontend" && node "$REPO/scripts/email_e2e.mjs" "$@" --sink "$MAIL") || FAILS=$((FAILS + 1)); }
# The new code always boots with the file sink; the old code (ce55a53) knows no mail and ignores it.
NEW_ENV=(APP_ENV=development AUTH_DEV_ORIGIN=1 "MAIL_SINK_DIR=$MAIL")
mail_line() {  # <log> — the boot log names the file sink in this run's work dir, and never SMTP
  if grep -qF "Mail: file sink at $MAIL (never delivers)" "$1"; then pass "log: Mail: file sink at \$WORK/mail (never delivers)"; else fail "log: no 'Mail: file sink at $MAIL' line"; fi
  if grep -q "Mail: SMTP" "$1"; then fail "log: a 'Mail: SMTP' line — this stack is misconfigured"; else pass "log: no 'Mail: SMTP' line"; fi
}
email_tables() { sqlite3 "$DB" 'select count(*) from accountemail; select count(*) from emailverification; select count(*) from registrationintent;' | paste -sd/; }
email_tables_dump() { sqlite3 "$DB" '.dump accountemail' '.dump emailverification' '.dump registrationintent' | sha256sum | cut -d' ' -f1; }

say "0  copy the snapshot ($(basename "$SNAP")) to $WORK"
SNAP_SUM_BEFORE="$(sha256sum "$SNAP/data/app.db" | cut -d' ' -f1)"
cp "$SNAP/data/app.db" "$WORK/pristine.db"
cp "$SNAP/data/cups.json" "$WORK/cups.json"
rsync -a "$SNAP/data/uploads/" "$WORK/uploads/"
push_before="$(sqlite3 "$WORK/pristine.db" 'select count(*) from pushsubscription')"
sqlite3 "$WORK/pristine.db" 'delete from pushsubscriptionpreference; delete from pushsubscription;'
push_after="$(sqlite3 "$WORK/pristine.db" 'select (select count(*) from pushsubscription)+(select count(*) from pushsubscriptionpreference)')"
[ "$push_after" = "0" ] && pass "push subscriptions deleted from the copy ($push_before → 0); no VAPID key is set" || fail "push rows left: $push_after"
cp "$WORK/pristine.db" "$WORK/base.db"
cp "$WORK/pristine.db" "$DB"
"$PY" - "$SHAPE" "$WORK/secrets.json" "$DB" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
d["db_url"] = f"sqlite:///{sys.argv[3]}"
json.dump(d, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
info "snapshot: $(sqlite3 "$DB" 'select count(*) from player') players, $(sqlite3 "$DB" 'select count(*) from tournament') tournaments, $(sqlite3 "$DB" 'select count(*) from friendlymatch') friendlies, $(sqlite3 "$DB" 'select count(*) from comment') comments"
mkdir -p "$WORK/old"
git -C "$REPO" archive "$ROLLBACK_SHA" backend | tar -x -C "$WORK/old"
info "old code: git archive $ROLLBACK_SHA ($(git -C "$REPO" log -1 --format='%h %s' "$ROLLBACK_SHA"))"

say "1  baseline: the old code ($ROLLBACK_SHA) on an untouched copy"
if start_backend "$WORK/old/backend" $B_OLD "$WORK/base.db" "$WORK/base.log"; then
  boot_lines "$WORK/base.log"
  checks baseline --base "http://127.0.0.1:$B_OLD"
  stop "$SRV_PID"
else fail "old code did not boot on the pristine copy"; fi

say "2  auth-preflight against the copy, before any boot"
sum0="$(sha256sum "$DB" | cut -d' ' -f1)"
(cd "$REPO/backend" && "$PY" manage.py auth-preflight --secrets "$WORK/secrets.json" --db-url "sqlite:///$DB") >"$WORK/preflight.txt" 2>&1
rc=$?
sed 's/^/  | /' "$WORK/preflight.txt"
[ $rc -eq 0 ] && pass "auth-preflight exit 0" || fail "auth-preflight exit $rc"
grep -q "^RESULT: OK" "$WORK/preflight.txt" && pass "preflight: RESULT: OK" || fail "preflight: no 'RESULT: OK'"
grep -q "^PROBLEM:" "$WORK/preflight.txt" && fail "preflight: a PROBLEM line (unmatched names or case collisions)" || pass "preflight: no PROBLEM line — no unmatched names, no case collisions"
n_acc="$("$PY" -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["player_accounts"]))' "$SHAPE")"
grep -qE "accounts with a password: +$n_acc " "$WORK/preflight.txt" && pass "preflight: $n_acc accounts with a password = the secrets file's $n_acc" || fail "preflight: account count differs from the secrets file's $n_acc"
[ "$(sha256sum "$DB" | cut -d' ' -f1)" = "$sum0" ] && pass "preflight left the database byte-identical (sha256)" || fail "preflight changed the database"

say "3  first boot of this tree ($(git -C "$REPO" rev-parse --short HEAD)) on the copy"
t0=$(date +%s%N)
if start_backend "$REPO/backend" $B_NEW "$DB" "$WORK/new1.log" "${NEW_ENV[@]}"; then
  info "first boot (migration included) to a healthy /health: $(( ($(date +%s%N) - t0) / 1000000 )) ms"
  boot_lines "$WORK/new1.log"
  mail_line "$WORK/new1.log"
  grep -q "Auth migrated: [0-9]* accounts, 1 group, [0-9]* memberships" "$WORK/new1.log" && pass "log: Auth migrated … 1 group" || fail "log: no 'Auth migrated' line"
  grep -q "Cups imported: 2" "$WORK/new1.log" && pass "log: Cups imported: 2" || fail "log: no 'Cups imported: 2'"
  checks new-first --base "http://127.0.0.1:$B_NEW" --db "$DB"
  if [ $BROWSER -eq 1 ]; then
    # a private cacheDir in the work dir: nothing of this run lands in frontend/node_modules/.vite
    printf 'import base from "%s/frontend/vite.config.ts";\nexport default { ...base, cacheDir: "%s/vite-cache" };\n' "$REPO" "$WORK" >"$WORK/vite.config.mjs"
    ( cd "$REPO/frontend" && . "$REPO/scripts/node-env.sh" && exec env BACKEND_ORIGIN="http://127.0.0.1:$B_NEW" \
      VITE_API_BASE_URL=/api VITE_WS_BASE_URL= node node_modules/vite/bin/vite.js --config "$WORK/vite.config.mjs" --port "$V" --strictPort --host 127.0.0.1 ) >"$WORK/vite.log" 2>&1 &
    VITE_PID=$!
    PIDS+=("$VITE_PID")
    for i in $(seq 1 120); do curl -s -o /dev/null "http://127.0.0.1:$V/" && break; sleep 0.5; done
    ADMIN="$("$PY" -c 'import json,sys;a=[x for x in json.load(open(sys.argv[1]))["player_accounts"] if x.get("admin")][0];print(a["name"])' "$SHAPE")"
    ADMIN_PW="$("$PY" -c 'import json,sys;a=[x for x in json.load(open(sys.argv[1]))["player_accounts"] if x.get("admin")][0];print(a["password"])' "$SHAPE")"
    read -r TID CID < <(sqlite3 -separator ' ' "$DB" 'select tournament_id, id from comment where tournament_id is not null order by id desc limit 1')
    browser register --base "http://localhost:$V" --user "$ADMIN" --password "$ADMIN_PW" --out "$WORK/passkey.json"
    browser deeplinks --base "http://localhost:$V" --user "$ADMIN" --password "$ADMIN_PW" --tournament "$TID" --comment "$CID"
    info "passkey rows after registering: $(sqlite3 "$DB" 'select count(*) from passkey')"
  fi
  checks email --base "http://127.0.0.1:$B_NEW" --db "$DB" --py "$PY" --backend "$REPO/backend" --secrets "$WORK/secrets.json" --mail "$MAIL"
  stop "$SRV_PID"
else fail "this tree did not boot on the copy"; fi

say "3b a restart (empties the rate-limit buckets), then email in the browser"
if start_backend "$REPO/backend" $B_NEW "$DB" "$WORK/new1b.log" "${NEW_ENV[@]}"; then
  boot_lines "$WORK/new1b.log"
  mail_line "$WORK/new1b.log"
  grep -qE "Auth migrated|Cups imported" "$WORK/new1b.log" && fail "log: the restart migrated something" || pass "log: the restart migrated nothing"
  if [ $BROWSER -eq 1 ]; then
    CODE="$(cd "$REPO/backend" && "$PY" manage.py invite --group altherren --note "E5 passkey-only" --secrets "$WORK/secrets.json" --db-url "sqlite:///$DB" | grep -oE '\b[A-Z0-9]{4}-[A-Z0-9]{4}\b' | head -1)"
    [ -n "$CODE" ] && pass "invite for the passkey-only registration: a code" || fail "manage.py invite printed no code"
    NEWCOMER="Passkey Neuling"
    email_browser register --base "http://localhost:$V" --code "$CODE" --name "$NEWCOMER" --out "$WORK/neuling.json"
    checks passkey-only --db "$DB" --name "$NEWCOMER"
    email_browser verify --base "http://localhost:$V" --in "$WORK/neuling.json" --name "$NEWCOMER" \
      --email neuling@example.test --email2 neuling.new@example.test
    ROLI_PW="$("$PY" "$REPO/scripts/auth_rehearsal_checks.py" password-of --work "$WORK" --shape "$SHAPE" --name "$ADMIN")"
    email_browser recover --base "http://localhost:$V" --in "$WORK/passkey.json" --user "$ADMIN" --password "$ROLI_PW" \
      --email "$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["admin_email"])' "$WORK/state.json")" --out "$WORK/recovered.json"
    checks open-intent --base "http://127.0.0.1:$B_NEW" --db "$DB" --py "$PY" --backend "$REPO/backend" --secrets "$WORK/secrets.json" --origin "http://localhost:$V"
    info "after the browser walk: passkeys $(sqlite3 "$DB" 'select count(*) from passkey'), accounts without a password $(sqlite3 "$DB" 'select count(*) from account where password_hash is null'), email tables (accountemail/emailverification/registrationintent) $(email_tables)"
  fi
  stop "$SRV_PID"
else fail "the restart did not boot"; fi

say "4  roll back: $ROLLBACK_SHA on the SAME database file"
em_before="$(email_tables)"
em_dump_before="$(email_tables_dump)"
info "email tables before the rollback (accountemail/emailverification/registrationintent): $em_before"
if [ "$BROWSER" -eq 1 ]; then
  case "/$em_before/" in */0/*) fail "the rollback should run with all three email tables populated ($em_before)" ;; *) pass "the rollback runs with all three email tables populated ($em_before)" ;; esac
fi
if start_backend "$WORK/old/backend" $B_OLD "$DB" "$WORK/old.log" "MAIL_SINK_DIR=$MAIL"; then
  boot_lines "$WORK/old.log"
  checks old-rollback --base "http://127.0.0.1:$B_OLD" --db "$DB"
  stop "$SRV_PID"
  [ "$(email_tables_dump)" = "$em_dump_before" ] && pass "rollback: the three email tables are byte-identical afterwards ($(email_tables))" || fail "rollback: the email tables changed ($em_before → $(email_tables))"
  info "after the rollback the new tables are untouched: $(sqlite3 "$DB" 'select count(*) from account') accounts, $(sqlite3 "$DB" 'select count(*) from groupmembership') memberships, $(sqlite3 "$DB" 'select count(*) from passkey') passkeys, $(sqlite3 "$DB" 'select count(*) from authsession') sessions, $(sqlite3 "$DB" 'select count(*) from cup') cups"
else fail "the old code did not boot on the migrated database"; fi

say "5  roll forward: this tree again"
if start_backend "$REPO/backend" $B_NEW "$DB" "$WORK/new2.log" "${NEW_ENV[@]}"; then
  boot_lines "$WORK/new2.log"
  mail_line "$WORK/new2.log"
  grep -q "Auth migrated: 0 accounts, 0 groups, 0 memberships.*tournament=1" "$WORK/new2.log" && pass "log: the backfill picked up exactly the rollback's tournament" || fail "log: expected 'Auth migrated: 0 accounts, 0 groups, 0 memberships … tournament=1'"
  grep -q "Cups imported" "$WORK/new2.log" && fail "log: cups imported a second time" || pass "log: no second cups import"
  checks new-forward --base "http://127.0.0.1:$B_NEW" --db "$DB"
  checks email-forward --base "http://127.0.0.1:$B_NEW" --db "$DB"
  info "roll forward: email tables (accountemail/emailverification/registrationintent) $(email_tables) — an unanswered intent is swept once its challenge is 5 minutes old"
  if [ $BROWSER -eq 1 ] && [ -s "$WORK/passkey.json" ]; then
    browser login --base "http://localhost:$V" --in "$WORK/passkey.json" --user "$ADMIN"
  fi
  if [ $BROWSER -eq 1 ] && [ -s "$WORK/neuling.json" ]; then
    email_browser login --base "http://localhost:$V" --in "$WORK/neuling.json" --name "$NEWCOMER" --email neuling.new@example.test
  fi
  stop "$SRV_PID"
else fail "this tree did not boot after the rollback"; fi
[ -n "${VITE_PID:-}" ] && stop "$VITE_PID"

say "6  a third boot (idempotent), then the five escape-hatch commands"
if start_backend "$REPO/backend" $B_NEW "$DB" "$WORK/new3.log" "${NEW_ENV[@]}"; then
  boot_lines "$WORK/new3.log"
  mail_line "$WORK/new3.log"
  grep -qE "Auth migrated|Cups imported" "$WORK/new3.log" && fail "log: the third boot migrated something" || pass "log: the third boot migrated nothing"
  checks escape --base "http://127.0.0.1:$B_NEW" --db "$DB" --py "$PY" --backend "$REPO/backend" --secrets "$WORK/secrets.json" --mail "$MAIL"
  stop "$SRV_PID"
else fail "third boot"; fi

say "7  docker-compose's production environment on the migrated copy"
# First with the sink still set: the boot guard must refuse (it would swallow every recovery link).
sum7="$(sha256sum "$DB" | cut -d' ' -f1)"
(cd "$REPO/backend" && exec env -u DB_URL -u JWT_SECRET PUSH_VAPID_PUBLIC_KEY= PUSH_VAPID_PRIVATE_KEY= PUSH_VAPID_PRIVATE_KEY_FILE= \
  UPLOADS_DIR="$WORK/uploads" CUPS_CONFIG_PATH="$WORK/cups.json" APP_ENV=production TRUSTED_PROXY_HOPS=1 "MAIL_SINK_DIR=$MAIL" \
  timeout 120 "$PY" run.py --host 127.0.0.1 --port "$B_NEW" --secrets "$WORK/secrets.json" --db-url "sqlite:///$DB") >"$WORK/prod-sink.log" 2>&1
rc=$?
grep -E "AuthConfigError|MAIL_SINK_DIR" "$WORK/prod-sink.log" | tail -2 | cut -c1-220 | sed 's/^/  log: /'
[ $rc -ne 0 ] && [ $rc -ne 124 ] && pass "production env + MAIL_SINK_DIR: the boot is refused (exit $rc)" || fail "production env + MAIL_SINK_DIR: exit $rc (expected a refusal)"
grep -q "AuthConfigError.*MAIL_SINK_DIR is set on a production server" "$WORK/prod-sink.log" && pass "the refusal is AuthConfigError naming MAIL_SINK_DIR" || fail "the refusal does not name MAIL_SINK_DIR"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$B_NEW/health")" = "000" ] && pass "nothing answers on $B_NEW after the refusal" || fail "something answers on $B_NEW"
[ "$(sha256sum "$DB" | cut -d' ' -f1)" = "$sum7" ] && pass "the refused boot left the database byte-identical" || fail "the refused boot wrote to the database"
# Then as docker-compose really runs it: no sink, no smtp_* key → `Mail: off`.
if start_backend "$REPO/backend" $B_NEW "$DB" "$WORK/prod.log" APP_ENV=production TRUSTED_PROXY_HOPS=1; then
  boot_lines "$WORK/prod.log"
  grep -q "Mail: off — recovery by email is disabled" "$WORK/prod.log" && pass "log: Mail: off — recovery by email is disabled (…)" || fail "log: no 'Mail: off' line"
  checks prod-guard --base "http://127.0.0.1:$B_NEW"
  stop "$SRV_PID"
else fail "the production environment refused to boot"; fi

say "8  timing, and the snapshot"
checks hash-timing --backend "$REPO/backend"
[ "$(sha256sum "$SNAP/data/app.db" | cut -d' ' -f1)" = "$SNAP_SUM_BEFORE" ] && pass "snapshot app.db unchanged (sha256)" || fail "snapshot app.db changed"
n="$(find "$SNAP" -newer "$WORK/stamp" | wc -l)"
[ "$n" = "0" ] && pass "nothing under the snapshot is newer than the run's start ($n files)" || fail "$n files under the snapshot changed"
checks logs --mail "$MAIL"
n="$(grep -r "Mail: SMTP" "$WORK" 2>/dev/null | wc -l)"
[ "$n" = "0" ] && pass "grep -r 'Mail: SMTP' \$WORK → $n: no stack in this run ever had SMTP" || fail "grep -r 'Mail: SMTP' \$WORK → $n"
info "mail sink: $(ls "$MAIL" | wc -l) messages written, none delivered"

say "RESULT: $([ $FAILS -eq 0 ] && echo "ALL PASSED" || echo "$FAILS step(s) FAILED") — snapshot $(basename "$SNAP"), rollback $ROLLBACK_SHA, tree $(git -C "$REPO" rev-parse --short HEAD)"
[ $FAILS -eq 0 ]
