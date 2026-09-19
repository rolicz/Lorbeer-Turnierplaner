# Features 2026-09 — Guestbook subjects: a comment on the header image, the About text or the avatar, pinned so it still makes sense later

> Branch `feature/2026-09-guestbook` off `main` — **branched only after `feature/2026-09-badges`
> (head `85ebfe2`, M1–M10) has merged**; the baseline sha is that merge commit and is unknown at
> writing (the badges branch sits on `b8e741a`, which is `main` today). Written 2026-09-19 in a
> read-only planning session: no check was run; the baselines are `AGENTS.md` §11's numbers at the
> badges head — `make test` **273 passed**, `cd frontend && npm run check` **735 tests in 74 files**
> — re-read §11 after the merge before quoting them.
> Symbol names are the source of truth; line numbers reference the badges head.
> Read `AGENTS.md` first (§5 persistence — **new tables, not columns**; §6 API + realtime + the
> cache-policy table; §9 how work is done; §10 gotchas, A9's "an id is handed out again" above all),
> then `DESIGN.md` (§3 surfaces, §5b words, §7 components, §9b feeds and composers).
> This batch **touches the backend and the schema** (two new tables, one new media directory) and is
> the **full** deploy. **Not deployed** at the end of the batch — Roli tests first.
>
> Task IDs `K1`–`K4`. `A B C D DS F G M N P Q R S T U` are taken (`grep -rhoE '^## [A-Z]+[0-9]+' *.md`
> at the badges head lists exactly those); `K` is free.

## Why this batch exists

Roli wants to comment on a profile's **header image**, its **About text** and its **avatar**. Asked
how, he said: *"guestbook sounds good -> make sure the image and about texts persist so it is also
clear what its about later when they change."*

Two facts about the code shape the whole plan:

1. **The guestbook is already a complete conversation surface.** One feed per profile
   (`pages/profile/GuestbookSection.tsx` + `GuestbookEntryCard.tsx`, the tree in `guestbookTree.ts`,
   the state in `useProfileGuestbook.ts`), one composer (`CommentSendRow` at the card's bottom edge,
   `DESIGN.md` §9b), one read state (`PlayerGuestbookRead`, the `?entry=` deep link in
   `useGuestbookUnreadJump.ts`), one push (`push_guestbook_created`, tag `guestbook-{profile}`), one
   bell kind (`/me/notifications` → `guestbook`, `path=/profiles/{id}?tab=guestbook&entry={eid}`) and
   one realtime event (`player:guestbook:update` on `/ws/players/{id}`, `resyncPlayer`). A second
   comment surface on the profile would duplicate every one of those. So an entry **gains a
   subject**, and nothing else is built.
2. **Avatars and header images are one file per player, overwritten in place.** `upsert_media_row`
   (`services/file_storage.py:106`) writes `avatars/{player_id}.{ext}` and
   `profile_headers/{player_id}.{ext}`, and the only version identity is the row's `updated_at`
   (`?v=` in `mediaUrl`). Change the picture and every comment about the old one points at the new
   one. The About text is a single `PlayerProfile.bio` column with the same problem. So the **first
   comment on the current version pins it** — the file is copied aside once, the text is snapshotted
   once — and later comments on the same version share that pin. Nothing nobody commented on is kept.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code style
   (thin routers, bodies in `services/`, error helpers from `api_utils.py`; Tailwind + design tokens,
   `qk` query-key factory, generated API types, lucide-react with an explicit `size`).
2. Work on branch `feature/2026-09-guestbook`. **Never switch branches, never touch `main`, never
   push.** One or more commits per task, message prefixed with the task ID (`feat(K1): …`,
   `fix(K3): …`, `docs(K4): …`).
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never `git commit -a`.
   Each task lists its file set; if you need a file outside it, stop and report. `AGENTS.md` and
   `DESIGN.md` are edited by **K4 only**: write the canon line your task changes under "Canon" in
   your task section and leave the files alone.
4. **Verify first.** Every task names the check that proves the gap still exists. Run it before
   changing anything; if the gap is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing. Backend touched → `make test` + `make lint`. **Response
   model touched → `make gen-types`, and `frontend/src/api/generated/schema.d.ts` goes in the same
   commit.** Frontend touched → `cd frontend && npm run check` (+ `npm run build` where the task
   says). Baselines: `AGENTS.md` §11 after the badges merge (273 / 735 at the badges head).
6. UI must work at ~390px and ≥1024px, verified in a real browser (Playwright against the isolated
   stack below) in **both** the `blue` and the `light` theme. Measure, do not eyeball.
7. Never read or print `backend/secrets.json`. Never run destructive commands on `backend/app.db`,
   `backend/data/app.db` or `backend/data/uploads` — copy first. **This batch writes media**, so the
   isolated stack's `UPLOADS_DIR` is a copy *outside the repo* (below), never `backend/data/uploads`.
   **Never bind 8000/8001/8010/5173 — Roli's dev servers are live there.**
8. **One mechanism per job — reuse before you create.** The last three batches did not create new
   inconsistency because every worker used the one implementation the plan named; a worker who
   invents a parallel way while adding a feature undoes that. Before writing a helper, a hook, a
   table or a class string, look for the existing one — and if your task names a mechanism, use
   **that** one and no other. The shared things this batch depends on:

   | job | the one implementation | who builds it |
   |---|---|---|
   | the three subject kinds, server-side | `services/guestbook_subjects.py::SUBJECT_KINDS` + `normalize_subject_kind` | K1 |
   | pinning — find the snapshot for the current version or make it (copy the file / snapshot the text) | `services/guestbook_subjects.py::find_or_create_snapshot` | K1 |
   | a pinned copy's path on disk | `services/file_storage.py::media_path_for_guestbook_subject` (`guestbook_subjects/{snapshot_id}.{ext}`, the `comments/{id}.{ext}` shape) | K1 |
   | "is this still what is on the profile" | `subjects_for_entries` computes `current` **server-side**; the frontend renders the flag and never re-derives it (the A10 rule) | K1 |
   | the subject on the wire | `GuestbookSubjectOut`, riding on `GuestbookEntryOut.subject` — no second endpoint, no second query key | K1 |
   | releasing pinned copies when entries go | `release_subjects` stages the rows; the router unlinks **after** `commit()` (`routers/comments.py:670-674` is the shape) | K1 |
   | orphans left by a rollback (A9) | `sweep_orphan_subjects`, called from `init_db()` like the seeds | K1 |
   | serving a pinned image | `GET /players/guestbook-subjects/{snapshot_id}/image`, the `get_player_header_image` shape | K1 |
   | the subject vocabulary in the browser — kinds, labels, icons, chip wording, counts | `pages/profile/guestbookSubjects.ts` | K2, **its first commit** |
   | the guestbook composer | `CommentSendRow` inside `GuestbookSection` — the row that exists, plus one `ModeBadge` above it | exists; K2 adds the badge |
   | a chip that names a mode and leaves it | `ModeBadge` in `pages/live/comments/CommentComposer.tsx`, exported and given an `icon` | K2 |
   | the subject chip on an entry | one `.chip` `<button>` in `GuestbookEntryCard`, `viewSubject` in the card context | K2 |
   | viewing an image | `ui/primitives/ImageLightbox` — K2 opens it for a pinned copy, K3 gives it a `footer` | exists |
   | "start a comment about this" on an item | `pages/profile/SubjectCommentTrigger.tsx` — one component for all three items | K3 |
   | a count in prose | `fmtCount` (`utils/format.ts`) | exists |
   | the guestbook's push, bell, read state and realtime | **unchanged** — `push_guestbook_created`, `/me/notifications` kind `guestbook`, `PlayerGuestbookRead`, `player:guestbook:update` | exists; nobody touches them |

   If your task genuinely needs something new and shared, put it where the existing family lives and
   say so in **Deviations** in your first sentence. Two implementations of one job is a failed task
   even when both are correct and the tests are green.
9. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the task
   did not say, what you measured, what you left). Include that edit in your commit. If blocked or
   the code does not match this spec, stop, note it here, commit nothing broken.

