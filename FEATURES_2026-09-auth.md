# Features 2026-09 — Auth: the app behind a login, a session in a row, passkeys, invites, and the ground for groups

> Branch `feature/2026-09-auth` off `main` (baseline **`cfc1669`**). Written 2026-09-23 in a
> read-only planning session — **no check was run**. Baselines to re-read from `AGENTS.md` §11 at
> the merge; counted (by `grep`, not by running) at `cfc1669`: **303 backend tests in 47 files**,
> **≈839 frontend tests in 89 files** (`grep -c "^\s*\(it\|test\)("`). `AGENTS.md` §11's last
> *run* numbers are 273 / 735 at the badges head; the guestbook, media and composer batches since
> then are the difference.
> Symbol names are the source of truth; line numbers reference `cfc1669`.
> Read `AGENTS.md` first (§5 persistence — **new tables, columns only through `_RUNTIME_COLUMNS`,
> old code must boot**; §6 the API/realtime contract and the cache-policy table; §7 deployment;
> §9 conventions; §10 gotchas — A9's "an id is handed out again" and the PWA cookie-jar facts
> below), then `DESIGN.md` (§2 tokens, §3 surfaces, §5b words, §6 section heads, §7 `Modal` /
> `ConfirmDialog` / `ListRow` / `Input` / `Button`, §9b forms, §10 navigation), then this file end
> to end. Then `/home/roli/projects/racer/DECISIONS.md` lines 5330–5730 (WP30: sessions, cookies,
> rpID, bypass, enumeration, threat model, the software authenticator, the iOS cookie jar) — the
> **decisions** transfer; the code does not (that server is TypeScript, this one is Python).
> This batch **touches the backend, the schema (ten new tables, four nullable columns), two new
> backend dependencies, one new frontend dependency, `docker-compose.yml` and `vite.config.ts`**.
> It is the **full** deploy, and it is the deploy that can lock Roli out of his own app — §"Deployment"
> is written for that and has an escape hatch that was measured, not asserted.
> **Not deployed** at the end of the batch — Roli tests first, on his phone, from a clean install.
>
> Task IDs `L0`–`L15`. `A C D DS F G K M N P Q R S T U W` are taken
> (`grep -rhoE '^## [A-Z]+[0-9]+' *.md` at `cfc1669` lists exactly those); `L` is free.

## Why this batch exists

Roli wants the app closed: no page, no picture, no stat readable without a login; the login
replaced by something that can be revoked; passkeys so a phone opens it with Face ID; new people
let in by a code he hands out; an admin page that shows who is in and from which device; and the
URL, the tables and the roles shaped so that a second friend group can be added later without
moving anything.

Four facts about the code shape the whole plan:

1. **Today "reader" means "no token", and 43 of 113 routes answer a stranger.** The route
   enumeration at `cfc1669` (`app.routes`, method × path, `/health` included) is **113** HTTP routes
   plus three websocket endpoints — not 103 — and 43 of them carry no auth dependency at all;
   eleven more take `decode_token` (a token *if present*). Adding a dependency to 54 routes by hand
   is exactly the kind of list that is one route short a week later, so the gate is a
   **middleware that denies by default** and a **test that walks `app.routes`** and asserts every
   one is either on the allow-list or answers 401 to nobody. The routes themselves keep their
   `Depends(require_editor_claims)` shape; what changes is where the claims come from.
2. **The token lives in `localStorage` and rides in a header, and that is why `<img>` cannot be
   gated.** `api/client.ts::apiFetch` sets `Authorization: Bearer` (`:47`), `mediaUrl` builds a bare
   URL (`:74`), and `sw.js` says in its own comment that it "cannot PUT the new endpoint itself:
   auth is a bearer token in `localStorage`". A cookie is what a browser attaches to a picture, a
   websocket upgrade and a service-worker fetch without being asked, so the credential moves into an
   `HttpOnly` cookie and the token argument disappears from **150 lines across twelve `*.api.ts`
   modules** and the ≈619 places that thread it through hooks and pages. That sweep is mechanical,
   and it is the one place this plan spends a cheaper model's whole day.
3. **Dev is cross-origin and production is not.** `frontend/.env.local` points the phone at
   `http://192.168.178.78:8001` while production sits behind Caddy at `/api`; a cookie set by
   `:8001` is invisible to a page on `:8000`. So the very first task makes dev same-origin —
   vite proxies `/api` and `/ws` — and CORS goes away with it. Nothing else in the batch can be
   tried on Roli's phone before that.
4. **Nothing in the schema knows what a group is**, and one thing knows what a cup is: a JSON file
   read at boot. Part 2 (real multiple groups) needs a `group_id` on tournaments, friendlies, ideas
   and star ratings, a membership table, cups in the database and the group's slug in the URL.
   Part 1 lays every one of those with a single row, `altherren`, so that part 2 is a filter and
   not a migration — and, for the URL, it does so with react-router's `basename`, so that not one
   of the **737 literal route strings in 88 frontend files** has to change.

## Roli's answers, 2026-09-23 — these supersede anything below that disagrees

Read this section first. The rest of the file was written before Roli answered the plan's five
questions; where a later sentence contradicts this section, **this section wins**.

1. **One deploy, not two.** Roli, verbatim: *"one deploy, why would i want 2?"* So:
   - **L14 is dropped.** L15 is the single documentation pass and covers everything L14 would
     have (the gate, sessions, registration, admin, groups skeleton) **and** passkeys, and it writes
     `AGENTS.md` §7 for one deploy.
   - Wherever this file says **deploy A** or **deploy B**, read **the deploy**. Nothing waits for a
     first deploy; L8 and L9 are part of the same branch head that ships.
   - "After deploy B has been proven" (e.g. removing `player_accounts[]` from `secrets.json`) now
     means **after the deploy has been proven on Roli's phone** — still a later, separate step.
   - The escape hatch is unchanged: `secrets.json` is not edited by the deploy, and
     `git checkout ce55a53 && docker compose up -d --build` restores the old login. **(L13: the
     target is `ce55a53`, not `cfc1669`** — production runs `ce55a53`, i.e. `cfc1669` plus Roli's
     `deploy other sites`, which adds `import /etc/caddy/sites/*.caddy` to `deploy/Caddyfile` and a
     sites volume to `docker-compose.yml`; this repo's Caddy fronts his other apps on the same
     server, and a checkout of `cfc1669` would take them down with it.)
