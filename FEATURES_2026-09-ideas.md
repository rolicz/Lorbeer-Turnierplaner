# Features 2026-09 — Ideas: comments, the author's notifications, and the device that hears nothing

> Branch `feature/2026-09-ideas` off `main` (baseline `4fb03fc`). Written 2026-09-19.
> Symbol names are the source of truth; line numbers reference the baseline.
> Read `AGENTS.md` first (§5 persistence, §6 API + realtime, §9 how work is done, §10 gotchas),
> then `DESIGN.md` (§3 surfaces, §5b words, §9b feeds and composers) for the two UI tasks.
> This batch **touches the backend and the schema**, unlike `DESIGN_FIXES_2026-09.md`; the gates
> below say what that costs per task. **Not deployed** at the end of the batch — Roli tests first.
>
> Task IDs `P1`–`P6`. `A B C D DS F G N Q R S T U` are taken by earlier batches; `P` is free
> (`grep -rn '^## P[0-9]' *.md` → nothing).

## Why this batch exists

Someone posted an idea and Roli, an admin, got nothing. The code path was right — `push_idea_created`
addresses exactly the admin ids and `enqueue_personal_for_player` lifts the mode filter — but he had
re-added the PWA three days earlier, which destroys the service-worker registration and the push
subscription, and **nothing in the app said so**. He found out only by tapping Settings → Send test.
Confirmed 2026-09-19: *"notifications had to be re-enabled, now they work. if someone re-installs the
app, they should get that information."* An idea is also the only personal event with no in-app
fallback: `/me/notifications` builds `comment_reply`, `guestbook` and `poke` and nothing else, so when
a push fails there is no trace anywhere.

Roli asked for three things and this batch adds the fourth that makes them worth having:

1. **Comments on ideas — a flat list.** His words: *"it can stay a flat list."*
2. **The idea's author is told** when someone comments, votes (+1), or an admin sets a status.
3. **Both channels** — the bell and push — for all four idea events (created, commented, voted, status).
4. **A device that receives nothing says so, unprompted** (P5) — required, not optional.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code style
   (thin routers, bodies in `services/`, error helpers from `api_utils.py`; Tailwind + design tokens,
   `qk` query-key factory, generated API types, lucide-react).
2. Work on branch `feature/2026-09-ideas`. **Never switch branches, never touch `main`, never push.**
   One or more commits per task, message prefixed with the task ID (`feat(P1): …`, `fix(P5): …`,
   `docs(P6): …`).
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never `git commit -a`.
   Each task lists its file set; if you need a file outside it, stop and report.
   `AGENTS.md` and `DESIGN.md` are edited by **P6 only**: write the canon line your task changes under
   "Canon" in your task section and leave the files alone.
4. **Verify first.** Every task names the check that proves the gap still exists. Run it before
   changing anything; if the gap is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing. Backend touched → `make test` + `make lint`. **Response
   model touched → `make gen-types`, and `frontend/src/api/generated/schema.d.ts` goes in the same
   commit.** Frontend touched → `cd frontend && npm run check` (+ `npm run build` where the task says).
   Baselines (`AGENTS.md` §11): backend **204 passed**, frontend **688 tests in 68 files**.
6. UI must work at ~390px and ≥1024px, verified in a real browser (Playwright against the isolated
   stack below) in **both** the `blue` and the `light` theme. Measure, do not eyeball.
7. Never read or print `backend/secrets.json`. Never run destructive commands on `backend/app.db` or
   `backend/data/app.db` — copy first. Never bind 8000/8001/8010/5173.
8. **One mechanism per job — reuse before you create.** The last batch collapsed N ways of doing a
   thing into one; a worker who invents a parallel way while adding a feature undoes that. Before
   writing a helper, a hook, a table or a class string, look for the existing one — and if your task
   names a mechanism, use **that** one and no other. The shared things this batch depends on:

   | job | the one implementation | who builds it |
   |---|---|---|
   | an event on an idea — written, removed, marked read | `services/idea_events.py` | P1 |
   | who may edit / delete an idea comment | `services/authorization.py` predicates → `IdeaCommentOut.can_*`; the page renders the flags | P1 |
   | a push to one player that reaches the default mode | `NotificationDispatcher.enqueue_personal_for_player` through a `push_*` helper in `services/notifications.py` | exists; P2 adds three helpers |
   | a push text | `notification_texts.json` + `render_notification_text`; language-dependent words are helpers in `notification_texts.py` (`_mode_label`, `_authors_line`) | exists; P2 adds `_status_label` |
   | a push preview / a bell snippet | the guestbook's 120-char rule (`players.py:681`) for a push; `me.py::_snippet` for the bell — two exist, add no third | exists |
   | a bell item | `/me/notifications` (typed by P1) + `ui/shell/notificationText.ts` for its copy | P1 / P3 |
   | a chat row | `CommentSendRow` (`pages/live/comments/CommentComposer.tsx`) | exists; P4 reuses |
   | asking before deleting | `ui/primitives/ConfirmDialog`, local `useState`, red block iff something stored is deleted | exists; P4 wires one |
   | a count in prose | `fmtCount` (`utils/format.ts`) | exists |
   | `localStorage` that cannot throw | `utils/safeStorage` (`readStored` / `writeStored` / `removeStored`) | exists; P5 uses it |
   | "does this device receive push" | `push/usePushNotifications.ts` (+ the pure `push/pushSetup.ts`) | exists; P5 extends |
   | the one-shot deep-link param | `?idea=` in `ui/shell/lastLocation.ts` `ONE_SHOT_PARAMS` and the `IdeasPage` effect that consumes it | exists; P4 extends the effect |

   If your task genuinely needs something new and shared, put it where the existing family lives and
   say so in **Deviations** in your first sentence. Two implementations of one job is a failed task
   even when both are correct and the tests are green.
9. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the task
   did not say, what you measured, what you left). Include that edit in your commit. If blocked or
   the code does not match this spec, stop, note it here, commit nothing broken.

### Runtime verification (isolated stack)

**Tasks run in parallel, so every task has its own ports and its own database copy.**

| task | backend | vite | db copy |
|---|---|---|---|
| P1 | 8071 | 8081 | `backend/data/verify-p1.db` |
| P2 | 8072 | 8082 | `backend/data/verify-p2.db` |
| P3 | 8073 | 8083 | `backend/data/verify-p3.db` |
| P4 | 8074 | 8084 | `backend/data/verify-p4.db` |
| P5 | 8075 | 8085 | `backend/data/verify-p5.db` |

`backend/data/*.db` is gitignored. **Never** point the stack at `backend/app.db` or
`backend/data/app.db`.

