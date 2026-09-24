# Features 2026-09 — Auth, second half: passkey-preferred credentials, and email (verification + self-service recovery)

> Branch `feature/2026-09-auth`, worked **only** in the git worktree `/home/roli/projects/turnierplaner-auth`
> (baseline **`f0dab7d`**, Q-G). Written 2026-09-24 in a read-only planning session — **no check
> was run**; every number here is either `AGENTS.md` §11's (measured by L15 at the branch head:
> `make test` **504 passed**, `npm run check` **932 tests in 96 files**, `index-*.js` 774.28 kB) or a
> `grep` (Q-G added 3 backend tests in `tests/test_media_cache_private.py`, so the backend baseline
> to re-read at E0 is **≈507**; `ls backend/tests/test_*.py` → 55 files).
> **It ships in the same single deploy as the first half** (`FEATURES_2026-09-auth.md`, L0–L16,
> finished, unmerged, undeployed). Nothing here is a second deploy; `AGENTS.md` §7's auth deploy
> gains steps, it does not gain a sibling.
> Read first: `AGENTS.md` (§4, §5, §6, §7, §9, **§10's incident bullets** — the push subscriptions in
> a DB copy, the dispatcher lock — and §11), `DESIGN.md` (§5b, §7's auth rows, §9b), then
> `FEATURES_2026-09-auth.md` end to end — **the code wins where that plan and the code disagree**,
> and every task's Deviations there is part of the spec here. Then this file.
> Symbol names are the source of truth; line numbers reference `f0dab7d`.
>
> Task IDs **`E0`–`E6`**. `A C D DS F G K L M N P Q R S T U W` are taken
> (`grep -rhoE '^## [A-Z]+[0-9]+' *.md` at `f0dab7d`); `E` is free.
> **Model:** Opus by default; **Fable for E2 only** (the reasons are in the overview table).
> **At most two workers at once** (the Pi had 1.46 GB free / 4.1 GB available with Roli's dev
> servers running on 2026-09-24), and **the only parallel pair is E3 ∥ E4** — the two tasks that
> regenerate `schema.d.ts` (E1, E2) each run alone.

## Roli's answers, 2026-09-24 — these supersede anything below that disagrees

1. **The sender is `no-reply@lorbeerkranz.xyz`** (with the hyphen) — an alias of the Private Email
   mailbox racer already logs in with. `SMTP_USER` is that mailbox; `SMTP_FROM` is the alias.
2. **DMARC without a report address**: publish `v=DMARC1; p=none` at `_dmarc.lorbeerkranz.xyz`.
   No `rua=`. Roli publishes it himself in Namecheap; it does not block implementation, only the
   deploy-day deliverability gate.
3. **The defaults in "Needed from Roli" are accepted**: the admin chip "Migrated password" becomes
   "Not secured"; recovery by email keeps existing passkeys; the old address gets a link-free
   "your email changed" notice; force-verifying an email stays a `manage.py` command, not an admin
   button.

---

## Why this half exists

The first half closed the app, moved the login into a revocable cookie session, added passkeys
and invite codes, and left two things half-built by Roli's own account: a passkey is an option
after the password rather than the thing you are handed first, and the only way back into an
account is Roli minting a link and sending it over WhatsApp. This half makes the passkey the
primary credential everywhere a credential is chosen, gives an account a verified email address,
and lets that address open a one-hour link that sets a new passkey or password — so the "secure
your account" strip can finally mean *both* halves of secure: a way in that is not the password
`secrets.json` gave you, and a way back in that does not need Roli.

Four facts about the shipped code shape the plan:

1. **The one-hour, single-use, hashed token already exists** (`PasswordResetToken`,
   `services/reset_links.py`, `POST /auth/reset`, `pages/auth/ResetPage.tsx`). Recovery by email
   mints **the same row** with `created_by = NULL` (the CLI's shape) and the same URL
   `{origin}/g/altherren/reset#<token>`; the page grows a passkey half and is renamed in words,
   not in route. One token, one consumer (`consume_reset`), one page — the admin link, the CLI
   link and the emailed link are three ways of delivering one thing.
2. **A registration ceremony needs the user handle before the account exists.**
   `registration_options` puts `Account.webauthn_user_handle` into `user.id`, the authenticator
   stores it, and `verify_authentication` later checks the assertion's `userHandle` against the
   account's. A passkey-only registration therefore has to remember the handle it minted between
   `options` and `verify` — that is the one new table the passkey half needs
   (`RegistrationIntent`), and it is why the account can be created *atomically* in the verify
   step: nothing about the person exists until the ceremony has verified.
3. **`smtplib` and `email` are in the standard library** (`/usr/lib/python3.11/smtplib.py` on the
   Pi, Python 3.11.2; `python:3.11-slim` in production). **No new dependency**: an SMTP submission
   over implicit TLS on 465 (or STARTTLS elsewhere) with authentication and a timeout is
   `smtplib.SMTP_SSL` + `ssl.create_default_context()` + `email.message.EmailMessage`, all
   stdlib. Racer needed `nodemailer` because Node has no SMTP client; Python does.
4. **The push dispatcher's lesson (L16) is the mail sender's rule from day one**: no database
   transaction is ever open across a network call. Every token row is committed *before* a send,
   the send runs in the threadpool (`run_in_threadpool`), and what a background send needs is
   copied into the message beforehand — never the session.

## Decided by Roli (2026-09-24 — do not relitigate)

**Passkey preferred.**
- Wherever a credential is chosen — **register** (invite code), the **reset link**, **Settings →
  Account** — "Create a passkey" is the primary action and "Use a password instead" the secondary.
  Where WebAuthn is unavailable (his phone on dev over plain-HTTP LAN is not a secure context; an
  old browser), only the password path shows.
- **Register with a passkey and no password must be atomic**: an account must never exist without
  a way in, so a failed or cancelled Face ID must not leave a passwordless, passkeyless account
  (L8's "always keep one way in").
- **The admin reset link can set a passkey or a password** (his original ask was a "reset password
  / create passkey" link; only the password half was built).
- **Any newly set password: minimum 15 characters** (today 10), enforced server-side and mirrored
  in `pages/auth/password.ts` / `PasswordField`. **Existing passwords keep working at any length**
  — the six migrated ones are 9 characters — so **login never checks length**, and nothing may lock
  them out.
- **Two hints**: on the login screen, one line saying a passkey on your phone can be used from a
  computer by choosing it and scanning the code (WebAuthn's cross-device flow — **no server change,
  confirmed**: `authentication_options` already sends no `allowCredentials`, so the browser's own
  passkey prompt offers "use a phone"); and in Settings beside the passkeys, one line: logging in
  elsewhere → scan the code from that device, or add a password.

**Email.**
- **Provider: Namecheap Private Email over SMTP** — racer's setup: host `smtp.privateemail.com`
  (what racer's server `.env` uses and what works there; Namecheap's documentation names
  `mail.privateemail.com` first and `smtp.privateemail.com` as the alternative — both are theirs,
  both resolve, either is fine), port 465 (implicit TLS), sending as **`no-reply@lorbeerkranz.xyz`**.
  A login mailbox and a different sender are both supported (`smtp_user` vs `smtp_from`), since
  `no-reply@` may be an alias. Credentials live in `secrets.json` / env like every other secret —
  **agents never read `secrets.json`**.
- **Emails are English only.**
- **A verified email enables self-service recovery**: "Lost your passkey or password?" on the login
  screen sends a one-hour, single-use link to the verified address, where the person sets a new
  passkey or password. The admin reset link keeps working alongside it.
- **The "secure your account" strip goes away only when BOTH are true: a verified email, AND a
  secure login (a passkey, or a password newly set on this code with ≥15 characters).** The strip
  says which step is still missing. (As built it shows for "migrated password and no passkey";
  this replaces it — and closes the open question `AGENTS.md` §11 lists about its condition.)
- Existing accounts are asked for an email through that strip after login.

## Facts measured on 2026-09-24 (this session, read-only)

- **Public DNS for `lorbeerkranz.xyz` is not what the brief says.** Measured with `dig +short`
  against `1.1.1.1`, `8.8.8.8` **and** the authoritative `dns1.registrar-servers.com` (identical
  answers; TTL 1800):
  - `TXT lorbeerkranz.xyz` → `"v=spf1 include:spf.privateemail.com ~all"` — **SPF is published.**
  - `MX lorbeerkranz.xyz` → `10 mx1.privateemail.com.`, `10 mx2.privateemail.com.` — **MX is
    published.**
  - `TXT privateemail._domainkey.lorbeerkranz.xyz` → `"v=DKIM1;k=rsa;p=MIIBIjAN…"` — **DKIM is
    published**, at the host name Namecheap uses for Private Email subscriptions bought on or
    after 2026-06-02 (their knowledgebase: `privateemail._domainkey`; older subscriptions use
    `default._domainkey`, which is empty here).
  - `TXT _dmarc.lorbeerkranz.xyz` → nothing. **DMARC is the one missing record.**
  - `spf.privateemail.com` itself expands to `include:ips1.privateemail.com
    include:fbrelay.privateemail.com include:spf.jellyfish.systems ~all`, and `smtp.privateemail.com`
    resolves (66.29.159.53; `mail.privateemail.com` 198.54.122.135).
  The brief's "no SPF, no DKIM, no DMARC, no MX" was most likely a shell trap, not a DNS fact: in
  **zsh**, `dig @1.1.1.1 +short $q` with `q="TXT lorbeerkranz.xyz"` does **not** word-split `$q`
  (no `SH_WORD_SPLIT`), so dig is asked for a single nonsense name and answers nothing — this
  session fell into exactly that trap on its first attempt and got empty answers for every record,
  including the A record of the live site. Spell dig's arguments literally. The checklist below is
  written for what the DNS actually holds; the **deliverability gate** (a real message to Gmail with
  `spf=pass` and `dkim=pass` in its headers) is what proves the records work, whoever published them.
- **Ports.** `ss -ltn` listens on 22 2019 8000 8001 8010 8020 8080 8093 8172 8182 8443 8444 8787
  8790 (+ three ephemeral). Every plan file's 82xx numbers stop at **8267** (Q-G). This plan takes
  **8271–8279 (backend) / 8281–8289 (vite)**; nothing listens there.
- **The Pi**: 8 GB, 1.46 GB free / 4.1 GB available with Roli's dev servers up — two workers, not three.
- **The stdlib has it all**: `smtplib`, `email.message`, `ssl` import from the backend venv;
  `aiosmtpd` is *not* installed and is not needed (the capture transport and the file sink replace
  a local SMTP server). `certifi` 2026.01.04 is present as httpx's dependency.
- **The backend image is `python:3.11-slim`** (Debian bookworm). The official slim image installs
  `ca-certificates`, so `ssl.create_default_context()` verifies `smtp.privateemail.com`'s
  certificate against the system store; unlike httpx (which bundles certifi), `smtplib` reads the
  system store. Not measured inside the image here — the deliverability gate is where it is seen,
  and the fallback is decided in advance (E0, "if the gate fails with `CERTIFICATE_VERIFY_FAILED`").
- **Racer's decisions that transfer** (`/home/roli/projects/racer`: `server/auth/mail.ts`,
  `deploy/hetzner/.env.example`, `server/README.md` "Email recovery", `DECISIONS.md` WP30):
  config-gated with "unconfigured" as a first-class visible state; **all five or none** — a
  half-configured transport is refused, never limped along; the transport is built on first use
  so a server whose SMTP host is down still boots; **no message body ever reaches a log**;
  failures log the recipient and the SMTP error; a capture transport for tests that is **never
  selectable by an environment variable**; "email me a code" answers identically for a known and
  an unknown address and sends nothing for the unknown; recovery is a fallback and the weakest
  link, so it is rate-limited hardest (5 / h / IP on requests) and a successful recovery
  immediately asks for a new credential; secrets travel in the URL **fragment**; the email is
  normalised `trim().toLowerCase()`. What does **not** transfer: nodemailer (Python has smtplib),
  the 8-digit scrypt-hashed *code* (this app already has a 32-byte *link* token whose sha256 is
  ungrindable, so the link is kept and no second secret shape is added), and racer's "there is
  already an account with that email" exception (see decision 3 below for this app's rule).

## Where this plan disagrees with the brief, and what it does about it

Roli asked to hear it now. One line from him reverses any of these before the task that owns it.

1. **The DNS checklist is one record, not four.** SPF, MX and DKIM are published (measured above);
   only DMARC is missing. The plan does not tell Roli to publish an SPF record that would collide
   with the one that exists (two SPF records is a permanent `permerror`), and it does not ask him
   to "enable DKIM" — it asks him to **check the panel's DKIM toggle is on for the mailbox** and to
   publish DMARC. The gate, not the checklist, is the proof.
2. **The strip's email step exists only while the server can send.** Roli's rule is "BOTH a verified
   email AND a secure login", and taken literally it makes the strip impossible to clear on a server
   with no SMTP configured, or one whose mail lands in spam. So the condition reads the server's own
   answer (`MeOut.email_available`): while email is off, the strip asks for the login half alone;
   the moment the five keys land in `secrets.json`, it starts asking for the email too. Three more
   things keep it clearable when mail is configured but misbehaving: the Email section says "check
   your spam folder" and offers **Send again**; `manage.py verify-email --player X --email Y` marks
   an address verified by hand (the DNS-is-broken escape hatch, the same trust as a reset link,
   which the CLI already mints); and removing the five keys plus a restart turns the step off again.
3. **Uniqueness of an address is enforced at entry for a logged-in member, and the answer says so
   (409).** The brief asks what happens when "an unverified email is later verified by someone
   else": with the entry-time check it cannot happen — an address that is verified on one account,
   or pending (an unused, unexpired verification token) on one account, is refused on any other
   with *"That email address is used by another account"*. That sentence is an oracle only to a
   member with a session, i.e. one of six friends, which is the exception racer already makes for
   someone who "holds the secret that had to be secret". The **public** endpoint (`/auth/recover`)
   answers identically for every address and is where enumeration is actually closed. A pending
   claim on someone else's address (Berni typing Flo's) dies with its token after 24 hours, and the
   admin page shows `email pending` so Roli can see it meanwhile.
4. **Recovery uses the existing reset token, and a fresh recovery request kills an earlier unused
   admin link for the same account** — `create_reset` already deletes a player's older unused
   tokens ("the newest link is the only one that works"). This is kept: it is what makes a link
   sent to the wrong chat harmless, and the cost — an attacker who knows a verified address can
   void a WhatsApp link Roli sent seconds earlier, three times an hour — is a nuisance bounded by
   the per-address limit, not a takeover. Written down rather than designed around with a second
   token table (which would have meant two consumers behind one page).
5. **Recovery ends every other session and keeps every passkey.** The brief asks "what recovery
   ends (every session?)": yes — `consume_reset` + `revoke_all_sessions` already do, and a person
   who lost a device wants exactly that. Passkeys are **not** removed: the lost device still needs
   Face ID to use its passkey, the Settings list shows it with its "last used" so it can be removed
   deliberately, and an automatic removal would delete a credential on a device the person merely
   left at home.
6. **The old address is told when the email changes or is removed — with no link in it.** A notice
   with a link would be a second recovery surface pointing at the address that just lost the
   account. It says what happened and "tell the admin if this was not you", and nothing else.
7. **The passkey-only registration remembers the invite and the name on the server, not in the
   client.** The `options` call validates the code and the name and mints a `RegistrationIntent`
   (invite id, display name, user handle) beside the challenge; the `verify` call sends only the
   credential. A client that could re-send `display_name` on verify could register a name that was
   never checked against the one the handle was minted for.
8. **`mail-test` takes its credentials on the command line so the gate runs before the app is
   configured.** The brief's order ("configure email, then check DNS") would let the strip ask six
   people for their address while mail still lands in spam. The gate is run with `--host --user
   --from` and a prompted password, from inside the production container, *before* the five keys go
   into `secrets.json`; the app stays "email off" until the headers say `pass`.
9. **`login_secure` is `has_passkey or password_origin == "set"`, with no stored length.** "A
   password newly set on this code with ≥15 characters" cannot be told from one set at 10 by
   looking at an argon2 hash, and storing a password's length is a leak of the wrong kind. But
   nothing of L0–L16 is deployed: the 15-character floor ships in the **same deploy** as the first
   `set` password production will ever hold, so on production `password_origin == "set"` implies
   ≥15 by construction. A test pins the floor at 15 on every path that sets one (register, reset,
   change, `manage.py set-password`), which is what keeps the implication true.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code
   style (thin routers, bodies in `services/`, error helpers from `api_utils.py`; Tailwind +
   design tokens, `qk`, generated API types, lucide-react with an explicit `size`).
2. Work **only** in the worktree `/home/roli/projects/turnierplaner-auth`, on branch
   `feature/2026-09-auth`. **Never switch branches, never touch `main`, never push, never touch the
   main checkout at `/home/roli/projects/turnierplaner-reloaded`** (Roli's dev servers on 8000/8001
   serve it to his phone). The worktree's `frontend/node_modules` is a real directory (L9);
   `backend/.venv` is a symlink into the main checkout — nothing here installs anything, because
   nothing here adds a dependency.
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never `git commit -a`.
   A new file: `git add --intent-to-add <path>` first, then `commit -o`. Message prefixed with the
   task ID (`feat(E1): …`, `test(E2): …`, `docs(E6): …`). Each task lists its file set; if you need
   a file outside it, stop and report. `AGENTS.md`, `DESIGN.md`, `README.md` and
   `backend/secrets.json.example` are edited by **E6 only**: write the canon line your task changes
   under "Canon" in your section.
4. **Verify first.** Every task names the check that proves the gap still exists. Run it before
   changing anything; if the gap is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing. Backend touched → `make test` + `make lint`.
   **Response model touched → `make gen-types`, and `frontend/src/api/generated/schema.d.ts` goes
   in the same commit** (E1 and E2, each alone; **nobody in the E3 ∥ E4 pair touches a response
   model**). Frontend touched → `cd frontend && npm run check` (+ `npm run build` where the task
   says). Baselines: `AGENTS.md` §11 (504 / 932) plus Q-G's 3.
6. UI must work at ~390px and ≥1024px, verified in a real browser (Playwright: `PLAYWRIGHT=` the
   racer checkout's `playwright-core`, as every L-task did) against the isolated stack below, in
   **both** the `blue` and the `light` theme. Measure, do not eyeball.
7. Never read or print `backend/secrets.json`. Never run destructive commands on `backend/app.db`,
   `backend/data/app.db` or `backend/data/uploads` — copy first, **outside the repo**. Never write
   into `backup/`. **Never bind 8000 / 8001 / 8010 / 5173.** Kill only the PIDs you started, by
   exact PID; never a pattern-matching `pkill`.
8. **No real email leaves any dev, test or verification stack, and nothing here ever connects to
   `smtp.privateemail.com` or `mail.privateemail.com`.** The push incident (`AGENTS.md` §10: a
   worker's stack pushed to real devices) is the lesson. Concretely: a throwaway secrets file
   **never** carries `smtp_*` keys; every stack sets `MAIL_SINK_DIR` to a directory in its work dir
   (the file sink — E0 — writes each message as a file and delivers nowhere); the boot guard
   **refuses** SMTP credentials on a non-production server unless `MAIL_DEV_SMTP=1` is set, and no
   worker sets it; tests use the in-memory capture transport, which no setting can select. If you
   ever see `Mail: SMTP via …` in a stack's boot log, stop: that stack is misconfigured.
9. **The push rules of the first half still apply to every stack**: `DELETE FROM pushsubscription;
   DELETE FROM pushsubscriptionpreference;` on the copy before the first boot, never a VAPID key in a
   throwaway secrets file, the DB copy named *inside* the secrets file, a private vite `cacheDir`,
   and a backend restart to empty the rate-limit buckets when a run hits one.
10. **One mechanism per job — reuse before you create.** A second token table, a second "set a new
    credential" page, a second answer to "can this server send mail", a second place that spells
    the strip's condition is a failed task even when green. What this half depends on:

    | job | the one implementation | who builds it |
    |---|---|---|
    | the three tables | `app/models.py`: `AccountEmail`, `EmailVerification`, `RegistrationIntent` | E0 |
    | the mail settings and "is this server allowed to send" | `app/settings.py` (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`, `mail_sink_dir`, `mail_dev_smtp`) + the four rules added to `assert_auth_config_safe` | E0 |
    | sending one message, or refusing to | `app/services/mail.py`: `MailTransport` (`smtp` \| `file` \| `capture` \| `off`), `mail_transport_for(settings)`, `build_message`, `send_off_loop`; the transport lives on `app.state.mail` | E0 |
    | the words in an email | `app/services/mail_texts.py` — four builders, English, plain text | E1 |
    | a password's floor | `services/passwords.py::MIN_PASSWORD_LENGTH = 15`, mirrored once in `frontend/src/pages/auth/password.ts` | E0 |
    | an account's email: set, verify, remove, status | `app/services/account_email.py` | E1 |
    | a one-hour "set a new credential" token — mint, find, consume | `services/reset_links.py` (existing; recovery mints through it, `created_by=None`); `link_origin` moves here from `routers/admin.py` | E2 |
    | the page that consumes it | `pages/auth/ResetPage.tsx` at `/reset` — the admin link, the CLI link and the emailed link all point there | E3 |
    | choosing a credential (passkey first, password second) | `pages/auth/PasskeyOrPassword.tsx` — used by the register page and the reset page | E3 |
    | a passkey ceremony bound to a token or an invite, server side | `services/passkeys.py`: `new_registration_options`, `take_registration_intent`, the split `_verified_registration` / `_store_passkey`; `services/accounts.py::register_with_passkey` | E2 |
    | the ceremony in the browser | `api/passkeys.api.ts` — still the **only** importer of `@simplewebauthn/browser` — gains `registerPasskeyForNewAccount`, `registerPasskeyWithResetToken` | E3 |
    | "can this account be recovered, and what is still missing" | `MeOut.email`, `email_pending`, `email_verified`, `email_available`, `login_secure`, built by `services/sessions.py::me_payload` — the strip, the Email section and the admin subtitle all read these and **never re-derive** them | E1 |
    | the strip and its words | `ui/shell/SecureAccountNotice.tsx`; the condition is written there and in `DESIGN.md` §7's row, nowhere else | E4 |
    | the rate limits | `services/rate_limit.py::LIMITS` gains `email` and `recover`; `/auth/email/verify` and the reset-passkey pair share `reset`, the register-passkey pair shares `redeem` | E1, E2 |
    | which new paths need no session | `auth_gate.PUBLIC_PATHS` — six entries added, each by the task that adds the route, walked by the existing audit | E1, E2 |
    | reading a link out of a stack's mail sink | `scripts/mail_sink_link.py <dir>` | E1 |
    | the deliverability gate and the hand-verify hatch | `manage.py mail-test`, `manage.py verify-email` | E1 |
    | the rehearsal | `scripts/auth_rehearsal.sh` (+ `MAIL_SINK_DIR`, a `checks email` step), `scripts/email_e2e.mjs` | E5 |

    If your task genuinely needs something new and shared, put it where the family lives and say
    so in **Deviations** in your first sentence.
11. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the
    task did not say, what you measured, what you left). Include that edit in your commit. If
    blocked or the code does not match this spec, stop, note it here, commit nothing broken.

### Model policy

Roli's standing policy (`AGENTS.md` §9) and his addition for the first half — *"only use fable
when you think it really makes a difference"* — give **Opus** for every task but one:

- **E2 — Fable.** It is the account-takeover surface of this half: a public endpoint that turns a
  string from a mailbox into a session, two public endpoints that turn a token into a stored
  credential, and one that creates an account out of a ceremony. The failure mode of every one of
  them is "accepts something it should not", which does not throw and does not show in a green
  run written by the same person — L8's reason, and the same class of code. It also owns the
  transaction boundary that makes the passkey-only registration atomic, and a boundary drawn one
  line too late is silent until the night Face ID fails.

Everything else has an exact spec and an existing shape to copy — the transport is smtplib against
a written contract, the email endpoints are L3's account endpoints with one more table, the pages
are L5's pages with a second button, the strip is L9's with a different condition, the rehearsal is
L13's with three more steps.

### Runtime verification (isolated stack)

**Every task has its own ports and its own database copy**, outside the repo, with the push rows
deleted, no VAPID key, no `smtp_*` key, and a mail sink.

| task | backend | vite | db copy |
|---|---|---|---|
| E0 | 8271 | 8281 | `verify-e0.db` |
| E1 | 8272 | 8282 | `verify-e1.db` |
| E2 | 8273 | 8283 | `verify-e2.db` |
| E3 | 8274 | 8284 | `verify-e3.db` |
| E4 | 8275 | 8285 | `verify-e4.db` |
| E5 | 8276 (new code) / 8277 (old code) | 8286 | the rehearsal's own copy of the latest deploy snapshot |
| E6 | 8278 | 8288 | `verify-e6.db` |

```bash
# <B>, <V> from your row. Run from the worktree root.
WORK=$(mktemp -d)                                   # outside the repo
sqlite3 "file:/home/roli/projects/turnierplaner-reloaded/backend/app.db?mode=ro" ".backup '$WORK/verify.db'"
sqlite3 "$WORK/verify.db" 'delete from pushsubscriptionpreference; delete from pushsubscription;'
mkdir -p "$WORK/uploads" "$WORK/mail"
cp /home/roli/projects/turnierplaner-reloaded/backend/data/cups.json "$WORK/cups.json"

cat > "$WORK/secrets.json" <<JSON
{ "db_url": "sqlite:///$WORK/verify.db",
  "player_accounts": [ { "name": "Roli",  "password": "verify-only", "admin": true },
                       { "name": "Berni", "password": "verify-only", "admin": false },
                       { "name": "Flo",   "password": "verify-only", "admin": false } ],
  "jwt_secret": "verify-only",
  "log_level": "INFO" }
JSON
# No smtp_* key, no push_vapid_* key — ever. MAIL_SINK_DIR is what makes "sent" mail readable.

cd backend && UPLOADS_DIR="$WORK/uploads" CUPS_CONFIG_PATH="$WORK/cups.json" \
  APP_ENV=development AUTH_DEV_ORIGIN=1 MAIL_SINK_DIR="$WORK/mail" \
  .venv/bin/python run.py --host 127.0.0.1 --port <B> --secrets "$WORK/secrets.json" \
  --db-url "sqlite:///$WORK/verify.db" > "$WORK/backend.log" 2>&1 &
# expect in the log: `Mail: file sink at /tmp/…/mail (never delivers)` — and never `Mail: SMTP via …`

cat > "$WORK/vite.config.mjs" <<JS
import base from "/home/roli/projects/turnierplaner-auth/frontend/vite.config.ts";
export default { ...base, cacheDir: "$WORK/vite-cache" };
JS
cd ../frontend && BACKEND_ORIGIN=http://127.0.0.1:<B> VITE_API_BASE_URL=/api VITE_WS_BASE_URL= \
  node node_modules/vite/bin/vite.js --config "$WORK/vite.config.mjs" --port <V> --strictPort --host 127.0.0.1 &

# log in with curl (the cookie jar is the session):
curl -s -c "$WORK/jar" -X POST http://127.0.0.1:<V>/api/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"Roli","password":"verify-only"}'
# set an email, read the link out of the sink, verify it:
curl -s -b "$WORK/jar" -X PUT http://127.0.0.1:<V>/api/auth/email -H 'Content-Type: application/json' -d '{"email":"roli@example.test"}'
python3 scripts/mail_sink_link.py "$WORK/mail"       # → http://127.0.0.1:<V>/g/altherren/verify-email#<token>
# browser: http://localhost:<V>/ (localhost = a secure context for WebAuthn; the CDP virtual
# authenticator recipe is in FEATURES_2026-09-auth.md § "Runtime verification").
#   localStorage theme = "blue" | "light"
```
Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5, Mike=6. Expect on the first boot
`Auth migrated: 3 accounts, 1 group, 6 memberships …`, `Cups imported: 2`, and (E0 on) exactly one
`Mail: …` line. `rm -rf "$WORK"` when done; kill only the PIDs you started, vite's esbuild child
included.

---

## Decided by this plan — the answers

The brief's nine questions, in its order.

**1. Tasks, order, models — seven tasks, one Fable, one parallel pair.**
`E0` (schema, settings, transport, the password floor) → `E1` (the account's email, the texts, the
two CLI commands, `MeOut`) → **`E2`** (recovery, and a passkey from a token or an invite — Fable) →
{`E3` (the pages: register, reset, recover, verify-email, the login hint) ∥ `E4` (Settings → Email,
the strip, the passkey hint, the admin page)} → `E5` (the rehearsal and the browser walk) → `E6`
(documentation). E1 and E2 both edit `routers/auth.py`, `schemas/*.py` and regenerate
`schema.d.ts`, so each runs alone; E3 and E4 are frontend-only with disjoint file sets and type
against `schema.d.ts` as E2 committed it. Nothing runs beside E0 (models, settings, the test
fixtures and the password literals across the suite are its whole tree).

**2. The schema: three new tables, no new column, nothing in `_RUNTIME_COLUMNS`.** Rule 1 of
`AGENTS.md` §5 everywhere; `Account` is not touched (the first half left it without an email column
on purpose, and a table is what that purpose was for).

| table | columns | why this shape |
|---|---|---|
| `AccountEmail` | `player_id` PK FK `player.id`, `email` (as typed, stripped), `email_key` (unique idx — `strip().casefold()`), `verified_at` (**not** nullable — only verified addresses live here), `created_at`, `updated_at` | one row per account, the address recovery resolves; `email_key` is where "unique, case-insensitive" lives. A pending address is *not* here, so a typo never displaces the address that works |
| `EmailVerification` | `id`, `player_id` FK idx, `email`, `email_key` idx, `token_hash` (unique idx, sha256 hex), `created_at`, `expires_at` idx, `used_at` | a pending (change of) address *is* an unused row here — 24 h, single use, consumed by a conditional `UPDATE … WHERE used_at IS NULL`; `services/account_email.py` is its only reader and writer |
| `RegistrationIntent` | `id`, `challenge_id` FK `webauthnchallenge.id` (unique idx), `invite_id` FK `invitecode.id`, `display_name`, `user_handle` (32 random bytes, base64url), `created_at` | what a passkey-only registration has to remember between `options` and `verify` (fact 2). Lives and dies with its challenge: taken by `_take_challenge`'s delete, swept by `sweep_expired_challenges` |

Recovery tokens are `PasswordResetToken` rows (no new table, no new column — `created_by = NULL`,
the CLI's existing shape; the log line names the origin). **Rollback safety is measured against
`ce55a53`** (production today — never `cfc1669`, whose Caddyfile lacks the multi-site import): E0
boots the old code on a database the new code wrote all three tables into and proves it reads,
logs in and writes; E5 does it again on a copy of production with a verified email and a
passkey-only account in place. Old code never reads the three tables; a rollback's one consequence
is that an account registered passkey-only *under the new code* cannot log in on the old code (it
has no password and the old code knows no passkeys) — the same inertness the first half measured
for every passkey, and the same escape (`manage.py set-password`).

**3. The security of recovery.**
- **No enumeration.** `POST /auth/recover {email}` answers `{"ok": true}` for every syntactically
  plausible address, sends only when `email_key` matches an `AccountEmail` row (verified addresses
  only — a pending one buys nothing), and does the send **after the response** (`BackgroundTasks`,
  threadpool), so the response time does not depend on whether the address exists; the one
  difference left is one `INSERT` (~1 ms against network jitter) — accepted and written down. The
  recover page's line is the same sentence before and after: *"If that address is verified, a link
  is on its way. Check your spam folder too."*
- **Rate limits** (`LIMITS`, all sliding windows, 429 + `Retry-After`, never a lockout):

  | endpoint | per address / account | per IP | global |
  |---|---|---|---|
  | `POST /auth/recover` | 3 / 60 min per `email_key` (counted for unknown addresses too) | 5 / 60 min | 30 / 60 min |
  | `PUT /auth/email`, `POST /auth/email/resend` (family `email`) | 5 / 60 min per account | 10 / 60 min | 60 / 60 min |
  | `POST /auth/email/verify`, `POST /auth/reset/passkey/*` | — (family `reset`, existing) | 10 / 60 min | 40 / 60 min |
  | `POST /auth/register/passkey/*` | — (family `redeem`, existing) | 10 / 60 min | 40 / 60 min |

  Every request to `/auth/recover` and every *send* counts (`record_failure`'s "hit every key",
  as L8 counts a minted challenge); `record_success` is never called on these — there is no
  "success" that should forgive an address. The per-address bucket is what stops email-bombing one
  person; the global bucket is what protects the sender reputation of `lorbeerkranz.xyz`.
- **What recovery ends:** every other session of the account (`revoke_all_sessions`, as the admin
  link already does); passkeys stay (disagreement 5). The link is one hour, single use, its token
  in the URL fragment, consumed by the conditional `UPDATE` the first half wrote.
- **Notifying the old address:** on a verification that replaces a different verified address, and
  on `DELETE /auth/email`, the *previous* address gets `email_changed_message` — plain text, no
  link (disagreement 6).
- **Uniqueness:** `email_key` unique across `AccountEmail` **and** across live, unused
  `EmailVerification` rows of *other* accounts; enforced at `PUT /auth/email` (409 for a member —
  disagreement 3) and re-checked at `POST /auth/email/verify` (a race between two accounts claiming
  one address: the second verification finds the key taken and gets the generic *"That link is not
  valid"*, logged with the real reason).
- **A verification token proves the mailbox, not the session**: `POST /auth/email/verify` is public
  (the link opens in Safari, which has no PWA cookie), consumes the token for the account it was
  minted for whoever is logged in, and 400s generically for unknown / used / expired.
- **The token page is the existing one**: `/reset` (renamed in words to "Set a new login"),
  offering a passkey first. A cancelled Face ID spends nothing — the token is consumed only after
  the ceremony verified (E2's order), so the person can try again or fall back to a password.

**4. Sending.** `services/mail.py`:
- `MailMessage(to, subject, text)`; `MailTransport` protocol — `kind` (`"smtp" | "file" |
  "capture" | "off"`), `configured: bool` (**the route layer asks this, never `kind == "smtp"`**, so
  the capture and file transports exercise the real branch), `description: str` (names the host and
  the sender, **never** the password), `send(message)` — **synchronous and blocking**; the one
  async wrapper is `send_off_loop(transport, message)` = `await run_in_threadpool(transport.send,
  message)`, so no send ever runs on the event loop and no SQLAlchemy session is ever open around
  one (the L16 rule: **commit the token row, close the session, then send**).
- `SmtpTransport`: a fresh connection per send (no pooling, nothing shared across threads):
  `smtplib.SMTP_SSL(host, port, timeout=SMTP_TIMEOUT_S)` when `port == 465`, else `smtplib.SMTP(host,
  port, timeout=…)` + `ehlo()` + `starttls(context=…)` — and a server that does not offer STARTTLS
  is a `MailSendError`, never a plaintext login; `context = ssl.create_default_context()`;
  `login(smtp_user, smtp_pass)`; `send_message(msg, from_addr=smtp_from, to_addrs=[to])`; `quit()`.
  `SMTP_TIMEOUT_S = 20`. **No retries**: a failed send is reported once (a verification send tells
  the user; a recovery send is logged) and the next attempt is the person's, rate-limited. Every
  `smtplib.SMTPException`, `OSError` and `ssl.SSLError` becomes `MailSendError(f"{type(exc).__name__}:
  {str(exc)[:200]}")` — an SMTP reply names a mailbox or a policy, never the body.
- `build_message(message, *, from_addr, from_name="Lorbeerkranz") -> EmailMessage`: `From:
  Lorbeerkranz <from_addr>`, `To`, `Subject`, `Date` (`email.utils.formatdate(localtime=False,
  usegmt=True)`), `Message-ID` (`email.utils.make_msgid(domain=<from_addr's domain>)` — Gmail
  scores a missing one), `Auto-Submitted: auto-generated`, `Content-Type: text/plain;
  charset=utf-8`. Plain text only; no HTML, no images, no links but the one.
- **What the user sees on failure.** A verification send that raises → the token row is deleted in
  a fresh short transaction and the answer is **502** *"Could not send the email — try again in a
  moment"* (the Email section's error line). A recovery send that raises → nothing changes for the
  caller (the answer was already `{"ok": true}`); the failure is logged. A server with the transport
  `off` → `PUT /auth/email` answers **409** *"Email is not set up on this server"*, which the UI
  never shows because it hides the form when `MeOut.email_available` is false; `/auth/recover`
  still answers `{"ok": true}` (it is public and must not describe the server to a stranger) and
  logs `recovery requested but mail is off`.
- **The unconfigured state is first-class and visible**: one boot log line always —
  `Mail: SMTP via smtp.privateemail.com:465 as no-reply@lorbeerkranz.xyz` / `Mail: file sink at
  <dir> (never delivers)` / `Mail: off — recovery by email is disabled (set smtp_host, smtp_port,
  smtp_user, smtp_pass, smtp_from in secrets.json)`; `GET /admin/mail-status` (site admin) answers
  `{configured, description}` and the admin page prints it; `MeOut.email_available` carries it to
  every member.
- **No message body in any log.** The transports log `Mail sent to r***@gmail.com (verify)` and
  `Mail to r***@gmail.com failed: SMTPRecipientsRefused: …` — the recipient masked by
  `mask_address` (first character of the local part, then `***`, then `@domain`), the kind, the
  exception class and its message. The file sink logs the **path** it wrote. A test greps a captured
  log for the token and for the message text and asserts zero hits. `Settings.smtp_pass` is a
  dataclass `field(repr=False)`, so a `%r` of the settings can never print it.

**5. No real email from any stack — four layers.**
1. **The capture transport** (`CaptureTransport`, `sent: list[MailMessage]`) is constructed only by
   `tests/conftest.py` (`app.state.mail = CaptureTransport()` right after `create_app`) — no
   setting, flag or env var can select it (racer's rule).
2. **The file sink** (`FileSinkTransport`) *is* env-selectable (`MAIL_SINK_DIR=<dir>`) because it
   cannot deliver anywhere: each message is written as `<dir>/<UTC ts>-<seq>.eml` (`msg.as_bytes()`,
   a real RFC 5322 message), and `scripts/mail_sink_link.py <dir>` prints the newest message's URL —
   that is how an isolated stack "receives" mail and how the rehearsal reads its links.
3. **The boot guard** (`assert_auth_config_safe`, four new rules): SMTP half-configured (some of
   host / user / pass / from set, not all) → refuse, naming the missing keys; SMTP fully configured
   on a **non-production** server without `MAIL_DEV_SMTP=1` → **refuse** (*"SMTP credentials are set
   on a development server — a dev or verification stack must never send real email. Unset them, set
   MAIL_SINK_DIR=<dir> to write mail to files, or MAIL_DEV_SMTP=1 if you really mean it."*);
   `MAIL_SINK_DIR` on a **production** server → refuse (it would swallow every recovery link
   silently); `MAIL_DEV_SMTP=1` on production → refuse (a dev flag in production, the
   `AUTH_DEV_ORIGIN` precedent). A worker never sets `MAIL_DEV_SMTP`.
4. **The recipe and the rehearsal** carry no `smtp_*` key and always set `MAIL_SINK_DIR`;
   `auth_rehearsal.sh` asserts the boot log says `file sink` and that the production-environment
   boot (step 7) *refuses* when the sink is still set and says `Mail: off` when it is not.
   L13's script is extended (E5) rather than copied: `MAIL_SINK_DIR="$WORK/mail"` in
   `start_backend` for the new code, a `checks email` subcommand, and `scripts/email_e2e.mjs` for
   the two browser ceremonies.

**6. The strip — one place, four sentences.** `ui/shell/SecureAccountNotice.tsx` reads
`useAuth()`'s `emailAvailable`, `emailVerified`, `loginSecure` (all three straight from `MeOut`)
and `passkeysSupported()`:
```
needsEmail = emailAvailable && !emailVerified
needsLogin = !loginSecure
shown     = status === "authed" && (needsEmail || needsLogin) && !onAccountTab
```
| missing | the sentence | the button |
|---|---|---|
| both, passkeys supported | Secure your account — add an email address and a passkey. | **Secure account** |
| both, unsupported | Secure your account — add an email address and set a new password. | **Secure account** |
| the email | Secure your account — add an email address. | **Add email** |
| the login, supported | Secure your account — add a passkey. | **Add a passkey** |
| the login, unsupported | Secure your account — set a new password. | **Set a password** |
Same card, same `warn` tone, same `KeyRound`, same `Link` to `/settings?tab=account` with
`NAV_JUMP_STATE`, still not dismissible, still absent on Settings → Account and on the auth screens.
The condition is written in the component and in `DESIGN.md` §7's row, nowhere else — E6 rewrites
the row and closes `AGENTS.md` §11's open item about it. **`loginSecure` is the server's word**
(`has_passkey or password_origin == "set"`, disagreement 9) so the strip, the Settings hint line
and the admin subtitle cannot disagree.

**7. The atomic passkey-only registration — the flow, and how it is proven.**
- `POST /auth/register/passkey/options {code, display_name}` (public, family `redeem`, every mint
  counts): `find_live_invite` (generic 400 for unknown / spent / expired — checked **first**, so
  nobody without a code learns whether a name is taken), `validate_display_name`,
  `ensure_name_free` (409), then `new_registration_options`: a fresh `user_handle`, a
  `WebAuthnChallenge(kind="register-new", player_id=None, +5 min)` and a `RegistrationIntent`
  pointing at it, `generate_registration_options(user_id=handle, user_name=display_name,
  resident_key=REQUIRED, user_verification=REQUIRED)`; commit; answer the options JSON.
  **Nothing about the person exists yet** — no `Player`, no `Account`, the code unspent.
- The browser runs `startRegistration`. A closed sheet (`NotAllowedError`) → the client never calls
  verify → the intent expires with its challenge and is swept. **No account.**
- `POST /auth/register/passkey/verify {credential, label?}` (public, family `redeem`):
  1. `take_registration_intent`: read the intent by the challenge in the credential's
     `clientDataJSON`, then `_take_challenge(kind="register-new")` — the challenge row and the
     intent are **deleted and committed before anything is verified** (L8's rule, unchanged), so a
     replay finds nothing.
  2. `_verified_registration(rp, parsed)` — the library's verification, pure, no store.
  3. **One transaction**: re-`find_live_invite` by `intent.invite_id` (the code may have been spent
     by a password registration in between → generic 400), `ensure_name_free(intent.display_name)`
     again, `Player`, `Account(password_hash=None, password_origin="none",
     webauthn_user_handle=intent.user_handle)`, `_store_passkey` (flush, no commit),
     `GroupMembership(member)`, `spend_invite` (the conditional `UPDATE` — two racing registrations
     cannot both win), `create_session(kind="register")`, **commit**. Any exception between the
     first `add` and the `commit` rolls the whole thing back.
  4. The cookie, `MeOut` — `has_passkey: true`, `has_password: false`, `login_secure: true`, and the
     strip on the next page asks for the email.
- **Proven, not asserted** (`tests/test_passkey_tokens.py`): (a) a credential with a bad signature
  → 400, and `player`, `account`, `passkey`, `groupmembership` all have **the same row counts as
  before** and the invite is unspent; (b) a wrong origin, a wrong rpId, UV clear — same; (c) an
  intent whose code was spent meanwhile → 400, no rows; (d) a name taken meanwhile → 409, no rows;
  (e) a crash injected **after** the passkey row is added and **before** the commit
  (`monkeypatch` `services.sessions.create_session` to raise) → 500, and **no rows** — the assertion
  that the transaction boundary is where the plan says; (f) a replayed verify → 400 (the challenge
  is gone); (g) an options call whose sheet is never answered leaves no `Player` and, after
  `sweep_expired_challenges` with `_now` moved 6 minutes on, no intent either; (h) the happy path:
  one row each, the code spent, a session, `/me` as above, and the new passkey signs in through
  `/auth/passkeys/login/verify`. E5 runs the real ceremony in Chromium against the stack.

**8. The deploy.** This half **joins** `AGENTS.md` §7's auth deploy; the steps it adds are in
"Deployment" below: one DNS record for Roli to publish beforehand (DMARC; SPF, MX and DKIM are
already there — measured), the rehearsal now including the email walk, the unchanged `git pull &&
docker compose build backend frontend` / preflight / `up -d --build backend frontend`, and then the
**deliverability gate** — `manage.py mail-test` from inside the production container with the
credentials on the command line, a Gmail "Show original" that reads `spf=pass`, `dkim=pass` and (with
DMARC published) `dmarc=pass`, in the inbox and not in spam — **before** the five `smtp_*` keys go
into `secrets.json` and `docker compose restart backend` turns email on. The phone walk after it is
written out step by step.

**9. What is wrong or risky in the decisions** — the nine items under "Where this plan disagrees",
plus two risks that are nobody's decision: Namecheap refuses a `From` that is neither the mailbox
nor one of its configured aliases (`553 … sender address rejected`), so `no-reply@` must be an alias
of the login mailbox or the mailbox itself — the gate catches it; and a mailbox with two-factor
authentication needs an **application password** for SMTP (Namecheap's own wording: "your Master or
Application password"), not the login password.

## Task overview & order

| # | ID | Title | Model — why | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------|-------------------------------------|------|
| 1 | E0 | The three tables, the mail settings and guard, the transport, the 15-character floor | **Opus** — models against an exact table, a guard against four rules, a transport against a written contract; the risk is the guard, and its every rule has a test | `backend/app/models.py`, `backend/app/settings.py`, `backend/app/main.py` (two lines), `backend/app/services/mail.py` (new), `backend/app/services/passwords.py`, `backend/tests/conftest.py`, `backend/tests/test_mail_transport.py` (new), `backend/tests/test_settings_guard.py`, `backend/tests/test_password_policy.py` (new), the password literals in existing tests, `frontend/src/pages/auth/password.ts`, the password literals in `frontend/src/test/*.test.tsx`, `scripts/passkey_e2e.mjs` (one default) | alone |
| 2 | E1 | The account's email: set, verify, resend, remove; the texts; `MeOut`; `mail-test` and `verify-email` | **Opus** — L3's account endpoints with one more table and exact refusals | `backend/app/services/account_email.py` (new), `backend/app/services/mail_texts.py` (new), `backend/app/services/sessions.py` (`me_payload`), `backend/app/services/rate_limit.py`, `backend/app/routers/auth.py`, `backend/app/routers/me.py`, `backend/app/routers/admin.py`, `backend/app/auth_gate.py` (two public paths), `backend/app/schemas/requests.py`, `backend/app/schemas/responses.py`, `backend/manage.py`, `backend/tests/test_account_email.py` (new), `backend/tests/test_admin.py` (mail-status), `backend/tests/test_rate_limit.py`, `scripts/mail_sink_link.py` (new), `frontend/src/api/generated/schema.d.ts`, `frontend/src/api/types.ts` (aliases), `frontend/src/test/authFixtures.ts` (the five new `MeOut` fields) | alone, after E0 |
| 3 | E2 | Recovery by email; a passkey from a reset token; the atomic passkey-only registration | **Fable** — the takeover surfaces (see Model policy) | `backend/app/services/reset_links.py` (`link_origin`, `recovery_url`), `backend/app/services/passkeys.py`, `backend/app/services/accounts.py`, `backend/app/routers/auth.py`, `backend/app/routers/admin.py` (import `link_origin` from the service), `backend/app/auth_gate.py` (four public paths), `backend/app/schemas/requests.py`, `backend/app/schemas/responses.py` (none expected), `backend/tests/test_recovery.py` (new), `backend/tests/test_passkey_tokens.py` (new), `backend/tests/test_passkeys.py` (the split), `frontend/src/api/generated/schema.d.ts` | alone, after E1 |
| 4 | E3 | Register, reset, recover and verify-email in the browser: passkey first | **Opus** — L5's pages with a second button and two new one-card pages | `frontend/src/pages/auth/PasskeyOrPassword.tsx` (new), `RegisterPage.tsx`, `ResetPage.tsx`, `RecoverPage.tsx` (new), `VerifyEmailPage.tsx` (new), `LoginPage.tsx`, `frontend/src/api/passkeys.api.ts`, `frontend/src/api/registration.api.ts`, `frontend/src/app/App.tsx` (two routes), `frontend/src/test/registration.test.tsx`, `frontend/src/test/recovery.test.tsx` (new), `frontend/src/test/passkeys.test.tsx` (the login-page cases only) | pair, after E2 |
| 5 | E4 | Settings → Email; the strip's two steps; the passkey hint; the admin page's email state and mail status | **Opus** — one settings group, one condition, one subtitle | `frontend/src/pages/settings/EmailSection.tsx` (new), `SecuritySection.tsx`, `frontend/src/ui/shell/SecureAccountNotice.tsx`, `frontend/src/auth/AuthContext.ts`, `frontend/src/auth/AuthProvider.tsx`, `frontend/src/hooks/useRefreshMeOnReturn.ts` (new), `frontend/src/api/account.api.ts`, `frontend/src/api/admin.api.ts`, `frontend/src/api/queryKeys.ts` (`qk.admin.mailStatus`), `frontend/src/pages/admin/AccountsTab.tsx`, `frontend/src/test/emailSection.test.tsx` (new), `frontend/src/test/securitySection.test.tsx`, `frontend/src/test/adminPage.test.tsx`, `frontend/src/test/passkeys.test.tsx` (the strip cases only) | pair, after E2 |
| 6 | E5 | The rehearsal learns email and the two new ceremonies; the browser walk | **Opus** — a script to extend and numbers to write down | `scripts/auth_rehearsal.sh`, `scripts/auth_rehearsal_checks.py`, `scripts/email_e2e.mjs` (new), this file (its report) | after E3 and E4 |
| 7 | E6 | Documentation pass | **Opus** — canon from the workers' notes | `AGENTS.md`, `DESIGN.md`, `README.md`, `backend/secrets.json.example`, `FEATURES_2026-09-auth.md` (its Deployment pointer, if E5 changed the rehearsal's shape), this file | last |

**Order:** E0 → E1 → E2 → {E3 ∥ E4} → E5 → E6 → *(the single deploy, with the first half, on
Roli's go)*.

**Why this order.** E0 owns `models.py`, `settings.py` and the fixtures every later test runs
through, and it lengthens password literals across the suite — nothing can run beside it. E1 needs
E0's tables and transport; E2 needs E1's `MeOut` fields (a passkey-only registration answers
`MeOut`) and `account_email` (recovery resolves an address); E1 and E2 both regenerate
`schema.d.ts`, so each runs alone. E3 and E4 are frontend-only and disjoint: E3 owns `pages/auth/`
and the two ceremony modules, E4 owns `pages/settings/`, the shell strip, `auth/` and
`pages/admin/`; both type against E2's committed `schema.d.ts`, and **E4's `passkeys.test.tsx` edits
are the strip cases, E3's the login-page cases** — commit only the `describe` blocks you own. E5
needs both halves in the browser. E6 needs E5's numbers.

---

## E0 — The three tables, the mail settings and guard, the transport, the 15-character floor  ☑

**The gap.** `models.py` has no `AccountEmail`, `EmailVerification` or `RegistrationIntent`;
`settings.py` knows nothing about SMTP; nothing in `services/` can send; `MIN_PASSWORD_LENGTH` is 10
on both sides.

**Verify first.**
```bash
grep -n "class AccountEmail\|class EmailVerification\|class RegistrationIntent" backend/app/models.py   # → 0
grep -n "smtp\|mail_sink" backend/app/settings.py                                                        # → 0
ls backend/app/services/mail.py                                                                          # → no such file
grep -n "MIN_PASSWORD_LENGTH = " backend/app/services/passwords.py frontend/src/pages/auth/password.ts   # → 10, 10
```

**The change.**
1. **`models.py`** — the three tables of §2 exactly as tabled, after `PasswordResetToken`.
   Docstrings say which task reads each (E1 the first two, E2 the third) and that old code never
   does. `create_all` makes them; nothing goes into `_RUNTIME_COLUMNS` or `_RUNTIME_INDEXES`
   (`db.py` is not in this task's file set and must not be needed).
2. **`settings.py`** — `Settings` gains, after `session_ttl_days`: `smtp_host: str = ""`,
   `smtp_port: int = 465`, `smtp_user: str = ""`, `smtp_pass: str = field(default="", repr=False)`,
   `smtp_from: str = ""`, `mail_sink_dir: str = ""`, `mail_dev_smtp: bool = False`. `load_settings`
   reads them with the existing `pick` / `pick_int` / `pick_bool` (env `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `MAIL_SINK_DIR`, `MAIL_DEV_SMTP`; secrets keys
   `smtp_host` …). `smtp_from` is stripped; `smtp_host` stripped and lowercased.
   `assert_auth_config_safe` gains the four rules of §5.3 **in this order**, each an
   `AuthConfigError` whose message names the setting: half-configured; SMTP in non-production
   without `mail_dev_smtp`; `mail_sink_dir` in production; `mail_dev_smtp` in production. A fully
   configured SMTP in production with no sink and no dev flag passes; a server with none of the
   seven set passes (that is the shipped default).
3. **`services/mail.py`** — everything §4 names: `MailMessage`, the `MailTransport` `Protocol`,
   `SmtpTransport`, `FileSinkTransport`, `CaptureTransport`, `OffTransport`,
   `MailNotConfigured(Exception)`, `MailSendError(Exception)`, `mail_transport_for(settings)`
   (`mail_sink_dir` → file sink; all five smtp keys → SMTP; else off), `build_message`,
   `send_off_loop`, `mask_address`, `SMTP_TIMEOUT_S = 20`, `FROM_NAME = "Lorbeerkranz"`. The SMTP
   connection is opened **inside `send`** (built on first use, so a server whose SMTP host is
   unreachable still boots). `FileSinkTransport.send` creates the directory if missing, names the
   file `<YYYYmmddTHHMMSSffffff>-<seq>.eml` (a module-level counter under a lock), writes
   `build_message(...).as_bytes()`, logs the path. `description` strings are the three boot lines of
   §4 (the SMTP one names host, port and `smtp_from`; never `smtp_user` or the password — the login
   mailbox is a secret's neighbour).
4. **`main.py`** — after `assert_auth_config_safe`: `app.state.mail = mail_transport_for(settings)`
   and `log.info("Mail: %s", app.state.mail.description)` in the lifespan, right after `DB
   initialized`. Two lines plus an import; the file is otherwise L2's.
5. **`services/passwords.py`** — `MIN_PASSWORD_LENGTH = 15`. `validate_new_password`'s sentence
   follows automatically ("The password must be at least 15 characters long"). **Nothing in
   `routers/auth.py::login` or `verify_password` checks length — assert it stays that way** (the
   test below logs in with a 9-character migrated password).
6. **`frontend/src/pages/auth/password.ts`** — `MIN_PASSWORD_LENGTH = 15`; `PasswordField`'s hint
   reads the constant and needs no edit.
7. **The literals.** Every test that *sets* a password of 10–14 characters must lengthen it — never
   lower the floor. Find them with `make test` and `npm run check` (the failures name themselves) and
   with `grep -rnE "password.{0,30}\"[^\"]{10,14}\"" backend/tests frontend/src/test`. Migrated
   passwords (`conftest.TEST_ACCOUNTS`, the recipe's `verify-only`) stay as they are — the
   migration hashes them untouched, which is the whole point. `scripts/passkey_e2e.mjs`'s
   `--new-password` default (`another-password-1`, 18) is fine; check it and say so.
8. **`tests/conftest.py`** — after `create_app(settings)`: `app.state.mail = CaptureTransport()`;
   a helper `mail_sent(client) -> list[MailMessage]` and `mail_off(client)` (swaps in
   `OffTransport()`), both imported by E1/E2's tests.
9. **Rollback safety, measured** (the L1 technique): boot this tree on a copy of the dev DB, then
   `git archive ce55a53 backend | tar -x -C $(mktemp -d)` and boot **that** on the same file with an
   old-shape secrets file: clean boot, `POST /auth/login` (JWT) 200, `GET /tournaments` 200, `POST
   /tournaments` 200; the three new tables untouched (`sqlite3` counts before and after). Then this
   tree again: boots, the tables still there, nothing migrated twice.

**Definition of done.**
- ☑ `tests/test_mail_transport.py` (≈12): `mail_transport_for` picks off / file / smtp for the three
  shapes; the file sink writes a parseable RFC 5322 message with `From: Lorbeerkranz <…>`, `Date`,
  `Message-ID`, `Auto-Submitted`, UTF-8 text, and logs only the path; the capture transport keeps
  messages in order and is `configured`; `OffTransport.send` raises `MailNotConfigured` and is not
  `configured`; `SmtpTransport.send` against a monkeypatched `smtplib.SMTP_SSL` (a fake recording
  `host`, `port`, `timeout`, `context`, `login`, `send_message`, `quit`) uses 465 → `SMTP_SSL`, 587 →
  `SMTP` + `starttls`, refuses a server whose `has_extn("STARTTLS")` is false, maps
  `SMTPAuthenticationError` / `OSError` to `MailSendError` **whose text carries no body**, and never
  logs the body (`caplog` asserted); `mask_address`; `build_message` on a non-ASCII name and body.
- ☑ `tests/test_settings_guard.py` +≈8: each of the four refusals, the message naming the setting,
  the two legitimate shapes (production with all five and nothing else; dev with a sink), and dev
  with all five **plus** `mail_dev_smtp` passing. `Settings(...)`'s `repr` does not contain the
  password.
- ☑ `tests/test_password_policy.py` (≈6): 14 characters refused and 15 accepted on register, reset,
  `POST /auth/password` and `manage.py set-password` (subprocess, piped) — and a 9-character
  **migrated** password still logs in (`test_login_never_checks_length`).
- ☑ `make test` green with the count written down against ≈507; `make lint` clean; no response model
  touched → **no `gen-types`**. `cd frontend && npm run check` green with the count against 932.
- ☑ The stack (8271/8281): the boot log's `Mail: file sink at …` line; a request that would send
  (none exists before E1 — assert with the transport directly from a Python shell against the
  stack's settings) writes a file; the rollback drill of step 9 with its numbers.
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §4 (the seven keys, the sink, the dev flag, the four guard rules; "there is
still no key `secrets.json` *must* carry — the five `smtp_*` keys are optional and turn email on"),
§5 (the three tables, measured rollback), §9 (**no new dependency**: `smtplib` + `email`, and why
nodemailer's cousin was not needed); `DESIGN.md` §5b: "A password hint is `At least 15 characters`".

**Deviations.**
- **Nothing new and shared beyond the table in Rule 10.** Two small additions inside the files E0
  owns: `MailMessage` has a fourth field, `kind: str = "mail"` — a log tag only (`verify`,
  `recover`, `changed`, `test` …), which is what makes the plan's own log line `Mail sent to
  r***@gmail.com (verify)` possible; and `settings.py` has `SMTP_KEYS` / `smtp_keys_set` beside the
  guard (the four *string* keys — `smtp_port` defaults to 465, so "all five or none" is "all four
  strings or none"). E1/E2 pass `kind=` on every message.
- `app.state.mail = mail_transport_for(settings)` sits beside `app.state.settings` in `create_app`
  (the `FastAPI` object does not exist yet where `assert_auth_config_safe` runs); the boot line
  `Mail: <description>` is logged in the lifespan right after `DB initialized`, as specified.
- The guard's four rules run **before** the proxy-hops warning (so a refusal is the last line) and in
  the plan's order; the half-configured message names which keys are set and which are missing and
  **never a value**. Two shapes the plan did not spell, decided and pinned by the matrix: a dev
  server with `MAIL_DEV_SMTP=1` and **no** SMTP keys boots (the flag allows nothing by itself), and a
  dev server with SMTP keys **and** a sink but no flag is still refused (a sink does not excuse
  credentials). With the flag, SMTP **and** a sink, `mail_transport_for` picks the sink.
- `FileSinkTransport` writes `From: Lorbeerkranz <smtp_from>` when `smtp_from` is set, else
  `no-reply@lorbeerkranz.xyz` (`SINK_FROM`) — a sink delivers nowhere, the address only has to make
  a well-formed message. Its log line is `Mail to r***@x (kind) written to <path>`.
- `SmtpTransport`: a second `ehlo()` after `starttls` (RFC 3207: the server's capabilities are
  re-read over TLS); `quit()` in a `finally`, falling back to `close()` if the connection is already
  broken. `MailSendError` is raised `from None`, so no chained traceback carries anything but the
  SMTP reply. `repr(SmtpTransport)` shows neither the login mailbox nor the password (both
  `repr=False`), and `description` names host, port and `smtp_from` only.
- `tests/conftest.py`: `app.state.mail = CaptureTransport()` after `create_app`, plus `mail_sent(client)`
  and `mail_off(client)`. `test_password_policy.py` builds one more app (a nine-character
  migrated password) and sets a `CaptureTransport` on it too — still no setting can select it.
- **The literals.** Backend: `test_auth_migration.py::test_a_new_password_needs_ten_to_two_hundred_characters`
  (renamed `…_fifteen_…`; 15 accepted, 14 and 9 refused — the plan's grep does not find it, the
  first full run did), `test_accounts.py` (the short-password refusal now reads "at least 15",
  and its parametrisation gained a 14-character case), `test_admin.py` (the `set-password` refusal
  text). `GOOD_PASSWORD` (20) in three files, `another-long-one` (16) and every migrated password
  (`editor-secret`, `admin-secret`, `verify-only` …) stay — the migrated ones are what
  `test_login_never_checks_length`'s point is. Frontend: `registration.test.tsx` —
  `long-enough-1` (13) → `long-enough-pw-1` (16), the hint reads "At least 15 characters", and the
  hint test now also asserts 14 characters are **unmet** with the button disabled before 15 turns it
  met. `securitySection.test.tsx`'s `a-longer-password` (17) needed nothing.
  **`scripts/passkey_e2e.mjs`'s `--new-password` default `another-password-1` is 18 — fine, not
  edited.** `LoginPage.tsx` does not import `MIN_PASSWORD_LENGTH` (grep), so the login form never
  checks length either.
- **Left for their owners (outside E0's file set):** `services/accounts.py::set_password`'s docstring
  still says "(10–200 characters)" (E2 owns `accounts.py`), and `pages/auth/PasswordField.tsx`'s doc
  comment still says `"At least 10 characters"` (E3 owns `pages/auth/`). Both are comments; the
  rendered hint reads the constant and shows 15.
- **Every guard rule bites, measured.** The mail matrix is written out — 3 environments × SMTP
  none/half/full × sink × dev flag = **36 cells, 22 refusals, 14 boots** — not recomputed from the
  guard. Each rule was disabled in turn (`if False:`) and the suite re-run, then restored
  (`settings.py` byte-compared):

  | weakened | failures | which |
  |---|---|---|
  | half-configured | 21 | all 12 `half` cells + 4 single-key + 4 missing-key + the naming test |
  | SMTP on non-production | 7 | the 4 `dev/test-full-*-False` cells, the message test, `create_app` refusing, the secrets-file load |
  | sink in production | 5 | the 4 `production-*-True-*` sink cells + the message test |
  | dev flag in production | 3 | the 2 `production-*-False-True` cells + the message test |
  | `smtp_pass` `repr=False` removed | 1 | `test_the_settings_repr_never_prints_the_smtp_password` |

  The transport's promises were weakened the same way (`mail.py` restored and byte-compared): the
  body added to the SMTP success line → 1 failure; the body logged by the file sink → 1; the body
  put into `MailSendError`'s text → 4 (every failure class); the STARTTLS check removed → 2; the
  description naming `smtp_user` → 1. Password floor: `MIN_PASSWORD_LENGTH = 14` → 5 of 6
  `test_password_policy` tests fail; `validate_new_password` inserted into `login` →
  `test_login_never_checks_length` fails.
- **Password lengths, measured** (`tests/test_password_policy.py`, 6 tests): 14 characters →
  **400** *"The password must be at least 15 characters long"* and 15 → **200** on `POST /auth/register`
  (the code stays unspent after the refusal), `POST /auth/reset` (the link stays usable), `POST
  /auth/password`; `manage.py set-password` piped → exit **1** "at least 15" / exit **0**. A
  **nine-character migrated** password (`password_origin == "migrated"`) logs in three times in a row.
- **The stack** (backend 8271 only, `$WORK` in the session scratchpad, `pushsubscription` and
  `pushsubscriptionpreference` emptied before the first boot — 0 rows — no VAPID, no `smtp_*` key,
  `MAIL_SINK_DIR` set). Vite (8281) was **not** started: E0's only UI change is a constant the unit
  tests read. First boot: `Auth migrated: 3 accounts, 1 group, 6 memberships …`, `Cups imported: 2`,
  `DB initialized`, **`Mail: file sink at …/e0/mail (never delivers)`**, never `Mail: SMTP`. A send
  through `mail_transport_for(load_settings(<the stack's secrets and env>))` wrote
  `20260924T082712641158-1.eml`, 366 B, a parseable message with `From: Lorbeerkranz
  <no-reply@lorbeerkranz.xyz>`, `Date`, `Message-ID: <…@lorbeerkranz.xyz>`, `Auto-Submitted:
  auto-generated`, `text/plain; charset="utf-8"`, 8bit umlauts. `run.py` against the same file with
  the guard's shapes: SMTP env on development → exit 1 with the "development server" refusal (the
  fake password appears **0** times in the output); `SMTP_HOST` alone → the half-configured refusal;
  production + `MAIL_SINK_DIR` → refused; production + `MAIL_DEV_SMTP=1` → refused; production with
  none of them → `Mail: off — recovery by email is disabled (…)` and a clean startup.
- **Rollback, measured against `ce55a53`** (`git archive ce55a53 backend`, venv symlinked, the same
  DB file, an old-shape secrets file — `player_accounts` + `jwt_secret`, no `auth_*`/`smtp_*` key):
  the new tree migrated the DB and created the three tables; one row was then written into each
  (`accountemail`, `emailverification`, and a `registrationintent` pointing at a real
  `webauthnchallenge` and `invitecode` row) and their counts and content hashes recorded. Old code:
  **clean boot** (`Cup defs validated`, `DB initialized`), `POST /auth/login` → **200 with a JWT**,
  `GET /tournaments` **200** (13,324 B), `GET /stats/records` **200**, `POST /tournaments` with the
  bearer token **200** (tournaments 18 → 19); the three tables **byte-identical** afterwards (1 / 1 / 1
  rows, same hashes). New tree again: boots, `Auth migrated: 0 accounts, 0 groups, 0 memberships —
  … backfilled tournament=1` (only the tournament the old code created — nothing migrated twice),
  `Mail: file sink …`, cookie login **200**, `GET /tournaments` **200**, the three tables still
  byte-identical.
- **Gates.** `make test` **586 passed** in 27:50 (baseline 507 at `f0dab7d`; +79 = 20 `test_mail_transport` + 52 `test_settings_guard` + 6 `test_password_policy` + 1 new `test_accounts` case); `make lint` clean; no response model touched → no
  `gen-types`. `cd frontend && npm run check` **932 tests in 96 files** (unchanged count — the only
  frontend test edit adds assertions inside an existing test), `npm run build` green.

## E1 — The account's email: set, verify, resend, remove; the texts; `MeOut`; `mail-test` and `verify-email`  ☑

**The gap.** The tables exist and nothing writes them; `MeOut` cannot say whether an account can be
recovered; no email has words; the CLI cannot test the transport or mark an address verified by
hand.

**Verify first.**
```bash
grep -n "/email" backend/app/routers/auth.py            # → 0
grep -n "email_available\|login_secure" backend/app/schemas/responses.py   # → 0
grep -n "mail-test\|verify-email" backend/manage.py      # → 0
```

**The change.**
1. **`services/account_email.py`** — `VERIFY_TTL = timedelta(hours=24)`, `MAX_EMAIL_LENGTH = 254`,
   `INVALID_LINK = "That link is not valid"`, `EMAIL_TAKEN = "That email address is used by another
   account"`, `NOT_AN_EMAIL = "That does not look like an email address"`, `MAIL_OFF = "Email is not
   set up on this server"`; `normalize_email(raw) -> str` (strip), `email_key(raw) -> str`
   (`strip().casefold()`), `is_plausible_email(s)` (exactly one `@`, a non-empty local part, a domain
   with a dot and no whitespace, ≤ 254 chars — deliverability decides the rest),
   `validate_email(raw) -> str` (400 `NOT_AN_EMAIL`), `ensure_email_free(s, key, *,
   except_player_id)` (409 `EMAIL_TAKEN` when the key is in `AccountEmail` or in a live unused
   `EmailVerification` of another player), `request_verification(s, account, email) ->
   tuple[EmailVerification, str]` (deletes the player's older unused verifications — the newest link
   is the only one that works, the reset-link precedent — mints `secrets.token_urlsafe(32)`, stores
   sha256, `expires_at = +24 h`, flushes; **the caller commits before sending**),
   `verification_url(origin, token, *, group_slug=DEFAULT_GROUP_SLUG)` →
   `{origin}/g/<slug>/verify-email#<token>`, `find_live_verification(s, token)` (generic 400,
   logged with the reason), `consume_verification(s, token) -> tuple[Account, str | None]` (the
   conditional `UPDATE … WHERE used_at IS NULL`; re-`ensure_email_free`; upsert `AccountEmail`;
   delete the player's other live verifications; returns the account and the **previous** verified
   address when it differs), `remove_email(s, account) -> str | None`, `email_status(s, player_id)
   -> dict` (`email`, `email_pending`, `email_verified`), `email_state(s, player_id) -> "none" |
   "pending" | "verified"`, `verified_email_for(s, player_id)`, `account_by_verified_email(s, key)`,
   `mark_verified_by_hand(s, account, email)` (the CLI's), `sweep_expired_verifications(s)` (called
   from `PUT /auth/email`, cheap).
2. **`services/mail_texts.py`** — four builders returning `MailMessage`, English, plain text, the
   link on its own line, nothing else clickable: `verify_email_message(*, to, name, url)` (subject
   *Confirm your email for Lorbeerkranz*; "It works once, for 24 hours. If you did not ask for this,
   ignore this email."), `recovery_message(*, to, name, url)` (subject *Get back into Lorbeerkranz*;
   "Open this link to set a new passkey or password … It works once, for one hour, and using it
   signs out every other device. If this was not you, ignore this email — nothing changes."),
   `email_changed_message(*, to, name)` (subject *Your Lorbeerkranz email address changed*; no link;
   "If that was not you, tell the admin right away."), `test_message(*, to, description)` (subject
   *Lorbeerkranz mail test*; the UTC time, the transport description, and what to read in Gmail's
   "Show original": the `spf=`, `dkim=` and `dmarc=` results).
3. **`services/sessions.py::me_payload(s, claims, *, email_available: bool)`** — gains `email`,
   `email_pending`, `email_verified` (from `email_status`), `email_available`, and `login_secure =
   has_passkey or account.password_origin == "set"`. Every caller passes
   `request.app.state.mail.configured`; `routers/auth.py` gets one `_me(request, s, claims)` wrapper
   so the eight call sites stay one-liners; `routers/me.py::me` passes it too.
4. **`services/rate_limit.py`** — `LIMITS["email"] = ((5, 3600), (10, 3600), (60, 3600))`.
5. **`routers/auth.py`** — `PUT /auth/email {email}` → `EmailStatusOut` (session; family `email` on
   `name_key`; 409 `MAIL_OFF` when `not mail.configured`; `validate_email`; the account's own
   verified address → 200 with the status and no send; else `ensure_email_free`,
   `request_verification`, **commit**, `send_off_loop(transport, verify_email_message(...))` with
   the URL built from `reset_links.link_origin(request)`; on `MailSendError` delete that row in a
   fresh transaction and answer **502** *"Could not send the email — try again in a moment"*; every
   call that reaches the send counts as an attempt); `POST /auth/email/resend` → `EmailStatusOut`
   (the pending address, a fresh token, same limits; 409 *"Nothing to send"* when nothing is
   pending); `DELETE /auth/email` → `EmailStatusOut` (deletes the row and the live tokens, commits,
   then **background** `email_changed_message` to the removed verified address, if any); `POST
   /auth/email/verify {token}` → `EmailVerifiedOut{ok, email}` (**public**, family `reset`;
   `consume_verification`, commit, then background `email_changed_message` to the previous address
   when one was replaced). `BackgroundTasks` tasks close over a **built `MailMessage` and the
   transport** — never the session, never the request.
6. **`auth_gate.PUBLIC_PATHS`** += `"/auth/email/verify"`. `/auth/email` and `/auth/email/resend` are
   account paths by construction (`/auth/` prefix).
7. **`routers/admin.py`** — `GET /admin/mail-status` → `MailStatusOut{configured, description}`
   (site admin); `_account_rows` adds `email_state` (one query for all: `AccountEmail.player_id`s
   and the live-verification player ids) and `login_secure`.
8. **Schemas** — requests: `EmailBody{email}`, `EmailVerifyBody{token}`; responses:
   `EmailStatusOut{email: str | None, email_pending: str | None, email_verified: bool}`,
   `EmailVerifiedOut{ok, email}`, `MailStatusOut{configured, description}`, the five `MeOut` fields,
   the two `AdminAccountOut` fields. `make gen-types`; `types.ts` gains `EmailStatus`,
   `EmailVerified` and `MailStatus` aliases (E3 and E4 import types, never `S[...]`) and
   `AdminAccount` keeps its `Omit` shape; `authFixtures.ts::sessionFixture`
   gains `email: null, email_pending: null, email_verified: false, email_available: true,
   login_secure: true` so `tsc` stays green for E3/E4.
9. **`manage.py`** — `mail-test --to ADDR [--host H] [--port P] [--user U] [--from F]`: with `--host`,
   the four flags override the loaded settings and the password is read with `getpass` on a tty
   (one stdin line otherwise, never echoed); **`assert_auth_config_safe` runs on the resulting
   settings** — so on a dev box it refuses without `MAIL_DEV_SMTP=1`, which is the guard doing its
   job; prints the transport's description, sends `test_message`, prints *"Sent to <addr> via
   <description>. Open it in Gmail → ⋮ → Show original and read the SPF, DKIM and DMARC lines: all
   three must say PASS (DMARC once its record is published)."*, exits 0; on `MailSendError` prints
   the class and message to stderr, exits 1. `verify-email --player NAME --email ADDR`: resolves the
   player like the five hatches, `validate_email`, `ensure_email_free`, `mark_verified_by_hand`,
   commits, prints one line, exit 0 / 1. Both accept `--secrets` / `--db-url` after the subcommand
   (the `_hatch` shape).
10. **`scripts/mail_sink_link.py <dir> [--all] [--to ADDR]`** — parses the newest `.eml` (or every
    one) with `email.parser.BytesParser`, prints the first `http(s)://` URL of the body (or every
    message's `To`, `Subject`, URL with `--all`); exit 1 when the directory is empty.

**Definition of done.**
- ☑ `tests/test_account_email.py` (≈24): set → a token row, a captured message to that address whose
  body carries the fragment URL and nothing else clickable, `MeOut.email_pending`; verify → the
  `AccountEmail` row, `email_verified`, the token used, a second use 400; expired 400 (monkeypatch
  `_now`); a taken verified address → 409 at `PUT`; a pending address on another account → 409;
  the same address pending on two accounts by racing past the check (insert the second token by
  SQL) → the second verify 400 and one `AccountEmail`; a change of address keeps the verified one
  until the new one verifies, then the old address gets the `changed` notice (captured, no URL in
  it); `DELETE` sends the notice; resend mints a fresh token and kills the old; the 6th send in an
  hour → 429; `mail_off` → `PUT` 409, `MeOut.email_available` false; a `MailSendError` from a
  raising capture transport → 502 and **no token row left**; the verify endpoint is public (the
  gate audit lists it) and works without a session; `caplog` never holds the token or the body;
  `mask_address` in the log line; `login_secure` for the four `password_origin` × passkey cases;
  `mark_verified_by_hand` through `manage.py verify-email` (subprocess); `mail-test` against the
  stack's file sink (subprocess, `MAIL_SINK_DIR`) writes a file and prints the Gmail line.
- ☑ `tests/test_admin.py` +2: `mail-status` for a site admin, 403 for an owner; `email_state` in
  the rows.
- ☑ `tests/test_auth_gate.py` walks the new routes unchanged (the audit is the proof that
  `/auth/email/verify` is listed and the two others are not).
- ☑ `make test`, `make lint`, `make gen-types` committed with `schema.d.ts`; `npm run check` green
  (the fixture edit).
- ☑ The stack (8272/8282, the recipe): `PUT /auth/email` → `Mail sent to r***@example.test (verify)`
  in the log, a `.eml` in the sink, `mail_sink_link.py` prints the URL, `POST /auth/email/verify`
  with its token → 200, `/me` → `email_verified: true`; the log contains neither the token nor the
  body (`grep -c` → 0 for both).
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §6 (the four endpoints, the refusals verbatim, the limits, the public path,
`MeOut`'s five fields and that the frontend never re-derives them), §8 (`mail-test`, `verify-email`,
`mail_sink_link.py`); `DESIGN.md` §5b: *That email address is used by another account*, *That does
not look like an email address*, *Could not send the email — try again in a moment*.

**Deviations.**
- **One file outside E1's set: `services/reset_links.py`.** The spec builds the verification URL
  from `reset_links.link_origin(request)`, but the function still lived in `routers/admin.py` and
  the table gives the move to E2. It is moved **now** (verbatim, docstring widened to "a link the
  app hands out"), and `routers/admin.py` imports it from the service — so `routers/auth.py` never
  imports a router. **E2 has nothing left to move**; it adds `recovery_url` beside it.
- **One more test file outside the set: `frontend/src/test/adminPage.test.tsx`** — its `account()`
  fixture gained `email_state: "none", login_secure: true`, the two required `AdminAccountOut`
  fields, or `tsc` fails. Nothing else in the file was touched; E4 owns it from here.
- **`types.ts`**: `EmailStatus`, `EmailVerified`, `MailStatus`, and one narrowing the plan did not
  spell — `EmailState = "none" | "pending" | "verified"`, applied inside `AdminAccount`'s existing
  `Omit` exactly as `password_origin` is (the wire type is `string`). `authFixtures.sessionFixture`
  carries the plan's five defaults verbatim (`email_verified: false`, `email_available: true`,
  `login_secure: true`) — note for E4: under the new strip condition those defaults mean
  *needsEmail*, so a strip-free test has to say `email_verified: true` or `email_available: false`.
- **Sending from a sync handler, not `send_off_loop`.** The four routes are `def` handlers like
  every other auth route (their DB work must not run on the event loop), and FastAPI already runs
  a `def` handler in the threadpool — so the blocking `transport.send` is called directly there,
  after `s.commit()`, and never touches the loop. `send_off_loop` stays the one wrapper for an
  **async** caller; E1 has none. The order in `_mint_and_send` is the L16 rule to the letter:
  sweep + mint + flush, build the `MailMessage` from plain strings, **commit**, then send; only
  after the send is the session read again (for the answer). Background notices
  (`BackgroundTasks`) close over a built `MailMessage` and the transport, never the session or the
  request; a failing notice is logged (masked recipient, kind, exception class) and swallowed.
- **Counting.** `PUT /auth/email` and `/resend` count every call that reaches the send (as
  specified) **and** every refused address (400 not-an-address, 409 taken) — the 409 is a member's
  oracle, so it is throttled with the sends. The account's own verified address (200, nothing
  sent) and `MAIL_OFF` do not count. Verify is `_counted` under `reset` (10 / h per IP, measured:
  the 11th bad token is a 429).
- **Decided where the spec was silent, each pinned by a test:** (1) `PUT` with the account's own
  verified address (any case) answers 200, sends nothing, **and gives up a pending change** (its
  link stops working) — "set it back to what it was" means exactly that. (2) A change of *case*
  only is not a change: no send, no notice. (3) The re-check at verify looks at **verified**
  addresses only (`email_taken_reason(include_pending=False)`) — counting the other account's
  pending row would let two pending claims block each other for 24 h; the first tap wins, the
  second is the generic 400. It runs *before* the conditional `UPDATE`, so a lost race does not
  spend the loser's token (and the unique index on `email_key` is the backstop — with the check
  mutated away the race test fails on it). (4) `DELETE /auth/email` also deletes a pending
  address; with only a pending one there is no verified address to tell, so no notice.
  (5) `resend` re-runs `ensure_email_free` on the pending address (someone may have verified it
  meanwhile). (6) `/resend` on a server with mail off is the same 409 `MAIL_OFF` as `PUT`.
- **`services/account_email.py`** has everything item 1 lists plus four small helpers the routes
  and the admin page needed, all in the module that owns the tables: `email_taken_reason` (the
  logged reason behind `ensure_email_free`'s 409), `discard_verification` (the 502's cleanup),
  `cancel_pending`, `pending_email_for`, and `email_states(s)` — the admin page's one query pair
  (live-verification player ids, then `AccountEmail` player ids; verified wins). The refusal
  strings `SEND_FAILED` and `NOTHING_TO_SEND` live there beside the four the spec named.
- **`me_payload(s, claims, *, email_available)`** — the keyword is **required**, so a caller cannot
  forget it; `routers/auth.py::_me(request, s, claims)` is the one wrapper (4 call sites + E2's),
  `routers/me.py` passes it directly. `login_secure` is computed in `me_payload` and, the same
  rule, in `_account_rows`.
- **`mail_texts.py`**: `test_message` carries `__test__ = False` — pytest would otherwise collect
  it from any test module that imports it by name. The changed notice says "changed or removed",
  because it serves both routes.
- **`manage.py`**: `mail-test` and `verify-email` both take `--secrets`/`--db-url` after the
  subcommand (`_hatch`). `mail-test` needs no database; with `--host` it builds the settings with
  `dataclasses.replace` and runs `assert_auth_config_safe` on them, so on this box (development)
  it is refused before anything connects — measured in a test, the piped password appearing 0
  times in stdout+stderr; `--host` without `--user` is the half-configured refusal naming
  `smtp_user`. It prints `Mail: <description>` first. Tested only against the file sink
  (`MAIL_SINK_DIR`) and the off transport — **no test, and nothing in this task, ever built an
  `SmtpTransport` against a real host.** `verify-email` sends nothing (not even the changed notice
  when it replaces an address — it says so in its one line) and refuses an address verified *or
  pending* on another account.
- **`scripts/mail_sink_link.py`**: standard library only; `--to` and `--all` as specified, a
  message with no link prints `-` (the changed notice), exit 1 on an empty directory or no match.
- **Proven, not asserted** (mutations, each restored and byte-compared): logging the URL, logging
  the body, or logging the unmasked address in the route → `test_no_token_and_no_body_ever_reaches_a_log`
  fails each time; dropping `discard_verification` → the 502 test fails; dropping the verify-time
  re-check → the race test fails.
- **The stack (8272, backend only — E1 has no UI; vite not started).** Dev DB copy in the session
  scratchpad, `pushsubscription` / `pushsubscriptionpreference` emptied first (0 / 0), no VAPID,
  no `smtp_*` key, `MAIL_SINK_DIR` set. Boot: `Auth migrated: 3 accounts, 1 group, 6 memberships …`,
  `Cups imported: 2`, **`Mail: file sink at …/e1/mail (never delivers)`**, `SMTP via` **0** times.
  Login as Roli → `login_secure: false, email_available: true`; `PUT /auth/email` →
  `{email: null, email_pending: "roli@example.test"}`, log `Mail to r***@example.test (verify)
  written to …-1.eml`; `mail_sink_link.py` → `http://localhost:8282/g/altherren/verify-email#…`;
  **`GET /auth/email/verify?token=…` → 405** and nothing verified; `POST` with the token → 200
  `{ok, email}`, again → 400 "That link is not valid"; `/me` → `email_verified: true`;
  `/admin/mail-status` → `{configured: true, description: "file sink at … (never delivers)"}`;
  `/admin/accounts` → Roli `verified`, the other five `none`. Then a change (verify → the old
  address got the `changed` notice) and `DELETE` (the new one got it); `--all` lists the four
  messages, both notices with no link. **Log grep:** each real token 0 hits — the one hit is the
  uvicorn access line of my own deliberate `GET ?token=` probe, a URL the app never builds (its
  links carry the token in the fragment); every body line of all four messages **0** hits; each
  full address **0** hits (only `r***@example.test`). Stack stopped by exact PID, work dir removed.
- **Gates.** `make test` **640 passed** in 31:45 (baseline 586 at `37563af`; +54 = 51
  `test_account_email` + 2 `test_admin` + 1 `test_rate_limit`); `make lint` clean;
  `test_auth_gate.py` unchanged and green (it walks `PUT/DELETE /auth/email`, `POST
  /auth/email/resend` as account paths and `POST /auth/email/verify` as public, and checks the
  tuple entry names a real route); `make gen-types` → `schema.d.ts` +295 lines, committed here;
  `cd frontend && npm run check` **932 tests in 96 files** (unchanged count), `npm run build` green.

## E2 — Recovery by email; a passkey from a reset token; the atomic passkey-only registration  ☑

**The gap.** `/auth/reset` sets a password only; nothing mints a reset token from an address;
`/auth/register` needs a password; `verify_registration` verifies and stores in one breath, so
nothing can verify a ceremony and *then* decide whether to keep it.

**Verify first.**
```bash
grep -n "/recover\|reset/passkey\|register/passkey" backend/app/routers/auth.py   # → 0
grep -n "def new_registration_options\|def take_registration_intent" backend/app/services/passkeys.py   # → 0
grep -n "def link_origin" backend/app/routers/admin.py                               # → 1 (moves)
```

**The change.**
1. **`services/reset_links.py`** — `link_origin(request)` moves here from `routers/admin.py`
   verbatim (the router imports it back; a router must not import a router); `RECOVERY_LOG_ORIGIN
   = "email"`. Nothing else changes: recovery mints through `create_reset(s, player_id=…,
   created_by=None)` and the URL is `reset_url(...)`.
2. **`services/rate_limit.py`** — `LIMITS["recover"] = ((3, 3600), (5, 3600), (30, 3600))`; the
   per-address slot is `limits_for("recover", ip=…, account=email_key)`.
3. **`routers/auth.py`** — `POST /auth/recover {email}` → `OkResponse` (**public**): `enforce`,
   then **hit every key** (never `record_success`), then `validate_email` (a 400 for nonsense is not
   an oracle — it names the string, not an account), `account_by_verified_email`; when found:
   `create_reset(created_by=None)`, **commit**, `background.add_task(send_recovery, transport,
   recovery_message(to=…, name=player.display_name, url=reset_url(link_origin(request), token)))`
   where `send_recovery` calls `transport.send` and logs `Mail to … failed` on `MailSendError` /
   `MailNotConfigured`; when not found: log `Recovery requested for an unknown address` (the masked
   address) and nothing else. Always `{"ok": true}`. The token's log line says
   `Reset link <id> minted by email recovery for player <pid>`.
4. **`services/passkeys.py`** — split, without changing the logged-in path's behaviour:
   `_verified_registration(rp, parsed, client_data) -> VerifiedRegistration` (the library call, the
   `PasskeyRefused` mapping) and `_store_passkey(s, account, parsed, verified, *, label,
   user_agent_label) -> Passkey` (the conflict check, the row, `add` + `flush`, **no commit**);
   `verify_registration` becomes parse → `_take_challenge` → `_verified_registration` →
   `_store_passkey` → `commit` (its tests stay green unchanged). New: `new_registration_options(s,
   rp, *, invite_id, display_name) -> dict` (a `WebAuthnChallenge(kind="register-new",
   player_id=None)`, a `RegistrationIntent` with a fresh `new_webauthn_user_handle()`,
   `generate_registration_options(user_id=handle, user_name=display_name, …REQUIRED…)`, commit),
   `take_registration_intent(s, credential) -> tuple[RegistrationIntent, parsed, client_data]`
   (parse; the intent by `WebAuthnChallenge.challenge == bytes_to_base64url(client_data.challenge)`
   joined on `challenge_id`; `_take_challenge(kind="register-new", player_id=None)`; the intent row
   deleted in that same commit; a credential whose challenge has no intent → `PasskeyRefused`);
   `sweep_expired_challenges` deletes intents whose challenge is expired or gone before it deletes
   challenges. `_take_challenge`'s `wrong_owner` rule is untouched (it applies to `"register"`
   only).
5. **`services/accounts.py::register_with_passkey(s, *, intent, rp, parsed, client_data, verified,
   label, user_agent_label) -> Player`** — step 3 of §7 in one transaction that the router commits
   together with the session: `find_live_invite` by `intent.invite_id` (the generic 400 when spent
   meanwhile), `validate_display_name` + `ensure_name_free(intent.display_name)`, `Player`,
   `create_account_for(password_hash=None, password_origin="none")` **with
   `webauthn_user_handle=intent.user_handle`** (give `create_account_for` a `user_handle: str | None`
   keyword; `None` keeps minting one), `_store_passkey`, `GroupMembership(member)`, `spend_invite`.
   No `commit` inside.
6. **`routers/auth.py`** — `POST /auth/register/passkey/options {code, display_name}` (public,
   family `redeem`, the mint counts): the relying party (400 `PASSKEY_ORIGIN_REFUSED` when refused —
   the caller holds a code, so naming it leaks nothing), `find_live_invite`, `validate_display_name`,
   `ensure_name_free`, `sweep_expired_challenges`, `new_registration_options`. `POST
   /auth/register/passkey/verify {credential, label?}` (public, family `redeem`):
   `take_registration_intent` → `_verified_registration` → `register_with_passkey` → `_start_session(kind="register")` (which commits) → `MeOut`;
   `PasskeyRefused` → 400 `PASSKEY_REGISTER_REFUSED`, `PasskeyConflict` → 409. `POST
   /auth/reset/passkey/options {token}` (public, family `reset`): `find_live_reset` (spends
   nothing), the account and player, `registration_options(s, account, player, rp)` — the existing
   `kind="register"` challenge bound to that player. `POST /auth/reset/passkey/verify {token,
   credential, label?}` (public, family `reset`), **in this order**: `find_live_reset` → parse →
   `_take_challenge(kind="register", player_id=account.player_id)` → `_verified_registration` →
   `consume_reset` (the conditional spend — a token that lost a race refuses *here*, with no
   credential stored) → `_store_passkey` → `revoke_all_sessions(player_id)` → `_start_session(kind="reset")` → `MeOut`. A
   cancelled sheet never reaches the server; a ceremony that fails verification spends the
   challenge and **not** the token, so the person may try again or use the password half.
7. **`auth_gate.PUBLIC_PATHS`** += the four paths.
8. **Schemas** — requests: `RecoverBody{email}`, `ResetPasskeyOptionsBody{token}`,
   `ResetPasskeyVerifyBody{token, credential, label}`, `RegisterPasskeyOptionsBody{code,
   display_name}`, `RegisterPasskeyVerifyBody{credential, label}`; no response model changes
   expected (`OkResponse`, `MeOut`, options as a plain object). `make gen-types` regardless.

**Definition of done.**
- ☑ `tests/test_recovery.py` (≈14): a verified address → 200, one `PasswordResetToken` with
  `created_by NULL`, a captured message whose body holds `…/g/altherren/reset#<token>` and the
  one-hour sentence; that token to `POST /auth/reset` with a 15-char password → 200, the other
  session 401, the same token 400; an unknown address → 200, **no** token, **no** message, the
  response bodies byte-identical; a pending (unverified) address → 200 and nothing sent; the 4th
  request for one address → 429 while another address still answers 200; `mail_off` → 200, nothing
  sent, one log line; a fresh request voids the previous link (kept, tested, and named in
  Deviations as the disagreement-4 cost); the sender's `MailSendError` after the response is logged
  and the endpoint still answered 200 (a capture transport that raises); `caplog` holds no token.
- ☑ `tests/test_passkey_tokens.py` (≈22): the eight proofs of §7 (a)–(h) for the passkey-only
  registration, with the row counts of `player`, `account`, `passkey`, `groupmembership`,
  `authsession` asserted equal before and after every refusal and the invite's `redeemed_at` NULL;
  the reset-with-passkey happy path (a passkey stored, the token used, other sessions ended, a
  session `kind="reset"`, `/me` `has_passkey`); a cancelled ceremony leaves the token live (the
  options call alone, then `POST /auth/reset` with a password succeeds); a bad signature spends the
  challenge and not the token; a token used by a concurrent password reset → 400 and **no passkey
  row**; the same token twice; every negative L8's soft authenticator can build (origin, rpId, UV
  clear) on both new pairs; the gate audit lists the four paths.
- ☑ **Every negative proven to bite**, L8's way: a throwaway plugin that weakens one check per run
  (store the passkey before `consume_reset`; skip the re-`find_live_invite`; skip
  `ensure_name_free` on verify; take the handle from the client; keep the intent after the take;
  count nothing on `/auth/recover`; send for an unknown address; call `record_success`) and the
  test guarding each one **fails** — the list and the results in Deviations.
- ☑ `make test`, `make lint`, `make gen-types` committed. `test_passkeys.py` unchanged in outcome
  (30 passed) after the split.
- ☑ The stack (8273/8283): `POST /auth/recover` for Roli's verified address (set through E1's
  endpoint and verified from the sink) → a `.eml` with the reset link; the soft-authenticator
  driver of L8's Deviations, adapted: `reset/passkey/options {token}` → `create` →
  `reset/passkey/verify` → 200 with `has_passkey`; a fresh code from `manage.py invite` →
  `register/passkey/options` → `create` → `register/passkey/verify` → 200, `/me` a member with no
  password; then the new credential signs in through `login/verify`.
- ☑ Deviations filled in.

**Canon.** `AGENTS.md` §6 (the five endpoints and their families, "the reset page is the one token
page", the order inside the reset-passkey verify and why, the atomic registration and its proof),
§5 (`RegistrationIntent`'s life), §10 (a recovery request voids an earlier unused admin link).

**Deviations.**
- **One file outside E2's set, and one thing new and shared: `services/invites.py` gained
  `find_live_invite_by_id`** (with the liveness rule factored into `_ensure_live`, which
  `find_live_invite` now calls too — one rule, two lookups). The verify step of a passkey-only
  registration re-checks the invite its intent names *by id*, and the check has to be the full
  rule: `spend_invite`'s conditional UPDATE alone catches a code spent meanwhile but **not** one
  that expired meanwhile (a test and a sabotage round each prove that). Everything else lives in
  the files the table gives E2.
- **`link_origin` was already in `services/reset_links.py`** (E1 moved it) — nothing moved here;
  `recovery_url` was added beside `reset_url` and is that function under the name of what it
  builds (one token, one consumer, one page). `RECOVERY_LOG_ORIGIN` was not added: the origin of a
  recovery link is the log line's own words (`Reset link <id> minted by email recovery for player
  <pid>; sending to r***@…`).
- **Recovery mints *after* the answer, not before it — the one place this task departs from the
  section's letter, for the section's stated reason.** Item 3 has the handler mint, commit and
  then hand the send to a background task, accepting "one INSERT (~1 ms)". Measured on the stack,
  the difference was **52.8 ms** for a verified address against **8.1 ms** for an unknown one (one
  sample each): the cost is not the INSERT but SQLite's commit — an fsync, tens of milliseconds on
  the Pi — and it sat on the request's clock, which is exactly the timing oracle the plan forbids.
  So `POST /auth/recover` now does only reads before it answers (the limiter, `validate_email`,
  `transport.configured`, `account_by_verified_email`) and the background task
  `_mint_and_send_recovery` opens a short session of its own, re-reads the verified address (gone
  since the answer → nothing sent), mints through `create_reset(created_by=None)`, builds the
  message, **commits, closes, then sends** — the L16 rule, one function later. Measured in-process
  over 30 alternating samples (request arrival to the *last response byte*, inside the ASGI app —
  what the wire can see): **known 3.42 ms / unknown 3.02 ms** median (p90 3.63 / 3.26), the 0.4 ms
  being the one extra `SELECT` (the `Account` behind a key that exists); the whole cycle including
  the background mint+commit+send is 20.1 ms against 3.9 ms, and none of it reaches a client.
  `test_before_the_answer_a_known_and_an_unknown_address_only_read` records the SQL verbs from the
  engine before and after the response for both branches and asserts `before ⊆ {SELECT}` on each,
  `INSERT`+`COMMIT` only after and only for the known one — a structural proof rather than a
  timing assertion that a loaded Pi could flake. Sabotaged back to the section's order, that test
  and `test_the_link_is_sent_after_the_answer_and_after_the_commit` both fail.
- **`PUBLIC_PATHS` gained five entries, not four** — the table's "four public paths" forgot
  `/auth/recover` beside the two pairs: `/auth/recover`, `/auth/reset/passkey/options`,
  `/auth/reset/passkey/verify`, `/auth/register/passkey/options`, `/auth/register/passkey/verify`.
  L2's audit walks all five unchanged and stays green (14 passed); the L2 sabotage pair was
  repeated on this tree — `/auth/recover` removed → the route's own test and the five-paths test
  fail with the gate's 401; a phantom `/auth/recover/phantom` listed → the audit fails.
- **The split, with public names.** The router orders the steps itself on the reset pair, so the
  pieces are exported rather than underscored: `parse_registration(credential)`,
  `take_challenge(s, *, challenge, kind, player_id)` (the old `_take_challenge`, kept as an alias for
  L8's docs), `verified_registration(rp, parsed, client_data)` (the library, pure) and
  `store_passkey(s, account, parsed, verified, *, label, user_agent_label)` (adds and **flushes,
  never commits**); `verify_registration` is those four in a row plus the commit and behaves as
  before — `test_passkeys.py` is untouched and reads **30 passed**. The kinds are constants
  (`KIND_REGISTER`, `KIND_REGISTER_NEW = "register-new"`, `KIND_LOGIN`); `models.py`'s comment
  still says `"register" | "login"` (E0's file — E6's to widen). `register_with_passkey(s, *,
  intent, parsed, verified, label, user_agent_label)` takes neither `rp` nor `client_data`: nothing
  after the verification needs them.
- **An intent dies wherever its challenge dies — inside `take_challenge`, not beside it.** Found by
  the "the two ceremonies cannot answer each other" test: a `register-new` challenge presented to
  the logged-in pair was consumed (wrong kind) and left its intent orphaned until the next sweep.
  Harmless (the lookup joins on the challenge, so an orphan can never be found), but "lives and
  dies with its challenge" belongs in the one function that deletes challenges. `take_registration_intent`
  therefore expunges the row (keeping its values — it is returned detached, the plan's signature)
  and calls `take_challenge`, which deletes intent and challenge in one commit. `sweep_expired_challenges`
  deletes intents whose challenge is expired **or already gone** (`challenge_id NOT IN (live ids)`)
  before the challenges, and returns the challenge count as before.
- **Ordering and counting, as shipped.** Both public *options* endpoints count a successful mint
  (`record_failure` after `_counted`, L8's "a minted challenge is an attempt") — the register pair
  under `redeem`, the reset pair under `reset`, so the 11th mint or bad token from one IP is a 429
  and `POST /auth/register` / `POST /auth/reset` share the bucket. `/auth/recover` counts every
  request before validating the address, so a non-address is 400 *and* counted under its own
  casefolded key. The reset-passkey verify runs `find_live_reset → parse → take_challenge(kind=
  register, player_id=the token's) → verified_registration → consume_reset → store_passkey →
  revoke_all_sessions → _start_session(kind="reset")` with **one commit at the end**, so a 409
  (credential already stored) rolls the spend back and the token stays live, as does an injected
  crash; a relying-party refusal (400 `PASSKEY_ORIGIN_REFUSED`) comes before the take on all four
  new endpoints, so the ceremony is still answerable from the right origin. With mail off,
  `/auth/recover` mints nothing (a link nobody could receive would only void an admin link).
- **Two test premises corrected by running them.** (1) A "credential with a bad signature" does
  not exist for a registration with `attestation: "none"` — there is no signature over the
  attested key, so a client that swaps the key bytes registers a key it holds, the ordinary case;
  what the server refuses is an attestation it cannot **parse**, and that refusal happens before
  the challenge can even be read, so nothing is taken and the well-formed answer to the same
  options still registers (asserted). The "does not verify" negatives are the real ones: wrong
  origin, another site's origin, wrong rpID, UV clear — each consumed, none stored. (2) The
  section's crash injection names `services.sessions.create_session`; the router imports the
  name, so the test patches `app.routers.auth.create_session` and reads the 500 through
  `TestClient(app, raise_server_exceptions=False)`.
- **Every negative proven to bite — 26 rounds, 26 bites** (a throwaway script in the session
  scratchpad edits one anchor per run, runs the guarding test(s), restores the file and
  byte-compares; the four files were `cmp`-identical to their pristine copies after every round):

  | weakened | guarding test(s) | result |
  |---|---|---|
  | `/auth/recover` counts nothing | the 4th-request 429, unknown addresses counted | 2 failed |
  | `record_success` on `/auth/recover` | the 4th-request 429 | 1 failed |
  | send for an unknown address | unknown → nothing; identical answers | 2 failed |
  | send for a *pending* address | pending buys nothing | **silent on the first try** (the background task's own re-read of the *verified* address refused it a second time); with both reads weakened → 1 failed |
  | `{"ok": false}` for an unknown address | identical answers | 1 failed |
  | mint, commit and send before the answer (the section's order) | only reads before the answer; sent after the commit | 2 failed |
  | mint although mail is off | mail off mints nothing | 1 failed |
  | log the URL and the address | no token/URL/body/address in a log | 1 failed |
  | reset verify: `consume_reset` before the ceremony verified | a failed ceremony spends the challenge, not the token | 3 failed (all three knobs) |
  | reset verify: `revoke_all_sessions` skipped | the reset happy path | 1 failed |
  | reset verify: `commit()` after `store_passkey`, before the session | crash before the commit leaves the token live | 1 failed |
  | reset options: mint for any token string | unknown/used/expired tokens mint nothing | 1 failed |
  | reset options: the mint not counted | every mint on the reset pair counts | 1 failed |
  | register options: the mint not counted | every mint counts against `redeem` | 1 failed |
  | register options: the name checked before the code | a taken name is not revealed without a code | 1 failed |
  | `take_challenge`: `wrong_owner = False` | a challenge minted with X's token, posted with Y's | 1 failed |
  | `take_challenge`: keep the intent | the two ceremonies cannot answer each other; the happy path's "no intent left" | 2 failed |
  | `take_registration_intent`: read the intent without taking the challenge | a replayed verify | 1 failed |
  | sweep: intents left behind | the unanswered sheet is swept; an orphaned intent is swept | 2 failed |
  | `require_user_verification=False` | the `uv-clear` case on both pairs | 2 failed |
  | `register_with_passkey`: `s.get(InviteCode)` instead of the liveness re-check | a code expired meanwhile | 1 failed |
  | `register_with_passkey`: `ensure_name_free` skipped | a name taken meanwhile → 409, no rows | 1 failed |
  | `register_with_passkey`: a fresh handle instead of the intent's | the happy path (the new passkey cannot sign in) | 1 failed |
  | `register_with_passkey`: `commit()` after `create_account_for` | crash before the commit leaves no account | 1 failed |
  | `PUBLIC_PATHS` without `/auth/recover` | recover is public; the five paths | 2 failed |
  | `PUBLIC_PATHS` with a phantom | L2's audit | 1 failed |

  The DoD's "store the passkey before `consume_reset`" was **not** run as written, because it
  cannot bite: nothing commits between the two, so a lost spend rolls the store back either way —
  the invariant is the single commit, and the two rounds that draw the boundary one line too
  early (a `commit()` after the store / after the account) are what guard it.
- **Enumeration, measured.** For a verified, an unknown and a pending address the three responses
  are `200`, byte-identical `{"ok":true}`, the same `content-type`, no `Set-Cookie`; one message
  goes out, to the verified address, and one token row exists, for that account. The log names
  only masked addresses (`r***@example.test`, `n***@example.test`); the only 400 names the string
  (*"That does not look like an email address"*). Timing: the paragraph above.
- **Atomicity, proven by row counts.** After each of: wrong origin, another site's origin, wrong
  rpID, UV clear, a corrupted attestation, four malformed bodies, a code spent meanwhile, a code
  expired meanwhile, a name taken meanwhile (409), a replay, an unanswered sheet, an injected crash
  after the passkey row was added and before the commit (500) — `player`, `account`, `passkey`,
  `groupmembership` and `authsession` have the counts they had before, the invite's `redeemed_at`
  is NULL, and the code still registers afterwards. The happy path is one row each, the code spent
  by the new player, a session `kind="register"`, `MeOut` `has_passkey: true, has_password: false,
  password_migrated: false, login_secure: true, email_verified: false`, the stored handle equal to
  the one the authenticator holds (`unb64url(account.webauthn_user_handle) == auth.user_handle`),
  and the credential signs in through `login/verify`; a password login for the name is 401.
- **The stack (backend 8273 only — E2 has no UI, vite not started; the dev DB copied read-only to
  the session scratchpad, `pushsubscription` / `pushsubscriptionpreference` **7 / 7 → 0 / 0** before
  the first boot, no VAPID, no `smtp_*` key, `MAIL_SINK_DIR` set).** Boot: `Auth migrated: 3
  accounts, 1 group, 6 memberships …`, `Cups imported: 2`, `DB initialized`, **`Mail: file sink at
  …/mail (never delivers)`**, `Mail: SMTP` 0 times. Roli's address set through E1's `PUT`
  (`Origin: http://localhost:8283`) and verified from the sink; `POST /auth/recover` → `{"ok":true}`
  and a `.eml` *To roli@example.test, Subject "Get back into Lorbeerkranz"*, the link
  `http://localhost:8283/g/altherren/reset#…` on its own line; an unknown address → the same body
  and no new file; a non-address → 400. **The emailed token** → `reset/passkey/options`
  (`Origin: http://localhost`, `rp.id localhost`, `residentKey required`, `excludeCredentials []`)
  → `SoftAuthenticator.create` → `reset/passkey/verify` → **200** `has_passkey: true,
  has_password: true, login_secure: true` with the cookie; Roli's other session → 401; the same
  token → 400 at options and 400 at the password half; the 4th recovery for that address →
  **429** `retry-after: 3598`. `manage.py reset-link --player berni` → the same pair → 200 as Berni
  → `login/verify` with the new credential → **200 Berni** (label `Unknown device`). `manage.py
  invite --group altherren` → `register/passkey/options {code, "Neuling"}` → `create` →
  `register/passkey/verify` → **200** `Neuling · editor · [altherren:member] · has_password false ·
  has_passkey true · login_secure true · email_verified false`, `/tournaments` 200 on that session;
  the same credential again → 400; `login/verify` → 200 Neuling; a password login → 401; the code
  again by password → 400. The DB afterwards: Neuling `password_hash NULL`, `password_origin none`,
  one passkey, `member`, sessions `register, passkey`; invite 1 redeemed by 7; three reset tokens
  all `created_by NULL` (the emailed one used, the third recovery's live and the second's voided,
  the CLI one used); `registrationintent` 0, `webauthnchallenge` 0. **Log grep:** for all four
  messages, the token **0**, the URL **0**, every body line **0**, the full address **0** — only
  `r***@example.test` (8 times). Stack stopped by exact PID, the work dir removed.
- `services/accounts.py::set_password`'s docstring now says "at least 15 and at most 200"
  (E0's leftover). `_send_quietly`'s log line reads `Mail to r***@x (recover) not sent after the
  answer: MailSendError` — it carries a recovery link now, not only a notice.
- **What E3 / E4 inherit** (the wire is in `schema.d.ts`, committed here — the five routes and five
  bodies, nothing else moved): `POST /auth/recover {email}` → `{ok: true}` always (400 *"That does
  not look like an email address"* is the only other answer; 429 as everywhere); `POST
  /auth/reset/passkey/options {token}` → the creation options JSON (a plain object, as the logged-in
  pair) and `POST /auth/reset/passkey/verify {token, credential, label}` → `MeOut` + the cookie
  (`kind="reset"`); `POST /auth/register/passkey/options {code, display_name}` → the options JSON
  and `POST /auth/register/passkey/verify {credential, label}` → `MeOut` + the cookie
  (`kind="register"`). `label` as a string, `""` for the device's name (never `null`). Refusal texts
  the UI may show verbatim: *"That reset link is not valid"* (every bad token, on both halves),
  *"That code is not valid"* (every bad code — at options, and at verify when it was spent or
  expired meanwhile), *"That name is taken"* (409, at options and at verify), *"The name must be 2
  to 40 characters long"*, *"That passkey could not be registered"* (400, every way a ceremony can
  fail, both pairs), *"That passkey is already registered"* (409 — on the reset pair the token
  stays live), *"Passkeys are not available from this origin"* (400 — hide the passkey half when
  `passkeysSupported()` is false and expect this where the rule refuses). A closed sheet never
  reaches the server and spends nothing on either pair: the client simply does not call verify.
  **E4**: nothing here changes `MeOut`; a passkey-only account answers `login_secure: true` and
  `email_verified: false`, so the strip asks for the email.
- **Gates.** `make test` **705 passed** in 35:57 (baseline 640 at `8371773`; +65 = 26
  `test_recovery` + 39 `test_passkey_tokens`; `test_passkeys.py` 30 passed unchanged; L2's audit
  walks the five new paths and stays green); `make lint` clean; `make gen-types` → `schema.d.ts`
  +379 lines (the five routes and five request bodies, nothing else), regenerated twice on the
  final tree with the same md5, committed here; `cd frontend && npm run check` **932 tests in 96
  files** (unchanged count — E2 adds no frontend code), `npm run build` green with the bundle
  byte-identical to the baseline (`index-CDhfUzOC.js` 774.28 kB).
- **Canon for E6.** `AGENTS.md` §6: the five endpoints (the recover family `3 / 5 / 30` per hour,
  the mint counting on both public options endpoints), *recovery mints after the answer* and why,
  the order inside the reset-passkey verify and the single commit, `PUBLIC_PATHS` +5; §5:
  `RegistrationIntent` dies inside `take_challenge` and in the sweep (expired *or gone*); §10: a
  recovery request voids an earlier unused admin link; the timing numbers above.

## E3 — Register, reset, recover and verify-email in the browser: passkey first  ☑

**The gap.** `RegisterPage` demands a password; `ResetPage` sets one and nothing else; there is no
`/recover` and no `/verify-email`; the login screen has no way to recovery and no cross-device hint.

**Verify first.**
```bash
grep -n "Create a passkey\|Use a password instead" frontend/src/pages/auth/*.tsx   # → 0
ls frontend/src/pages/auth/RecoverPage.tsx frontend/src/pages/auth/VerifyEmailPage.tsx   # → no such file
grep -n "recover" frontend/src/app/App.tsx                                          # → 0
```

**The change.**
1. **`api/passkeys.api.ts`** — `registerPasskeyForNewAccount({code, display_name, label}):
   Promise<MeResponse | null>` (`POST /auth/register/passkey/options` → `startRegistration` →
   `POST …/verify`; a cancelled sheet → `null`, nothing spent) and
   `registerPasskeyWithResetToken({token, label}): Promise<MeResponse | null>` (the reset pair).
   Still the only importer of `@simplewebauthn/browser`. `label` is sent as `""`, never `null`
   (L9's 422).
2. **`api/registration.api.ts`** — `requestRecovery(email): Promise<{ok: boolean}>`,
   `verifyEmail(token): Promise<EmailVerified>`.
3. **`pages/auth/PasskeyOrPassword.tsx`** (new) — the **one** "choose a credential" block. Props:
   `onPasskey: () => Promise<void>`, `passkeyBusy`, `passkeyDisabled`, `passwordForm: ReactNode`
   (the caller's password fields + its own submit button), `passwordLabel` (default "Use a password
   instead"). Renders: a solid full-width **Create a passkey** (`KeyRound`) then a ghost full-width
   **Use a password instead** (`ChevronDown`); pressing the ghost swaps to `passwordForm` with a
   muted **Create a passkey instead ›** link-button above it (the way back, discarding nothing but
   the choice). Where `passkeysSupported()` is false it renders `passwordForm` alone — no toggle,
   no mention of passkeys. A closed sheet says nothing (L9's rule). The prop shape is the whole
   design: the register page and the reset page hand it their existing forms.
4. **`RegisterPage.tsx`** — `InviteCodeField`, **Display name**, then `PasskeyOrPassword`:
   `onPasskey` calls `registerPasskeyForNewAccount` (disabled until the code has 8 symbols and the
   name is non-empty), the password form is today's `PasswordField` (15) + solid **Register**
   (`UserPlus`). Errors: the server's sentence on the one error line; a 429 → `RetryCountdown`
   under the block. Success either way → `auth.setSession(me)` → `/dashboard`.
5. **`ResetPage.tsx`** — heading inside the card **Set a new login** (`text-lg font-semibold`) and
   a muted line *"This link works once. Using it signs out every other device."*, then
   `PasskeyOrPassword`: `onPasskey` → `registerPasskeyWithResetToken`, the password form is
   today's field + solid **Set password** (`KeyRound`). The token read-once-and-strip logic is
   untouched (the fragment is what the emailed link carries too). The no-token `EmptyState` sentence
   becomes *"This link is not complete — ask for a new one from the login screen or the admin."*
6. **`RecoverPage.tsx`** (new, `/recover`) — `AuthScreen`; heading **Get back in**; muted *"Enter the
   email address on your account."*; `Input type="email" inputMode="email" autoComplete="email"
   autoCapitalize="none"` labelled **Email**; solid full-width **Send me a link** (`Mail`);
   `RetryCountdown`. After a submit (success **or** any error that is not a 429 — the server's
   answer is always the same and so is ours) the form is replaced by the one sentence *"If that
   address is verified, a link is on its way. Check your spam folder too."* (`role="status"`, muted).
   `below`: "Know your password? Log in ›" and, always, the muted *"No verified email on your
   account? Ask the admin for a reset link."*
7. **`VerifyEmailPage.tsx`** (new, `/verify-email`) — `AuthScreen`; reads and strips the fragment
   exactly like `ResetPage` (extract that read-once-and-strip into `pages/auth/useLinkToken.ts` and
   have both pages call it — one mechanism); **a button, not an automatic POST** (a mail scanner
   that runs JavaScript would otherwise burn the link before the person taps it): heading **Confirm
   your email**, solid full-width **Confirm** (`MailCheck`); success → *"Verified. You can close this
   and go back to the app."* plus, when `auth.status === "authed"`, a `Link` **Back to Settings ›**
   to `/settings?tab=account`; failure → the server's sentence; no token → the "not complete" line
   naming Settings → Account as where to ask again.
8. **`LoginPage.tsx`** — under "Use a passkey", one muted `text-xs` line: *"Passkey on your phone,
   logging in on a computer? Choose it in the passkey prompt and scan the code with your phone."*
   (only where the button shows); in `below`, before "New here?": **Lost your passkey or password?
   ›** to `/recover`.
9. **`App.tsx`** — `<Route path="/recover" …>` and `<Route path="/verify-email" …>` beside
   `/login`, `/register`, `/reset` (public, outside `RequireAuth`).

**Definition of done.**
- ☑ `registration.test.tsx` +≈8: the register page shows **Create a passkey** first and swaps to the
  password form and back; unsupported → password form only; a closed sheet on register says
  nothing and spends nothing (no verify request); a passkey success hands `MeOut` to `setSession`;
  the reset page's heading and the same swap; a token consumed by a passkey → dashboard.
- ☑ `recovery.test.tsx` (≈8): the recover page posts the address and shows the one sentence on 200
  **and** on a 500; a 429 → the countdown; the verify-email page strips the fragment before its
  request, does not POST on mount, POSTs on the tap, shows the two success shapes (anonymous /
  authed) and the failure line; the login page's link and hint.
- ☑ Browser, 390 / 1280, `blue` / `light`, against the stack (8274/8284) with the CDP virtual
  authenticator on `http://localhost:8284`: register a new account with a passkey from a `manage.py
  invite` code → `/g/altherren/dashboard`, the strip asks for an email; log out; **Use a passkey** →
  in; `manage.py reset-link` → the reset page → **Create a passkey** → in (`/auth/passkeys` lists
  two); the same page with **Use a password instead** on a fresh link → a 14-character password is
  held by the hint, 15 goes; `/recover` → the sentence, the sink holds the link (Roli's address set
  and verified through E1's endpoint with curl first) → the link → the reset page; `/verify-email`
  from the sink's verify link → Confirm → Verified. No horizontal overflow, `a a` = 0, the card at
  x=16 / w=358 and x=448 / w=384, the numbers written down.
- ☑ `npm run check`, `npm run build` (the chunk size against 774.28 kB).
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: `PasskeyOrPassword` (the one credential choice, its swap, "unsupported →
password only"), the register and reset rows rewritten, `RecoverPage`, `VerifyEmailPage` ("a
button, not an automatic POST", and why), the login hint; §5b: **Create a passkey**, **Use a
password instead**, **Create a passkey instead**, **Set a new login**, **Get back in**, **Send me a
link**, **Confirm**, *If that address is verified, a link is on its way. Check your spam folder too.*

**Deviations.**
- **Two small shared things, both inside `pages/auth/` where the family lives.**
  `formError.ts::passkeyFormErrorText` — the error line of a ceremony that *makes* a passkey: the
  server's sentence verbatim, else "This device could not make a passkey here." for what the
  browser refused (an `InvalidStateError` from an authenticator that already holds this account's
  passkey), else the network line; `formErrorText` would have called a browser refusal "Could not
  reach the server". And `useLinkToken.ts` as the plan said — `ResetPage`'s read-once-and-strip
  moved there verbatim, and `/verify-email` calls it.
- **`passkeys.api.ts`** gained one private `createAndVerify` (options → `startRegistration` →
  `null` on a closed sheet with **no verify request** → verify) under the two new exports; the
  logged-in `registerPasskey` was left exactly as it was (its options POST carries no body, and
  `passkeys.test.tsx` pins it). Still the only importer of `@simplewebauthn/browser`.
- **Register:** **Create a passkey** is held until the code has exactly `CODE_LENGTH` (8) symbols
  and a name is typed; the password path keeps L5's `code.length > 0` (the server's "That code is
  not valid" answers a short one), so no existing behaviour moved. Both pages' `onSubmit` return
  early unless the password is ready — Enter in a field while the passkey half shows submits
  nothing. A 429 from either path is the one `RetryCountdown`, and it holds both buttons.
- **Recover:** `below` carries "Know your password? Log in ›" and the always-there *"No verified
  email on your account? Ask the admin for a reset link."* in `text-xs` (a second muted line under
  the first, not a link). The muted intro line is dropped once the sentence replaces the form, so
  the card reads heading + sentence. A 400 ("That does not look like an email address") also gets
  the sentence, per the spec's "any error that is not a 429"; `type="email"` catches most of those
  before a request.
- **Verify-email:** a `below` "Log in ›" only while anonymous; `/verify-email` with no token
  says *"This link is not complete — ask for a new one in Settings → Account."* A 429 is the
  countdown (the family is `reset`).
- **Tests:** the login-page cases went into `recovery.test.tsx` (as the DoD lists them), so
  **`passkeys.test.tsx` is not touched by E3 at all** — E4 owns every line of it. `registration.test.tsx`
  mocks `@simplewebauthn/browser` with `browserSupportsWebAuthn` **off** by default, so the L5 cases
  run unchanged as the password-only view; the E3 block switches it on. +9 there (23), 12 in
  `recovery.test.tsx`.
- **`PasswordField`'s doc comment** now names the constant (15) — E0's leftover.
- **Gates.** `npm run check` on the combined tree after E4's `877e7db` landed: **green — 975 tests
  in 98 files**, of which E3's share is **953 in 97** (baseline 932 in 96, +21 and one file). (While
  E4 was still in flight, `eslint .` stopped on one error in its uncommitted `emailSection.test.tsx`;
  gone at `877e7db`.) `npm run build` green, `index-*.js` **786.95 kB** — measured on a tree that
  also held E4's code, so it is not E3's delta alone against 774.28.
- **Browser** (Playwright chromium, stack 8274/8284, the dev DB copied outside the repo, push rows
  deleted, no VAPID, no `smtp_*`, `Mail: file sink … (never delivers)`, `SMTP via` 0 times; CDP
  virtual authenticator on `http://localhost:8284`). All flows at 390 / blue:
  **verify** — the sink's link → fragment stripped, **no POST in 1.5 s on load**, one POST on
  Confirm, "Verified…", no Settings link anonymous; **register** — buttons in order *Create a
  passkey*, *Use a password instead*; a `manage.py invite` code + "Neuling" → `/g/altherren/dashboard`,
  `/me` `has_passkey true, has_password false, email_verified false`, and E4's strip reads "Secure
  your account — add an email address."; **log out → Use a passkey** → dashboard, the cross-device
  hint visible under the button, the recovery link → `/recover`; **reset by passkey** —
  `manage.py reset-link --player Neuling` on a second virtual authenticator (the first holds the
  account's passkey, so `excludeCredentials` would refuse it) → *Set a new login*, fragment stripped
  → Create a passkey → dashboard, `/auth/passkeys` lists **2**; **reset by password** on a fresh
  Berni link — 14 characters: Set password disabled and the hint `unmet`, 15+: enabled → in as
  Berni; **recover** — an unknown and a known address get the identical sentence, the sink went
  1 → 2 (only the known address got mail), its `/g/altherren/reset#…` link → Use a password
  instead → in as Roli; **password-only** — on `http://192.168.178.78:8284` (`isSecureContext`
  false) register shows the password field and the word "passkey" nowhere, reset shows the password
  form alone, login has no passkey button and no hint and keeps the recovery link.
  **Layout**, 390 / 1280 × blue / light, seven views (login, register, register·password, reset,
  reset·password, recover, verify-email): the card at **x=16 w=358** and **x=448 w=384** in every
  one, no horizontal overflow, `a a` = 0. Card heights (identical across themes): login 323 at 390
  (307 at 1280 — the hint wraps to three lines vs two), register 250 → 328 with the password form,
  reset 194 → 272, recover 196, verify-email 102. Stack stopped by exact PID (vite, its esbuild
  child, the backend), the work dir removed.
- **For E4/E5:** the strip already appears after a passkey-only registration (above). E5's walk
  can reuse the second-authenticator trick for "reset by passkey on an account that has one". The
  device label the server stores for these ceremonies read `Linux · Safari` under headless
  Chromium — the server's user-agent parse, not the page (label is sent as `""`); worth a look by
  whoever owns `user_agent_label`, not E3's.

## E4 — Settings → Email; the strip's two steps; the passkey hint; the admin page's email state and mail status  ☑

**The gap.** Settings → Account has no email; the strip shows for "migrated and no passkey" and
hides where WebAuthn is missing; the admin page cannot say who has no email or whether the server
can send.

**Verify first.**
```bash
grep -n "Email" frontend/src/pages/settings/SecuritySection.tsx        # → 0
grep -n "emailVerified\|loginSecure" frontend/src/ui/shell/SecureAccountNotice.tsx   # → 0
grep -n "mail-status\|email_state" frontend/src/pages/admin/AccountsTab.tsx           # → 0
```

**The change.**
1. **`auth/AuthContext.ts` + `AuthProvider.tsx`** — `AuthState` gains `email: string | null`,
   `emailPending: string | null`, `emailVerified`, `emailAvailable`, `loginSecure` (booleans), each
   read off `MeResponse` where `hasPassword` is; nothing else in the provider moves.
2. **`hooks/useRefreshMeOnReturn.ts`** (new) — `useRefreshMeOnReturn(enabled: boolean)`: while
   enabled, `visibilitychange` → `visible` and `focus` call `useAuth().refresh()` (debounced to one
   call per 2 s). The verification link opens in Safari, not in the PWA, so the PWA learns
   `email_verified` only by asking again; the Email section enables it while an address is pending,
   the strip while it is shown.
3. **`api/account.api.ts`** — `setEmail(email)`, `resendEmail()`, `removeEmail()` (each
   `EmailStatus`); **`api/admin.api.ts`** — `mailStatus(): Promise<MailStatus>`; `qk.admin.mailStatus()`
   (under the `["admin"]` prefix — no cache-policy row needed, the test guards namespaces only).
4. **`pages/settings/EmailSection.tsx`** (new) — a `SettingsSection` titled **Email**, rendered by
   `SecuritySection` **after Password and before Groups**. Four states off `useAuth()`:
   - `!emailAvailable` → one muted line *"Email is not set up on this server. If you get locked out,
     ask the admin for a reset link."* and nothing else.
   - none → muted *"A verified email lets you get back in if you lose your passkey or forget your
     password."*, `Input type="email"` labelled **Email**, solid full-width **Send verification
     link** (`Mail`), the error line (`formErrorText`), `RetryCountdown`.
   - pending → a `ListRow` with the pending address and a `pill-default` **pending**; muted
     *"Open the link we sent to confirm it — on any device. Check your spam folder too."*; ghost
     **Send again** (`RefreshCw`, the 429 → countdown) and ghost **Change** (shows the field);
     `useRefreshMeOnReturn(true)`. When a *verified* address also exists it stays listed above with
     its **verified** pill — the change is pending, the old one still works.
   - verified → the row with a `pill-default` **verified**; ghost **Change**; a muted full-width
     ghost **Remove email** → `ConfirmDialog` **with** the red block (a stored address is deleted):
     title "Remove your email address?", body *"You will not be able to get back in by email until
     you verify a new one."*, verb **Remove email**.
   After `setEmail` / `resendEmail` / `removeEmail`: `refresh()` (L7's rule, never `setSession`);
   the success line *"Verification link sent to <addr>."* / *"Email removed."*.
5. **`SecuritySection.tsx`** — renders `EmailSection`; under the passkey list (only when
   `passkeysSupported()`), one muted `text-xs` line: *"Logging in on another device? Choose your
   passkey there and scan the code with this phone — or add a password below."*; the Password
   block's migrated line becomes *"This is the password you were given — change it (15 characters or
   more), or add a passkey."* and shows while `passwordMigrated && hasPassword && !hasPasskey`
   (unchanged condition).
6. **`ui/shell/SecureAccountNotice.tsx`** — §6's condition and table, verbatim; `useRefreshMeOnReturn`
   while shown. The `passkeysSupported()` answer chooses the wording, never the visibility.
7. **`pages/admin/AccountsTab.tsx`** — the `ChipGroup` becomes **All** / **Logged in** / **Not
   secured** (`!a.login_secure || (emailAvailable && a.email_state !== "verified")`, `emailAvailable`
   from `useAuth()` so an owner can compute it too); the subtitle leads with `migrated password`
   (warn) or `no login` as today, then — only while `emailAvailable` — `no email` / `email pending`
   (muted), then the device count and last seen. For a site admin, one line above the list from
   `mailStatus()`: muted *"Email: <description>"* when configured, `text-warn` *"Email is not set up
   on this server — recovery by email is off."* when not (a `warn`: nothing failed).

**Definition of done.**
- ☑ `emailSection.test.tsx` (≈10): the four states; a 409 verbatim; a 429 → countdown; a 502 →
  the sentence; the pending state's `refresh()` on `visibilitychange`; the verified row's red-block
  dialog; `!emailAvailable` → the line and no form.
- ☑ `passkeys.test.tsx` (the strip `describe`) rewritten: the five sentences and buttons of §6's
  table, the `!emailAvailable` case, hidden when both are met, hidden on the account tab,
  **shown where WebAuthn is unsupported** with the password wording.
- ☑ `adminPage.test.tsx` +3: the chip, the two subtitle words, the two status lines;
  `securitySection.test.tsx` +1: the hint line only when supported.
- ☑ Browser, 390 / 1280, `blue` / `light`, stack 8275/8285: as Berni (migrated) the strip reads
  "add an email address and a passkey" (`localhost`, supported); add a passkey → "add an email
  address"; set an email → the pending row → the sink's link in a **second context** (Safari's jar)
  → Confirm → back to the first context → `visibilitychange` → the strip is gone and the row says
  **verified**; Remove email → the strip returns with "add an email address". On the phone-shaped
  run with `browserSupportsWebAuthn` stubbed false the strip says "set a new password". The strip's
  height and the tab strip offset written down against L9's 66 / 58 and +78 / +70 (two-line
  sentences will be taller — measure, do not assume). Admin: the chip and the lines.
- ☑ `npm run check`, `npm run build`.
- ☑ Deviations filled in.

**Canon.** `DESIGN.md` §7: the `SecureAccountNotice` row **rewritten** with §6's condition and table
(this closes `AGENTS.md` §11's open item); the "My account" row gains **Email** (its four states) and
the passkey hint; the admin row's chip and subtitle words; §5b: **Email**, **verified**, **pending**,
**Send verification link**, **Send again**, **Change**, **Remove email**, **Not secured**.

**Deviations.**
- **Nothing new and shared.** The one new module is the one the plan names
  (`hooks/useRefreshMeOnReturn.ts`); `EmailSection` imports E3's `pages/auth/formError.ts::formErrorText`
  read-only (the plan's own name for the error line) and `RetryCountdown` as `SecuritySection` does.
- **`AuthProvider`: a cached `/me` from before E1 lacks the five fields**, so they default to
  *no email step* (`emailAvailable: false`) and *secure* (`loginSecure: true`) until the boot's own
  `/me` answers a moment later — the strip never flashes an ask it cannot justify.
- **The strip's condition and table are §6's, verbatim** — six rows in the test, because "the email"
  reads the same with and without WebAuthn. `useRefreshMeOnReturn(shown)`; `passkeysSupported()`
  chooses the words only (the L9 `!supported → null` is gone, so an unsupported device **is** asked,
  with "set a new password").
- **`EmailSection`, three small things the spec did not spell:** (1) **Change** is a toggle with a
  chevron and `aria-expanded`, the Password block's idiom — the way out is the way in and discards the
  draft; its accessible name is **"Change email"** (visible text "Change"), because "Change password"
  sits one card above and a role query — or a screen reader — could not tell them apart (found by the
  browser walk's strict-mode locator). (2) The success line *"Verification link sent to <addr>."* shows
  **only while that address is still pending** — measured in the walk, it otherwise sat under the
  **verified** row after the return refresh, stale. (3) **Remove email** is offered whenever a verified
  address exists, including during a pending change (`DELETE` removes both; the red block says what is
  lost). A pending address with no verified one has no Remove — **Change** replaces it.
- **The passkey hint** sits under the passkey list, above the add form, only when `passkeysSupported()`.
  The migrated line reads its number from `MIN_PASSWORD_LENGTH`, not a literal.
- **Admin:** the filter key is `unsecured` (label **Not secured**, empty state *"Every account is
  secured."*); `notSecured(a, emailAvailable)` is written once in `AccountsTab` and is the same two steps
  as the strip, read off the server's `login_secure` / `email_state`. `mailStatus()` is
  `enabled: siteAdmin`, so an owner never asks (measured: **0** requests to `/admin/mail-status` as the
  owner, in all eight runs). The test fixture's `ACCOUNTS` gained `login_secure: false` on the two rows
  that are not (Flo migrated, Rumpi no login) — they had inherited E1's `true` default.
- **The E1 fixture trap** did not bite outside `passkeys.test.tsx`: no other test mounts the strip
  (`AppShell` is not rendered by any test). The strip's describe sets its inputs explicitly in
  `beforeEach` and resets them in `afterEach`; the shared hoisted `auth` mock gained
  `emailAvailable: false, emailVerified: false, loginSecure: true` (strip-free by default), and nothing in
  E3's login-page cases changed.
- **Browser** (stack 8275/8285, dev DB copy in the session scratchpad, `pushsubscription` /
  `pushsubscriptionpreference` 0 / 0 before the first boot, no VAPID, no `smtp_*`, boot log
  `Mail: file sink at …/mail (never delivers)`, `SMTP via` **0**; the DB restored from a post-migration
  copy between runs; Chromium + CDP virtual authenticator on `http://localhost:8285`). **Mail on**, all
  four of 390 / 1280 × `blue` / `light`, every expectation passed: Berni (migrated) → *"…add an email
  address and a passkey."* / **Secure account**; Settings → Account has no strip, the order is Devices ·
  Passkeys · Password · **Email** · Groups; **Add a passkey** (real ceremony) → *"…add an email
  address."* / **Add email**; set an email → the **pending** row; the sink's link verified by `POST
  /auth/email/verify` from a **second, cookie-less context** (200) → `visibilitychange` in the first →
  the row reads **verified** with no reload; dashboard → **no strip**; **Remove email** (red block) →
  *"Email removed."* → the strip returns with *"…add an email address."*; set again, stay on the
  dashboard, verify in the second context, `visibilitychange` → **the strip is gone** (the strip's own
  return-refresh); `/reset` while logged in → no strip; Flo with `PublicKeyCredential` deleted →
  *"…add an email address and set a new password."* / **Secure account**, and no passkey hint.
  **Mail off** (backend restarted without `MAIL_SINK_DIR` → `Mail: off …`), all four combos: Berni →
  *"Secure your account — add a passkey."* (no email step anywhere), the Email card is the one line
  and no form; the admin line is `text-warn` *"Email is not set up on this server — recovery by email
  is off."*, and no subtitle says `no email`.
  **Measured:** the strip is **358×86 at 390** for the two-line sentences (both-missing, either
  wording) and **358×66** for the one-line ones (*add an email address*, *add a passkey*); **992×58 at
  1280** for every sentence. The tab strip (`/settings?tab=appearance`) moves **+98px at 390** for an
  86px strip (171 → 73) and **+70 at 1280** (142 → 72) — against L9's 66 / +78, the one-line case is
  unchanged and the two-line case is 20px taller. **Q13 holds:** the top bar's title centre is **195.0**
  with the strip and without it, in both themes. The tone survives `light` (`rgba(146, 64, 14, 0.1)`,
  blue `rgba(251, 191, 36, 0.1)` — a `.card`, not an `.inset`). The Email card at 390: none 204px,
  pending 222, verified 202–226 (with / without the stale line, now removed), verified + pending 318
  (blue, with the sent line) / 294 (light, without), off 90. **Admin as Roli (site admin):** the chips
  **All · Logged in · Not secured**, the muted *"Email: file sink at … (never delivers)"*, subtitles
  `migrated password · no email · …`, `no login · no email · …`, Berni (passkey + verified) `1 device ·
  last seen …` alone; **Not secured** lists everyone but Berni. **As the owner** (Flo, promoted for the
  walk): the list and chips, no status line, no request.
- **Gates.** `cd frontend && npm run check` **975 tests in 98 files** — that count includes E3's
  in-flight files in the shared tree; **E4's own share is +22 tests and +1 file** (`emailSection` 11,
  the strip describe 3 → 10, `adminPage` +3, `securitySection` +1), i.e. 954 in 97 over the 932 / 96
  baseline. `npm run build` green (`index-*.js` 786.99 kB with E3's in-flight code, the pre-existing
  >500 kB hint).
- **For E5:** the walk above is the shape of the rehearsal's email step — a cookie-less second context
  posting the sink's token, then `visibilitychange` in the first; wait **> 2 s** between two returns
  in one mount, the hook's debounce. The verify link's page is E3's; this walk posted the token to the
  API directly rather than depending on an in-flight page.
- **Canon for E6** (`DESIGN.md` §7 / §5b, as the section says): the strip row's condition is the
  JSDoc block at the top of `SecureAccountNotice.tsx`, with the measured heights above; the "My account"
  row gains **Email** in five groups' order, the passkey hint, the migrated line's "(15 characters or
  more)"; the admin row's **Not secured**, `no email` / `email pending` (only while mail is on), and the
  status line. §5b adds **Change email** as the accessible name of Email's **Change**.

## E5 — The rehearsal learns email and the two new ceremonies; the browser walk  ☐

**The gap.** `scripts/auth_rehearsal.sh` boots the new code without a mail sink, walks no email
step, registers no passkey-only account, and its production-environment boot does not prove the
guard refuses a sink.

**Verify first.**
```bash
grep -n "MAIL_SINK_DIR\|checks email" scripts/auth_rehearsal.sh   # → 0
ls scripts/email_e2e.mjs                                           # → no such file
```

**The change.**
1. **`scripts/auth_rehearsal.sh`** — step 0: `mkdir -p "$WORK/mail"`; `start_backend` for the **new**
   code adds `MAIL_SINK_DIR="$WORK/mail"` (the old code ignores it; step 7's production boot is run
   **twice**: once with the sink → must refuse with `AuthConfigError` naming `MAIL_SINK_DIR`, once
   without → boots and logs `Mail: off`); step 3 asserts the boot log's `Mail: file sink at …` line
   and calls `checks email`; step 4 (rollback) counts `accountemail`, `emailverification`,
   `registrationintent` before and after — untouched; step 5 (roll forward) asserts the verified
   email and the passkey-only account survive; step 6 runs `manage.py verify-email` and `mail-test`
   against the sink; the browser steps run `email_e2e.mjs`. The final line's PASS count is written
   into Deviations against L13's 131.
2. **`scripts/auth_rehearsal_checks.py`** — `cmd_email(a)`: `PUT /auth/email` for the admin →
   the sink's newest file holds the fragment URL and no second link; `POST /auth/email/verify` →
   `/me` verified; `POST /auth/recover` → a second file → `POST /auth/reset` with a 15-character
   password → 200 and the earlier session 401; recover for `nobody@example.test` → 200 and **no new
   file**; the 4th recover for one address → 429; a `grep` of the new-code logs for both tokens →
   0; `manage.py verify-email --player <other> --email …` → `/admin/accounts` shows `verified`;
   `manage.py mail-test --to x@example.test` → exit 0 and one more file.
3. **`scripts/email_e2e.mjs`** (new; `passkey_e2e.mjs`'s shape, `PLAYWRIGHT=…`, CDP virtual
   authenticator, `--base http://localhost:<V>`): `register` — a code from `manage.py invite`, the
   register page, **Create a passkey**, the dashboard, the strip's email sentence, `/me` with no
   password; `recover` — read the reset link from `--sink`, the reset page, **Create a passkey**, in,
   the passkey list; `verify` — the verify link from the sink in a fresh context, **Confirm**, the
   first context's strip gone after a `visibilitychange`.

**Definition of done.**
- ☐ The rehearsal against the latest deploy snapshot (`backup/deploy/<ts>`, `kind: deploy`, read-only,
  `find backup -newer … | wc -l` → 0) ends `ALL PASSED`, twice, with identical PASS/FAIL lines once
  masked; the report in Deviations.
- ☐ The production-environment boot refuses the sink and boots without it (`Mail: off`).
- ☐ Nothing under `backup/` changed; no `Mail: SMTP via` line anywhere in the work dir's logs
  (`grep -r "Mail: SMTP" "$WORK" | wc -l` → 0 — a printed assertion).
- ☐ Deviations filled in.

**Canon.** `AGENTS.md` §7 step 3 (the rehearsal now covers email and the two ceremonies; the new
PASS count), §10 (the guard refuses a sink in production — seen).

**Deviations.**
-

## E6 — Documentation pass  ☐

Every Canon line above into `AGENTS.md` (§2 the three modules; §4 the seven keys, the sink, the dev
flag, the guard rules, "the five `smtp_*` keys are optional and go into `secrets.json` on the server
**after** the gate"; §5 the three tables and the measured rollback; §6 the nine endpoints, the
public paths, the limits table, `MeOut`'s five fields, the strip's condition pointer, the one token
page; §7 the DNS checklist **as measured**, the deliverability gate, the restart, the phone walk,
the escape hatches; §8 `mail-test`, `verify-email`, `mail_sink_link.py`, the rehearsal; §9 "no new
dependency"; §10 the dig-in-zsh trap, the CA-store fallback, the Safari cookie jar and the verify
link, a recovery request voiding an admin link; §11 the state, the counts, the open item about the
strip **closed**, and the phone's list extended), `DESIGN.md` (the header block, §5b, §7's rows,
§9b if the Email section's in-place editor needs a bullet), `README.md` (recovery, email, the 15
floor, passkey first), `backend/secrets.json.example` (the five keys with a comment: "optional —
turn email on; put them here only after `manage.py mail-test` passed the Gmail check"), and
`FEATURES_2026-09-auth.md`'s Deployment section pointer if E5 changed what the rehearsal prints.
The gates re-run on the final tree and the numbers written into §11.

**Definition of done.** ☐ every Canon line reflected or declined in Deviations; ☐ `grep -n "At least
10" README.md DESIGN.md AGENTS.md` → 0; ☐ `grep -n "no SPF\|no DKIM" *.md` → only the measured
sentence in this file; ☐ the gates.

**Deviations.**
-

---

## Verification gates (after all tasks)

Run on the final tree by E6 and written into `AGENTS.md` §11.

- ☐ `make test` green — expected ≈507 + ≈86 (E0 26, E1 26, E2 36); the runtime written down.
- ☐ `make lint` clean.
- ☐ `make gen-types` **no diff** at the head.
- ☐ `cd frontend && npm run check` green — expected 932 + ≈30; `npm run build` green, the
  `index-*.js` size against 774.28 kB (no new dependency: expect a few kB for four pages).
- ☐ `tests/test_auth_gate.py::test_every_route_is_gated_or_listed` green with the six new public
  paths, and L2's two sabotages re-tried once on the final tree.
- ☐ `grep -rn "smtp_pass\|SMTP_PASS" backend/app | grep -v "settings.py\|mail.py"` → 0 (nothing but
  the two owners names the password); `grep -rn "simplewebauthn" frontend/src | grep -v
  "passkeys.api.ts\|test/"` → 0.
- ☐ `grep -rn "MIN_PASSWORD_LENGTH = " backend/app frontend/src` → exactly two lines, both 15.
- ☐ The rehearsal's `ALL PASSED` (E5), and its "no `Mail: SMTP via`" assertion.
- **Not a gate, not provable here:** a real message to Gmail and its headers (the deliverability
  gate is a production step, below); Face ID on the register and reset pages; the verification link
  opening in Safari on the phone and the PWA noticing on return.

## Deployment — how this half joins the single deploy

> The auth deploy is `AGENTS.md` §7's, step for step. This half adds **one step before it** (DNS),
> **three after it** (the gate, the keys, the restart) and extends the phone walk. Nothing here is a
> second deploy, nothing here rebuilds an image a second time, and `secrets.json` is edited exactly
> once, **after** the gate.

### Before the deploy — DNS (Roli, in Namecheap's panel; measured 2026-09-24, so most of it is done)

| record | state on 2026-09-24 | to do |
|---|---|---|
| SPF — `TXT lorbeerkranz.xyz` | **published**: `v=spf1 include:spf.privateemail.com ~all` | nothing. **Never add a second SPF TXT** (two is a permanent `permerror`); if a future sender needs adding, edit this one |
| MX — `lorbeerkranz.xyz` | **published**: `10 mx1.privateemail.com`, `10 mx2.privateemail.com` | nothing; replies to `no-reply@` are dropped by the mailbox rules, not by DNS |
| DKIM — `TXT privateemail._domainkey.lorbeerkranz.xyz` | **published**: `v=DKIM1;k=rsa;p=MIIBIjAN…` (the host name Namecheap uses for Private Email subscriptions bought on or after 2026-06-02; `default._domainkey` is the older one and is empty here) | **check, don't create**: Private Email panel → the domain → DKIM shows *enabled* for the mailbox that will log in. The value only the panel can supply is already in DNS |
| DMARC — `TXT _dmarc.lorbeerkranz.xyz` | **missing** | **publish**: host `_dmarc`, type TXT, value `v=DMARC1; p=none` — **no `rua=` report address** (Roli, 2026-09-24: daily XML reports are noise for a six-person app, and the deploy-day Gmail test already proves delivery). `p=none` observes and blocks nothing; a report address can be added later if he ever wants them |

Verify from the Pi, spelling the arguments literally (a `$q`-style variable is not word-split by
zsh — the trap that produced the brief's "no records" measurement):
```bash
dig @1.1.1.1 +short lorbeerkranz.xyz TXT                          # the one SPF line
dig @1.1.1.1 +short privateemail._domainkey.lorbeerkranz.xyz TXT  # v=DKIM1;k=rsa;p=…
dig @1.1.1.1 +short _dmarc.lorbeerkranz.xyz TXT                   # v=DMARC1; p=none; …  (after publishing; TTL 1800 → ≤30 min)
```

### The deploy — unchanged, with the rehearsal that now covers this half

Steps 1–9 of `AGENTS.md` §7's auth deploy exactly as written: gates, `backup-deploy-data`, the
rehearsal (`ALL PASSED` — E5's script, which now boots with a mail sink and walks recovery, the
verify link and the two new ceremonies), `git pull`, `docker compose build backend frontend` (**no
new wheel to watch for** — this half adds no dependency; the pip lines are the first half's), the
preflight, `up -d --build backend frontend`, the four boot lines **plus one**: `Mail: off — recovery
by email is disabled (set smtp_host, … in secrets.json)` — that is the correct fifth line on deploy
day, because the keys are not there yet. `docker compose ps` healthy; the anonymous smoke GETs.

### After the deploy — the deliverability gate, then the keys

10. **The gate, from inside the production container, with the app still "email off"**:
    ```bash
    ssh hetzner && cd ~/projects/Lorbeer-Turnierplaner
    docker compose exec backend python manage.py mail-test --to <Roli's Gmail address> \
      --host smtp.privateemail.com --port 465 --user <the login mailbox> --from no-reply@lorbeerkranz.xyz
    # prompts for the mailbox password (no echo; an *application* password if the mailbox has 2FA)
    ```
    Expected: `Sent to r***@gmail.com via SMTP via smtp.privateemail.com:465 as
    no-reply@lorbeerkranz.xyz` and exit 0. Then in Gmail: the message is in the **inbox**, not spam;
    ⋮ → **Show original** → the summary reads `SPF: PASS`, `DKIM: 'PASS' with domain
    lorbeerkranz.xyz`, `DMARC: 'PASS'` (DMARC once the record has propagated; before that Gmail
    prints no DMARC verdict, and SPF + DKIM passing is the bar). **Any FAIL → stop here; the app
    stays email-off and nobody is asked for an address.** The three refusals that gate has caught
    before anyone else: `553 … sender address rejected` (`no-reply@` is not an alias of the login
    mailbox — add the alias in the panel or send as the mailbox itself), `535 … authentication
    failed` (a 2FA mailbox wants an application password), and `CERTIFICATE_VERIFY_FAILED` (the
    image lacks a CA store — E0's decided fallback is `ssl.create_default_context(cafile=certifi.where())`,
    certifi being httpx's own dependency and already in the image; a one-line change, a rebuild,
    and the gate again).
11. **The keys.** Only now: add to the server's `backend/secrets.json` — `"smtp_host":
    "smtp.privateemail.com"`, `"smtp_port": 465`, `"smtp_user": "<the login mailbox>"`,
    `"smtp_pass": "<its (application) password>"`, `"smtp_from": "no-reply@lorbeerkranz.xyz"` — and
    `docker compose restart backend` (the file is bind-mounted; no rebuild). The boot log's fifth
    line becomes `Mail: SMTP via smtp.privateemail.com:465 as no-reply@lorbeerkranz.xyz`; a logged-in
    `GET /api/me` says `"email_available": true`; the admin page's Accounts tab prints the same
    description.
12. **The phone** (in addition to §7 step 10's walk): the strip now reads *"Secure your account — add
    an email address and a passkey."*; Settings → Account → Passkeys → Add a passkey → Face ID → the
    strip reads *"— add an email address."*; Settings → Email → the address → **Send verification
    link** → the mail arrives (inbox, not spam — that is the gate holding for a second recipient) →
    tap the link → **Safari** opens `/g/altherren/verify-email` → **Confirm** → *Verified* → back
    to the PWA → the strip is gone and the row says **verified**. Log out → **Lost your passkey or
    password?** → the address → *"If that address is verified, a link is on its way."* → the mail →
    tap → Safari → **Set a new login** → **Create a passkey** → Face ID → in (in Safari); back in the
    PWA, **Use a passkey** → in, and Settings → Passkeys lists two, the older one with its last-used
    time; remove it. On a laptop, log in with a password, Settings → Passkeys shows the hint; log out
    and press **Use a passkey** → the browser's prompt offers the phone → scan → Face ID → in, nothing
    typed. Register a throwaway with a code and **Create a passkey** — or, since there is still no
    delete-account command, create the code and **revoke** it instead, having watched E5's Chromium
    run do the registration. **Write each answer into `AGENTS.md` §11.**

**Escape hatches, in the order to try them:** a verification mail that never arrives →
`docker compose exec -T backend python manage.py verify-email --player Roli --email <addr>` (the
address is verified by hand; recovery works from then on); a person locked out with no verified
email → `manage.py reset-link --player X` as before (the page now offers a passkey too); email
misbehaving → remove the five keys, `docker compose restart backend`, the strip stops asking for
an address and recovery answers its unchanging sentence and sends nothing; everything else → `AGENTS.md`
§7 step 12, `git checkout ce55a53 && docker compose up -d --build backend frontend` — the three
new tables are inert to the old code (measured by E0 and E5); a passkey-only account registered
under the new code cannot log in on the old one until `manage.py set-password` gives it a password
(the first half's rule for every passkey, restated).

## Rollback safety, measured (the technique, so nobody asserts it)

```bash
OLD=$(mktemp -d) && git archive ce55a53 backend | tar -x -C "$OLD"     # production today; never cfc1669
cp <a db the new code has booted, with an AccountEmail row and a passkey-only account> "$WORK/rb.db"
cd "$OLD/backend" && /home/roli/projects/turnierplaner-auth/backend/.venv/bin/python run.py --host 127.0.0.1 --port 8277 \
  --secrets "$WORK/old-shape-secrets.json" --db-url "sqlite:///$WORK/rb.db"
# → boots; POST /auth/login (JWT) 200; GET /tournaments 200; POST /tournaments 200;
#   sqlite3 counts of accountemail / emailverification / registrationintent unchanged
# then boot the NEW code on rb.db → the verified email is still there, the backfill logs the old code's row
```
E0 does it against the dev DB, E5 against the production snapshot; both write the numbers down.

## Deferred — explicitly NOT here

- Notifying the email when a password is changed, a passkey is added or removed, or a recovery
  link is *used* — one notice (address changed / removed) ships; the rest is a later decision.
- Showing the address itself to the site admin (the admin page shows the state only).
- Removing passkeys on recovery (disagreement 5 — kept, deliberately).
- Invites by email (the code stays a code; a mailed invite is a third link kind and a third text).
- Any HTML email, any second language.
- A second token table for recovery (one page, one consumer — disagreement 4 records the cost).
- Session-token rotation, deleting an account, `player_accounts[]` removal — the first half's list.

## What this plan could not verify (and why)

- **No check was run** (read-only session); the counts are §11's plus greps.
- **`ca-certificates` inside `python:3.11-slim`** — believed present (the official image installs
  it); seen for real only by the gate, and the fallback is decided (step 10).
- **Namecheap's DKIM toggle state for the mailbox** — the record is in DNS; whether the mailbox
  *signs* with it is the panel's and the gate's to show.
- **Whether `no-reply@lorbeerkranz.xyz` is an alias of the login mailbox** — Roli's panel; the gate's
  `553` is the tell.
- **Gmail's verdict on a `~all` SPF and a fresh DMARC** — only a real message answers.
- **The cross-device passkey prompt on a real laptop**, and the Safari-then-PWA hand-off for both
  links — the phone's, after the deploy.
- **The exact height of a two-line strip sentence** at 390 — E4 measures it; L9's 66 px is the
  one-line number.

## Decisions still needed from Roli

None block E0–E2. Each is a one-line answer a worker otherwise takes the default on.

1. **The DMARC report address** (`rua=mailto:…`) — the one value only he can supply. Default: his
   own Gmail address.
2. **Confirm `no-reply@lorbeerkranz.xyz` is an alias of the login mailbox** (or name the mailbox to
   send as). Default: as decided; the gate tells.
3. **The admin page's "Not secured" chip replaces "Migrated password"** (E4). Default: yes — a
   migrated password is one of the two ways an account is not secured.
4. **Recovery keeps old passkeys** (disagreement 5). Default: keep.
5. **The old address is told, with no link** (disagreement 6). Default: yes.
6. **`verify-email` as a CLI hatch rather than an admin-page button** (disagreement 2). Default:
   CLI — the same place every other hatch lives, and no button that a wrong tap turns into a
   stranger's recovery address.