2. **The order** (it moves L8, and the reason is file ownership, not preference):

   **A** {L0 ∥ L1} → **L2** alone → **B** {L3 ∥ L4} → **C** {L5 ∥ L6 ∥ L7 ∥ L10 ∥ L12} →
   **D** {L8 ∥ L11} → **L9** → **L13** → **L15** → *(the deploy, on Roli's go)*

   L8 shares `backend/app/routers/auth.py`, `backend/app/schemas/*.py` and
   `frontend/src/api/generated/schema.d.ts` with L3, and `backend/requirements.txt` with L1, so it
   cannot run beside either; group D is the first place its file set is disjoint from its
   neighbours (L11 touches `routers/players.py` and `services/groups.py`, not the auth router or the
   schemas — **if L11 finds it must touch a response model, it stops and reports**, because two
   workers regenerating `schema.d.ts` at once is the fight this plan exists to avoid). **L13 now
   rehearses the whole branch, passkeys included**, so it runs after L9.
3. **Hash eagerly at migration** — yes (the plan's disagreement 2 is accepted).
4. **The group's display name is `Altherren`**, slug `altherren`.
5. **The "secure your account" strip is non-dismissible** — confirmed, and it ships with passkeys
   (L9), as disagreement 8 proposed.
6. **`/api/health` answers 401 from outside** — accepted; Docker reaches it on loopback. The §7
   smoke line changes accordingly (L15).
7. **Where the work happens.** The batch runs in the git worktree
   **`/home/roli/projects/turnierplaner-auth`** (branch `feature/2026-09-auth`), with
   `frontend/node_modules` and `backend/.venv` symlinked from the main checkout. **Never touch the
   main checkout at `/home/roli/projects/turnierplaner-reloaded`** — it is on `main` and Roli's dev
   servers on 8000/8001 serve it to his phone. In particular **never edit its
   `frontend/.env.local`**: L0 *documents* the new relative content for when the batch lands, it
   does not apply it to his running setup. Dependency installs (`pip install -r
   backend/requirements.txt`, `npm install` for L9) go through the symlinks into the shared
   environments; that is additive and expected — say so in your Deviations when you do it.

---

## Decisions (Roli, 2026-09-23 — do not relitigate)

- **Scope.** Part 1: close public reads, replace auth, add passkeys, add registration by invite,
  add an admin page, **prepare** multi-group without building it. Part 2 (real groups) is later,
  and nothing here may make it harder.
- **Sessions are rows, not JWTs** — chosen for revocation. Rolling **90 days** (each request
  extends it). Cookie `HttpOnly`, `SameSite=Lax`, `Secure` **conditionally** — on over HTTPS, off
  otherwise, so `http://192.168.178.78` on the phone keeps working. Token stored **sha256-hashed**.
  `last_seen` is **not** written on every request — only when more than a few minutes stale.
- **Lax, not Strict**: a shared link must not show a login to someone already logged in. Lax
  blocks cross-site writes, which is the CSRF defence; **GETs stay side-effect free** (they are
  today: every GET in the enumeration is a read).
- **Media** authenticate with the same cookie. **Vite proxies `/api` and `/ws` in dev** so dev is
  same-origin like production; `frontend/.env.local` becomes relative; Roli's phone reaches the
  API through vite. CORS disappears. `mediaUrl()` and the `?w=` ladder keep working **unchanged** —
  no URL churn, the immutable caching survives.
- **The gate is a global default-deny with a short allow-list**: `/auth/*` (login, register,
  redeem, reset, passkey sign-in), the static app shell (nginx's, not ours), and `/health` —
  **restricted to loopback**, because Docker's healthcheck calls it with no credentials from inside
  the container and a 401 would mark the container unhealthy and restart it.
- **The `reader` role is removed.** Every route gets a real requirement. `ws_require_auth` is
  gone (always on) and the websocket handshake authenticates by cookie.
- **Authorization is server-side, always.** The frontend's role only hides controls and may be
  tampered with freely. "View as lower role" and "act as player" stay as cosmetic conveniences.
- **Passwords: Argon2id via `argon2-cffi`** — a new backend dependency, named here so `AGENTS.md`
  §9's rule is met. **Salting is a named requirement**: a fresh cryptographically-random salt per
  password, generated by the library, never shared, never derived from the username, stored inside
  the hash string. Minimum length **10**, no composition rules. `player_accounts[]` is **migrated
  once** into real rows and never used for authentication again. **Nobody is logged out by any of
  this.**
- **Passkeys (WebAuthn), in this batch, with `py_webauthn`.** rpID **pinned** in production and
  derived from the request's **`Origin`** only under an explicit dev flag (`Origin`, never `Host`
  — vite rewrites `Host`). A **boot-time guard that throws** when a dev flag meets production
  configuration. Server-minted, **single-use** challenges, deleted before verification. **No
  account enumeration**: sign-in asks for no identifier and sends no `allowCredentials`.
  Revocation **by ownership** — list the caller's own rows and look for the id. Removing a passkey
  ends **every** session of that member. **No `AUTH_BYPASS` flag at all.** The rule is **"always
  retain at least one way in"** — passkey *or* password — because passwords are staying.
  Real ceremonies are exercised locally with Chrome's virtual authenticator over
  `http://localhost` (a secure context); **Face ID / iCloud Keychain is production-only** (the
  phone is plain HTTP on the LAN and a cloudflared tunnel was declined).
- **Registration by invite.** A **Register** button on the login screen. Codes are created by an
  admin/owner in the admin panel, **single use**, live **one hour**, **carry their group**, and
  redeeming one registers the account *and* joins the group in one step; an existing account can
  redeem one from inside the app to join another group. A code grants **membership, not
  ownership**. Codes are **short and human-typable** — ~8 characters, unambiguous alphabet (no
  `O`/`0`, `I`/`1`), shown `ABCD-EFGH`; **the defence is a globally rate-limited redeem endpoint**,
  app-wide and not only per-IP. **Reset links stay long.**
- **Rate limiting** on login and redeem: **per account and per IP, plus a global cap**; slowdown,
  never lockout. The app is behind Caddy: the client IP comes from `X-Forwarded-For` and must be
  read correctly or everyone shares one bucket.
- **Recovery is an admin-issued reset link**, one hour, single use, delivered however Roli likes
  (WhatsApp). **No recovery codes. No email in this batch**, and nothing may make email harder
  to add later.
- **The banner.** An account with a migrated password and **no passkey** sees "secure your
  account"; it stops when they have a passkey. Adding a passkey is authorised by being logged in.
- **The admin page is a new page**, not a tab on Players admin: who is logged in → their
  devices/sessions (created, last seen, device), revoke one or all; who is still on a migrated
  password; create invite codes; create reset links.
- **Identity is one entity.** Registering creates a player with no memberships — invisible to
  every roster, stat and picker until invited. Display names are the login identifier, **unique
  app-wide, case-insensitive**, original casing preserved ("Flo" displays, "flo" logs in).
- **Groups — prepared, not built.** A `Group` table with one row, slug **`altherren`**;
  `group_id` where part 2 will need it; **`/g/altherren/…` in the URL from day one**. Roles:
  **site admin › group owner (several; owners promote members) › member (= today's editor)**.
  Per group: tournaments, friendlies, cups, comments, ideas, stats. Shared: clubs, leagues,
  players, profiles, guestbook walls. Ideas per group, the site admin sees across. Stats per
  group. **A profile is openable only by someone who shares a group** (site admin excepted), an
  author from another group is **marked**, and that decision lives in **one place** —
  `frontend/src/ui/primitives/PlayerLink.tsx`, answered from the roster the client already holds;
  **the server enforces it independently.** Part 1 routes the three surfaces that reach a profile
  without a link through `PlayerLink`: `StandingsTable` (a `div role="button"`, forbidden by
  `DESIGN.md` §7), the stats player identity card, the Players admin row.
  Club **star ratings** get a per-group overlay on `ClubStarRating` (`group_id`, null = global;
  the as-of resolver prefers the group's row), an admin promotes a rating to global
  **forward-only**. Club name, crest, league and existence stay global and admin-only. **Cups move
  from `cups.json` into the database** (creation UI later). Push notifications name the group
  **only when the recipient is in several**.
- **Screens.** The login screen follows the design canon — surfaces, tokens, both themes, 390px
  and desktop — and may show the logo (`frontend/public/icon-512.png`). A "you're not in a group
  yet" screen exists for an account with no membership.
- **Offline.** The PWA shows cached data with the existing connection marker when the server is
  unreachable; the login screen appears **only** when the server is reachable and rejects the
  session.
- **Push.** With a cookie `sw.js` can register a new subscription itself; close that gap.
  Notifications open the installed PWA — **confirm on the phone**, do not assume.
- **Constraints.** Never read or print `backend/secrets.json`. Never bind 8000 / 8001 / 8010 /
  5173. Never run destructive commands against `backend/app.db`, `backend/data/app.db` or
  `backend/data/uploads` — copies **outside the repo**. Never write into `backup/`. Kill only PIDs
  you started, by exact PID, never a pattern-matching `pkill`.

## Where this plan disagrees with the brief, and what it does about it

Roli asked to hear it now. Each of these is a decision this plan makes; one line from him reverses
any of them before the task that owns it starts.

1. **Passkeys and the gate should not ship in the same deploy — and the plan is ordered so they
   need not.** They *can* live in one batch and one branch, but the gate deploy is the one that
   changes how every person logs in, and the passkey half contains the one thing nobody here can
   test (iOS / iCloud Keychain / the home-screen app's separate cookie jar, all production-only).
   Landing both on the same night means the first Face ID failure is indistinguishable from a
   session bug. So the passkey tasks (**L8**, **L9**) are the **last two implementation tasks on
   the branch**, after the dress rehearsal and the first documentation pass, and the plan's
   deployment section is written as **two deploys**: A (everything else) and B (passkeys) a week
   later, merged as `git merge <sha of L14>` then the branch head. Roli may collapse them into one
   deploy by merging the head straight away; the ordering costs nothing if he does.
2. **The Argon2 hash is written at migration, not "at the first successful login".** The plaintext
   is in `secrets.json` on the very boot that migrates; waiting for a login only adds a second
   password-checking code path (compare plaintext, then hash) that exists to be deleted. Eager
   hashing means `player_accounts[]` is read by exactly one function, once, and the login code
   knows one verifier. **Nobody is logged out** either way — that promise is kept by **L2's
   `POST /auth/exchange`** (the old JWT buys one cookie session, one release long), not by the
   plaintext surviving.
3. **`Secure` is decided by the configured auth origin, not by sniffing the request.** "On when
   the request is HTTPS" is the intent; reading `X-Forwarded-Proto` per request makes the cookie's
   flag depend on a proxy header being present and trusted. In pinned mode (production) the
   origin is `https://lorbeerkranz.xyz`, so `Secure` is simply always on; in dev-origin mode it
   follows the request's own `Origin` scheme — which is the request being HTTPS. Same behaviour,
   one fewer moving part (racer's `cookiesNeedSecure`).
4. **The route count is 113, not 103** (method × path, `/health` included), plus three websocket
   endpoints. The number in the brief was a decorator count. It changes nothing except the gate
   test's expectations, which read `app.routes` rather than a number.
5. **No session-token rotation.** Racer rotates the cookie value every 24 h under a stable id with
   a 10-minute grace, and its own DECISIONS record a bug that design produced (a retired token
   kept itself alive by being used). The gain — capping the life of a token captured once — is
   real but small behind `HttpOnly` + TLS + per-device revocation, and every added state is a
   way to log someone out by mistake. Deferred, listed at the end.
6. **`/health` from outside is a 401, and the smoke check in `AGENTS.md` §7 changes.**
   `curl https://lorbeerkranz.xyz/api/health` was the smoke line; it now answers 401 by design.
   The new smoke is `curl -sI https://lorbeerkranz.xyz/api/tournaments` → **401** (the gate is up)
   and `docker compose ps` → backend **healthy** (the loopback carve-out works). L14 rewrites §7.
7. **The club-stars overlay is the first thing to cut if the batch runs long.** It is the one
   "prepared" item that is really *building* (a resolver rule, a write path, an endpoint, a
   control). It is in (L12) because it was decided, and it is last in its group and cuttable
   without touching anything else.
8. **The banner ships with the passkeys, not before them.** A "secure your account — add a
   passkey" strip that appears a week before passkeys exist nags for something nobody can do. L9
   owns it.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code
   style (thin routers, bodies in `services/`, error helpers from `api_utils.py`; Tailwind +
   design tokens, `qk` query-key factory, generated API types, lucide-react with an explicit
   `size`).
2. Work on branch `feature/2026-09-auth`. **Never switch branches, never touch `main`, never
   push.** One or more commits per task, message prefixed with the task ID (`feat(L2): …`,
   `test(L3): …`, `docs(L14): …`).
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never
   `git commit -a`. A new file: `git add --intent-to-add <path>` first, then `commit -o`. Each
   task lists its file set; if you need a file outside it, stop and report. `AGENTS.md`,
   `DESIGN.md` and `README.md` are edited by **L14 and L15 only**: write the canon line your
   task changes under "Canon" in your task section and leave the files alone.
4. **Verify first.** Every task names the check that proves the gap still exists. Run it before
   changing anything; if the gap is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing. Backend touched → `make test` + `make lint`.
   **Response model touched → `make gen-types`, and `frontend/src/api/generated/schema.d.ts` goes
   in the same commit** (L2, L3, L8 run it; **nobody else in a parallel group touches a response
   model**). Frontend touched → `cd frontend && npm run check` (+ `npm run build` where the task
   says). Baselines: `AGENTS.md` §11 after the merge.
6. UI must work at ~390px and ≥1024px, verified in a real browser (Playwright 1.63 is installed
   under `frontend/node_modules`, Chromium 1243 under `~/.cache/ms-playwright`) against the
   isolated stack below, in **both** the `blue` and the `light` theme. Measure, do not eyeball.
7. Never read or print `backend/secrets.json`. Never run destructive commands on `backend/app.db`,
   `backend/data/app.db` or `backend/data/uploads` — copy first, **outside the repo**. Never write
   into `backup/`. **Never bind 8000 / 8001 / 8010 / 5173 — Roli's dev servers are live there and
   his phone is on 8000.** Kill only the PIDs you started, by exact PID; never a pattern-matching
   `pkill`.
8. **One mechanism per job — reuse before you create.** A second place that reads the cookie, a
   second rate limiter, a second way to build an app path, a second answer to "may I open this
   profile" is a failed task even when both are correct and the tests are green. The shared things
   this batch depends on:

   | job | the one implementation | who builds it |
   |---|---|---|
   | same-origin dev (the phone reaches the API through vite) | `frontend/vite.config.ts` `server.proxy` for `/api` (prefix stripped, as Caddy does) and `/ws` (`ws: true`) | L0 |
   | the tables, the four columns, the boot migration | `app/models.py`, `app/db.py` (`_RUNTIME_COLUMNS`, `_RUNTIME_INDEXES`), `app/services/auth_migration.py::migrate_from_settings` | L1 |
   | reading `secrets.json`'s `player_accounts[]` | **only** `auth_migration.py` and `manage.py auth-preflight`; `auth.py` and `notifications.admin_player_ids` stop reading it | L1 (L2 deletes the readers) |
   | "is this server configured safely" | `app/settings.py::assert_auth_config_safe`, called by `create_app` before anything listens | L1 |
   | hashing and checking a password | `app/services/passwords.py::hash_password` / `verify_password` (argon2id, one `PasswordHasher` per settings profile) | L1 |
   | who the caller is | `app/auth_gate.py::AuthGate` (ASGI middleware) writes `scope["state"]["claims"]`; `app/auth.py::require_auth_claims` reads it. **Nothing else parses the cookie** | L2 |
   | which paths need no session / no membership | `auth_gate.py::PUBLIC_PATHS`, `ACCOUNT_PATHS`, `LOOPBACK_ONLY_PATHS` — three tuples, one file, walked by `tests/test_auth_gate.py` | L2 |
   | a session — mint, resolve, touch, list, revoke | `app/services/sessions.py` (`SESSION_COOKIE`, `SESSION_TTL`, `TOUCH_INTERVAL`, `set_session_cookie`, `clear_session_cookie`) | L2 |
   | the client's IP behind Caddy | `auth_gate.py::client_ip(scope, hops)` — rightmost `X-Forwarded-For` entry counted from the right, `TRUSTED_PROXY_HOPS` | L2 |
   | slowing an attacker down | `app/services/rate_limit.py::RateLimiter` + `LIMITS`; a 429 with `Retry-After` and body `{"retry_after": n}` | L2 |
   | the effective role | `app/services/groups.py::effective_role(account, memberships, group)` → `"admin" \| "owner" \| "editor" \| "none"`; `auth.py::ROLE_ORDER` | L2 |
   | the current group (part 1: the only one) | `app/services/groups.py::current_group(s)` — the one function part 2 will teach to read the URL | L2 |
   | an account's login surface (register, redeem, reset, password, sessions) | `app/routers/auth.py` (thin) over `services/accounts.py`, `services/invites.py`, `services/reset_links.py` | L3 |
   | the admin surface | `app/routers/admin.py` over the same services | L3 |
   | a device's name in a list | `app/services/device_label.py::device_label(user_agent)` — no dependency, six shapes | L3 |
   | the identity in the browser | `src/auth/AuthContext.ts` (`AuthStatus`, `Role` without `reader`) + `src/auth/AuthProvider.tsx` (boots from `/me`, caches `ea_fc_me`, clears **only** on a 401); `src/auth/RequireAuth.tsx` | L4 |
   | every API call | `api/client.ts::apiFetch` / `apiUpload` with **no `token` option**; same-origin cookies ride by default | L4 |
   | a per-caller query key | `qk.*(viewerId)` — the `token` argument becomes the viewer's `playerId` | L4 |
   | "the server rejected the session" | the `api:unauthorized` event, unchanged in name; `AuthProvider` answers it | L4 |
   | the login screen | `src/pages/auth/LoginPage.tsx` (moved from `src/pages/LoginPage.tsx`), rendered **without** `AppShell` | L4 |
   | a 429 in the UI | `src/pages/auth/RetryCountdown.tsx` — one component, used by login, register, reset, redeem | L4 builds, L5 uses |
   | register / reset / join | `src/pages/auth/RegisterPage.tsx`, `ResetPage.tsx`, `NoGroupPage.tsx`; `api/registration.api.ts` | L5 |
   | the admin page | `src/pages/admin/AdminPage.tsx` (+ `AccountsTab.tsx`, `InvitesTab.tsx`, `SessionsSheet.tsx`); `api/admin.api.ts` | L6 |
   | my sessions and my password | `src/pages/settings/SecuritySection.tsx`; `api/account.api.ts` | L7 |
   | a passkey ceremony, server side | `app/services/passkeys.py` over `webauthn` 2.7.1; `relying_party_for(request, settings)` is the **one** place rpID/origin are decided | L8 |
   | a passkey ceremony, browser side | `@simplewebauthn/browser` (`startRegistration`, `startAuthentication`), called from `api/passkeys.api.ts` only | L9 |
   | the "secure your account" strip | `src/ui/shell/SecureAccountNotice.tsx`, the `PushSetupNotice` shape | L9 |
   | the group segment in the URL | `src/app/basename.ts` (`APP_BASENAME`, `ORIGINAL_ENTRY_PATH`, the legacy redirect) + `<BrowserRouter basename>`; **no route string changes** | L10 |
   | a path the backend emits | `app/services/paths.py::group_path(rest, slug)` — every `path=` in the backend goes through it | L10 |
   | a backend path used in-app | `src/app/basename.ts::toRouterPath(absPath)` — strips the basename, or `location.assign`s another group's path | L10 |
   | "may I open this profile, and is this author foreign" | `src/ui/primitives/PlayerLink.tsx` via `src/hooks/useProfileAccess.ts`; server: `services/groups.py::ensure_shared_group` | L11 |
   | cups | `Cup` + `CupEra` rows, read by `app/cup_defs.py::load_cup_defs` (same signature, DB behind it); the JSON file is the **seed** | L12 |
   | a club's stars as of a date, per group | `services/club_stars.py::StarRatingResolver.as_of(club_id, on, group_id)` | L12 |
   | the boot migration proven against a copy of production | `manage.py auth-preflight` (dry run) + the L13 rehearsal script | L1 builds, L13 runs |

   If your task genuinely needs something new and shared, put it where the existing family lives
   and say so in **Deviations** in your first sentence.
9. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the
   task did not say, what you measured, what you left). Include that edit in your commit. If
   blocked or the code does not match this spec, stop, note it here, commit nothing broken.

### Model policy

Roli's standing policy (`AGENTS.md` §9): high-effort models for analysis, planning, review and
verification; cheaper models for mechanical implementation; never Haiku; minimise switches. He
added, verbatim, *"you dont have to save tokens too much, but only use fable when you think it
really makes a difference."* So the default for implementation is **Opus** (the current one), and
**Fable is reserved for three tasks** where a miss is silent or a mistake locks him out:

- **L2** — the gate, the sessions, the cookie, the audit test. A route left open is a silent leak;
  a session bug is the lock-out. The audit test is only worth what its author's suspicion is worth.
- **L4** — the frontend half of the switch. The mechanics are a sweep, but the semantics are the A9
  class (when does the app decide it is logged out) and the offline rule, and a wrong answer there
  is "the PWA silently became a login screen on flaky wifi".
- **L8** — the WebAuthn ceremonies and the software authenticator that proves the negative cases.
  Racer's own words: code whose failure mode is "accepts something it should not", which does not
  throw and does not show in a green run written by the same person.

Everything else is careful, ordinary work with an exact spec: Opus. The one-line reason per task is
in the overview table.

### Runtime verification (isolated stack)

**Every task has its own ports and its own database copy.** Earlier batches used 8031–8064,
8071–8085, 8091–8098, 8111–8118, 8121–8124, 8141–8144, 8151–8154, 8171–8174 and 8213–8214. This one
takes **8231–8246 (backend) / 8251–8266 (vite)**: no plan file mentions any of them
(`grep -rhoE '\b8[0-9]{3}\b' *.md` at `cfc1669` has nothing between 8214 and 8443) and nothing on
this machine is listening on them (`ss -ltn` on 2026-09-23: 22, 2019, 8000, 8001, 8010, 8080,
8093, 8172, 8182, 8443, 8444, 8787, 8790).

| task | backend | vite | db copy |
|---|---|---|---|
| L0 | 8231 | 8251 | `verify-l0.db` |
| L1 | 8232 | 8252 | `verify-l1.db` |
| L2 | 8233 | 8253 | `verify-l2.db` |
| L3 | 8234 | 8254 | `verify-l3.db` |
| L4 | 8235 | 8255 | `verify-l4.db` |
| L5 | 8236 | 8256 | `verify-l5.db` |
| L6 | 8237 | 8257 | `verify-l6.db` |
| L7 | 8238 | 8258 | `verify-l7.db` |
| L8 | 8239 | 8259 | `verify-l8.db` |
| L9 | 8240 | 8260 | `verify-l9.db` |
| L10 | 8241 | 8261 | `verify-l10.db` |
| L11 | 8242 | 8262 | `verify-l11.db` |
| L12 | 8243 | 8263 | `verify-l12.db` |
| L13 | 8244 | 8264 | `verify-l13.db` (a copy of the **latest deploy snapshot**, see the task) |
| L14 | 8245 | 8265 | `verify-l14.db` |
| L15 | 8246 | 8266 | `verify-l15.db` |

**The stack is one origin from L0 on**: the browser and every curl go to the **vite** port, which
proxies `/api` and `/ws` to the backend port. The database copy and the uploads copy live
**outside the repo** (`mktemp -d`), never under `backend/`, never `backend/app.db`.

```bash
# <B>, <V> from your row above. Run from the repo root.
WORK=$(mktemp -d)                                   # outside the repo
cp backend/app.db "$WORK/verify.db"
rsync -a backend/data/uploads/ "$WORK/uploads/"

# A throwaway secrets file OUTSIDE the repo (Rule 7). Until L1 lands this is the old shape;
# from L1 on `player_accounts` is what the boot MIGRATES (one Argon2 row each, site admin from
# `admin`), and `auth_dev_origin` is what lets `http://localhost:<V>` be the relying party.
cat > "$WORK/secrets.json" <<JSON
{ "db_url": "sqlite:///$WORK/verify.db",
  "player_accounts": [ { "name": "Roli",  "password": "verify-only", "admin": true },
                       { "name": "Berni", "password": "verify-only", "admin": false },
                       { "name": "Flo",   "password": "verify-only", "admin": false } ],
  "jwt_secret": "verify-only",
  "auth_dev_origin": true,
  "log_level": "INFO" }
JSON

cd backend && UPLOADS_DIR="$WORK/uploads" APP_ENV=development AUTH_DEV_ORIGIN=1 \
  .venv/bin/python run.py --host 127.0.0.1 --port <B> --secrets "$WORK/secrets.json" \
  --db-url "sqlite:///$WORK/verify.db" &
cd frontend && BACKEND_ORIGIN=http://127.0.0.1:<B> VITE_API_BASE_URL=/api VITE_WS_BASE_URL= \
  npx vite --port <V> --strictPort --host 127.0.0.1 &

# log in with curl (from L2 on; the cookie jar is the session):
curl -s -c "$WORK/jar" -X POST http://127.0.0.1:<V>/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"Roli","password":"verify-only"}'
curl -s -b "$WORK/jar" http://127.0.0.1:<V>/api/me | jq .
# browser: open http://localhost:<V>/ and log in through the screen. `localhost` (not
# 127.0.0.1) is what makes it a secure context for WebAuthn (L8/L9).
#   localStorage theme = "blue" | "light"
```
Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5, Mike=6. **Push cannot be delivered over
the wire on this machine** (no VAPID; every push assertion stops at the queued `PushMessage`, the
`_Recorder` in `tests/test_ideas.py`). On first boot against the copied DB from L1 on expect the
log lines `Auth migrated: 3 accounts, 1 group, 6 memberships` and (L12 on) `Cups imported: 2`.
`rm -rf "$WORK"` when done; kill only the PIDs you started.

**Playwright note (L8/L9):** the virtual authenticator is a CDP session on the page —
```js
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true,
             hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
```
against `http://localhost:<V>`. It proves the ceremony end to end in Chromium; it proves nothing
about Safari, iCloud Keychain or Face ID — those are the phone's, after deploy B.

---

## Decided by this plan — the answers

**1. The schema: ten new tables, four nullable columns, two runtime indexes, one boot migration.**
Rule 1 of `AGENTS.md` §5 (new tables) everywhere a relation is new; rule 2 (a nullable column
through `_RUNTIME_COLUMNS`) exactly where the brief said "`group_id` where part 2 will need it",
because a link table per entity for a plain owner FK would be four tables to join on every list.

| table | columns | why this shape |
|---|---|---|
| `Group` | `id`, `slug` (unique idx), `name`, `created_at` | one row, `altherren`, seeded at boot |
| `GroupMembership` | `group_id` PK FK, `player_id` PK FK, `role` (`owner` \| `member`), `created_at` | the roster; every existing player becomes a member of `altherren`, every migrated admin an owner |
| `Account` | `player_id` PK FK `player.id`, `name_key` (unique idx — the casefolded display name), `password_hash` (nullable), `password_origin` (`none` \| `migrated` \| `set`), `password_updated_at`, `site_admin` bool, `webauthn_user_handle` (32 random bytes, base64url, unique), `created_at`, `updated_at` | a player who can log in. `name_key` is where "unique app-wide, case-insensitive" lives — SQLite's `UNIQUE` on `display_name` is case-sensitive and cannot be re-collated without rebuilding the table |
| `AuthSession` | `id`, `player_id` FK idx, `token_hash` (unique idx, sha256 hex), `kind` (`password` \| `passkey` \| `register` \| `reset` \| `exchange`), `user_agent`, `device_label`, `ip`, `created_at`, `last_seen_at` idx, `expires_at` idx | one row per logged-in device; **revocation is `DELETE`** |
| `Passkey` | `id`, `player_id` FK idx, `credential_id` (base64url, unique idx), `public_key` (base64url), `sign_count` int, `transports` (JSON text), `aaguid`, `device_type`, `backed_up` bool, `label`, `created_at`, `last_used_at` | L8 |
| `WebAuthnChallenge` | `id`, `challenge` (base64url, unique idx), `kind` (`register` \| `login`), `player_id` (nullable — login mints without one), `expires_at` idx, `created_at` | single use: **consumed by `DELETE` before verification** (racer: "a replayed challenge fails by simply not existing") |
| `InviteCode` | `id`, `code_hash` (unique idx), `group_id` FK, `created_by` FK, `note`, `created_at`, `expires_at` idx, `redeemed_by` (nullable FK), `redeemed_at` | the code is shown **once** at creation; the row holds its sha256 |
| `PasswordResetToken` | `id`, `player_id` FK idx, `token_hash` (unique idx), `created_by` FK, `created_at`, `expires_at` idx, `used_at` | long random token, in the URL **fragment** |
| `Cup` | `id`, `group_id` FK idx, `key`, `name`, `since_date` (nullable), `sort_order`; `UniqueConstraint(group_id, key)` | L12: `cups.json` becomes the seed |
| `CupEra` | `id`, `cup_id` FK idx, `since` date, `mode`; `UniqueConstraint(cup_id, since)` | L12 |

`_RUNTIME_COLUMNS` gains `("tournament", "group_id", "INTEGER")`, `("friendlymatch", "group_id",
"INTEGER")`, `("featurerequest", "group_id", "INTEGER")`, `("clubstarrating", "group_id",
"INTEGER")` — nullable, no default, and the models carry `group_id: Optional[int] =
Field(default=None, foreign_key="group.id", index=True)` so a fresh database gets the same column
from `create_all`. A new `_RUNTIME_INDEXES` tuple (`CREATE INDEX IF NOT EXISTS ix_<table>_group_id`)
gives a migrated database the index `create_all` would have made. **The backfill writes NULL rows
only** (`UPDATE … SET group_id = :g WHERE group_id IS NULL`), which is rule 3's letter.
`RecordHolder` / `RecordKeyState` get **no** `group_id` now: their key is the primary key and
cannot be widened by `ALTER`; they are a cache and part 2 recreates them (listed under Deferred).

**Old code boots against all of it** because it reads none of the new tables and ignores the
four columns; the two measured consequences of a rollback are (a) a session, passkey, invite or
account written under new code is inert — nobody can use it, nobody is harmed by it — and (b) a
tournament created under old code has `group_id NULL` until the next new-code boot backfills it.
L1 measures this the K1/M2/W1 way (`git archive cfc1669`, boot against a database the new code
wrote, `GET /tournaments` 200, `POST /auth/login` with the JWT flow 200) and L13 measures it again
against a copy of production.

**2. The boot migration (`services/auth_migration.py::migrate_from_settings`)**, run from
`init_db()` after `create_all` and the runtime columns, idempotent, logging one line:
1. `Group(slug="altherren", name="Altherren")` if no group exists.
2. Every `Player` without a membership → `GroupMembership(altherren, member)`.
3. Every `player_accounts[]` entry whose name matches a `Player` case-insensitively (exactly
   `auth._normalize_name`'s rule — `casefold` of the stripped name) and has no `Account` →
   `Account(name_key, password_hash=argon2id(password), password_origin="migrated",
   site_admin=admin)`, a fresh `webauthn_user_handle`, and, if `admin`, the membership row is
   promoted to `owner`. An entry with no matching player is **logged and skipped**, never
   created (a typo in `secrets.json` must not mint a phantom player).
4. Every `Player` without an `Account` gets one with `password_hash=None`,
   `password_origin="none"` — so `name_key` is unique across **every** player from day one and
   registration cannot collide with Rumpi's name by a case trick. A player with no password and no
   passkey simply cannot log in until an admin issues a reset link, which is also how a player who
   never had a login gets one.
5. Backfill the four `group_id` columns.
6. Log `Auth migrated: N accounts, 1 group, M memberships` (only when something was written).

`manage.py auth-preflight` runs steps 1–5 **in a dry run against a copy** and prints what would
happen — accounts to create, names that match no player, case collisions between players (two
players whose names casefold equal: refuse, name them, stop) — and exits non-zero on any
problem. It is the command the deploy runs **before** `up -d --build`.

**3. The gate — a pure-ASGI middleware, default-deny, three tuples.** `app/auth_gate.py::AuthGate`
wraps the whole app (`app.add_middleware`, the outermost layer), for both `http` and `websocket`
scopes:
- Read `lk_session` from the `Cookie` header. If present: `sha256` → `AuthSession` by
  `token_hash`, `expires_at > now`. Load the `Account`, the memberships, the current group.
  Write `scope["state"]["claims"] = {player_id, player_name, role, site_admin, session_id,
  groups: [{id, slug, name, role}]}`.
- **Touch**: if `now − last_seen_at > TOUCH_INTERVAL (5 min)`: `last_seen_at = now`,
  `expires_at = now + SESSION_TTL (90 d)`, and the response carries `Set-Cookie` again with the
  **same value and a fresh `Max-Age`** (intercept `http.response.start`) — that is what makes a
  session an app opened once a month never loses. Otherwise no write.
- Decide by path, longest match first:
  - `LOOPBACK_ONLY_PATHS = ("/health", "/docs", "/openapi.json", "/docs/oauth2-redirect")` —
    allowed iff `scope["client"][0]` is `127.0.0.1` / `::1`, else **401**. Docker's healthcheck
    calls from inside the container; Caddy's forwarded request does not.
  - `PUBLIC_PATHS = ("/auth/login", "/auth/exchange", "/auth/register", "/auth/reset",
    "/auth/passkeys/login/options", "/auth/passkeys/login/verify")` — no session needed.
  - `ACCOUNT_PATHS = ("/auth/", "/me", "/me/notifications", "/push/")` — a session, **no
    membership** needed (logout, my sessions, my password, my passkeys, redeem a code, this
    device's push).
  - **Everything else** — a session **and** a membership in the current group, else **401** (no
    session) / **403** (no membership). Unknown paths included: a stranger cannot tell a route
    from a 404.
- Websocket scopes: same decision; a refusal sends `websocket.close` (code 1008) before any
  accept, which the client sees as a failed handshake. The three endpoints in `main.py` keep a
  one-line `if not ws.scope["state"].get("claims"): close` as defence in depth and lose
  `_ws_token_from_request` / `_ws_authorized` / `ws_require_auth`.
- `require_auth_claims(request)` returns `request.state.claims` or raises 401 (unreachable behind
  the gate except on a public path — where it is the right answer). `decode_token` is
  **deleted**; its eleven consumers take `require_auth_claims`. `ROLE_ORDER = {"none": 0,
  "editor": 1, "owner": 2, "admin": 3}`; `require_editor` (≥1), `require_owner` (≥2, new),
  `require_admin` (≥3 — **site admin, exactly today's meaning**; no admin route becomes an owner
  route in part 1). `require_editor_claims` / `require_owner_claims` likewise.
- **The proof** (`tests/test_auth_gate.py::test_every_route_is_gated_or_listed`): for every
  `APIRoute` in `app.routes` × its methods, with `{param}`s filled as `1`, an anonymous client
  gets **401** unless the path is in `PUBLIC_PATHS` (any status but 401) or `LOOPBACK_ONLY_PATHS`
  (401 from `testclient`, 200 through a `LoopbackScope` ASGI shim that rewrites `scope["client"]`
  to `("127.0.0.1", 0)`); a session **without membership** gets **403** everywhere except
  `PUBLIC_PATHS` + `ACCOUNT_PATHS`; the three websocket paths refuse an anonymous
  `websocket_connect`. The test also asserts the three tuples contain **only** paths that exist.
  A route added later is gated by construction and *listed* only by editing a tuple the test
  walks — that is the "audited exactly once" property.

**4. Sessions and the cookie.** `SESSION_COOKIE = "lk_session"`; value = 32 random bytes
(`secrets.token_urlsafe(32)`); row stores `sha256`; attributes `Path=/; HttpOnly; SameSite=Lax;
Max-Age=7776000` + `Secure` iff the auth origin is `https` (pinned mode) or the request's
`Origin` is `https` (dev-origin mode). Login, register, reset, passkey sign-in and exchange all
mint through **one** `create_session(s, player, *, kind, user_agent, ip)` and set the cookie
through **one** `set_session_cookie(response, token, secure)`. Logout deletes the row and sends
`Max-Age=0`. **No fixation is possible**: no cookie is ever set before an identity is proven.
`GET /auth/sessions` lists **the caller's** rows (`id`, `kind`, `device_label`, `created_at`,
`last_seen_at`, `current: bool`); `DELETE /auth/sessions/{id}` finds the id **in that list** and
404s otherwise; `POST /auth/sessions/revoke-others` deletes every row of the caller but the
current. Admin variants take a `player_id` and the same service functions.

**5. Passwords.** `argon2-cffi==25.1.0` (`argon2_cffi_bindings` ships `manylinux_2_28_aarch64`
and x86-64 wheels — checked with `pip download --only-binary=:all:` on this Pi). One
`PasswordHasher` per profile: `default` = the library's RFC 9106 parameters (`time_cost=3,
memory_cost=65536 KiB, parallelism=4`) — **measure it on the Pi and in the container in L1's DoD**
(expect 100–300 ms; over 500 ms, drop `memory_cost` to 32768 and say so); `test` =
`time_cost=1, memory_cost=8192, parallelism=1`, selected by `Settings.password_hash_profile`,
which the boot guard refuses in production. **The salt is the library's**: `PasswordHasher.hash`
draws 16 random bytes per call and encodes them in the `$argon2id$…` string; the code never
passes a salt, never derives one, never stores one apart from the hash. `verify_password` is
`ph.verify` + `ph.check_needs_rehash` (a parameter change re-hashes on the next login).
**Pepper: not recommended, and not done.** A pepper helps only when the database leaks and the
secret file does not; here `app.db` and `secrets.json` are two files in the same bind-mounted
directory on the same host, read by the same process, backed up by the same rsync — one leaks,
both leak. What a pepper adds is a second secret whose *loss* fails every password at once,
silently, on the deploy this plan exists to make safe, and a rotation story nobody asked for.
Six friends with ≥10-character passwords under argon2id at 64 MiB are not the weak point.
Argon2's hash string is self-describing, so a pepper can be added later as a versioned prefix
without touching a stored row. Minimum length 10, no other rule, no maximum below 200.

**6. Nobody is logged out: `POST /auth/exchange`.** The JWT in `localStorage` is a valid
credential today; on the first boot after deploy A, `AuthProvider` finds `ea_fc_token`, sends it
as `Authorization: Bearer` to `/auth/exchange`, gets a cookie session (`kind="exchange"`) and
deletes the token. The endpoint verifies the JWT with `jwt_secret` exactly as `auth.py` does at
`cfc1669`, requires the `player_id` to have an `Account`, is rate-limited like login, and answers
**410** once `jwt_secret` is empty — which is how the transition ends: a later batch drops
`jwt_secret`, `PyJWT` and this endpoint together (Deferred). It is on `PUBLIC_PATHS`.

**7. Passkeys (L8/L9).** `webauthn==2.7.1` — **not 3.0.0 and not 2.8.0**, both of which require
`cryptography>=46` against this repo's `cryptography>=44,<46` pin (checked against the wheels'
metadata on 2026-09-23; 2.7.1 wants `cryptography>=44.0.2`, `pyOpenSSL>=25.0.0`, `cbor2>=5.6.5`,
`pyasn1>=0.6.2`; `pyOpenSSL==25.1.0` is the one that admits `cryptography<46`). Add
`webauthn==2.7.1` and `pyOpenSSL==25.1.0` to `requirements.txt`; L8 verifies the resolve in the
venv **and** in `docker compose build`. Relying party: `Settings.auth_origin`
(default `"https://lorbeerkranz.xyz"`, env `AUTH_ORIGIN`), `auth_rp_id` (`"lorbeerkranz.xyz"`),
`auth_rp_name` (`"Lorbeerkranz"`), `auth_dev_origin` (env `AUTH_DEV_ORIGIN`, default off) —
`relying_party_for(request, settings)` returns the pinned pair, refusing a request whose `Origin`
is present and different; in dev-origin mode it parses `Origin` and uses its hostname, `http`
allowed for `localhost` / `127.0.0.1` only (racer's rule, verbatim in meaning). Registration
options: `resident_key=REQUIRED`, `user_verification=REQUIRED`, `user_id=account.webauthn_user_
handle`, `exclude_credentials=` the player's existing ids. Sign-in options: **no
`allow_credentials`**, `user_verification=REQUIRED`; the verify step finds the `Passkey` by the
assertion's `rawId`, checks `sign_count` monotonic (a backwards counter is a clone → refuse), and
mints a session. Challenges: one row per `options` call, `expires_at = now + 5 min`, **deleted
before** `verify_*` is called, so a replay finds nothing. **One way in**: `DELETE
/auth/passkeys/{id}` answers 409 when it is the last passkey and `password_hash` is NULL;
`DELETE /auth/password` answers 409 when there is no passkey. Removing a passkey deletes **every**
`AuthSession` of that player (the caller's too; the UI says so in the `ConfirmDialog`). The
software authenticator for the tests is hand-rolled (`tests/soft_authenticator.py`, P-256 from
`cryptography`, CBOR from `cbor2`, which `webauthn` brings) rather than the `soft-webauthn` package
(it drags `fido2<2.0` in, and its flag bits are not under the test's control — the negative cases
are the point). Browser side: **`@simplewebauthn/browser@13`** as a frontend dependency — the
value is the accumulated browser quirks, and the first real device this code meets is Roli's
iPhone after deploy B.

**8. Invites, registration, reset.** Code alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 symbols,
8 characters → 2^40 ≈ 1.1×10¹²), displayed `ABCD-EFGH`, normalised on input (uppercase, strip
`-` and spaces), stored as sha256, shown once. `POST /auth/register {code, display_name,
password}`: rate-limited as *redeem*; code must exist, be unexpired, unredeemed; `display_name`
stripped, 2–40 chars, `name_key` unique against **every** `Account` (409 "That name is taken");
password ≥10; creates `Player` + `Account(password_origin="set")` + `GroupMembership(member)`,
marks the code redeemed (`redeemed_by`), mints a session. `POST /auth/redeem {code}` (session,
no membership needed): joins the code's group as a member, 409 if already a member. **Refusals
are one generic message** ("That code is not valid") — expired, spent and unknown are logged
server-side, never distinguished to the client (racer's enumeration rule). Reset:
`POST /admin/reset-links {player_id}` (site admin) mints 32 random bytes, stores sha256,
`expires_at = +1 h`, returns the URL **once**: `{auth_origin}/g/altherren/reset#<token>`. The page
reads `location.hash`, strips it with `history.replaceState` before any request, POSTs
`/auth/reset {token, password}` → sets the password (`password_origin="set"`), marks the token
used, **deletes every other session of that player**, mints a session. A `?token=` in the query
is accepted too and stripped the same way (chat clients mangle fragments).

**9. Rate limiting** — `services/rate_limit.py::RateLimiter` (in-process, sliding window, a
sweep every 1000 hits so the map cannot grow forever — racer's leak), keyed as below; over the
cap → **429** with `Retry-After` and `{"retry_after": n}`; **never** a lockout, never a row
written. Every 4xx from these endpoints is counted; a success clears the account key.

| endpoint | per account | per IP | global |
|---|---|---|---|
| `POST /auth/login`, `/auth/exchange` | 10 / 10 min (`name_key`) | 30 / 10 min | 150 / 10 min |
| `POST /auth/register`, `/auth/redeem` (redeem) | — | 10 / 60 min | 40 / 60 min |
| `POST /auth/reset` | — | 10 / 60 min | 40 / 60 min |
| `POST /auth/passkeys/login/*` | — | 30 / 10 min | 300 / 10 min |

The arithmetic for the short code: one live code, 40 guesses an hour across the whole internet,
2^40 candidates → P(hit within the code's hour) ≈ 3.6×10⁻¹¹. The IP: `client_ip(scope, hops)` —
`X-Forwarded-For` split on commas, the entry `hops` from the **right** (the one the outermost
trusted proxy wrote; everything left of it is client-supplied), falling back to the socket peer
when the chain is shorter than `hops`; `hops = Settings.trusted_proxy_hops` (env
`TRUSTED_PROXY_HOPS`; **`docker-compose.yml` sets 1** for Caddy; a loopback peer always counts as
one hop, so vite's proxy needs no setting). Reading the *first* entry is the bug racer found in
its own server; do not.

**10. Groups, roles, and the URL.** `services/groups.py::current_group(s)` returns the
`altherren` row — the one function part 2 rewrites to read the slug. `effective_role`: site
admin → `admin`; owner of the current group → `owner`; member → `editor`; else `none`. Every
**write** that creates a tournament, a friendly or an idea stamps `group_id =
current_group(s).id` (three call sites; a test asserts each new row has it); **reads stay
unfiltered** in part 1 (there is one group), and a `# part 2: filter by group` comment marks the
three list queries. `PUT /admin/groups/{slug}/members/{pid}/role {role: owner|member}` (owner+;
refuses to demote the last owner; a site admin may do anything). The roster `GET /players`
returns **members of the caller's groups** (part 1: of `altherren`) — which is what makes a
registered-but-uninvited account invisible to pickers and stats. **The URL prefix is
react-router's `basename`**, decided at boot in `src/app/basename.ts`: if `location.pathname`
starts with `/g/<slug>/` that is the basename; otherwise (`/`, or a pre-batch bookmark or push
like `/live/3?comment=9`) `history.replaceState` to `/g/altherren` + the same path, before the
router is created. `useLocation().pathname` is then **basename-relative**, so `routeHierarchy`,
`navConfig.match`, `lastLocation`, `navStack`, `useTabParam`, every `<Link to="/…">` and every
`navigate("/…")` are untouched. `site.webmanifest` keeps `start_url: "/"`, `scope: "/"`, `id: "/"`
— changing `id` would make iOS treat the install as a new app, and the redirect makes `/` land
right. Backend-emitted paths become absolute app paths through `paths.group_path`
(`/g/altherren/live/3?comment=9`); `sw.js` opens them as it does today; the bell and the badge
legend hand them to `toRouterPath`, which strips the current basename — or, when the slug is
another group's, does `location.assign` (part 2's group switch, for free).

**11. The identity in the browser** (`AuthProvider`): `status: "unknown" | "authed" |
"anonymous"`. Boot: read `ea_fc_me` (a cached `MeResponse`) → `authed` optimistically, then
`GET /me`; **only a 401 moves it to `anonymous`** (A9's rule kept: a failed request says nothing
about the session). No cache and the request fails without a status → stay `unknown` and render
`PageLoadingScreen` with the connection marker — that is the offline rule. `ea_fc_token` present
→ `/auth/exchange` first (§6). `api:unauthorized` (any 401 outside `/auth/`) → clear the cache,
`anonymous`, one toast, `RequireAuth` sends the reader to `/login` with `from`. `logout()` →
`POST /auth/logout {push_endpoint}` (the server disables that device's push subscription in the
same request, so no hook has to race the session's end) → clear → `/login`. The shell (`AppShell`,
its global websocket, its prefetches) mounts **only** when `authed` with a membership; `/login`,
`/register`, `/reset` render bare (logo, one card); `NoGroupPage` renders bare too, for `authed`
with `groups.length === 0`. `Role = "none" | "editor" | "owner" | "admin"`; `RequireRole`
keeps its shape with `minRole: "editor" | "owner" | "admin"`; "view as" cycles
`admin → owner → editor`.

**12. Tests.** The mechanics are decided by one measured fact: with httpx 0.27 / Starlette 0.41,
**an explicit `Cookie` header on a request overrides the `TestClient` jar** (measured 2026-09-23:
jar `lk_session=JAR`, request `headers={"Cookie": "lk_session=EXPLICIT"}` → the server sees
`EXPLICIT`). So `editor_headers` / `editor2_headers` / `admin_headers` become
`{"Cookie": f"{SESSION_COOKIE}={token}"}` and **all 446 calls that pass `headers=` stay
byte-identical**; the `client` fixture logs itself in as **Editor** (its jar carries the cookie),
so the **410 calls that pass no headers** — today's "public read" — become editor calls and stay
green wherever they asserted 200. What must be rewritten by hand: the **17 assertions of a 401
for a missing token** (`test_auth_me.py` 2, `test_grace_window.py` 5, `test_idea_comments.py` 3,
`test_ideas.py` 6, `test_me_notifications.py` 1), the permission tests that spell "no token" as a
case (`test_players_permissions.py`, `test_player_profiles_auth.py`, ≈6 more sites found by
`grep -n "no token\|reader\|without token" tests/`), the two `websocket_connect` calls
(`test_websocket_public.py`, `test_realtime_events.py`) which need `headers=editor_headers`, and
every `Settings(...)` constructor (`conftest.py`, `scripts/dump_openapi.py`, the three plan
recipes) which loses `jwt_secret`/`ws_require_auth` and gains `password_hash_profile="test"`,
`auth_dev_origin=True`, `app_env="test"`. A new `anon` fixture (`TestClient(app)` with an empty
jar) is what a test reaches for to say "nobody". Honest size: **≈25 hand edits across ≈9 existing
files, plus 7 new test files (gate audit, sessions, migration, rate limits, invites/register/
reset, admin, passkeys + the soft authenticator) of ≈90 tests** — a day of Opus for L2's share
and half a day each for L3 and L8. Frontend: `authSession.test.tsx` is rewritten for the cookie
boot; 15 test files mention `token` (props, mocks) and are swept with the code; the 36 test files
that spell literal routes are **untouched** by the basename, because it lives in `main.tsx` and
tests render under a plain `MemoryRouter`. Argon2 in tests is the `test` profile (≈1 ms), so the
suite does not grow by three hashes × 303 tests ≈ 5 minutes.

**13. The escape hatch — four rungs, all measured before deploy A.**
1. **`secrets.json` is not edited by this deploy.** `player_accounts[]` and `jwt_secret` stay;
   old code reads them, new code reads them once (migration) and for the exchange. So
   `git checkout ce55a53 && docker compose up -d --build` restores the JWT login **instantly**,
   and the tokens still in everyone's `localStorage` are still valid (180 days). L13 proves it.
   (L13: `ce55a53`, not `cfc1669` — see "Roli's answers" 1. And "still in `localStorage`" holds
   only for a phone that has not opened the new app yet: the new frontend deletes the JWT the
   moment the exchange answers, so such a phone meets the old login screen once and logs in with
   its `secrets.json` password — measured 200 for all six on the rolled-back code.)
2. `docker compose exec backend python manage.py reset-link --player Roli` prints a one-hour link;
   `manage.py set-password --player Roli` prompts (no echo) and writes the hash;
   `manage.py make-admin --player Roli`; `manage.py invite --group altherren` prints a code;
   `manage.py sessions --player Roli --revoke-all`. All five exist from L1/L3 and are exercised in
   L13 against the production copy.
3. A backend that **refuses to boot** names the setting in its last log line
   (`AuthConfigError: …`); every setting it can name is in `docker-compose.yml` (git) or has a
   production default in code — there is **no** new key `secrets.json` must carry.
4. Caddy is untouched, the frontend image is stateless: a broken login is always a backend
   rollback, never a data restore. Step 2's `backup-deploy-data` is the way back for data anyway.

**14. Two deploys, and what proves each.** Deploy A = `main` at the L14 docs commit: expect
`Auth migrated: N accounts, 1 group, M memberships`, `Cups imported: 2`; `curl -sI
…/api/tournaments` → 401; phone → login screen appears **only if** the exchange failed (it should
not: the PWA has the old token and exchanges it); log in on a second device; revoke it from
`/g/altherren/admin`; Settings → Send test. Deploy B = the branch head after L15: expect nothing
in the logs; Settings → Account → "Add a passkey" → Face ID → log out → "Use a passkey" → in.

## Task overview & order

| # | ID | Title | Model — why | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------|-------------------------------------|------|
| 1 | L0 | Same-origin dev: vite proxies `/api` and `/ws` | **Opus** — a config change with a phone check | `frontend/vite.config.ts`, `frontend/.env.local` (untracked; the task documents its new content), `Makefile` | group A |
| 2 | L1 | The schema, the settings, the boot guard, the migration, `auth-preflight` | **Opus** — mechanical against an exact table; the risk is covered by the preflight and L13 | `backend/app/models.py`, `backend/app/db.py`, `backend/app/settings.py`, `backend/app/services/auth_migration.py` (new), `backend/app/services/passwords.py` (new), `backend/manage.py`, `backend/requirements.txt`, `docker-compose.yml`, `backend/tests/test_auth_migration.py` (new), `backend/tests/test_settings_guard.py` (new) | group A |
| 3 | L2 | The gate, the sessions, the cookie login, the exchange, the rate limiter, the audit test, the test fixtures | **Fable** — a missed route is a silent leak; a session bug is the lock-out; the audit test is only as good as its author's suspicion | `backend/app/auth.py`, `backend/app/auth_gate.py` (new), `backend/app/main.py`, `backend/app/config.py` (deleted), `backend/app/services/sessions.py` (new), `backend/app/services/rate_limit.py` (new), `backend/app/services/groups.py` (new), `backend/app/routers/auth.py`, `backend/app/routers/me.py`, `backend/app/schemas/requests.py`, `backend/app/schemas/responses.py`, every `backend/app/routers/*.py` that names `decode_token` (11 sites), `backend/app/services/notifications.py` (`admin_player_ids`), `backend/tests/conftest.py`, `backend/tests/test_auth_gate.py` (new), `backend/tests/test_sessions.py` (new), `backend/tests/test_rate_limit.py` (new), the ≈9 test files in §12, `scripts/dump_openapi.py`, `frontend/src/api/generated/schema.d.ts` | alone, after group A |
| 4 | L3 | The account and group API: register, redeem, reset, password, my sessions, admin endpoints, owner roles, `group_id` on writes, group in push | **Opus** — many small endpoints over services L2 shaped, each with a stated rule | `backend/app/routers/auth.py` (adds), `backend/app/routers/admin.py` (new), `backend/app/services/accounts.py` (new), `backend/app/services/invites.py` (new), `backend/app/services/reset_links.py` (new), `backend/app/services/device_label.py` (new), `backend/app/services/groups.py` (adds), `backend/app/routers/tournaments.py`, `backend/app/routers/friendlies.py`, `backend/app/routers/ideas.py`, `backend/app/routers/players.py` (roster), `backend/app/services/notifications.py` (group prefix), `backend/app/schemas/*.py`, `backend/manage.py` (the five commands' bodies), `backend/tests/test_accounts.py` (new), `backend/tests/test_admin.py` (new), `frontend/src/api/generated/schema.d.ts` | group B |
| 5 | L4 | The frontend switch: cookie session, no token anywhere, the login screen, `RequireAuth`, the offline rule | **Fable** — the A9 class of decision (when is the app logged out) and the offline rule; the sweep underneath is mechanical but broad | `frontend/src/auth/*`, `frontend/src/api/client.ts`, `frontend/src/api/auth.api.ts`, every `frontend/src/api/*.api.ts`, `frontend/src/api/queryKeys.ts`, `frontend/src/api/cachePolicy.ts`, `frontend/src/api/types.ts`, `frontend/src/app/App.tsx`, `frontend/src/pages/LoginPage.tsx` → `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/pages/auth/AuthScreen.tsx` (new), `frontend/src/pages/auth/RetryCountdown.tsx` (new), `frontend/src/hooks/realtime/connection.ts`, `useRealtime.ts`, `frontend/src/push/*`, `frontend/src/ui/shell/*` (token consumers), every page/hook that threads `token`, `frontend/src/test/authSession.test.tsx` + the 15 test files that mention `token` | group B |
| 6 | L5 | Register, reset and "not in a group yet" | **Opus** — three forms with an exact contract and a settled design | `frontend/src/pages/auth/RegisterPage.tsx` (new), `ResetPage.tsx` (new), `NoGroupPage.tsx` (new), `frontend/src/api/registration.api.ts` (new), `frontend/src/test/registration.test.tsx` (new) | group C |
| 7 | L6 | The admin page | **Opus** — a list page with a sheet, all primitives exist | `frontend/src/pages/admin/*` (new), `frontend/src/api/admin.api.ts` (new), `frontend/src/ui/shell/navConfig.tsx`, `frontend/src/ui/shell/routeHierarchy.ts`, `frontend/src/test/adminPage.test.tsx` (new) | group C |
| 8 | L7 | Settings → Account: my devices, my password | **Opus** — one settings section | `frontend/src/pages/SettingsPage.tsx`, `frontend/src/pages/settings/SecuritySection.tsx` (new), `frontend/src/api/account.api.ts` (new), `frontend/src/test/securitySection.test.tsx` (new) | group C |
| 9 | L10 | The group segment in the URL and in every deep link; `sw.js` registers its own subscription | **Opus** — one boot module, one backend helper, a sweep with a grep as its gate | `frontend/src/app/basename.ts` (new), `frontend/src/main.tsx`, `frontend/src/ui/shell/useLocationRestore.ts`, `frontend/src/ui/shell/NotificationBell.tsx`, `frontend/src/pages/profile/RecordBadges.tsx`, `frontend/public/sw.js`, `frontend/src/push/usePushNotifications.ts` (the `replaces_endpoint`), `backend/app/services/paths.py` (new), the ten backend files that emit a path, `backend/app/routers/push.py`, `backend/tests/test_paths.py` (new), `frontend/src/test/basename.test.ts` (new) | group C |
| 10 | L12 | Cups in the database; the per-group star overlay; promote forward-only | **Opus** — a seed, a resolver rule, one endpoint; **first to cut** | `backend/app/cup_defs.py`, `backend/app/services/cup.py` (import only), `backend/app/services/club_stars.py`, `backend/app/routers/clubs.py`, `backend/app/db.py` (the two seeds), `backend/tests/test_cup_eras.py`, `backend/tests/test_club_star_history.py`, `backend/tests/test_cups_db.py` (new), `frontend/src/pages/clubs/ClubList.tsx` (one admin control) | group C |
| 11 | L11 | `PlayerLink` decides who may open a profile; three surfaces route through it; the server enforces it | **Opus** — one hook, three edits, one guard | `frontend/src/ui/primitives/PlayerLink.tsx`, `frontend/src/hooks/useProfileAccess.ts` (new), `frontend/src/pages/live/StandingsTable.tsx`, `frontend/src/pages/stats/PlayerProfile.tsx`, `frontend/src/pages/PlayersAdminPage.tsx`, `frontend/src/ui/primitives/List.tsx` (`overlay` slot), `frontend/src/pages/ProfilePage.tsx` (the 403 state), `backend/app/services/groups.py` (`ensure_shared_group`), `backend/app/routers/players.py` (profile/guestbook/pokes guards), tests | group D |
| 12 | L13 | The dress rehearsal on a copy of production: migrate, log in, roll back, roll forward | **Opus** — a script to follow and numbers to write down | `scripts/auth_rehearsal.sh` (new), this file (its report) | group D |
| 13 | L14 | Documentation pass A (everything but passkeys) | **Opus** — canon from the workers' notes | `AGENTS.md`, `DESIGN.md`, `README.md`, `backend/secrets.json.example`, this file | after group D → **deploy A** |
| 14 | L8 | Passkeys, server side | **Fable** — verification code whose failure mode is silent acceptance; the soft authenticator makes the negatives real | `backend/app/services/passkeys.py` (new), `backend/app/routers/auth.py` (six routes), `backend/app/schemas/*.py`, `backend/requirements.txt`, `backend/tests/soft_authenticator.py` (new), `backend/tests/test_passkeys.py` (new), `frontend/src/api/generated/schema.d.ts` | after L14 |
| 15 | L9 | Passkeys in the browser; the "secure your account" strip | **Opus** — a library does the ceremony; the UI is two rows and one strip | `frontend/package.json` (+`@simplewebauthn/browser`), `frontend/src/api/passkeys.api.ts` (new), `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/pages/settings/SecuritySection.tsx`, `frontend/src/ui/shell/SecureAccountNotice.tsx` (new), `frontend/src/ui/shell/AppShell.tsx`, `frontend/src/test/passkeys.test.tsx` (new), a Playwright script under `scripts/` | after L8 |
| 16 | L15 | Documentation pass B (passkeys) | **Opus** | `AGENTS.md`, `DESIGN.md`, `README.md`, this file | last → **deploy B** |

**Order:** **group A** {L0 ∥ L1} → **L2** alone → **group B** {L3 ∥ L4} → **group C** {L5 ∥ L6 ∥
L7 ∥ L10 ∥ L12} → **group D** {L11 ∥ L13} → **L14** → *(deploy A, on Roli's go)* → **L8** → **L9**
→ **L15** → *(deploy B)*.

**Why this order.** L0 and L1 share no file and neither depends on the other. **L2 alone**: it
rewrites `conftest.py` and touches eleven routers, and every later task's tests run through the
fixtures it defines; two workers in that tree would fight over `schema.d.ts` and `conftest.py`.
**L3 ∥ L4** are backend-only and frontend-only; L4 needs L2's `/me` shape and `/auth/login`
(in), not L3's endpoints — L4 pre-declares the `qk` keys and `types.ts` aliases that L5–L9 will
use, so those five never touch `queryKeys.ts` or `types.ts`. **Group C** is five disjoint file
sets; L10 is the only one that touches `main.tsx`, `sw.js` and the backend path emitters, and it
sits here because L11 (the bell's and the badges' in-app paths already through `toRouterPath`)
and L13 (the rehearsal opens deep links) need it. **L12** touches `routers/clubs.py` and
`cup_defs.py`, which L2 already released. **Group D**: L11 edits `routers/players.py`, which L10
touched for its `/profiles/` paths, so it waits; L13 needs the whole of deploy A's code. **L14**
before deploy A because `AGENTS.md` §7 must describe the deploy that is about to happen. **L8/L9
after L14** so the branch can be merged at L14's commit for deploy A (disagreement 1). Group-C
workers will see each other's in-flight files in `npm run check`; commit only your own.

---

## L0 — Same-origin dev: vite proxies `/api` and `/ws`  ☑

**The gap.** `frontend/.env.local` (untracked) points the browser at `http://192.168.178.78:8001`;
`vite.config.ts` has no `server.proxy`; `app/main.py:63-69` mounts `CORSMiddleware` with `*`.
A cookie set by `:8001` is invisible to a page served from `:8000`, so nothing after this task can
be tried on the phone until dev is one origin.

**Verify first.**
```bash
grep -n "proxy" frontend/vite.config.ts                     # → 0
cat frontend/.env.local                                     # → the two absolute 192.168.178.78 lines
```

**The change.**
1. **`frontend/vite.config.ts`** — read `BACKEND_ORIGIN` from `process.env` (default
   `http://127.0.0.1:8001`) and add
   ```ts
   server: {
     port: 8000, host: true,
     proxy: {
       "/api": { target: BACKEND_ORIGIN, changeOrigin: false, rewrite: (p) => p.replace(/^\/api/, "") },
       "/ws":  { target: BACKEND_ORIGIN, ws: true, changeOrigin: false },
     },
   },
   ```
   `changeOrigin: false` keeps `Host` as the browser sent it (the phone's `192.168.178.78:8000`),
   which is irrelevant to the backend today and matters for nothing later because L8 reads
   `Origin`, never `Host`. The `/api` rewrite mirrors Caddy's `handle_path` (prefix stripped);
   `/ws` is not stripped, mirroring `handle /ws/*`. http-proxy appends `X-Forwarded-For` only when
   `xfwd` is set — leave it unset; the backend's loopback-peer rule (L2) already keys dev on the
   socket peer.
2. **`frontend/.env.local`** — the task writes the new content **and documents it in
   `README.md`'s dev section via L14** (the file is untracked):
   ```
   VITE_API_BASE_URL=/api
   VITE_WS_BASE_URL=
   ```
   `api/client.ts` already defaults to `/api`; `connection.ts::buildWsUrlForPath` already derives
   `ws://<host>/ws/…` from `window.location` when the env is empty — **no code change** in either.
3. **`Makefile`** — `frontend` / `frontend-lan` recipes export `BACKEND_ORIGIN=http://127.0.0.1:8001`
   (the default, spelled so the recipe documents it). `backend-lan` keeps binding `0.0.0.0` for
   now (L1 changes the backend targets' env); nothing needs it after this task, and L14 notes it.
4. **Do not remove CORS here** — the bearer flow must keep working through the proxy until L2
   replaces it; L2 deletes the middleware and `app/config.py`.

**Definition of done.**
- ☑ From the phone (or `curl -H 'Host: 192.168.178.78:8000'` from the Pi):
  `http://192.168.178.78:8000/api/tournaments` → the JSON the backend serves;
  `http://127.0.0.1:<V>/api/health` → `{"status":"ok"}`.
- ☑ The realtime dot goes live through the proxy: open a tournament at `http://127.0.0.1:<V>`,
  `ConnectionIndicator` renders nothing (i.e. connected); the backend log shows the `/ws/…`
  upgrade arriving at the backend port.
- ☑ `npm run check` green (no source changed; the config file compiles).
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §3: "the dev UI reaches the API through vite's proxy; `.env.local` is
relative; the phone's URL is the vite port only."

**Deviations.**
- **The proxy keys are `"/api/"` and `"/ws/"`, with the trailing slash** — the plan wrote `"/api"`
  and `"/ws"`. Vite matches a string key as a plain prefix, so `"/api"` would also have swallowed
  an SPA path like `/apiary`; the slash makes it the exact shape of Caddy's `handle_path /api/*`
  and `handle /ws/*`. Consequence, identical to production: a bare `/api` (no slash) is not
  proxied and falls through to the SPA's `index.html` (measured: `200 text/html`). The rewrite is
  unchanged (`/^\/api/` → `""`, so `/api/health` reaches the backend as `/health`).
- `BACKEND_ORIGIN` is read as `process.env.BACKEND_ORIGIN || "http://127.0.0.1:8001"` (an empty
  string also falls back). The `Makefile` spells it once as `BACKEND_ORIGIN ?= http://127.0.0.1:8001`
  and passes it on the `frontend` / `frontend-lan` command lines, so `make frontend
  BACKEND_ORIGIN=…` overrides it; `make help` prints where the proxy points. `backend-lan` still
  binds `0.0.0.0` — untouched, as the task says.
- **`frontend/.env.local`** — the new content is exactly the two lines above
  (`VITE_API_BASE_URL=/api`, `VITE_WS_BASE_URL=` empty). It was written **only in this worktree**
  (it did not exist here; the file is git-ignored by `frontend/.env.*`, so nothing is committed).
  **The main checkout's `.env.local` still holds the two absolute `192.168.178.78:8001` lines and
  was not touched** — it keeps working after the merge too, because L0 leaves CORS in place; it
  must be switched to the relative lines when Roli moves his dev servers onto this branch, and
  **L2 makes that mandatory** (CORS and cross-origin cookies go). L15 carries this into
  `README.md`'s dev section (L14 was dropped). Note the §10 vitest gotcha flips with it: with a
  relative `.env.local`, `API_BASE` in tests is `/api` on this machine too.
- Measured against the isolated stack (backend 8231 on `127.0.0.1` with a DB + uploads copy under
  the scratchpad, vite 8251 bound to `0.0.0.0` so the LAN address answers):
  - `http://127.0.0.1:8251/api/health` → `{"status":"ok"}`; **`http://192.168.178.78:8251/api/tournaments`
    → `200`, 13,324 B `application/json`**, byte-identical in size to the backend's own
    `http://127.0.0.1:8231/tournaments`; `http://192.168.178.78:8251/api/players/1/avatar?w=64` →
    `200` 1,060 B `image/webp` (media and the `?w=` ladder ride through unchanged).
  - What the backend actually receives, measured with a header-echo server on 8231 behind the
    same vite: `path=/tournaments?x=1` (prefix stripped, query kept), `host: 192.168.178.78:8251`
    (`changeOrigin: false` keeps the browser's `Host`), and **no `X-Forwarded-*` header at all**;
    uvicorn logs every proxied request with peer `127.0.0.1`.
  - WebSockets over the LAN address: `ws://192.168.178.78:8251/ws/tournaments` and
    `…/ws/tournaments/20` open, answer `connected` and a `pong`; the backend logs
    `"WebSocket /ws/tournaments" [accepted]` on 8231 (path not stripped).
  - Browser (headless Chromium, 390×844 dpr 3) on `http://192.168.178.78:8251/live/20` **and** on
    `http://127.0.0.1:8251/live/20`: every request and socket has the page's own origin (one
    origin in the list), 8 `/api/…` requests, `/ws/tournaments` and `/ws/tournaments/20` connect,
    no failed request, and after 3 s the page shows neither "Reconnecting" nor "Offline" (past
    `ConnectionIndicator`'s 1.2 s grace, i.e. connected). Vite's own HMR socket (`/?token=…`) is
    unaffected by the `/ws/` key.
  - Vite logs `ws proxy error: write ECONNRESET / EPIPE` **only when a client dies without a
    closing handshake** (a killed script, `browser.close()`); a clean `close(1000)` logs nothing
    (measured 7 → 7). http-proxy noise, not a fault — left alone.
- `npm run check` green: **839 tests in 88 files** (the baseline), tsc and eslint clean.
- **Not done here, and why:** no real phone was in the loop — the LAN proof is `curl`, Node's
  WebSocket and Chromium against `192.168.178.78:8251` from the Pi itself, which exercises the
  LAN interface and vite's `0.0.0.0` bind but not Wi-Fi. **The plan's Playwright note is wrong**:
  there is no `playwright` under `frontend/node_modules` (nor a root `node_modules/` any more); this
  task borrowed `playwright-core` 1.62.1 from `/home/roli/projects/racer/node_modules` (read-only,
  Chromium 1243 from `~/.cache/ms-playwright`). L4+ will hit the same thing.

## L1 — The schema, the settings, the boot guard, the migration, `auth-preflight`  ☑

**The gap.** `models.py` has no `Group`, `Account` or session table; `settings.py` knows
`jwt_secret` and `ws_require_auth` and nothing about an origin, a proxy or an environment;
`create_app` validates the cups file and nothing else; `argon2` is not installed
(`.venv/bin/python -c "import argon2"` → `ModuleNotFoundError`).

**Verify first.**
```bash
grep -n "class Group\|class Account\|class AuthSession" backend/app/models.py     # → 0
grep -n "auth_origin\|trusted_proxy_hops\|app_env" backend/app/settings.py          # → 0
grep -n "argon2\|webauthn" backend/requirements.txt                                 # → 0
```

**The change.**
1. **`requirements.txt`** — add `argon2-cffi==25.1.0`. (`webauthn` is L8's.) `pip install -r`
   in the venv; note the wheel that lands (`argon2_cffi_bindings-25.1.0-cp39-abi3-manylinux_2_28
   _aarch64`).
2. **`models.py`** — the ten tables of §1 exactly as tabled, plus `group_id: Optional[int] =
   Field(default=None, foreign_key="group.id", index=True)` on `Tournament`, `FriendlyMatch`,
   `FeatureRequest`, `ClubStarRating`. Docstrings say which task reads each table.
3. **`db.py`** — `_RUNTIME_COLUMNS` gains the four `("<table>", "group_id", "INTEGER")` rows;
   new `_RUNTIME_INDEXES: tuple[tuple[str, str, str], ...] = (("ix_tournament_group_id",
   "tournament", "group_id"), …)` applied with `CREATE INDEX IF NOT EXISTS` after the columns;
   `init_db()` calls `migrate_from_settings(_engine, settings)` **after** the runtime columns and
   **before** the record-holder seed (holders are per group in part 2; nothing changes now).
   `init_db()` needs the settings: give it `init_db(settings: Settings | None = None)` and have
   `create_app`'s lifespan pass `settings`; tests' `init_db()` call in `conftest.py` passes the
   test settings (L2 rewrites that file anyway — coordinate by making the argument optional and
   skipping the migration when `None`, with a log line saying so).
4. **`services/passwords.py`** — `MIN_PASSWORD_LENGTH = 10`; `hasher_for(profile: str) ->
   PasswordHasher` (`default` / `test` parameters from §5, cached per profile);
   `hash_password(ph, plain) -> str`; `verify_password(ph, hash, plain) -> tuple[bool, bool]`
   (ok, needs_rehash); `validate_new_password(plain)` → `bad_request` under 10 chars or over
   200. **No salt parameter anywhere** — a test asserts two hashes of one password differ and
   both verify (that is the salt working) and that the stored string starts with `$argon2id$`.
5. **`services/auth_migration.py`** — `migrate_from_settings(engine, settings, *, dry_run=False)
   -> MigrationReport` (a dataclass: `groups_created`, `memberships_created`,
   `accounts_created`, `accounts_migrated`, `owners_promoted`, `unmatched_names`,
   `case_collisions`, `backfilled: dict[str, int]`), the six steps of §2. **Case collision =
   refuse**: two `Player` rows whose `casefold()`ed names are equal cannot both get a `name_key`;
   the report lists them and the migration raises `AuthMigrationError` naming them — the backend
   does not boot on a database that cannot be given unique login names, and `auth-preflight`
   catches it on the copy first. (The dev DB's six names have no collision; production's are the
   same five or six people.)
6. **`settings.py`** — remove nothing yet (`jwt_secret` and `ws_require_auth` stay until L2
   deletes the readers; L2 removes the fields). Add: `auth_origin: str = "https://lorbeerkranz.xyz"`
   (env `AUTH_ORIGIN`), `auth_rp_id: str = "lorbeerkranz.xyz"` (`AUTH_RP_ID`), `auth_rp_name:
   str = "Lorbeerkranz"`, `auth_dev_origin: bool = False` (`AUTH_DEV_ORIGIN`), `app_env: str =
   "development"` (`APP_ENV`; `production` | `development` | `test`), `trusted_proxy_hops: int =
   0` (`TRUSTED_PROXY_HOPS`), `password_hash_profile: str = "default"`
   (`PASSWORD_HASH_PROFILE`), `session_ttl_days: int = 90`. And
   `assert_auth_config_safe(settings)` raising `AuthConfigError`:
   - `auth_dev_origin and app_env == "production"` → *"AUTH_DEV_ORIGIN is set on a production
     server — refusing to derive the WebAuthn origin from requests. Unset it."*
   - `not auth_dev_origin and not auth_origin.startswith("https://")` → *"AUTH_ORIGIN must be
     https in pinned mode (or set AUTH_DEV_ORIGIN=1 for development)."*
   - `app_env == "production" and password_hash_profile != "default"` → refuse.
   - `app_env == "production" and trusted_proxy_hops < 1` → **log a warning** naming the
     consequence (one rate-limit bucket for everybody), do not refuse — a wrong count degrades
     accuracy, never safety, and a crash here is a lock-out.
   `create_app` calls it first thing — before `configure_db`.
7. **`docker-compose.yml`** — backend `environment:` gains `APP_ENV: "production"`,
   `TRUSTED_PROXY_HOPS: "1"`. (`AUTH_ORIGIN` has a production default; not repeated.)
   **`Makefile`** — `backend` / `backend-lan` recipes export `AUTH_DEV_ORIGIN=1
   APP_ENV=development`, so `make dev` derives the relying party from the request (the phone's
   `http://192.168.178.78:8000`, which WebAuthn will refuse as insecure — correct — and
   `http://localhost:8000`, which it accepts).
8. **`manage.py`** — `auth-preflight [--secrets] [--db-url]`: opens the database **read-only**
   (`mode=ro`, the recovery command's precedent), runs `migrate_from_settings(dry_run=True)`,
   prints the report, exits 1 on `unmatched_names` or `case_collisions`. Also the **bodies** of
   the five escape-hatch commands are L3's (they need `services/accounts.py`); L1 registers the
   parsers with a stub that prints "not until L3" so the CLI shape is fixed here.
9. **Rollback safety, measured** (the K1/M2/W1 technique): `git archive cfc1669 | tar -x -C
   $(mktemp -d)`, point the old tree's `run.py` at a database this task's code has booted (all
   ten tables present, the four columns added and backfilled), with the old-shape secrets file:
   boots clean; `POST /auth/login` (JWT) 200; `GET /tournaments` 200; `POST /tournaments` 200
   (a row with `group_id NULL`); then boot the **new** code on the same file: the migration
   backfills that row (`backfilled.tournament == 1`) and logs it. Write the numbers into
   Deviations.

**Definition of done.**
- ☑ `make test` green (the existing 303 plus `test_auth_migration.py` ≈ 12: each step, idempotency
  on a second run, the unmatched name, the collision refusal, the four backfills;
  `test_settings_guard.py` ≈ 6: every refusal, the warning, the two legitimate shapes).
- ☑ Argon2 timing written down: `hash_password` × 10 on the Pi with the `default` profile, median
  in ms; and once inside `docker compose build`'s image if a build is run (else say not run).
- ☑ The rollback drill of step 9, with its numbers.
- ☑ `make lint` clean. No response model touched → no `gen-types`.
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §5: the ten tables, the four columns, the migration and its one log line;
§4: the new settings keys with their defaults and the guard; §8: `auth-preflight`.

**Deviations.**
- **`backend/app/main.py` was touched although L1's row does not list it** — step 3 and step 6 of
  this very section require it (`init_db(settings)` in the lifespan, `assert_auth_config_safe`
  first thing in `create_app`). Two lines; L0 does not touch the file; L2 owns it next.
- **The `Makefile` half of step 7 was *not* done**: the file is L0's in group A. `make backend`
  boots fine without it (defaults: `development`, pinned `https://` origin → the guard passes);
  `AUTH_DEV_ORIGIN=1 APP_ENV=development` on the `backend`/`backend-lan` recipes is left for
  whoever next owns the Makefile (L2 or L8 — it matters only once passkeys exist).
- **`argon2-cffi` is a wheel on both targets.** Installed into the shared venv through the
  symlink (additive, expected): `argon2_cffi-25.1.0-py3-none-any` plus, unpinned as the library
  declares it, **`argon2_cffi_bindings-26.1.0-cp310-abi3-manylinux_2_26_aarch64.manylinux_2_28_aarch64`**
  (not 25.1.0 as step 1 guessed — 26.1.0 is what resolves today). For production, `pip download
  --only-binary=:all: --platform manylinux_2_28_x86_64 --python-version 3.11` fetched
  `argon2_cffi_bindings-26.1.0-cp310-abi3-manylinux_2_26_x86_64.manylinux_2_28_x86_64.whl` (26 kB)
  and `cffi-2.1.1-cp311-…manylinux2014_x86_64` — nothing compiles on `python:3.11-slim`
  (Debian glibc 2.36).
- **Argon2 timing, measured on the Pi 5**: `default` profile (RFC 9106 low-memory, argon2id,
  t=3, m=65536 KiB, p=4) — `hash_password` × 10 **median 123.7 ms** (min 119.5, max 133.5),
  verify median 127.4 ms; `test` profile 7.5 ms. Under the 500 ms line, so `memory_cost` stays.
  **Not measured inside the x86 image** — no `docker compose build` was run.
- **Salt**, as Roli required: `PasswordHasher.from_parameters(RFC_9106_LOW_MEMORY)`, no salt
  argument anywhere, no pepper. `test_one_password_hashed_twice_gives_two_different_hashes_that_both_verify`
  hashes one password twice under **both** profiles and asserts the strings differ, the salt
  segments differ, both start `$argon2id$` and both verify; a second test draws 20 hashes of one
  password and gets 20 distinct salts.
- **Step 2 is keyed on "no `Account` *and* no membership", not on "no membership" alone.** The
  migration runs on every boot, and L3's registration creates a player with an account and no
  membership; "no membership" alone would have pulled every uninvited registrant into
  `altherren` at the next restart. A player old code writes while rolled back (no account) is
  still picked up — tested both ways. **L3 must create the `Account` in the same transaction as
  the `Player`** (register, and the admin roster's `POST /players` if it is to stay out of the
  group).
- **Case collisions refuse the boot on every boot, not only the first.** Until L3 checks
  `name_key` on `POST /players`, an admin creating `flo` beside `Flo` would make the *next
  restart* refuse — L3 must close that (409 on a taken `name_key`).
- Added beyond the spec, each small: `APP_ENV` / `PASSWORD_HASH_PROFILE` values outside their
  lists are **refused** (a typo such as `prod` must not switch the production guards off);
  `AUTH_RP_NAME` and `SESSION_TTL_DAYS` are env-readable like the rest; `auth_origin` loses a
  trailing `/`. `InviteCode.created_by` and `PasswordResetToken.created_by` are **nullable**
  because `manage.py invite` / `reset-link` have no caller. `MigrationReport` also carries
  `duplicate_entries` (a repeated name in `player_accounts[]`: first wins, as the old login did),
  `migrated_names`, `admin_names` and `accounts_with_password_after` (the preflight prints a
  WARNING, not a failure, when nobody would have a password). A migrated password shorter than
  10 characters is hashed as it is — refusing it would lock its owner out.
- The log line keeps the planned prefix and appends detail:
  `Auth migrated: 3 accounts, 1 group, 6 memberships — 3 players without a password, 1 owner,
  backfilled tournament=18, friendlymatch=23, featurerequest=1, clubstarrating=657`
  (the dev DB copy's first boot, 1.5 s including three default-profile hashes).
- **Preflight** against a copy of the dev DB (pre-L1 schema), with a throwaway three-account
  secrets file: exit **0**, 6 memberships, 3 password accounts (Roli, Berni, Flo), 3 without,
  1 owner (Roli), the same four backfill counts; the file's sha256 identical before and after
  (`mode=ro`). Tests prove exit **1** on an unmatched name and on a case collision, and exit 0
  with nothing to do on an already-migrated database. The five escape-hatch parsers exist and
  exit **2** with "not until L3".
- **Rollback drill, measured** (dev DB copy outside the repo, port 8232): new code booted it
  (the line above; 10 tables, 4 columns, 5 `ix_*_group_id` indexes incl. `ix_cup_group_id`;
  hashes `$argon2id$v=19$m=65536,t=3,p=4`). Then `git archive cfc1669 backend` booted the **same
  file** with the old-shape secrets: clean boot (`Cup defs validated`, `DB initialized`), `POST
  /auth/login` **200** (JWT, 217 chars), wrong password **401**, `GET /me` **200**, `GET
  /tournaments` **200** (13,324 B), `/stats/records`, `/friendlies`, `/ideas` **200**, `POST
  /tournaments` **200** → id 21 with `group_id NULL`; old code left the 6 accounts and 6
  memberships untouched. New code again on the same file: `Auth migrated: 0 accounts, 0 groups,
  0 memberships — … backfilled tournament=1`, tournament 21 → `group_id 1`, and the JWT old
  code minted still answers `GET /me` 200 (L2 is what changes that).
- **Test runtime**: `make test` **334 passed** (303 + 31: 20 in `test_auth_migration.py`, 11 in
  `test_settings_guard.py`) in **17:48**, against 13–16 min before. Part of it is the Pi (L0's
  worker ran alongside), part is real: every `TestClient` lifespan now migrates `conftest.py`'s
  three accounts under the `default` profile (~0.4 s per test). **L2's `conftest.py` rewrite
  should pass `password_hash_profile="test"`**, as §12 already says; L1 left `conftest.py` alone
  because it is L2's.
- `make lint` clean; no response model touched, so no `gen-types`.


## L2 — The gate, the sessions, the cookie login, the exchange, the rate limiter, the audit test, the test fixtures  ☑

**The gap.** `auth.py` decodes JWTs from a bearer header; 43 routes have no dependency; the
websocket accepts anyone when `ws_require_auth` is false (it is, everywhere); `/health` answers
the internet; `conftest.py` logs in for a token.

**Verify first.**
```bash
grep -c "HTTPBearer\|jwt" backend/app/auth.py                                   # → >0
grep -rn "decode_token" backend/app/routers | wc -l                              # → 11
curl -sI http://127.0.0.1:<B>/tournaments | head -1                               # → 200 (stack booted with L1's code)
```

**The change — backend.**
1. **`services/sessions.py`** — `SESSION_COOKIE = "lk_session"`, `SESSION_TTL =
   timedelta(days=90)` (from `settings.session_ttl_days`), `TOUCH_INTERVAL = timedelta(minutes=5)`,
   `new_token() -> str` (`secrets.token_urlsafe(32)`), `hash_token(token) -> str` (sha256 hex),
   `create_session(s, *, player_id, kind, user_agent, ip) -> tuple[AuthSession, str]` (row +
   the clear token, the only time it exists), `resolve_session(s, token) -> AuthSession | None`
   (by hash, unexpired), `touch_session(s, row, now) -> bool` (True when it wrote),
   `list_sessions(s, player_id)`, `revoke_session(s, player_id, session_id) -> bool` (**finds the
   id in the player's own list**), `revoke_all_sessions(s, player_id, *, keep: int | None)`,
   `set_session_cookie(response, token, *, secure, max_age)`, `clear_session_cookie(response,
   *, secure)`, `cookie_secure_for(request, settings) -> bool` (§"disagreements" 3).
2. **`auth_gate.py`** — the ASGI middleware of §3 with the three tuples, `client_ip(scope,
   hops)`, `is_loopback(scope)`, and a `LoopbackScope` **test** helper is in
   `tests/test_auth_gate.py`, not here. The gate opens its own short `Session(get_engine())`,
   reads the row, the account, the memberships, the current group, builds the claims, closes.
   The touch writes in that same session and commits. Measure the cost (DoD).
3. **`services/groups.py`** — `DEFAULT_GROUP_SLUG = "altherren"`, `current_group(s) -> Group`,
   `memberships_for(s, player_id) -> list[tuple[Group, str]]`, `effective_role(*, site_admin,
   membership_role) -> str`, `is_member(s, player_id, group_id)`. (L3 adds the owner operations.)
4. **`auth.py`** — rewritten: `ROLE_ORDER`, `require_auth_claims(request)`, `require_min_role`,
   `require_editor`, `require_owner`, `require_admin`, `require_editor_claims`,
   `require_owner_claims`, `require_admin_claims`. `create_token`, `decode_token`,
   `decode_token_string`, `resolve_player_login`, `_configured_account`, `bearer` — **deleted**.
   The one JWT reader left is `services/legacy_jwt.py::claims_from_legacy_token(secret, token)`
   for the exchange (PyJWT stays in `requirements.txt` until the exchange goes).
5. **`services/rate_limit.py`** — `RateLimiter.check(key, limit, window_s) -> int | None`
   (seconds to wait, or None), `hit(key)`, `clear(key)`, the sweep; `LIMITS` as tabled in §9;
   `limited(request, *keys)` raises `HTTPException(429, headers={"Retry-After": str(n)},
   detail={"retry_after": n})`. One instance on `app.state.rate_limiter`.
6. **`routers/auth.py`** — `POST /auth/login {username, password}` (limits: account by
   `name_key`, ip, global; a wrong name and a wrong password are the same 401 "Wrong username or
   password"; an account with `password_hash NULL` is the same 401; success → `verify_password`,
   rehash if needed, `create_session(kind="password")`, cookie, body `MeOut`), `POST
   /auth/logout {push_endpoint?}` (deletes the row, disables that push subscription for the
   player via `disable_push_subscription`, clears the cookie), `POST /auth/exchange`
   (`Authorization: Bearer <legacy jwt>` → §6; 410 when `settings.jwt_secret` is empty).
   `LoginBody` keeps `username`/`password`. **`LoginOut` is replaced by `MeOut`.**
7. **`routers/me.py`** — `MeOut` becomes `{role, player_id, player_name, site_admin, groups:
   [MeGroupOut{id, slug, name, role}], has_password, has_passkey, password_migrated,
   session_id}` (`sub`/`iat`/`exp` gone; `has_passkey` is `False` until L8 — the field exists so
   L4/L9 compile against one shape). `/me/notifications`: `is_admin = claims["site_admin"]`.
8. **`main.py`** — `assert_auth_config_safe(settings)` first; `add_middleware(AuthGate)`;
   `CORSMiddleware` **removed**, `app/config.py` **deleted** (`DB_URL`/`JWT_SECRET` there were
   dead); the three websocket endpoints lose `_ws_authorized` and read `ws.scope["state"]`;
   `/health` unchanged (the gate handles loopback).
9. **The eleven `decode_token` sites** (`tournaments.py:394,472`, `comments.py:275`,
   `friendlies.py:110`, `players.py:579`, `ideas.py:191`, and the rest the grep lists) →
   `require_auth_claims`; their `claims: dict | None` types → `dict`. `services/*` functions
   that accept `claims: dict | None` (32 signatures) keep the `| None` — the websocket broadcast
   still calls them viewer-less.
10. **`services/notifications.py::admin_player_ids`** → reads `Account.site_admin`, not
    `secrets.json`; docstring updated; the `request` parameter stays (callers) but is unused.
11. **`settings.py`** — remove `ws_require_auth`; keep `jwt_secret` (exchange) with an empty
    default and a comment naming the batch that deletes it.

**The change — tests.**
12. **`conftest.py`** — `Settings(... password_hash_profile="test", auth_dev_origin=True,
    app_env="test", jwt_secret="test-jwt-secret")`; `init_db(settings)`; after the players are
    created, **run the migration** so Editor/Editor2/Admin have accounts (the fixture no longer
    needs to add `Player` rows by hand — the migration refuses to mint players, so keep the
    three `Player` rows and let the migration attach accounts). `login(client, username,
    password) -> str` now returns the **cookie value** read from the response's `Set-Cookie`
    (`client.cookies.get(SESSION_COOKIE)` after the post, then `client.cookies.clear()` so the
    shared client is not silently logged in as the last caller). `editor_headers` etc. return
    `{"Cookie": f"{SESSION_COOKIE}={token}"}`. **The `client` fixture logs in as Editor** and
    keeps that cookie in its jar (the measured override rule makes `headers=` win). New `anon`
    fixture: a second `TestClient(app)` with an empty jar. New `nogroup_headers` fixture: an
    account with no membership (created through `services/accounts.py` once L3 lands — for L2,
    build it by inserting `Player` + `Account` rows directly).
13. **`tests/test_auth_gate.py`** — the audit of §3, plus: `/health` 401 from `testclient`, 200
    through `LoopbackScope`; the touch rule (`last_seen_at` unchanged within 5 min, moved and
    cookie re-sent after — freeze time with a monkeypatched `sessions._now`); an expired row is
    a 401 and is not touched; a websocket with the cookie connects, without it fails;
    `client_ip` against `"1.2.3.4, 10.0.0.9"` with hops 1 → `10.0.0.9`, hops 0 + loopback peer →
    `10.0.0.9`, hops 2 with a 1-entry chain → the peer.
14. **`tests/test_sessions.py`** — login sets the cookie with the right attributes (`HttpOnly`,
    `SameSite=Lax`, `Path=/`, no `Secure` in test mode); logout clears it and the row; a
    revoked session's next request is 401; `DELETE /auth/sessions/{other's id}` → 404;
    revoke-others keeps the current; the exchange (`kind="exchange"`, 410 when the secret is
    empty, 401 on a bad token); `MeOut` shape for an admin, an owner, a member, a no-group account.
15. **`tests/test_rate_limit.py`** — the limiter's window and sweep; login: the 11th wrong
    password from one account → 429 with `Retry-After`; a right password on the 5th clears the
    account key; the global cap; a 429 writes no session.
16. The **≈25 hand edits** of §12; `scripts/dump_openapi.py`'s `Settings(...)`; `make gen-types`
    (the `MeOut` change) with `schema.d.ts` in the commit.

**Definition of done.**
- ☑ `tests/test_auth_gate.py::test_every_route_is_gated_or_listed` passes and, when a worker
  temporarily adds `@router.get("/probe")` with no dependency, still passes (the gate covers it)
  — and when a worker temporarily appends `"/probe"` to `PUBLIC_PATHS`, **fails** because the path
  does not exist. Both tried, both written down.
- ☑ `make test` green; the count and the runtime written down against 303 / 11–15 min.
- ☑ The gate's cost: `GET /tournaments` p50 over 50 requests against the dev-DB copy, before
  (L1's tree) and after, in ms.
- ☑ `curl -sI :<V>/api/tournaments` → 401; `-b jar` → 200; `curl -sI :<B>/health` → 200
  (loopback peer). Through vite `:<V>/api/health` is **also** 200 in dev, because the proxy
  connects from 127.0.0.1 — the loopback rule is proven by the audit test's `LoopbackScope`
  shim and by production (Caddy's container IP is not loopback → 401), not by this curl.
- ☑ `grep -rn "decode_token\|HTTPBearer\|CORSMiddleware" backend/app` → 0.
- ☑ `make lint`, `make gen-types` committed.
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §6: the gate, the three tuples, the claims shape, `ROLE_ORDER`, the
cookie, the touch rule, the exchange and its expiry; §10: "an explicit `Cookie` header beats the
TestClient jar — the fixtures depend on it"; §3: `make test` baseline.

**Deviations.**
- **`PUBLIC_PATHS` names only routes that exist: `/auth/login`, `/auth/exchange`.** §3's tuple
  also listed `/auth/register`, `/auth/reset` and the two passkey sign-in paths, but the same
  section has the audit assert that "the three tuples contain **only** paths that exist", and
  the DoD's second sabotage (a phantom `"/probe"` must *fail*) depends on that assertion — the
  two cannot both hold before L3 and L8 exist. So **L3 adds `/auth/register` and `/auth/reset`
  to `PUBLIC_PATHS` with its routes, and L8 adds `/auth/passkeys/login/options` and
  `/auth/passkeys/login/verify` with its.** Until then a new `/auth/…` route is an *account*
  path by construction (a session required, no membership) — L3's register test will answer 401
  the moment it is written, which is the audited-once property working as intended, not a bug.
- **`/redoc` is in `LOOPBACK_ONLY_PATHS`** beside `/docs`, `/docs/oauth2-redirect` and
  `/openapi.json`: FastAPI mounts all four as plain `Route`s, and the audit refuses to skip a
  route object it cannot classify (`AssertionError: unclassifiable route object …`), so the
  fourth had to be named. **Tuple syntax:** an entry ending in `/` is a prefix, any other is
  exact, and exact wins — which is how `/auth/login` is public under the `/auth/` account
  prefix. Loopback paths are refused to a *member* from a non-loopback peer too: the rule is the
  peer, never the session.
- **The audit found 118 API route × method pairs** (the plan's 113 at `cfc1669` plus L2's five:
  `POST /auth/logout`, `POST /auth/exchange`, `GET /auth/sessions`, `DELETE
  /auth/sessions/{id}`, `POST /auth/sessions/revoke-others`), plus the 4 FastAPI docs routes and
  the 3 websocket endpoints — 122 HTTP pairs walked anonymously *and* with a no-membership
  session (a fresh session per route, because the walk passes `/auth/logout` and `DELETE
  /auth/sessions/1`, which would otherwise end the walker's own). The gate's refusals carry a
  spelled-once `detail` (`NOT_LOGGED_IN` / `NOT_A_MEMBER`), which is how the test tells the
  gate's 401 from a public route's own (`/auth/exchange` without a bearer is *its* 401, not the
  gate's). **Both sabotages were tried on this tree and behaved:** an unguarded
  `@app.get("/probe")` in `main.py` → the audit **passes** (1 passed in 12.2 s — the gate
  covers it); `"/probe"` appended to `PUBLIC_PATHS` → the audit **fails** with
  `AssertionError: '/probe' is listed but is not a route` (1 failed in 5.6 s). Both files were
  restored (`grep -c '"/probe"'` → 0 in each).
- **Which `X-Forwarded-For` hop is trusted, and why:** entry **1 from the right** — the one
  Caddy itself wrote — because `docker-compose.yml` sets `TRUSTED_PROXY_HOPS: "1"` (L1) and
  Caddy is the only proxy in front of the backend. Counting from the right is correct whether
  Caddy *appends* to a client-supplied header or *replaces* it (the plan's open question): in
  both cases the rightmost entry is Caddy's own observation and everything left of it is
  client-supplied. In production the backend's socket peer is Caddy's bridge address (`172.x`,
  never loopback), so the loopback carve-out is unreachable from the internet. **A loopback peer
  counts as one hop** (`max(hops, 1)`): vite's dev proxy connects from `127.0.0.1` and, as L0
  measured, sends **no** `X-Forwarded-For` at all, so dev falls back to the peer and every dev
  caller shares one bucket — fine for a dev box, and a chain shorter than the configured hops
  always falls back to the peer, never to a client-chosen entry. `client_ip` runs once per
  request in the gate and lands in `request.state.client_ip`, which is where the limiter and
  `AuthSession.ip` read it (measured on the stack: `ip = 127.0.0.1` through vite).
- **One claims builder:** `services/groups.py::build_claims(s, player_id, session_id)` is what
  the gate writes into `scope["state"]["claims"]` *and* what login / exchange answer with, so a
  fresh login and the next request cannot describe one person two ways. Shape:
  `{player_id, player_name, role, site_admin, session_id, groups: [{id, slug, name, role}]}` —
  `role` is the *effective* role here (`effective_role`), `groups[].role` the raw membership
  role. Every key the routers read off the JWT (`player_id`, `player_name`, `role`) kept its
  name; `sub`/`iat`/`exp` were read by `/me` alone and are gone. `DEFAULT_GROUP_SLUG` stays
  spelled in `auth_migration.py` (L1 put it there first) and `groups.py` re-exports it rather
  than editing L1's file.
- **`me_payload(s, claims)` lives in `services/sessions.py`**, not in a router — `GET /me`,
  `/auth/login` and `/auth/exchange` all return it, and a router importing a router is the shape
  `AGENTS.md` warns about. `has_passkey` reads the `Passkey` table (zero rows until L8) rather
  than being a literal `False`, so L8 changes nothing here. L3's planned
  `accounts.account_summary` can feed it.
- **A login or exchange that *presents* a live session revokes it first** (`_start_session`):
  the browser is about to overwrite that cookie, so the row could never be used again and
  would only sit in the device list for 90 days. Found by the first smoke run, where the shared
  test client's Editor session vanished the moment `login(client, "Editor2", …)` ran through its
  jar — so **the `login()` helper sends an explicit empty `Cookie` header** (the other half of
  the measured "explicit header beats the jar" fact) and **reads the token from `Set-Cookie`,
  not from the jar**: after a login the jar briefly holds two cookies of that name (domain
  `testserver.local` from the response and the fixture's domain-less one) and
  `client.cookies.get` raises `CookieConflict`. The fixture's own cookie is set domain-less
  (`client.cookies.set(name, value)`), which httpx sends to any host — measured, not assumed.
- **No timing oracle on a name:** an unknown name, or an account with `password_hash NULL`,
  is verified against a dummy argon2 hash (one per hasher, built lazily) before the same 401, so
  "does this name exist" costs the same time either way.
- **The exchange has no per-account bucket** — an unverifiable token names no account — so it
  shares login's IP and global buckets (`limits_for("login", ip=…)`), and a bad token counts as
  a failure there. It ignores the JWT's `role` claim on purpose: the account and its
  memberships decide, so a token minted as `admin` a season ago logs in as whatever the person
  is today (tested). Measured on the stack: the 217-char JWT L1's tree minted was exchanged
  for a `kind="exchange"` session (`sessions: [('exchange', True), ('password', False)]`).
- **The three `/auth/sessions` routes are L2's** (the plan let either task own them; the
  session tests need them), so L3 leaves them. `GET` lists the caller's *live* rows,
  `DELETE /{id}` finds the id in the caller's own list and 404s otherwise,
  `POST /revoke-others` keeps the current — `RevokedOut{revoked}`.
- **Small rules added beyond the spec:** `resolve_session` deletes an expired row it finds (the
  row is dead anyway; the table stays small); the gate's 401 for a cookie that names no live
  session also sends `Max-Age=0`, so a browser stops presenting it; on a **websocket** scope the
  session is read but not touched (there is no response to carry the cookie; the PWA's HTTP
  requests do the touching); `create_session` refuses an unknown `kind`; `Secure` in dev-origin
  mode falls back to the request's own scheme when there is no `Origin` header (a same-origin
  GET, curl) — never to a proxy header; a rate-limited 429 is *not* counted as a hit, or a
  client already being refused could extend its own penalty and starve a shared IP.
- **A route that sets the cookie itself has the last word over the touch** — found by reading
  the gate again after it worked, not by a test. The renewal is appended to
  `http.response.start` *after* the route's own headers, so a stale-but-live session that
  logged out (the route sends `Max-Age=0`) or logged in as someone else (the route sends the
  new token) would have carried **two** `lk_session` cookies with the renewed *old* value
  last — and a browser keeps the last one, i.e. a token the server had just revoked. The
  gate now skips the renewal when the response already carries a `set-cookie` for
  `lk_session`; `test_a_route_that_sets_the_cookie_itself_wins_over_the_touch` asserts exactly
  one such header on both paths and **was run against the pre-fix behaviour first** (1 failed
  in 6.2 s), so it is known to bite.
- **The gate's cost, measured on the Pi against the dev-DB copy** (50 sequential keep-alive
  requests after 5 warm-ups, p50): `GET /tournaments` **30.9 ms** anonymous and **32.3 ms**
  with a bearer token on L1's tree; **35.5 ms** with the cookie on this tree (three runs:
  35.5 / 35.5 / 35.4). An anonymous request costs 0.5 ms (a 401 before any DB work). The
  resolve itself was micro-timed in-process: **3.4 ms** through the threadpool at first (five
  queries — SQLAlchemy's per-query floor is ~0.4–1.5 ms here), **2.7 ms** after folding the
  account+player lookup into one join and taking the current group from the membership rows
  already in hand (three queries: session by hash, account⋈player, memberships⋈group). The
  threadpool hop is 0.4 ms of that; opening the NullPool session 0.1 ms. `/me` answers in
  7.5 ms all in, a 64 px avatar in 6.8 ms. The touch is a write at most every 5 min per
  session and was not in these numbers (it never fired within a 50-request run).
- **`settings.py`:** `ws_require_auth` is gone (field, `load_settings` parameter, env);
  `jwt_secret` is now a *default* field (`""`, was the required `"dev-change-me"`) placed after
  `log_level`, so every constructor is keyword-only as before and the exchange answers 410 the
  day a secrets file stops carrying it. **Files edited outside L2's row for that reason,** all
  under §12's "every `Settings(...)` constructor": `tests/test_auth_migration.py`,
  `tests/test_settings_guard.py`, `tests/test_league_nation.py`,
  `tests/test_push_notifications.py` — each lost `jwt_secret=`/`ws_require_auth=` and nothing
  else. `tests/test_websocket_public.py` was renamed to say what it now proves (the cookie
  carries the handshake). `manage.py auth-preflight` still runs against a copy (`RESULT: OK`).
- **The ≈25 hand edits of §12 became 14 sites in 12 files**, not 9: the seven "reader" sites
  the plan listed, plus `test_comments_current.py`, `test_friendlies_current.py`,
  `test_match_swap_sides.py`, `test_players_permissions.py` and three in
  `test_tournament_endpoints_current.py` that asserted `in (401, 403)` for a header-less call —
  which the logged-in shared client would now have answered 200. Each became `anon.…` → 401.
  Two "reader" tests changed meaning rather than fixture: `test_ideas.py` and
  `test_idea_comments.py` used to assert that *nobody* sees no capabilities; nobody now sees
  nothing at all (401), so they assert that about a **member who did not write it**
  (`editor2_headers`) and add the 401.
- **Verified against the isolated stack** (backend 8233, vite 8253, DB + uploads + `cups.json`
  copied from the main checkout to a `mktemp -d`, the secrets file naming that copy; all PIDs
  killed by number): first boot logs the same `Auth migrated: 3 accounts, 1 group, 6
  memberships …` line L1 recorded and the second boot logs nothing; anonymous `GET
  /tournaments` **401**, `curl -sI` (HEAD) **401**, an unknown path **401**; `/health` **200**
  from `127.0.0.1`; `POST /auth/login` → `Set-Cookie: lk_session=…; HttpOnly; Max-Age=7776000;
  Path=/; SameSite=lax` (no `Secure` in dev-origin mode over http); `/me` → Roli · admin ·
  `altherren:owner` · `password_migrated: true`; through vite `:8253/api/tournaments` **401**
  anonymous and **200** with the jar, `/api/health` **200** (the proxy's loopback peer),
  `/api/players/1/avatar?w=64` **200 image/webp** with the cookie and **401** without; ten wrong
  passwords → 401, the eleventh → **429** with `retry-after: 599` and `{"detail":
  {"retry_after": 599}}`, and the *right* password is 429 too until the window passes (a
  slowdown, never a lockout); logout → `Max-Age=0` and the next `/me` 401.
- **What L4 inherits.** `make gen-types` moved `schema.d.ts` (+302/−21): `LoginOut` is gone,
  `MeOut` is `{role, player_id, player_name, site_admin, groups: MeGroupOut[], has_password,
  has_passkey, password_migrated, session_id}`, and `SessionOut`, `RevokedOut`, `MeGroupOut`,
  `LogoutBody` and the five new paths exist. **`npm run check` is red on exactly one root
  cause: `tsc` fails on `src/api/types.ts:118` (`S["LoginOut"]` no longer exists)**, and
  because that leaves `LoginResponse` error-typed, eslint reports three
  `@typescript-eslint/no-unsafe-argument` errors on `src/pages/LoginPage.tsx:36` (`res.token`,
  `res.player_id`, `res.player_name`). Nothing else in the frontend types off the removed
  fields; vitest is untouched at **839 tests in 88 files** (the L0 baseline). The wire L4
  codes against: `POST /auth/login` answers `MeOut`
  and *sets the cookie* (no token in the body); `POST /auth/logout {push_endpoint?}`; `POST
  /auth/exchange` with `Authorization: Bearer <old jwt>` → `MeOut` + cookie, 401 on a bad token,
  **410** once the secret is empty; `GET /me` is an *account* path (a session with no membership
  gets it, with `role: "none"` and `groups: []`); every other read is 401 without the cookie
  and 403 without a membership; the websocket handshake authenticates by the cookie and the
  `?token=` the client still appends is ignored. Until L4 the app in a browser is expectedly
  broken: `apiFetch` sends a bearer header nobody reads, and the login page stores a `token`
  field that is no longer there.
- **Not done here, and why:** the `Makefile`'s `AUTH_DEV_ORIGIN=1 APP_ENV=development` on the
  backend recipes (L1's leftover; the file is not in L2's row and it matters only for passkeys —
  `make backend` boots fine, pinned https origin, guard passes); `backend/secrets.json.example`
  and `README.md` still show `ws_require_auth` (L15's files; an unknown key in a secrets file is
  ignored by `load_settings`, so nothing breaks). **The main checkout's
  `frontend/.env.local` must be switched to the two relative lines the moment Roli moves his dev
  servers onto this branch** — L0 left CORS in place so the absolute lines kept working; L2
  removed it, and a cookie set by `:8001` is invisible to a page on `:8000`. Nothing in the
  main checkout was touched.
- `make lint` clean. `make test`: **373 passed in 19:05** on a quiet Pi (L1's 334 plus 39:
  `test_auth_gate.py` 14, `test_sessions.py` 16, `test_rate_limit.py` 9; nothing pre-existing
  moved), against the plan's 303 / 11–15 min — the `test` argon2 profile in `conftest.py` took
  back the per-test migration cost L1 measured, and the audit test alone walks 122 routes twice
  (12 s). `cd frontend && npm run check`: **red on the one
  root cause above** (tsc 1 error, eslint 3 errors, all `LoginOut`/`LoginResponse`), vitest
  **839 passed in 88 files**; `make gen-types` re-run is byte-identical (md5 checked).

## L3 — The account and group API  ☑

**The gap.** After L2 an account can log in and out and nothing else: no registration, no
invite, no reset, no password change, no admin surface, no owner role, no `group_id` on a new
tournament, and `manage.py`'s five escape-hatch commands are stubs.

**Verify first.**
```bash
grep -n "/register\|/redeem\|/reset\|/password\|/sessions" backend/app/routers/auth.py   # → only /sessions (L2)
ls backend/app/routers/admin.py                                                            # → no such file
grep -n "group_id" backend/app/routers/tournaments.py                                      # → 0
```

**The change.**
1. **`services/accounts.py`** — `name_key(name)`, `find_account_by_name`, `ensure_name_free(s,
   name, *, except_player_id=None)` (409), `register(s, *, code, display_name, password,
   hasher) -> Player` (§8), `set_password(s, account, plain, hasher, *, origin="set")`,
   `remove_password(s, account)` (409 without a passkey — reads `Passkey` rows; zero until L8),
   `change_password(s, account, current, new, hasher)`, `account_summary(s, player_id) -> dict`
   (the `MeOut` tail: `has_password`, `has_passkey`, `password_migrated`).
   `routers/players.py::create_player` and `patch_player` call `ensure_name_free` (case-
   insensitive now; `create_player` no longer returns an existing row silently — 409 like
   `patch_player`), and `create_player` also creates the `Account(password_origin="none")` row
   and the `altherren` membership, because an admin-created player is a member by intent.
2. **`services/invites.py`** — `CODE_ALPHABET`, `new_code()`, `format_code(code) ->
   "ABCD-EFGH"`, `normalize_code(raw)`, `create_invite(s, *, group_id, created_by, note) ->
   tuple[InviteCode, str]`, `redeem_invite(s, *, code, player_id) -> Group` (one generic
   `bad_request("That code is not valid")` for unknown / expired / spent, each logged with its
   real reason), `list_live_invites(s, group_id)`, `revoke_invite(s, invite_id, group_id)`.
3. **`services/reset_links.py`** — `create_reset(s, *, player_id, created_by) ->
   tuple[PasswordResetToken, str]`, `reset_url(settings, token)`, `consume_reset(s, token) ->
   Account` (unknown / expired / used → one generic 400).
4. **`services/groups.py`** (adds) — `set_member_role(s, *, group_id, player_id, role,
   actor_claims)` (owner+ of that group or site admin; refuses to demote the last owner, 409),
   `roster_for(s, claims) -> list[Player]` (members of every group the caller is in; site admin
   → everyone), `group_prefix_for_push(s, player_id) -> str` (`"<Group name> · "` when the
   player has ≥2 memberships, else `""`).
5. **`services/device_label.py`** — `device_label(user_agent) -> str`: `iPhone · Safari`,
   `iPad · Safari`, `Android · Chrome`, `Mac · Safari`, `Windows · Chrome`, `Linux · Firefox`,
   else `Unknown device` — six regexes, no dependency, a table test.
6. **`routers/auth.py`** (adds) — `POST /auth/register`, `POST /auth/redeem`, `POST /auth/reset`,
   `POST /auth/password {current_password?, new_password}`, `DELETE /auth/password`,
   `GET /auth/sessions`, `DELETE /auth/sessions/{id}`, `POST /auth/sessions/revoke-others` (the
   last three may already be L2's — if so, leave them). Register / reset mint a session and
   return `MeOut`. Limits per §9.
7. **`routers/admin.py`** — `GET /admin/accounts` (site admin: every player; owner: members of
   the caller's groups) → `AdminAccountOut{player_id, display_name, site_admin, role,
   password_origin, has_passkey, session_count, last_seen_at}`; `GET
   /admin/accounts/{pid}/sessions` → `SessionOut[]`; `DELETE /admin/sessions/{sid}`; `POST
   /admin/accounts/{pid}/revoke-sessions`; `POST /admin/invites {note}` (owner+ of `altherren`
   — part 1: the current group) → `InviteCreatedOut{code, expires_at, note}` (**the only time
   the code is readable**); `GET /admin/invites` → live ones without the code; `DELETE
   /admin/invites/{id}`; `POST /admin/reset-links {player_id}` (**site admin only** — a reset
   takes an account over) → `ResetLinkOut{url, expires_at}`; `PUT
   /admin/groups/{slug}/members/{pid}/role {role}`. Sessions/revoke on other people: site admin
   only; owners see accounts and mint invites. `require_owner` on the router, `require_admin`
   on the four admin-only routes.
8. **`group_id` on writes** — `routers/tournaments.py::create_tournament`,
   `routers/friendlies.py::create_friendly_match`, `routers/ideas.py::create_idea`: `group_id =
   current_group(s).id`. **`GET /players`** → `roster_for`. Push: `NotificationDispatcher
   .enqueue_personal_for_player` / `enqueue_for_player` prefix the title with
   `group_prefix_for_push` — one place, the dispatcher's enqueue, so no text key changes.
9. **`manage.py`** — the five bodies: `reset-link --player <name>`, `set-password --player
   <name>` (getpass, twice), `make-admin --player <name> [--revoke]`, `invite --group
   <slug> [--note]`, `sessions --player <name> [--revoke-all]`. Each resolves the player by
   `name_key`, prints one line, commits, exits 0; `--db-url` and `--secrets` as the others.
10. `make gen-types`; `types.ts` aliases for the new `*Out`s (L4 owns `types.ts` in group B —
    **L3 writes only `schema.d.ts`**, and L4 adds the aliases from it: coordinate by L3 committing
    `schema.d.ts` first and L4 rebasing its aliases on it).

**Definition of done.**
- ☑ `tests/test_accounts.py` (≈30): register happy path (row, account, membership, cookie,
  code spent); the code twice → generic 400; expired → same message; name taken by case
  (`"flo"` vs `Flo`) → 409; password 9 chars → 400; redeem from inside; reset link mints,
  consumes, ends other sessions, second use fails; password change wrong current → 403; remove
  password without passkey → 409; `create_player` collides by case → 409 and creates the
  account + membership.
- ☑ `tests/test_admin.py` (≈20): the owner/site-admin split on every route; last-owner demotion
  refused; invite listing never carries the code; reset link for a player with no login gives
  them one; `GET /players` hides a no-group account and shows it after redeem.
- ☑ `manage.py reset-link --player Roli` against the stack's copy prints a URL that the reset
  page (L5) will consume — for L3, `curl` the token to `/auth/reset` and log in with the new
  password.
- ☑ `make test`, `make lint`, `make gen-types` committed.
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §6: the account and admin endpoints, who may call each, the generic
refusal rule, the roster rule; §8: the five commands.

**Deviations.**
- **Files touched outside L3's row, each for a stated reason:** `backend/app/main.py` (two lines —
  import and `include_router` for the new `routers/admin.py`; nothing else registers a router);
  `backend/app/auth_gate.py` (L2's handoff: `PUBLIC_PATHS` gains **`/auth/register`** and
  **`/auth/reset`**, nothing else — `/auth/redeem` is deliberately *not* public, it stays an account
  path because redeeming as an existing account needs that account's session; L2's audit walks all
  fourteen new route × method pairs (five `/auth/…`, nine `/admin/…`) unchanged and passes); `backend/tests/test_sessions.py` (one
  assertion: L2 pinned `device_label == ""`, which was the pre-L3 state — a session minted by the
  test client now reads `"Unknown device"`). `conftest.py` was not touched; its
  `create_nogroup_account` still builds the rows directly, which is exactly the state `register`
  can produce minus the membership.
- **`account_summary` was not written**: `services/sessions.py::me_payload` (L2) already *is* that
  summary and every account endpoint answers `MeOut` through it; a second function would have been
  a second answer to "does this account have a password". `accounts.has_passkey` exists for
  `remove_password` (and L8). **`session_out(row, current_id)`** moved from `routers/auth.py` into
  `services/accounts.py` so `/auth/sessions` and `/admin/accounts/{pid}/sessions` share one shape
  without a router importing a router.
- **Login surface, as shipped** (all in `routers/auth.py`, thin): `POST /auth/register
  {code, display_name, password}` → `MeOut` + cookie (`kind="register"`), public; `POST
  /auth/redeem {code}` → `MeOut` (the fresh groups), account path; `POST /auth/reset {token,
  password}` → `MeOut` + cookie (`kind="reset"`), public; `POST /auth/password {current_password?,
  new_password}` → `MeOut`; `DELETE /auth/password` → `MeOut`. One wrapper (`_counted`) runs each
  rate-limited body: 429 before it runs, **every 4xx it raises counted**, a success recorded.
- **Rules decided here, beyond the section's text:**
  - **Register checks the code first**, before the name and the password, and *spends* it last,
    in the same transaction as `Player` + `Account` + `GroupMembership` + the session. So a caller
    without a valid code cannot learn whether a name is taken (tested), and a 409 name / 400
    password refusal leaves the code usable for the second try (tested). The spend is a
    **conditional `UPDATE … WHERE redeemed_at IS NULL`** — two requests racing for one code cannot
    both win; the reset token is spent the same way.
  - **Reset validates the password before spending the token**, so a too-short password does not
    burn the link. **A new reset link deletes the player's previous unused ones** — the newest is
    the only one that works, which is how a link sent to the wrong chat is killed.
  - **`POST /auth/password` is rate-limited on the `login` family's account key** (10 wrong
    current passwords / 10 min → 429): a stolen session must not become a free password oracle.
    A password change **does not** end the account's other sessions (the plan is silent; every
    added state is a way to log someone out by mistake) — the reset link does, as specified. An
    account with no password (reset pending, passkey-only later) sets its first without a current
    one.
  - **Redeeming into a group you are already in is 409** and leaves the code unspent; a code
    always grants `member`, never `owner`.
  - **The last owner of a group cannot be demoted by anyone, the site admin included** (409). The
    section says "a site admin may do anything"; read as "may act without being a member", not as
    "may leave a group with nobody who can invite". Several owners are fine; an owner may demote
    another owner while two remain.
  - **`PATCH /players/{id}` moves `Account.name_key` with the rename**, in the same transaction —
    the display name *is* the login name; without this a renamed player would log in under the old
    name and the old key would block the name for everybody else. Recasing one's own name is
    allowed. `ensure_name_free` checks every `Account.name_key` **and** every `Player` (an old-code
    row without an account), so neither register nor the admin routes can write a pair the boot
    migration would refuse. **`POST /players` keeps its looser rule** (non-empty, no 2–40 limit —
    the existing tests create players called `A`), but now answers **409** for a taken name where
    it used to return the existing row, and writes `Player` + passwordless `Account` + `altherren`
    membership in one commit (L1's handoff).
  - **Reset-link URLs:** `{origin}/g/altherren/reset#<token>`; `origin` is the pinned
    `auth_origin`, except in dev-origin mode where the admin's request `Origin` wins when it sent
    one (so a link minted on `http://192.168.178.78:8000` points back there, measured). `manage.py
    reset-link` uses `auth_origin` and takes `--origin` to override.
- **The push prefix lives in `NotificationDispatcher._payload_for`**, called by `_deliver_one` per
  recipient row — not in `enqueue_personal_for_player` / `enqueue_for_player` as the section said.
  The rule is *per recipient* ("only when the recipient is in several"), the enqueue does not know
  who receives a broadcast, and `to_payload` re-renders the title from the text key per language,
  so a prefix written into `PushMessage.title` at enqueue would have been overwritten. One place
  still; no text key changed. `group_prefix_for_push(s, player_id, group_id=None)` names the
  current group when none is given (part 1 has one). Tested through the real `_deliver` with the
  HTTPS POST faked: the two-group recipient gets `Altherren · <title>`, the one-group recipient
  the plain title.
- **Admin routes, as shipped** (`routers/admin.py`, `require_owner` on the router): owner+ —
  `GET /admin/accounts` (site admin: every player incl. uninvited registrants; owner: members of
  their groups; `role` is the **effective** role in the current group), `POST /admin/invites
  {note}` → `InviteCreatedOut{id, code, group_slug, note, expires_at}`, `GET /admin/invites` →
  `InviteOut{id, group_slug, note, created_at, expires_at, created_by: PlayerRef|null}` (no code —
  asserted against the response *text*, formatted and normalised), `DELETE /admin/invites/{id}`,
  `PUT /admin/groups/{slug}/members/{pid}/role {role: owner|member}` → `AdminAccountOut`; **site
  admin only** (the four with `require_admin`) — `GET /admin/accounts/{pid}/sessions` →
  `SessionOut[]` (`current` = the admin's own), `DELETE /admin/sessions/{sid}`, `POST
  /admin/accounts/{pid}/revoke-sessions` → `RevokedOut`, `POST /admin/reset-links {player_id}` →
  `ResetLinkOut{player_id, url, expires_at}`. `MemberRoleBody.role` is a `Literal`, so an unknown
  role is FastAPI's 422.
- **`device_label`** recognises iPhone/iPad/Android/Windows/Mac/Linux × Edge/Firefox/Chrome/Safari
  (Chrome/Firefox/Edge on iOS by `CriOS`/`FxiOS`/`EdgiOS`; the installed iOS PWA, whose UA has no
  `Safari/` token, still reads `iPhone · Safari`); curl and the test client are `Unknown device`.
  It is written at mint time by `routers/auth.py::_start_session` through `create_session`'s
  existing `device_label` parameter — `services/sessions.py` was not touched.
- **`group_id` on writes**: `create_tournament`, `create_friendly_match`, `create_idea` stamp
  `current_group(s).id`; the three list endpoints carry the `# part 2: filter by group` comment
  (for tournaments it sits on the router's call to `build_tournament_list`, whose service file is
  not L3's). One test creates one of each and asserts the column.
- **The five escape-hatch commands** each accept `--secrets` / `--db-url` after the subcommand too
  (the preflight's `SUPPRESS` precedent), resolve the player by login name case-insensitively,
  configure the engine **without** `init_db` (no seeding, no migration, no sweeps against a live
  server's database), print one line and exit 0, or print why on stderr and exit 1.
  `make-admin` gained the `--revoke` the section names (L1's parser lacked it); `invite` gained
  `--note`; `reset-link` gained `--origin`. **`set-password` reads the two entries with
  `getpass` on a terminal and as two stdin lines otherwise** (`docker compose exec -T`, a test) —
  getpass alone would fall back to `/dev/tty` and hang a piped run; the password is never echoed.
  **Tested twice:** as subprocesses against the test app's own database file in
  `tests/test_admin.py` (7 tests: each command's success, `set-password`'s two refusals, an
  unknown player and an unknown group → exit 1), and by hand against the stack's DB copy below.
- **Verified against the isolated stack** (backend **8234** on `127.0.0.1`, dev DB copied from the
  main checkout to a scratch dir outside the repo, secrets file naming that copy, the PID killed by
  number; no vite — every check is a backend curl, so the proxy is L0's measurement, not this
  one's): first boot logged L1's line (`Auth migrated: 3 accounts, 1 group, 6 memberships …`).
  **Escape hatch:** `reset-link --player roli` → `https://lorbeerkranz.xyz/g/altherren/reset#…`,
  exit 0; that token to `POST /auth/reset` → **200** `MeOut` (admin, owner of altherren); the same
  token again → **400** "That reset link is not valid"; login with the new password **200**, the
  old **401**. `set-password --player ROLI` (piped) → exit 0, login **200**. `make-admin --player
  Berni` → `/me` says `admin`, `site_admin: true`; `--revoke` → `editor`, `false`. `invite --group
  altherren --note rehearsal` → `LM9D-ZPBK`; registering with it → `Neuling · editor ·
  [altherren]`, `GET /tournaments` **200**. `sessions --player Roli` listed 3, `--revoke-all`
  revoked 3, the old cookie's `/me` **401**. **API:** a login with an iPhone UA lists as
  `iPhone · Safari`; `GET /admin/accounts` → all seven players with role / origin / sessions;
  `POST /admin/invites` → `NH7Q-XC99` once, `GET /admin/invites` → the row without it; `POST
  /admin/reset-links` with `Origin: http://192.168.178.78:8000` → a link on that origin;
  anonymous `/admin/accounts` **401**, anonymous `/auth/redeem` **401**, anonymous
  `/auth/register` with a bad code **400** (public, reached the route).
- **What L4 / L5 / L6 / L7 inherit** — the wire is in `schema.d.ts` (committed with the response
  models): `RegisterBody`, `RedeemBody`, `ResetBody`, `PasswordChangeBody`, `InviteCreateBody`,
  `ResetLinkCreateBody`, `MemberRoleBody`; `AdminAccountOut`, `InviteCreatedOut`, `InviteOut`,
  `ResetLinkOut`; every account endpoint answers `MeOut`. Refusal texts the UI may show verbatim:
  `"That code is not valid"` (every bad code), `"That reset link is not valid"` (every bad token),
  `"That name is taken"` (409), `"The current password is wrong"` (403), the password-length 400s
  from `passwords.validate_new_password`, `"You are already in this group"` (409 on redeem), the
  last-owner 409. The 429 shape is L2's (`Retry-After`, `{"detail": {"retry_after": n}}`) —
  register and redeem share one *redeem* bucket per IP (10/h) and one global (40/h). **L5**: the
  reset page posts `{token, password}` and gets a session; register/redeem both answer `MeOut`, so
  `NoGroupPage` can swap in the fresh `groups` without a second `/me`. **L6**: `role` in
  `AdminAccountOut` is effective (`admin` for a site admin whatever their membership), and the four
  site-admin routes answer an owner **403** — hide them for owners. **L7**: `POST /auth/password`
  needs `current_password` whenever `MeOut.has_password`; `DELETE /auth/password` is 409 until L8
  exists. **L8**: `accounts.has_passkey` and `remove_password` are ready; add the passkey sign-in
  paths to `PUBLIC_PATHS` as L2 said.
- **Gates:** `make lint` clean; `make gen-types` committed with the response models (re-run
  byte-identical); `make test` **442 passed** in 32:27 (373 at `db63bb9` in 31:37 on the same Pi, run against the first commit before the new tests existed) (L2's 373 plus 69: 45 in
  `test_accounts.py`, 24 in `test_admin.py`; nothing pre-existing moved except the one
  `test_sessions.py` assertion above). The two new files alone take ≈ 8 min on the Pi — the seven
  escape-hatch tests each start a Python subprocess.
- **Commits:** `8b207e1` (the code, the schemas and `schema.d.ts`, committed first so L4 could type against it) and this one (`manage.py`, the two test files, this section).

## L4 — The frontend switch: cookie session, no token anywhere, the login screen, `RequireAuth`, the offline rule  ☑

**The gap.** `AuthProvider` stores a JWT and threads it into 150 API signatures and ≈619 call
sites; `apiFetch` sets a bearer header; `connection.ts` puts `?token=` on the websocket URL;
`LoginPage` is a `Card` inside the shell saying "No login is needed for read-only viewing";
`RequireRole` knows a `reader`.

**Verify first.**
```bash
grep -rn "ea_fc_token" frontend/src | grep -v test/ | wc -l                 # → >0
grep -rn "Bearer" frontend/src/api/client.ts | wc -l                          # → 2
grep -rn '"reader"' frontend/src --include='*.ts' --include='*.tsx' | grep -v test/ | wc -l   # → 27
```

**The change.**
1. **`api/client.ts`** — `apiFetch(path, opts: RequestInit)`: no `token` option, no
   `Authorization`; `credentials` left at the default (`same-origin` — the cookie rides on
   same-origin requests); the 401 rule unchanged in words (`!path.startsWith("/auth/")` fires
   `api:unauthorized`) with one addition: a **429** throws `ApiError` whose `retryAfter: number
   | null` is parsed from the body's `retry_after` (falling back to the header). `apiUpload`
   likewise. `mediaUrl` **untouched** (byte-identical output — a DoD grep).
2. **`api/*.api.ts`** — every `token` parameter removed; `listTournaments(token?)` →
   `listTournaments()`; docstrings that said "token decides the capability flags" now say "the
   session decides them". `api/auth.api.ts`: `login(username, password): Promise<MeResponse>`,
   `logout(pushEndpoint: string | null)`, `me()`, `exchangeLegacyToken(token)`.
3. **`api/queryKeys.ts`** — every `token: string | null` argument becomes `viewerId: number |
   null` with `?? "anon"` in place of `?? "none"` (the keys' *purpose* — a per-caller payload
   must not be handed to another identity — is unchanged). **Pre-declare** for group C:
   `qk.auth.sessions()`, `qk.auth.passkeys()`, `qk.admin.accounts()`, `qk.admin.sessions(pid)`,
   `qk.admin.invites()`; `cachePolicy.ts` gains rows `["auth"]` (none, 5 s) and `["admin"]`
   (none, 5 s) with their `why`; `cachePolicy.test.tsx`'s guard keeps passing.
4. **`api/types.ts`** — `Role = "none" | "editor" | "owner" | "admin"`; `MeResponse =
   S["MeOut"] & { role: Role; groups: … }`; `LoginResponse` deleted; aliases for L3's `*Out`s
   (`SessionOut`, `AdminAccountOut`, `InviteCreatedOut`, `InviteOut`, `ResetLinkOut`,
   `MeGroupOut`) so L5–L7 import types and never `S[...]` directly.
5. **`auth/AuthContext.ts`** — `AuthStatus`, the `AuthState`/`AuthCtx` of §11 (`status`,
   `accountRole`, `role`, `playerId`, `playerName`, `siteAdmin`, `groups`, `hasPassword`,
   `hasPasskey`, `passwordMigrated`, actor fields; `setSession(me)`, `logout()`, `refresh()`,
   `canCycleRole`, `cycleRole`, `canSwitchActor`, `setActorPlayer`). `Role` re-exported from
   `api/types.ts`; `navConfig.tsx`'s own `Role` and `ROLE_RANK` read it too (one definition).
6. **`auth/AuthProvider.tsx`** — storage: `ea_fc_me` (JSON), the override and actor keys as
   today; `ea_fc_token`, `ea_fc_role`, `ea_fc_player_id`, `ea_fc_player_name` **read once for
   the exchange/migration and removed**. Boot effect: legacy token → `exchangeLegacyToken` →
   `setSession` / on 401 or 410 clear; else cached `me` → `authed` then `me()` refresh; else
   `me()` → `authed` or `anonymous` on 401, `unknown` on anything else. The `api:unauthorized`
   handler → `clearAuth` + the toast, as today. `logout` → `logout(pushEndpoint)` (the endpoint
   from `getBrowserPushSubscription()`), then `clearAuth`, then `navigate("/login")` is the
   caller's (Settings) job. `isTokenRejection` → `isSessionRejection`, same rule, same comment
   (A9).
7. **`auth/RequireAuth.tsx`** (new) — `status === "anonymous"` → `<Navigate to="/login"
   state={{from}}>`; `"unknown"` → `<PageLoadingScreen>` with the connection marker visible (the
   `RealtimeStatus` context is above it, or it renders its own `Offline` line from
   `navigator.onLine`); `authed && groups.length === 0` → `<NoGroupPage>` (L5's — L4 renders a
   placeholder `EmptyState` behind the same route so L5 replaces one element). `RequireRole`
   keeps its file, loses `reader`.
8. **`app/App.tsx`** — `/login`, `/register`, `/reset` are rendered **outside** `AppShell`
   (`AuthScreen` layout); everything else is `<RequireAuth><AppShell>…</AppShell></RequireAuth>`.
   `/register` and `/reset` point at `pages/auth/RegisterPage` / `ResetPage` — L4 creates them as
   one-line shells (`AuthScreen` + "Coming in L5") so the routes exist; L5 fills them.
9. **`pages/auth/AuthScreen.tsx`** (new) — the bare layout every auth page shares: `min-h-screen
   bg-bg-default` with the body's safe-area padding, a column `max-w-sm mx-auto px-4`, the logo
   (`/icon-512.png`, 96px, `rounded-2xl`) and the app name (`text-xl font-semibold`) above one
   `card`; children inside; the theme applied by `<html data-theme>` as everywhere.
10. **`pages/auth/LoginPage.tsx`** (moved) — inside `AuthScreen`: `Input` username
    (`autoComplete="username"`, `autoCapitalize="none"`), `Input` password
    (`autoComplete="current-password"`, an `Eye`/`EyeOff` toggle as the field's trailing icon
    button, `Button size="sm" iconOnly`), `Button` solid full-width "Log in", the error as one
    `text-xs text-error` line under the form (**not** a toast — the toast viewport lives in the
    shell), `RetryCountdown` on a 429 (disables the button, counts down `retryAfter`), and under
    the card two muted lines: "New here? **Register with a code**" (`Link` to `/register`) and,
    reserved for L9, the "Use a passkey" ghost button slot. No "read-only viewing" sentence. The
    `from` logic unchanged.
11. **`pages/auth/RetryCountdown.tsx`** (new) — `({ seconds }) => "Too many attempts — try again
    in Ns"`, `text-xs text-warn`, ticking; returns `null` at 0.
12. **`hooks/realtime/connection.ts`** — `addTokenToWsUrl` deleted; `buildWsUrlForPath(path)`.
    `useRealtime.ts` drops `token` from the three hooks and from `resyncPlayer`'s keys
    (`viewerId`).
13. **`push/usePushNotifications.ts`** — `usePushNotifications(enabled: boolean)`; the
    "previous token → delete subscription" effect is **deleted** (logout does it server-side);
    every `token` argument to `api/push.api.ts` gone. `PushSetupNotice`, `NotificationBell`,
    `AppShell` pass `status === "authed"`.
14. **The sweep** — every remaining `token` in `src/` outside `test/`: pages, hooks, `AppShell`'s
    prefetches (`viewerId`), `SettingsPage` (the Login/Logout buttons: logged-in is the only
    state now — the "Login" branch goes). Gate: `grep -rn "\btoken\b" frontend/src --include=*.ts
    --include=*.tsx | grep -v test/ | grep -v generated | grep -v "push\|vapid\|reset\|invite"` →
    0 (the four words are the legitimate other meanings; list the survivors in Deviations).
15. **Tests** — `authSession.test.tsx` rewritten for §11 (cached `me` + 401 → anonymous; cached
    `me` + network error → still authed; no cache + network error → `unknown`; legacy token →
    exchange called once, storage cleaned); the 15 files that mention `token` swept with the
    signatures; a `loginPage.test.tsx` for the 429 countdown and the error line.

**Definition of done.**
- ☑ `npm run check` green, `npm run build` green (structural).
- ☑ Browser, 390 and 1280, `blue` and `light`: `/login` renders with the logo, the card and no
  shell chrome (no top bar, no tab bar — `document.querySelector("#app-top-nav")` is null);
  wrong password → the red line, not a toast; the 11th wrong attempt → the countdown; right
  password → dashboard with the shell; reload → still in (cookie); revoke the session with
  `manage.py sessions --revoke-all` → the next request lands on `/login` with the toast; stop the
  backend → the app keeps showing cached pages with the `Reconnecting` marker and **does not**
  show the login screen; start it → live again.
- ☑ The exchange: set `ea_fc_token` in `localStorage` to a JWT minted by the old code (L1's
  rollback tree can mint one via `POST /auth/login` on the same DB copy), reload → logged in,
  `ea_fc_token` gone, `ea_fc_me` present.
- ☑ `mediaUrl` output unchanged: the existing `mediaUrl` tests pass untouched.
- ☑ `document.querySelectorAll("a a").length === 0` on `/login`.
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: `AuthScreen` (the bare auth layout), `RetryCountdown`, the login
page's error line (a form's own error is a line under it, never a toast); §5b: `Log in`,
`Log out`, `Register with a code`. `AGENTS.md` §2: `auth/` is three files; §6: the cache-policy
rows `auth`/`admin`; §10: the offline rule and the exchange.

**Deviations.**
- **When the app is logged out, as built.** `AuthStatus` is `unknown | authed | anonymous`
  and **only a 401 moves it to `anonymous`** — `isSessionRejection` is `status === 401` and
  nothing else: a 403 is the gate's "not a member" and never ends a session (tested), a 5xx, an
  abort or a `TypeError` keep whatever is on screen. With nothing cached and no answer the app
  is `unknown`: `RequireAuth` renders a bare boot screen (`data-auth-boot`, a `PageLoadingScreen`
  plus one line in the connection marker's own idioms — `WifiOff` muted "Offline" from
  `navigator.onLine`, `RefreshCw` in `warn` "Cannot reach the server — retrying" from the
  provider's `serverUnreachable`) and the provider **asks again** on `online`, on
  `visibilitychange` and every 15 s, because a loading screen that never re-asks is a login
  screen with extra steps. **Measured on the stack**: backend killed by PID → an in-app
  navigation to the cached dashboard still draws it, the marker reads `reconnecting`, the only
  API traffic is `/api/tournaments/live → 500` (vite's proxy answers **500**, not 502, on
  `ECONNREFUSED`) and there is no 401; a full **reload** with the server down still mounts the
  shell from `ea_fc_me` (`/me → 500` is no verdict); backend restarted → the marker clears by
  itself and 27 requests answer 200 with no 401.
- **"Session expired" is a line on the login screen, not a toast.** The toast viewport lives in
  `ShellInner`, which unmounts the moment `RequireAuth` navigates, so `showErrorToast` still
  fires (unchanged, deduped) but has no viewport. The provider therefore records
  `signedOutReason: "expired"` — set only when a 401 ends a session that was `authed`, never on
  a cold boot or a chosen logout — and `LoginPage` prints *"Your session has ended — log in
  again."* in `text-warn` above the form. Measured with `DELETE FROM authsession` on the copy
  (L3's `manage.py sessions` was a stub while this ran) → reload → `/me` 401 → `/login` with the
  line and `ea_fc_me` gone.
- **A late 401 must not erase the reason** — found on the desktop run, not the phone one: the
  sidebar's prefetches 401 before the boot's own `/me` does, the first one set "expired", and
  the boot's catch then called `clearAuth(null)` because the state was already anonymous. One
  `endSession()` now decides from the *first* 401 and ignores the rest (the `api:unauthorized`
  handler, the boot and `refresh()` all go through it).
- **One request per boot under StrictMode.** Dev mounts the boot effect twice; the exchange is
  a module-level in-flight singleton because a second POST would present the cookie the first
  one just set and L2 revokes a session that logs in over itself, and `/me` shares the same
  trick so "logged out → exactly one `GET /me → 401`" holds in dev too (measured: two before,
  one after).
- **A legacy token beside a cached session boots `unknown`.** The harness re-planted
  `ea_fc_token` on reload (an `addInitScript` runs on every navigation) and exposed it: the
  shell painted from `ea_fc_me`, fired its requests on the old cookie, the exchange revoked that
  cookie, and their 401s ended the session the exchange had just minted. In the app the two
  keys cannot coexist (the first exchange removes the legacy keys), but the provider now starts
  `unknown` whenever `ea_fc_token` is present, so the shell cannot fire before the exchange has
  settled — tested in `authSession.test.tsx`, and the harness plants the storage once per tab.
  The exchange keeps the token on a **network error** (retried next boot) and drops it on
  **401 / 403 / 410**, then falls through to `/me`. Measured: one `POST /auth/exchange → 200`,
  no `/me` on that boot, all four `ea_fc_*` keys gone, `ea_fc_me` present; the reload after it is
  a plain cookie boot (`/me → 200`, no second exchange).
- **`logout()` needs the server.** It is `POST /auth/logout {push_endpoint}` (the endpoint from
  `getBrowserPushSubscription()`, raced against 1.5 s so a stuck service worker cannot hold the
  button), then `anonymous`; an `ApiError` answer clears anyway (the row is gone either way),
  a request that never arrived **rejects and changes nothing** — clearing locally would log out
  a device whose cookie the next boot finds alive. `SettingsPage` awaits it, then
  `navigate("/login", {replace: true})`, and shows an error toast on a network failure
  ("Could not reach the server — you are still logged in."). The wording is §5b's: "Log out" on
  the button and the dialog, "Login" is gone with the reader.
- **The previous identity's cache is cleared on login, not on logout.** `setSession` (login,
  register, reset, exchange) calls `qc.clear()` through `useContext(QueryClientContext)` —
  optional, so the tests' bare `<AuthProvider>` still mounts — before the shell can render:
  `["tournaments"]` carries `can_edit` flags under a key that names no viewer. Clearing on the
  way *out* would race the shell's still-mounted observers; on the way in nothing is mounted.
- **`usePushNotifications()` takes no argument** (the plan said `(enabled: boolean)`): it is
  only ever mounted inside the shell and reads `status`/`playerId` from `useAuth()` itself, so
  `qk.push.subscriptions(viewerId)` names the viewer without a prop threaded through three
  components. The "previous token → delete subscription" effect is deleted (logout carries the
  endpoint); `PushSetupNotice`, `NotificationBell` and `PushNotificationsSettings` lost their
  `token` prop, and the settings panel its "Login required" state.
- **An owner is at least an editor.** Twelve sites spelled `role === "editor" || role === "admin"`
  and would have refused an `owner` everything; they now read `atLeast(role, "editor")`, with
  `ROLE_RANK` and `atLeast` in `auth/AuthContext.ts` (the one ranking `navConfig`,
  `RequireRole` and the "view as" cycle read). Every nav destination is `min: "editor"`,
  `visibleDests("none")` is empty, and `navConfig.tsx` no longer re-exports `ROLE_RANK` — a
  capitalised value re-export trips `react-refresh/only-export-components`.
- **Pre-declared for group C** (never touch `queryKeys.ts` / `types.ts` / `cachePolicy.ts`):
  `qk.auth.all()`, `qk.auth.sessions()`, `qk.auth.passkeys()`, `qk.admin.all()`,
  `qk.admin.accounts()`, `qk.admin.sessions(pid)`, `qk.admin.invites()`; cache-policy rows
  `["auth"]` and `["admin"]` (none, 5 s); aliases `Role` (`"none" | "editor" | "owner" | "admin"`),
  `GroupRole`, `MeGroup`, `MeResponse` (`role` and `groups[].role` narrowed), `AuthSession`
  (`SessionOut`), `RevokedCount` (`RevokedOut`), `PasswordOrigin`, `AdminAccount`
  (`AdminAccountOut` with `role: Role`, `password_origin: PasswordOrigin`), `InviteCreated`,
  `Invite`, `ResetLink`. `LoginResponse` is deleted. **`PasskeyOut` cannot be aliased before L8's
  schema exists** — L8, which regenerates `schema.d.ts`, adds the one line
  `export type Passkey = S["PasskeyOut"]` to `types.ts` with it, and L9 imports that.
- **The plan's `token` grep leaves 49 lines, every one a different word:** `FilterPill`'s
  `token: "text" | "icon"` prop (`FilterPill.tsx`, `StatsFilterPill.tsx`,
  `FriendlyMatchesListCard.tsx`), `MatchSides`' `stars="token"` (`FriendlyList.tsx`),
  `blankNotice.ts`'s `token()` CSS-variable helper, design-token prose in `cupColors`,
  `keyboardOpen`, `RecordLine`, `Stars`, `ConnectionIndicator`, `CommentComposer`,
  `GuestbookSection`, `RecordBadges`, `StarsView`, `MatchList`, `MatchOverviewPanel`,
  `ConfirmDialog`, `PushNotificationsSettings`, `format.ts`, and the exchange's own name
  (`exchangeLegacyToken`, `LEGACY_TOKEN_KEY = "ea_fc_token"`). `ea_fc_token` → 2 (the constant
  and one comment), `Bearer` in `client.ts` → 0, `"reader"` → 0.
- **What else moved in the sweep, beyond signatures:** `api/*.api.ts` lost 60 `token`
  parameters across 12 modules; `ApiError` gained `retryAfter` (a 429's `detail.retry_after`,
  falling back to `Retry-After`) and a `detail` getter (the server's own sentence, for a form's
  line); `useSeenItems`' config functions take no token; `TournamentCommentParts`'
  `CommentCardContextValue.token`, `IdeaCardHandlers.token`, `IdeaComments`' and
  `ProfileHeader`'s `token` props are gone; the Ideas board always renders its composer and
  vote button (the "Log in as a player to post" footer and the read-only vote chip went with
  the reader); `usePlayerProfileWS(playerId)` reads the viewer itself; `AdminPanel`'s `role`
  prop is `Role`. `mediaUrl` is byte-identical and `mediaSizes.test.ts` passed untouched.
- **The login screen** (`pages/auth/LoginPage.tsx`, inside `AuthScreen`): the 96 px
  `rounded-2xl` logo, "Lorbeerkranz" `text-xl font-semibold`, one `card` at `max-w-sm`, a
  `Name` field (`autoComplete="username"`, `autoCapitalize="none"`) — "Name", because the
  login identifier *is* the display name — a hand-built password field (a `<button>` inside
  `Input`'s `<label>` is invalid HTML) with the `Eye`/`EyeOff` `size="sm" iconOnly` toggle, one
  full-width solid "Log in", the error as `text-xs text-error` `role="alert"`, `RetryCountdown`
  in `text-warn`, and under the card "New here? Register with a code ›" as §6's muted text +
  chevron. An already-authed visitor to `/login` is sent on to `from`. **Measured** at
  390/1280 × blue/light: logo 96×96 and card (358 / 384 px wide) both centred to the pixel
  (cx 195 / 640), card at y=200, no `#app-top-nav`, no tab bar, `a a` = 0; wrong password →
  "Wrong username or password" in `rgb(248,113,113)` / the light red, no toast element; ten
  401s then a 429 → "Too many attempts — try again in 594s" in amber with the button disabled
  (Flo's bucket, so Roli's stayed clean). **`RetryCountdown`'s first cut fired `onExpire` on
  the very render that received `seconds`** (its `remaining` state lagged one render) and the
  countdown never showed — caught only in the browser, so `loginPage.test.tsx` now drives the
  429 path on fake timers and would have caught it.
- **Tests: 855 in 89 files** (baseline 839 in 88; `authSession.test.tsx` rewritten to 15 for
  the three boot outcomes, the retry, the 403, the late 401, logout and the exchange's four
  cases; `loginPage.test.tsx` new, 7; `guestbookIdentity.test.tsx` 5, driven by viewer ids
  with a stubbed server that answers by "whose cookie"; `queryKeys.test.ts` +1 for the
  pre-declared keys; `navConfig.test.ts` for the four roles; `bottomTabBar`/`navJump` seed a
  cached session through the new `src/test/authFixtures.ts`, because the shell renders for a
  member only). `npm run build` green: `index-*.js` **742.55 kB** (737.84 kB at Q-E; the
  pre-existing >500 kB hint).
- **Not done here, and why:** the backend was not touched, so no `make test`; L3's
  `manage.py sessions --revoke-all` was a stub during verification (the revoke was one SQL
  statement on the copy); `RegisterPage`/`ResetPage` render "Coming in L5" inside `AuthScreen`,
  `RequireAuth` renders an `EmptyState` placeholder for a no-group account (L5 replaces one
  element), `App.tsx` carries the `/admin` comment for L6 and `LoginPage` the slot comment for
  L9. The main checkout was not touched; the stack ran on 8235/8255 against copies under the
  scratchpad, and every PID was killed by number.

## L5 — Register, reset and "not in a group yet"  ☑

**The gap.** After L4 the login screen links to `/register`, which renders "Coming in L5";
`/reset#token` has no page; an account with no membership sees an `EmptyState`.

**Verify first.**
```bash
grep -c "Coming in L5" frontend/src/pages/auth/RegisterPage.tsx frontend/src/pages/auth/ResetPage.tsx   # → 1 each
grep -n "NoGroupPage" frontend/src/auth/RequireAuth.tsx                                                # → the placeholder
```

**The change.**
1. **`api/registration.api.ts`** — `register({code, display_name, password}): Promise<MeResponse>`,
   `redeemCode(code): Promise<MeResponse>`, `resetPassword({token, password}): Promise<MeResponse>`.
2. **`pages/auth/RegisterPage.tsx`** — inside `AuthScreen`, one `card`: `Input` "Invite code"
   (`autoCapitalize="characters"`, `autoComplete="one-time-code"`, `inputMode="text"`, a
   formatter that uppercases, strips everything outside the alphabet and inserts the dash after
   four characters — the value posted is the raw 8), `Input` "Display name" (the one the app
   shows; `autoComplete="username"`), `Input` "Password" with the eye toggle and a live hint
   `text-xs text-text-muted` "At least 10 characters" that turns `text-text-normal` once met
   (no other rule, no confirm field), `Button` solid "Register", the error line, the
   `RetryCountdown`. Success → `auth.setSession(me)` → `navigate("/dashboard", {replace:
   true})`. A `?code=ABCD-EFGH` in the URL prefills the field (a code pasted from WhatsApp as a
   link — the link is `{origin}/g/altherren/register?code=…`, and the admin page offers it as a
   copyable line next to the bare code, L6). Under the card: "Already have an account? **Log
   in**".
3. **`pages/auth/ResetPage.tsx`** — reads `location.hash.slice(1)` **or** `?token=`, then
   `history.replaceState` the URL to bare `/reset` **before** any request (racer's rule: no
   token in a URL the app keeps); no token → an `EmptyState` "This link is not complete — ask
   the admin for a new one." Otherwise: one password field with the eye toggle and the same
   hint, `Button` solid "Set password", the error line (a used or expired link gets the server's
   one generic message). Success → `setSession(me)` → dashboard. Note in the page's comment why
   there is no "confirm" field (the eye toggle is the confirmation, §9b's "light input" spirit).
4. **`pages/auth/NoGroupPage.tsx`** — `AuthScreen` with one card: "You're not in a group yet."
   (`text-lg font-semibold`), a muted line "Ask a member for an invite code and enter it here.",
   the same code `Input`, `Button` solid "Join", the error line; success → `auth.refresh()` (the
   shell mounts once `groups.length > 0`). A ghost `Button` "Log out" under it — an account
   with nowhere to go must still be able to leave. `RequireAuth` renders it in place of the
   placeholder.
5. **Settings → Account** gets nothing here (L7 owns `SettingsPage.tsx`); "join another group
   from inside the app" is reachable through `NoGroupPage` for a no-group account and, for a
   member, through L7's section (one code field, the same component: export `InviteCodeField`
   from `RegisterPage.tsx`'s sibling `pages/auth/InviteCodeField.tsx` so L7 imports it).

**Definition of done.**
- ☑ `registration.test.tsx` (≈10): the formatter (`abcd efgh` → shows `ABCD-EFGH`, posts
  `ABCDEFGH`; `O`/`0`/`I`/`1` refused by the formatter); the password hint state; the 429
  countdown; the reset page strips the fragment before the request (assert `history.replaceState`
  called before `fetch`); the no-token empty state.
- ☑ Browser, 390 / 1280, `blue` / `light`: register with a code minted by
  `manage.py invite --group altherren` → dashboard as the new player; that player is **absent**
  from `/players` on Roli's session until… no — a registered code *joins* them, so they are
  present; a second account registered with a **spent** code → the generic error. Log the new
  account out, log in, remove its membership by SQL (`DELETE FROM groupmembership WHERE
  player_id=…` on the copy) → reload → `NoGroupPage`; enter a fresh code → in. `manage.py
  reset-link` → open the URL → the bar shows bare `/g/altherren/reset` within the first frame
  (`performance.getEntriesByType("navigation")` shows no request carrying the token) → set a
  password → in.
- ☑ `npm run check` green.
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: `InviteCodeField` (the one code input, its formatter), the reset page
(no confirm field, the fragment rule); §5b: `Register`, `Join`, `Set password`, `Invite code`.

**Deviations.**
- **Four small files beside the three pages, all in `pages/auth/`, because the job already had
  two copies or would have had three.** `inviteCode.ts` (`CODE_ALPHABET`, `normalizeInviteCode`,
  `formatInviteCode`): the rule moved **out of L7's `InviteCodeField.tsx`**, which now imports it —
  a `?code=` in a register link has to be read by the same function the field uses, and a `.tsx`
  may export only a component. `PasswordField.tsx`: the eye-toggle field with the live
  "At least 10 characters" hint (`data-password-hint="met|unmet"`, muted → `text-text-normal`),
  used by register and reset. **It is the third hand-built copy in the tree** — `LoginPage` and
  L7's private `PasswordField` in `SecuritySection.tsx` are the other two — and I did not edit
  either (L4's and L7's files, both touched again by L9); **L9 should fold both into this one**.
  `password.ts` holds `MIN_PASSWORD_LENGTH = 10` (the server's floor, mirrored so the button can
  wait). `formError.ts::formErrorText` is the one error line of the three pages: the server's
  sentence verbatim, else "Could not reach the server — …".
- **`registration.api.ts` re-exports `redeemCode` from `account.api.ts`** (the reverse of the plan's
  direction, as L7 left it); `register` and `resetPassword` live here.
- **`NoGroupPage` hands the redeem's `MeOut` to `setSession`, not `refresh()`** — no second
  `GET /me`, and the cache clear that made L7 avoid `setSession` is right here: nothing is mounted
  under this screen. `RequireAuth` mounts the shell on the next render, on the URL the reader asked
  for; no navigation. "Log out" is a ghost button in `AuthScreen`'s `below` slot; a logout that
  never reached the server says "Could not reach the server — you are still logged in." as the
  error line (L4's rule: a logout needs the server). `RequireAuth.tsx`: the placeholder and its two
  imports gone, one element swapped, one comment line updated — nothing else.
- **The reset page reads the token once (state initialiser, router location: fragment, else
  `?token=`) and strips it in a `useLayoutEffect` with `navigate(…, {replace: true})`** — the
  router's own `replaceState`, so router and address bar agree, and it runs before the first paint
  and long before the only request (the submit). Other query params survive, `token` and the hash do
  not. A reload afterwards finds no token and shows the "not complete" state — deliberate: the link
  is used once and is kept nowhere (no `sessionStorage` either). The page is outside the shell, so
  `useRememberLocation`'s breadcrumbs and `lastLocation` never see it. **The one place the token
  survives is the browser's own `performance.getEntriesByType("navigation")[0].name`**, which is the
  document URL *with* its fragment (measured: it contains the token). That is not a request — a
  fragment never goes over the wire, and none of the 240 requests per run carried it in a URL or a
  `Referer` (measured) — but the DoD's phrasing ("the navigation entry shows no request carrying the
  token") is only true in that sense. A `?token=` link *is* sent with the page load; the server mints
  `#` links only.
- **An authed visitor to `/register` is sent to `/dashboard`** (an account in no group lands on
  `NoGroupPage` there, where a code goes). `/reset` does **not** redirect an authed visitor: a reset
  starts a fresh session and ends the others, which is right even when logged in.
- **Words:** "Invite code", "Display name" (placeholder "The name the others will see",
  `autoCapitalize="words"`), "Password" / "New password", **Register** (`UserPlus`), **Set password**
  (`KeyRound`), **Join** (`UserPlus`), **Log out** (`LogOut`); under the cards "Already have an
  account? Log in ›" (register) and "Know your password? Log in ›" (reset, both states); the
  no-token state is the plan's sentence as an `EmptyState`. No confirm field (the comment says why).
- **Tests: `registration.test.tsx`, 14** — the formatter (shown `ABCD-EFGH`, posted `ABCDEFGH`;
  `O0I1` refused; overlong capped), `?code=` prefill, the hint and the held button, a 409 verbatim
  with the code kept, the 429 countdown on fake timers, the reset page's `replaceState` asserted
  **before** `fetch` by `invocationCallOrder` (real `fetch` stubbed, `BrowserRouter`), `?token=`
  stripped, a spent link's line, the no-token state with no request, and the no-group page's join,
  bad code and log out. `npm run check` **895 in 92 files** (881/91 + 14 in 1); `npm run build`
  green (`index-*.js` 757 kB with L10's in-flight tree; the pre-existing >500 kB hint).
- **Measured** on the stack (8236/8256, a `sqlite3` backup of the main checkout's `app.db` and an
  empty uploads dir under the scratchpad; codes and links from `manage.py invite` / `reset-link`
  against the copy), Playwright Chromium, a fresh context per step, at **390 blue, 1280 light,
  390 light, 1280 blue** — every check passed in all four: no horizontal overflow, `a a` = 0, no
  `#app-top-nav`, the card at x=16 / w=358 (390) and x=448 / w=384 (1280), centred to the pixel
  (195 / 640). `?code=` lower case prefilled upper case; `ZZZZ-ZZZZ` → "That code is not valid";
  `rOLI` → "That name is taken"; a short password holds the button with the hint muted
  (`rgb(186,198,216)` blue / `rgb(74,70,66)` light) and it turns `text-text-normal` at ten, and
  the server's own 400 ("The password must be at least 10 characters long") left the code usable —
  **the same code then registered** `L5userN` → `/g/altherren/dashboard` with the shell, `/me` a
  member of Altherren. A second context with that spent code → "That code is not valid".
  `DELETE FROM groupmembership WHERE player_id=…` on the copy → reload → `NoGroupPage`; a bad code →
  the line; a fresh code → the shell on `/g/altherren/dashboard`. Reset (Berni, Flo, Rumpi, Atzi):
  on load the bar reads bare `/g/altherren/reset`, set password → dashboard as that player, the new
  password logs in (200), the same link a second time → "That reset link is not valid"; `/reset`
  with no token → the "not complete" line. **The limiter is real**: the third run's bad-code step
  hit `redeem`'s 10-per-hour IP bucket (register + redeem share it) — "Too many attempts — try again
  in 3521s" in `rgb(251,191,36)` with Register disabled — so the backend was restarted (by PID) to
  empty the in-memory buckets for the last two runs.
- **Seen, not mine:** the stack's first boot ran against a missing secrets file (my `cp` from the
  worktree's absent `backend/app.db` failed and the heredoc after it never ran), so it migrated
  **0 accounts** — every existing player passwordless — and the copy kept that shape; nothing here
  needed a migrated password. The worktree has no `backend/app.db`; the copy came from the main
  checkout, opened `mode=ro`. `backend/secrets.json` was never read.
- **Push could not have left this stack**: its secrets file was missing and then `{}`, no
  `PUSH_VAPID_*` in the environment and no `vapid_private_key.pem` in the worktree, so the dispatcher
  had no key. The coordinator's later rule (empty `pushsubscription` and `pushsubscriptionpreference`
  in the copy before booting, never a VAPID key in a throwaway secrets file) arrived after the stack
  was already torn down and the copy deleted; any stack started for L5 from now on does both.

## L6 — The admin page  ☑

**The gap.** No page shows who is logged in, from where, or on a migrated password; invites and
reset links exist only as `manage.py` commands and L3's endpoints.

**Verify first.**
```bash
ls frontend/src/pages/admin 2>/dev/null                    # → no such directory
grep -n '"admin"' frontend/src/ui/shell/navConfig.tsx      # → only the Role type
```

**The change.**
1. **`api/admin.api.ts`** — `listAccounts()`, `listAccountSessions(pid)`, `revokeSession(sid)`,
   `revokeAllSessions(pid)`, `createInvite(note)`, `listInvites()`, `revokeInvite(id)`,
   `createResetLink(pid)`, `setMemberRole(slug, pid, role)`.
2. **`navConfig.tsx`** — a new destination `{ key: "admin", to: "/admin", label: "Admin",
   icon: ShieldCheck, min: "owner", match: p => p === "/admin" || p.startsWith("/admin/") }`,
   placed **after Ideas**; the bottom bar's `exclude` list gains `"admin"` (five items are what
   fits, R5). `routeHierarchy.ts`: `/admin` is a destination (no change needed — anything not
   listed is one; say so in a comment next to Ideas' line if there is one).
3. **`pages/admin/AdminPage.tsx`** — `PageLayout title="Admin"`; `SectionTabs` via `useTabParam`
   with `accounts` (default) and `invites`; `RequireRole minRole="owner"` in `App.tsx` (L6 edits
   the one route line; L4 left a comment marking where).
4. **`pages/admin/AccountsTab.tsx`** — a `section-head` "Accounts" with a `FilterPill`-free
   filter: three `Chip`s in a `ChipGroup` — "All", "Logged in" (`session_count > 0`), "Migrated
   password" (`password_origin === "migrated" && !has_passkey`) — then a `List` of `ListRow`s:
   `leading` `AvatarCircle h-10 w-10` (no cups — this is not a present-tense surface), title the
   name with a `Pill` "site admin" / "owner" where true, subtitle `fmtCount(session_count,
   "device", "devices")` · `last seen <date>` (`formatDateTime` from `utils/format.ts`, the
   `de-AT` numeric shape) · "migrated password" in `text-warn` when it applies · "no login" when
   `password_origin === "none" && !has_passkey`; `onClick` opens `SessionsSheet`. Site admin
   only: a `trailing` ghost icon `Button` (`KeyRound`) "Create reset link" → `ConfirmDialog`
   (not irreversible, so no red block; subtitle "The link works once, for an hour.") → result
   shown in a `Modal` with the URL in an `inset font-mono text-xs break-all` and a "Copy"
   `Button` (`navigator.clipboard`, falls back to selecting the text). Owner+: a `trailing`
   ghost icon `Button` (`Crown`? **no** — the crown is the cup's; use `UserCog`) "Make owner" /
   "Remove owner", `ConfirmDialog`, subtitle says what an owner can do.
5. **`pages/admin/SessionsSheet.tsx`** — a `Modal` titled with the player's name: a `List` of
   sessions, each row `device_label` (title), `created <date> · last seen <date> · <kind>`
   (subtitle), a `trailing` ghost icon `Button` (`LogOut`) → `ConfirmDialog` "Sign this device
   out?" (reversible: "They can log in again."); a footer `Button` ghost "Sign out every
   device". Sessions on the site admin's own account are marked "this device" where `id ===
   me.session_id`.
6. **`pages/admin/InvitesTab.tsx`** — a `section-head` "Invite codes" with `Input` "Note (who is
   it for)" and `Button` solid "Create code" → the result `inset`: the code in `font-mono
   text-2xl tabular-nums tracking-wider` (the one place the code is ever shown), a "Copy code"
   button, a "Copy link" button (`{origin}/g/altherren/register?code=…`), and "Expires in 60
   min" muted; below, a `List` of live codes (note, created, expires, "revoke" trailing) —
   **without** the code, which the server does not return.
7. Empty states: `EmptyState` "No live codes." / "Nobody is logged in." per `DESIGN.md` §6.

**Definition of done.**
- ☑ `adminPage.test.tsx` (≈10): the three filters; the reset-link button absent for an owner
  who is not site admin; the invite result shows the code once and the list never does;
  `SessionsSheet` marks the current device.
- ☑ Browser, 390 / 1280, `blue` / `light`: as Roli, log in from a second context (a Playwright
  context with its own jar); the Accounts tab shows two devices on Roli; revoke the second →
  its next request is 401; create a code → register with it in a third context → the new
  account appears with "1 device"; create a reset link for Flo → open it in a fourth context →
  set a password → Flo is logged in there. The title centre on `/admin` at 320 / 390 / 430 is the
  screen centre (the Q13 measurement, since this is a new top-bar route).
- ☑ `npm run check` green.
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: the admin page's rows and sheet, "a secret is shown once, in
`font-mono`, with a Copy button, and a list never repeats it"; §10: `/admin` is a destination
(sidebar and drawer, not the bottom bar). `AGENTS.md` §2: `pages/admin/`; §10: the nav has eight
destinations, the bar still five.

**Deviations.**
- **Two files outside L6's row, each for a stated reason.** `auth/RequireRole.tsx` (L4's): an
  authed viewer below the route's role was sent to `/login`, whose "already authed → go to `from`"
  sent them straight back — a member opening `/admin` got a **blank page** with the title "Admin"
  (measured on the stack). With no reader any more everyone under `RequireAuth` is logged in, so a
  missing role now goes to **`/dashboard`** (`replace`); `/clubs`' `minRole="editor"` never
  triggered it because every member is an editor. `test/navConfig.test.ts`: it pinned "owner and
  admin see exactly what an editor sees", which L6 makes false by design — now owner/admin =
  editor's seven + `admin`, and `activeDest("/admin")`. **One shared piece inside the row:**
  `pages/admin/ShownOnce.tsx`, the one "secret shown once" box (`inset`, `font-mono`, Copy buttons
  over `utils/clipboard.ts::copyText` — the existing copy helper with its fallback — the text
  selected when the clipboard is blocked, and "It will not be shown again." always last); the
  invite code and the reset link both render through it, so the canon line has one implementation.
- **Layout, as built.** `PageLayout title="Admin"`, `SectionTabs` **Accounts** (`Users`, default)
  · **Invites** (`Ticket`) via `useTabParam`, the body in `mx-auto w-full max-w-2xl`. *Accounts*:
  `section-head` "Accounts", the `ChipGroup` All / Logged in / Migrated password, then one `List`
  of `ListRow`s: `AvatarCircle h-10 w-10` (no cups), name + `pill-default` **site admin** or
  **owner**, and the subtitle. **The subtitle leads with the login state** — `migrated password`
  in `text-warn`, or `no login` — then `N devices` · `last seen <fmtDateTime>`: in the plan's
  order the marker Roli asked for was the part the 390px truncation ate (measured: "…16:09 · mig…"
  beside two icon buttons); leading, only the timestamp's tail can go. Trailing, `UserCog` (owner
  toggle, owner+) then `KeyRound` (reset link, site admin only), both `size="sm" iconOnly` ghost.
  The row's own tap opens `SessionsSheet` **for a site admin only**; for an owner the row is not
  a control at all (no overlay, no chevron), because the server would 403 the sheet. *Invites*:
  `section-head` "Invite codes", the note `Input` and a **full-width** solid "Create code" under it
  (the plan's side-by-side row wrapped the icon above the label at 390 and could not match the
  input's height), the `ShownOnce` box — code as `ABCD-EFGH` in `text-2xl tabular-nums
  tracking-wider`, "Copy code", "Copy link" (`{origin}/g/<group_slug>/register?code=<raw>`), "For
  <note>. Works once, expires in 60 min. It will not be shown again." — then `section-head` "Live
  codes" and a `List` (title = note or "No note", subtitle `created <ts> · by <name> · expires in
  N min`, trailing `Trash2` revoke). Revoking the code that is on screen also clears the box.
- **Rules decided here.** The owner toggle is offered only on rows whose effective `role` is
  `owner` or `editor`: a site admin's row reads `admin` whatever its membership (L3), and `none`
  is not in this group, so neither has a membership role this button could honestly show or move.
  The site-admin controls follow `siteAdmin && role === "admin"`, so an admin "viewing as" owner
  sees the owner's page. The last-owner 409 (and any refusal) is the server's sentence in the
  error toast, "Role not changed". The reset-link dialog is not a red block (the link expires and
  a newer one replaces it); **revoking an invite code has one** — it deletes a stored row (§7's
  rule), and says "The code for <note> stops working at once." Sign-out asks, no red block, as L7.
  In the sheet the admin's own current session is marked `this device` and has no sign-out (L7's
  shape; that is Settings' job); "Sign out every device" names the count and says "— this one
  included" when it is. "Expires in N min" reads the naive-UTC wire **as UTC for the duration
  only**; every printed timestamp stays `fmtDateTime`'s, like L7.
- **Tests: `adminPage.test.tsx`, 11** — the three filters (a passkey takes an account off
  "Migrated password"), the "Nobody is logged in." empty state and "no login", an owner sees no
  device sheet and no reset link but the owner toggles (none on the site admin's row), the reset
  link asked-for then shown once in `font-mono` with "not be shown again", the 409's own words in
  the toast, the sheet marking the admin's device with no button there and revoking another,
  "Sign out every device", the code shown once (`LM9D-ZPBK` exactly once on screen), "Copy link"
  writing `/g/altherren/register?code=LM9DZPBK` and the row never carrying the code, the revoke's
  red line, and `RequireRole` sending a member home while letting an owner in. `navConfig.test.ts`
  +1. **`npm run check` 909 in 94 files** (895/92 + L6's 12 in 1 new file + L12's in-flight
  `promoteClubStars.test.tsx` in the same tree); `npm run build` green (`index-*.js` 757.85 kB,
  `AdminPage-*.js` its own lazy chunk; the pre-existing >500 kB hint).
- **Measured** on the stack (8237/8257, a `sqlite3` backup of the main checkout's `app.db` opened
  `mode=ro` into the scratchpad, **7 `pushsubscription` + 7 `pushsubscriptionpreference` rows
  deleted before the first boot**, an empty uploads dir, a throwaway secrets file naming the copy
  with Roli (admin) / Berni / Flo and no VAPID key; first boot logged `Auth migrated: 3 accounts, 1
  group, 6 memberships`), Playwright Chromium, a fresh set of contexts per run, at **390 blue,
  1280 light, 390 light, 1280 blue — 134/134 checks**. Each run: Roli logs in through the screen
  and again from a second context with an iPhone UA; `/admin` is reached from the **drawer** (390)
  or the **sidebar** (1280) and the bottom bar has 5 links and no Admin; `a a` = 0 and no
  horizontal overflow on the accounts list, the sheet, the reset modal, the invites tab and the
  owner's list; Roli's row reads `site admin` · `migrated password` (`rgb(251,191,36)` blue /
  `rgb(146,64,14)` light) · `N devices`, Mike's `no login`, the two filters narrow correctly; the
  top-bar title "Admin" centres at **160.0 / 195.0 / 215.0** at 320 / 390 / 430. The sheet lists
  every device with exactly one `this device` and the `iPhone · Safari` row; signing that out →
  the phone's `/me` **401** and the row gone; "Sign out every device" on Flo → Flo's `/me` **401**.
  A reset link for Flo (shown once, `…/g/altherren/reset#…`) opened in a fourth context → "Set
  password" → dashboard as Flo. An invite code shown once (exactly one occurrence in the page
  text, never in its list row) → registered a new account in a third context → that account
  appears with `1 device`. Berni made owner through the toggle, then logged in himself: Admin in
  sidebar/drawer, not in the bar, **0** reset-link buttons, **0** device-sheet rows, the owner
  toggles present, and he creates and revokes a code. Flo (a member) sees no Admin anywhere and
  `/admin` lands on `/dashboard` (before the `RequireRole` fix: a blank `/admin`). Every stack PID
  killed by number (backend, npm, its `sh`, and the reparented `vite`).
- **Seen, not mine:** headless Chromium still reads `Linux · Safari` (L7 noted `device_label`);
  sessions a closed Playwright context leaves behind are still live server-side, so Roli's count
  grew run by run (the checks compare against the row's own count, not a constant). No uploads
  were copied, so avatars with metadata show a broken image on the stack only.

## L7 — Settings → Account: my devices, my password  ☑

**The gap.** A member cannot see where they are logged in, sign a lost phone out, change the
password they were given, or join another group from inside the app.

**Verify first.**
```bash
grep -n "sessions\|password" frontend/src/pages/SettingsPage.tsx    # → 0 (after L4's sweep)
```

**The change.**
1. **`api/account.api.ts`** — `listMySessions()`, `revokeMySession(id)`, `revokeMyOthers()`,
   `changePassword({current_password, new_password})`, `removePassword()`, `redeemCode(code)`
   (re-export from `registration.api.ts` — one implementation).
2. **`pages/settings/SecuritySection.tsx`** — rendered by `SettingsPage`'s `account` tab under
   the existing "Account" `SettingsSection`, as **two** `SettingsSection`s:
   - **"Devices"** — a `List` of my sessions (`device_label`, `created · last seen`, "this
     device" `Pill` on the current), trailing ghost icon `Button` (`LogOut`) → `ConfirmDialog`
     (reversible); footer ghost `Button` "Sign out other devices".
   - **"Password"** — when `hasPassword`: a ghost `Button` "Change password" that opens the
     editor **in place** (§9b: read view or editor, never both): `Input` current, `Input` new
     with the eye toggle and the 10-char hint, primary "Save" filling the row, the way out is the
     same toggle. When `!hasPassword` (a passkey-only account, after L9): "Set a password" opens
     the same editor without the current field. A muted "Remove password" text action appears
     only when `hasPasskey` (L9 flips it on); until then the line reads "A passkey can replace
     your password soon." — **no**: say nothing that promises; render nothing for that case
     until L9 exists.
   - **"Groups"** — a `List` of `me.groups` (name, role as a `Pill`), and under it
     `InviteCodeField` (L5's) with a ghost `Button` "Join" — the in-app redeem.
   `passwordMigrated && hasPassword` shows one `text-xs text-warn` line above the password block:
   "This is the password you were given — change it, or add a passkey." (the strip that nags
   app-wide is L9's; this line is local and stays).
3. `SettingsPage.tsx`: the logout `ConfirmDialog` already exists (C7); its `onConfirm` now
   `await auth.logout()` then `navigate("/login", {replace: true})`.

**Definition of done.**
- ☑ `securitySection.test.tsx` (≈8): the current device is marked and has no sign-out button;
  the editor toggles; the migrated line shows iff migrated; "Join" posts the normalised code.
- ☑ Browser, 390 / 1280, `blue` / `light`: two contexts, sign the other out from the first →
  the other lands on `/login` on its next request; change the password → log out → old
  password 401, new one in; the migrated line is gone after the change (`password_origin` is
  `set`).
- ☑ `npm run check` green.
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §9b: the password editor is the in-place shape (read view or editor);
§5b: `Devices`, `this device`, `Sign out other devices`, `Change password`.

**Deviations.**
- **Two files outside L7's row, one of them L5's.** `pages/auth/InviteCodeField.tsx` is built
  here because L5 had not started when L7 needed it: the one code input, at the path L5's section
  names, exporting **only** the component (a formatter export beside it would trip
  `react-refresh/only-export-components`). Its `value` is the **raw** code and `onChange` hands back
  the raw code; the field shows `ABCD-EFGH`. The formatter uppercases, drops everything outside the
  server's alphabet (`CODE_ALPHABET`, so `O`/`0`/`I`/`1` are refused) and caps at 8. **L5 imports
  it and must not write a second one.** Likewise `redeemCode` is implemented in `api/account.api.ts`
  (L5's `registration.api.ts` does not exist) — **L5 re-exports it from there**, the reverse of the
  plan's direction, still one implementation. And `pages/settings/SettingsSection.tsx` (new): the
  card that `SettingsPage` defined inline, moved out so `SecuritySection` renders its three groups
  in the same look without importing from a page; `SettingsPage` now imports it.
- **Three `SettingsSection`s, not two** — "Devices", "Password", "Groups" (the section list itself
  names three), placed directly under "Account" and above the admin's "View as".
- **After a password change or a redeem the app calls `refresh()`, not `setSession`.** L4's
  `setSession` is for a *new* session: it `qc.clear()`s the whole cache and drops the admin's "view
  as" override — right on the login screen, wrong under a mounted Settings page (its own sessions
  query would be orphaned). Both endpoints answer `MeOut`, and the one extra `GET /me` is the price
  of not adding an `applyMe` to `AuthContext` (L4's file). The redeem's answer is still used: the
  success line names the group that is new in it ("You joined Jungs.").
- **Words, as shipped:** rows are `device_label` (falling back to "Unknown device") with
  "Since <date> · last seen <date, time>"; **the current row drops "last seen"** — it is being used
  now, and at 390px the `this device` pill truncated the line (measured, then fixed). The trailing
  sign-out is a `size="sm" iconOnly` ghost `LogOut` labelled "Sign out <label>"; its dialog is
  "Sign out <label>?" / "That device has to log in again with your name and password." / **Sign
  out**, and "Sign out other devices" asks with a `fmtCount` of how many — **no red block** on either
  (reversible: log in again, §7). The footer button appears only while another device exists. The
  password block is a full-width ghost toggle "Change password" (or "Set a password" without one)
  with a chevron and `aria-expanded`; the editor is the current field (only when `hasPassword`),
  the new field with the eye toggle and "At least 10 characters" turning `text-text-normal` once
  met, a full-width solid **Save**, the error line, `RetryCountdown`. Closing by the toggle discards
  the draft; after a save the read view says "Password changed. Your other devices stay signed
  in." The migrated line is exactly the plan's. Groups are `ListRow`s with the membership role as a
  `pill-default` `Pill`; the join row is `InviteCodeField` + a ghost "Join" (`UserPlus`), the
  server's sentence as the error line ("That code is not valid", "You are already in this group").
- **Nothing for "Remove password"** — not the text action, not the promise line. `removePassword()`
  is in `account.api.ts` and a comment in `PasswordSection` marks where L9 adds the passkey rows and
  the `hasPasskey`-gated action.
- **Timestamps are the app's naive-UTC shape**, printed with `fmtDateTime` like every comment and
  idea byline, so "last seen" reads in UTC (15:29 at 17:29 CEST on the stack). Pre-existing and
  app-wide; not a second convention to start here.
- **Measured** on the stack (8238/8258, a DB copy and an empty uploads dir in the scratchpad, a
  throwaway secrets file naming the copy), Playwright Chromium, two contexts per run — the second
  with an iPhone Safari UA — at 390 `blue`, 1280 `light`, 390 `light`, 1280 `blue`: no horizontal
  overflow, `a a` = 0, the four cards at x=16 / w=358 (390) and x=424 / w=672 (1280), the
  `this device` pill 84×22 on the current row with **no button in that row**. Revoking the phone by
  its row (390s) and "Sign out other devices" (1280s) each left **one** session in
  `GET /auth/sessions`, the phone row gone from the list, and the phone's next navigation landed on
  `/g/altherren/login`. Password (Berni): the migrated line showed; a wrong current password →
  "The current password is wrong"; the right one → saved, the line gone, `/me` `password_migrated:
  false`; the old password → **401** at `/auth/login`, the new one logs in. A 429 (Flo, ten wrong
  current passwords) → "Too many attempts — try again in 594s" → 592s two seconds later, Save
  disabled. Codes minted with `manage.py invite` against the copy (a second group `jungs` inserted
  by SQL **on the copy**, since `altherren` is the only one): `zzzz zzzz` showed `ZZZZ-ZZZZ` → "That
  code is not valid"; an `altherren` code typed in lower case → "You are already in this group";
  the `jungs` code → "You joined Jungs." and a Jungs row with `member`. Stack PIDs killed by
  number, the vite child included.
- **Seen, not mine:** the headless Chromium UA (`HeadlessChrome/…`) is labelled `Linux · Safari` by
  L3's `device_label` — `HeadlessChrome` is not matched as Chrome, so the `Safari/` token wins. A
  real desktop Chrome says `Chrome`; noted for whoever next touches `device_label.py`.
- **Tests:** `securitySection.test.tsx`, 12 (the plan's ≈8 plus the 403 line, the 429 countdown,
  "Set a password" without a current field, and the group list). `npm run check` **881 in 91 files**
  — L7's 12 in 1 file on the 855/89 baseline, the rest is L10's in-flight `basename.test.ts` in the
  same tree.

## L10 — The group segment in the URL and in every deep link; `sw.js` registers its own subscription  ☑

**The gap.** The app lives at `/dashboard`, `/live/3`; nothing in the URL names the group;
the backend emits `path=f"/live/{id}"` in 50 places across 10 files; `sw.js` re-subscribes on
`pushsubscriptionchange` but "cannot PUT the new endpoint itself".

**Verify first.**
```bash
grep -rn "basename" frontend/src/main.tsx                                          # → 0
grep -rnE 'path=f?"/(live|profiles|ideas|dashboard|stats)' backend/app | wc -l    # → ≈22 (+ the routers' ≈28)
grep -n "cannot PUT" frontend/public/sw.js                                          # → 1
```

**The change — frontend.**
1. **`app/basename.ts`** (new) — evaluated **first** (first import in `main.tsx`):
   ```ts
   export const DEFAULT_GROUP_SLUG = "altherren";
   const GROUP_RE = /^\/g\/([a-z0-9-]+)(?=\/|$)/;
   /** The URL the document was opened with, BEFORE the redirect below — `useLocationRestore`
    *  needs the cold-launch value (`/` from the manifest), not the corrected one. */
   export const ORIGINAL_ENTRY_PATH = window.location.pathname + window.location.search;
   const m = window.location.pathname.match(GROUP_RE);
   export const GROUP_SLUG = m ? m[1] : DEFAULT_GROUP_SLUG;
   export const APP_BASENAME = `/g/${GROUP_SLUG}`;
   if (!m) {
     const rest = window.location.pathname === "/" ? "/dashboard" : window.location.pathname;
     history.replaceState(history.state, "", `${APP_BASENAME}${rest}${window.location.search}${window.location.hash}`);
   }
   /** A backend-emitted absolute app path → a router path, or a full navigation to another group. */
   export function toRouterPath(abs: string): string | null { … }   // strips APP_BASENAME; another slug → location.assign(abs), returns null
   export function toAbsolutePath(routerPath: string): string { return `${APP_BASENAME}${routerPath}`; }
   ```
   `main.tsx`: `<BrowserRouter basename={APP_BASENAME}>`. **Nothing else in `src/` learns the
   prefix** — a DoD grep asserts `"/g/"` appears only in `basename.ts` and `sw.js`.
2. **`useLocationRestore.ts`** — `ENTRY_PATH` → `ORIGINAL_ENTRY_PATH` from `basename.ts`; the
   `=== "/"` comparisons unchanged. Stored paths stay router-relative (they are).
3. **`NotificationBell.tsx`** (`navigate(n.path)`) → `const p = toRouterPath(n.path); if (p)
   navigate(p)`; **`RecordBadges.tsx`** (`to={r.path}`) → `to={toRouterPath(r.path) ?? "#"}`.
   The `?idea=` and `?comment=` one-shot params arrive through the URL and are untouched.
4. **`sw.js`** — `notificationclick` unchanged (the `path` it gets is now absolute and lands
   inside `scope: "/"`). `pushsubscriptionchange`: after `subscribe`, `fetch("/api/push/
   subscription", { method: "PUT", credentials: "same-origin", headers: {"Content-Type":
   "application/json"}, body: JSON.stringify({ …serialised new subscription, replaces_endpoint:
   event.oldSubscription?.endpoint ?? null }) })` — the cookie rides on a same-origin SW fetch;
   a 401 (no session on this install) is swallowed and the page's auto-sync repairs it on the
   next launch as today. The comment that says "cannot PUT" is rewritten to say what now
   happens and why the 401 case still exists.
5. **`push/usePushNotifications.ts`** — `serializePushSubscription` gains an optional
   `replacesEndpoint`; `putSubscriptionRotatingOn410` passes the rotated-away endpoint as
   `replaces_endpoint` so the server moves the preference and disables the corpse in one PUT.

**The change — backend.**
6. **`services/paths.py`** — `group_path(rest: str, *, slug: str = DEFAULT_GROUP_SLUG) -> str`
   (`f"/g/{slug}{rest}"`, asserting `rest.startswith("/")`); every `path=` / `"path": f"…"` in
   `services/notifications.py` (22), `routers/me.py` (4), `services/stats/records.py`
   (`record_path`), `services/record_holders.py`, and the routers the grep lists go through it.
   A test (`tests/test_paths.py`) greps the package for a path literal outside `paths.py`
   (`re.compile(r'(path=|"path": )f?"/(live|profiles|ideas|dashboard|stats)')`) → 0 matches,
   and asserts `group_path("/live/3?comment=9") == "/g/altherren/live/3?comment=9"`.
7. **`routers/push.py::put_subscription`** — `replaces_endpoint: str | None` in
   `PushSubscriptionBody`: when set and owned by the same player, copy its
   `PushSubscriptionPreference` onto the new row and set `disabled_at` on the old one.
   `PushSubscriptionBody` is a request model — `make gen-types` not needed (only responses
   drive the types) — verify with `git diff --stat` after a run anyway.

**Definition of done.**
- ☑ `basename.test.ts` (≈8): `/` → `/g/altherren/dashboard`; `/live/3?comment=9` → prefixed,
  search kept; `/g/altherren/live/3` untouched; `/g/other/x` → slug `other`; `toRouterPath`
  strips its own prefix and returns `null` (after `location.assign`) for another slug;
  `ORIGINAL_ENTRY_PATH` is the pre-redirect value.
- ☑ Browser: open `http://localhost:<V>/` → the bar reads `/g/altherren/dashboard`; open
  `/live/<id>` → redirected and rendered; the bell's item navigates in-app (no full reload —
  `performance.navigation`/`PerformanceNavigationTiming` count stays 1); a badge legend row
  likewise; back chevron behaviour on a deep link unchanged (Q6b: up); `useLocationRestore` in
  a standalone-emulated context still resumes.
- ☑ `grep -rn '"/g/' frontend/src | grep -v test/` → `basename.ts` only; `grep -rn "/g/"
  frontend/public/sw.js` → 0 (it never builds one).
- ☑ `make test` (the path test, the push `replaces_endpoint` test), `make lint`, `npm run
  check`, `npm run build`.
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §6: "every path the backend emits is absolute and group-prefixed, built
by `paths.group_path`; the frontend strips it with `toRouterPath` and never builds one"; §10:
the basename rule, the legacy redirect, why the manifest is untouched, the SW's own PUT and its
401 case. `DESIGN.md` §10: "every location is basename-relative; the hierarchy never sees `/g/`".

**Deviations.**
- **`/` lands on the group's root, not on `/g/altherren/dashboard`** — the section's code would have
  broken `useLocationRestore`, measured. The router's own `/` route (`<Navigate to="/dashboard">`,
  inside `ShellRoutes`, i.e. a *child* of `AppShell`) is what makes the resume work: `AppShell`'s
  persist effect skips `/`, and the restore effect in the same commit reads the saved location.
  A document that *starts* at `/dashboard` stores `/dashboard` first, and the restore then
  "resumes" into it. So `resolveEntry` maps `/` (and `/g`, `/g/`) to `/g/altherren/` and the router
  finishes the trip to `/dashboard` exactly as it did before the batch. Measured on a production
  build (`vite build` + `vite preview` with L0's proxy) with `navigator.standalone` forced true:
  last location `/stats?view=h2h`, cold launch at `/` → **`/g/altherren/stats?view=h2h`**; a cold
  launch at `/profiles/3` (a deep link) is left alone → `/g/altherren/profiles/3`. **In the vite
  dev server the resume does not stick**, with or without this task: StrictMode runs the child
  `<Navigate>`'s effect twice, so the trail reads `dashboard → stats?view=h2h → dashboard` (the
  restore's `didRestore` guard stops it from running twice). Dev-only; the PWA on Roli's phone
  that matters is the production build.
- **`toRouterPath` has a pure half, `routerPathOf`.** `RecordBadges` builds its `to` while
  *rendering*, and the section's `to={toRouterPath(r.path) ?? "#"}` would call `location.assign`
  during a render for another group's path. `routerPathOf(abs)` answers without acting
  (`null` = another group); `toRouterPath(abs, assign?)` is `routerPathOf` plus the navigation, and
  is what the bell's click uses. Both live in `basename.ts`. A path with **no** group (a bell item
  cached before the batch, a rolled-back backend) passes through unchanged — it already is a router
  path. `/g/altherrenx/…` is correctly another group, not ours (tested).
- **Files touched outside L10's row, each named by the section itself:** `backend/app/schemas/
  requests.py` (`PushSubscriptionBody.replaces_endpoint`, step 7); `frontend/src/push/push.ts`
  (`serializePushSubscription`'s `replacesEndpoint`, step 5 — the function lives there, not in
  `usePushNotifications.ts`) and `frontend/src/api/push.api.ts` (the hand-written payload type
  gains the field); four existing test files whose assertions spelled an un-prefixed path
  (`test_guestbook_subjects.py` 1, `test_me_notifications.py` 4, `test_ideas.py` 2,
  `test_push_notifications.py` 2 — each assertion gained `/g/altherren`, nothing else).
  **`App.tsx` was not touched** — the basename sits on `<BrowserRouter>` in `main.tsx`.
  **`schema.d.ts` moved by two lines** (`replaces_endpoint?: string | null` on
  `PushSubscriptionBody`): the section said a request model does not drive the types, but
  `openapi-typescript` emits every component schema, request bodies included. Regenerated once,
  at the end, and committed with the model.
- **Backend paths, as shipped.** `services/paths.py::group_path(rest, *, slug)` asserts a router
  path (`/…`, not already `/g/…`) and is the one builder; it re-exports `DEFAULT_GROUP_SLUG` from
  `auth_migration.py` (L1's spelling) rather than importing `groups.py`, which would have put the
  notification service one import away from the gate's claims builder. Callers: 20 in
  `services/notifications.py` (incl. `/tournaments` and `/friendlies`, which the section's grep
  does not name), 4 in `routers/me.py`, 1 each in `routers/comments.py` and `routers/push.py` (the
  test push), `stats/records.py::record_path` (all three branches), and `record_holders.py`'s
  `/stats` fallback. `tests/test_paths.py`'s grep also covers `tournaments|friendlies`, and was
  checked to bite: run over the pre-task sources (`17cc71d`) it finds 20 in `notifications.py` and 4 in
  `me.py`. `localized_push_message`'s default `path="/"` and `sw.js`'s `"/"` fallback stay: `/`
  is the redirect's to fix, and a default names no group.
- **`replaces_endpoint`, as shipped** (`notifications.retire_replaced_push_subscription`, called by
  the thin router): only a row **the caller owns** is touched (another player's endpoint is
  ignored — tested); the old row gets `disabled_at` (a client disable: `last_http_status` is
  left alone, so a 410 corpse stays a corpse and a client-disabled row can still be revived);
  the new row inherits language and mode **unless the body names them** (the page's rotation
  sends its own, the worker sends none). Five backend tests in `test_paths.py` plus the grep and
  `group_path` cases — 10 in all.
- **What `sw.js` does now.** On `pushsubscriptionchange` it uses `event.newSubscription` when the
  browser gives one, else re-subscribes with the old key — or, when there is no old subscription
  (Safari may send none), with the key from `GET /api/push/config`, which the cookie now opens.
  Then, **only when it knows the old endpoint**, it `PUT`s `/api/push/subscription` with
  `credentials: "same-origin"`, `replaces_endpoint` and no language/mode. Without an old endpoint
  it deliberately does **not** report: the server would create the row with the *default*
  language, and the page adopts a row's language over its own stored one
  (`usePushNotifications`' effect on `currentSubscription`), so the worker would silently reset
  the device's settings — that case stays the page's auto-sync, as before. A 401 (a revoked or
  never-logged-in install) and a network error are swallowed. `API_BASE` is spelled `/api` in the
  worker: both production (Caddy) and dev (L0's proxy) serve it there, and a worker cannot read
  Vite's env. `app_standalone` is not sent (a worker cannot know it); the page's next auto-sync PUT
  of the same endpoint writes it — display-only either way. **Measured** by calling the worker's
  own `resubscribeAndReport` through Playwright's `serviceWorker.evaluate` with a stub
  subscription: logged in, with an old endpoint → **PUT 200**, the new row `english`/`all` as the
  old one was, the old row `disabled_at` set (read from the DB copy); logged in, no old endpoint →
  **no PUT**; logged out → **PUT 401**, swallowed, nothing thrown. A real `pushsubscriptionchange`
  cannot be fired in headless Chromium (no push service) — the phone's.
- **Verified against the isolated stack** (backend 8241, vite 8261, DB + uploads copied to a
  `mktemp -d` in the scratchpad, secrets naming that copy; every PID killed by number, the copy
  removed): at **390 and 1280 × blue and light** — `/` logged out → `/g/altherren/login`, log in →
  `/g/altherren/dashboard`; every `<a href>` in the shell prefixed (15–17 anchors, 0 bare), `a a` =
  0; legacy `/stats?view=h2h` → `/g/altherren/stats?view=h2h` on the H2H tab, `/profiles/3` →
  Rumpi's profile, `/ideas?idea=1` → `/g/altherren/ideas` (the one-shot consumed as always),
  `/live/19` → the tournament, `/dashboard` → the dashboard; **back** on a cold `/live/19` →
  `/g/altherren/tournaments` (Q6b: up), and after a drill-in from the list → pops back to it; the
  **bell** item (a guestbook entry from Berni, `path` `/g/altherren/profiles/1?tab=guestbook&entry=…`)
  → navigated in-app, same document (a window marker survived), **1** navigation entry; a **badge
  legend** row → `href="/g/altherren/stats?…&record=most_titles"`, in-app, same document. The same
  run on the production build (1280/light) read identically. Backend-emitted paths read
  `/g/altherren/…` in `/me/notifications` and `/stats/records` (all 16).
- **Something the push check found that is not L10's, written down so the next stack does not
  repeat it:** to exercise the worker's PUT the stack needs push *enabled*, so a throwaway VAPID
  key went into the throwaway secrets — and the dispatcher then **delivered to the real
  subscriptions in the copied dev DB** (`web.push.apple.com` ×2, `updates.push.services.mozilla.com`
  ×2) on the next guestbook entry. All four were **rejected** (403 / 401 — the key is not the one
  those devices subscribed with), so nothing reached a phone; the key was removed and the stack
  restarted within the minute. The same run showed a `POST /auth/login` answering **500 `database
  is locked`** while those deliveries were in flight. **Canon for L15 (§10):** a verification stack
  with *any* VAPID key and a copy of real data pushes to real devices — delete the
  `pushsubscription` rows from the copy first. Whether the dispatcher holds a SQLite write lock
  across its HTTP calls is worth one look by whoever owns push next; not investigated here.
- **Not done here, and why:** `ui/shell/AppCrashBoundary.tsx` (`location.assign("/dashboard")`,
  `href="/settings?tab=diagnostics"`) and `diagnostics/blankNotice.ts`
  (`location.assign("/settings?tab=diagnostics")`) still spell un-prefixed paths. They are full
  document loads outside the router (the crash boundary sits above every provider, the notice is
  plain DOM on purpose), so the legacy redirect puts them under `/g/altherren` and they work — but
  in part 2 they would land in the default group. Neither file is L10's; `toAbsolutePath` is the
  one-line fix when part 2 needs it. `site.webmanifest` untouched (`id`/`start_url`/`scope` `/`).
- **Gates:** `make lint` clean; `make gen-types` → `schema.d.ts` +2 (above); `cd frontend && npm run
  check` **881 tests in 91 files** green (baseline 855/89 at `17cc71d`; **+14 in
  `src/test/basename.test.ts`**, the other 12 in one file are L7's, committed beside this);
  `npm run build` green (`index-*.js` 751.08 kB, the pre-existing >500 kB hint); the DoD greps:
  `grep -rn '"/g/' frontend/src | grep -v test/` → **1 line, `basename.ts`**; `grep -rn "/g/"
  frontend/public/sw.js` → **0**; `grep -rnE 'path=f?"/(live|profiles|ideas|dashboard|stats)'
  backend/app` → **0**. `make test` **452 passed** in 31:37 (baseline 442 at `17cc71d`; +10 in `tests/test_paths.py`, nothing pre-existing moved beyond the nine prefixed assertions).
- **What L11 and L13 inherit.** **L11**: the bell and the badge legend already go through
  `basename.ts` (`toRouterPath` / `routerPathOf`), so `PlayerLink` needs nothing from this task —
  a profile link is an ordinary `<Link to="/profiles/…">`, basename-relative; a *foreign* profile
  in part 2 is `toAbsolutePath` + a full navigation, never a hand-built `/g/`. `routers/players.py`
  was **not** touched by L10 after all (it emits no path — the guestbook and poke pushes are built
  in `services/notifications.py`), so L11 has that file to itself. **L13**: every deep link the
  rehearsal opens is `/g/altherren/…`; an **old** link (`/live/3?comment=9`, a pre-batch push, a
  home-screen `/`) must land under the segment by the boot redirect — that is the check. Reset
  links (`{origin}/g/altherren/reset#token`, L3) resolve with no redirect and the fragment is kept.
  The installed PWA's resume (`useLocationRestore`) is only meaningful on the **production** build
  (above). The rotation PUT now carries `replaces_endpoint`, so a device that rotates after a 410
  keeps its language and mode.

## L12 — Cups in the database; the per-group star overlay; promote forward-only  ☑

**The gap.** `cup_defs.load_cup_defs` reads `cups.json`; `ClubStarRating` has a `group_id`
column (L1) that nothing writes or reads; no endpoint promotes a rating.

**Verify first.**
```bash
grep -n "json.loads" backend/app/cup_defs.py                          # → 1
grep -n "group_id" backend/app/services/club_stars.py                 # → 0
```

**The change.**
1. **`cup_defs.py`** — `load_cup_defs(s: Session | None = None) -> list[CupDef]` reads `Cup` +
   `CupEra` rows for `current_group` (opening its own session when none is given, the
   `StarRatingResolver.load` shape); `_read_cups_file()` keeps the JSON validation verbatim and is
   called by **`seed_cups_from_file(engine)`** in `init_db()`: when the `cup` table is empty,
   import the file's cups for `altherren` and log `Cups imported: N`. The startup "malformed
   config = refuse to boot" property survives: the file is still validated at every boot (a
   `load` on it), it just stops being the runtime source once imported. `get_cup_def(key)`
   unchanged in signature. `CUPS_CONFIG_PATH` semantics: **the seed**, documented by L14.
2. **`club_stars.py`** — `record_star_rating(..., group_id: int | None)`: the live write paths
   (`POST /clubs`, `PATCH /clubs/{id}`, the picker's inline editor — all through `PATCH`) pass
   `current_group(s).id`; the seeder and `init_db`'s backfill write global (`None`).
   `StarRatingResolver.load(s)` keeps both scopes; `as_of(club_id, on, group_id=None)`: **the
   latest row with `valid_from ≤ on` across the group's rows and the global rows wins; on the same
   day the group's row wins; nothing ≤ on → the oldest row, group first.** `StarRatingResolver`
   callers (`stats/player_matches.py`, `records.py`, `odds`) pass `current_group(s).id`.
   `GET /clubs/{id}/star-history` returns both, each row carrying `scope: "group" | "global"`
   (`ClubStarHistoryOut` already exists — add the field with a default so `gen-types` is a
   one-field diff… **that is a response-model change**: L12 runs `make gen-types` and commits
   `schema.d.ts` — it is the only group-C task doing so, by design).
3. **`routers/clubs.py`** — `POST /clubs/{id}/stars/promote` (`require_admin`): writes a
   **global** row dated today with the group's current value (`record_star_rating(...,
   group_id=None)`); 409 when the global row already equals it. Forward-only by construction:
   it never rewrites a past row.
4. **`ClubList.tsx`** — in the club editor (Q15's), for a site admin only, a ghost `Button`
   "Make this rating global" under the stars, with a muted line "Applies from today for every
   group." — the one control; `ConfirmDialog` not needed (reversible by promoting again).
5. Tests: `test_cups_db.py` (import once, idempotent, the two prod cups with their eras, a
   malformed file still refuses to boot, `get_cup_def` reads the rows); `test_club_star_history.py`
   gains the overlay cases (group row beats global on the same day; a later global promotion
   applies forward; a match before both → the oldest); `test_clubs_current.py` the promote
   endpoint and its 403 for an owner.

**Definition of done.**
- ☑ `make test`, `make lint`, `make gen-types` committed (the one-field history diff), `npm run
  check` (the one control).
- ☑ On the dev-DB copy: boot → `Cups imported: 2`; `/cup/defs` byte-identical to before the
  import (assert with a saved response); the dashboard's cup owners unchanged (Lorbeerkranz →
  Berni, Bauernkranz → Roli, `AGENTS.md` §10's expectation).
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §4: `cups.json` is the seed; §5: the overlay rule in `as_of`, the
promote rule; §7 step 3 (editing `/data/cups.json` by hand) becomes "seed only — after the first
boot, cups live in the DB".

**Deviations.**
- **One file outside the row, because L1's backfill contradicted the overlay:**
  `services/auth_migration.py::GROUP_SCOPED_TABLES` no longer contains `clubstarrating` (and
  `tests/test_auth_migration.py` expects that). On that table NULL is not "not yet assigned" but
  *the global rating*; L1's every-boot `UPDATE … SET group_id = :g WHERE group_id IS NULL` would
  have turned the whole recovered history into `altherren`'s rows and turned every promotion back
  into a group row on the next restart. Production and Roli's `backend/app.db` never ran L1, so
  their 657 rows stay NULL = global; only throwaway `verify-l*.db` copies ever got the backfill.
- **R4's `UNIQUE(club_id, valid_from)` stays, so a day holds one row per club across scopes.**
  Widening it needs a table rebuild (§5 rule 2). Consequences, each a 409 with a "tomorrow"
  message (`club_stars.StarDayTaken`): a group edit on a day that already has a *global* row (i.e.
  right after a same-day promotion), and a promotion on a day another group holds the row.
  Promotion itself handles the common case without a second row: when today's row is the
  group's own, it **becomes** the global row (same value, same day — nothing the group counts
  moves; every other group counts it from today); when today's row is global it takes the value;
  otherwise a new global row. `Club.star_rating` follows.
- **`as_of(club_id, on, group_id=<the loaded group>, *, strict=False)`** — `load(s, group_id=…,
  club_id=…)` binds the group, so the three stats callers (`player_matches`, `h2h_matches`,
  `records`) changed one line each to `StarRatingResolver.for_current_group(s)`. `strict` (no
  "oldest"/"current" fallback) is what `record_star_rating`'s "already in force" check and
  promotion's "already global" check use, so both go through the one rule instead of re-walking
  rows. `odds` never used the resolver (it reads `Club.star_rating`, "today"), so it is untouched.
  The recovery tool's `StarRatingResolver(history, current)` constructor still works (global rows).
- **The response change is two fields, not one:** `ClubStarHistoryEntryOut.scope` and
  `ClubStarHistoryOut.current_is_global` ("is what this group counts today the global rating") —
  the second so the control renders from a server answer instead of re-deriving the overlay rule
  in the browser (the A10 shape). `gen-types` diff: those two fields + the promote operation.
- **Promote answers the new history** (`ClubStarHistoryOut`), so the UI sets the cache entry from
  the response. `404` for an unknown club, `403` for owner and editor (tested).
- **The control is not in `ClubList.tsx`**: Q15's editor is rendered by `pages/ClubsPage.tsx`'s
  `renderEditor`, so the control is a new `pages/clubs/PromoteClubStars.tsx` rendered there under
  `ClubStarHistory`, plus `promoteClubStars` in `api/clubs.api.ts`. It renders nothing unless
  role is `admin` **and** `current_is_global` is false. `ClubList.tsx` untouched.
- **Cups:** `read_cups_file()` (public — `main.py`'s lifespan validates the seed with it at every
  boot, so a malformed file still refuses to boot, tested before *and* after the import);
  `load_cup_defs(s=None)` / `get_cup_def(key, s=None)` read the rows (the synthesized `default`
  cup is added at read time, never stored); `import_cup_defs` / `replace_cup_defs` are the one
  writer; `seed_cups_from_file` runs in `init_db()` after the migration and before the record
  holders, imports only into an empty `cup` table, and **warns** once per boot when the file and
  the rows differ ("the file is only a seed now") — for whoever hand-edits `/data/cups.json`
  expecting it to apply. Without a group (a bare `init_db()` in a test helper) the import is
  skipped and `load_cup_defs` answers the default cup alone. Callers that had a session pass it
  (`routers/cup.py`, `services/cup.py`, `stats/players.py`). `test_tournament_cup_stakes.py`
  pinned its cups through `CUPS_CONFIG_PATH` after boot; it now writes them with
  `replace_cup_defs`. `test_cup_eras.py`'s file-validation test now calls `read_cups_file`.
- **Proof on copies of real data** (outside the repo, push rows deleted first; the dev
  `backend/app.db` and the latest deploy snapshot `20260920-151542`, whose `cups.json` is
  byte-identical to the bundled one): each booted once on `2109e1b` and once on L12's tree, and
  everything read through the real API. First L12 boot: `Cups imported: 2`; a second boot: no
  line. Identical before/after on both copies: `/cup/defs` **byte for byte**; `/cup?key=default`
  and `?key=bauernkranz` in full — owner, streak and the whole reign history (Lorbeerkranz →
  **Berni**, 4 reigns; Bauernkranz → **Rumpi**, 5 reigns — the §10 note is right that Roli is no
  longer the Bauernkranz owner, so the plan's "→ Roli" expectation is stale); every
  tournament's `cup_stakes`; `/stats/records` for all 9 mode × scope pairs; and the `club_stars`
  of **all 234 finished match sides** (224 with a club; 3 of them resolve to a rating other than
  today's, so the history is in play) from `/stats/player-matches?scope=both` for every player.
  Then on the dev copy: a group edit and a promotion of a club with finished matches — all 234
  sides still identical after each; promote when already global 409; group edit the same day
  after the promotion 409.
- **Browser** (backend 8243 / vite 8263, dev copy, `blue` and `light`, 390 and 1280): the ghost
  button is 198×32 with the muted line beside it at 1280 and under it at 390, no horizontal
  overflow; clicking it removes the control (the history now says global). Stack killed by PID.
- **Gates:** `make test` **465 passed** (34:08), `make lint` clean, `make gen-types` committed,
  `npm run check` **907 tests in 94 files** (includes the parallel workers' in-flight tests),
  `npm run build` green.
- **Canon for L15:** §4 — `cups.json` / `CUPS_CONFIG_PATH` is the seed, validated every boot,
  imported once, then the DB wins (a drift warning in the log); §5 — the overlay rule and the
  one-row-per-day consequence; the promote rule (admin, forward-only, own-row-today flips to
  global); NULL `group_id` on `clubstarrating` is global and never backfilled; §7 step 3 — editing
  `/data/cups.json` by hand only matters before the first boot of this code.

## L11 — `PlayerLink` decides who may open a profile; three surfaces route through it; the server enforces it  ☑

**The gap.** `StandingsTable.tsx:331-339` is a `div role="button"` that `navigate`s to a
profile; `stats/PlayerProfile.tsx:100-106` a `<button onClick={nav}>`; `PlayersAdminPage.tsx:197`
a `ListRow onClick`. None asks whether the profile may be opened; the server answers
`GET /players/{id}/profile` to any member.

**Verify first.**
```bash
grep -n 'role="button"' frontend/src/pages/live/StandingsTable.tsx        # → 1
grep -n "useProfileAccess" -r frontend/src                                # → 0
```

**The change.**
1. **`hooks/useProfileAccess.ts`** (new) — `useProfileAccess(playerId): { canOpen: boolean;
   foreign: boolean; loading: boolean }` from two queries the app already holds:
   `qk.players()` (the roster — members of the caller's groups, L3) and `useAuth().siteAdmin`.
   In the roster → `{canOpen: true, foreign: false}`; not in it → `foreign: true`, `canOpen:
   siteAdmin`. **The only place the rule is written in the browser.**
2. **`PlayerLink.tsx`** — calls the hook; `canOpen` → the `Link` as today; `!canOpen` → a
   `<span>` with the same classes minus the hover, `title="Not in your group"`, and, when
   `foreign`, a `Users` glyph at `size={12}` `text-text-muted` after the children (the mark).
   New prop `stretched?: boolean`: renders the link as the stretched overlay
   (`absolute inset-0 z-0 rounded-xl focus-ring`, `aria-label`) with **no children** — the
   `ListRow` pattern, so a whole row can be the door without nesting an `<a>` in an `<a>`.
3. **`List.tsx`** — `ListRow` gains `overlay?: React.ReactNode`: when given, it is rendered in
   place of the built-in `Link`/`button` overlay (same class string, exported as
   `LIST_ROW_OVERLAY_CLASS` so `PlayerLink stretched` uses the identical one).
4. **The three surfaces.** `StandingsTable`: the row loses `role`, `tabIndex`, `onClick`,
   `onKeyDown` and `cursor-pointer`; becomes `relative` with `<PlayerLink stretched playerId
   name />` as its first child and the content `pointer-events-none relative z-10`
   (`MatchList.tsx:162`'s worked example). `stats/PlayerProfile.tsx`: the `<button>` becomes
   `<PlayerLink playerId name className="flex min-w-0 flex-1 items-center gap-3 …">` with the
   same children (the `ChevronRight` stays). `PlayersAdminPage.tsx`: `ListRow overlay={<PlayerLink
   stretched … />}`; the two unread `Pill` buttons keep their own `onClick` (they are
   `pointer-events-auto` already).
5. **`ProfilePage.tsx`** — a 403 from `getPlayerProfile` renders `EmptyState` "This profile is
   in another group." inside `PageLayout` (so the back chevron survives, Q6).
6. **Server** — `services/groups.py::ensure_shared_group(s, claims, player_id)` (403 "Not in
   your group" unless site admin or a common membership); applied in `routers/players.py` to
   `GET/PATCH /players/{id}/profile`, `GET /players/{id}/guestbook`, `GET /players/{id}/pokes`,
   both `POST`s, `GET /players/{id}/avatar` and `/header-image` (media of a stranger stays
   private too), and the read/read-all endpoints under `/players/{id}/…`. **Not** applied to
   `GET /players/avatars` / `/headers` (the roster's metadata, already filtered by `roster_for`).

**Definition of done.**
- ☑ Tests: `playerLink.test.tsx` (in roster → link; not in roster → span + mark; site admin →
  link + mark; `stretched` renders no children and the overlay class); the three surfaces
  render `a a` count 0 and each has exactly one `<a>` to `/profiles/<id>`; backend
  `test_player_profiles_auth.py` gains the 403 for a no-group account's profile and the site
  admin's pass.
- ☑ Browser: standings row → profile via keyboard (`Tab`, `Enter`) and tap; register a
  no-group account on the copy, open `/profiles/<its id>` as Berni → the empty state; as Roli
  (site admin) → the profile with the mark on the name.
- ☑ `document.querySelectorAll('[role="button"]').length` on a live tournament page → 0 (the
  Standings was the last one; `grep -rn 'role="button"' frontend/src --include='*.tsx' | grep -v
  "^.*//"` → 0 code sites).
- ☑ `make test`, `make lint`, `npm run check`.
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: `PlayerLink`'s `stretched` variant and the rule "who may open a
profile is answered inside `PlayerLink`, from the roster; a foreign author wears the `Users`
mark; the server refuses independently"; §11: the last `role="button"` is gone.
`AGENTS.md` §9's "Identity is a link" paragraph gains the access rule.

**Deviations.**
- **The site admin's mark does not come from the roster, because the roster cannot give it.**
  L3's `roster_for` answers a site admin with *every* player, so "not in my roster" can never
  mark anyone for Roli, and the plan's own definition of done ("site admin → link + mark", "as
  Roli → the profile with the mark on the name") was unreachable as specified. Without touching
  a response model (Roli's item 2), `useProfileAccess` reads, **for the site admin only**,
  `qk.admin.accounts()` — the admin page's own list, which the site admin is allowed to read —
  and marks a player whose role in the current group is `none` (a site-admin target is never
  marked: a site admin is everywhere). Everyone else is answered from `qk.players()` exactly as
  the task says. Part 1 has one group, so "role in the current group" *is* "shares a group"; the
  real part-2 answer is a `shares_group` flag on the roster, i.e. a response-model change, and
  it is written at the top of `hooks/useProfileAccess.ts` as that. One mechanism still: the hook
  is the only place, `PlayerLink` its only caller.
- **The hook does not require its providers.** `PlayerLink` sits inside dozens of components that
  are tested alone under a bare router (46 tests in 9 files failed on `useAuth`'s deliberate
  throw), so `useProfileAccess` reads `AuthContext` and `QueryClientContext` with `useContext`,
  passes an inert `QueryClient` to `useQuery` when there is none (the hooks stay unconditional),
  and a tree without a session answers "a door, unmarked". The same optimistic answer covers a
  roster that has not arrived: a name must not flash to plain text and back on every cold load —
  and the server refuses independently, into the profile page's own empty state. Your own name
  is always a door. An invalid id (`≤ 0`) is not.
- **`/players/avatars` and `/players/headers` are now filtered by `roster_for`.** The plan said
  they were "already filtered" — they were not (both returned every row, no claims). With the
  avatar GET guarded, the browser was told a stranger had an avatar, asked for it, got the 403 and
  drew a **broken image** beside a foreign author (seen in the browser, Berni's wall). Filtering
  the two metadata lists makes the plan's sentence true and puts the monogram back; the pictures
  themselves stay behind `ensure_shared_group`. Still not guarded: the list endpoints
  (`/profiles`, `/guestbook-summary`, `/pokes-summary`, the read maps) — metadata only, out of
  this task; part 2 should filter them by the roster the same way.
- **Guarded beyond the plan's list, the same guard:** the pinned subject copy
  (`/guestbook-subjects/{sid}/image`, by its snapshot's player — "media of a stranger stays
  private" covers it), and the three entry-keyed wall endpoints that read or write a stranger's
  wall without a player id in the path (`PUT /guestbook/{eid}/read`, `PUT …/vote`, `GET …/voters`,
  by the entry's wall owner). An author's own `PATCH`/`DELETE` of their entry is **not** guarded —
  someone who left the group can still take back what they wrote. `ensure_shared_group` lets a
  missing player through so every endpoint's own 404 still answers (asserted), and anyone passes
  for their own id. `services/groups.py` also gained `shares_group` (the boolean under it).
- **Standings: the crown and the streak patches keep `pointer-events-auto`.** The content layer is
  `pointer-events-none` (the `MatchList` shape), which would have silently removed the only hover
  explanation the crown has ("… owner (before tournament)", `DESIGN.md` §7 — it is the crown's
  only site). Consequence: a tap exactly on a 24px badge no longer opens the profile; the rest of
  the row does. The leader bar is `pointer-events-none`. The row body is wrapped in one
  `flex w-full items-center gap-3` div so the layout is byte-for-byte the old flex row.
- **Players admin**: `openProfile`'s "scroll to `#profile-section-main`" is kept as the stretched
  link's `onClick` (`scrollToProfileMain`, which runs before the navigation, exactly as before);
  the two unread pills keep `openProfile`. **Profile page**: the 403 state also stops the query's
  one retry (a 403 cannot change on asking again).
- **Server guard, measured on the copy** (`verify-l11.db`, a second group `zweite` with one member
  `Fremder` (7) and a no-group `Uneingeladen` (8), both created through `POST /players` and moved
  by SQL; push rows deleted before boot): as **Berni** (member) → 7 and 8: `profile`, `guestbook`,
  `pokes`, `avatar`, `guestbook/read`, `pokes/read`, `guestbook/read-all` all **403** `{"detail":
  "Not in your group"}`; → Rumpi (3, shared) all **200**. As **Roli** (site admin) → 7, 8, 3 all
  **200** (8's avatar 404: it has none). Tests: `test_player_profiles_auth.py` +6 (a member
  refused every one of 14 endpoints on a player in another group, and not told of their avatar or
  header; a no-group account refused; the site admin opens all 14; a shared player opens all 14;
  one shared group is enough; your own profile, and a missing player keeps its 404).
- **Browser** (isolated stack 8242/8262, Chromium, 390×844 and 1280×900, `blue` and `light`,
  66/66 checks): all three surfaces carry a real `href`; middle-click opens `/g/altherren/profiles/<id>`
  in a new tab on each; the standings row is reached with `Tab` and opened with `Enter`, and by a
  tap; the stats card and the Players row open with `Enter`. As Berni, the foreign author on his
  wall is a `<span title="Not in your group">` with the `Users` mark and **no** link to
  `/profiles/7`, while the other authors on the page stay links and carry no mark; `/profiles/7`
  and `/profiles/8` render "This profile is in another group." with the back chevron. As Roli the
  same author is a link **with** the mark and `/profiles/7` opens. The guestbook's two meanings
  hold: Roli tapping the (foreign, linked) name lands on `/profiles/7` and the message stays
  unread; tapping the body marks it read. **Row heights, before (`5c77313`'s frontend via `git
  archive`) and after, identical in all four viewport × theme runs**: standings 72/73/73/73px,
  stats identity card 86 (390) / 82 (1280), Players rows 64/66/66/64/64/66/66/64, guestbook
  entries 180/116/174/180/180/124, comment cards 128, cup reign rows 60/77/77/77/77/60.
  `[role="button"]` on a live tournament **4 → 0**; `document.querySelectorAll("a a")` **0** on
  26 routes × 4 runs, before and after. `grep 'role="button"'` in `frontend/src` code → 0 (three
  comments remain, each saying *not* to use one).
- **A caution for whoever runs vite next**: the plan's stack recipe (`npx vite` in the worktree)
  writes vite's dependency cache through the `node_modules` symlink into **the main checkout's**
  `frontend/node_modules/.vite/deps` — the directory Roli's running dev server on 8000 serves
  from. My first start re-optimised it (18:47, same dependency versions, so the chunks are the
  same content); every later start used a wrapper config with `cacheDir` in the scratch dir. Every
  earlier task that followed the recipe did the same; L15 should put `cacheDir` into the recipe.
- **Gates**: `make lint` clean; `cd frontend && npm run check` **919 tests in 95 files** (baseline
  909/94 at `5c77313` incl. L12's in-flight test; +7 in `playerLink.test.tsx`, +3 in the new
  `profileAccessSurfaces.test.tsx`); `npm run build` green (`index-*.js` 759.87 kB, the
  pre-existing >500 kB hint); `make test` **501 passed** in 47:27 on a loaded Pi (baseline 452; +6 mine in `test_player_profiles_auth.py`, the rest are L12's in-flight tests in the same tree). No response model touched, `schema.d.ts`
  untouched.
- **Canon for L15** (as the task says, plus): `DESIGN.md` §7 — `PlayerLink stretched`; "who may
  open a profile is answered inside `PlayerLink`, from the roster; a foreign author wears the
  `Users` mark (12px, muted, after the name, never on the decorative avatar duplicate); a name
  that may not be opened is plain text titled *Not in your group*; the server refuses
  independently"; `ListRow`'s `overlay` slot and `LIST_ROW_OVERLAY_CLASS`; §11 — the last
  `role="button"` is gone. `AGENTS.md` §9 "Identity is a link" — the access rule, the site-admin
  refinement, and that the three "known exceptions" are closed; §5/§6 — the guard's endpoint list
  and that the avatar/header metadata lists follow the roster.

## L13 — The dress rehearsal on a copy of production: migrate, log in, roll back, roll forward  ☑

**The gap.** Every rollback drill so far ran against the dev database. The deploy that can
lock Roli out must be rehearsed against **production's own data shape** — its names, its
accounts, its cups file — before it runs on the server.

**Verify first.**
```bash
ls -d backup/deploy/*/ | tail -1                     # → the latest deploy snapshot (read-only; never written)
python3 -c "import json;print(json.load(open('$(ls -d backup/deploy/*/ | tail -1)/snapshot.json'))['kind'])"   # → deploy
```

**The change.** `scripts/auth_rehearsal.sh <snapshot-dir> <secrets-shape.json>` — a script
that **never touches `backup/`, `backend/app.db` or `backend/data/`**, works in `$(mktemp -d)`,
and prints a report. The secrets file it takes is a **copy Roli makes himself** of the production
`secrets.json`'s *shape* with the real names and throwaway passwords (the agent never reads the
real one — Rule 7); the names are what matter, because the migration matches on them.
1. Copy `<snapshot>/data/app.db` and `cups.json` to the work dir; run `manage.py auth-preflight`
   against the copy → the report (expect `unmatched_names: []`, `case_collisions: []`, N
   accounts).
2. Boot the new code on the copy (port 8244); assert the log lines; `POST /auth/login` for
   every migrated name with its throwaway password → 200; `GET /me` → the shape; `GET
   /tournaments` → the same count as `sqlite3 -readonly … "select count(*) from tournament"`;
   `/cup?key=default` → the same owner as before the boot (saved from the old code in step 0).
3. **Roll back**: `git archive ce55a53` (L13's correction: not `cfc1669`) into the work dir, boot it on the **same** database file
   (port 8245) with the secrets copy → `POST /auth/login` (JWT) 200 for the same names; `GET
   /tournaments` 200; create a tournament (`group_id NULL`); create a comment.
4. **Roll forward**: boot the new code again → the backfill logs `1` for `tournament`; the
   comment is there; nothing else logged (idempotent).
5. **The exchange**: take the JWT from step 3, `POST /auth/exchange` → a cookie; `GET /me` 200.
6. The five escape-hatch commands, each once, against the copy.
7. Timing: `hash_password` median on this Pi (again, on the production-shaped data — same
   number expected); `GET /tournaments` p50 with the gate.
Write the whole report into this task's Deviations, with the snapshot's timestamp.

**Definition of done.**
- ☑ The script exists, is idempotent (a second run on a fresh copy gives the same report), and
  its report is in Deviations.
- ☑ Nothing under `backup/` changed (`find backup -newer scripts/auth_rehearsal.sh | wc -l` → 0).
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §7: the rehearsal as a deploy-checklist step (before step 2's backup on
the real thing).

**Deviations.**
- **Snapshot `backup/deploy/20260920-151542`** (`snapshot.json` `"kind": "deploy"` — the latest of
  the sixteen that say so; selected by kind, not name), rehearsed at tree **`3801260`** against
  rollback target **`ce55a53`**. Secrets: a copy of Roli's
  `~/.local/share/turnierplaner-rehearsal/secrets.rehearsal.json` (six real names, Roli admin,
  throwaway passwords — Berni's is `Grüß Gott …` with a space — and a throwaway `jwt_secret`)
  with `db_url` pointed at the copy; the original was not edited, `backend/secrets.json` never
  opened. Everything ran in a `mktemp -d` in the session scratchpad; `backup/` was only read
  (`find backup -newer scripts/auth_rehearsal.sh | wc -l` → **0**, and the script checks the
  snapshot's `app.db` sha256 before and after).
- **The rollback target is `ce55a53`, not `cfc1669`** (the caller's correction, applied here to
  "Roli's answers" 1, decision 13, L13 step 3, deploy step 12 and "Rollback safety, measured").
  Production runs `ce55a53` = `cfc1669` + `deploy other sites` (`import /etc/caddy/sites/*.caddy`
  in `deploy/Caddyfile`, a sites volume in `docker-compose.yml` — this Caddy fronts Roli's other
  apps). `ce55a53` **is an ancestor of the branch**, so the merge keeps those lines:
  `git diff ce55a53 3801260 -- deploy/` is empty and `docker-compose.yml` differs by exactly the
  five auth lines (`APP_ENV`, `TRUSTED_PROXY_HOPS` and their comment). **The rollback command:**
  `git checkout ce55a53 && docker compose up -d --build` — it leaves the server on a detached
  HEAD, so `git checkout main` before the next `git pull`.
- **Three files, not one**: `scripts/auth_rehearsal.sh <snapshot-dir> <secrets-shape.json>
  [--no-browser]` orchestrates (copies, boots, kills by exact PID, `git archive`, preflight, log
  lines), `scripts/auth_rehearsal_checks.py` holds the API checks (httpx + PyJWT from the backend
  venv; the DB only through `sqlite3 mode=ro`), `scripts/auth_rehearsal_browser.mjs` the three
  Chromium steps (CDP virtual authenticator; `PLAYWRIGHT` defaults to the racer checkout's
  `playwright-core` 1.62.1, as L0 found there is none in `frontend/node_modules`). Ports: new code
  **8244**, old code **8245** (L14's row, free since L14 was dropped), vite **8264**. The script
  refuses a snapshot whose kind is not `deploy`, a busy port, or a work dir inside the repo.
  `KEEP_WORK=1` keeps the work dir. Additions beyond the section, each cheap: a **baseline** boot
  of the old code on an untouched copy (what production serves today, so "unchanged" has
  something to be compared with), a **third** boot (idempotency), and a boot with
  **docker-compose's production environment**.
- **Idempotent, measured**: two runs on fresh copies gave **131 PASS, 0 FAIL** each, and their
  PASS/FAIL lines are identical once the work-dir name, the invite code, the expiry minute and
  ids are masked (`diff` → empty). Only the timing INFO lines move. (A first run found three
  things wrong **in the script**, none in the code: the preflight never prints the literal
  `unmatched_names: []` the plan expects — see the deploy checklist below; `/stats/*` carries a
  per-response `generated_at`; and a login from a deep link returns to that link, not to the
  dashboard.)
- **The report** (run 3; run 2 identical):
  - **Step 0.** The snapshot holds 6 players, 17 tournaments, 23 friendlies, 262 comments — and
    **8 real push subscriptions**, deleted from the copy before anything booted (→ 0); no VAPID
    key anywhere.
  - **Step 1, baseline** (`ce55a53` on an untouched copy): boot logs only `Cup defs validated`,
    `DB initialized`; JWT login as Roli 200; 16 reads 200; 17 tournaments; cup owners
    **Lorbeerkranz → Berni, Bauernkranz → Rumpi**.
  - **Step 2, `auth-preflight`** before any boot: **exit 0**, `RESULT: OK`, no `PROBLEM:` line;
    `group to create: altherren`, `memberships to create: 6`, `accounts with a password: 6 (Roli,
    Flo, Rumpi, Berni, Atzi, Mike)`, `accounts without a password: 0`, `owners (site admins): 1
    (Roli)`, `group_id backfill: tournament=17, friendlymatch=23, featurerequest=1`; the copy's
    sha256 identical afterwards.
  - **Step 3, first boot**: healthy in **3.1 s** (12.8 s once, on a busy Pi), migration and six
    default-profile hashes included. Log, in order: `Cup defs validated` · `Auth migrated: 6
    accounts, 1 group, 6 memberships — 0 players without a password, 1 owner, backfilled
    tournament=17, friendlymatch=23, featurerequest=1` · `Cups imported: 2` · `DB initialized`.
    **No `Record holders seeded` / `swept` line fires** — production already holds its records
    and nothing is orphaned. DB: group `altherren` / `Altherren`; 6 memberships (1 owner, 5
    members); 6 `$argon2id$` hashes; site admins `[Roli]`; no tournament / friendly / idea left
    without a group; **657** `clubstarrating` rows still `group_id NULL` (global — L12's fix to
    L1's backfill holds on production's data); cups `bauernkranz`, `default`. **All six log in**
    (Roli admin/owner, the other five editor/member), `Berni` with his non-ASCII password
    included, and `roli`, `flo`, `berni` in lower case; a wrong password 401. `/me` keys: `groups
    has_passkey has_password password_migrated player_id player_name role session_id site_admin`.
    Anonymous `/tournaments` 401; with the cookie **17 = 17** rows. **Identical to the old code's
    answer** (after dropping `generated_at` and the `/g/altherren` prefix): `/cup/defs`, both
    `/cup?key=`, `/tournaments`, `/stats/players`, `/stats/ratings`, `/friendlies` and
    `/stats/records` for all 9 mode × scope pairs — the new code does not even add a field to any
    of them. **The exchange**: a JWT minted exactly as the old `create_token` did (HS256, `sub`,
    `role`, `player_id`, `player_name`, `iat`, `exp` +180 d) → **200** + cookie, `/me` 200; one
    signed with another secret → 401. `GET /tournaments` with the cookie **p50 34.8–36.4 ms**
    over three runs (L2 measured 35.5 on the dev copy). **Browser** (Chromium, 390 px): password
    login as Roli through the login screen, Settings → Account → Add a passkey → `has_passkey`,
    one resident credential, exported with its private key. **Deep links**: logged out,
    `/live/19?comment=264` → `/g/altherren/login`, and the login returns to
    `/g/altherren/live/19?comment=264`; logged in, `/live/19?comment=264` →
    `/g/altherren/live/19?tab=comments` (the one-shot consumed), `/stats?view=h2h` →
    `/g/altherren/stats?view=h2h`, `/profiles/3` → `/g/altherren/profiles/3`, `/ideas?idea=1` →
    `/g/altherren/ideas`, `/dashboard` and a bare `/` → `/g/altherren/dashboard`.
  - **Step 4, rollback** (`git archive ce55a53 backend`, **same file**): boots clean (`Cup defs
    validated`, `DB initialized`); **old JWT login 200 for all six**, Berni included; `/me` admin;
    `/tournaments` 200, 17 = 17; both cups and `/stats/records`, `/stats/players` identical to the
    baseline; `/friendlies`, `/ideas`, `/players` 200; `POST /tournaments` 200 → id **20** with
    `group_id NULL`; a comment on it 200 → id **265**. The old code left the new tables alone: 6
    accounts, 6 memberships, 1 passkey, 12 sessions, 2 cups.
  - **Step 5, roll forward**: `Auth migrated: 0 accounts, 0 groups, 0 memberships — 0 players
    without a password, 0 owners, backfilled tournament=1`, no second cups import; tournament 20
    → `group_id 1`; all six log in; `/tournaments` lists 18 with it; comment 265 is there; **the
    JWT the old code minted during the rollback exchanges** → 200, `/me` 200; the cookie from the
    first boot is **still live**; cups, ratings, players and all 9 records identical to the
    baseline. **The passkey survives**: 1 row, and a *fresh* Chromium with that credential
    imported into a new virtual authenticator signs in as Roli via "Use a passkey", nothing typed.
  - **Step 6, a third boot** migrates nothing (no `Auth migrated`, no `Cups imported`). The five
    escape hatches, against the running server as on deploy day: **`reset-link --player roli`** →
    exit 0, `https://lorbeerkranz.xyz/g/altherren/reset#<token>  (Roli (id=1), single use,
    expires …)`; `POST /auth/reset` → 200, still site admin; the session from before is ended;
    the same token again 400; the new password 200, the old 401. **`set-password --player BERNI`**
    (piped, `Grüß Gott wieder 2`) → exit 0, `Password set for Berni (id=4); existing sessions stay
    signed in`, not echoed, login 200; two different entries → exit 1, nothing stored.
    **`make-admin --player Flo`** → exit 0, `/me` admin + `site_admin`; `--revoke` → editor.
    **`invite --group altherren --note …`** → exit 0, `XXXX-XXXX (group altherren, single use,
    expires …)`; registering with it → 200, editor in `altherren`, `/tournaments` 200; `--group
    nope` → exit 1. **`sessions --player Roli`** → `3 live session(s)`; **`--revoke-all`** →
    `Revoked 3 session(s)`, Roli's cookie 401. `reset-link --player Nobody` → exit 1.
  - **Step 7, docker-compose's environment** (`APP_ENV=production`, `TRUSTED_PROXY_HOPS=1`, no dev
    origin, default `AUTH_ORIGIN`) on the migrated copy: the boot guard passes; `/health` from
    loopback 200 (the healthcheck's path); anonymous `/tournaments` 401; login → `HttpOnly;
    Max-Age=7776000; Path=/; SameSite=lax; Secure`.
  - **Step 8**: `hash_password` (default profile) × 10 **median 114.0–115.5 ms** (L1: 123.7 on the
    dev data — the same order, as expected); snapshot unchanged.
- **For the deploy checklist (L15 carries these into `AGENTS.md` §7):**
  1. **Run the rehearsal first**, after the fresh `backup-deploy-data` (so it rehearses *that*
     snapshot): `scripts/auth_rehearsal.sh backup/deploy/<ts> <shape.json>` → `ALL PASSED`.
     `<shape.json>` is Roli's own copy of the secrets' shape; the script never needs the real one.
  2. **The preflight's success is `RESULT: OK` with no `PROBLEM:` line**, not literal
     `unmatched_names: []` / `case_collisions: []` lines (the report has no such lines); step 6
     above is corrected accordingly, with the expected counts.
  3. The expected boot log on production is exactly step 3's four lines above; **no** `Record
     holders seeded` is expected.
  4. **The rollback is `ce55a53`**, and after it `git checkout main` before any later pull.
  5. **"The tokens still in every phone's `localStorage` are valid" is true only for a phone that
     has not opened the new app yet** — the new frontend deletes the JWT when the exchange
     answers. After a rollback such a phone meets the old login screen once; its `secrets.json`
     password works (measured for all six). A password changed or reset *on the new code* is not
     in `secrets.json` and does **not** carry back.
  6. The snapshot carries production's **8 push subscriptions**: any stack built from it must
     delete them first (the script does) and must never be given a VAPID key.
- **Not rehearsed here, and why:** the frontend was the vite dev server, not the production build
  (`vite build` + nginx) — L10 measured the build's resume separately; `docker compose build` was
  not run (an arm64 build proves nothing about the x86 image; L1/L8 proved the wheels by
  download). Nothing in `backend/` or `frontend/` changed, so no gate beyond the rehearsal ran.

## L16 — The push dispatcher no longer holds the write lock across network calls  ☑

> Not in the original plan. Found by a worker (a `POST /auth/login` answered 500 "database is
> locked" while pushes were going out); approved by Roli 2026-09-23.

**The gap.** `NotificationDispatcher._deliver` opened **one** `Session`, looped over a fan-out's
subscriptions `await`ing an HTTPS call to the push service for each, and committed **once at the
end**. From the second subscription on, that loop's reads (`push_subscription_mode`, then
`_payload_for`'s language and group-prefix reads) **autoflushed** the previous row's pending
UPDATE — which takes SQLite's write lock (no WAL here) — and the lock then rode across every
remaining push (up to the client's 10 s timeout each) until the commit. Any other writer waited
out pysqlite's 5 s busy timeout and failed. Before this batch a login wrote nothing; since L2
every login writes an `AuthSession` row, so a login during a finished match or a four-record
night's fan-out — deploy day, when all six log in fresh — could 500.

**The fix** (`backend/app/services/notifications.py` only). **No transaction is open across an
`await` on the network.** `_deliver` is now three phases: `_plan_deliveries` reads the rows, each
row's mode and each payload in one short session and closes it, returning `_PlannedDelivery`
values (id, the `WebPushSubscriptionData`, the payload); `_deliver_one` sends with no session
open; then it writes the result to a **fresh read** of the row in its own short transaction,
through `_record_delivery_result`, which is the old field logic moved verbatim. Unchanged: which
rows are sent to (the `off`/`finished_only` filter, the personal-event default-mode exception),
the language per recipient, L3's group prefix, and every field written per outcome (`updated_at`,
`last_http_status`, `last_success_at`, `last_error`, `failure_count`, `last_failure_at`,
`disabled_at` on 404/410, the two exception branches). The poke digest
(`_ingest_poke`/`_flush_poke_digest*`) touches no database — it only enqueues — so there was
nothing to fix there; no other `async` code in the module opens a session. WAL was **not**
turned on (it would change what `backup-deploy-data` must copy).

**The proof.** `backend/tests/test_push_dispatcher_lock.py`:
- `test_a_write_succeeds_while_a_push_fan_out_is_on_the_wire` — three subscriptions, a faked
  `send_web_push_message` that, from its second call on, performs an ordinary write **while the
  push is in flight** (`create_session` + commit, on a thread, on its own connection with a
  0.5 s busy timeout) and asserts it succeeds in under 0.5 s. **Against the unfixed code it fails**
  with `sqlite3.OperationalError: database is locked` on `INSERT INTO authsession` — the diagnosis,
  confirmed. With the fix it passes.
- `test_every_field_written_after_a_send_per_outcome` — one fan-out over six rows (201, 500 with a
  1000-char body, 404, 410, `WebPushUnavailableError`, a raising transport), each field asserted,
  including the 400-char truncation and `failure_count` 2 → 3 / → 0.
- `test_a_subscription_deleted_mid_fan_out_is_not_resurrected` — a row deleted while its push is
  on the wire is not written back and the next row still is (the old code raised `StaleDataError`
  on flush here and lost the whole fan-out's bookkeeping).
The existing push tests (`test_push_notifications.py`, `test_ideas.py`, `test_accounts.py`) pass
unchanged.
Gates: `make test` **504 passed** in 27:36 (baseline 501 at `3928204`, +3 here), `make lint`
clean.

**Deviations.**
- A payload that cannot be built is recorded as a failed send (generic-exception branch), exactly
  as before, when it was built inside the send's `try`.
- **One deliberate behaviour change**: a failure *writing down* a result (e.g. the lock held by
  someone else past 5 s) is logged and the fan-out continues to the remaining devices; before,
  it aborted the fan-out. The pushes themselves are unaffected.
- A result is applied to a fresh read of the row, so `failure_count += 1` counts from the current
  value and a row deleted mid-fan-out stays deleted — identical to before whenever nothing else
  wrote the row in between.
- `ruff format` would reformat `notifications.py`, as it already would at `3928204`; not a gate
  (`make lint` is `ruff check`), so the file was not reformatted.

## L14 — Documentation pass A (everything but passkeys; runs before deploy A)  ☒ absorbed into L15

> **Dropped** (Roli, 2026-09-23: one deploy). Its whole job moves to L15 — see "Roli's answers" at the top of this file. **Done by L15**: every Canon line below is applied or accounted for in L15's Deviations; nothing in this section was carried out under L14's name.

**The gap.** `AGENTS.md` describes readers, JWTs, `player_accounts[]` as the login source,
`/health` as a smoke check and `cups.json` as the runtime config; `README.md` says "Reader: no
login"; `DESIGN.md` has no auth screens; `secrets.json.example` shows the old shape.

**The change.** From every task's "Canon" line (L0–L7, L10–L13): `AGENTS.md` §2 (modules), §3
(commands, baselines, the same-origin dev), §4 (settings keys, `cups.json` as seed, the guard),
§5 (the tables, the migration, the overlay, the rollback measurements), §6 (the gate, the
tuples, the claims, sessions, rate limits, the account/admin/roster/path rules, the cache-policy
rows), §7 (the new deploy — the section "Deployment" below, verbatim in substance, with the
escape hatch), §8 (`auth-preflight` and the five commands), §9 (identity/access), §10 (the
gotchas: cookie header beats jar; iOS PWA has its own cookie jar; `basename`; the offline rule;
the exchange's expiry), §11 (current state, dated), §12. `DESIGN.md`: §7 rows (`AuthScreen`,
`InviteCodeField`, `RetryCountdown`, the admin rows and sheet, `PlayerLink stretched`), §5b
words, §10 (`/admin` a destination; basename), the header's "last checked" block. `README.md`:
roles, login, dev setup (`.env.local` content), the secrets example. `backend/secrets.json.example`:
`player_accounts[]` kept with a comment "migrated on first boot; delete after deploy B", the
new optional keys. Delete nothing that still describes deployed behaviour until §11 says it is
deployed.

**Definition of done.** ☑ Every "Canon" line above is reflected or explicitly declined in
Deviations (L15's); ☑ `grep -n "reader" AGENTS.md README.md DESIGN.md` lists only historical mentions
(A-batch names) — each remaining line judged and listed (L15's); ☑ the gates re-run on the final tree
and the counts written into §11.

**Deviations.** — (none; see L15)

## L8 — Passkeys, server side  ☑

**The gap.** `Passkey` and `WebAuthnChallenge` tables exist (L1) and nothing writes them;
`has_passkey` is a constant `False` in `MeOut`; `webauthn` is not installed.

**Verify first.**
```bash
.venv/bin/python -c "import webauthn" 2>&1 | tail -1          # → ModuleNotFoundError (run in backend/)
grep -n "passkeys" backend/app/routers/auth.py                 # → 0
```

**The change.**
1. **`requirements.txt`** — `webauthn==2.7.1`, `pyOpenSSL==25.1.0` (§7 of the answers explains
   the versions; **do not lift the `cryptography<46` pin** — it predates this batch and its reason
   is not recorded; a batch that lifts it does so on purpose). `pip install -r` in the venv;
   `docker compose build backend` once to prove the resolve in the image (or say it was not run).
2. **`services/passkeys.py`** — `relying_party_for(request, settings) -> RelyingParty | None`
   (pinned: `Origin` absent or equal → the pinned pair, else `None`; dev-origin: parse `Origin`,
   `https` or `http` on `localhost`/`127.0.0.1` only); `registration_options(s, account, rp)`
   (mint a `WebAuthnChallenge(kind="register", player_id, expires +5 min)`, `generate_registration_
   options(rp_id, rp_name, user_id=user_handle bytes, user_name=display_name,
   user_display_name=display_name, authenticator_selection=AuthenticatorSelectionCriteria(resident_
   key=REQUIRED, user_verification=REQUIRED), exclude_credentials=[…])` → `options_to_json`);
   `verify_registration(s, account, rp, credential_json, label)` (find the challenge row by the
   `clientDataJSON` challenge, **delete it**, `verify_registration_response(credential=…,
   expected_challenge=…, expected_origin=rp.origin, expected_rp_id=rp.rp_id,
   require_user_verification=True)` → `Passkey` row; a `credential_id` already stored → 409);
   `authentication_options(s, rp)` (challenge `kind="login"`, `player_id=None`;
   `generate_authentication_options(rp_id, user_verification=REQUIRED)` — **no
   `allow_credentials`**); `verify_authentication(s, rp, credential_json) -> Account` (challenge
   by the same lookup, deleted first; `Passkey` by `rawId` → 401 generic if unknown;
   `verify_authentication_response(…, credential_public_key, credential_current_sign_count,
   require_user_verification=True)`; `new_sign_count < stored and stored > 0` → refuse and log
   "clone?"; store `new_sign_count`, `last_used_at`); `list_passkeys`, `remove_passkey(s, account,
   passkey_id)` (**ownership by listing**; 409 when last and `password_hash is None`; then
   `revoke_all_sessions(keep=None)`); `sweep_expired_challenges(s)` called from the options
   endpoints (cheap, keeps the table small).
3. **`routers/auth.py`** — `POST /auth/passkeys/register/options` (session; no membership needed
   — `ACCOUNT_PATHS` covers `/auth/`), `POST /auth/passkeys/register/verify {credential, label?}`,
   `GET /auth/passkeys` → `PasskeyOut[]{id, label, device_type, backed_up, created_at,
   last_used_at}`, `DELETE /auth/passkeys/{id}`, `POST /auth/passkeys/login/options` (public,
   limited), `POST /auth/passkeys/login/verify {credential}` (public, limited; mints a session
   `kind="passkey"`, returns `MeOut`). `MeOut.has_passkey` becomes real; `remove_password`'s
   409 rule now has something to check. All refusals on the public pair are one generic 401.
4. **`tests/soft_authenticator.py`** — a `SoftAuthenticator` class: `create(options_json,
   origin) -> credential dict` (a P-256 key from `cryptography`, `attestationObject` with
   `fmt="none"` and `authData = rpIdHash ‖ flags ‖ counter ‖ attestedCredentialData` built by
   hand, COSE key CBOR via `cbor2`, `clientDataJSON` with `type/challenge/origin`) and `get(
   options_json, origin, *, user_verified=True, counter=None, rp_id=None) -> assertion dict`
   (signature over `authData ‖ sha256(clientDataJSON)`), every knob a test needs: origin, rpId,
   the UV bit, the counter.
5. **`tests/test_passkeys.py`** (≈25) — register + list + login round trip; discoverable login
   with no identifier; the six refusals: wrong origin, wrong rpId, UV bit clear, counter
   backwards, replayed assertion (challenge gone), unknown credential; a challenge past
   `expires_at`; last-passkey removal 409 without a password and allowed with one; removal
   ends every session (the caller's included → the next request is 401); the pinned/derived
   `relying_party_for` matrix including `http://localhost` accepted and `http://192.168.178.78`
   refused in dev-origin mode; `exclude_credentials` carries existing ids.
6. `make gen-types` (`PasskeyOut`, `MeOut` unchanged in shape) and `schema.d.ts` committed.

**Definition of done.**
- ☑ `make test` (the ≈25), `make lint`, `make gen-types` committed.
- ☑ A registration and a login against the stack with `curl` and the soft authenticator (a
  five-line Python driver in Deviations) succeed; the same assertion posted twice → 401.
- ☑ Deviations filled in, including the pip resolve output's last line for the venv and (if
  run) the image.

**Canon.** `AGENTS.md` §5 (`Passkey`, `WebAuthnChallenge` — consumed by delete), §6 (the six
routes, the rpID rule, one-way-in, removal ends sessions), §10 ("`webauthn` is pinned to 2.7.1
because of `cryptography<46`").

**Deviations.**
- **`relying_party_for(settings, *, origin)` takes the `Origin` header's value, not the
  `Request`** — the one place rpID and origin are decided is a pure function, so the
  pinned/derived matrix is one test with no app behind it; the router's `_relying_party(request)`
  is the only caller and hands it `request.headers.get("origin")`. Everything else in the
  section's step 2 is as named: `registration_options`, `verify_registration`,
  `authentication_options`, `verify_authentication`, `list_passkeys`, `remove_passkey`,
  `sweep_expired_challenges`, plus `passkey_out` (the `PasskeyOut` shape, spelled once, the
  `session_out` precedent) and two exceptions the router translates — `PasskeyRefused`
  (carries the real reason **for the log only**) and `PasskeyConflict` (409).
- **Dependencies: wheels on both targets, nothing compiles.** `pip install -r` into the shared
  venv (through the symlink, additive) ended `Successfully installed cbor2-6.1.4 pyOpenSSL-25.1.0
  pyasn1-0.6.4 webauthn-2.7.1`; `cryptography` stayed at the already-installed **45.0.7** (inside
  the `<46` pin, untouched). The one binary wheel is
  `cbor2-6.1.4-cp311-cp311-manylinux_2_28_aarch64.whl`; the other three are `py3-none-any`. For
  production, `pip download --only-binary=:all: --platform manylinux_2_28_x86_64
  --python-version 3.11` fetched `cbor2-6.1.4-cp311-cp311-manylinux_2_28_x86_64.whl` (464 kB),
  `cryptography-45.0.7-cp311-abi3-manylinux_2_28_x86_64.whl` (4.5 MB) and the three pure wheels —
  so `python:3.11-slim` (Debian 12, glibc 2.36 ≥ 2.28) installs without build tooling.
  **`docker compose build` was not run** (an arm64 build on this Pi would prove nothing about the
  x86 image; the download above is the proof for that target). `cryptography<46` was not lifted.
- **What the library checks and what this code adds.** `webauthn` 2.7.1 does the origin, rpID
  hash, UP/UV flags, signature and counter; the code around it owns the challenge (minted per
  `options` call, `expires_at = +5 min`, **consumed by a conditional `DELETE` + commit before
  `verify_*` runs**, refused-and-consumed when expired, of the other ceremony, or a registration
  challenge minted for another account), the credential lookup by `rawId`, the user-handle
  cross-check (an assertion's `userHandle`, when present, must be the credential's account's —
  an absent handle is accepted), the store of `sign_count` / `backed_up` / `last_used_at`, and
  `excludeCredentials` from the stored rows. **The counter rule is the library's, which is
  stricter than the section's**: an assertion whose counter is not *greater* than the stored one
  is refused whenever either is above zero — so a counter that goes backwards *or stays equal* is
  a refusal, while an authenticator that always reports 0 (iCloud Keychain, Google Password
  Manager — i.e. Roli's phone) signs in every time; both are tested. The `clone?` marker is
  appended to the log line when the library's message names the sign count.
- **Wire shapes L9 codes against.** `POST /auth/passkeys/register/options` → the creation
  options JSON as `@simplewebauthn/browser`'s `startRegistration({ optionsJSON })` takes it
  (`rp`, `user`, `challenge`, `pubKeyCredParams`, `timeout`, `excludeCredentials`,
  `authenticatorSelection{residentKey: "required", requireResidentKey: true, userVerification:
  "required"}`, `attestation: "none"`) — typed as a plain `object` in `schema.d.ts`, because it
  is the browser API's own dictionary and simplewebauthn types it; `POST
  /auth/passkeys/register/verify {credential, label?}` → `PasskeyOut` (400 `"That passkey could
  not be registered"` for every failure, 409 `"That passkey is already registered"`, 400
  `"Passkeys are not available from this origin"` when the relying-party rule refuses);
  `GET /auth/passkeys` → `PasskeyOut[]` oldest first; `DELETE /auth/passkeys/{id}` → `{ok}` **and
  `Set-Cookie … Max-Age=0`** (the caller's own session is among the ended ones — the UI must go to
  `/login`), 404 for an id that is not the caller's (an admin's included: ownership, not role),
  409 `"Set a password before removing your last passkey — an account needs one way in"`;
  `POST /auth/passkeys/login/options` → the request options JSON (`challenge`, `timeout`,
  `rpId`, `userVerification: "required"` and **no `allowCredentials` key at all** — the library
  spells "none" as `[]` and the router drops it); `POST /auth/passkeys/login/verify {credential}`
  → `MeOut` + the cookie, `kind="passkey"`, through `_start_session` like every other way in;
  **every** refusal there is 401 `"That passkey could not be used to log in"` (unknown credential,
  replay, wrong origin, bad signature, backwards counter, UV clear, malformed body, an origin the
  rule refuses, a missing `Origin` in dev mode) with the reason in the server log. `MeOut`'s
  shape did not move (`has_passkey` was already read from the table). `types.ts` gained the one
  reserved line, `export type Passkey = S["PasskeyOut"]`.
- **Rate limits: every mint counts.** The public pair shares the `passkey` family (30 / 10 min
  per IP, 300 global). A minted sign-in challenge is recorded as an attempt, not only a failed
  verify — the challenge table is the one thing an anonymous caller can grow, and a mint-only
  loop would otherwise never meet the limiter. The 31st mint from one IP is a 429 with
  `Retry-After` (tested); the sweep on every `options` call keeps the table to the last five
  minutes. The register pair is an account path and is not limited (a session is the cost).
- **`PUBLIC_PATHS`** gained exactly `/auth/passkeys/login/options` and
  `/auth/passkeys/login/verify` (L2's handoff); the register pair, the list and the delete are
  account paths by construction. L2's audit walked the six new route × method pairs unchanged
  and stayed green (**14 passed**) — with a no-membership session the account paths answer 400 /
  200 / 404 (never 401 or 403) and the public pair answers the route's own 401 / 422, which the
  audit tells from the gate's by its spelled-once `detail`.
- **`Makefile`** (L1's leftover, done here): `backend` / `backend-lan` run with
  `AUTH_DEV_ORIGIN=1 APP_ENV=development`, so `make dev` derives the relying party from the
  request — and, as a side effect worth knowing, the cookie's `Secure` flag follows the request
  scheme instead of the pinned `https://` origin, which is what lets the phone on
  `http://192.168.178.78:8000` keep a session at all once the main checkout moves onto this
  branch. `docker-compose.yml` never sets the flag and the boot guard refuses it in production.
- **The soft authenticator** (`tests/soft_authenticator.py`): a real P-256 key, a CBOR
  `fmt="none"` attestation object, authenticator data with real UP/UV/BE/BS/AT bits and a
  4-byte counter, a `clientDataJSON` with `type`/`challenge`/`origin`; `create(options, origin,
  *, rp_id, challenge, user_present, user_verified)` and `get(options, origin, *, rp_id,
  challenge, counter, user_present, user_verified, user_handle, credential_id, signer)` — every
  knob a negative needs. It reports BE+BS by default (a synced passkey, `multi_device`), so the
  tests exercise the `parse_backup_flags` path a real phone will take.
- **Every negative was proven to bite**, not assumed: a throwaway pytest plugin (kept in the
  session scratchpad, never in the repo) weakened **one** check per run — trust the client's
  origin; accept any rpID; `require_user_verification=False`; forget the stored counter; stub the
  library's `verify_signature`; look the challenge up without deleting it; delete it without
  checking expiry; ignore the challenge's kind; ignore which account minted it; drop the user
  handle; answer an unknown id with the first stored row *and* stub the signature; delete a
  passkey by bare id; drop the last-way-in rule; leave sessions alone on removal; admit plain
  http on any host in dev mode; ignore a disagreeing `Origin` in pinned mode; send
  `allowCredentials`; drop `residentKey`/`userVerification` from the options — and the test
  guarding each one **failed** (18 of 18; `1 failed, 29 deselected` each), while the same
  three tests unweakened pass. Two sabotages had to be corrected before they bit, which is the
  point of running them: comparing the handle against `None` refuses everything (so the test
  stayed green for the wrong reason), and an unknown credential cannot be *accepted* while the
  signature still verifies against the substituted row — the lookup and the signature are two
  checks, and "an unknown credential is refused" rests on both.
- **Verified against the isolated stack** (backend **8239**, vite **8259**, the main checkout's
  `app.db` and `uploads/` copied to a `mktemp -d` outside the repo — **7 real push subscription
  rows and their 7 preferences deleted from the copy before the first boot**, no VAPID key in the
  throwaway secrets — every PID killed by number, the directory removed): first boot logged
  `Auth migrated: 3 accounts, 1 group, 6 memberships …` and `Cups imported: 2`. **Through
  vite, logged out**: `POST /api/auth/passkeys/login/options` with no `Origin` → 401 (dev mode,
  no relying party), with `Origin: http://localhost:8259` → 200 and options with `rpId:
  "localhost"`, with a LAN `http://192.168.178.78:8000` origin → 401, `register/options` → the
  gate's 401, HEAD → 405 as documented. **The plan's driver** (httpx + `SoftAuthenticator`,
  Berni): password login 200 → `register/verify` **200** (`multi_device`, `backed_up: true`) →
  jar cleared → `login/verify` **200** as Berni with `has_passkey: true` → the same assertion
  again **401**. **A real ceremony in Chromium** (Playwright + CDP `WebAuthn.addVirtualAuthenticator`,
  ctap2 / internal / resident / UV, a page on `http://localhost:8259/g/altherren/` — `isSecureContext`
  true): Roli's password login → `navigator.credentials.create()` on the served options →
  `register/verify` **200** (`label: "CDP virtual"`, `single_device`, `backed_up: false` — the
  virtual authenticator sets no BE/BS), `WebAuthn.getCredentials` shows **one resident credential
  for `localhost`, signCount 1, with a user handle**; `/me` `has_passkey: true`; logout → `/me`
  401; `login/options` carries **no `allowCredentials`**; `navigator.credentials.get()` with no
  identifier → `login/verify` **200** as Roli, `/auth/sessions` = `[passkey · "Linux · Safari" ·
  current]`, `/tournaments` 200 on that session; **the same assertion posted again → 401**; a
  second `get()` → 200 with the authenticator's counter at 3; `DELETE /auth/passkeys/1` → `{ok}`
  and `/me` **401** on the very next request (this session was among the ones ended); a further
  `get()` + verify → **401** (`unknown credential` in the log). The script is the shape L9's
  `scripts/passkey_e2e.mjs` should take; it lived in the scratchpad for L8 because the plan
  gives that file to L9.
- **What only Roli's iPhone can prove**, stated plainly: that Safari offers a passkey on
  `https://lorbeerkranz.xyz` at all; that Face ID sets the UV bit (the server *requires* it, so a
  device that does not would be refused at verification rather than let through); that iCloud
  Keychain syncs the credential and reports it `multi_device` / `backed_up` (the soft
  authenticator does, the virtual one does not); that a synced credential's counter is 0 forever
  (tested here as the accepted case, unverified on the device); that the installed PWA's own
  cookie jar takes the session the `login/verify` sets (the same jar fact P5 lives with); and
  that `device_label` reads the standalone app's UA as `iPhone · Safari` (L3's rule, exercised by
  a test, not by a phone). None of it can be reached from this machine (the LAN is plain http and
  not a secure context off `localhost`).
- **`schema.d.ts` was generated from *this commit's* tree, not from the working tree.** L11
  runs beside this task and its in-flight `routers/players.py` carries three docstring edits
  (avatar meta, header meta, the guestbook-subject image — descriptions only, no shape), which
  a plain `make gen-types` on the shared tree pulled into the file as comment hunks. Committing
  those under L8 would have made the file irreproducible from L8's commit, so the schema was
  dumped from `git archive HEAD` plus L8's own six backend files (`dump_openapi.py` on that
  tree, `openapi-typescript` on its output): **+348/−2, the six routes, `PasskeyOut`,
  `PasskeyRegisterVerifyBody`, `PasskeyLoginVerifyBody`, the `MeOut` docstring, nothing else.**
  Consequence for whoever commits after L11: `make gen-types` will show a **comment-only**
  diff of L11's three descriptions — commit it with L11 or at the final gates; it changes no
  type.
- **Gates:** `make lint` clean; `make gen-types` committed as above; `make test`
  **501 passed** in 51:37 on a loaded Pi (load average 12 — `npm run check`, the sabotage runs and Roli's dev servers shared the four cores; the plan's 34 min is the quiet number). That is the baseline **465** at `d699892` plus **30** in `tests/test_passkeys.py` plus **6** from L11's in-flight `tests/test_player_profiles_auth.py` on the shared tree (+6/−0 `def test_`, uncommitted, not L8's); nothing pre-existing moved. L2's gate audit is among the 501 and was also run alone against the two new public paths (14 passed); `cd frontend && npm run check` green — tsc, eslint and vitest **919 tests in 95 files** in 185 s on the *shared* tree (L11's in-flight frontend files and its new test file ride in that count; L8 adds no frontend test, only the one `types.ts` line).

## L9 — Passkeys in the browser; the "secure your account" strip  ☑

**The gap.** The login page has a reserved slot; Settings → Account → Password has no
passkey rows; nothing tells a migrated account to add one.

**Verify first.**
```bash
grep -n "simplewebauthn" frontend/package.json                       # → 0
grep -n "passkey" -ri frontend/src/pages/settings/SecuritySection.tsx  # → 0
```

**The change.**
1. **`package.json`** — `@simplewebauthn/browser` `^13` (the one new frontend dependency; the
   plan names it, `AGENTS.md` §9 satisfied). `npm install`; the lockfile in the commit.
2. **`api/passkeys.api.ts`** — `registerPasskey(label)`: `POST …/register/options` →
   `startRegistration({ optionsJSON })` → `POST …/register/verify`; `loginWithPasskey()`:
   `POST …/login/options` → `startAuthentication({ optionsJSON })` → `POST …/login/verify` →
   `MeResponse`; `listPasskeys()`, `removePasskey(id)`; `passkeysSupported()` =
   `browserSupportsWebAuthn()`; `platformPasskeyAvailable()` = `platformAuthenticatorIsAvailable()`.
   A `NotAllowedError` (the user cancelled the sheet) is swallowed into `null`, never a toast.
3. **`LoginPage.tsx`** — the reserved slot: a ghost `Button` full-width "Use a passkey"
   (`Fingerprint` glyph), shown only when `passkeysSupported()`; on success `setSession` and go.
   Order on the card: password form, then a `divider`, then the passkey button — a person with a
   password is not made to hunt for it.
4. **`SecuritySection.tsx`** — a **"Passkeys"** `SettingsSection` between Devices and Password:
   a `List` of passkeys (`label` title, `created · last used` subtitle, a `Pill` "synced" when
   `backed_up`), trailing ghost icon `Button` (`Trash2`) → `ConfirmDialog` **with the red block**
   (a stored credential is deleted) whose subtitle says "Every device will be signed out,
   including this one."; the delete is refused by the server (409) when it is the last way in,
   and the button is **disabled with a title** in that case from `hasPassword` / count; a footer
   `Button` solid "Add a passkey" (`Input` label, default the `device_label` the server would
   guess — or just "This device"); hidden with a muted line "This browser cannot make passkeys."
   when unsupported. The Password block's "Remove password" text action appears when
   `hasPasskey` (L7 left the hook).
5. **`ui/shell/SecureAccountNotice.tsx`** (new) — the `PushSetupNotice` shape: one `warn` line
   under the top bar on every shell page, "Secure your account — add a passkey." with a `Link`
   to `/settings?tab=account` as the action; rendered iff `passwordMigrated && !hasPasskey`;
   **not dismissible** (the decision: it stops when they have a passkey); renders nothing when
   `!passkeysSupported()` — a device that cannot comply is not nagged. `AppShell` mounts it next
   to `PushSetupNotice`; when both apply they stack (measure the tab strip's offset — two lines
   are the price; write the number).
6. **`scripts/passkey_e2e.mjs`** — the Playwright driver of the recipe's CDP note: register a
   passkey on `http://localhost:<V>`, log out, "Use a passkey" → in; remove it → every context
   is out. Kept in the repo so deploy B's rehearsal can re-run it.

**Definition of done.**
- ☑ `passkeys.test.tsx` (≈8, the API module mocked): the button hidden when unsupported; a
  cancelled sheet is silent; the notice's three conditions; the last-way-in disable.
- ☑ The Playwright script passes; a screenshot at 390 in both themes of the login card with the
  passkey button and of the Settings section; the notice measured (height, and the tab strip
  offset with one and with two notices).
- ☑ `npm run check`, `npm run build` (a new dependency: the chunk size written down against
  the ≈734 kB baseline).
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: the passkey rows, the notice, "a cancelled system sheet is not an
error"; §5b: `passkey`, `synced`, `Use a passkey`, `Add a passkey`. `AGENTS.md` §2 (`push/` is
not where passkeys live — `api/passkeys.api.ts` is), §10 (the one dependency and why).

**Deviations.**
- **npm replaced the `frontend/node_modules` symlink with a real install.** `npm install
  --save-exact @simplewebauthn/browser@13.3.0` (a `--dry-run` first said "added 1 package") left
  the worktree's `frontend/node_modules` as its own directory: 242 MB, a full reinstall from the
  lockfile. **The main checkout's `node_modules` was not touched** (still dated Sep 20, still without
  the package). Stopped and reported; the coordinator chose to keep it. The worktree is now
  self-contained, and **L11 and every later task in this worktree use this directory** — which needs
  no action. It is the same lockfile, so the same versions. Only three folders differ: `@emnapi`,
  `@fortawesome` and `@oxc-project` exist only in main. They are stale leftovers there; Font Awesome
  left the project at DS7. `backend/.venv` is still the symlink.
- **The dependency: `@simplewebauthn/browser` pinned exactly at `13.3.0`** (the latest 13.x; 14.0.0
  exists, the plan says `^13`, the brief says exact). It is pure JS with no install scripts, and
  its v13 option shapes are what L8's server emits. Its four entry points bundle to **8.8 kB
  minified** on their own (esbuild, measured). `index-*.js` at this tree is **774.28 kB**, but
  L10/L11/L12 are in that number too, so the plan's ≈734 kB is not the baseline to subtract from.
  It is imported by `api/passkeys.api.ts` **only**.
- **`label` is sent as `""`, never `null`.** `PasskeyRegisterVerifyBody.label` is a plain `str`, and
  the first end-to-end run got a **422** for `null`. The unit test with the library mocked could not
  see it; the wire could.
- **One password field.** `LoginPage` and `SecuritySection` now render L5's
  `pages/auth/PasswordField.tsx`. Its two private copies are deleted, and so is
  `SecuritySection`'s own `MIN_PASSWORD_LENGTH` (it imports `pages/auth/password.ts`). The shared
  component gained a `placeholder` prop (login keeps "Your password"). The toggle is now **named
  after its field**: "Show current password" and "Show new password" in Settings, "Show password"
  where the label is "Password". Otherwise the Settings form had two buttons with one name.
- **The strip (`ui/shell/SecureAccountNotice.tsx`) is `warn`, as the plan says, and not
  information.** `DESIGN.md` §2's `warn` is "attention, but nothing failed", which is exactly an
  account still on the password it was *given*. P5's shell notice is the same family and the same
  placement: first in `<main>`, above the route, `card mb-3 … border-warn/40 bg-warn/10`. It is a
  `.card`, not an `.inset` (§3, Q-E), and light keeps the tone (measured `rgba(146,64,14,0.1)`
  light, `rgba(251,191,36,0.1)` blue). The words are "Secure your account — add a passkey." with a
  `KeyRound` glyph in `text-warn`. The one action is a **solid small `Link` "Add a passkey"** to
  `/settings?tab=account`, carrying `NAV_JUMP_STATE` like every Settings link. There is **no
  dismiss control** (Roli's answer 5); the strip stops when `hasPasskey`.
  - **Condition:** `status === "authed" && passwordMigrated && !hasPasskey && passkeysSupported()`,
    the plan's step 5. **Open for Roli:** changing the password (which clears `password_migrated`)
    also ends the strip, as L7's line "change it, or add a passkey" implies. If he wants it until a
    passkey *only*, drop `passwordMigrated` from the condition — but then every account, including
    ones that registered with a fresh password, would see it.
  - **Two additions to the plan:** the strip renders nothing **on Settings → Account itself**, where
    it would only point at the page it is on. And L7's local migrated line in the Password block
    also goes once a passkey exists, since its advice ("…or add a passkey") is done.
  - **It cannot move the top bar's title (Q13)**: it lives in the page column, not the bar.
    Measured title centre with and without the strip: **195.0 / 195.0** at 390. It is never on the
    auth screens, which render outside `AppShell`.
- **Measured** (`scripts/passkey_e2e.mjs`, four runs):
  - Strip at **390**: x=16, w=358, h=**66** (the words wrap to two lines beside the button); the
    tab strip moves **73 → 151, +78** (66 + the page column's 12 px flow margin).
  - Strip at **1280**: x=264, w=992, h=**58**; tab strip **72 → 142, +70**. Identical in both
    themes.
  - **Two notices stacked were not measurable**: headless Chromium reports
    `Notification.permission === "denied"` whatever is asked (§10), so P5's notice never renders
    here. It is the same card shape (≈58–66 px + 12), so two notices cost ≈ **+140 to +156 px** —
    arithmetic, not a measurement.
- **Settings → Passkeys** sits between Devices and Password:
  - **Rows:** each passkey is a `ListRow` with the label, `Added <date> · last used <date, time>`
    (or `· not used yet`), a `pill-default` "synced" when `backed_up`, and a ghost `Trash2` titled
    "Remove this passkey".
  - **The last way in** (`!hasPassword && rows === 1`): that button is **disabled**, its title is
    the server's own 409 sentence, and the same sentence is printed under the list (a tooltip does
    not exist on a phone).
  - **Removing:** a `ConfirmDialog` **with the red block** ("This passkey stops working for your
    account." / "You will have to log in again here and on every other device."), subtitle "Every
    device will be signed out, including this one.", verb **Remove passkey**. After the `DELETE` the
    app calls `auth.logout()`: its request meets the dead session, which it already treats as done,
    so the login screen shows **without** "Your session has ended" (that line is for an ending
    nobody asked for). Then `/login`.
  - **Adding:** an optional **Name** field (placeholder "Named after this device if left empty",
    max 60) and a solid full-width **Add a passkey** (`KeyRound`). Success: "Passkey added. Next
    time, log in with it — no name, no password." plus `refresh()` (L7's rule — not `setSession`).
  - **Silent and unsupported cases:** a closed sheet says nothing. `InvalidStateError`
    (`excludeCredentials`) says "This device already has a passkey for your account." A browser
    without WebAuthn gets "This browser cannot make passkeys." instead of the form, and the list
    stays (a passkey can still be removed from there).
  - **"Remove password"** is a muted full-width ghost button under the toggle, shown only when
    `hasPassword && hasPasskey`. Its `ConfirmDialog` has **no** red block: it is reversible by
    "Set a password" right there (§7), and the server ends no session for it. After it, the Password
    block reads "Password removed. You log in with your passkey now."
- **Login:** after the form comes a `divider`, then a full-width ghost **Use a passkey**
  (`Fingerprint`), shown only where `browserSupportsWebAuthn()`. That hides it on the phone over
  the LAN IP (not a secure context), where it could only fail. A closed sheet says nothing. A refusal
  is the server's one 401 sentence on the form's existing error line. A 429 has its own
  `RetryCountdown` under the button, so it never holds up "Log in".
- **Tests:**
  - `passkeys.test.tsx` has **13** (the library mocked at `@simplewebauthn/browser`, `apiFetch`
    stubbed by path): the options go to the library untouched and an empty label posts `""`; a
    closed sheet is `null` with no verify request; the login button is hidden when unsupported,
    sits after the form, signs in with nothing typed and goes on; a closed sheet on login is
    silent, a refusal is the server's line; adding asks `/me` again and a closed sheet is silent;
    the last-way-in button is disabled with the reason; removal warns, then logs out and lands on
    `/login`; "Remove password" appears only with a passkey; the unsupported browser gets the
    sentence and no form; the strip's conditions (shown with no dismiss control, gone with a
    passkey, gone with a changed password, gone where unsupported, gone on the account tab).
  - `securitySection.test.tsx` (L7's) needed a `MemoryRouter` and a `passkeys.api` mock, because the
    section now navigates. No assertion changed.
  - `npm run check` **932 tests in 96 files** (919/95 at `f14f269` + 13 in 1); `npm run build`
    green, 774.28 kB (the >500 kB hint as before).
- **End to end** (`scripts/passkey_e2e.mjs`; Playwright from `PLAYWRIGHT=…`; CDP virtual
  authenticator ctap2 / internal / resident / UV):
  - **Stack:** backend **8240**, vite **8260**, browsed as `http://localhost:8260` (a secure
    context). A `sqlite3 .backup` of the main checkout's `app.db` (opened `mode=ro`) and an empty
    uploads dir sat under a `mktemp -d` in the session scratchpad. **7 push subscriptions and 7
    preferences were deleted from the copy before the first boot.** The throwaway secrets named the
    copy and carried no VAPID key. First boot: `Auth migrated: 3 accounts…`, `Cups imported: 2`.
  - **Four runs, all green:** 390 blue as Berni (30 checks), 1280 light as Roli (29 — the
    title-centre check is mobile-only), 390 light as Flo (30), 1280 blue as Berni again (29; Berni's
    `password_origin` was set back to `migrated` **on the copy** between runs).
  - **Each run walks:** the login card offers "Use a passkey" after the form, with no overflow and
    `a a` = 0; the password login shows the strip; the strip's link opens Settings → Account, where
    it is not shown; **add a passkey** puts one resident credential in the authenticator and makes
    `/me` report `has_passkey`; **the strip is gone**; **log out** makes `/me` 401; **"Use a
    passkey" signs in as the same account with nothing typed**; **remove password** makes
    `has_password` false; **the last passkey's button is disabled** with the server's sentence, and
    a direct `DELETE` answers **409 with that same sentence**; **set a password**; **remove the
    passkey**, which warns "Every device will be signed out, including this one.", lands on
    `/g/altherren/login` with `/me` **401** and no "session ended" line.
  - **After removal,** the credential still in the authenticator gets "That passkey could not be
    used to log in", and the new password logs in.
  - Screenshots of the login card, the strip, the Passkeys section, the last-way-in state and the
    dialog were taken at 390 and 1280 in both themes and looked at. They stayed in the scratchpad.
  - The virtual authenticator reports no backup flags, so "synced" never showed there; the unit test
    covers it. Stack PIDs, vite's esbuild child included, were killed by number and both ports
    checked free.
- **What only Roli's iPhone can prove:**
  - that Safari on `https://lorbeerkranz.xyz` shows "Use a passkey" at all;
  - that Face ID sets the UV bit the server requires;
  - that iCloud Keychain syncs the credential and reports it backed up (the "synced" pill);
  - that a passkey made in Safari signs in from the **installed PWA**, and that the PWA's own cookie
    jar keeps the session `login/verify` sets;
  - that a closed Face ID sheet really arrives as `NotAllowedError` (silence) and not as something
    that prints a line;
  - and how the strip reads at his own width.

  None of this is reachable from here: the phone reaches dev over the plain-http LAN IP, which is
  not a secure context, so on that setup the button and the strip are both (correctly) hidden.

## L15 — Documentation pass B (passkeys; runs before deploy B)  ☑

> **Now the only documentation pass** (Roli, 2026-09-23: one deploy). It absorbs L14's entire section below as well as its own, and describes one deploy.

L8's and L9's Canon lines into `AGENTS.md` (§5, §6, §10, §11 — the deploy-B smoke and what only
the phone can prove), `DESIGN.md` §7, `README.md` (passkeys, "one way in"), and this file's
gates re-run on the final tree. After deploy B has been proven on the phone, a **later** batch
deletes `player_accounts[]` from `secrets.json`, `jwt_secret`, `PyJWT`, `/auth/exchange` and
`services/legacy_jwt.py` — L15 writes that as the first line of `AGENTS.md` §11's open list.

**Deviations.**
- **One pass for both halves.** L14's section (every Canon line of L0–L7 and L10–L13) and L15's
  own (L8, L9, L16) were applied together, and `AGENTS.md` §7 describes **one** deploy. Every
  "Canon" / "Canon for L15" block of L0–L13 and L16 is reflected; the ones placed somewhere other
  than the block said are listed below. Files: `AGENTS.md` (header, §1–§12; §1, §4, §6 and §7
  rewritten at their core), `DESIGN.md` (header, §5b, §7 — twelve new rows and two amended — §9b,
  §10, §11), `README.md` (features, dev, configuration, Caddy, deploy, smoke, authentication, API
  reference), `backend/secrets.json.example`, this file, and `schema.d.ts` (below).
- **Where a Canon block and the shipped code disagreed, the code is what the canon now says:**
  - L4's "`auth/` is three files" — it is **four** (`AuthContext.ts`, `AuthProvider.tsx`,
    `RequireAuth.tsx`, `RequireRole.tsx`); §2 lists them.
  - §3 of "Decided by this plan" lists `PUBLIC_PATHS` with six entries and `LOOPBACK_ONLY_PATHS`
    with four: the code has the same six public paths (L2 two, L3 two, L8 two) and **five**
    loopback paths (`/redoc` too — L2's audit needed it). `AGENTS.md` §6 quotes the tuples from
    `auth_gate.py`.
  - L1's step 1 named `argon2_cffi_bindings-25.1.0`; the wheel that resolves is **26.1.0** (L1's
    own Deviations). §7 step 5 names the real ones, and **`pyOpenSSL` is a pure wheel** — the two
    binary wheels to watch for are `argon2_cffi_bindings` and `cbor2`.
  - L11's step 6 said `/players/avatars` and `/headers` were "already filtered by `roster_for`" —
    they were not until L11 filtered them; §6 says they follow the roster, as shipped.
  - L12's expected Bauernkranz owner ("→ Roli") is stale; production's is **Rumpi** (L12, L13).
    The canon names the current owners only in `AGENTS.md` §10, which already says to read them
    from the API.
  - L9's strip: Roli's words were "until they have a passkey"; the shipped condition also ends it
    when the migrated password is changed. **Not decided here**: the condition is written in
    exactly one place, `DESIGN.md` §7's `SecureAccountNotice` row, and `AGENTS.md` §11 lists it as
    awaiting his answer, so a change is one line of code plus one line of canon.
  - The plan's deploy step 10 says to delete the throwaway registration "with `manage.py`": there is
    no such command (nor an endpoint). §7 step 10 now says **create a code and revoke it** instead,
    and that a stray registration is removed only by SQL.
  - The plan's deploy smoke `curl -sI …/api/tournaments` → 401 is true anonymously (the gate
    answers before routing, so even HEAD gets its 401), but §10 already bans HEAD for `/api`
    checks because a logged-in HEAD is a 405; §7 step 9 uses GETs throughout. `/api/health` is now
    **401 from outside** (Roli's answer 6), so `docker compose ps` → healthy is the health check.
- **Placed differently from the Canon block, on purpose:** L8's "`webauthn` pinned to 2.7.1 because
  of `cryptography<46`" went to `AGENTS.md` §9 (the dependency paragraph, beside the other three
  new dependencies) rather than §10; L13's rehearsal is §7 step 3 **after** the backup (it
  rehearses that fresh snapshot — L13's own correction to the plan's "before step 2"); L7's password
  editor is a short §9b bullet pointing at the §7 "My account" row, which carries the detail.
- **Added beyond the Canon blocks, each from the handoffs or from reading the code:**
  - §7: **deploy with `docker compose up -d --build backend frontend`** (and roll back the same way),
    so `caddy` — which since `ce55a53` fronts Roli's other sites — is never in the target set; a
    plain `up -d --build` leaves it alone too when its image and config are unchanged, but naming
    the services makes that a fact.
  - §7 step 9: every data-reading smoke check now needs a session, so the old anonymous lines
    (`/stats/records | jq`, `/ideas`, `?w=137` → 422) moved to "with a cookie jar".
  - §7 step 13: `set-password` prompts twice with no echo **without** `-T`; with `-T` it reads two
    stdin lines (L3), so the other four take `-T` and this one is run interactively.
  - §8: after the auth deploy, `sync-local-from-deploy` brings production's argon2 hashes, sessions
    and passkeys into dev — dev then logs in with production's passwords.
  - §11 closes one stale open item: "whether tapping an unread guestbook message should mark it
    read" was still listed as undecided although Q-F's §9 bullet records that Roli kept it on
    2026-09-23.
  - §11 opens one: **gated media still send `Cache-Control: public`** (`routers/players.py`,
    `comments.py`, `ideas.py`, `clubs.py` — the pinned copies `public, max-age=31536000,
    immutable`). Nothing caches between browser and backend today, so nothing leaks; `private` is
    what the gate now means. Found by reading the code for §5, not changed (no task owned it) —
    Roli's call.
- **`schema.d.ts` regenerated, comment-only.** `make gen-types` on the finished tree produced exactly
  the three hunks L8 predicted — L11's docstrings on `GET /players/avatars`, `GET /players/headers`
  and the guestbook-subject image (+9/−3, no type changed) — so it is committed here and a second
  run is byte-identical.
- **Verification-gate greps, on the final tree:** `decode_token|HTTPBearer|CORSMiddleware|
  ws_require_auth` in `backend/app` → **0**; `ea_fc_token|Bearer` in `frontend/src` outside tests →
  four lines, **every one the exchange itself** (`LEGACY_TOKEN_KEY`, its comment, `auth.api.ts`'s
  bearer header to `/auth/exchange`, and the endpoint's generated description); `"/g/` outside tests
  → `app/basename.ts` only; `role="button"` in `frontend/src` code → **0** (three comments, each
  saying not to). `grep -n reader README.md DESIGN.md AGENTS.md`: every remaining hit is the word
  for a person reading (`the reader's own offset`, `a reader arriving here`) or a historical record
  (G4's "logged-out reader", L4's "went with the reader"); the role is gone everywhere it described
  the app. The browser checks (`a a` = 0 on `/login`, `/admin`, a live tournament, a profile;
  `[role="button"]` = 0 on a live tournament) were measured by L4, L6 and L11 and **not re-run here**
  — L15 changed no code.
- **Not re-run here:** the rehearsal (L13 ran it twice on this tree's code, `3801260`, and nothing
  under `backend/` or `frontend/src` changed since except `schema.d.ts` comments), and the two
  gate-audit sabotages (L2 proved both bite; L3 and L8 re-walked the audit with their routes).
- **Gates, measured on the final tree:** `make test` **504 passed** in 27:05 on the Pi (sharing it with `npm run check` for three minutes; L16 read the same 504 in 27:36); `make lint` clean; `make gen-types`
  no diff after the comment-only commit; `cd frontend && npm run check` **932 tests in 96 files**
  (vitest 106 s, 3:10 all in, sharing the Pi with `make test`); `npm run build` green, `index-*.js`
  **774.28 kB** (the >500 kB hint as always), `AdminPage-*.js` 12.60 kB.

---

## Verification gates (after all tasks)

Run on the final tree of each half and written into `AGENTS.md` §11 by L14 (deploy A) and L15
(deploy B). **One deploy, so one run — L15's, on the branch head; the numbers are in L15's
Deviations and `AGENTS.md` §11.**

- ☑ `make test` green (504 passed, 27:05) — expected ≈ 303 + ≈130 new (L1 18, L2 ≈35, L3 ≈50, L10 3, L11 2,
  L12 ≈10, L8 ≈25); the runtime against 11–15 min (the gate adds one lookup per call; argon2 in
  tests is ≈1 ms).
- ☑ `make lint` clean.
- ☑ `make gen-types` **no diff** at the head (after L15's comment-only regeneration).
- ☑ `cd frontend && npm run check` green (932 in 96) — expected ≈ 839 + ≈55; `npm run build` green (774.28 kB), the
  `index-*.js` size written down (≈734 kB at the badges head; `@simplewebauthn/browser` adds a
  few kB after L9).
- ☑ `tests/test_auth_gate.py::test_every_route_is_gated_or_listed` green (in the full run), and the two
  deliberate sabotages of L2's DoD re-tried once on the final tree — **not re-tried by L15** (no code
  changed after L16; L2 proved both bite, L3 and L8 re-walked the audit).
- ☑ `grep -rn "decode_token\|HTTPBearer\|CORSMiddleware\|ws_require_auth" backend/app` → 0;
  `grep -rn "ea_fc_token\|Bearer" frontend/src | grep -v test/ | grep -v exchange` → 0 — **4 lines
  on the final tree, every one the exchange itself** (the `-v exchange` filter is per line; L15's
  Deviations list them).
- ☑ `grep -rn '"/g/' frontend/src | grep -v test/` → `app/basename.ts` only.
- ☑ `document.querySelectorAll("a a").length` = 0 on `/login`, `/admin`, a live tournament, a
  profile; `querySelectorAll('[role="button"]').length` = 0 on a live tournament — measured by L4, L6
  and L11, not re-run by L15.
- ☑ The rollback drills of L1 and L13 written down, with the snapshot timestamp (`AGENTS.md` §5, §7).
- **Not a gate, not provable here:** push over the wire; Face ID / iCloud Keychain / the
  home-screen app's cookie jar; whether a tapped notification opens the installed PWA rather
  than Safari. All three are the phone's, after each deploy.

## Deployment (later, on Roli's go) — two deploys, one escape hatch

> **Superseded by `AGENTS.md` §7** (L15): one deploy, the rehearsal after the fresh backup, the
> preflight's `RESULT: OK`, the exact first-boot log, `ce55a53` as the rollback target and
> `docker compose up -d --build backend frontend` so Caddy is never recreated. The text below is
> the plan as written, kept as the record.

Backend, schema and two dependencies change → the **full** deploy, both times.

### Deploy A — the gate (merge `main` at L14's commit, not the branch head)

**Before, on the dev machine:**
1. Gates green at L14's commit; `make gen-types` no diff; `git merge --no-ff <L14 sha>` into
   `main`; push.
2. `python3 backend/manage.py backup-deploy-data` — the way back for data.
3. **The rehearsal (L13) has been run against the latest snapshot** and its report read: zero
   unmatched names, zero collisions.

**On the server, in this order:**
4. `ssh hetzner && cd ~/projects/Lorbeer-Turnierplaner && git pull` — **do not `up` yet**.
5. `docker compose build backend frontend` (the new wheels resolve here; a failure here costs
   nothing — the old containers are still running).
6. `docker compose run --rm --no-deps backend python manage.py auth-preflight --secrets
   /app/secrets.json --db-url sqlite:////data/app.db` — read the report. It must end
   `RESULT: OK` with **no `PROBLEM:` line** (that is how an unmatched name or a case collision is
   printed — L13: the report has no literal `unmatched_names: []` / `case_collisions: []` lines),
   and read `accounts with a password:   6  (Roli, Flo, Rumpi, Berni, Atzi, Mike)`,
   `owners (site admins): 1 (Roli)`, `group_id backfill: tournament=N, friendlymatch=M,
   featurerequest=K` (the 2026-09-20 snapshot: 17 / 23 / 1). **A non-zero
   exit here means stop**: nothing has changed yet.
7. `docker compose up -d --build`. `docker compose logs -f backend` → expect, in order:
   `Cup defs validated` · `Auth migrated: N accounts, 1 group, M memberships` ·
   `Cups imported: 2` · `DB initialized`. A boot that stops with `AuthConfigError: …` names the
   setting; the settings it can name are `APP_ENV`, `TRUSTED_PROXY_HOPS`, `AUTH_ORIGIN`,
   `AUTH_DEV_ORIGIN`, `PASSWORD_HASH_PROFILE` — all in `docker-compose.yml`, none in
   `secrets.json`.
8. `docker compose ps` → backend **healthy** (the loopback carve-out; if it flaps to unhealthy,
   `/health` is being refused — `docker compose logs backend | grep health` — and the fix is in
   `auth_gate.is_loopback`, the rollback is step 12).
9. Smoke, from the dev machine: `curl -sI https://lorbeerkranz.xyz/api/tournaments | head -1` →
   **401**; `curl -s https://lorbeerkranz.xyz/api/auth/login -H 'Content-Type: application/json'
   -d '{"username":"x","password":"y"}' -i | grep -i "^HTTP\|retry"` → 401 (and, after ten of
   them, 429 with `Retry-After`); `curl -sI https://lorbeerkranz.xyz/` → 200 (the shell).
10. **The phone**: open the installed PWA. It holds the old JWT → the exchange → the dashboard,
    **without** a login screen (that is the "nobody is logged out" check). Settings → Account →
    Devices shows this phone. Settings → Notifications → Send test → it arrives → tap it → **does
    it open the installed app or Safari?** — write the answer into `AGENTS.md` §11. Log in on a
    laptop with the old password → `/g/altherren/admin` → Roli has two devices → revoke the
    laptop → the laptop's next click lands on `/login`. Create a code, register a throwaway
    account from the laptop, delete it afterwards with `manage.py` (no delete-account endpoint
    exists — L14 lists that under Deferred).
11. A link tapped in WhatsApp opens **Safari**, not the PWA, and Safari has its own cookie jar:
    the first such tap shows the login screen once — expected, say so in `README.md`.

**If login is broken (the escape hatch, in the order to try it):**
12. `git checkout ce55a53 && docker compose up -d --build` — restores the JWT login **instantly**
    (**`ce55a53`, never `cfc1669`**: production runs `ce55a53`, whose `deploy/Caddyfile` imports
    `/etc/caddy/sites/*.caddy` for Roli's other apps; `cfc1669` would take them down. The checkout
    leaves the server on a detached HEAD — `git checkout main` before the next `git pull`.
    Rehearsed by L13 against the production snapshot):
    `secrets.json` still holds `player_accounts[]` and `jwt_secret`, old code ignores every new
    table and column (measured in L1 and L13), and the tokens still in every phone's
    `localStorage` are valid. This is the reason `secrets.json` is not edited by this deploy.
13. If the new code should stay up but *one* login is wrong: `docker compose exec backend python
    manage.py reset-link --player Roli` → open the link on the phone → set a password. Or
    `manage.py set-password --player Roli`. Or `manage.py make-admin --player Roli` if the site
    admin flag did not migrate (a name mismatch the preflight would have shown).
14. If the data is wrong: rsync `backup/deploy/<ts>/data/` back (§8 of `AGENTS.md`), restart the
    backend.
15. `secrets.json`'s `player_accounts[]` is **left in place** until deploy B has been proven; only
    then does a later batch delete it (with `jwt_secret`, `PyJWT` and the exchange).

### Deploy B — passkeys (merge the branch head, a week later)

1. Gates at L15's commit; merge; push; `backup-deploy-data`.
2. `git pull && docker compose build backend` (two more wheels: `webauthn`, `pyOpenSSL`) →
   `up -d --build`. Expect no new log line.
3. Smoke: `curl -s -X POST https://lorbeerkranz.xyz/api/auth/passkeys/login/options` → 200 with
   a `challenge` and **no** `allowCredentials`.
4. **The phone**: Settings → Account → Passkeys → Add a passkey → Face ID → the row appears with
   "synced" (iCloud Keychain). Log out → "Use a passkey" → Face ID → in. The strip "Secure your
   account" is gone. Remove the passkey → signed out everywhere → log in with the password.
   **This is the first WebAuthn ceremony this code has ever run outside Chromium**; `AGENTS.md`
   §11 records the answer either way.
5. Rollback: `git checkout <L14 sha> && up -d --build` — the passkey rows are inert to it.

## Rollback safety, measured (the technique, so nobody asserts it)

```bash
OLD=$(mktemp -d) && git archive ce55a53 | tar -x -C "$OLD"   # L13: ce55a53, what production runs
cp <a db the new code has booted> "$WORK/rb.db"
cd "$OLD/backend" && ../../../backend/.venv/bin/python run.py --port 82xx --secrets "$WORK/secrets.json" --db-url "sqlite:///$WORK/rb.db"
# → boots; POST /auth/login (JWT) 200; GET /tournaments 200; POST /tournaments 200
# then boot the NEW code on rb.db → the backfill logs the row the old code wrote
```
L1 does it against the dev DB, L13 against the production snapshot; both write the numbers down.

## Deferred — explicitly NOT here

- Deleting `player_accounts[]`, `jwt_secret`, `PyJWT`, `/auth/exchange`, `services/legacy_jwt.py`
  — after deploy B is proven (L15 writes it as the first open item).
- Session-token rotation under a stable id (racer's design and its bug) — disagreement 5.
- Email: recovery by email, invite by email. Nothing here makes it harder: `Account` has no
  email column *on purpose* (adding one is a `_RUNTIME_COLUMNS` line), reset tokens are already
  long and single-use, and `nodemailer`'s Python cousin is one dependency away.
- Recovery codes — declined.
- Deleting an account / a player (the admin page has no destructive action; `manage.py` has none
  either — a stray registration is removed by SQL for now, and part 2 should give the admin page
  a real delete behind the red `ConfirmDialog`).
- `group_id` on `RecordHolder` / `RecordKeyState` (a cache; part 2 recreates them per group).
- Part 2 itself: reads filtered by group, the group in the API path, a group switcher, cups UI,
  which admin routes become owner routes, a no-group account's basename.
- `Secure` derived from `X-Forwarded-Proto` (the request-sniffing variant) — disagreement 3.
- A session's IP shown in the admin sheet — the column exists; showing it is a privacy call.

## What this plan could not verify (and why)

- **No check was run** (read-only session); the test counts are `grep` counts.
- **Argon2 timing on the Pi and in the x86 image** — L1 measures; the plan's expectation
  (100–300 ms) is the library's published order of magnitude, not a measurement.
- **The gate's per-request cost** — L2 measures; one indexed SQLite read plus a rare write.
- **Whether Caddy replaces or appends `X-Forwarded-For`** for an untrusted client (Caddy ≥2.5
  strips untrusted forwarded headers; racer's DECISIONS say it appends). Counting from the
  **right** with `hops=1` is correct in **both** cases, which is why the plan does not depend on
  the answer.
- **Push over the wire, the installed PWA opening from a notification, Face ID, iCloud Keychain,
  the home-screen cookie jar** — the phone's, after each deploy.
- **`pyOpenSSL==25.1.0` admitting `cryptography 45.0.7`** — read from PyPI metadata on
  2026-09-23; L8's `pip install` is the proof.

## Decisions still needed from Roli

None block L0–L2. **Item 1 decides how the branch is merged; items 2–4 are one-line answers a
worker will otherwise take the default on.**

1. **Two deploys or one?** The plan orders passkeys last so `main` can take L14's commit first
   (disagreement 1). Default: **two**.
2. **Eager Argon2 at migration** (disagreement 2). Default: **eager**.
3. **The group's display name.** The slug is `altherren`; the plan seeds `name="Altherren"`.
   One word from you, before L1.
4. **The "secure your account" strip is not dismissible** (the decision as given). If a week of
   it on Roli's own phone before he adds a passkey turns out to be too much, L9 can make it
   dismissible per install in one line — say so then, not now.
5. **`/api/health` from the outside is 401** and `AGENTS.md` §7's smoke line changes
   (disagreement 6). Default: accepted.