### Runtime verification (isolated stack)

**Tasks run in parallel, so every task has its own ports, its own database copy and its own uploads
copy.** Earlier batches used 8031–8064, 8071–8085 and 8091–8098 / 8111–8118; this one takes
**8121–8124 / 8141–8144** (no plan file mentions them and nothing listens on 81xx today).

| task | backend | vite | db copy |
|---|---|---|---|
| K1 | 8121 | 8141 | `backend/data/verify-k1.db` |
| K2 | 8122 | 8142 | `backend/data/verify-k2.db` |
| K3 | 8123 | 8143 | `backend/data/verify-k3.db` |
| K4 | 8124 | 8144 | `backend/data/verify-k4.db` |

`backend/data/*.db` is gitignored. **Never** point the stack at `backend/app.db` or
`backend/data/app.db`. **The uploads copy lives outside the repo**: `backend/data/uploads` is the
only ignored media path, a `backend/data/verify-*-uploads` directory would show up as untracked, and
this batch is the first that *writes* under the media root (`guestbook_subjects/`).

```bash
# <B>, <V>, <DB> from your row above
cp backend/app.db backend/data/<DB>
UP=$(mktemp -d)/uploads && rsync -a backend/data/uploads/ "$UP"/     # a copy, outside the repo

# A throwaway secrets file OUTSIDE the repo (Rule 7). Three accounts: the wall's owner, a
# commenter, and an admin who may delete anyone's entry.
SEC=$(mktemp -d)/secrets.json
cat > "$SEC" <<'JSON'
{ "db_url": "sqlite:///./app.db",
  "player_accounts": [ { "name": "Roli",  "password": "verify-only", "admin": true },
                       { "name": "Berni", "password": "verify-only", "admin": false },
                       { "name": "Flo",   "password": "verify-only", "admin": false } ],
  "jwt_secret": "verify-only", "ws_require_auth": false, "log_level": "INFO" }
JSON

cd backend && UPLOADS_DIR="$UP" .venv/bin/python run.py \
  --host 127.0.0.1 --port <B> --secrets "$SEC" --db-url "sqlite:///$PWD/data/<DB>" &
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:<B> VITE_WS_BASE_URL=ws://127.0.0.1:<B> \
  npx vite --port <V> --strictPort &

# log in (the body field is `username`):
curl -s -X POST http://127.0.0.1:<B>/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"Berni","password":"verify-only"}'
# browser, before the first navigation:
#   localStorage ea_fc_token=<token> · ea_fc_role=editor · ea_fc_player_id=4 · ea_fc_player_name=Berni
#   localStorage theme = "blue" | "light"
```
Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5, Mike=6. Roli's profile (id 1) has a header
image and an avatar in the dev uploads; check with `curl -sI :<B>/players/1/header-image` before
relying on it. **Push cannot be delivered over the wire on this machine** (no `cryptography`, no
VAPID): every push assertion stops at the queued message — the `_Recorder` in
`tests/test_ideas.py:336` or the `enqueue_personal_push` monkeypatch in
`tests/test_push_notifications.py:504`. Kill only the PIDs you started; `rm -rf "$UP"` when done.

---

## Decisions (Roli 2026-09-19 — do not relitigate)

- **The guestbook absorbs it.** No second comment surface on a profile. A guestbook entry can carry a
  **subject** — the header image, the About text or the avatar — and that is the whole feature: one
  feed, one read state, one push, one bell kind, one realtime event, all of which already exist and
  **none of which change**.
- **Three subjects:** `header_image`, `about`, `avatar`. No fourth in this batch.
- **The conversation lives only in the guestbook**, with a **chip naming the subject** on the entry.
  Tapping the chip opens the subject. The item itself (the banner, the avatar, the About block) gets a
  way to **start** a comment and may show a **count**; it does **not** host its own thread. **An entry
  never appears twice on one page.**
- **Copy-on-comment.** Avatars and header images are overwritten today, so the **first comment filed
  against the current image pins it**: the file is copied aside once and the entry points at the copy;
  later comments on the same version share that copy. Images nobody ever commented on are **not
  kept** — Roli chose this over keeping every version: the storage cost tracks the conversation, not
  the upload history. The About text is a snapshot column, trivial by comparison.
- **The chip must still make sense after the subject changes**: it shows what the entry was about
  *then*, not what is there now — which is what the pin is for.

### Decided by this plan — the answers to the eight questions

**1. The tables — two, additive, nothing altered, nothing in `_RUNTIME_COLUMNS`.**
`PlayerSubjectSnapshot` is *what a profile's header image / About text / avatar was at one moment*:
`player_id`, `kind`, `source_updated_at` (the version — the source row's `updated_at` when captured),
`text` (About only), `content_type` / `file_path` / `file_size` (images only), `captured_at`, with a
`UniqueConstraint(player_id, kind, source_updated_at)` so "one copy per version" is a constraint and
not a convention. `PlayerGuestbookEntrySubject(entry_id PK → playerguestbookentry.id, snapshot_id →
playersubjectsnapshot.id)` is *which snapshot an entry is about* — the exact shape of
`PlayerGuestbookThreadLink`: a root that has no row is an ordinary entry, a reply never has one.
**No column on `PlayerGuestbookEntry`**: a link table is how this codebase has always added a
relation (`TournamentPinnedComment`, `CommentAuthorLink`, `ThreadLink`), it keeps `updated_at`'s
"· edited" byline honest (a subject is not an edit), and it is what makes a subject *optional on the
wire* with no default to explain. **Old code boots against the migrated DB** because it never reads
either table; the two consequences of a rollback are (a) tagged entries render as plain entries with
no chip, and (b) an entry deleted under old code leaves its link row and its pinned file behind —
which A9 makes dangerous, because `playerguestbookentry.id` has no AUTOINCREMENT and the next entry
to take that id would silently inherit the old subject. So **`init_db()` sweeps orphans on every
boot** (`sweep_orphan_subjects`: links whose entry is gone, snapshots with no link, files under
`guestbook_subjects/` with no row) and logs `Guestbook subjects swept: N` when it removed anything —
idempotent, silent when there is nothing, and measured in K1's rollback check.

**2. The pinning mechanism.** The version of a subject is the source row's `updated_at`:
`PlayerHeaderImageFile.updated_at` / `PlayerAvatarFile.updated_at` (set to `utcnow()` on every
upload, `players.py:412/480`) and `PlayerProfile.updated_at` (set on every bio PATCH, `:342`).
`find_or_create_snapshot(s, player_id, kind)` looks up `(player_id, kind, version)`; found → that
row (**two comments on the same image share one copy**); not found → for an image it reads the live
bytes (`read_media`), inserts the row, flushes for the id, and writes
`guestbook_subjects/{snapshot_id}.{ext}` with the existing atomic `write_media` — the pinned copy is
a *new file in a new directory*, so the overwriting `upsert_media_row` and the two `DELETE` media
endpoints never touch it; for the About text it stores the stripped `bio`. **The router pins before it
inserts the entry**, so a refusal costs nothing. **Deleted before anyone comments:** there is nothing
to pin and nothing to pin *to* — the item's trigger is not rendered without an image (or with an
empty About), and a request that arrives anyway (the picture went while the composer was open) is
refused with **409** naming it (*"There is no header image to comment on right now"*), the
`_refuse_score_on_a_finished_match` idiom: state changed under you, here is why. A row whose file is
missing on disk is the same 409 (`get_player_header_image` 404s it for the same reason).
`current` — "is this still what is on the profile" — is computed **server-side** in
`subjects_for_entries`: for an image, the live row exists and its `updated_at` equals the snapshot's
version; for the About text, the snapshot's `text` equals the live stripped bio (a re-save of the
same words is a new version but not a change, and the chip must not call it one).