```bash
# <B>, <V>, <DB> from your row above
cp backend/app.db backend/data/<DB>

# A throwaway secrets file OUTSIDE the repo (Rule 7). Two editors and an admin, because the
# permission matrix and "never the actor" need three distinct people:
SEC=$(mktemp -d)/secrets.json
cat > "$SEC" <<'JSON'
{ "db_url": "sqlite:///./app.db",
  "player_accounts": [ { "name": "Roli",  "password": "verify-only", "admin": true },
                       { "name": "Berni", "password": "verify-only", "admin": false },
                       { "name": "Flo",   "password": "verify-only", "admin": false } ],
  "jwt_secret": "verify-only", "ws_require_auth": false, "log_level": "WARNING" }
JSON

cd backend && UPLOADS_DIR="$PWD/data/uploads" .venv/bin/python run.py \
  --host 127.0.0.1 --port <B> --secrets "$SEC" --db-url "sqlite:///$PWD/data/<DB>" &
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:<B> VITE_WS_BASE_URL=ws://127.0.0.1:<B> \
  npx vite --port <V> --strictPort &

# log in (the body field is `username`):
curl -s -X POST http://127.0.0.1:<B>/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"Roli","password":"verify-only"}'
# browser, before the first navigation:
#   localStorage ea_fc_token=<token> · ea_fc_role=admin · ea_fc_player_id=1 · ea_fc_player_name=Roli
#   localStorage theme = "blue" | "light"
```
Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5, Mike=6. **Push cannot be delivered over the
wire on this machine** (`cryptography` is not in Roli's venv — `FEATURES_2026-09.md` R5): the
dispatcher is disabled and `/push/config` answers `enabled: false`. Every push test in this batch
therefore stops at the queued `PushMessage` (the `_Recorder` pattern in `tests/test_ideas.py`) or at a
faked `send_web_push_message` (the real `_deliver` with the POST stubbed). P5's browser check routes
`/push/config` to a stub. Kill only the PIDs you started.

---

## Decisions (Roli 2026-09-19 + this plan — do not relitigate)

- **"Flat" means:** no reply threading, no images, no votes on comments, **and no editing at all**
  (Roli 2026-09-19, answering the plan's question 1). A typo is fixed by deleting and reposting.
  So there is **no** `PATCH /ideas/{id}/comments/{cid}` and **no** inline editor — drop both wherever
  this plan still describes them, and do not add an `edited_at` column to the comment table.
  **Delete is the comment's author or an admin**, for as long as the comment exists — no time
  window, the idea's own rule (`AGENTS.md` §6, R5) applied to the comment. The **idea's author does
  not moderate** other people's comments on their idea (the guestbook lets the wall owner; the
  comment feed does not; a comment on an idea is a reply to a document, not a note on a wall).
  `can_delete` rides on every comment row and the page renders it; it never re-derives the rule.
- **Comments are embedded in `IdeaOut` (`comments: [...]`, oldest first)**, not a second endpoint or
  query key. The list is tens of ideas; one query, one invalidation (`qk.ideasAll()`), no expand-fetch
  state. Readers see them (reading `/ideas` is public); writing needs a login (editor+, like posting
  an idea).
- **No WebSocket channel** — see "Realtime" under P4. The coverage table's row for `["ideas"]`
  ("R5 gave the board no channel on purpose", 5 s) is unchanged: comments live under the same key and
  inherit it. The bell row stays `partial` / 30 s with its 60 s poll.
- **One event table, not four read tables.** `FeatureRequestEvent` (kind `created` · `comment` ·
  `vote` · `status`, actor, optional comment id, the status + note as set) with one
  `FeatureRequestEventRead(player_id, event_id)`. A status change is not a row today, so something
  had to become one; a vote has no id of its own, so a vote-read table would have needed a
  three-column key; the event log is the shape that makes all four kinds one thing. **The bell derives
  from state, as it does today:** an unvote deletes the `vote` event, a deleted comment takes its
  event, a deleted idea takes everything. `created` events are written for every idea and the bell
  shows them **to admins only** (the token's `role`, the same source as `admin_player_ids`).
- **Read = you opened it.** `PUT /ideas/{id}/read` marks every event on that idea read for the
  caller. The board calls it when the `?idea=` deep link is consumed and when the viewer expands an
  idea's comments. No per-card unread marker in this batch (R5 declined a badge; the bell is the badge).
- **Audience, per event kind — and a comment reaches the whole thread** (Roli 2026-09-19, third
  pass). **Never the actor**, in every case — the `push_idea_created` rule. Otherwise:
  - **`comment` → the idea's author *plus every player who has already commented on that idea*,
    minus the actor.** Once you have said something in a thread you hear the replies, whoever you
    are; an admin who commented is a participant like anyone else, and an admin who has not
    commented on someone else's idea still hears nothing. Compute the set from the comment rows
    themselves (`SELECT DISTINCT author_player_id FROM featurerequestcomment WHERE
    feature_request_id = …`) union the idea's author, minus the actor — **do not** special-case
    roles; the predicate is participation, not permission.
  - **`vote` → the idea's author alone.** A like is about the idea, not the conversation; a
    commenter is not told every time someone upvotes.
  - **`status` → the idea's author alone.** Triage is an answer to the author.
  - **`created` → the admins**, as `push_idea_created` already does.

  This is the same shape the bell already uses for tournaments, where the thing that reaches you is
  a reply to **your** comment. Delivery through `enqueue_personal_for_player`; the three event types
  join `PERSONAL_DEFAULT_EVENT_TYPES` so a default "Results & personal" device gets them.

  **P1 builds the audience helper; P2 and P3 import it and never write their own.** Both channels
  must answer "who cares about this event" identically or they disagree the first time a comment is
  deleted — a push for something the bell never shows, which nobody notices because the two are
  never compared. P2 and P3 run in parallel, so neither can own it: whichever started first would
  define it and the other would find it half-written. It belongs to P1, the task both depend on
  anyway. `AGENTS.md` §9, and rule 8 — one mechanism per job.
- **Push texts:** Roli's Styrian drafts go in as written (his to correct — Decisions list item 2);
  German is **ASCII-safe** (`Oeffne`, `fuer`), English in the house voice. The status word is
  translated per language by a renderer helper (`_status_label`, precedent `_mode_label`); the status
  note is a `status_note_line` that carries its own `\n` and vanishes when empty (precedent
  `goal_note_line`).
- **`/me/notifications` gets a response model** (`MyNotificationsOut`) — the one endpoint without one,
  and the four new kinds must arrive through `gen-types` like everything else. Wire format unchanged.
- **P5, the device that hears nothing:** detection never assumes local state survived — the answer
  is `Notification.permission` + `pushManager.getSubscription()` + the server, read fresh on every
  launch through `usePushNotifications`, which P5 mounts app-wide. The notice shows **only while
  `permission === "default"`** (never decided on this install) **and no subscription exists**, once
  per install, dismissible; `denied` is a decision and is respected; `granted` + no subscription is
  the browser having dropped it and is **re-subscribed silently** (no prompt is possible or needed)
  unless the person disabled push on this device on purpose (a marker `disable()` writes). Server
  half: a PUT for an endpoint the push service answered 404/410 to is refused with **410**, and the
  client rotates (unsubscribe → subscribe → PUT) instead of resurrecting the corpse; `sw.js` learns
  `pushsubscriptionchange`. The shell notice is one line, `warn`-toned, on every page under the top
  bar — Settings keeps the truth and gains nothing new.

### Answered 2026-09-19 (second pass) — fold these in wherever the tasks still ask

- **Comments cannot be edited** (above). P1 loses the PATCH endpoint and its schema; P4 loses the
  inline editor. Everything else about comments stands.
- **The "this device receives nothing" notice sits under the top bar, on any page, once per install,
  dismissible** (P5). Not the dashboard alone — a push deep-link or a shared link can skip the
  dashboard entirely — and not a dot on the bell, which is the weakest of the three and closest to
  the failure this exists to prevent: Roli went days without knowing. Dismissal is per install, so a
  reader who genuinely wants notifications off is asked once and never again; a reinstall is a new
  install and asks again, which is exactly the case that broke.
- **Admins are not buzzed about comments on ideas they have nothing to do with** — but **a comment
  notifies everyone who has commented on that idea**, admins included, exactly like any other
  participant (Roli: "admins should get reply when they commented themselves (like others)"). The
  full per-kind audience is in the Decisions block above; participation is the predicate, not role.
- **Styrian copy — my calls on the four open details, all still Roli's to correct:**
  - status words `neich · eiplant · in Arbeit · fertig · obglehnt` — accepted as drafted;
  - the comment body reads **`Schau eini, wos gmoant is.`**, not "wos er moant" — the neutral form,
    so the text does not assume the commenter's gender;
  - the vote line takes a **singular form at one vote** (`Jetzt mog des ana a.` / plural
    `Jetzt san's {vote_count}, de des a wolln.`) rather than printing "Jetzt san's 1";
  - the English bell verb is **"likes your idea"**, Roli's own word for it, not the board's "wants".

## Task overview & order

| # | ID | Title | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------------------------------|------|
| 1 | P5 | The device that receives nothing says so | `frontend/src/push/pushSetup.ts` (new), `frontend/src/push/push.ts`, `frontend/src/push/usePushNotifications.ts`, `frontend/src/ui/shell/PushSetupNotice.tsx` (new), `frontend/src/ui/shell/AppShell.tsx`, `frontend/public/sw.js`, `frontend/src/test/pushSetup.test.ts` (new), `backend/app/routers/push.py`, `backend/tests/test_push_notifications.py` | **first, alone** |
| 2 | P1 | Schema, comments API, events, the typed bell contract | `backend/app/models.py`, `backend/app/services/idea_events.py` (new), `backend/app/services/ideas_view.py`, `backend/app/services/authorization.py`, `backend/app/schemas/requests.py`, `backend/app/schemas/responses.py`, `backend/app/routers/ideas.py`, `backend/app/routers/me.py` (one line), `backend/tests/test_idea_comments.py` (new), `frontend/src/api/generated/schema.d.ts`, `frontend/src/api/types.ts`, `frontend/src/api/notifications.api.ts`, `frontend/src/ui/shell/NotificationBell.tsx` (import line only), `frontend/src/test/ideaMeta.test.ts` (+ any test building an `Idea` literal) | **second, alone** |
| 3 | P2 | Push: commented, voted, status | `backend/app/notification_texts.json`, `backend/app/services/notification_texts.py`, `backend/app/services/notifications.py`, `backend/app/routers/ideas.py`, `backend/tests/test_ideas.py`, `backend/tests/test_push_notifications.py` (the catalog test's context dict only) | group A |
| 4 | P3 | Bell: the four idea kinds with read state | `backend/app/routers/me.py`, `backend/app/services/idea_events.py`, `backend/tests/test_me_notifications.py`, `frontend/src/ui/shell/NotificationBell.tsx`, `frontend/src/ui/shell/notificationText.ts` (new), `frontend/src/test/notificationText.test.ts` (new) | group A |
| 5 | P4 | The board: comments under an idea, and reading marks read | `frontend/src/pages/ideas/IdeaCard.tsx`, `frontend/src/pages/ideas/IdeaComments.tsx` (new), `frontend/src/pages/ideas/IdeasPage.tsx`, `frontend/src/pages/ideas/useIdeaMutations.ts`, `frontend/src/api/ideas.api.ts`, `frontend/src/test/ideaComments.test.tsx` (new) | group A |
| 6 | P6 | Documentation pass | `AGENTS.md`, `DESIGN.md`, this file | last |

**Order:** P5 alone → P1 alone → **group A** {P2, P3, P4} in parallel (file sets verified disjoint
above: P2 owns `ideas.py`/`notifications.py`/the texts, P3 owns `me.py`/`idea_events.py`/the bell,
P4 owns `pages/ideas/*` and `ideas.api.ts`) → P6.
**Why P5 first and alone:** it needs no schema, it is what Roli can test on his phone tonight, and
it edits `tests/test_push_notifications.py`, which P2 also touches. **Why P1 alone:** every group-A
task depends on its tables, its endpoints and its generated types, and a half-written `models.py`
breaks every backend test for anyone sharing the worktree. Group-A workers will see each other's
in-flight files in `make test` / `npm run check` runs, as the last batch did; commit only your own.

---

## P5 — The device that receives nothing says so  ☑

**The gap.** After a PWA reinstall the service-worker registration and the push subscription are
gone, the server still holds the old endpoint (it only learns it is dead when APNs answers 410 to the
*next* push), and the app is silent. Everything that could notice already exists in
`frontend/src/push/usePushNotifications.ts` — `permission`, `browserEndpoint` from
`getSubscription()`, the server's list, `deviceEnabled`, even an auto-sync that re-PUTs a subscription
the server lost (`:296-337`) — and all of it runs only where the hook is mounted:
`ui/layout/PushNotificationsSettings.tsx:27`, i.e. Settings → Notifications. `main.tsx:32` registers
the SW on every boot, so the SW is there; nobody asks it anything. `public/sw.js` has no
`pushsubscriptionchange` listener. Server side, `services/notifications.py::_deliver_one` **already
disables** a row on 404/410 (`:892-893`) — but `upsert_push_subscription` (`:560-572`) clears
`disabled_at` on the next PUT of the same endpoint, so a dead endpoint the browser still holds is
resurrected on every launch by the auto-sync and dies again on the next push, for ever.

**Verify first.**
```bash
grep -rn 'usePushNotifications(' frontend/src | grep -v test/     # → exactly 1 hit, PushNotificationsSettings.tsx:27
grep -c 'pushsubscriptionchange' frontend/public/sw.js            # → 0
grep -n 'disabled_at = None' backend/app/services/notifications.py # → :572, inside upsert (the resurrection)
```
Backend, in a scratch test against the `client` fixture: insert a `PushSubscription` with
`disabled_at=now, last_http_status=410`, then `PUT /push/subscription` with the same endpoint as that
player → today **200** and `disabled: false`. Browser, on the isolated stack in a fresh context as
Berni: `await (await navigator.serviceWorker.ready).pushManager.getSubscription()` → `null`, and
`/dashboard` shows nothing about it.

**The change.**

(a) **`frontend/src/push/pushSetup.ts` (new, pure)** — the decision, testable without a browser:
```ts
export type PushSetupState = "needs-setup" | "resubscribe" | "ok" | "none";
export function pushSetupState(i: {
  token: string | null; supported: boolean; serverEnabled: boolean;
  permission: NotificationPermission | "unsupported";
  browserEndpoint: string | null; userDisabled: boolean;
}): PushSetupState
```
Rules, in order: no token / not supported / server not enabled / `permission === "denied"` →
`"none"`; `browserEndpoint` present → `"ok"`; `permission === "granted"` and not `userDisabled` →
`"resubscribe"` (the browser dropped it; subscribing again needs no prompt); `permission === "default"`
→ `"needs-setup"`; anything else → `"none"`. Plus the two storage keys and their accessors, on
`utils/safeStorage`: `PUSH_SETUP_DISMISSED_KEY = "push_setup_notice_dismissed"`
(`isSetupNoticeDismissed()` / `dismissSetupNotice()`) and `PUSH_USER_DISABLED_KEY =
"push_disabled_by_user"` (`isPushDisabledByUser()` / `setPushDisabledByUser(bool)`). **Dismissal is
allowed to live in `localStorage`** because a reinstall that wipes storage also wipes the
subscription, which is exactly when the notice must come back; the *detection* never reads storage.

(b) **`usePushNotifications.ts`** — expose `setupState: PushSetupState` computed from the values the
hook already holds (`token`, `supported`, `configQ.data?.enabled`, `permission`, `browserEndpoint`,
`isPushDisabledByUser()`). `disableMut.onSuccess` → `setPushDisabledByUser(true)`;
`enableMut.onSuccess` → `setPushDisabledByUser(false)`. New effect: when `setupState ===
"resubscribe"` and a `autoResubscribeRef` has not fired for this `token:vapid_public_key`, call
`enableMut.mutate()` once — with permission granted this is silent. **410 rotation:** in `push.ts`
add `rotateBrowserPushSubscription(vapidPublicKey)` = `getSubscription()?.unsubscribe()` then
`pushManager.subscribe(...)` (do not reuse `subscribeBrowserToPush`, whose contract is "return the
existing one"). In `enableMut` and in the auto-sync effect, wrap the `putPushSubscription` call: on
`err instanceof ApiError && err.status === 410` (from `api/client.ts`), rotate and PUT the fresh
subscription **once**; a second 410 surfaces as `error`. The four existing raw
`window.localStorage` calls in this file (`loadStoredPushLanguage` etc.) may be moved onto
`safeStorage` in the same commit — same job, same file, say so in Deviations.

(c) **`ui/shell/PushSetupNotice.tsx` (new)**, mounted by **`AppShell.tsx`** as the first child of
`<main>` (before `RouteErrorBoundary`), receiving `token` from `ShellInner`. It calls
`usePushNotifications(token)` and renders `null` unless `setupState === "needs-setup"` and not
dismissed and not `loading`. One row, the `warn` treatment `DESIGN.md` §2 gives "attention, nothing
failed" (the settings panel's error box, `PushNotificationsSettings.tsx:140`, is the same shape in
`error`): `card mb-3 flex flex-wrap items-center gap-2 border-warn/40 bg-warn/10` — no padding
override (the audit deferred the eleven `.card` overrides; do not add a twelfth). Contents: lucide
`BellOff` `size={16}` `text-warn` `aria-hidden`; `<span className="min-w-0 flex-1 text-sm
text-text-normal">This device gets no notifications.</span>`; `<span className="ms-auto inline-flex
gap-1.5">` with `Button variant="ghost" size="sm"` **Not now** (`dismissSetupNotice()` + local state)
and `Button size="sm"` **Turn on** (`push.enable()`, label `Turning on…` while `syncing`). `role="status"`.
Sentence case, full stop (§5b). At 390 the sentence wraps above the buttons (`flex-wrap`).
**Double mount is bounded and idempotent:** while Settings → Notifications is open two instances of
the hook run; `refreshBrowserState` only reads, the logout DELETE and the auto-sync PUT are upserts,
and two concurrent `subscribe()` calls for one key return one subscription. Note it, do not build a
context for it.

(d) **`public/sw.js`** — after the `notificationclick` handler:
```js
self.addEventListener("pushsubscriptionchange", (event) => {
  const key = event.oldSubscription && event.oldSubscription.options &&
    event.oldSubscription.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
});
```
The SW cannot PUT the new endpoint itself (auth is a bearer token in `localStorage`; there is no
cookie session), so the server learns it on the next launch through the auto-sync — which is why (c)
mounts the hook app-wide and not only in Settings.

(e) **`backend/app/routers/push.py::put_subscription`** — before `upsert_push_subscription`:
```python
dead = s.exec(select(PushSubscription).where(PushSubscription.endpoint == str(body.endpoint or "").strip())).first()
if dead is not None and dead.disabled_at is not None and dead.last_http_status in (404, 410):
    raise HTTPException(status_code=410, detail="The push service no longer knows this endpoint; subscribe again")
```
(`select`/`PushSubscription` imports added.) A row a *client* disabled (`last_error == "disabled by
client"`, `last_http_status` a success) is not dead and is re-enabled as today. `_deliver_one`'s
404/410 handling is **unchanged** — it is already the pruning half. Other failure classes (5xx,
timeouts, a VAPID 401) keep counting `failure_count` and are never auto-disabled: a bad VAPID key is
a server problem, not a dead device, and disabling on it would be wrong; note it, do not "fix" it.

(f) **Tests.** `frontend/src/test/pushSetup.test.ts`: the state table (reader → none; unsupported →
none; server off → none; denied → none; endpoint → ok; granted + none + not user-disabled →
resubscribe; granted + none + user-disabled → none; default + none → needs-setup) and the dismissal
round trip on jsdom's `localStorage`. `backend/tests/test_push_notifications.py`:
`test_put_subscription_refuses_an_endpoint_the_push_service_rejected` (row disabled with 410 → PUT →
**410**, row still disabled; row disabled by client with 201 → PUT → 200, re-enabled).

**What must not change.** `PushNotificationsSettings.tsx` — Settings keeps the truth as it prints it
("This device: not linked"); the `statusLabel` wording; `notification_language`/`mode` handling;
`_deliver_one`; `PushSubscriptionsListOut` (no response model changes in this task, so no
`gen-types`). `main.tsx`'s boot registration. The bell.

**Definition of done.**
- Playwright, 390×844 and 1280×900, `blue` **and** `light`, with `/push/config` routed to
  `{"enabled":true,"configured":true,"vapid_public_key":"stub","reason":null,...}` and a fresh
  browser context (permission `default`, no subscription), logged in as Berni: `/dashboard`,
  `/ideas` and `/stats` each show the notice directly under the top bar; **Not now** hides it and a
  reload keeps it hidden; a new context shows it again; a context created with
  `permissions: ["notifications"]` (granted) and no subscription shows **no** notice and issues one
  `PUT /push/subscription` on its own (assert on the routed request — `subscribe()` may fail in
  headless Chromium without a push service; if it does, assert the attempt and say so); a reader (no
  token) never sees it; `document.querySelectorAll("a a").length` = 0; 0 console errors.
- `node --check frontend/public/sw.js` passes. `npm run check`, `npm run build` green. `make test`
  (204 + 1) and `make lint` green.
- **On Roli's phone, which is the only place the reinstall can be reproduced:** delete the PWA,
  re-add it, log in → the notice is on the first screen; **Turn on** → the iOS permission prompt →
  Settings → Notifications says Enabled and **Send test** arrives. Write the result into Deviations;
  the plan's assumption that iOS resets `Notification.permission` to `default` on reinstall is
  WebKit's documented behaviour and was not verified here.

**Gates.** `make test` + `make lint`; `cd frontend && npm run check && npm run build`;
`node --check frontend/public/sw.js`; browser at 390/1280 × blue/light.

**Canon.** `AGENTS.md` §10 gains the gotcha (P6 writes it): *a PWA reinstall silently destroys the
push subscription; the shell notice (`ui/shell/PushSetupNotice.tsx`) is the only surface that says
so unprompted, `usePushNotifications` is mounted app-wide for that reason, `PUT /push/subscription`
answers 410 for an endpoint the push service has rejected and the client rotates, and `sw.js`
re-subscribes on `pushsubscriptionchange`.* `DESIGN.md` §2: the notice is a `warn` banner (nothing failed).

**Deviations:**

- **Verified first, all three gaps were live** (2026-09-19, at `880a6fd`): `usePushNotifications(`
  had exactly one non-test caller (`PushNotificationsSettings.tsx:27`), `sw.js` had no
  `pushsubscriptionchange`, and a scratch run against the `client` fixture answered **200 /
  `disabled: false`** to a PUT of an endpoint whose row was disabled with `last_http_status = 410`.
  Nothing was already fixed.
- **The server rule, as chosen:** refuse with **410** when a row for this exact endpoint is
  disabled **and** `last_http_status in (404, 410)` — i.e. the push service itself said the
  endpoint is gone. Identity is the endpoint string, which is what separates "a genuinely new
  endpoint" (a different row, accepted normally) from "the corpse the browser still holds". A row
  a *client* disabled carries no rejection status and is re-enabled exactly as before; other
  failure classes (5xx, timeouts, a VAPID 401) never disable a row and so can never refuse one.
  `_deliver_one` is untouched.
- **`loading` gained a third term:** `supported && !browserChecked`, a new internal flag set in a
  `finally` around the `getSubscription()` read. Without it "nobody has subscribed" and "the
  browser has not answered yet" are the same value (`browserEndpoint === null`) and the notice
  flashes on every boot before the browser replies. Measured on the isolated stack: the answer
  lands ~3 s after first load (the dev server registers the SW in ~1.9 s), so the flash would have
  been long and visible. The Settings panel's refresh spinner honours the same flag.
- **The user's deliberate "off" is remembered in the hook, not only in storage:** `userDisabled`
  is `useState(isPushDisabledByUser())` kept in step by `rememberUserDisabled`, because
  `pushSetupState` is called during render and a bare storage read there would not re-render on a
  change.
- **The 410 rotation is one helper, `putSubscriptionRotatingOn410`** (module-level in
  `usePushNotifications.ts`), used by `enableMut` **and** the auto-sync effect — rule 8; the two
  call sites do not each own a copy. The preferences PUT (`syncSubscriptionPreferences`) is left
  alone: it only runs for an endpoint the server already lists.
- **The four raw `window.localStorage` calls moved onto `utils/safeStorage`** in the same file, as
  the task allowed.
- **`AppShell` passes `token` from `ShellInner`**, and the notice is `<main>`'s first child, as
  specified. Double mount with Settings → Notifications open is unchanged and idempotent; no
  context was built for it.
- **Verified in a real browser** (isolated stack: backend 8075 with a stub dispatcher, vite 8085,
  `backend/data/verify-p5.db`, since removed), 390×844 **and** 1280×900, `blue` **and** `light`,
  `/push/config` routed to an enabled stub, logged in as Berni: **40/40 checks passed**. The
  notice appears on `/dashboard`, `/ideas` and `/stats`; at 390 it sits **16px under the 57px top
  bar** (y=73, height 66, the sentence wrapping to two lines *inside* its own span rather than
  above the buttons — `flex-wrap` allows either and this reads better), at 1280 it is the first
  element above the desktop title row (y=24, height 58). **Not now** hides it and survives a
  reload; a new context shows it again; a reader never sees it; `a a` = 0; 0 console errors.
- **Two browser facts worth writing down for the next task that measures a permission:**
  headless Chromium reports `Notification.permission === "denied"` no matter what (CDP
  `Browser.setPermission: "prompt"` does not help), so the "nobody has decided" case only exists
  in a **headed** browser under `xvfb-run`; and Playwright's `newContext({ permissions: [] })` is
  an *empty grant*, which denies notifications — omit the option entirely to leave the default
  alone. Both cost an hour here.
- **What could not be exercised, and what was substituted.** A real 404/410 from Apple's or
  Google's push service: substituted by writing exactly what `_deliver_one` writes
  (`disabled_at`, `last_http_status = 410`) and then replaying the client's PUT — done twice, in
  `tests/test_push_notifications.py` and **live** against the isolated stack, where the dead
  endpoint answered **410** and stayed disabled while a rotated endpoint was accepted (and a
  client-disabled row still re-enabled on PUT). The **client-side rotation** could not be driven
  end to end: `pushManager.subscribe()` cannot succeed in this browser (no push service), so the
  granted-permission context reached `subscribe()` — asserted, **1 call** — and got no endpoint to
  PUT, which is why that check asserts the attempt and not the PUT. `pushsubscriptionchange`
  cannot be fired synthetically either; `node --check` proves the handler parses, and the browser
  is what fires it. Push **delivery** remains untestable on this machine (no `cryptography`).
- **Left alone deliberately:** `PushNotificationsSettings.tsx`, `statusLabel`, the
  language/mode handling, `_deliver_one`, `main.tsx`, the bell, and every response model — so no
  `gen-types` diff (regenerated anyway: none).
- **Still outstanding — only Roli's phone can close it:** delete the PWA, re-add it, log in, and
  check that the notice is on the first screen and that **Turn on** leads to the iOS prompt and a
  working **Send test**. The plan's assumption that iOS resets `Notification.permission` to
  `default` on reinstall is WebKit's documented behaviour and is **not** verified here; if it
  comes back `granted` instead, the device takes the silent `resubscribe` path and the notice
  correctly stays away — the subscription is then repaired without anyone being asked.

---

## P1 — Schema, comments API, events, the typed bell contract  ☑

**The gap.** `FeatureRequest*` is four tables (`models.py:405-467`): no comment, no event, no read
state. `routers/ideas.py` has no comment endpoint and no read endpoint. A status change is a column
update with no trace. `/me/notifications` (`me.py:47`) has no `response_model`; the frontend
hand-writes `MyNotification` in `api/notifications.api.ts:3-22`.

**Verify first.**
```bash
grep -n '^class FeatureRequest' backend/app/models.py            # → 4 classes, none Comment/Event/EventRead
grep -c 'comments' backend/app/routers/ideas.py                    # → 0
grep -n 'response_model' backend/app/routers/me.py                 # → one hit, /me only
grep -n 'export type MyNotification' frontend/src/api/notifications.api.ts   # → :5 (hand-written)
```

**The change.**

1. **`models.py`**, after `FeatureRequestImageFile` (three tables, **no column on any existing
   table**, nothing in `_RUNTIME_COLUMNS`):
   ```python
   class FeatureRequestComment(SQLModel, table=True):
       """A flat comment under an idea (P1). No thread link, no image, no vote: Roli's
       "it can stay a flat list". The author is never NULL — commenting needs a login."""
       id: Optional[int] = Field(default=None, primary_key=True)
       request_id: int = Field(foreign_key="featurerequest.id", index=True)
       author_player_id: int = Field(foreign_key="player.id", index=True)
       body: str
       created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
       updated_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)

   class FeatureRequestEvent(SQLModel, table=True):
       """Something that happened to an idea and somebody may want to hear about:
       kind "created" | "comment" | "vote" | "status". The bell derives from these
       rows minus FeatureRequestEventRead, the way it derives the other three kinds
       from their tables; an unvote or a deleted comment takes its event with it."""
       id: Optional[int] = Field(default=None, primary_key=True)
       request_id: int = Field(foreign_key="featurerequest.id", index=True)
       kind: str = Field(index=True)
       actor_player_id: int = Field(foreign_key="player.id", index=True)
       comment_id: Optional[int] = Field(default=None, foreign_key="featurerequestcomment.id", index=True)
       status: str = Field(default="")       # kind == "status": the status as set
       status_note: str = Field(default="")  # kind == "status": the note as set
       created_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)

   class FeatureRequestEventRead(SQLModel, table=True):
       player_id: int = Field(foreign_key="player.id", primary_key=True)
       event_id: int = Field(foreign_key="featurerequestevent.id", primary_key=True)
       read_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)
   ```
   **There is no "edited" state.** Roli's call: a comment cannot be edited at all, a typo is fixed by
   deleting and reposting. `updated_at` exists only because every sibling table has one and adding a
   column later would have to go through `_RUNTIME_COLUMNS`; **nothing writes it**. Do not render an
   "edited" byline and do not compare it to `created_at`.
2. **`services/idea_events.py` (new)** — the only module that writes, removes or reads-marks an event:
   - `record_idea_event(s, *, request_id, kind, actor_player_id, comment_id=None, status="", status_note="") -> FeatureRequestEvent`
     — adds the row **and a read row for the actor** (the guestbook does the same for the author,
     `players.py:675-677`). No commit.
   - `delete_idea_events(s, *, request_id, kind=None, actor_player_id=None, comment_id=None) -> int`
     — deletes matching events and their read rows. No commit.
   - `mark_idea_events_read(s, *, player_id, request_id, now=None) -> int` — a read row for every
     event on the idea the player has none for; returns how many. No commit.
   - `delete_idea_comments(s, *, request_id) -> int` — every comment row of the idea (their events go
     through `delete_idea_events(request_id=…)`). No commit. (P3 adds `unread_idea_events` here.)
3. **`services/authorization.py`**, beside the idea's rule: `_is_idea_comment_author`,
   `can_delete_feature_request_comment(c, *, claims)` (admin always; otherwise the comment's own
   author, **no window** — and never the idea's author),
   `feature_request_comment_capabilities(c, *, claims) -> {"can_delete"}`,
   `ensure_can_delete_feature_request_comment(c, *, claims, action)` → 403
   `"Only the author of this comment, or an admin, can {action} it"`. **There is no edit
   predicate**: a comment cannot be edited at all (the Decisions block), so `can_delete` is a
   comment's whole permission surface.
4. **`services/ideas_view.py`**: `MAX_IDEA_COMMENT_LEN = 2000` (the guestbook's ceiling);
   `comment_dict(c, *, author_display_name, capabilities)`; `comments_map(s, request_ids, claims) ->
   dict[int, list[dict]]` — one query for the rows ordered `created_at asc, id asc` (a flat
   conversation reads top-down), `author_name_map` for the names, capabilities per row; `idea_dict`
   gains `comments: list[dict]`; `list_ideas` and `one_idea_dict` pass it. Same lazy import of
   `authorization` as the file already uses.
5. **`schemas/requests.py`**: `IdeaCommentCreateBody(body: str = "")`. No patch body — there is
   no editing.
6. **`schemas/responses.py`**:
   ```python
   class IdeaCommentOut(BaseModel):
       id: int; request_id: int; author_player_id: int; author_display_name: str
       body: str; created_at: datetime; updated_at: datetime
       can_delete: bool = False   # the whole permission surface: no editing, so no can_edit
   ```
   `IdeaOut.comments: list[IdeaCommentOut]` — **required, not defaulted**, so the generated type is
   `comments: IdeaCommentOut[]` and no consumer has to guess. And the bell:
   ```python
   class MyNotificationOut(BaseModel):
       kind: str; id: int; author_name: str; snippet: str; created_at: str; path: str
       author_player_id: int | None = None
       tournament_id: int | None = None; match_id: int | None = None
       profile_player_id: int | None = None
       idea_id: int | None = None; idea_title: str | None = None; idea_status: str | None = None
   class MyNotificationsOut(BaseModel):
       items: list[MyNotificationOut]; unread_count: int
   ```
   `created_at` stays `str` — the router builds `.isoformat()` strings today and the wire format
   must not move.
7. **`routers/ideas.py`**:
   - `_clean_comment_body(raw)` → 400 `"Comment is required"` / `"Comment must be at most 2000 characters"`
     (the ideas router's own 400 idiom, not the guestbook's 413).
   - `POST /ideas/{idea_id}/comments` → `IdeaCommentOut` (`require_editor_claims`; 404 idea): add the
     row, `record_idea_event(kind="comment", actor=…, comment_id=…)`, `fr.updated_at = now` is **not**
     touched (a comment is not the author's text changing and not the admin's answer; `updated_at`
     already lies enough — R5's `edited_at` note), commit, return `comment_dict`. *(P2 adds the push
     call here.)*
   - **No PATCH.** A comment is fixed by deleting and reposting (the Decisions block), so the
     endpoint, its body schema and any inline editor are all absent by design.
   - `DELETE /ideas/comments/{comment_id}` → `OkResponse`: `delete_idea_events(request_id=…,
     comment_id=…)`, delete the row, commit.
   - `PUT /ideas/{idea_id}/read` → `MarkedResponse` (`require_auth_claims`; 404 idea):
     `mark_idea_events_read`, commit, `{"ok": True, "marked": n}`.
   - `create_idea`: `record_idea_event(kind="created", actor=author)` before the areas commit.
   - `vote_idea`: on `value == 1 and row is None` → `record_idea_event(kind="vote", actor=player_id)`;
     on `value == 0 and row is not None` → `delete_idea_events(request_id=…, kind="vote", actor_player_id=player_id)`.
   - `set_idea_status`: capture `(fr.status, fr.status_note)` before assigning; after cleaning, if the
     tuple changed → `record_idea_event(kind="status", actor=admin, status=…, status_note=…)`. A
     re-save of the same answer records nothing. *(P2 adds the push in the same branch.)*
   - `delete_idea`: `delete_idea_events(request_id=…)` and `delete_idea_comments(request_id=…)`
     beside the existing image/areas/votes loops.
   Route shapes `/ideas/comments/{comment_id}` beside `/ideas/{idea_id}/…` collide with nothing
   (different segment counts or methods); the guestbook's `/players/guestbook/{entry_id}` is the precedent.
8. **`routers/me.py`**: `@router.get("/me/notifications", response_model=MyNotificationsOut)` and
   the import. **Nothing else** — P3 owns the body.
9. **`make gen-types`**, then `frontend/src/api/types.ts`: in the FE-only literals
   `export type NotificationKind = "comment_reply" | "guestbook" | "poke" | "idea_created" |
   "idea_comment" | "idea_vote" | "idea_status";` (all seven now, so P3 never touches this file);
   under Ideas `export type IdeaComment = S["IdeaCommentOut"];`; a new block
   `export type MyNotification = Omit<S["MyNotificationOut"], "kind"> & { kind: NotificationKind };
   export type MyNotificationsResponse = Omit<S["MyNotificationsOut"], "items"> & { items: MyNotification[] };`.
   `api/notifications.api.ts`: delete the three hand-written types, import the two from `./types`,
   keep `listMyNotifications`. `ui/shell/NotificationBell.tsx`: change **only** the import of
   `MyNotification` / `MyNotificationsResponse` to `../../api/types` (P3 does the rest). Every test
   building an `Idea` literal gains `comments: []` — `grep -rln 'my_vote' frontend/src/test` finds them
   (`ideaMeta.test.ts` at least).
10. **Tests — `backend/tests/test_idea_comments.py` (new)**, the P1 matrix in the shape of
   `test_ideas.py`: `test_comments_ride_on_the_idea_payload_oldest_first`;
   `test_reader_may_not_comment_and_sees_no_comment_capabilities` (401s; `can_*` all False);
   `test_comment_permission_matrix` (Editor2 403 on Editor's comment for DELETE, the author and an
   admin 200, the *idea's* author 403; `can_delete` agrees with the codes);
   `test_comment_body_is_required_and_bounded`;
   `test_events_are_recorded_with_the_actor_already_read` (created/comment/vote/status kinds; a read
   row for the actor on each); `test_unvote_removes_the_vote_event_and_a_status_resave_records_nothing`;
   `test_mark_read_covers_every_event_and_is_idempotent` (`marked` = n, then 0);
   `test_deleting_an_idea_takes_comments_events_and_reads`; `test_deleting_a_comment_takes_its_event`.
   `tests/test_me_notifications.py` unchanged and green is the proof the response model fits the
   three existing kinds.

**What must not change.** The idea's own rule and flags; `_meta_line`; `push_idea_created`; the
area rules; `FeatureRequestVote` stays "the row is the vote"; the wire shape of every existing field.
**Old code boots against the new DB:** three additive tables, nothing altered; a rollback to
`4fb03fc` ignores them (an idea created under old code has no `created` event and no bell item for
admins — acceptable, and P6 writes it down).

**Definition of done.** The tests above green; `make test` ≥ 214; `make lint` clean; `make gen-types`
committed in the same commit as the models; `cd frontend && npm run check` green with the new
required `comments` field; on the isolated stack `GET /ideas` shows `comments: []` on every idea and
a posted comment on one; `PUT /ideas/{id}/read` answers `{ok, marked}`; **rollback check:** with the
P1 stack stopped, run the baseline backend (`git stash` or a second checkout of `4fb03fc`) against
`verify-p1.db` → boots, `GET /ideas` 200.

**Gates.** `make test`, `make lint`, `make gen-types` (committed), `cd frontend && npm run check`.

**Canon.** `AGENTS.md` §5 table list (+3 tables, the "event log, derived like the rest" rule) and §6
(the comment rule, the read endpoint) — P6 writes them.

**Deviations:**

- **The new shared thing this task owns is the audience helper**, and it lives with the rest of
  the event family in `backend/app/services/idea_events.py`:
  `idea_event_audience(s, *, request_id, kind, actor_player_id, idea_author_player_id=None,
  admin_player_ids=()) -> list[int]` — the sorted ids that should hear about one event, never
  including the actor. `created` → the ids the caller names as admins; `comment` → the idea's
  author ∪ every player with a comment row on that idea; `vote`/`status` → the author alone; an
  unknown kind → nobody. **Who is an admin is deliberately the caller's parameter**, because push
  resolves it from `secrets.json` (`admin_player_ids`) and the bell from the token's `role`, and
  this module must not become a third definition. Beside it, `idea_event_reaches(s, event, *,
  player_id, is_admin, idea_author_player_id=None) -> bool` is *the same call* asked about one
  person (`admin_player_ids=(me,) if is_admin else ()`), so the bell cannot drift from the push by
  construction — `test_idea_event_reaches_answers_exactly_the_same_question` asserts the two agree
  for every event × every viewer. **P2 addresses its pushes from the list form; P3 filters with the
  membership form; neither writes a rule of its own.** For P3 there is also
  `idea_ids_commented_on_by(s, player_id)`, a *narrowing* helper so the bell's SQL does not scan
  every event — it is not the rule, and the docstring says so.
- **Verified first, the gap was live** (2026-09-19, at `1c8808d`): `models.py` had exactly four
  `FeatureRequest*` classes (no Comment / Event / EventRead), `routers/ideas.py` mentioned
  "comments" once and only in a comment about the vote modal, `me.py` carried a `response_model`
  on `/me` alone, and `api/notifications.api.ts:5` still hand-wrote `MyNotification`. Nothing was
  already fixed.
- **No editing anywhere, so there is no `can_edit` on a comment.** The Decisions block's second
  pass removed the editor; a flag nothing can act on is a contract P4 would have rendered a pencil
  from, so `IdeaCommentOut` carries `can_delete` alone, there is no `PATCH /ideas/comments/{id}`
  and no `IdeaCommentPatchBody`. `FeatureRequestComment.updated_at` is kept (every sibling table
  has one and a later column would have to go through `_RUNTIME_COLUMNS`) but **nothing ever moves
  it**, which the payload test pins. **P4's step 3 still describes a `Pencil` button, an inline
  editor and a "· edited" byline: that text is stale**, as is the "Deferred" bullet about not
  notifying thread participants (the third-pass decision supersedes it). P6 should delete both.
- **Three tables, nothing altered, nothing in `_RUNTIME_COLUMNS`:** `FeatureRequestComment`,
  `FeatureRequestEvent`, `FeatureRequestEventRead`. **Old code boots against the migrated DB** —
  measured, not assumed: the baseline (`1c8808d`, extracted with `git archive` so `.git` was never
  touched) was run against `backend/data/verify-p1.db` *after* the new code had written all three
  tables. It booted, `GET /ideas` answered **200**, and it still created an idea and voted on it.
  The new code then read that idea back as `comments: []` with **no `created` event** — the
  documented consequence: an idea posted while rolled back gives the admins no bell item, and
  nothing else is lost.
- **The event log is written where the thing happens, and removed with it.** `record_idea_event`
  writes the row **and the actor's own read row** (the guestbook's trick, `players.py:675`), so
  "never tell me about my own action" is a stored fact rather than a filter every reader has to
  remember. A status event is recorded **only when `(status, status_note)` actually changed** — a
  re-save of the same answer is not news; an unvote deletes its `vote` event; deleting a comment
  deletes the event that names it (and its read rows); deleting an idea takes comments, events and
  reads. The reason is A9's: `featurerequest.id` and `featurerequestcomment.id` have no
  AUTOINCREMENT, so a row left pointing at a dead id silently reattaches to whatever takes that id.
- **`/me/notifications` is typed** (`MyNotificationsOut` / `MyNotificationOut`, seven kinds in one
  shape with `created_at` kept as `str`). **One wire nuance:** FastAPI now renders the optional
  keys an item does not use as explicit `null` (a `guestbook` item gains `"tournament_id": null`),
  where before the key was simply absent. Nothing that had a value changed, `exclude_none` was
  **not** used (it would have *removed* the deliberate `"author_player_id": null` a "General"
  comment carries), and the frontend type has always had those fields optional-and-nullable.
  `me.py` gained the `response_model` and its import and **nothing else** — the body is P3's.
- **`comments` is required on `IdeaOut`**, so the generated type is `IdeaComment[]` and no consumer
  guesses; `frontend/src/test/ideaMeta.test.ts` is the only literal in the app that needed
  `comments: []`. `api/types.ts` gained `IdeaComment`, all seven `NotificationKind`s and the two
  notification aliases (so P3 need not touch that file); `notifications.api.ts` lost its three
  hand-written types and keeps `listMyNotifications`; `NotificationBell.tsx` changed **only** its
  import line. The bell's icons and headlines still fall through to the poke branch for the four
  idea kinds — P3's job, and type-safe meanwhile.
- **Routes:** `POST /ideas/{id}/comments`, `DELETE /ideas/comments/{cid}`, `PUT /ideas/{id}/read`.
  The middle one is the guestbook's `/players/guestbook/{entry_id}` shape; it collides with nothing
  (`/ideas/{id}/image` needs a literal third segment), verified live. Writing needs `require_editor_claims`
  like posting an idea; `PUT …/read` takes any token; reading comments needs none.
- **Verified on the isolated stack** (backend **8071**, a copy of the prod DB as
  `backend/data/verify-p1.db`, a throwaway secrets file outside the repo, both since removed; no
  vite — this task ships no UI): every idea carries `comments`; a reader sees the list and
  `can_delete: false` and is **401** on every write; Berni's comment shows `can_delete` for Berni
  and for the admin but **not for the idea's own author** (403 on his delete attempt — the "the
  asker does not moderate" rule, live); `PUT /ideas/{id}/read` answered `{ok, marked: 3}` then
  `{ok, marked: 0}`, and **404** for an unknown idea; a real `guestbook` and a real `poke` came
  back through the new response model unchanged.
- **Tests:** `backend/tests/test_idea_comments.py`, **17 new** (the plan asked for 10) — the extra
  seven are the audience section, because three other tasks trust it: the actor is never in the
  audience (every kind × every actor), a commenter who is not the author is included, an admin who
  has not commented is not, a deleted comment drops its author unless they have another comment
  there, a vote and a status reach the author alone, `created` reaches only the admins the caller
  names, and the two forms of the helper agree. `tests/test_ideas.py` and
  `tests/test_me_notifications.py` are untouched and green — the proof the response model fits the
  three existing kinds.
- **Gates:** `make test` **223 passed**, 0 failed (206 on the branch before this task + 17 here;
  8m53s, the Pi was busy), `make lint` clean, `make gen-types` regenerated and committed with the models, `cd frontend && npm run check`
  green (**700 tests in 69 files**), `npm run build` green (the pre-existing >500 kB hint).
- **Not done, on purpose:** no WebSocket channel (the Decisions block, and §6's coverage row for
  `["ideas"]` is unchanged — comments ride under the same key and inherit its 5 s); no UI (P4); no
  push (P2); no bell body (P3); `AGENTS.md` and `DESIGN.md` untouched (P6).
- **One note on rule 3:** `git commit -o -- <paths>` refuses a path git has never heard of, so the
  two new files needed `git add --intent-to-add <those two files>` first — it stages no content and
  names nothing else. Everything else went in by path, as the rule says; the tree held only this
  task's files (this task runs alone).

---

## P2 — Push: commented, voted, status  ☑

**The gap.** `notification_texts.json` has one idea key (`idea_created`) per language;
`PERSONAL_DEFAULT_EVENT_TYPES` (`notifications.py:36`) has four members; the comment, vote and status
paths in `routers/ideas.py` push nothing.

**Verify first.**
```bash
grep -c '"idea_' backend/app/notification_texts.json                   # → 3
grep -n 'PERSONAL_DEFAULT_EVENT_TYPES = ' backend/app/services/notifications.py   # four members
```
In a scratch test with the `_Recorder` dispatcher from `test_ideas.py`: Editor creates an idea,
Editor2 comments → `sent == []`.

**The change.**

1. **`services/notifications.py`**: `PERSONAL_DEFAULT_EVENT_TYPES` += `"idea_commented"`,
   `"idea_voted"`, `"idea_status"`. Three helpers in the exact shape of `push_idea_created`
   (`push_dispatcher_from_request`, `localized_push_message`, `enqueue_personal_for_player`), each
   returning `bool` — `False` and nothing queued when the actor **is** the idea's author:
   - `push_idea_commented(request, *, idea_id, title, author_player_id, actor_player_id, actor_name, preview, comment_id)`
     — text key `idea_commented`, path `/ideas?idea={idea_id}`, tag `idea-comment-{idea_id}`,
     `event_type="idea_commented"`, data `{idea_id, comment_id}`, context `author_name=actor_name,
     title, preview`.
   - `push_idea_voted(request, *, idea_id, title, author_player_id, actor_player_id, actor_name, vote_count)`
     — key `idea_voted`, tag `idea-vote-{idea_id}`, data `{idea_id, vote_count}`, context
     `author_name=actor_name, title, vote_count`.
   - `push_idea_status(request, *, idea_id, title, author_player_id, actor_player_id, status, status_note)`
     — key `idea_status`, tag `idea-status-{idea_id}`, data `{idea_id, status}`, context `title,
     status, status_note_line=("\n" + status_note) if status_note else ""`.
   In Roli's drafts `{author_name}` names the *actor* (the commenter, the voter) while in
   `idea_created` it names the idea's author; the placeholder name is kept as drafted.
   Per-kind tags, not one `idea-{id}`: an OS notification with the same tag replaces the previous
   one, and "Berni commented" must not be overwritten by "Flo wants it".
2. **`services/notification_texts.py`**: `_status_label(status, language)` beside `_mode_label`, and
   in `render_notification_text`: `if "status_label" not in prepared and "status" in prepared:
   prepared["status_label"] = _status_label(str(prepared["status"]), resolved_language)`. Words:
   | status | english | deutsch | steirisch (Roli's to correct) |
   |---|---|---|---|
   | new | new | neu | neich |
   | planned | planned | geplant | eiplant |
   | doing | in progress | in Arbeit | in Arbeit |
   | done | done | erledigt | fertig |
   | declined | declined | abgelehnt | obglehnt |
3. **`notification_texts.json`** — nine entries, verbatim (Styrian = Roli's drafts, adjusted only
   for the note line and for his two second-pass corrections — the neutral "wos gmoant is." and the
   singular/plural `{vote_line}`; German ASCII-safe like every German string in the file):
   ```json
   "idea_commented": { "title": "{author_name} hot wos zu deiner Idee gsogt",
                       "body":  "{title}\n{preview}\nSchau eini, wos gmoant is." },
   "idea_voted":     { "title": "{author_name} mog dei Idee",
                       "body":  "{title}\n{vote_line}\nSchau eini." },
   "idea_status":    { "title": "Dei Idee is jetzt {status_label}",
                       "body":  "{title}{status_note_line}\nSchau eini, wos si tuat." }
   ```
   ```json
   "idea_commented": { "title": "{author_name} hat deine Idee kommentiert",
                       "body":  "{title}\n{preview}\nOeffne die Ideen-Seite und lies, was gemeint ist." },
   "idea_voted":     { "title": "{author_name} will deine Idee auch",
                       "body":  "{title}\nJetzt sind es {vote_count}, die das wollen.\nOeffne die Ideen-Seite, wenn du sehen willst, wer." },
   "idea_status":    { "title": "Deine Idee ist jetzt {status_label}",
                       "body":  "{title}{status_note_line}\nOeffne die Ideen-Seite fuer den Stand." }
   ```
   ```json
   "idea_commented": { "title": "{author_name} commented on your idea",
                       "body":  "{title}\n{preview}\nOpen Ideas to read what they mean." },
   "idea_voted":     { "title": "{author_name} wants your idea too",
                       "body":  "{title}\nThat makes {vote_count} who want it.\nOpen Ideas to see who." },
   "idea_status":    { "title": "Your idea is now {status_label}",
                       "body":  "{title}{status_note_line}\nOpen Ideas to see where it stands." }
   ```
4. **`routers/ideas.py`** call sites, after each commit: in the comment endpoint, preview by the
   guestbook's rule (`text if len(text) <= 120 else text[:117].rstrip() + "..."` — the push preview
   rule; do not import `_snippet`); in `vote_idea` on a new vote, `vote_count` = one count query
   after the commit; in `set_idea_status` inside the "changed" branch. The idea's `title` and
   `author_player_id` come from `fr`; the actor's name from `s.get(Player, actor_id)`.
5. **Tests** — `tests/test_ideas.py`, push section, `_Recorder` pattern:
   `test_a_comment_a_vote_and_a_status_are_pushed_to_the_idea_author_only` (targets `== [author]`,
   `event_type`, `path`, per-kind tags, context; all three languages render with the actor's name
   and the title; `status_label` is the translated word in each language);
   `test_nothing_is_pushed_for_ones_own_action` (author comments/votes on own idea, admin sets a
   status on their own idea → `sent == []`); `test_idea_events_reach_the_default_notification_mode`
   (the three keys in `PERSONAL_DEFAULT_EVENT_TYPES`, none in `FINISHED_ONLY_EVENT_TYPES`); one
   delivery test through the real `_deliver` with the POST faked, admin/editor devices as in
   `test_the_idea_push_is_delivered_to_the_admin_devices_in_each_language`, asserting the
   **author's** devices get the comment push and the commenter's do not.
   `tests/test_push_notifications.py::test_notification_text_catalog_is_complete_and_renderable`:
   add `"title": "Dark mode"`, `"preview": "…"`, `"vote_count": 2`, `"status": "planned"`,
   `"status_note_line": "\nsoon"` to its context dict — nothing else in that file.

**What must not change.** `push_idea_created` and its admin audience; `enqueue_personal_push`
(broadcast + lift) is **not** the mechanism here — the precedent for ideas is the narrow one; the
existing text keys; `_mode_label`/`_authors_line`.

**Definition of done.** Tests above green; every language renders every new key
(`test_notification_text_catalog_is_complete_and_renderable`); `make gen-types` → **no diff** (no
response model touched); `make lint` clean.

**Gates.** `make test`, `make lint`, `make gen-types` (expect no diff).

**Canon.** `AGENTS.md` §5 push paragraph and §6's idea paragraph name the three new personal events
(P6).

**Deviations:**

- **Verified first, the gap was live** (2026-09-19, at `bdc25a0`): the catalog had exactly 3
  `"idea_*"` keys, `PERSONAL_DEFAULT_EVENT_TYPES` had 4 members, and the comment/vote/status
  paths in `routers/ideas.py` called no push helper. Nothing was already fixed.
- **The three new helpers take `s: Session`, which the plan's signature list did not show.**
  They must — `idea_event_audience` (P1's audience helper, imported and never re-derived) needs a
  session to read the comment-participant rows for a `comment` event, and every endpoint that
  calls these helpers already has `s` open. Without it there would be no way to honour rule 8
  ("P2 addresses its pushes from the list form") short of re-deriving the audience locally, which
  is exactly what the caller's brief forbids. `request`, `s`, `idea_id`, `title`,
  `author_player_id`, `actor_player_id` are otherwise exactly as specified.
- **Each of the three helpers computes its own full audience and loops the enqueue itself** — one
  call per event, in the shape of `push_idea_created` (which loops over `admin_player_ids` the
  same way) — rather than the router looping and calling the helper once per recipient. For
  `vote`/`status` the audience is always "the author alone or nobody", so this is invisible in
  practice; for `comment` it is not: the idea's own author plus every other commenter, minus the
  actor, can be several people, and only the helper itself (holding `s`) can compute that set.
  This is what makes the third-pass audience decision ("a comment reaches the idea's author plus
  everyone who has already commented") actually true for push, not just for the bell — verified
  directly (`test_a_comment_a_vote_and_a_status_are_pushed_to_the_idea_author_only`, plus the two
  delivery tests below).
- **`_vote_line(vote_count, language)`** (new, `notification_texts.py`, beside `_status_label`) is
  the mechanism behind Roli's second-pass correction — a literal "Jetzt san's 1" reads wrong —
  computed generically for every language but **only referenced by the Steirisch `idea_voted`
  template**; German and English keep the `{vote_count}` they were drafted with, inline, unchanged
  from the plan's JSON, so no copy not explicitly corrected was touched. `_status_label` follows
  the `_mode_label` precedent exactly, both wired into `render_notification_text` the same way
  `mode_label`/`authors_line` already are (compute once if the raw field is present and the
  rendered one is not).
- **The Steirisch `idea_commented` body reads "Schau eini, wos gmoant is."** — the neutral form
  from the second-pass correction, not "wos er moant" as it still stood in this section's own
  drafted JSON before that correction (§"Answered 2026-09-19 (second pass)"). Every other string
  is Roli's draft transcribed as written — his to correct, not mine.
- **The comment preview follows the guestbook's own 120-char rule inline**
  (`text if len(text) <= 120 else text[:117].rstrip() + "..."`), not `_snippet` — as the task
  named it. `vote_count` is one extra `select(...).all()` over `FeatureRequestVote` after the
  commit (no `func.count()` import needed, consistent with how `list_idea_voters` already reads
  the same table). `status_note_line` is built at the call site exactly like `goal_note_line`
  (`routers/comments.py:573`) — a computed `\n`-prefixed line that vanishes when empty, never a
  helper of its own.
- **`create_idea_comment`, `vote_idea` and `set_idea_status` each gained a `request: Request`
  parameter and now capture `fr = get_or_404(...)`** (previously the idea row was fetched and its
  return value discarded in all three) so the idea's `title` and `author_player_id` are on hand
  for the push call without a second query. `set_idea_status` also gained a local `changed` flag
  in place of the inline `if (fr.status, fr.status_note) != before:` so the same condition gates
  both `record_idea_event` and the push call without evaluating the tuple comparison twice.
- **Verified:** `make test` **228 passed**, 0 failed (a shared run against the group-A worktree, so
  it includes P3's and P4's in-flight, uncommitted files too — expected per the plan's own note on
  parallel workers; my own 4 tests are part of that count). `make lint` clean on the full tree.
  `make gen-types` → **no diff**, confirmed against `git diff --stat` on `schema.d.ts` before and
  after — no response model touched, as expected.
- **What could not be exercised, and why:** push delivery over the wire (no VAPID configured, no
  `cryptography` in this venv) — substituted, as R5/P1 did, by stopping at the queued
  `PushMessage` for the audience/context assertions and by running the real
  `NotificationDispatcher._deliver` with only the HTTPS POST faked
  (`test_the_idea_comment_push_is_delivered_to_the_author_and_not_the_commenter`), which proves the
  per-device language rendering and the author/commenter split actually reach `_deliver_one`, not
  just the queue. The "everyone who has already commented" half of the `comment` audience for a
  thread with three or more participants is P1's own matrix
  (`test_idea_comments.py`) against `idea_event_audience` directly — not re-proven here, since P2
  imports that function and never re-derives its rule (rule 8).
- **Left alone, as instructed:** `push_idea_created` and its admin audience; `enqueue_personal_push`
  (not used — the narrow `enqueue_personal_for_player` precedent stands); the six existing text
  keys; `_mode_label`/`_authors_line`; `idea_events.py` (imported only, not edited — P3 owns it
  this batch).

---

## P3 — Bell: the four idea kinds with read state  ☑

**The gap.** `me.py:59-190` builds exactly three kinds; an idea event has no in-app trace.

**Verify first.**
```bash
grep -n '"kind": "' backend/app/routers/me.py    # → 3 hits: comment_reply, guestbook, poke
```
Against the P1 stack: Editor posts an idea, Editor2 comments and votes, Admin sets `planned` →
`GET /me/notifications` as Editor → `items == []`.

**The change.**

1. **`services/idea_events.py`**: `unread_idea_events(s, *, player_id, is_admin, limit=100) ->
   list[tuple[FeatureRequestEvent, FeatureRequest, str | None]]` — events joined to their idea,
   where (`FeatureRequest.author_player_id == player_id` and kind in `("comment","vote","status")`)
   **or** (`is_admin` and kind == `"created"`), `actor_player_id != player_id`, and no
   `FeatureRequestEventRead(player_id, event.id)` (the `~exists()` idiom `me.py:72-75` already uses);
   ordered `created_at desc, id desc`, limited; the third element is the comment body for `comment`
   events (one `in_` query), else `None`.
2. **`routers/me.py`**, section **D) Idea events**: `is_admin = str(claims.get("role") or "") == "admin"`
   — the token's role is the same source as `admin_player_ids` (`player_accounts[].admin`), so this
   adds no second definition of "who is an admin". Per row: `kind` from `{"created": "idea_created",
   "comment": "idea_comment", "vote": "idea_vote", "status": "idea_status"}[event.kind]`, `id =
   event.id`, `idea_id`, `idea_title = fr.title`, `idea_status = event.status or None`,
   `author_player_id = event.actor_player_id` (added to `author_ids` so the existing name loop fills
   `author_name`), `snippet = _snippet(comment body)` for `comment`, `_snippet(event.status_note)`
   for `status`, `""` otherwise, `created_at = event.created_at.isoformat()`, `path =
   f"/ideas?idea={fr.id}"`. The existing sort/cap stays.
3. **`ui/shell/notificationText.ts` (new)**: `notificationHeadline(n: MyNotification): string` and
   `notificationDetail(n: MyNotification): string`, moving the three existing headlines out of the
   bell. New headlines: `idea_created` → `${author_name} shared an idea`; `idea_comment` →
   `${author_name} commented on your idea`; `idea_vote` → `${author_name} likes your idea`
   (**Roli's own word**, the second-pass answer above — not the board's "wants", which this line
   carried when the plan was written); `idea_status` → `${author_name} set your idea
   to ${IDEA_STATUS_LABEL[n.idea_status]}` (import from `pages/ideas/ideaMeta` — precedent
   `ui/shell/routeHierarchy.ts:1` importing `pages/stats/statsNav`; unknown status → the raw value).
   Detail: for the three old kinds `n.snippet` as today; for idea kinds `n.idea_title` alone, or
   `${n.idea_title} · ${n.snippet}` when the snippet is non-empty (the app's ` · ` separator).
4. **`NotificationBell.tsx`**: `kindIcon` gains `Lightbulb` (`idea_created`), `MessageSquare`
   (`idea_comment`), `ThumbsUp` (`idea_vote`), `ListChecks` (`idea_status`) — lucide, `h-4 w-4` like
   the three there; headline/detail through `notificationText.ts`; the doc comment lists the seven
   kinds. `openItem`'s optimistic drop (`kind` + `id`) already works: event ids are unique across kinds.
5. **Tests.** `tests/test_me_notifications.py::test_idea_events_reach_the_bell_and_drop_off_when_read`:
   Editor's idea; Editor2 comments + votes; Admin sets `planned` with a note → Editor's items are the
   three idea kinds with `path == f"/ideas?idea={iid}"`, `idea_title`, the comment snippet, the
   status snippet and `idea_status == "planned"`; Editor2's items contain none of them; Admin's items
   contain one `idea_created` for Editor's idea and none for Admin's own; `PUT /ideas/{iid}/read` as
   Editor → `unread_count` 0; an unvote by Editor2 removes the vote item for a fresh viewer.
   `frontend/src/test/notificationText.test.ts` pins all seven headlines and the detail composition.

**What must not change.** The three existing sections A–C of `me.py`; `_NOTIF_LIMIT`, `_SNIPPET_MAX`;
the bell's popover markup, its 60 s poll, its optimistic drop; the page-side marking (P4's job).

**Definition of done.** Tests green; on the P3 stack as Editor the bell shows the three idea items
with their titles under the headlines, tapping one navigates to `/ideas?idea=<id>` and the badge
drops by one; `make gen-types` → no diff; `npm run check` green.

**Gates.** `make test`, `make lint`, `cd frontend && npm run check`; browser at 390 (`blue`) for the
popover rows.

**Canon.** `AGENTS.md` §6 coverage-table row for `["me","notifications"]`: "…a poke, a guestbook
entry or an **idea event** does not" (P6).

**Deviations:**

- **Verified first, the gap was live**: `grep -n '"kind": "' backend/app/routers/me.py` found exactly
  the three hits the task named (`comment_reply`, `guestbook`, `poke`); `/me/notifications` as a
  fresh Editor after Editor2 comments/votes and Admin sets a status answered `items == []`. Nothing
  was already fixed.
- **`idea_events.py` gained one function, `unread_idea_events`**, beside P1's audience helpers — no
  change to `idea_event_audience`/`idea_event_reaches`'s signature or behaviour (P2's running push
  depends on them). Its SQL narrowing is deliberately **loose**, not the literal author-only filter
  the task text sketched: a candidate is any event on an idea this player authored *or has
  commented on* (`comment`/`vote`/`status`), plus `created` for an admin — because a `comment` event
  must reach every participant, not just the idea's author, and a narrowing that only checked
  authorship would silently under-deliver that case even though none of this task's own named tests
  would have caught it. Every candidate row is then confirmed through `idea_event_reaches` itself
  before being kept, so the narrowing can only waste a row, never award or withhold one on its own
  authority — "the predicate that decides must stay that one function" (rule 8), verified by
  `idea_event_reaches`'s own docstring naming these exact three candidate sets. Comment bodies are
  resolved in one follow-up `in_` query over the kept rows, as specified.
- **`routers/me.py`** gained one import, one small `_IDEA_EVENT_KIND` map beside the existing
  `_NOTIF_LIMIT`/`_SNIPPET_MAX` constants, and section **D) Idea events** — sections A–C, the limit,
  the snippet cap and the final sort/cap are untouched. `is_admin` reads `claims.get("role")`
  exactly like `comments.py:91`/`players.py:709`/`services/authorization.py:59` — no second
  definition of "who is an admin".
- **`ui/shell/notificationText.ts` (new)** holds `notificationHeadline`/`notificationDetail`, moving
  the three old inline headlines out of the bell. `idea_vote`'s headline is **"likes your idea"**,
  per the Decisions block's second-pass answer ("Roli's own word for it, not the board's 'wants'"),
  **not** the "wants your idea too" text this task section itself still carried — the later decision
  wins, as rule 9's "fold these in wherever the tasks still ask" says. An unknown `idea_status` value
  falls back to the raw string (`ideaStatusLabel`), matching the task's "unknown status → the raw
  value" and `IdeaOut.areas`' precedent for an unrecognised catalog key.
- **`NotificationBell.tsx`**: `kindIcon` gained the four lucide icons named in the task
  (`Lightbulb`/`MessageSquare`/`ThumbsUp`/`ListChecks`) with a doc comment listing all seven kinds;
  the local `headline()` function and the inline `n.snippet` render were replaced by
  `notificationText.ts`'s two exports. Popover markup, the 60 s poll and `openItem`'s optimistic
  `(kind, id)` drop are byte-for-byte unchanged — event ids are unique across kinds, confirmed live.
- **Verified on the isolated stack** (backend **8073**, vite **8083**, `backend/data/verify-p3.db`,
  a throwaway secrets file outside the repo, both since removed): Flo posts an idea, Berni comments
  and votes, Roli sets it to `planned` with a note → **Flo's** bell shows exactly the three idea
  items (`idea_comment`/`idea_vote`/`idea_status`), each `path == /ideas?idea=<id>`, with the comment
  and status-note snippets; **Berni**, the actor for the comment and the vote, sees neither; **Roli**
  (admin) sees one `idea_created` for Flo's idea and none for an idea Roli posted themself. An
  unvote by Berni on a second idea removed the vote item for Flo without a page reload (checked via
  `/me/notifications` before/after); deleting Berni's comment removed only the comment item and left
  a live vote item in place; deleting the idea removed all three. `PUT /ideas/{id}/read` zeroed
  `unread_count`. Screenshot-verified the popover at 390×844 and 1280×900, `blue` and `light`
  (`document.querySelectorAll("a a").length === 0`, 0 console errors in all four): the four idea rows
  render with the right icon, headline and `title · snippet` detail line, and clicking one navigates
  to `/ideas` and clears the badge (P4's `?idea=` read-marking effect was already live in the shared
  tree and composed correctly with this task's items — not this task's code).
- **Gates:** `make test` **224 passed**, 0 failed (223 on the branch before this task + 1 here;
  17m47s, the Pi was running P2's and P4's full suites at the same time), `make lint` clean,
  `cd frontend && npm run check` **717 tests in 71 files**, 0 errors (one pre-existing warning in
  `pages/ideas/IdeasPage.tsx`, P4's file, untouched by this task). `make gen-types`: not run — this
  task adds no field to any response model, so there is nothing to regenerate; confirmed no diff in
  `schema.d.ts` from this task's own edits.
- **Not done, on purpose:** no change to the popover's structural markup beyond the two lines the
  task named; no change to `_NOTIF_LIMIT`/`_SNIPPET_MAX`; no page-side read-marking (P4's `?idea=`
  effect, already present in the shared tree).

---

## P4 — The board: comments under an idea, and reading marks read  ☑

**The gap.** `IdeaCard.tsx` renders no comment control; `useIdeaMutations.ts` has no comment or
read mutation; the `?idea=` effect in `IdeasPage.tsx:106-126` flashes the idea and marks nothing.

**Verify first.**
```bash
grep -c 'comment' frontend/src/pages/ideas/IdeaCard.tsx     # → 0
grep -c 'read' frontend/src/pages/ideas/useIdeaMutations.ts # → 0
```
In the browser on the P1 stack, an idea with a comment (posted with curl) shows nothing of it.

**Realtime — decided: no channel.** The coverage table (`AGENTS.md` §6, `cachePolicy.ts:179-184`)
asks one question of every key: *how does a change reach a client that is already looking at this
data?* For `["ideas"]` the answer is a refetch, on purpose — R5's board has no channel and 5 s
`staleTime`, and `refetchOnWindowFocus` is on. A comment hangs on the idea and rides in the same
payload under the same key, so the answer is the same: the writer's own mutation invalidates
`qk.ideasAll()`; anyone else gets it on the next return, focus or interaction (a vote invalidates the
whole namespace). Two people on the board at the same second is the only case a channel would
improve, for a few comments a week, at the cost of a new WS endpoint + manager in `app/ws.py`, a
`wsEvents.ts` mirror, an `applyEvent` reducer, a resync hook and a coverage row. The reasoning the
table records did not change because the payload grew. The bell's row stays `partial` / 30 s: an idea
event reaches it inside its 60 s poll or on focus, exactly as a guestbook entry does today.

**The change.**

1. **`api/ideas.api.ts`**: `createIdeaComment(token, ideaId, body) → IdeaComment`
   (`POST /ideas/${ideaId}/comments`), `deleteIdeaComment(token, commentId) → {ok}` — no patch
   call, there is no PATCH endpoint — `markIdeaRead(token, ideaId) → {ok, marked}`
   (`PUT /ideas/${ideaId}/read`).
2. **`useIdeaMutations.ts`**: `commentMut` and `deleteCommentMut` (both `onSuccess: refresh`), and
   `markReadMut` whose `onSuccess` invalidates **`qk.notificationsAll()` only** — reading changes
   nothing on the board.
3. **`pages/ideas/IdeaComments.tsx` (new)** — one component, props `{ idea, token, open, onToggle,
   avatarUpdatedAtByPlayerId, onPost, onRequestDelete }` (no `onSave`: nothing edits a comment):
   - **The toggle** lives in `IdeaCard`'s actions row (between the voters button and the `ms-auto`
     span): a ghost `Button` with `MessageSquare size={14}` + `fmtCount(n, "comment", "comments")`
     when `n > 0`; when `n === 0`: label **Comment** for a logged-in viewer (it opens the composer),
     **no control at all for a reader** (a control that does nothing is never shown — §9b).
     `aria-expanded={open}`, `title` "Show comments" / "Hide comments".
   - **The block**, rendered under the actions row when `open`: **flat rows on the idea's own inset
     surface behind the reply rail** — `mt-2 border-l-2 border-accent/25 pl-3 space-y-2` — because
     an idea row *is* the level-2 `inset` and inset → inset is forbidden (§3); this is the shape a
     reply already takes under a guestbook root (§9b, `GuestbookEntryCard.tsx:96`). Each comment:
     `AvatarCircle` `h-6 w-6` inside a decorative `PlayerLink`, name as a `PlayerLink`
     (`text-xs font-semibold`), `fmtDateTime(created_at)` with **no "edited" suffix** (comments
     cannot be edited), body `whitespace-pre-wrap text-sm`, and — from the `can_delete` flag only —
     a single `Trash2` `size={14}` icon ghost button `h-7 w-7 p-0` (`title` "Delete comment").
     **There is no `Pencil`, no inline editor and no `can_edit` flag**: P1 shipped no PATCH
     endpoint, so a pencil here would be a control with nothing behind it.
   - **The composer** is the block's last row when `token`: `CommentSendRow` from
     `pages/live/comments/CommentComposer.tsx` — `placeholder="Write a comment…"`,
     `ariaLabel="Comment on this idea"`, `sendLabel="Post comment"`, `canSubmit = !!draft.trim()`,
     `focusNonce` bumped after a post. Ctrl/Cmd+Enter sends (inherited). Not sticky: it is one row
     under one idea, not the feed's row. A reader sees the list and no composer (the card's bottom
     edge already says "Log in as a player to post an idea or vote for one." — extend that line to
     "…, vote for one or comment.").
4. **`IdeaCard.tsx`**: `const [commentsOpen, setCommentsOpen] = useState(false)`, forced open by
   `useEffect(() => { if (flash) setCommentsOpen(true) }, [flash])` (the deep link); mount
   `<IdeaComments …>` inside the non-editing branch after the actions row. `IdeaCardHandlers` gains
   `onOpenComments(idea)`, `onPostComment(idea, body): Promise<void>`,
   `onRequestDeleteComment(comment)`.
5. **`IdeasPage.tsx`**: the handlers (`commentMut` etc. with `savingId` as the idea editor does);
   `pendingDeleteComment` state + a **`ConfirmDialog`** ("Delete this comment?", subtitle
   `${author} · ${fmtDateTime(created_at)}`, body "The comment is removed for good.", red block —
   something stored is deleted; C7's rule); `ErrorToastOnError` for the three new mutations
   ("Could not post the comment" / "Could not delete the comment").
   **Marking read:** in the existing `?idea=` effect, after `setFlashId(deepLinkId)` →
   `if (token) markReadMut.mutate(deepLinkId)`; `onOpenComments` → `if (token) markReadMut.mutate(idea.id)`.
   Both idempotent server-side; no local dedupe needed.
6. **Tests — `frontend/src/test/ideaComments.test.tsx`**: with two comments and a token: the toggle
   reads "2 comments", opens the list with both bodies, the composer is present, posting calls
   `onPost` with the trimmed body and clears the field; with zero comments: "Comment" for a token,
   nothing for a reader; `can_delete: false` hides the trash; one comment reads "1 comment"
   (`fmtCount`). **No "edited" case** — nothing moves `updated_at` and no byline reads it.

**What must not change.** `IdeaComposer`, `IdeaFields`, `ideaMeta.ts` (nothing new is needed
there), the idea editor and status editor, the delete-idea dialog, `CommentComposer.tsx` (reused as
is; if `CommentSendRow` needs a prop it does not have, stop and report — that file is nobody's this
batch), `types.ts` (P1 added `IdeaComment`).

**Definition of done.** At 390×844 and 1280×900 in `blue` **and** `light`, on the P4 stack: an idea
with 0, 1 and 3 comments renders; Berni's comment on Roli's idea appears in Roli's list after the
mutation without a reload; Berni sees the trash on his own comment and not on Roli's (there is no
edit control anywhere); Roli (admin) sees it on both; the confirm dialog opens and deletes; the
reader build shows comments and no controls; opening `/ideas?idea=<id>` as the idea's author expands its comments, flashes it, and
`GET /me/notifications` afterwards is one item shorter (P3 running or not — the endpoint is P1's);
`document.querySelectorAll("a a").length` = 0; no horizontal overflow; 0 console errors;
`npm run check` and `npm run build` green.

**Gates.** `cd frontend && npm run check && npm run build`; browser at 390/1280 × blue/light.

**Canon.** `DESIGN.md` §9b gains one bullet (P6 writes it): *a flat comment list under a row that is
itself an `inset` (the Ideas board) takes the reply shape — flat rows behind the accent rail, the
chat row last — never an `inset` of its own.* §5b: "wants … too" is the vote verb on the Ideas
board (bell and push agree).

**Deviations:**

- **No new shared thing** — `IdeaComments.tsx` reuses `CommentSendRow`, `PlayerLink`, `AvatarCircle`,
  `ConfirmDialog`, `fmtCount`, `fmtDateTime`, `ErrorToastOnError` and `qk.notificationsAll()`
  exactly as they exist; nothing generalized, nothing new for another surface to find later.
- **Verified first, both gaps were live** (at `bdc25a0`): `grep -c 'comment'
  frontend/src/pages/ideas/IdeaCard.tsx` → 0, `grep -c 'read'
  frontend/src/pages/ideas/useIdeaMutations.ts` → 0. Nothing was already fixed.
- **No editing anywhere, confirmed against P1's correction and one more stale line this task's own
  text still carried:** no `Pencil`, no `can_edit`, no "edited" byline — `updated_at` is read
  nowhere. The plan's own step-6 test bullet ("`updated_at !== created_at` prints 'edited'") is the
  same stale passage under a different heading (P1 struck it from step 3 and the Deferred list in
  `bdc25a0` but this one survived); it is not implemented, and `IdeaComments` carries no `can_edit`
  prop at all — `IdeaCommentOut` (generated schema) has only `can_delete`, so there is nothing to
  render a pencil from.
- **One component, mounted once — but not literally *inside* the actions row.** The toggle and the
  panel are both `IdeaComments`, a single default export, called once from `IdeaCard` right after
  the actions row (`<div className="flex flex-wrap items-center gap-2 …">…</div>` closes, then
  `<IdeaComments …/>` as the next sibling in the `space-y-2` column) rather than as a flex child
  wedged between the voters button and the `ms-auto` Edit/Delete span. Tried the literal reading
  first — a `w-full` fragment child forcing a flex-wrap line break inside the actions row — and
  rejected it: with `flex-wrap`, a `w-full` item starts a fresh line and so does whatever follows
  it, which pushes the idea's own Edit/Delete controls *below* the comment thread once it is open
  (worse the longer the thread). Mounting the whole thing after the row keeps Edit/Delete anchored
  to the compact row and the thread expanding under it, which is what "under the actions row" (the
  block's own instruction, two sentences later in the same task) already asks for. Noted here
  because the two sentences point at different DOM positions and I picked the one that does not
  regress the row above it.
- **Draft, "posting" and focus-nonce are local `useState` inside `IdeaComments`, not lifted to
  `IdeasPage`.** `commentMut` is one shared mutation object for every idea's composer; if its own
  `isPending` drove every card's `submitting` prop, posting on one idea would grey out every other
  idea's send button on screen. Keeping the draft and the in-flight flag inside the one card
  instance that owns them avoids inventing a per-idea id map for state three lines of local
  `useState` already give for free.
- **Dropped the `busy` prop and `onSave`** from the component's originally sketched signature: no
  edit exists, so `onSave` has nothing to call; deleting a comment goes through the same
  `ConfirmDialog` shape the idea's own delete already uses, with no extra guard beyond what that one
  has either (the dialog closes on confirm before the mutation settles — an accepted, pre-existing
  gap, not a new one).
- **Read-marking:** the deep-link effect calls `markReadMut.mutate(deepLinkId)` guarded on `token`;
  `IdeaCard`'s `onOpenComments` fires only on a *manual* open (the toggle), not on the flash-forced
  open from the same deep link, so the same idea is never marked read twice in one visit. Fixed the
  resulting `react-hooks/exhaustive-deps` warning by adding `token`/`markReadMut` to that effect's
  dependency array (harmless here — the effect already bails via a ref guard on repeat runs).
- **Found and fixed a real lint error along the way, not asked for by this task but required to
  ship it:** the natural `useEffect(() => { if (flash) setCommentsOpen(true) }, [flash])` triggers
  `react-hooks/set-state-in-effect` (a hard error in this repo's `eslint-hooks` config, not a
  warning). Replaced with React's own "store the previous prop, compare during render" shape (no
  effect at all) — `const [prevFlash, setPrevFlash] = useState(flash); if (flash !== prevFlash) {
  setPrevFlash(flash); if (flash) setCommentsOpen(true); }` — in `IdeaCard.tsx`.
  `IdeaComposer.tsx`'s own `useEffect` for autofocus was left alone: it calls `.focus()`, not
  `setState`, so the rule never fires there.
- **The reader's footer line was extended**, as the plan's own composer bullet asked: "Log in as a
  player to post an idea or vote for one." → "…, vote for one or comment."
- **Verified on the isolated stack** (backend **8074**, a copy of `backend/app.db` as
  `backend/data/verify-p4.db`, vite **8084**, a throwaway secrets file outside the repo — all since
  removed, ports and the DB copy killed by exact PID only), via a headless Chromium driven from
  `playwright-core` (no `playwright` package in this repo; the browsers and the driver were already
  cached on this machine from another project, used read-only): **63/63 checks passed** across
  390×844 and 1280×900, `blue` and `light`. Covered: the idea-1 toggle reading "1 comment" from a
  seeded comment; opening it and seeing the body; posting a trimmed comment as Berni and seeing it
  appear with no reload, the count moving to "2 comments"; deleting that own comment via the trash +
  `ConfirmDialog` and seeing it gone; a reader (no token) seeing the remaining comment with no
  composer and no delete button anywhere; a second idea authored by **Berni** (non-admin) with a
  comment from **Flo** — Berni (the idea's own author, not the comment's author, not admin) has
  **no** delete button on Flo's comment, Flo has one on his own, and Roli (admin, neither author)
  has one too, exercising the "the idea's author does not moderate" rule against an author who is
  not also the admin (the fixture data — Roli — would have hidden this, since admin always sees
  delete regardless of the rule under test); the `?idea=1` deep link firing `PUT /ideas/1/read` and
  forcing that idea's thread open with its comment visible; no horizontal overflow at either width in
  either theme; 0 console errors. `document.querySelectorAll("a a").length` was checked with
  comments open as Berni, as a reader, as the non-admin author, as the comment's author and as the
  admin — **0** in every case.
- **Gates:** `cd frontend && npm run check` green — **717 tests in 71 files** passed at the point
  this task's suite ran; P2 and P3 were committing to the same working tree in parallel (P2's
  checkbox was already ticked when this section was written), so that total is not purely P4's —
  this task's own contribution is exactly the 5 tests in the 1 new file
  (`frontend/src/test/ideaComments.test.tsx`). `npm run build` green (the pre-existing `>500 kB`
  chunk hint, `index-*.js` 730 kB). No response model was touched, so no `make gen-types` run.
- **Left alone, as the task said to:** `IdeaComposer.tsx`, `IdeaFields.tsx`, `ideaMeta.ts`,
  `types.ts`, `CommentComposer.tsx` (used as-is; `CommentSendRow` needed no prop it did not have).

---

## P6 — Documentation pass (runs LAST)  ☑

Changes no code. Reads every task's **Canon** and **Deviations** and edits the two canon files once.

- **`AGENTS.md`** — header "Last full review" date and sha; §2 backend modules (`services/idea_events.py`),
  frontend modules (`push/pushSetup.ts`, `ui/shell/PushSetupNotice.tsx`, `ui/shell/notificationText.ts`,
  `pages/ideas/IdeaComments.tsx`); §5 tables list (`FeatureRequestComment`, `FeatureRequestEvent`,
  `FeatureRequestEventRead`) and a paragraph under the Ideas board bullet: the event log, "derived
  like the rest", the read endpoint, the comment rule; §5 push sentence (personal events now include
  the three idea events); §6 the Ideas paragraph (comments, `PUT /ideas/{id}/read`, the four
  events, the push rule "the author, never the actor") and the `/ideas` prefix list; §6 coverage
  table — `["ideas"]` row unchanged in number, reason extended ("comments ride in the same payload"),
  `["me","notifications"]` row ("…or an idea event does not"); §9 tracker list (this file); §10 the
  reinstall gotcha (P5's Canon line, verbatim) and "`/me/notifications` is typed"; §11 current state
  (branch, what landed, test counts, **not deployed**, what only the phone verified).
- **`DESIGN.md`** — §2 nothing new (the notice uses `warn` as defined); §9b the flat-list bullet;
  §5b the vote verb.
- This file: the final counts under "Verification gates".

**Deviations:**

- **Every Canon line a task wrote was transcribed, with one exception, and the exception is not a
  judgement call — the code contradicts it.** P4's `DESIGN.md` §5b line (*"wants … too" is the vote
  verb on the Ideas board (bell and push agree)*) is **not true of what shipped**: the bell says
  "likes your idea" (Roli's second-pass correction, which P3 implemented and flagged) while the
  English push still says "wants your idea too" (Roli's own draft, transcribed as written and his to
  correct). Writing the rule would have made the canon claim an agreement that does not exist, and
  deciding which of the two words wins is Roli's, not a documentation pass's. It is recorded as a
  **fact** instead, in `AGENTS.md` §11's open list beside the standing "the copy is Roli's to
  review", with both strings named so he can settle it in one edit.
- **P3's bell kinds and icons went into `DESIGN.md` §7's components table, not a section of their
  own.** P3's Canon block claimed only the `AGENTS.md` coverage row, and `DESIGN.md` had no
  notification-bell entry at all; §7 already carries non-primitives (`CommentComposer`), so one row
  — the seven kinds, their seven lucide icons at `h-4 w-4`, and "every headline and detail line
  lives in `notificationText.ts`, never inline" — adds no structure nobody approved.
- **One §10 gotcha beyond the three the brief named**, and it is a task's own words: P5 wrote down
  the two headless-Chromium facts "for the next task that measures a permission" (permission is
  always `denied` there, and `newContext({ permissions: [] })` is an *empty grant*, which denies).
  Both cost an hour once; §10 is where an hour like that is meant to go.
- **What I deliberately did not write.** No canon claims a push was **delivered**: §11 says in so
  many words that push has never gone over the wire on this machine (no `cryptography`, no VAPID) and
  that every push test stops at the queued message or a faked POST. No canon claims the **iOS
  reinstall** path works: §10 and §11 both say it is unverified and only Roli's phone can close it,
  and §10 names the WebKit assumption behind it. The **three-or-more-participant comment audience**
  is stated as the *rule* and attributed to the one helper both channels call — not as something
  P2's push tests exercised, because they did not (P1's matrix did, against `idea_event_audience`
  directly). The `make dev` fix is written down as **not verified end to end**, because reproducing
  a terminal's Ctrl+C needs a real foreground job on a tty.
- **Further stale passages found and fixed** (beyond the two struck in `bdc25a0`), all of them the
  editor that Roli's second-pass decision removed, plus two wordings a later decision overrode:
  P1 step 3 (`can_edit_feature_request_comment`, a capabilities dict with `can_edit`,
  `ensure_can_edit_…`), step 5 (`IdeaCommentPatchBody`), step 6 (`can_edit` on `IdeaCommentOut`),
  step 7 (the `PATCH /ideas/comments/{comment_id}` bullet) and step 10 (the two PATCH-based tests);
  P4 step 1 (`patchIdeaComment`), step 2 (`patchCommentMut`), step 3's props (`onSave`, `busy`),
  step 4 (`onSaveComment`), step 5 ("Could not save the comment"), step 6's "`updated_at !==
  created_at` prints 'edited'" (which P4 reported and left), and its Definition of done ("Berni sees
  edit/delete"); P3 step 3's `idea_vote` headline ("wants your idea too" → "likes your idea", the
  second-pass answer); and P2 step 3's drafted Steirisch JSON, which still read "wos er moant" and
  `Jetzt san's {vote_count}` where the shipped catalog has the neutral "wos gmoant is." and
  `{vote_line}` — both second-pass corrections recorded elsewhere in this file but never folded into
  the draft they corrected. Two **gate expectations** were also wrong rather than stale and are now
  the measured answers: `grep '"kind": "' me.py` gives **3**, not 7 (P3 maps the four idea kinds
  through `_IDEA_EVENT_KIND` instead of writing four literals), and `grep 'usePushNotifications('`
  gives **3**, not 2 (the grep counts the hook's own declaration beside its two call sites).
- **Two stale *numbers* fixed outside the brief**, in `AGENTS.md` §3's Commands block: the baselines
  beside `make test` and `npm run check` still read **130 tests** and **369 tests in 40 files**
  (dated 2026-09-13), which no batch since has been true. They are now the measured 228 and 717 in
  71, with a pointer that §11 is the authority — a number, not a rule, so correcting it invents no
  canon.
- **No code was touched**, which is this task's whole contract: `git show --stat` for this commit is
  `AGENTS.md`, `DESIGN.md` and this file. The gates below were re-run on the documentation tree and
  are green: `make test` **228 passed**, `make lint` clean, `npm run check` **717 in 71**,
  `npm run build` green, `make gen-types` no diff.

---

## Verification gates (after all tasks)

**Measured at the branch head on 2026-09-19 (P6's tree — documentation only, no code):**

- `make test` → **228 passed**, 0 failed, 27 warnings, 9m13s (baseline 204; +1 P5, +17 P1 — the plan
  asked for 10 — +4 P2, +1 P3, and P1's 17 include the seven audience tests three other tasks
  depend on). `make lint` → **clean**.
- `make gen-types` → **no diff** (regenerated on this tree; `git diff` on `schema.d.ts` is empty).
- `cd frontend && npm run check` → **717 tests in 71 files**, 0 failures, typecheck and lint clean
  (baseline 688 in 68). `npm run build` → green, `index-*.js` **730.35 kB** (the pre-existing
  >500 kB hint). `node --check frontend/public/sw.js` → passes.
- `grep -rn 'usePushNotifications(' frontend/src | grep -v test/` → **3**: the hook's own
  declaration plus its two call sites, Settings and the notice (the grep counts the definition too).
- `grep -n '"kind": "' backend/app/routers/me.py` → **3**, plus `_IDEA_EVENT_KIND`'s four: P3 maps
  the idea kinds through one dict instead of four inline literals, so seven kinds leave three hits.
  `grep -c 'idea_' frontend/src/ui/shell/notificationText.ts` is the readable check that all four
  arrived — **10** (four headlines, the detail branch's four, the doc comment's two lines).
- `grep -rn 'export type MyNotification' frontend/src/api` → only `types.ts`.
- `document.querySelectorAll("a a").length` = 0 on `/ideas` with comments open and the bell open —
  checked by P4 (as five different viewers) and by P3 (with the popover open), both **0**.
- **Rollback drill:** done in P1 — the pre-schema backend (`1c8808d`, extracted with `git archive`)
  booted against `verify-p1.db` *after* the new code had written all three tables, answered
  `GET /ideas` **200**, and still created an idea and voted on it.
- **Not a gate, and not provable here:** push over the wire (no `cryptography`, no VAPID), the iOS
  reinstall path, and `pushsubscriptionchange` firing at all — all three are the phone's to close.

## Deployment (later, on Roli's go)

Backend and schema change → the **full** deploy: step 2's backup first
(`python3 backend/manage.py backup-deploy-data`), then `ssh hetzner && cd
~/projects/Lorbeer-Turnierplaner && git pull && docker compose up -d --build`. Expect "Cup defs
validated", "DB initialized" — the three tables are created by `create_all` with no log line of
their own; `curl https://lorbeerkranz.xyz/api/ideas | grep -c '"comments"'` > 0 proves the new code
is up. **No manual step**, no `_RUNTIME_COLUMNS`, `notification_texts.json` ships in the image.
Rollback: `git checkout 880a6fd && docker compose up -d --build` — the branch point, code-identical
to the `4fb03fc` this plan was written against (the three commits between them are docs). Old code
ignores the new tables; P1 measured that against a database the new code had already written
(§P1 Deviations, `AGENTS.md` §5).
Smoke: from a second phone, comment on and vote for one of Roli's ideas → his bell shows both and a
push arrives; set a status as Roli on someone else's idea → their bell; Settings → Send test on each
phone; on one phone delete and re-add the PWA → the notice on first launch.

## Deferred — explicitly NOT here

- A per-card unread marker on the Ideas board (R5 declined the badge; the bell is the badge).
- Notifying admins about comments on ideas they have nothing to do with. (**Earlier commenters
  *are* notified** — that was decided on the third pass and is in the Decisions block: a comment
  reaches the idea's author plus everyone who has already commented, minus the actor. This bullet
  used to say otherwise.)
- Auto-disabling subscriptions on repeated non-410 failures (a VAPID 401 is the server's fault).
- Exposing `last_error`/`failure_count` per device in Settings.
- Moving `usePushNotifications` into a context so Settings and the notice share one instance.

## What this plan could not verify (and why)

- **No checks were run** (read-only session): baselines are `AGENTS.md` §11's.
- **iOS resets `Notification.permission` to `default` on a PWA reinstall** — WebKit's behaviour as
  documented, not measured here; P5's DoD puts it on Roli's phone. If iOS instead reports `granted`
  with no subscription, the `"resubscribe"` branch handles it silently — either way the device recovers.
- **`pushsubscriptionchange` on iOS** — support is unconfirmed; the handler is harmless if it never fires.
- **`pushManager.subscribe()` in headless Chromium** needs a reachable push service; the enable path
  is covered by the pure state test, the backend 410 test, and the phone.
- **Push over the wire** — not possible on the Pi (no `cryptography`); every push test stops at the
  queued message or the faked POST, as R5's did.

## Decisions still needed from Roli

**None block the start, and nothing blocks a worker.** Questions 1, 3, 4 and 5 were answered on
2026-09-19 and are recorded under "Decisions" above. What is left is a review, not a gate:

1. **The push and bell copy.** Three languages × four events, drafted in P2 and P3 — Roli's Styrian
   drafts transcribed as written, the German ASCII-safe in the house voice, the English plain. Read
   them when P2 is reviewed and correct anything that does not sound like the app. Nothing waits on
   it: the strings live in `notification_texts.json` and changing one is a one-line edit with no
   code behind it.