**3. Garbage — the copy dies with its last entry.** `release_subjects(s, entry_ids)` deletes the
link rows for every entry being deleted (the whole subtree the router already collects), then every
snapshot left with no link, and returns the file paths; the router unlinks them **after**
`s.commit()`, exactly as `routers/comments.py:670-674` does for comment images — a failed commit
leaves no hole. `services/comment_cleanup.py` is the precedent ("destroying a thing destroys what
hangs off it, in one place, rows only, files after commit"); a guestbook-side module is the right
home because the guestbook's delete lives in `routers/players.py` and does not go through
`comment_cleanup`. Deleting the avatar or the header image leaves the pinned copy alone (the entry
still needs it). There is no `DELETE /players/{id}` endpoint, so a player's snapshots cannot be
orphaned that way; the sweep covers whatever else the future invents.

**4. The composer — the row that exists, armed.** Tapping a trigger on an item switches to the
Guestbook tab, arms the feed's own composer with the subject and puts the caret in the field. Armed
means: one **`ModeBadge`** above `CommentSendRow` — the very chip the tournament composer shows for
goal/shots entry (glyph + label + an X that leaves the mode) — reading `Header image` / `About text`
/ `Avatar`, removable. The post carries `subject_kind`; on success it clears. **Replies cannot carry a
subject** (400): a reply's subject is its root's. No second composer, no modal, no form.

**5. The chip and the tap target.** Every tagged entry shows one grey `.chip` `<button>` above its
body: the kind's lucide glyph at 12px (`ImageIcon` header, `AlignLeft` About, `CircleUserRound`
avatar) and its label — **`Header image` / `About text` / `Avatar` while the subject is current**,
**`Earlier header image` / `Earlier About text` / `Earlier avatar` once it has changed** (a plain
word, present in the chip itself, never only a glyph — the M8 lesson). Tapping the chip **always
opens the snapshot**: `ImageLightbox` on the pinned copy for an image (the same lightbox the header
and the avatar already open, `ProfileHeader.tsx:403-404`), a `Modal` titled `About text` with the
snapshot text for the About. Not "scroll to the banner": once the banner has changed, the banner is
the wrong picture, and while it has not, the pinned copy *is* the banner. The overlay's subtitle says
when it was captured and, if it has changed since, says so (`As of 12.09.2026, 14:30 · changed
since`). The `?entry=` deep link, the unread jump and the read marks are untouched — a tagged entry is
an entry.

**6. Notifications — nothing changes, and a test says so.** The POST already calls
`push_guestbook_created` once and the bell already lists the entry once; a subject is the same entry
with one more field. `notification_texts.json`, `push_guestbook_created`, `me.py`'s guestbook block
and `notificationText.ts` are **not in any file set**. `test_a_tagged_entry_notifies_exactly_once`
asserts one queued push (`event_type == "guestbook_created"`, the same `text_context` keys as an
untagged entry) and one `guestbook` bell item. Whether the push should *say* "about your header
image" is an open decision below — it costs three languages and the umlaut rule, and Roli said the
subject probably should not change anything.

**7. Realtime and cache — unchanged, for a stated reason.** The POST already broadcasts
`player:guestbook:update {action: "created"}` and the DELETE `deleted`; `resyncPlayer`
(`hooks/realtime/useRealtime.ts:108`) invalidates `qk.playerGuestbook(id)`, and the subject **rides
inside that list payload**, so chips and counts on every device looking at the profile refresh with
the same event. The `["players","guestbook"]` row (page channel, 5 s) stays as it is: the one thing
the channel does *not* announce is a change to the subject itself — a new upload or a bio save flips
`current` — and that is the owner's own mutation on the profile page, which K3 makes invalidate the
guestbook key locally; any other device is inside the 5 s window or the focus refetch. The pinned
image bytes are served `Cache-Control: public, max-age=31536000, immutable`: a snapshot never changes,
and its URL carries its id. No new `qk` namespace, so `cachePolicy.test.tsx` needs no new row.

**8. Task order and parallelism** — the overview table below. K1 alone → **group A** {K2, K3} in
parallel, with K2's first commit (`guestbookSubjects.ts`) landing before K3's final check → K4.

## Task overview & order

| # | ID | Title | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------------------------------|------|
| 1 | K1 | Schema, the pin, the release, the sweep, the API | `backend/app/models.py`, `backend/app/db.py`, `backend/app/services/guestbook_subjects.py` (new), `backend/app/services/file_storage.py`, `backend/app/services/guestbook.py`, `backend/app/schemas/requests.py`, `backend/app/schemas/responses.py`, `backend/app/routers/players.py`, `backend/tests/test_guestbook_subjects.py` (new), `frontend/src/api/generated/schema.d.ts`, `frontend/src/api/types.ts` | **first, alone** |
| 2 | K2 | The feed: the chip on an entry, the armed composer, the snapshot viewers | `frontend/src/pages/profile/guestbookSubjects.ts` (new, **first commit**), `frontend/src/pages/profile/useProfileGuestbook.ts`, `frontend/src/pages/profile/GuestbookSection.tsx`, `frontend/src/pages/profile/GuestbookEntryCard.tsx`, `frontend/src/api/players.api.ts`, `frontend/src/pages/live/comments/CommentComposer.tsx` (export `ModeBadge`, add `icon`), `frontend/src/test/guestbookSubjects.test.ts` (new), `frontend/src/test/guestbookSubjectChip.test.tsx` (new) | group A |
| 3 | K3 | The items: one trigger on the banner, the avatar and the About text | `frontend/src/pages/profile/SubjectCommentTrigger.tsx` (new), `frontend/src/ui/primitives/ImageLightbox.tsx`, `frontend/src/pages/profile/ProfileHeader.tsx`, `frontend/src/pages/profile/ProfileOverviewTab.tsx`, `frontend/src/pages/ProfilePage.tsx`, `frontend/src/test/subjectCommentTrigger.test.tsx` (new), `frontend/src/test/imageLightboxFooter.test.tsx` (new) | group A |
| 4 | K4 | Documentation pass | `AGENTS.md`, `DESIGN.md`, this file | last |

**Order:** K1 alone → **group A** {K2, K3} in parallel → K4.
**Why K1 alone:** every other task reads its response model, its generated types and its
`subject_kind` body field, and a half-written `responses.py` breaks `make gen-types` for anyone
sharing the worktree. **Why K2 and K3 are disjoint:** K2 owns the feed (`GuestbookSection`,
`GuestbookEntryCard`, the hook, the API client, the composer badge); K3 owns the items
(`ProfileHeader`, `ProfileOverviewTab`, the lightbox, the trigger) and the page that wires them
(`ProfilePage.tsx`). They meet at two contracts, spelled out here so neither has to read the other's
in-flight code: **(a)** `pages/profile/guestbookSubjects.ts` — K2 commits it *first* and *alone*
(`feat(K2): the subject vocabulary`), and K3 imports from it; **(b)** `useProfileGuestbook`'s return
gains `armSubject(kind)`, `canPostGuestbook`, `currentSubjectCounts` and `scrollToGuestbookSection`
(K2 § step 3) — K3 codes against those names and **does not run its final `npm run check` until
K2's hook commit is in**. Group-A workers will see each other's in-flight files in `npm run check`;
commit only your own.

---

## K1 — Schema, the pin, the release, the sweep, the API  ☐

**The gap.** `models.py:93-128` has the guestbook's four tables and nothing that could remember a
picture; `services/file_storage.py` has five `media_path_for_*` builders and none for a copy;
`PlayerGuestbookCreateBody` (`requests.py:25`) takes `body`, `parent_entry_id`, `author_player_id`;
`GuestbookEntryOut` (`responses.py:115`) has no `subject`; `routers/players.py::delete_player_guestbook_entry`
(`:985`) deletes links, reads, votes and entries and unlinks nothing.

**Verify first.**
```bash
grep -n 'class PlayerSubjectSnapshot\|class PlayerGuestbookEntrySubject' backend/app/models.py   # → 0
ls backend/app/services/guestbook_subjects.py                                                    # → no such file
grep -n 'guestbook_subject' backend/app/services/file_storage.py                                 # → 0
grep -n 'subject' backend/app/schemas/requests.py backend/app/schemas/responses.py               # → 0
grep -n 'guestbook-subjects' backend/app/routers/players.py                                      # → 0
grep -n 'subject' frontend/src/api/types.ts                                                      # → 0
```

**The change.**

1. **`models.py`**, after `PlayerGuestbookRead` (`:128`) — two tables, **no column on any existing
   table**, nothing in `_RUNTIME_COLUMNS`:
   ```python
   class PlayerSubjectSnapshot(SQLModel, table=True):
       """What a profile's header image, About text or avatar was at one moment (K1).

       Avatars and header images are one file per player, overwritten on every upload
       (`avatars/{player_id}.{ext}`), so the first guestbook entry filed against the current
       image copies it aside and points at the copy; a later entry on the same version finds
       this row and shares the copy. Images nobody commented on are never kept — Roli's call:
       the storage tracks the conversation, not the upload history. The About text is the
       `text` column and needs no file.

       The version is the source row's `updated_at` at capture time, so "one copy per
       version" is a constraint, not a convention. Written by
       `services/guestbook_subjects.py` only; a row whose last entry is deleted goes with it,
       file included, and `init_db()` sweeps whatever a rollback leaves behind (A9).
       """
       __table_args__ = (UniqueConstraint("player_id", "kind", "source_updated_at", name="uq_subject_snapshot_version"),)

       id: Optional[int] = Field(default=None, primary_key=True)
       player_id: int = Field(foreign_key="player.id", index=True)
       kind: str = Field(index=True)  # "header_image" | "about" | "avatar"
       #: The source row's `updated_at` when this was captured — the version identity.
       source_updated_at: dt.datetime = Field(index=True)
       #: kind == "about": the About text as it was. Images: "".
       text: str = Field(default="")
       #: Images: the pinned copy. About: all three empty.
       content_type: str = Field(default="")
       file_path: str = Field(default="", index=True)
       file_size: int = Field(default=0)
       captured_at: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)


   class PlayerGuestbookEntrySubject(SQLModel, table=True):
       """Which snapshot a guestbook entry is about — one row per tagged root entry, none for
       an untagged entry or a reply (the `PlayerGuestbookThreadLink` shape)."""
       entry_id: int = Field(foreign_key="playerguestbookentry.id", primary_key=True)
       snapshot_id: int = Field(foreign_key="playersubjectsnapshot.id", index=True)
   ```
2. **`services/file_storage.py`** — beside the other builders and readers, nothing else changes:
   ```python
   def media_path_for_guestbook_subject(snapshot_id: int, content_type: str) -> str:
       ext = _ext_from_content_type(content_type)
       return f"guestbook_subjects/{int(snapshot_id)}.{ext}"

   def list_media(rel_dir: str) -> list[str]:
       """Relative paths of the files directly under `rel_dir`; [] when it does not exist.
       The sweep's eyes — the only module that knows where the root is."""
   ```
3. **`services/guestbook_subjects.py` (new)** — the only module that reads or writes either table:
   ```python
   SUBJECT_KINDS: tuple[str, ...] = ("header_image", "about", "avatar")
   IMAGE_KINDS: tuple[str, ...] = ("header_image", "avatar")
   _LABEL = {"header_image": "header image", "about": "About text", "avatar": "avatar"}

   class SubjectUnavailable(Exception):
       """The subject is not on the profile right now — the router answers 409 with the message."""

   def normalize_subject_kind(raw: str | None) -> str | None:
       """'' / None → None; a known kind → itself; anything else → ValueError."""

   def find_or_create_snapshot(s: Session, *, player_id: int, kind: str, now: dt.datetime | None = None) -> PlayerSubjectSnapshot:
       """The snapshot of the *current* version of this subject, made if it does not exist.
       about: PlayerProfile → stripped bio ('' → SubjectUnavailable), version = profile.updated_at.
       images: the media row (None → SubjectUnavailable), version = row.updated_at; found →
       return it; else read_media (None → SubjectUnavailable), add + flush for the id, write
       `media_path_for_guestbook_subject(id, content_type)` with write_media, set file_path /
       file_size. No commit."""

   def attach_subject(s: Session, *, entry_id: int, snapshot_id: int) -> None:
       """Adds the link. A stale row for this entry id (A9: ids are reused) is replaced. No commit."""

   def subject_payload(snap: PlayerSubjectSnapshot, *, current: bool) -> dict:
       return {"kind": snap.kind, "snapshot_id": int(snap.id), "captured_at": snap.captured_at,
               "text": snap.text or "", "has_image": bool(snap.file_path), "current": bool(current)}

   def subjects_for_entries(s: Session, *, player_id: int, entry_ids: list[int]) -> dict[int, dict]:
       """entry_id → subject payload for every tagged entry among `entry_ids`. One query for
       links ⨝ snapshots, then three `s.get`s (header row, avatar row, profile) to decide
       `current`: images — the live row exists and `row.updated_at == snap.source_updated_at`;
       about — `snap.text == (profile.bio or '').strip()`. Empty input → {} with no query."""

   def release_subjects(s: Session, *, entry_ids: list[int]) -> list[str]:
       """Delete the links of these entries, then every snapshot left with no link. Returns the
       file paths to unlink AFTER the caller commits. No commit."""

   def sweep_orphan_subjects(engine) -> int:
       """Links whose entry is gone, snapshots with no link (files unlinked), and files under
       guestbook_subjects/ whose stem is not a snapshot id. Returns how many rows + files went.
       Idempotent; called from init_db()."""
   ```
   `find_or_create_snapshot` runs **before** the entry is inserted, so a 409 costs nothing; the copy
   is written before the commit, like every `upsert_media_row` write today, and a commit that then
   fails leaves a file with no row — which the sweep removes on the next boot. Say so in the docstring.
4. **`db.py`** — in `init_db()`, after the record-holder seed, the same lazy-import shape:
   ```python
   from .services.guestbook_subjects import sweep_orphan_subjects
   swept = sweep_orphan_subjects(_engine)
   if swept > 0:
       log.info("Guestbook subjects swept: %s", swept)
   ```
5. **`services/guestbook.py`** — `guestbook_entry_payload(..., subject: dict | None = None)` adds
   `"subject": subject`; `list_guestbook_entries` computes
   `subject_by_entry_id = subjects_for_entries(s, player_id=player_id, entry_ids=entry_ids)` once and
   passes `subject=subject_by_entry_id.get(int(row.id))` per row.
6. **`schemas/requests.py`** — `PlayerGuestbookCreateBody.subject_kind: str | None = None`. No patch
   body change: a subject is never edited.
7. **`schemas/responses.py`** — before `GuestbookEntryOut`:
   ```python
   class GuestbookSubjectOut(BaseModel):
       """What a guestbook entry is about (K1): the header image, the About text or the avatar,
       as it was when the entry was written. `current` says whether that is still what the
       profile shows — computed server-side, rendered by the frontend, never re-derived there."""
       kind: str            # "header_image" | "about" | "avatar"
       snapshot_id: int
       captured_at: datetime
       text: str = ""       # about: the text as it was then; images: ""
       has_image: bool = False
       current: bool = False
   ```
   and `GuestbookEntryOut.subject: GuestbookSubjectOut | None = None` — optional, so the generated
   type is `subject?: … | null` and no existing literal (`test/guestbookTree.test.ts:11`) changes.
8. **`routers/players.py`:**
   - `create_player_guestbook_entry` (`:621`): move `now = dt.datetime.utcnow()` above the parent
     block; after it:
     ```python
     try:
         subject_kind = normalize_subject_kind(body.subject_kind)
     except ValueError:
         bad_request("Unknown subject")
     if subject_kind is not None and parent_entry_id is not None:
         bad_request("A reply cannot carry a subject")
     snapshot = None
     if subject_kind is not None:
         try:
             snapshot = find_or_create_snapshot(s, player_id=int(player_id), kind=subject_kind, now=now)
         except SubjectUnavailable as exc:
             conflict(str(exc))
     ```
     after `s.flush()` of the row: `if snapshot is not None: attach_subject(s, entry_id=int(row.id),
     snapshot_id=int(snapshot.id))`; the return passes
     `subject=subject_payload(snapshot, current=True) if snapshot is not None else None`. **The push
     call and the broadcast are untouched.**
   - `patch_player_guestbook_entry` (`:697`): the hand-built return gains
     `subject=subjects_for_entries(s, player_id=int(row.profile_player_id), entry_ids=[int(row.id)]).get(int(row.id))`.
   - `delete_player_guestbook_entry` (`:985`): before the `entry_rows` loop,
     `subject_paths = release_subjects(s, entry_ids=list(to_delete))`; after `s.commit()` and before
     the broadcast, `for path in subject_paths: delete_media(path)` — with the `comments.py:672`
     comment ("Files only after the rows are safely gone, so a failed commit leaves no hole").
   - New, beside `get_player_header_image`:
     ```python
     @router.get("/guestbook-subjects/{snapshot_id}/image")
     def get_guestbook_subject_image(snapshot_id: int):
         """The pinned copy an entry is about. Immutable: a snapshot never changes and its URL
         carries its id, so the browser may keep it for a year."""
         # the get_player_header_image shape: own Session, 404 for no row / no file_path / missing file,
         # headers={"Cache-Control": "public, max-age=31536000, immutable"}
     ```
     Public read, like the avatar. The path collides with nothing: every existing `/players/…` route
     with three trailing segments has the literal `guestbook` or `pokes` in the second slot, and
     `guestbook-subjects` is neither.
9. **`make gen-types`**, then `frontend/src/api/types.ts` under Guestbook:
   ```ts
   export type GuestbookSubjectKind = "header_image" | "about" | "avatar";
   export type PlayerGuestbookSubject = Omit<S["GuestbookSubjectOut"], "kind"> & { kind: GuestbookSubjectKind };
   export type PlayerGuestbookEntry = Omit<S["GuestbookEntryOut"], "subject"> & { subject?: PlayerGuestbookSubject | null };
   ```
   (the `RecordKey` narrowing shape, M1).
10. **Tests — `backend/tests/test_guestbook_subjects.py` (new)**, in the shape of
    `test_player_profiles_auth.py` (upload with `files={"file": ("header.webp", b"…", "image/webp")}`)
    and `test_comment_guestbook_edits.py`:
    - `test_a_subject_comment_pins_a_copy_of_the_current_header_image` — owner uploads bytes A;
      Editor2 posts `{"body": "nice", "subject_kind": "header_image"}` → 200, `subject.kind`,
      `has_image`, `current is True`; `GET /players/guestbook-subjects/{sid}/image` → bytes A with the
      immutable header; owner uploads bytes B → the list shows `current is False`, the snapshot route
      still returns **A**, `/players/{id}/header-image` returns **B**; exactly one file under
      `uploads/guestbook_subjects/`.
    - `test_two_comments_on_the_same_image_share_one_copy` — same `snapshot_id`, one file.
    - `test_a_new_upload_then_a_comment_pins_a_second_copy` — two snapshot ids, two files, the first
      entry's subject not current, the second's current.
    - `test_avatar_pins_the_same_way` — the avatar route and row.
    - `test_about_comment_snapshots_the_text_and_current_follows_the_text` — bio "hello" → comment →
      `text == "hello"`, current; bio "bye" → not current; bio "hello" again → current again
      (`current` is text equality, not version equality — the docstring's reason).
    - `test_no_image_or_empty_about_is_409_and_nothing_is_written` — no header / no avatar / empty bio
      → 409 with the message; the entry count is unchanged; no file, no snapshot row.
    - `test_a_reply_cannot_carry_a_subject_and_an_unknown_kind_is_400`.
    - `test_editing_an_entry_keeps_its_subject` — PATCH returns the same `subject`.
    - `test_deleting_the_last_entry_removes_the_copy_but_a_shared_one_survives` — two roots on one
      snapshot; delete one → row and file stay; delete the other → both gone; and a root with a reply
      deleted as a subtree releases its subject.
    - `test_deleting_the_avatar_or_header_leaves_the_pinned_copy`.
    - `test_a_tagged_entry_notifies_exactly_once` — monkeypatch `notifications_service.enqueue_personal_push`
      as `test_push_notifications.py:508` does → exactly one call, `message.event_type ==
      "guestbook_created"`, `set(message.text_context) ==` the untagged entry's; `/me/notifications`
      for the owner → exactly one `guestbook` item with the existing `path`.
    - `test_untagged_entries_have_no_subject` — `subject is None` on the wire.
    - `test_orphans_are_swept_at_startup` — insert a link for a nonexistent entry id and a snapshot
      with a file and no link, drop a stray file into `guestbook_subjects/`, call `init_db()` again →
      all three gone; a second call returns 0.
    `tests/test_me_notifications.py`, `test_push_notifications.py::test_guestbook_and_poke_enqueue_push`
    and `test_realtime_events.py::test_guestbook_writes_reach_the_profile_channel` unchanged and green
    are the proof that nothing about the existing guestbook moved.

**What must not change.** `push_guestbook_created`, `notification_texts.json`, `routers/me.py`,
`_broadcast_guestbook_event` and its actions, `PlayerGuestbookRead`, the edit window, the wire shape
of every existing field, `upsert_media_row`, the two media DELETE endpoints. `MAX_GUESTBOOK_BODY_CHARS`.

**Definition of done.** The tests above green; `make test` ≥ 273 + 13; `make lint` clean; `make
gen-types` committed in the same commit as the models; `cd frontend && npm run check` green with the
new aliases unused (tsc does not mind). On the isolated stack (`:8121`, `$UP`): as Berni, `POST
/players/1/guestbook {"body":"…","subject_kind":"header_image"}` → 200 with `subject.current: true`;
`ls "$UP"/guestbook_subjects` → one file; a second post → still one file, same `snapshot_id`; as Roli,
`PUT /players/1/header-image` with a different image → `GET /players/1/guestbook` shows both entries
`current: false`; `DELETE` both entries → the directory is empty. **Rollback check, measured, not
asserted** (the P1/M2 method): `git archive <baseline-sha> | tar -x -C $(mktemp -d)` — never
`.git` — booted against `verify-k1.db` **after** the new code wrote both tables → boots, `GET
/players/1/guestbook` **200** with no `subject` key, posts and deletes an entry (leave one tagged entry
and delete it under the old code); then start the new code on the same DB → the log says
`Guestbook subjects swept: 2` (the link and the snapshot) and the file is gone. Write both numbers
into Deviations.

**Gates.** `make test`, `make lint`, `make gen-types` (committed), `cd frontend && npm run check`.

**Canon** (K4 writes them):
- §2 backend modules: `guestbook_subjects.py` — the only module that reads or writes
  `PlayerSubjectSnapshot` / `PlayerGuestbookEntrySubject`: `find_or_create_snapshot` (pin),
  `subjects_for_entries` (payload + `current`), `release_subjects` (rows; files after commit),
  `sweep_orphan_subjects` (from `init_db()`).
- §5 table list: `PlayerSubjectSnapshot`, `PlayerGuestbookEntrySubject`; **copy-on-comment**: the
  first entry on the current version of an image copies it to `guestbook_subjects/{snapshot_id}.{ext}`,
  later entries on that version share the copy, and the copy is deleted with the last entry that
  names it — never with the avatar or the header. The version is the source row's `updated_at`,
  `current` is version equality for an image and text equality for the About. Rule 3 measured: old
  code boots, lists entries without `subject`, and an entry deleted under old code leaves a link and
  a file that `Guestbook subjects swept: N` removes on the next boot of new code.
- §5 media: `uploads/guestbook_subjects/{snapshot_id}.{ext}` joins the list, and §7's persistent-data
  list.
- §6 API: `POST /players/{id}/guestbook` takes `subject_kind` (root entries only; 409 when the
  subject is not on the profile); `GET /players/guestbook-subjects/{sid}/image` public, immutable;
  `GuestbookEntryOut.subject`; **a subject changes nothing about the push, the bell, the read state
  or `player:guestbook:update`**.
- §6 cache table: `["players","guestbook"]` unchanged (the subject rides in the list; the owner's own
  profile mutations invalidate it locally).
- §10 gotcha: A9 applies to `playerguestbookentry.id` too — a subject link is what would reattach to
  a reused id, which is why the sweep runs at boot and why `attach_subject` replaces a stale row.

**Deviations:**

---

## K2 — The feed: the chip on an entry, the armed composer, the snapshot viewers  ☐

**The gap.** `GuestbookEntryCard.tsx` renders author, date, body, votes and the reply/edit/delete
controls and nothing about a subject; `GuestbookSection.tsx:147-160` renders `CommentSendRow` bare;
`useProfileGuestbook.ts` has no subject state and `createPlayerGuestbookEntry` (`players.api.ts:133`)
sends no `subject_kind`; `ModeBadge` (`CommentComposer.tsx:207`) is private and draws only Goal/Target.

**Verify first.**
```bash
ls frontend/src/pages/profile/guestbookSubjects.ts                              # → no such file
grep -n 'subject' frontend/src/pages/profile/useProfileGuestbook.ts frontend/src/pages/profile/GuestbookEntryCard.tsx frontend/src/pages/profile/GuestbookSection.tsx   # → 0
grep -n 'subject_kind' frontend/src/api/players.api.ts                          # → 0
grep -n '^export function ModeBadge\|^function ModeBadge' frontend/src/pages/live/comments/CommentComposer.tsx   # → the private one at :207
```
K1 must be in: `grep -n 'GuestbookSubjectOut' frontend/src/api/generated/schema.d.ts` → ≥ 1.

**The change.**

1. **`pages/profile/guestbookSubjects.ts` (new, pure, the first and separate commit)** — the
   vocabulary K3 imports too:
   ```ts
   import { AlignLeft, CircleUserRound, ImageIcon, type LucideIcon } from "lucide-react";
   import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject } from "../../api/types";
   import { fmtCount } from "../../utils/format";

   export const SUBJECT_KINDS = ["header_image", "about", "avatar"] as const satisfies readonly GuestbookSubjectKind[];
   /** The chip's word while the subject is still what the profile shows. */
   export const SUBJECT_LABEL: Record<GuestbookSubjectKind, string> = { header_image: "Header image", about: "About text", avatar: "Avatar" };
   /** …and once it has changed — a word in the chip, never only a glyph (M8). */
   export const SUBJECT_LABEL_EARLIER: Record<GuestbookSubjectKind, string> = { header_image: "Earlier header image", about: "Earlier About text", avatar: "Earlier avatar" };
   export const SUBJECT_ICON: Record<GuestbookSubjectKind, LucideIcon> = { header_image: ImageIcon, about: AlignLeft, avatar: CircleUserRound };
   /** What the trigger on an item is about, for its title: "the header image" … */
   export const SUBJECT_NOUN: Record<GuestbookSubjectKind, string> = { header_image: "the header image", about: "the About text", avatar: "the avatar" };

   export function subjectChipLabel(s: PlayerGuestbookSubject): string   // current ? SUBJECT_LABEL : SUBJECT_LABEL_EARLIER
   export function subjectChipTitle(s: PlayerGuestbookSubject): string   // images: "Show the image this is about"; about: "Show the text this is about"
   export function subjectTriggerLabel(count: number): string             // count > 0 ? fmtCount(count, "comment", "comments") : "Comment"
   export function subjectTriggerTitle(kind: GuestbookSubjectKind, count: number): string  // `Comment on ${noun}` / `${fmtCount(…)} on ${noun}`
   /** Roots with a subject that is still current, per kind — what the item's trigger shows. Replies never count. */
   export function countCurrentSubjectEntries(rows: PlayerGuestbookEntry[]): Record<GuestbookSubjectKind, number>
   ```
   All four icons exist in the installed `lucide-react` (`frontend/node_modules/lucide-react/dist/esm/icons/`:
   `image`, `align-left`, `circle-user-round`; `ImageIcon` is the alias `ProfileHeader.tsx:1` already imports).
2. **`api/players.api.ts`** — `createPlayerGuestbookEntry(token, playerId, body, parentEntryId?,
   authorPlayerId?, subjectKind?: GuestbookSubjectKind | null)` adds `subject_kind: subjectKind ?? null`
   to the JSON; new `guestbookSubjectImageUrl(snapshotId: number, capturedAt?: string | null)` →
   `mediaUrl(\`/players/guestbook-subjects/${snapshotId}/image\`, capturedAt)` (imported from
   `./client`, the `playerHeaderImageUrl` shape).
3. **`useProfileGuestbook.ts`:**
   - State: `subjectDraftByPlayerId: Record<number, GuestbookSubjectKind | null>` (the `guestbookDraftByPlayerId`
     shape — per profile, so switching profiles keeps each one's arming);
     `viewedSubject: PlayerGuestbookSubject | null`. Rename `postedNonce` → **`composerNonce`**: it
     is bumped after a post (today) **and** when the composer is armed, and it is what puts the caret
     in the field (`AutoTextarea`'s focus effect runs on mount too when the nonce is non-zero, so a
     tab switch that mounts the feed focuses the field).
   - `armSubject(kind)`: set the draft for `targetPlayerId`, bump `composerNonce`.
     `clearSubject()`: set null. Both `useCallback`.
   - `createGuestbookMut.mutationFn` takes `subjectKind: GuestbookSubjectKind | null` and passes it;
     `onPost` sends `subjectDraft` for a root; `submitReply` sends `null`; `onSuccess` for a root also
     clears the subject.
   - `currentSubjectCounts = useMemo(() => countCurrentSubjectEntries(guestbookQ.data ?? []), …)`.
   - Card context gains `viewSubject: (s: PlayerGuestbookSubject) => void` (sets `viewedSubject`).
   - `sectionProps` gains `subjectDraft`, `onClearSubject`, `viewedSubject`, `onCloseSubject`, and
     `composerNonce` replaces `postedNonce`.
   - **The return gains — the K3 contract:** `armSubject`, `canPostGuestbook`, `currentSubjectCounts`,
     `scrollToGuestbookSection`. Nothing already returned changes name.
4. **`pages/live/comments/CommentComposer.tsx`** — export `ModeBadge` and let it take
   `icon?: ReactNode` and `leaveLabel?: string`; without `icon` it draws Goal/Target by `label` as
   today, without `leaveLabel` it says `Leave ${label.toLowerCase()} entry`. No other change; both
   existing call sites are untouched.
5. **`GuestbookSection.tsx`** — props per step 3. Inside the sticky composer box, above
   `CommentSendRow`, wrapped in `space-y-2`:
   ```tsx
   {subjectDraft ? (() => { const Icon = SUBJECT_ICON[subjectDraft]; return (
     <ModeBadge label={SUBJECT_LABEL[subjectDraft]} icon={<Icon size={12} aria-hidden="true" />}
                onLeave={onClearSubject} leaveLabel="Remove the subject" />
   ); })() : null}
   ```
   `focusNonce={composerNonce}`. After the two `ConfirmDialog`s, the two viewers, both driven by
   `viewedSubject`:
   ```tsx
   <ImageLightbox
     open={!!viewedSubject && viewedSubject.kind !== "about"}
     src={viewedSubject && viewedSubject.kind !== "about" ? guestbookSubjectImageUrl(viewedSubject.snapshot_id, viewedSubject.captured_at) : null}
     onClose={onCloseSubject} />
   <Modal open={!!viewedSubject && viewedSubject.kind === "about"} title="About text"
     subtitle={viewedSubject ? `As of ${fmtDateTime(viewedSubject.captured_at)}${viewedSubject.current ? "" : " · changed since"}` : undefined}
     onClose={onCloseSubject} maxWidth="max-w-md">
     <div className="whitespace-pre-wrap text-sm text-text-normal">{viewedSubject?.text}</div>
   </Modal>
   ```
   The lightbox for a pinned copy carries **no** `footer` (K3's trigger belongs to the live picture,
   not to a snapshot of it).
6. **`GuestbookEntryCard.tsx`** — between the header row and the body / edit block, one button, the
   `ModeBadge` chip's look without the accent (a subject is a fact, not a selected mode):
   ```tsx
   {entry.subject ? (() => { const subject = entry.subject; const Icon = SUBJECT_ICON[subject.kind]; return (
     <button type="button"
       onClick={(e) => { e.preventDefault(); e.stopPropagation(); ctx.viewSubject(subject); }}
       className="chip mt-2 inline-flex items-center gap-1.5 focus-ring"
       title={subjectChipTitle(subject)} aria-label={`${subjectChipLabel(subject)}. ${subjectChipTitle(subject)}`}
       data-subject={subject.kind} data-subject-current={subject.current || undefined}>
       <Icon size={12} aria-hidden="true" />
       <span>{subjectChipLabel(subject)}</span>
     </button>
   ); })() : null}
   ```
   `stopPropagation` because the card's own `onClick` marks it read (`:103`), like every control in it.
7. **Tests.** `test/guestbookSubjects.test.ts`: the two label tables agree on keys with
   `SUBJECT_KINDS`; `subjectChipLabel` flips on `current`; `subjectTriggerLabel(0) === "Comment"`,
   `(1) === "1 comment"`, `(3) === "3 comments"`; `countCurrentSubjectEntries` counts roots with a
   current subject per kind, ignores replies (`parent_entry_id` set), non-current subjects and
   untagged entries. `test/guestbubookSubjectChip.test.tsx` (spell it `guestbookSubjectChip`): render
   `GuestbookEntryCard` inside `GuestbookCardProvider` with a minimal context (the `recordBadges.test.tsx`
   shape): a tagged current entry shows `button[data-subject="header_image"]` reading "Header image";
   a non-current one reads "Earlier header image" and carries no `data-subject-current`; clicking
   calls `viewSubject` with the subject and does **not** call `markRead`; an untagged entry renders
   no `[data-subject]`; `container.querySelectorAll("a a").length === 0`.

**What must not change.** The tree (`guestbookTree.ts`), the read/unread logic, the reply and edit
editors, the vote row, the delete dialog and its counts, the `?entry=` / `?unread=` jumps, the
`Login as a player…` line for readers, the sticky composer's classes (`GuestbookSection.tsx:148`).

**Definition of done.** `npm run check` green (735 + the new tests), `npm run build` green. Playwright
on `:8142`, 390×844 and 1280×900, `blue` **and** `light`, as Berni on `/profiles/1?tab=guestbook`
against entries K1's stack created (or `curl` them in): the chip renders under the author row and
above the body, 28px tall, and reads "Header image"; after Roli re-uploads the header (`PUT` via
curl) and the feed resyncs, it reads "Earlier header image"; tapping it opens the lightbox on the
**old** picture (assert the `img[src]` contains `/players/guestbook-subjects/`); an About chip opens
the modal with the snapshot text and "changed since" in its subtitle once the bio moved; with the
composer armed (call the hook's `armSubject` through K3's trigger if it is in, else set state through
the section's props in a test) the badge row sits above the send row and the send row is still
`sticky bottom-nav-clear`; `a a` = 0; 0 console errors; the entry appears exactly once in the DOM
(`[id^="guestbook-entry-"]` unique).

**Gates.** `cd frontend && npm run check && npm run build`; browser at 390/1280 × blue/light.

**Canon** (K4 writes them): `DESIGN.md` §7 — a tagged guestbook entry wears one `.chip` `<button>`
with the subject's glyph and its **word** ("Header image" / "Earlier header image"), which opens the
snapshot — the lightbox for an image, a `Modal` for the About text — never the live item; §9b — the
guestbook composer, armed, shows the subject as a `ModeBadge` above `CommentSendRow`, the goal/shots
chip generalised; §5b — `Earlier …` is the word for a subject that has changed since; "About text" is
the About's name in a chip.

**Deviations:**

---

## K3 — The items: one trigger on the banner, the avatar and the About text  ☐

**The gap.** `ImageLightbox.tsx` closes on any click (`onClickCapture`, `:96`) and has no slot for a
control; `ProfileHeader.tsx:146/164` open it for the banner and the avatar with nothing else in it;
`ProfileOverviewTab.tsx:100` renders the About `section-head` with no action; `ProfilePage.tsx` passes
the guestbook nothing about subjects; the owner's upload/delete mutations (`ProfileHeader.tsx:82-128`)
and the bio save (`ProfilePage.tsx:228`) never invalidate `qk.playerGuestbook`.

**Verify first.**
```bash
grep -n 'footer' frontend/src/ui/primitives/ImageLightbox.tsx                          # → 0
ls frontend/src/pages/profile/SubjectCommentTrigger.tsx                                 # → no such file
grep -n 'playerGuestbook' frontend/src/pages/profile/ProfileHeader.tsx frontend/src/pages/ProfilePage.tsx   # → 0 in ProfileHeader; ProfilePage only via the hook
```
K2's first commit must be in: `ls frontend/src/pages/profile/guestbookSubjects.ts`.

**The change.**

1. **`pages/profile/SubjectCommentTrigger.tsx` (new)** — the one "start a comment about this" control:
   ```tsx
   export default function SubjectCommentTrigger({ kind, count, canPost, onOpen, variant = "ghost", className }: {
     kind: GuestbookSubjectKind; count: number; canPost: boolean;
     onOpen: (kind: GuestbookSubjectKind) => void; variant?: "ghost" | "solid"; className?: string;
   }) {
     // A control that does nothing is never shown (P4): a reader with nothing to read gets none.
     if (!canPost && count === 0) return null;
     return (
       <Button type="button" variant={variant} onClick={() => onOpen(kind)}
         title={subjectTriggerTitle(kind, count)} aria-label={subjectTriggerTitle(kind, count)}
         data-subject-trigger={kind}
         className={cn("inline-flex h-8 items-center gap-1.5 px-2 text-xs", className)}>
         <MessageSquare size={14} aria-hidden="true" />
         {subjectTriggerLabel(count)}
       </Button>
     );
   }
   ```
   The class string and the `MessageSquare` + `fmtCount` label are `IdeaComments.tsx:69-79`'s toggle
   verbatim — the app's one "comment on this" affordance. `variant="solid"` exists for the lightbox,
   where a ghost button sits on a black scrim in every theme and the light theme's ghost is dark text.
2. **`ui/primitives/ImageLightbox.tsx`** — `footer?: ReactNode` on both components. After the
   viewport `div`, inside the scrim:
   ```tsx
   {footer ? (
     <div data-lightbox-footer className="absolute bottom-safe-b left-safe-l right-safe-r z-10 flex justify-center p-3"
          onClick={(e) => e.stopPropagation()}>{footer}</div>
   ) : null}
   ```
   and in the root's `onClickCapture`, first line: `if ((e.target as Element | null)?.closest?.("[data-lightbox-footer]")) return;`
   — capture runs before the child's handler, so the child's `stopPropagation` alone cannot save it.
   The footer overlaps the bottom 56px of a picture that fills the height (a 16:9 banner at 1280×900
   does); on a 390×844 phone the banner sits in black space and nothing is covered. The two other
   callers (`IdeasPage.tsx:359`, `TournamentCommentsCard.tsx:970`) pass no footer and are unchanged.
3. **`ProfileHeader.tsx`** — three new props: `subjectCounts: Record<GuestbookSubjectKind, number>`,
   `canPostGuestbook: boolean`, `onCommentOn: (kind: GuestbookSubjectKind) => void`. The banner
   lightbox (`:404`) gets
   `footer={<SubjectCommentTrigger kind="header_image" count={subjectCounts.header_image} canPost={canPostGuestbook} variant="solid" onOpen={(k) => { setHeaderLightboxSrc(null); onCommentOn(k); }} />}`,
   the avatar lightbox (`:403`) the same with `avatar`. The four mutations' `onSuccess` each add
   `await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId) })` — the owner's own
   chips flip to "Earlier …" with the upload, not 5 s later. Nothing else in the header moves: no
   corner badge on the banner, no count beside the avatar (an open decision below).
4. **`ProfileOverviewTab.tsx`** — props `aboutCommentCount: number`, `canPostGuestbook: boolean`,
   `onCommentOnAbout: () => void`. The About `section-head` (`:100`) becomes
   ```tsx
   <div className="section-head">
     <span className="section-label">About</span>
     {profileBio?.trim() ? (
       <SubjectCommentTrigger kind="about" count={aboutCommentCount} canPost={canPostGuestbook}
         onOpen={() => onCommentOnAbout()} className="order-1 shrink-0" />
     ) : null}
   </div>
   ```
   — `order-1` is the section-head's action slot (`DESIGN.md` §6; the "Recent matches" head at `:178`
   is the worked example). An empty About has no trigger: there is nothing to pin, and K1 would answer
   409. The owner sees it above their own textarea; the snapshot is the *saved* bio, never the draft.
5. **`ProfilePage.tsx`:**
   ```ts
   const onCommentOn = (kind: GuestbookSubjectKind) => {
     setProfileTab("guestbook");
     if (guestbook.canPostGuestbook) guestbook.armSubject(kind);
     else guestbook.scrollToGuestbookSection("auto");   // a reader with a count: show the conversation
   };
   ```
   passed as `onCommentOn` to `ProfileHeader` with `subjectCounts={guestbook.currentSubjectCounts}`
   and `canPostGuestbook={guestbook.canPostGuestbook}`, and as `onCommentOnAbout={() =>
   onCommentOn("about")}` with `aboutCommentCount={guestbook.currentSubjectCounts.about}` to the
   overview tab. `saveProfileMut.onSuccess` adds `qk.playerGuestbook(targetPlayerId)` to its
   invalidations. **iOS note for Deviations, not a gate:** the caret is placed by the nonce after a
   tab switch, outside the tap's own call stack, so Safari may show the field focused without raising
   the keyboard; the armed chip is visible either way.
6. **Tests.** `test/subjectCommentTrigger.test.tsx`: reader + 0 → renders nothing; reader + 2 →
   "2 comments", click fires `onOpen("header_image")`; poster + 0 → "Comment"; the title names the
   subject ("Comment on the header image"); no `<a>`. `test/imageLightboxFooter.test.tsx` (stub
   `globalThis.ResizeObserver` with `observe/disconnect` no-ops — jsdom has none): a click on the
   scrim calls `onClose`; a click on a button inside `footer` does **not**; without `footer` no
   `[data-lightbox-footer]` is rendered.

**What must not change.** The pictures sheet and its three rows, the editors, the `ConfirmDialog` on
the header delete, `RecordBadges`, the poke controls, the rival/teammate/recent-match blocks, the
tab strip, `useGuestbookUnreadJump`.

**Definition of done.** `npm run check` and `npm run build` green. Playwright on `:8143`, 390×844
and 1280×900, `blue` **and** `light`: **as Berni** on `/profiles/1` — tapping the banner opens the
lightbox with a solid button centred at its bottom reading "Comment" (or "N comments"), inside the
safe box; tapping it closes the lightbox, lands on `?tab=guestbook`, shows the `ModeBadge`
"Header image" above the send row and the field has focus (`document.activeElement` is the
textarea); posting creates an entry whose chip reads "Header image" and the banner's button now reads
"1 comment"; the avatar does the same with "Avatar"; the About head shows the ghost trigger at the
right (`order-1`), and not at all on a profile with an empty bio; **as a reader** (no token) the
About trigger is absent at 0 and present at 1, and tapping it lands on the guestbook tab with no
badge; `a a` = 0; 0 console errors; measure the About head's height with and without the trigger
(both must be the `h-8` row — the trigger may not grow the head). **As Roli** re-uploading the header
flips Berni's chip to "Earlier header image" on Berni's open tab within 5 s without a reload (the
page channel) and immediately on Roli's own.

**Gates.** `cd frontend && npm run check && npm run build`; browser at 390/1280 × blue/light.

**Canon** (K4 writes them): `DESIGN.md` §7 — `SubjectCommentTrigger` is the one "comment on this"
control on a profile item (the Ideas toggle's look), shown to a poster always and to a reader only
with a count; `ImageLightbox` takes a `footer` rendered in the safe box, and a click inside it never
closes the lightbox; §9b — an item never hosts its own thread: its trigger arms the guestbook's
composer. `AGENTS.md` §6 — the owner's picture and bio mutations invalidate `qk.playerGuestbook`
because `current` is a fact about the profile the guestbook list carries.

**Deviations:**

---

## K4 — Documentation pass  ☐

**Verify first.** `grep -n 'guestbook_subjects\|PlayerSubjectSnapshot' AGENTS.md` → 0;
`grep -n 'SubjectCommentTrigger\|Earlier header image' DESIGN.md` → 0.

**The change.** Fold every "Canon" block above into `AGENTS.md` (§2, §5, §6 incl. the cache table
row's `why`, §7 persistent data, §9, §10, §11 "current state" — the batch, its commit count, the two
tables, the expected log line, the deploy shape) and `DESIGN.md` (§5b, §7, §9b), in the voice those
files use, and correct anything the three implementation tasks' Deviations contradict. Delete
nothing a worker did not mark stale. Tick all four boxes here. Then run the whole gate set once more
on the final tree and write the numbers into §11 (`make test`, `make lint`, `make gen-types` no
diff, `npm run check`, `npm run build`).

**Gates.** All of them, on the final tree; `git status` shows only the three files.

**Deviations:**

---

## Deployment notes

- **Full deploy** (schema + media): §7's checklist, **the step-2 data backup first**. No manual step:
  `create_all` makes both tables, `write_media` makes `uploads/guestbook_subjects/` on first use, the
  log line `Guestbook subjects swept: N` appears **only** when a boot removed something (expect none
  on the first boot).
- Smoke: `curl https://lorbeerkranz.xyz/api/players/1/guestbook | grep -c '"subject"'` > 0 proves the
  new code is up (the key is present, `null`, on every entry); after the first tagged post,
  `ls /data/uploads/guestbook_subjects` on the server shows one file.
- **Rollback** to the pre-batch sha ignores both tables (measured in K1). What it costs: tagged
  entries show as plain entries; an entry deleted while rolled back leaves a link and a file that the
  next boot of the new code sweeps.
- `backend/data/uploads/guestbook_subjects` joins the persistent data `sync-local-from-deploy` mirrors
  (it rsyncs `uploads/` whole — nothing to add).

## Decisions still needed from Roli

1. **Where the image trigger lives.** This plan: inside the lightbox only (one control for both
   pictures, no change to the header's layout). Alternative: also a small count badge in the banner's
   corner — visible without a tap, but a second affordance for one job and a busier header that M8/M9
   just calmed down.
2. **May the owner tag their own pictures on their own wall?** This plan: yes — anyone who can post
   can tag (no rule to explain, no extra state). Alternative: hide the triggers on your own profile
   (one `isOwnProfile` guard in K3; cost: an owner who wants to say "new header, thoughts?" cannot).
3. **The push wording.** This plan: unchanged — "left a new message". Alternative: a second text key
   ("… wrote about your header image") × three languages with umlauts, plus the bell headline;
   cost ≈ a day of copy and Roli's Styrian, and a `text_key` branch in the router. Roli said it
   probably should not change; this only confirms it.
4. **The chip's word once the subject changed.** This plan: `Earlier header image` / `Earlier About
   text` / `Earlier avatar`. Alternatives are one-line edits in `guestbookSubjects.ts` (`Old …`,
   `… (changed)`); pick before K2 ships copy into the DoD screenshots.
5. **A pinned copy of a picture nobody else can see any more** — after the last entry naming it is
   deleted the copy is gone (this plan, his "storage tracks the conversation"). Alternative: keep
   copies for ever (no `release_subjects`; cost: disk grows with every deleted conversation and a
   leak nothing can find later).

### Critical Files for Implementation
- /home/roli/projects/turnierplaner-reloaded/backend/app/routers/players.py
- /home/roli/projects/turnierplaner-reloaded/backend/app/services/file_storage.py
- /home/roli/projects/turnierplaner-reloaded/backend/app/models.py
- /home/roli/projects/turnierplaner-reloaded/frontend/src/pages/profile/useProfileGuestbook.ts
- /home/roli/projects/turnierplaner-reloaded/frontend/src/pages/profile/ProfileHeader.tsx
