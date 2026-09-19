# Features 2026-09 — Records on the profile: the badge band, one records endpoint, and "Rumpi took it from you"

> Branch `feature/2026-09-badges` off `main` (baseline `f8a02b7`). Written 2026-09-19 (read-only
> planning session — no check was run; baselines are `AGENTS.md` §11's: `make test` **228**,
> `npm run check` **717 tests in 71 files**).
> Symbol names are the source of truth; line numbers reference the baseline.
> Read `AGENTS.md` first (§5 persistence, §6 API + realtime + the cache-policy table, §9 how work is
> done, §10 gotchas), then `DESIGN.md` (§1.5 icons, §2 tokens, §3 surfaces, §5b words, §7 components).
> This batch **touches the backend and the schema** (two new tables) and is the **full** deploy.
> **Not deployed** at the end of the batch — Roli tests first.
>
> Task IDs `M1`–`M7`. `A B C D DS F G N P Q R S T U` are taken; `M` is free
> (`grep -rn '^## M[0-9]' *.md` → nothing at the baseline).

## The icon proposal — Roli approves this before any frontend code is written

Every badge is a lucide-react glyph at `size={14}` inside a grey `.chip`, so the only thing that
tells sixteen badges apart is the glyph. Four of the sixteen reuse the icon the record already wears
in Stats; two records *lose* the icon they have today because it collides with a streak; ten are new.
Nothing here uses `Crown` (the cup) or any cup colour token — that is what keeps the band from
reading as the cup ring (T15/C12).

| # | key | record (English stats label) | group | lucide icon | status | why this glyph | look at |
|---|---|---|---|---|---|---|---|
| 1 | `most_titles` | Most tournament wins | title | `Trophy` | **reused** (`RecordsView` titles) | the titles glyph already | `Trophy` is also the *Tournaments* source token in the filter pill and the nav's Tournaments entry; it is the semantic neighbour of the cup crown — but it is a cup, not a crown, and it is grey, not gold |
| 2 | `highest_elo` | Highest Elo | elo | `Award` | new | a rosette = a grade / rating | `Award` vs `Trophy`: rosette-on-ribbon vs cup — distinct at 14px; `Medal` deliberately unused so the pair never meets |
| 3 | `highest_elo_1v1` | Highest Elo (1v1) | elo | `Award` + `1v1` (`.text-micro`) | new | same glyph, the mode spelled beside it — a mode label is not a count | |
| 4 | `highest_elo_2v2` | Highest Elo (2v2) | elo | `Award` + `2v2` | new | as above | |
| 5 | `most_points` | Most points | table | `Coins` | new | points as a pile of coins — "pts" is the app's currency | `Coins` vs `Award`: two overlapping discs vs a rosette — **the round pair to eyeball at 14px** |
| 6 | `highest_ppm` | Highest pts / match | table | `Gauge` | new | a rate | |
| 7 | `most_played` | Most played | table | `Dumbbell` | new | the grind | |
| 8 | `most_goals_per_match` | Most goals / match | table | `Crosshair` | new | the striker | `Target` (concentric) is already the `CommentComposer` shots icon — `Crosshair` has ticks, and only one of the two appears on a profile |
| 9 | `win_streak` | Win streak | streak | `Flame` | **reused** (3 sites) | | `Flame` vs `Zap` (#13): both jagged — they already sit side by side at 12px on the Records page; in the band they are 14px and adjacent — **the jagged pair to eyeball** |
| 10 | `unbeaten_streak` | Unbeaten streak | streak | `Shield` | **reused** | | `ShieldHalf` is the Clubs nav icon — different screen, never adjacent |
| 11 | `scoring_streak` | Scoring streak | streak | `Goal` | **reused** | the net; `Goal` means "goals" in ten files already | |
| 12 | `clean_sheet_streak` | Clean sheet streak | streak | `Lock` | **reused** | | `Lock` is also the drawer's admin-lock glyph (`MobileChrome`) — different screen |
| 13 | `biggest_win` | Biggest win | match | `Zap` | **reused** (`RecordsView`) | | see #9 |
| 14 | `highest_scoring_match` | Highest-scoring match | match | `PartyPopper` | **new — replaces `Goal`**, which the scoring streak owns in three files | a goal fest | |
| 15 | `most_goals_one_side` | Most goals by one side | match | `Rocket` | **new — replaces `Flame`**, which the win streak owns in three files | a barrage | |
| 16 | `biggest_upset` | Biggest upset (by Elo) | match | `TrendingUp` | **reused** (`RecordsView`) | | `LineChart` (the Trends tab) is another rising line, but the tab strip is never on a profile |

Confusable pairs at 14–16px, flagged for the browser check: `Coins`/`Award` (#5/#2) and `Flame`/`Zap`
(#9/#13). Collisions with marks already in use: none uses `Crown`; `Trophy` (#1) is the nearest thing
to the cup and is flagged; the streak flame stays the win streak's alone (#15 gives it up). All sixteen
names exist in the installed `lucide-react@^1.17.0` (checked against `node_modules/lucide-react/dist/esm/icons/`).
The one map every consumer reads is `frontend/src/pages/stats/recordIcons.ts` (M3): `StreaksView`,
`StreakPatches`, `PlayerStreakChips` and `RecordsView` each carry their own copy today, which is how
#14 and #15 came to collide in the first place.

## Why this batch exists

Rumpi's idea, *"Overall Rekorde auf der Profilseite"*: a player's profile shows a badge for every
record they currently hold, and tapping one lands where that record lives in Stats. Roli added the
other half: when a record changes hands, everybody hears about it — the one who took it, the one who
lost it, and the four who watched.

Two facts about the code shape the whole plan:

1. **Nothing computes the Records page on the server.** `pages/stats/RecordsView.tsx` fetches
   `/stats/player-matches` once per player (`useQueries`, six requests) and works out biggest win,
   highest-scoring match, most goals by one side and the Elo upset **in the browser**; "Most
   tournament wins" is counted from `/stats/players`' `winner_player_id` in the same file. A badge
   endpoint that re-implemented those rules in Python would be a second implementation — the exact
   failure mode ("a badge claiming a record the Records page does not show"). So the computation
   moves to the backend **once** (`services/stats/records.py`), the Records page reads it back, and
   the badge reads the same endpoint under the same query key.
2. **Nothing remembers who held what.** Every stat is a fold over match rows; there is no diff base
   for "took it from you". Two additive tables (`RecordHolder`, `RecordKeyState`) remember the last
   answer, and one function called from every result-changing path compares and announces.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code style
   (thin routers, bodies in `services/`, error helpers from `api_utils.py`; Tailwind + design tokens,
   `qk` query-key factory, generated API types, lucide-react with an explicit `size`).
2. Work on branch `feature/2026-09-badges`. **Never switch branches, never touch `main`, never
   push.** One or more commits per task, message prefixed with the task ID (`feat(M1): …`,
   `fix(M4): …`, `docs(M7): …`).
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never `git commit -a`.
   Each task lists its file set; if you need a file outside it, stop and report. `AGENTS.md` and
   `DESIGN.md` are edited by **M7 only**: write the canon line your task changes under "Canon" in
   your task section and leave the files alone.
4. **Verify first.** Every task names the check that proves the gap still exists. Run it before
   changing anything; if the gap is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing. Backend touched → `make test` + `make lint`. **Response
   model touched → `make gen-types`, and `frontend/src/api/generated/schema.d.ts` goes in the same
   commit.** Frontend touched → `cd frontend && npm run check` (+ `npm run build` where the task
   says). Baselines (`AGENTS.md` §11): backend **228 passed**, frontend **717 tests in 71 files**.
6. UI must work at ~390px and ≥1024px, verified in a real browser (Playwright against the isolated
   stack below) in **both** the `blue` and the `light` theme. Measure, do not eyeball.
7. Never read or print `backend/secrets.json`. Never run destructive commands on `backend/app.db` or
   `backend/data/app.db` — copy first. **Never bind 8000/8001/8010/5173 — Roli's dev servers are on
   8000 and 8001 right now.**
8. **One mechanism per job — reuse before you create.** The last two batches did not create new
   inconsistency because every worker used the one implementation the plan named; a worker who
   invents a parallel way while adding a feature undoes that. Before writing a helper, a hook, a
   table or a class string, look for the existing one — and if your task names a mechanism, use
   **that** one and no other. The shared things this batch depends on:

   | job | the one implementation | who builds it |
   |---|---|---|
   | the record list — keys, English labels, explainers, deep-link paths, order | `services/stats/records.py::RECORD_DEFS` | M1 |
   | who holds what, **live** (the page and the badge) | `services/stats/records.py::compute_stats_records` behind `GET /stats/records`, cached under `qk.stats.records(mode, scope)` | M1 |
   | who held what, **last time** (the diff base) | `RecordHolder` + `RecordKeyState`, written only by `services/record_holders.py::reconcile_record_holders` | M2 |
   | "a result changed" — the one thing a router calls | `services/record_holders.py::after_result_change(request, s, …)` | M2 |
   | a push to one player that reaches the default mode | `NotificationDispatcher.enqueue_personal_for_player` via `notifications.push_record_moves` | exists; M2 adds the helper |
   | a push text | `notification_texts.json` + `render_notification_text`; language-dependent sentences are helpers in `notification_texts.py` (`_record_lines`, `_join_names`) | exists; M2 adds two helpers |
   | a record's icon | `pages/stats/recordIcons.ts::recordIcon(key)` — the streak sites and the Records page import it | M3 builds, M4 repoints |
   | a table sort from the URL | `?sort=`/`?dir=`, constants in `statsNav.ts`, parsed once in `StatsInsights`, `StatsTable` controlled by props | M3 |
   | a section anchor from a one-shot param | `pages/stats/useOneShotSectionParam.ts` (the `CupsView` `?cup=` effect, generalised; `CupsView` adopts it) | M4 |
   | a match row on the Records page | `ScoreLine` + `ClubMark` + `tournamentMatchHref` | exists |
   | "this record is being set right now" | `border-accent` on the chip — the signal `PlayerStreakChips` and `StreakPatches` already paint (`DESIGN.md` §3) | exists |
   | the badge band | `pages/profile/RecordBadges.tsx` | M5 |
   | a joined list of names in a push | `_join_names` in `notification_texts.py` | M2 |

   If your task genuinely needs something new and shared, put it where the existing family lives and
   say so in **Deviations** in your first sentence. Two implementations of one job is a failed task
   even when both are correct and the tests are green.
9. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the task
   did not say, what you measured, what you left). Include that edit in your commit. If blocked or
   the code does not match this spec, stop, note it here, commit nothing broken.

### Runtime verification (isolated stack)

**Tasks run in parallel, so every task has its own ports and its own database copy.** The last two
batches used 8031–8064 and 8071–8085; this one takes a fresh range.

| task | backend | vite | db copy |
|---|---|---|---|
| M1 | 8091 | 8111 | `backend/data/verify-m1.db` |
| M2 | 8092 | 8112 | `backend/data/verify-m2.db` |
| M3 | 8093 | 8113 | `backend/data/verify-m3.db` |
| M4 | 8094 | 8114 | `backend/data/verify-m4.db` |
| M5 | 8095 | 8115 | `backend/data/verify-m5.db` |
| M6 | 8096 | 8116 | `backend/data/verify-m6.db` |

`backend/data/*.db` is gitignored. **Never** point the stack at `backend/app.db` or
`backend/data/app.db`.

```bash
# <B>, <V>, <DB> from your row above
cp backend/app.db backend/data/<DB>

# A throwaway secrets file OUTSIDE the repo (Rule 7). Three accounts, because "gained / lost /
# watching" needs three distinct people with a login:
SEC=$(mktemp -d)/secrets.json
cat > "$SEC" <<'JSON'
{ "db_url": "sqlite:///./app.db",
  "player_accounts": [ { "name": "Roli",  "password": "verify-only", "admin": true },
                       { "name": "Berni", "password": "verify-only", "admin": false },
                       { "name": "Flo",   "password": "verify-only", "admin": false } ],
  "jwt_secret": "verify-only", "ws_require_auth": false, "log_level": "INFO" }
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
wire on this machine** (no `cryptography` in the venv, no VAPID): every push test stops at the queued
`PushMessage` — the `_Recorder` with `enqueue_personal_for_player` from `tests/test_ideas.py:333`.
On first boot against the copied DB expect the log line `Record holders seeded: 16` (M2 onwards).
Kill only the PIDs you started.

---

## Decisions (Roli 2026-09-19 — do not relitigate)

- **Placement:** a band **inside the identity block** on the profile — below avatar / name /
  "Public profile", **above** the "Angepöbelt: N" meta line (i.e. inside the text column beside the
  avatar, `ProfileHeader.tsx:180-202`). It wraps on content and is width-dependent. It must hold
  **many** badges without pushing the tab strip around more than a wrapped row costs (the numbers are
  under "Decided by this plan" — layout).
- **Which records:** everything the Records view defines, everything the Streaks view defines, plus
  **most points, highest ppm, most played, most goals per match**, and **highest Elo for 1v1, 2v2 and
  overall separately** (three badges). Sixteen records; the definitive list is in M1.
- **Scope: `mode=overall`, `source=tournaments`. Never friendlies.** Every badge, no exceptions. The
  constants are `BADGE_MODE`/`BADGE_SCOPE` in `services/record_holders.py` and nothing else names them.
- **No minimum threshold.** Whoever tops the column holds it, exactly as the Stats table sorts. Roli
  was asked and declined a floor. (The plan still has to say what "tops the column" means when nobody
  has played — see "Decided by this plan", the empty-column rule; that is not a floor.)
- **All tied holders get the badge**, and **the badge carries no count** — the tie is visible in
  Stats when you tap through. `×N` already means three different things in this app (§5b); it does
  not become a fourth. (The `1v1`/`2v2` label beside the two mode-specific Elo badges is a *mode*, not
  a count.)
- **Ongoing streaks are marked** as ongoing on the badge — with `border-accent`, the very signal
  `PlayerStreakChips` paints on the same profile when a current run is the record.
- **Tapping a badge navigates to that record's place in Stats**, sorted where the record is a table
  column (`?sort=`), anchored where it is a section (`?record=`).
- **Icons: lucide only.** Reuse the icon a record already has where one exists. **The icon set at the
  top of this file is approved by Roli before M3/M4/M5 start** (M1 and M2 are backend and do not wait).
- **Must not read as the cup ring.** An avatar ring means "holds a cup today"; `C12` deleted a
  duplicate crown precisely because two marks said one thing. The band is grey chips with no cup
  token and no `Crown`; it sits a few pixels from the ring and must be visibly a different kind of mark.
- **Standings: expect no change.** Stable records ("most tournament wins") are not interesting there,
  and the volatile ones are ongoing streaks, which `StreakPatches` already shows with an accent border
  for a record. **Do not remove anything.** M6 evaluates and writes down the answer; "nothing" is the
  expected and acceptable answer.
- **The notification half.** A record changing hands notifies **every player**, one notification
  **per record moved**, with **three different texts** depending on the recipient: **gained · lost ·
  watching someone else's move**. Record names stay the **English stats label** inside all three
  languages. These are personal events (`record_moved` joins `PERSONAL_DEFAULT_EVENT_TYPES`) and must
  reach a device in the default "Results & personal" mode. **Roli was shown the arithmetic — with six
  players that is 6 notifications per record moved, and on a four-record night 4 per person — and
  chose to keep it.** Nobody quietly "optimises" this into a digest later; a same-record move replaces
  the previous one on the device (OS tag `record-{key}`), and that is the whole of the batching.

### Decided by this plan — the answers to the nine questions

**1. The definitive record list (the spine).** Sixteen keys, in the order the band shows them and the
push names them. Groups: `title` · `elo` · `table` · `streak` · `match`.

| key | label (English stats label) | computed from | holders | ongoing |
|---|---|---|---|---|
| `most_titles` | Most tournament wins | `compute_stats_players(mode, lastN=0, scope)["tournaments"]` → `winner_player_id` where `status == "done"` (what `RecordsView.winLeaders` reads today) | every player with the top count | no |
| `highest_elo` | Highest Elo | `compute_stats_ratings(mode, scope)["rows"]` → `rating` | top value, exact tie | no |
| `highest_elo_1v1` | Highest Elo (1v1) | `compute_stats_ratings("1v1", scope)` — mode fixed | as above | no |
| `highest_elo_2v2` | Highest Elo (2v2) | `compute_stats_ratings("2v2", scope)` — mode fixed | as above | no |
| `most_points` | Most points | ratings rows → `pts` (the Table's `pts` column reads the same rows via `useStandings`) | top value | no |
| `highest_ppm` | Highest pts / match | ratings rows → `pts / played` | top value | no |
| `most_played` | Most played | ratings rows → `played` | top value | no |
| `most_goals_per_match` | Most goals / match | ratings rows → `gf / played` | top value | no |
| `win_streak` | Win streak | `compute_stats_streaks(mode, limit=200, scope)` → category `records` (the Streaks page's list) | every row with `length == records[0].length` | `row.ongoing` |
| `unbeaten_streak` | Unbeaten streak | as above | as above | `row.ongoing` |
| `scoring_streak` | Scoring streak | as above | as above | `row.ongoing` |
| `clean_sheet_streak` | Clean sheet streak | as above | as above | `row.ongoing` |
| `biggest_win` | Biggest win | finished matches (`players.finished_matches_with_players`) — max `|ag−bg|` over decided matches | the **winning side(s)** of every tied match | no |
| `highest_scoring_match` | Highest-scoring match | max `ag+bg` | **both sides** of every tied match (Decision 2 below) | no |
| `most_goals_one_side` | Most goals by one side | max `max(ag, bg)` | the side(s) that scored it | no |
| `biggest_upset` | Biggest upset (by Elo) | max `avg(loser Elo) − avg(winner Elo)` > 0, Elo from `compute_stats_ratings(mode, scope)` (what `RecordsView.eloById` reads) | the winning side(s) | no |

The **empty-column rule** (not a threshold): a `table`/`elo` record has holders only among rows with
`played > 0`, and only when that set is non-empty. Without it, six players at 1000 Elo on an empty
database all "hold" Highest Elo, and a newcomer who never played can top Elo at 1000 when everyone
who played is below it. The Table sorts that newcomer to the top; the badge does not follow it there
(Decision 3 asks Roli to confirm). A `streak`/`title`/`match` record with nothing to count has no
holder (`best.length > 0` is already the streak service's rule).

**2. The icon proposal** — the table at the top of this file.

**3. The layout, measured from the classes, to be confirmed in the browser (M5).** At 390px the
content column is 358px (`--page-pad-x` 16). The avatar is 56px + `gap-3` 12 = 68px. A badge is a
`.chip` at `h-7 px-2` with a 14px icon → 32px wide incl. its hairline, `gap-1.5` = 6px between.
- **Someone else's profile at 390:** text column ≈ 290px → **7 badges per row** (7×32 + 6×6 = 260;
  an eighth would need 298). Roli's estimate was 6–8.
- **Your own profile at 390:** the `ml-auto` edit cluster (three ghost `Button`s at `h-9 px-3`
  ≈ 38px each, two `gap-2`) takes ≈ 130px, plus 12px gap → text column ≈ 148px → **4 per row**;
  with the unread-pokes bell showing (+44) → 3 per row. All sixteen badges: 3 rows on a foreign
  profile, 4 on your own.
- **1280px:** the column is `max-w-6xl` 1152 − 2×24 → text column ≈ 890px → 23+ per row — always one row.
- **What happens when they do not fit:** they wrap (Roli's suggestion). Band height = rows×28 +
  (rows−1)×6 + 4px `mt-1`. **How the tab strip stays put:** it does not, quite — a wrapped row moves
  it by 34px per row, and a header whose height changes per player is the price of wrapping. Two
  things bound it: the band renders **nothing** when a player holds nothing (no empty 28px strip), and
  the query is cached under `["stats"]` (30 s stale, 30 min kept), so every return visit renders the
  band with the first paint and nothing moves; only a cold load shifts the strip once when the data
  lands — exactly as the "New guestbook" line already does. The alternative (one fixed-height row
  that scrolls sideways, `overflow-x-auto` + `data-no-swipe-nav`) is Decision 5. The header's height
  already differs today between your own and someone else's profile (the guestbook lines), so
  "stable per player" is not a property it has.

**4. One endpoint, computed by the same services the pages call — and how that is guaranteed.**
`GET /stats/records?mode&scope` (M1) is built by `compute_stats_records`, which calls
`compute_stats_ratings`, `compute_stats_streaks`, `compute_stats_players` and the same finished-match
loader every other stats service uses — it adds no query of its own. The guarantee is structural,
not asserted: **the Records page is rewritten to read this endpoint** (M4), so the superlatives and
the titles list are computed in exactly one place; the streak holders are the `records[0].length`
ties of the same `compute_stats_streaks` list the Streaks page renders; the table records are maxima
over the same `compute_stats_ratings` rows `useStandings` turns into the Table. The badge reads the
**same cache entry** as the Records page at its default filters (`qk.stats.records("overall",
"tournaments")`), so tapping a badge into Records is a cache hit of the payload the badge was drawn
from. There is no `player_id` filter on the endpoint on purpose: a per-player variant would be a
second cache entry that can disagree with the page for 30 s.

**5. Cache invalidation.** The badge key lives under `["stats"]`, so `applyTournamentsChanged`
(`hooks/realtime/applyEvent.ts:170`) invalidates it on `result` · `status` · `deleted` exactly as it
does every other stat, and the profile is on the always-open global channel (`AppShell`). Two result
paths broadcast `updated` today although they move stats — regenerating a live tournament that
already has finished matches, and changing a played tournament's date (streaks and Elo are ordered by
`tournament.date`); M2 upgrades both to `result`, which closes the only holes a tournament result
could slip through. The Table's own key (`qk.stats.ratings`) is a different entry but the same
invalidation, so the two refetch together. The remaining 30 s window covers only a device that missed
the broadcast, and `refetchOnWindowFocus` + the visibility resync already cover that.

**6. The stats URL gains a sort.** `?sort=<column key>` and `?dir=asc` (absent = descending, the
default deleted from the URL as `useTabParam` does), written with `replace` like every stats param,
owned by `statsNav.ts` constants and parsed once in `StatsInsights`; `StatsTable` becomes controlled
by props (and stays uncontrolled for the dashboard preview). A sort column that is not visible is
made visible. Sections get `?record=<key>` — a **one-shot** param in the exact shape of `?cup=`
(`CupsView.tsx:29-43`), consumed by the sub-view that owns that section, dropped with `replace`,
listed in `lastLocation.ts`'s `ONE_SHOT_PARAMS`. The **backend emits every record's `path`**
(`RECORD_DEFS`), and the badge and the push both use it — one place decides where a record lives,
the same way `/ideas?idea=` and `/live/{id}?comment=` are already emitted by the backend today.

**7. Persisted holder state.** Two additive tables (§5 rule 1), nothing altered, nothing in
`_RUNTIME_COLUMNS`: `RecordHolder(record_key, player_id, since)` — who held what as of the last
reconcile — and `RecordKeyState(record_key, computed_at, holder_count)` — which keys have been
reconciled at least once. The second table is what makes seeding honest: a key with **no state row**
is computed and stored **silently** (the first boot on production, or a record kind added in a later
deploy), so a deploy never announces every current holder as a new one; a key with a state row and
no holder rows means "nobody holds it", which is a real answer. `init_db()` seeds them the way it
seeds `ClubStarRating` (`backfill_record_holders`, log line `Record holders seeded: N`). **Old code
boots against them** because it never reads them; the one consequence of a rollback is that results
entered while rolled back are not reconciled, so the first reconcile after re-deploy announces those
moves late — M2 measures the boot the way P1 did (`git archive f8a02b7`, run against a DB the new
code has written).

**8. One function, called by every path that changes a result.** `record_holders.after_result_change
(request, s, *, tournament_id, reason)` — reconcile, then push, then log. The paths, enumerated from
the code, and the guard each carries (a guard, not a comment, is what keeps it honest):

| path | file | called when | why |
|---|---|---|---|
| `PATCH /matches/{id}` | `routers/matches.py::patch_match` | `old_state == "finished" or m.state == "finished"` | a goal in a *playing* match is not yet a result; finishing, un-finishing and correcting a finished score are |
| `PATCH /matches/{id}/swap-sides` | `routers/matches.py::swap_sides` | `m.state == "finished"` | swaps who won |
| `POST /tournaments/{id}/generate` | `routers/tournaments.py::generate_schedule` | `deletion.finished > 0` | regenerating a live tournament destroys finished matches (allowed while not done / in the grace window) |
| `POST /tournaments/{id}/reassign` | `::reassign_2v2` | `deletion.finished > 0` (always 0 — it refuses otherwise; the guard is the proof, not a comment) | every path that destroys match rows carries the call |
| `PATCH /tournaments/{id}/second-leg` (disable) | `::second_leg` | `deletion.finished > 0` (always 0 — `_leg2_started` refuses otherwise) | as above |
| `DELETE /tournaments/{id}` | `::delete_tournament` | always | destroys results |
| `PATCH /tournaments/{id}/decider` | `::patch_decider` | always | changes the tournament's winner → Most tournament wins |
| `PATCH /tournaments/{id}/date` | `::patch_date` | the tournament has ≥1 finished match | streaks, Elo and the upset are ordered by `tournament.date`; a moved date reorders them |
| `manage.py add-match` | `backend/manage.py` | always, with `request=None` | the one write outside HTTP; no dispatcher, so it persists and logs, and nobody is pushed |
| `PATCH /tournaments/{id}/reorder` | — | **not called** | it cannot move a finished match (the finished/playing prefix is enforced at `:669-675`) |
| friendlies, `POST /tournaments`, `PATCH /tournaments/{id}` (name/settings), player renames | — | **not called** | never a tournament result; a rename changes a label, not a holder (holders are ids) |

`Q9` is the cautionary tale: a corrected result on a finished tournament used to broadcast nothing.
Here the table above is the list, and `tests/test_record_holders.py` walks it.

**9. Task order and parallelism** — the overview table below. M1 alone → {M2, M3} → {M4, M5, M6} → M7.

### Answered 2026-09-19, second pass — fold these in wherever a task still asks

- **Icons: approved as proposed.** The sixteen glyphs stand, Elo keeps one `Award` with a `1v1`/`2v2`
  micro-label, `Coins` and `Goal` stay (Roli looked at them rendered at 14px and was happy). The two
  flagged pairs are closed: `Flame`/`Zap` are distinct enough, `Coins`/`Award` likewise.
- **An ongoing streak is marked with the accent border, not a dot.** `ui/StreakPatches.tsx:38`
  already does exactly this in the standings — *"Record streak: accent border only (keep the chip
  surface for readability/consistency)"* — so the band teaches the reader nothing new. **Do not use a
  green dot**: `C10` moved the streak chip off the green status pill because green means "a match is
  playing", and a streak is not a match state. Reintroducing it here would undo that.
- **`played > 0` is required** for every table and Elo badge. Not the floor Roli declined — simply
  "has an entry at all", so a never-played newcomer sitting at the default Elo 1000 tops nothing and
  an empty database does not hand all six players every record.
- **Both sides hold "Highest-scoring match."** It is the match's record; the loser of a 7:6 made it too.
- **Overflow wraps** (Roli's call), accepting that the tab strip moves ~34px per extra row.
- **Push only. No bell item**, and therefore no read-state table and no new `/me/notifications` kind.

### German and Styrian get their umlauts back (Roli, 2026-09-19)

The existing catalog transliterates — `Oeffne`, `fuer`, `Anpoebeln`, `geaendert`, `geloescht`,
`laeuft`, `naechste`, `Anpoebeleien` (17 distinct words in `deutsch`, 4 in `steirisch`) — and
`deutsch` even says **`Guestbook`**, an English word where `Gästebuch` belongs. **There was never a
reason.** `services/webpush.py:173` already serialises with `ensure_ascii=False` and encodes UTF-8;
the only `ascii` in that module is the base64 of the VAPID key, where it belongs. The convention was
imitation, not a constraint.

So: **write real characters — ä ö ü ß — in every new string, and repair the existing ones in the same
sweep.** Delete any note in the plan, the code comments or the canon that calls German "ASCII-safe",
so nobody reimposes it. **Verify on a real device**: these are the first non-ASCII push bodies the app
will have sent, and iOS rendering them is the one thing that cannot be checked from here — if a real
push ever shows mojibake, that is where to look.

### The record labels are translated too (Roli, 2026-09-19)

`{record}` no longer stays English inside a German or Styrian push. All sixteen labels get a
`deutsch` and a `steirisch` form; English keeps the stats label verbatim.

**The consequence, stated so nobody is surprised:** a push will say *"meiste Punkte is weg"* while the
badge and the Stats page both say *"Most points"*, because the UI is English. That is the same split
the app already lives with — English UI, German notifications — but the two now have to be edited
together. **Put the label map beside the English labels**, in one place, so a record renamed in one
language is obviously missing in the others rather than silently stale.

## Task overview & order

| # | ID | Title | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------------------------------|------|
| 1 | M1 | `/stats/records` — the one computation, typed | `backend/app/services/stats/records.py` (new), `backend/app/services/stats/player_matches.py`, `backend/app/services/stats/players.py`, `backend/app/routers/stats.py`, `backend/app/schemas/responses.py`, `backend/tests/test_stats_records.py` (new), `frontend/src/api/generated/schema.d.ts`, `frontend/src/api/types.ts`, `frontend/src/api/stats.api.ts`, `frontend/src/api/queryKeys.ts` | **first, alone** |
| 2 | M2 | Persisted holders, the one after-result function, the push | `backend/app/models.py`, `backend/app/db.py`, `backend/app/services/record_holders.py` (new), `backend/app/services/notifications.py`, `backend/app/services/notification_texts.py`, `backend/app/notification_texts.json`, `backend/app/services/events.py` (docstring only), `backend/app/routers/matches.py`, `backend/app/routers/tournaments.py`, `backend/manage.py`, `backend/tests/test_record_holders.py` (new), `backend/tests/test_push_notifications.py` (the catalog test's context dict only), `backend/tests/test_realtime_events.py` | group A |
| 3 | M3 | The stats URL learns `?sort=`, `?dir=`, `?record=`; the one icon map | `frontend/src/pages/stats/statsNav.ts`, `frontend/src/pages/stats/StatsInsights.tsx`, `frontend/src/pages/stats/StatsTable.tsx`, `frontend/src/pages/stats/recordIcons.ts` (new), `frontend/src/ui/shell/lastLocation.ts`, `frontend/src/test/statsNav.test.ts`, `frontend/src/test/recordIcons.test.ts` (new), `frontend/src/test/lastLocation.test.ts` | group A |
| 4 | M4 | Records and Streaks read the one computation; anchors; shared icons | `frontend/src/pages/stats/RecordsView.tsx`, `frontend/src/pages/stats/StreaksView.tsx`, `frontend/src/pages/stats/CupsView.tsx`, `frontend/src/pages/stats/StatsInsights.tsx`, `frontend/src/pages/stats/useOneShotSectionParam.ts` (new), `frontend/src/pages/stats/MatchHistoryList.tsx` (one type widening), `frontend/src/ui/StreakPatches.tsx`, `frontend/src/pages/stats/PlayerStreakChips.tsx`, `frontend/src/test/recordsView.test.tsx` (new) | group B |
| 5 | M5 | The badge band on the profile | `frontend/src/pages/profile/RecordBadges.tsx` (new), `frontend/src/pages/profile/ProfileHeader.tsx`, `frontend/src/pages/ProfilePage.tsx`, `frontend/src/test/recordBadges.test.tsx` (new) | group B |
| 6 | M6 | Standings: evaluate, expect nothing | none expected (`pages/live/StandingsTable.tsx` read, not written) | group B |
| 7 | M7 | Documentation pass | `AGENTS.md`, `DESIGN.md`, this file | last |

**Order:** M1 alone → **group A** {M2, M3} in parallel → **group B** {M4, M5, M6} in parallel → M7.
**Why M1 alone:** every other task reads its response models, its generated types or its `RECORD_DEFS`,
and a half-written `responses.py` breaks `make gen-types` for anyone sharing the worktree. **Why M2
and M3 are disjoint:** M2 is backend + `manage.py` + three backend tests; M3 is four frontend files
and three tests; neither touches `schema.d.ts` (M2 adds no response model — the tables are internal).
**Group B:** M4 owns `pages/stats/*` and the two streak-icon consumers, M5 owns `pages/profile/*` and
`ProfilePage.tsx`, M6 writes no file. M4 edits `StatsInsights.tsx` *after* M3 has committed it; M5
needs M3's `recordIcons.ts` and M1's types, not M2 — if M2 lags, M4 and M5 may start as soon as M3 is
in. **Roli's icon approval gates group A's M3 and all of group B, not M1/M2.** Group-B workers will
see each other's in-flight files in `npm run check`; commit only your own.

---

## M1 — `/stats/records`: the one computation, typed  ☑

**The gap.** No backend module knows what a record is. `RecordsView.tsx:166-173` fetches
`/stats/player-matches` per player (`useQueries`) and computes the four superlatives at `:217-238`;
`:240-266` counts titles from `/stats/players`. `routers/stats.py` has no `/records`; `queryKeys.ts`
has no `records` key; `responses.py` has no record model.

**Verify first.**
```bash
grep -n '"/records"' backend/app/routers/stats.py                          # → 0
grep -c 'useQueries' frontend/src/pages/stats/RecordsView.tsx               # → 1 (the client-side computation)
grep -n 'records' frontend/src/api/queryKeys.ts                             # → 0
grep -n 'class StatsRecord' backend/app/schemas/responses.py                # → 0
grep -n 'def _finished_matches_with_players' backend/app/services/stats/players.py   # → :29 (module-private)
```

**The change.**

1. **`services/stats/players.py`** — rename `_finished_matches_with_players` →
   `finished_matches_with_players` (public; the one caller at `:77` follows). It is *the* loader for
   "finished matches in this mode and source", and `records.py` must use it rather than write a
   second one. Nothing else changes.
2. **`services/stats/player_matches.py`** — lift the two nested dict builders to module level so the
   records endpoint renders a match row **exactly** as `/stats/player-matches` does (same `club_stars`
   as-of rule, same friendly pseudo-ids):
   `stats_match_dict(m, played_on, stars: StarRatingResolver) -> dict` (the body of `match_dict`),
   `friendly_stats_match_dict(fm, stars) -> dict` (the body of `friendly_match_dict`), and
   `friendly_group(fm) -> dict` returning `{"id": -(1_000_000 + fid), "name": f"Friendly #{fid}",
   "date": fm.date, "mode": fm.mode, "status": "friendly"}`. `compute_stats_player_matches` calls
   them; its output is byte-identical (pin with the existing `test_stats_endpoints.py` staying green).
3. **`services/stats/records.py` (new)** — the registry and the computation:
   ```python
   @dataclass(frozen=True)
   class RecordDef:
       key: str
       group: str            # "title" | "elo" | "table" | "streak" | "match"
       label: str            # the English stats label — the push uses it inside every language
       explainer: str        # the one-line muted explainer the Records page shows
       sort_col: str | None  # table/elo: the `TABLE_COLS` key the Table sorts by
       mode: str | None      # elo: a fixed mode ("1v1"/"2v2"); None = the requested mode

   RECORD_DEFS: tuple[RecordDef, ...] = (
       RecordDef("most_titles", "title", "Most tournament wins", "Tournaments won, with each player's most recent title.", None, None),
       RecordDef("highest_elo", "elo", "Highest Elo", "Highest Elo rating.", "rating", None),
       RecordDef("highest_elo_1v1", "elo", "Highest Elo (1v1)", "Highest Elo rating in 1v1.", "rating", "1v1"),
       RecordDef("highest_elo_2v2", "elo", "Highest Elo (2v2)", "Highest Elo rating in 2v2.", "rating", "2v2"),
       RecordDef("most_points", "table", "Most points", "Most points in the table.", "pts", None),
       RecordDef("highest_ppm", "table", "Highest pts / match", "Points per match, highest in the table.", "ppm", None),
       RecordDef("most_played", "table", "Most played", "Most matches played.", "played", None),
       RecordDef("most_goals_per_match", "table", "Most goals / match", "Goals per match, highest in the table.", "gpm", None),
       RecordDef("win_streak", "streak", "Win streak", "Consecutive wins.", None, None),
       RecordDef("unbeaten_streak", "streak", "Unbeaten streak", "Consecutive matches without losing.", None, None),
       RecordDef("scoring_streak", "streak", "Scoring streak", "Consecutive matches with at least 1 goal scored.", None, None),
       RecordDef("clean_sheet_streak", "streak", "Clean sheet streak", "Consecutive matches with 0 goals conceded.", None, None),
       RecordDef("biggest_win", "match", "Biggest win", "Largest goal difference in a finished match.", None, None),
       RecordDef("highest_scoring_match", "match", "Highest-scoring match", "Most goals in one match, both sides together.", None, None),
       RecordDef("most_goals_one_side", "match", "Most goals by one side", "The biggest single-side tally in a match.", None, None),
       RecordDef("biggest_upset", "match", "Biggest upset (by Elo)", "Win against the largest Elo gap between the two sides.", None, None),
   )
   RECORD_KEYS: tuple[str, ...] = tuple(d.key for d in RECORD_DEFS)

   def record_path(d: RecordDef, *, mode: str, scope: str) -> str:
       """Where this record lives in Stats. Table/Elo → the Table sorted by its column;
       a streak → the Streaks sub-view anchored at its section; a title or match record →
       the Records sub-view anchored at its section. One place decides this for the badge
       link and the push path alike."""
       m = d.mode or mode
       base = f"/stats?view=overview&sub={{sub}}&mode={m}&source={scope}"
       if d.group in ("table", "elo"):
           return base.format(sub="table") + f"&sort={d.sort_col}"
       if d.group == "streak":
           return base.format(sub="streaks") + f"&record={d.key}"
       return base.format(sub="records") + f"&record={d.key}"

   def compute_stats_records(s: Session, *, mode: str = "overall", scope: str = "tournaments") -> dict[str, Any]
   ```
   `compute_stats_records` normalises `mode`/`scope` like its siblings and returns
   `{"generated_at", "mode", "scope", "finished_matches", "records": [...]}` with one entry per
   `RECORD_DEFS` **in registry order**, each `{key, group, label, explainer, path, value, holders,
   leaders, matches}`:
   - **table / elo:** `rows = compute_stats_ratings(s, mode=(d.mode or mode), scope=scope)["rows"]`
     (three distinct mode calls at most — memoise per mode inside the function). `candidates = [r for
     r in rows if r["played"] > 0]`; value functions `pts`, `pts/played`, `played`, `gf/played`,
     `rating`; `top = max(values)`; holders = candidates whose value `== top` (exact; the Table's sort
     compares the same floats). No candidates → `holders=[]`, `value=None`. `value` is the raw
     number (`float | None`); the frontend formats.
   - **streak:** `cats = compute_stats_streaks(s, mode=mode, player_id=None, limit=200, scope=scope)
     ["categories"]`; for each of the four keys, `records = cat["records"]`; empty → no holders;
     `top = records[0]["length"]`; holders = `[{player, ongoing: r["ongoing"]} for r in records if
     r["length"] == top]`; `value = top`.
   - **title:** `tournaments = compute_stats_players(s, mode=mode, lastN=0, scope=scope)
     ["tournaments"]`; sort by `date desc, id desc`; count `winner_player_id` where
     `status == "done"` and it is not None; `latest` = first hit per player; `leaders` sorted by count
     desc with competition ranking (1,1,3) exactly as `RecordsView.winLeaders` does at `:261-265`;
     holders = leaders with `rank == 1`; `value = top count`. Names from the `players` list of the
     same payload.
   - **match:** `matches = finished_matches_with_players(s, mode=mode, scope=scope)`, deduplicated by
     `m.id`, skipping a match without both sides or with an empty side (as `RecordsView` does via
     `teamNames`). `decided = ag != bg`. `biggest_win`: max `abs(ag-bg)` over decided; `highest_scoring
     _match`: max `ag+bg`; `most_goals_one_side`: max `max(ag,bg)`; `biggest_upset`: Elo map from
     `compute_stats_ratings(s, mode=mode, scope=scope)` rows (`default 1000.0`), `gap = avg(loser)
     − avg(winner)`, record only when `max gap > 0`. Tied matches → all of them, sorted **most recent
     first** (`tournament.date desc, tournament.id desc, order_index desc, id desc`). Holders:
     `biggest_win`/`biggest_upset` → the winning sides' players; `most_goals_one_side` → the side(s)
     with the record tally; `highest_scoring_match` → both sides. `matches[]` rows are
     `{"tournament": {id, name, date, mode, status}, "match": stats_match_dict(m, t.date, stars)}`,
     with `stars = StarRatingResolver.load(s)` once; a friendly (scope `both`/`friendlies`) uses
     `friendly_group(fm)` + `friendly_stats_match_dict`. `finished_matches = len(matches)`.
   Every `holders[]` entry is `{"player": {"id", "display_name"}, "ongoing": bool}`; the display name
   comes from the `Player` rows loaded once. **No query of its own** beyond `select(Player)`.
4. **`schemas/responses.py`**, after the streaks block:
   ```python
   class RecordHolderOut(BaseModel):
       player: PlayerRef
       ongoing: bool = False
   class StatsRecordTournamentOut(BaseModel):
       id: int; name: str; date: date; mode: str; status: str
   class StatsRecordMatchOut(BaseModel):
       tournament: StatsRecordTournamentOut
       match: StatsMatchOut
   class RecordLeaderOut(BaseModel):
       player: PlayerRef; count: int; rank: int
       latest: StatsRecordTournamentOut | None = None
   class StatsRecordOut(BaseModel):
       key: str; group: str; label: str; explainer: str; path: str
       value: float | None = None
       holders: list[RecordHolderOut]
       leaders: list[RecordLeaderOut] = Field(default_factory=list)
       matches: list[StatsRecordMatchOut] = Field(default_factory=list)
   class StatsRecordsOut(BaseModel):
       generated_at: datetime; mode: str; scope: str
       finished_matches: int
       records: list[StatsRecordOut]
   ```
5. **`routers/stats.py`** — `@router.get("/records", response_model=StatsRecordsOut)` with the same
   `mode`/`scope` `Query` shapes `/streaks` has; body `return compute_stats_records(s, mode=mode,
   scope=scope)`. Public read like every `/stats/*`.
6. **`make gen-types`**, then `frontend/src/api/types.ts`: under Stats
   ```ts
   export type RecordKey =
     | "most_titles" | "highest_elo" | "highest_elo_1v1" | "highest_elo_2v2"
     | "most_points" | "highest_ppm" | "most_played" | "most_goals_per_match"
     | "win_streak" | "unbeaten_streak" | "scoring_streak" | "clean_sheet_streak"
     | "biggest_win" | "highest_scoring_match" | "most_goals_one_side" | "biggest_upset";
   export type RecordGroup = "title" | "elo" | "table" | "streak" | "match";
   export type StatsRecordHolder = S["RecordHolderOut"];
   export type StatsRecordLeader = S["RecordLeaderOut"];
   export type StatsRecordMatch = S["StatsRecordMatchOut"];
   export type StatsRecord = Omit<S["StatsRecordOut"], "key" | "group"> & { key: RecordKey; group: RecordGroup };
   export type StatsRecordsResponse = Omit<S["StatsRecordsOut"], "records"> & { records: StatsRecord[] };
   ```
   `api/stats.api.ts`: `getStatsRecords(opts?: { mode?: StatsMode-like; scope?: StatsScope })` in the
   exact shape of `getStatsRatings` (omit defaults from the query string). `api/queryKeys.ts`, inside
   `stats`: `records: (mode: string, scope: string) => ["stats", "records", mode, scope] as const`
   (two required args — the cache-policy walker calls factories with dummies and this shape lands
   under the `["stats"]` row without a new row).
7. **Tests — `backend/tests/test_stats_records.py` (new)**, in the shape of `test_stats_endpoints.py`:
   `test_records_are_sixteen_in_registry_order_with_no_holders_on_an_empty_db` (keys == `RECORD_KEYS`,
   every `holders == []`, `finished_matches == 0`); `test_record_paths_point_where_the_record_lives`
   (table/elo paths contain `sub=table&…&sort=<col>`, the two mode Elos carry `mode=1v1`/`mode=2v2`
   regardless of the requested mode, streak/title/match paths carry `record=<key>` and the right
   `sub`); `test_table_records_follow_the_ratings_rows` (a 1v1 round robin with three players fully
   played: `most_points` holder is the ratings row with the top `pts`; a two-way tie yields two
   holders); `test_a_player_who_never_played_holds_no_table_record` (three players, all draws → every
   player who played is at 1000 and ties `highest_elo`; a fourth player who never played is **not** a
   holder although the ratings row lists them at 1000); `test_streak_holders_are_the_top_ties_of_the_
   streaks_list` (compare against `/stats/streaks`' `records`, `ongoing` carried through);
   `test_titles_agree_with_stats_players` (`most_titles.leaders` counts equal the done tournaments'
   `winner_player_id` in `/stats/players`; a tie at the top gives two holders with `rank == 1`);
   `test_match_records_name_the_right_sides` (biggest win → winners only; highest-scoring → both
   sides; most goals by one side → that side; upset → winners, and none when the favourite won);
   `test_friendlies_scope_has_no_titles_and_negative_tournament_ids` (`scope=friendlies`: `most_titles`
   has no leaders, match rows have `tournament.id < 0` and `status == "friendly"`);
   `test_player_matches_output_is_unchanged_by_the_lift` (a fixed payload snapshot before/after is
   the same — write the assertion against the fields, not a literal blob).

**What must not change.** `compute_stats_player_matches`' wire output; every existing `/stats/*`
endpoint; `RecordsView.tsx` (M4 rewrites it — this task leaves the frontend consumers alone and only
adds the types and the fetcher).

**Definition of done.** `make test` ≥ 228 + the new tests, `make lint` clean, `make gen-types`
committed in the same commit; `cd frontend && npm run check` green with the new aliases unused (tsc
does not mind); on the isolated stack `curl -s :8091/stats/records | jq '.records | length'` → **16**,
`jq '.records[] | select(.key=="most_titles") | .holders'` matches the Records page's "Most tournament
wins" top rank on `:8111/stats?view=overview&sub=records`, and `jq '[.records[] | select(.group=="streak")
| .holders[0].player.display_name]'` matches the first row of each Streaks category.

**Gates.** `make test`, `make lint`, `make gen-types` (committed), `cd frontend && npm run check`.

**Canon.** `AGENTS.md` §2 backend modules gain `stats/records.py`; §6 gains `/stats/records`, the
`sort`/`dir`/`record` params and the rule "the backend emits a record's `path`". M7 writes them.

For M7, the canon lines this task actually earns:

- §2 backend modules: `stats/records.py` — *the* registry (`RECORD_DEFS`, sixteen keys with their
  English label, explainer, sort column and deep-link `path`) and `compute_stats_records`, which
  folds the answer out of `compute_stats_ratings`, `compute_stats_streaks`, `compute_stats_players`
  and `finished_matches_with_players` and **writes no ranking query of its own**. It is the only
  place that decides what a record means.
- §2: `stats/players.py::finished_matches_with_players` is public — it is *the* loader for "finished
  matches in this mode and source", and a second one is how a badge and a page come to disagree.
- §2: `stats/player_matches.py` exports `stats_match_dict`, `friendly_stats_match_dict`,
  `friendly_group` and `player_ref` at module level, so `/stats/records` renders a match row
  *identically* to `/stats/player-matches` — same `club_stars` as-of rule (R4), same friendly
  pseudo-ids (tournament `-(1_000_000+fid)`, match `2_000_000_000+fid`).
- §6 API map: `/stats/{…,records,…}` — public read, `mode` + `scope` like `/streaks`.
- §6 rule: **the backend emits a record's `path`.** `RECORD_DEFS` decides where a record lives in
  Stats (`table`/`elo` → `sub=table&sort=<col>`; `streak` → `sub=streaks&record=<key>`; `title`/
  `match` → `sub=records&record=<key>`), and the badge link and the push deep link both use it, the
  way `/ideas?idea=` is already emitted by the backend. The `sort`/`dir`/`record` params themselves
  are M3's.
- §6 cache table: `qk.stats.records(mode, scope)` lands under the existing `["stats"]` row (30 s) —
  no new row, and the badge reads the entry the Records page reads at its defaults.
- §5 / empty-column rule: a `table`/`elo` record is held only among rows with `played > 0`. Not the
  floor Roli declined — "has an entry at all", so a newcomer at the default Elo 1000 tops nothing.

**Deviations:**

- **Parity was proven against the payloads, not the pixels.** `RecordsView` computes its four
  superlatives and its title count from `/stats/player-matches` (one per player) + `/stats/players`
  + the `/stats/ratings` rows `useStandings` provides. I transcribed that computation line for line
  into a script that consumes *those same HTTP responses* from the isolated stack (`:8091`, a copy
  of the dev DB) and diffed it against `/stats/records`. **252 assertions, 0 mismatches**, across
  six mode/scope combinations (`overall|1v1|2v2 × tournaments`, `overall × both`,
  `overall × friendlies`, `2v2 × both`) and all sixteen records: value, the tied match ids, and the
  holder ids for the four match records; value + holders + `ongoing` for the four streaks against
  `/stats/streaks`' own `records` list; value + leaders (id, count, rank, latest tournament) for
  the titles; value + holders for the five table/Elo records against the top of the matching
  `TABLE_COLS` column. `finished_matches` matched the browser's match count exactly
  (94 / 54 / 40 / 117 / 23). **Records I could not verify this way: none** — every one of the
  sixteen has a check. What the dev data could *not* exercise is the `played > 0` rule (all six
  players have played) and a tie at the top of the titles list; both are covered by constructed
  tests instead (`test_a_player_who_never_played_holds_no_table_record`,
  `test_a_tie_at_the_top_gives_two_title_holders_at_rank_one`).
- **`compute_stats_player_matches`' wire output is unchanged, measured.** 21 payloads (7 players ×
  3 scopes) captured from the unmodified backend and re-fetched after the lift: **0 differing**.
- **The plan's "skip a match without both sides or with an empty side" is implemented as written,
  and `RecordsView` does not in fact skip it** — `teamNames` renders `["—"]` instead, so such a
  match would count today. It changes nothing here: the dev database has **no** finished match,
  tournament or friendly, with a missing or empty side, and the match counts matched exactly. The
  backend rule is the better one (a side with no players cannot hold a record).
- **Tied match rows are ordered most-recent-first** (`tournament.date desc, id desc, order_index
  desc, id desc`), as the plan says. The browser's order was the order its six `useQueries` results
  happened to arrive in. Membership is identical; only the display order of a tie differs.
- **One thing the plan did not foresee: a friendly record row needs one extra query.** The loader
  hands friendlies over as `scope.friendly_as_match_like` namespaces, which keep no reference to
  the `FriendlyMatch`, and SQLAlchemy's identity map is weak — so by rendering time the row is gone
  and `Session.get` re-reads it (measured: 12 statements for 6 friendly rows). Ranking now happens
  before rendering and `_friendlies_by_id` re-reads **only the matches that actually tie a record,
  in one query**. With `scope=tournaments` — every badge, and the Records page's default — the set
  is empty and no query is made at all. `scope.py` was not touched (it is outside M1's file set).
- `StarRatingResolver.load(s)` is loaded once, as the plan specifies; it is a rendering dependency,
  not a ranking one, so "no query of its own beyond `select(Player)`" holds for every number.
- Cost, on the Pi against the dev DB: **0.27 s** for the whole endpoint (`scope=both` 0.27 s,
  `friendlies` 0.15 s) against seven HTTP round trips today.
- `STREAK_KEYS` and `RECORD_DEF_BY_KEY` were added next to `RECORD_KEYS` — M2 needs a key→def
  lookup for its diff and M4 needs the streak key list; both are one line over the registry, not a
  second registry.
- `player_ref` was lifted alongside the three builders the plan names (they call it). Same output.
- Frontend: types, fetcher and query key only. `RecordsView.tsx` is untouched — M4 rewrites it.
  `npm run check` is green with the new aliases unused, as the plan predicted.

---

## M2 — Persisted holders, the one after-result function, the push  ☑

**The gap.** Nothing stores who held what (`grep -n 'class RecordHolder' backend/app/models.py` → 0).
Nothing is called when a result changes except the broadcasts and the four `push_match_*`/
`push_tournament_*` helpers (`routers/matches.py:214-269`). Two result-grade paths announce themselves
as mere `updated`: `generate_schedule` (`tournaments.py:631`) and `patch_date` (`:605`).

**Verify first.**
```bash
grep -n 'class RecordHolder\|class RecordKeyState' backend/app/models.py     # → 0
grep -rn 'after_result_change\|reconcile_record_holders' backend/app         # → 0
grep -c '"record_' backend/app/notification_texts.json                       # → 0
grep -n 'global_action="updated"' backend/app/routers/tournaments.py         # → :576 :605 :631 :757 :797 :1141
grep -n 'def swap_sides\|def patch_decider\|def second_leg' -A6 backend/app/routers/tournaments.py backend/app/routers/matches.py | grep -c 'request: Request'   # → 0 (none of the three takes the request yet)
```

**The change.**

1. **`models.py`**, after `FeatureRequestEventRead` (two tables, **no column on any existing table**,
   nothing in `_RUNTIME_COLUMNS`):
   ```python
   class RecordHolder(SQLModel, table=True):
       """Who held which record the last time anyone looked (M2). Records are computed live
       everywhere a reader sees them (`services/stats/records.py`); this table only remembers the
       previous answer so "Rumpi took it from you" has something to diff against. Written by
       `services/record_holders.py::reconcile_record_holders` and nothing else."""
       record_key: str = Field(primary_key=True)
       player_id: int = Field(foreign_key="player.id", primary_key=True)
       since: dt.datetime = Field(default_factory=dt.datetime.utcnow, index=True)

   class RecordKeyState(SQLModel, table=True):
       """One row per record key that has been reconciled at least once. A key with no row is
       *seeded silently*: the first boot on a database that predates the table, and a record kind
       added in a later deploy, must not announce every current holder as a new one. A key with a
       row and no `RecordHolder` rows means nobody holds it — a real answer, not a missing one."""
       record_key: str = Field(primary_key=True)
       computed_at: dt.datetime = Field(default_factory=dt.datetime.utcnow)
       holder_count: int = Field(default=0)
   ```
2. **`services/record_holders.py` (new)** — the only module that touches the two tables:
   ```python
   BADGE_MODE = "overall"
   BADGE_SCOPE = "tournaments"   # Roli: every badge, no exceptions — never friendlies

   @dataclass(frozen=True)
   class RecordMove:
       key: str; label: str; path: str
       gained: tuple[int, ...]; lost: tuple[int, ...]; holders: tuple[int, ...]

   def live_holders(s: Session) -> dict[str, tuple[frozenset[int], str, str]]:
       """key -> (holder ids, label, path) from compute_stats_records(BADGE_MODE, BADGE_SCOPE)."""

   def reconcile_record_holders(s: Session, *, now: dt.datetime | None = None) -> list[RecordMove]:
       """Compare the live holders with the stored ones, store the live ones, return what moved.
       A key without a `RecordKeyState` row is stored and *not* reported (seeding).
       **Commits** — the one documented exception to "routers own the transaction"
       (`_bulk_delete_matches(autocommit=True)` is the precedent): this runs *after* the result's
       own commit and must not be undone by an unrelated later failure."""

   def backfill_record_holders(engine) -> int:
       """`init_db()` hook: reconcile once at startup. Returns how many keys were seeded (0 on a
       database that already has every state row). Log line: `Record holders seeded: N`."""

   def after_result_change(request: Request | None, s: Session, *, tournament_id: int | None, reason: str) -> list[RecordMove]:
       """THE function every result-changing path calls: reconcile, then push (when there is a
       request and a dispatcher), then log one line per move. `request=None` is the CLI."""
   ```
   Diff rule: for each key, `stored = {rows}`; `gained = live − stored`, `lost = stored − live`;
   rows for `lost` are deleted, rows for `gained` inserted with `since=now`, the state row's
   `computed_at`/`holder_count` updated; a `RecordMove` only when `gained or lost`. Keys are the
   registry's — a key that disappears from `RECORD_DEFS` in some later deploy leaves orphan rows and
   nothing reads them (say so in the docstring).
3. **`db.py`** — in `init_db()`, after the club-star seed, the same lazy import idiom:
   `from .services.record_holders import backfill_record_holders` … `seeded = backfill_record_holders
   (_engine)`; `if seeded: log.info("Record holders seeded: %s", seeded)`. (`compute_stats_players`
   reads cup defs through `get_cup_def`, which calls `load_cup_defs()` lazily — the lifespan loads them
   first anyway, and `manage.py` gets them on demand.)
4. **`services/notifications.py`** — `"record_moved"` joins `PERSONAL_DEFAULT_EVENT_TYPES`; a helper
   beside `push_idea_status`:
   ```python
   def push_record_moves(request: Request, s: Session, moves: list[RecordMove]) -> int:
       """One notification per player per record moved — Roli's decision, arithmetic and all
       (six per record, four per person on a four-record night). Three texts: gained, lost,
       watching. The record name is the English stats label in every language; names are the
       players' current display names. Returns how many messages were queued."""
   ```
   For every `Player` row and every move: `variant = "record_gained" if pid in move.gained else
   "record_lost" if pid in move.lost else "record_watch"`; `message = localized_push_message(variant,
   path=move.path, tag=f"record-{move.key}", event_type="record_moved", data={"record_key": move.key,
   "gained": [...], "lost": [...]}, record=move.label, gainers=[names], losers=[names], holders=[names])`;
   `dispatcher.enqueue_personal_for_player(pid, message)` (the `hasattr` fallback the idea helpers
   carry). No dispatcher → 0.
5. **`services/notification_texts.py`** — two helpers, precedent `_authors_line`:
   `_join_names(names, language)` ("A", "A und B" / "A and B", "A, B und C" / "A, B and C") and
   `_record_lines(*, record, gainers, losers, holders, language) -> dict[str, str]` returning
   `gainers_line` ("" when nobody gained, else one sentence + `"\n"`), `losers_line` (same shape) and
   `holders_line` (always one sentence — singular, plural, or "nobody holds it right now"), with the
   plural agreement decided in Python, never in the template. `render_notification_text` gains
   `if "record" in prepared and any(k in prepared for k in ("gainers", "losers", "holders")):
   prepared.update(_record_lines(...))`. Do **not** rewrite `_authors_line` onto `_join_names` in this
   task (it would change shipped text); note it in Deviations as the next candidate.
6. **`notification_texts.json`** — three keys in all three languages, drafted here for Roli to
   correct (Decisions list item 6). Steirisch in his voice, German with its umlauts, English plain:
   ```json
   "record_gained": { "title": "Rekord! {record} is jetzt deins",
                      "body": "{losers_line}{holders_line}\nSchau in de Stats und gnieß es." },
   "record_lost":   { "title": "{record} is da weg",
                      "body": "{gainers_line}Bei {record} bist nimma vorn.\nSchau in de Stats und hol da'n zruck." },
   "record_watch":  { "title": "Bei {record} hot si wos gtan",
                      "body": "{gainers_line}{losers_line}{holders_line}\nSchau in de Stats, wer wo steht." }
   ```
   deutsch: `"Rekord! {record} gehoert jetzt dir"` / `"{losers_line}{holders_line}\nOeffne die Stats und
   geniess es."`; `"{record} ist weg"` / `"{gainers_line}Bei {record} bist du nicht mehr vorn.\nOeffne die
   Stats und hol ihn dir zurueck."`; `"{record} hat sich bewegt"` / `"{gainers_line}{losers_line}
   {holders_line}\nOeffne die Stats und sieh nach, wer wo steht."`.
   english: `"Record! {record} is yours"` / `"{losers_line}{holders_line}\nOpen Stats and enjoy the
   view."`; `"{record} is gone"` / `"{gainers_line}You no longer hold {record}.\nOpen Stats and plan the
   comeback."`; `"{record} changed hands"` / `"{gainers_line}{losers_line}{holders_line}\nOpen Stats to
   see who stands where."`.
   Lines (english; the other two languages follow `_authors_line`'s idiom): `gainers_line` =
   `"{names} took {record}.\n"`; `losers_line` = `"Taken from {names}.\n"`; `holders_line` = `"Holder now:
   {names}."` / `"Holders now: {names}."` / `"Nobody holds it right now."`.
7. **`services/events.py`** — the `result` docstring (`:54-69` and the module header) broadens by one
   clause: *"…or any change to finished results or their chronology that moves no status — a live
   tournament regenerated over finished matches, a played tournament's date moved."* No code.
8. **`routers/tournaments.py`**:
   - `MatchDeletion` gains `finished: int = 0` (last field; `EMPTY_DELETION = MatchDeletion(0, [], [], 0)`);
     `_bulk_delete_matches` counts `select(func.count(Match.id)).where(Match.id.in_(match_ids),
     Match.state == "finished")` before deleting and returns it.
   - `generate_schedule`: `global_action="result" if deletion.finished else "updated"`; then
     `if deletion.finished: after_result_change(request, s, tournament_id=tournament_id, reason="generate")`.
   - `reassign_2v2` and `second_leg` (disable branch): `if deletion.finished: after_result_change(...)`
     — both gain `request: Request`. (`second_leg` today has `dependencies=[Depends(require_editor)]`
     and `role: str = Depends(require_editor)`; adding `request: Request` is FastAPI's own injection.)
   - `delete_tournament`: after `_delete_tournament_graph`, `after_result_change(request, s,
     tournament_id=None, reason="delete")` (the tournament is gone; pass `None`).
   - `patch_decider`: gains `request: Request`; after the broadcast, `after_result_change(request, s,
     tournament_id=tournament_id, reason="decider")`.
   - `patch_date`: `has_results = s.exec(select(func.count(Match.id)).where(Match.tournament_id ==
     tournament_id, Match.state == "finished")).one() > 0`; `global_action="result" if has_results else
     "updated"`; `if has_results: after_result_change(request, s, tournament_id=tournament_id, reason="date")`.
   - `reorder`: **nothing** — and a one-line comment above the broadcast saying why (the prefix rule
     at `:669-675` means no finished match can move).
9. **`routers/matches.py`**: `patch_match` — after the existing pushes (so "tournament finished"
   precedes "you hold X now"): `if old_state == "finished" or m.state == "finished":
   after_result_change(request, s, tournament_id=int(m.tournament_id), reason="match")`. `swap_sides`
   gains `request: Request`; `if m.state == "finished": after_result_change(..., reason="swap")`.
10. **`manage.py`** — `add-match`: after `insert_match`, `moves = after_result_change(None, s,
    tournament_id=int(res.tournament_id), reason="cli")`; `log.info("Record moved: %s gained=%s lost=%s",
    m.key, m.gained, m.lost)` per move. (No request → nothing is pushed; the holders are still right.)
11. **Tests.** `backend/tests/test_record_holders.py` (new), the `_Recorder` from `test_ideas.py:333`
    (records `enqueue_personal_for_player`), players via `create_player`, results via `PATCH /matches`:
    - `test_init_db_seeds_every_key_silently`: after the fixture, `RecordKeyState` has 16 rows and
      `RecordHolder` 0; install the recorder, `reconcile_record_holders` again → `[]`, nothing queued.
    - `test_seeding_a_populated_db_announces_nothing`: play a tournament to done, then delete every
      `RecordKeyState`/`RecordHolder` row, install the recorder, reconcile → rows rebuilt, `[]`
      returned, nothing queued. (This is the first-deploy case.)
    - `test_the_first_result_notifies_every_player_with_the_right_text`: three new players + the
      three account players = six `Player` rows; finish one 1v1 match 2:0 → for every move exactly six
      messages, one per player id; the winner's message for `most_points` is `record_gained`, the
      loser's `record_watch` (the loser is not a *former* holder), everyone else `record_watch`;
      `most_played` is `record_gained` for **both** players; every message has
      `event_type == "record_moved"`, `tag == f"record-{key}"`, `path == the record's path in
      /stats/records`, and `text_context["record"]` is the English label; every language renders.
    - `test_a_goal_in_a_playing_match_reconciles_nothing`: monkeypatch `after_result_change` with a
      spy; PATCH goals on a `playing` match → not called; PATCH `state: "finished"` → called once.
    - `test_a_correction_moves_the_record_and_the_loser_hears_lost`: finish a tournament so A tops
      `pts`; correct one finished score so B tops → the `most_points` move has `gained == (B,)`,
      `lost == (A,)`; A's message is `record_lost` with `text_context["gainers"] == ["B"]`, B's is
      `record_gained` with `losers == ["A"]`, the others `record_watch`.
    - `test_swapping_sides_on_a_finished_match_reconciles` (spy called), `_mid_tournament_does_not`
      (playing → not called).
    - `test_deleting_a_tournament_takes_the_records_with_it`: after delete, `RecordHolder` is empty for
      the keys that tournament held, and `record_lost` reached each former holder.
    - `test_a_decider_moves_most_titles`: tie at the top, `PATCH /decider` → `most_titles` gained by
      the decider's winner.
    - `test_the_cli_path_persists_without_a_dispatcher`: `insert_match` + `after_result_change(None,
      s, …)` → moves returned, rows written, no error.
    - `test_rollback_boot` is **not** a test — it is the DoD drill below.
    `tests/test_push_notifications.py::test_notification_text_catalog_is_complete_and_renderable`:
    add `"record": "Win streak", "gainers": ["Rumpi"], "losers": ["Roli"], "holders": ["Rumpi"]` to the
    context dict. `tests/test_realtime_events.py`: `test_regenerating_a_live_tournament_over_results_
    is_result_grade` (one finished match, `POST /generate` → `action == "result"`),
    `test_moving_a_played_tournaments_date_is_result_grade` (done → `PATCH /date` → `result`; a draft
    → `updated`).

**What must not change.** `global_action_for_match_change` (the PATCH/swap rule stays exactly Q9's);
every existing push helper and text; `_bulk_delete_matches`' comment cleanup; `reorder`.
`compute_stats_records` itself (M1's).

**Definition of done.** Tests above green, `make test` ≥ M1's count + 12, `make lint` clean; **no
response model changed**, so `make gen-types` yields no diff (run it and say so). On the isolated
stack: first boot logs `Record holders seeded: 16`; as Roli correct a finished score in a done
tournament from `:8112/live/<id>/match/<mid>` → the backend log shows `Record moved: …` lines and the
recorder-less dispatcher is disabled (no `cryptography`) so nothing else is observable — the tests are
the proof of the queue. **Rollback drill (§5 rule 3, measured not asserted):** `git archive f8a02b7 |
tar -x -C "$(mktemp -d)"`, run that backend against `verify-m2.db` *after* the new code has written
both tables → boots, `GET /stats/players` **200**, a match PATCH **200**; then the new code against the
same DB reconciles and announces the moves that happened while rolled back — write both observations
into Deviations.

**Gates.** `make test`, `make lint`, `make gen-types` (no diff, stated).

**Canon.** `AGENTS.md` §5 (+2 tables, the seeding rule, the rollback consequence), §6 (the
`record_moved` push, Roli's arithmetic as his decision, `result` for generate/date, the table of
paths), §10 (a live goal is not a result; `RecordKeyState` row = "computed at least once"). M7 writes.

For M7, the canon lines this task actually earns:

- §5 tables: `RecordHolder` (`record_key`, `player_id`, `since`) and `RecordKeyState`
  (`record_key`, `computed_at`, `holder_count`) — additive, nothing in `_RUNTIME_COLUMNS`, written
  **only** by `services/record_holders.py::reconcile_record_holders` and read by nothing else.
- §5 seeding rule: a key with **no** `RecordKeyState` row has never been computed, so it is stored
  **silently** — the first boot on production, and every record kind a later deploy adds. A key
  *with* a row and no holder rows means nobody holds it, which is a real answer. `init_db()` logs
  `Record holders seeded: N` the way it logs the club-star seed.
- §5 rollback consequence: old code boots against the two tables and ignores them, so results
  entered while rolled back are simply not reconciled; the next boot of the new code **absorbs**
  that drift and logs `Record holders reconciled at startup: N moved (…) — absorbed, not
  announced`. A boot never pushes: the dispatcher does not exist yet at `init_db()` time, and a
  deploy must not buzz everybody with a backlog.
- §6: `after_result_change(request, s, *, tournament_id, reason)` in
  `services/record_holders.py` is **the** function every result-changing path calls — `PATCH
  /matches/{id}` (guard: `old_state == "finished" or m.state == "finished"`), `/swap-sides`
  (`m.state == "finished"`), `/generate`, `/reassign`, `/second-leg` (disable) via
  `deletion.finished`, `DELETE /tournaments/{id}`, `PATCH /decider`, `PATCH /date` (when the
  tournament has a finished match), and `manage.py add-match` with `request=None`. `reorder`,
  friendlies, tournament creation and a rename are deliberately **not** in the list. It commits —
  the documented exception to "routers own the transaction", precedent
  `_bulk_delete_matches(autocommit=True)`.
- §6 push: `record_moved` joins `PERSONAL_DEFAULT_EVENT_TYPES`, so it reaches the default
  "Results & personal" mode. **One notification per player per record moved** — Roli was shown the
  arithmetic (six per record, four per person on a four-record night) and kept it; the only
  batching is the OS tag `record-{key}`. Three texts chosen by the *recipient's* relationship to
  the move, never by the actor: `record_gained` · `record_lost` · `record_watch`. The deep link is
  the record's own `path`, emitted by `RECORD_DEFS` (M1).
- §6 realtime: `generate` over finished matches and `date` on a played tournament now send
  `action="result"`, closing the last two holes a tournament result could slip through.
- §9 / §10 copy: **German and Styrian push texts carry their umlauts** — `services/webpush.py:173`
  has always serialised `ensure_ascii=False` over UTF-8, so the transliteration was imitation, not
  a constraint. Delete any note that calls German "ASCII-safe". A record's name is translated too
  (`notification_texts.py::_RECORD_LABELS`, keyed by `RECORD_KEYS`), so a push says "meiste Punkte
  is weg" while the English UI says "Most points".
- §10: a goal in a *playing* match is not a result — only finishing, un-finishing and correcting a
  finished score are.

**Deviations:**

- **One result path the plan did not enumerate, and I did not take it** (outside M2's file set,
  Rule 3): `POST /tournaments/{id}/comments` with `event_type: "goal"` or `"score_update"` writes
  match goals (`routers/comments.py:474` and `:487`, via `_set_match_score`). Nothing there checks
  the match's state, so a goal comment filed on a **finished** match changes a real result — and it
  broadcasts `reason="comment-score"` with **no** `global_action`, so it is a `Q9`-shaped hole on
  the websocket side too. The composer reaches it: `TournamentCommentsCard.tsx:389` posts
  `event_type: "goal"` against `composerScope`, which is any match in the tournament, not only the
  playing one (`score_update` has no UI caller at all today). The fix is one guard in the same
  shape as the others, after the commit: `if match_for_event is not None and match_score_changed
  and match_for_event.state == "finished": after_result_change(request, s,
  tournament_id=tournament_id, reason="comment-score")` — `create_comment` already takes `request`.
  **Every path the plan *did* list is implemented and tested**; this is the seventeenth, found by
  re-deriving the list from `grep` over everything that writes `MatchSide.goals`, `Match.state`,
  `Tournament.date`, `decider_*` or deletes match rows. Flagged for Roli / M7.
  Everything else re-derived matched the plan exactly: `PATCH /players/{id}` is a rename (holders
  are ids), there is no `DELETE /players/{id}`, `POST /tournaments` and `PATCH /tournaments/{id}`
  never touch a result, `reorder` cannot move a finished match, and friendlies are outside
  `BADGE_SCOPE`. Each of those has a test asserting the call does **not** happen.
- **A boot absorbs drift and logs it; it does not announce it.** The plan predicted "the first
  reconcile after re-deploy announces those moves late". It cannot and should not: `init_db()` runs
  *before* `main.py`'s lifespan starts the dispatcher, so there is nothing to push into, and the
  only way a boot finds movement is code that does not reconcile (a rollback, or `manage.py` on a
  stopped server) — announcing that backlog would make every deploy buzz everybody. So
  `backfill_record_holders` logs `Record holders reconciled at startup: N moved (…) — absorbed, not
  announced`. Measured in the rollback drill below.
- **The record labels' German and Styrian live in `notification_texts.py` (`_RECORD_LABELS`), not
  beside the English labels in `stats/records.py`.** `stats/records.py` is M1's file and outside
  M2's set (Rule 3), and the module that owns every *translated word* in a push already exists —
  `_STATUS_LABELS` and `_mode_label` are the same shape, so this is the existing mechanism rather
  than a new one (Rule 8). The instruction's actual purpose — "a record renamed in one language is
  obviously missing in the others rather than silently stale" — is enforced mechanically instead of
  by adjacency: `test_every_record_has_a_name_in_every_language` fails the moment `RECORD_KEYS` and
  `_RECORD_LABELS` disagree, in either direction.
- **The umlaut sweep, measured.** 27 message strings repaired across the catalogue (26 `deutsch`,
  2 `steirisch` — two strings had two faults), covering 14 distinct words: `Oeffne`×11, `fuer`×9,
  `geaendert`×3, `Anpoebeln`×2, `laeuft`×2 (+1 steirisch), `Spass`×2 (steirisch), and one each of
  `Anpoebeleien`, `Uebersicht`, `geloescht`, `naechste`, `verfuegbar`, `heiss`, plus
  `Guestbook-Eintrag` → `Gästebuch-Eintrag`. Three more in `notification_texts.py`: `gefaellt` and
  `angepoebelt`×2. A guard test (`test_the_catalog_is_not_transliterated`) keeps them out. The JSON
  was rewritten by a serialiser, which also normalised ~33 lines of pre-existing four-level
  indentation in the `steirisch` and `deutsch` blocks; `git diff -w` is exactly the 27 changed
  strings plus the 9 new messages, and a parsed before/after comparison confirms **no other string
  changed**. `FEATURES_2026-09-ideas.md:186/769/1348` and `AGENTS.md:1014` still call German
  "ASCII-safe" — the historical tracker and the canon are not mine to edit (M7 owns `AGENTS.md`).
- **`{record}` reads better with an article in German and Styrian, so the *lines* do not repeat
  it.** The labels are article-less noun phrases ("meiste Punkte"), and "Rumpi hat sich meiste
  Punkte geholt" is wrong German. `gainers_line` says "…hat sich **den Rekord** geholt" /
  "…hot si'n **Rekord** gschnappt"; the record is named in the title of all three templates, so
  nothing is lost. English keeps "{names} took {record}." — an English label is title-shaped and
  takes no article.
- **`_authors_line` was left alone**, as the task says. It is the next candidate for `_join_names`
  (it carries its own 1/2/3/4+ ladder), but folding it in would change shipped poke text.
- `MatchDeletion.finished` is a defaulted last field, so `EMPTY_DELETION` and every existing
  construction keep working. Two of the three guards (`reassign`, `second-leg` disable) are
  provably always 0 — both refuse before they delete — and the test asserts that they stay 0
  rather than trusting the comment.
- `record_holders.py` imports `notifications.push_record_moves` **inside** `after_result_change`;
  `notifications.py` imports `RecordMove` under `TYPE_CHECKING`. Either direction alone is a cycle.
- **Cost, measured on the Pi against a copy of the real dev DB** (94 finished tournament matches,
  6 players): a result-changing `PATCH /matches/{id}` takes **0.25 s** end to end, of which
  `compute_stats_records` is the bulk (M1 measured it at 0.27 s for the whole endpoint). Boot seeds
  16 keys in **0.38 s**. A goal in a *playing* match pays nothing — the guard runs first.

**What was exercised, and what could not be.** Push delivery cannot be exercised on this machine
(no VAPID, no `cryptography`), so every push assertion stops at the queued `PushMessage`, the
`_Recorder` from `tests/test_ideas.py:333`. What *is* proven: 28 new tests in
`tests/test_record_holders.py` + 4 in `tests/test_realtime_events.py`; each result path calls
`after_result_change` exactly once and each non-result path not at all (a spy on both routers);
a move produces the three audiences, one message per player per record, with the right `text_key`,
`tag`, `path` and `text_context`, rendering in all three languages with no `{placeholder}` left
over; the variant follows the recipient, so the editor who types in their own win is told they
**gained** it; a first seed and a seed over a fully played database both return `[]` and queue
nothing; deleting a tournament tells every former holder `record_lost`.

**On real data** (`backend/data/verify-m2.db`, a copy; backend on 8092, nothing else bound):
first boot logged `Record holders seeded: 16` with 16 state rows and 24 holder rows written and
**no** notification; correcting one finished score in the done tournament 19 moved three records
(`highest_elo`, `highest_elo_1v1`, `highest_scoring_match`) and queued **18** messages — Roli's
arithmetic, 3 × 6, exactly as decided.

**Rollback drill (§5 rule 3), both observations.** `git archive f8a02b7` into a temp dir, run
against the DB the new code had already written: it **boots clean** (`DB initialized`, no
complaint about the two unknown tables), `GET /stats/players` **200**, `GET /stats/ratings` **200**,
`GET /tournaments` **200**, `PATCH /matches/{id}` **200**, `GET /stats/records` **404** (that
endpoint does not exist yet in `f8a02b7`), and the 21 `recordholder` rows were left **untouched** —
old code never reads or writes them. Returning to the new code on the same DB, the boot found the
drift and said so: `Record holders reconciled at startup: 2 moved (highest_elo,
highest_scoring_match) — absorbed, not announced`.

**The Styrian lines, for Roli's one pass.** *Mine* = written by this task, *plan* = drafted in this
file before implementation (with Roli's two corrections already applied), *pre-existing* = shipped
text I only respelled.

| # | string | whose |
|---|---|---|
| 1 | `Rekord! {record} is jetzt deins` (title) | plan |
| 2 | `{losers_line}{holders_line}\nSchau in de Stats und genieß es.` | plan (Roli: "genieß", not "gnieß") |
| 3 | `{record} is weg` (title) | plan (Roli: not "is da weg") |
| 4 | `{gainers_line}Bei {record} bist nimma vorn.\nSchau in de Stats und hol da'n zruck.` | plan |
| 5 | `Bei {record} hot si wos gtan` (title) | plan |
| 6 | `{gainers_line}{losers_line}{holders_line}\nSchau in de Stats, wer wo steht.` | plan |
| 7 | `{name} hot si'n Rekord gschnappt.` (one gainer) | **mine** |
| 8 | `{names} ham si'n Rekord gschnappt.` (several) | **mine** |
| 9 | `{name} is nimma vorn.` (one loser) | **mine** |
| 10 | `{names} san nimma vorn.` (several) | **mine** |
| 11 | `Grod hot'n kana.` (nobody holds it) | **mine** |
| 12 | `Jetzt vorn: {name}.` | **mine** |
| 13 | `Jetzt gleichauf vorn: {names}.` (a tie) | **mine** |
| 14 | `{a}, {b} und no {n} weitere` (4+ names) | **mine** (mirrors `_authors_line`) |
| 15 | the sixteen record names: `meiste Turniersiege` · `höchstes Elo` (+ `(1v1)`, `(2v2)`) · `meiste Punkt` · `meiste Punkt pro Match` · `meiste Matches` · `meiste Tor pro Match` · `längste Siegsserie` · `längste Serie ohne Niederlog` · `längste Torserie` · `längste Serie ohne Gegentor` · `höchster Sieg` · `torreichstes Match` · `meiste Tor vo ana Seitn` · `gräßte Überraschung (nach Elo)` | **mine** |
| 16 | `Des Match läuft grad` / `da ganze Spaß` (friendly_started), `Da Spaß is vorbei` (friendly_finished), `ham weiter angepöbelt` (`_authors_line`) | pre-existing — **spelling only**, no wording changed |

Two Styrian points worth his eye specifically: **`gräßte`** (#15, for "größte" — "greßte" is the
other spelling), and whether **`Grod hot'n kana.`** (#11) is the way he would say "nobody holds it
right now". The German is mine too where it is new: the sixteen labels, `hat sich den Rekord
geholt` / `ist nicht mehr vorn` / `Aktuell vorn:` / `Aktuell gleichauf vorn:` /
`Aktuell ist niemand vorn.`, and `genieß es` / `hol ihn dir zurück` from the plan.

**Gates.** `make test` **272 passed** (240 before M2, +32), `make lint` clean, `make gen-types`
**no diff** — no response model moved, the two tables are internal. `npm run check` not run: no
frontend file was touched.

---

## M3 — The stats URL learns `?sort=`, `?dir=` and `?record=`; the one icon map  ☑

**The gap.** `StatsTable.tsx:42-43` keeps `sortKey`/`dir` in component state; a deep link cannot name
a column. `statsNav.ts` knows `cup` as its only one-shot section param. The streak icons live in three
copies (`StreakPatches.tsx:11-22`, `StreaksView.tsx:22-27`, `PlayerStreakChips.tsx:10-15`) and the
Records icons inline in `RecordsView.tsx:276-299` — which is how `Goal` and `Flame` came to mean two
things each.

**Verify first.**
```bash
grep -n 'useState<string>("pts")' frontend/src/pages/stats/StatsTable.tsx     # → :42
grep -n 'sort\|SORT\|RECORD_PARAM' frontend/src/pages/stats/statsNav.ts        # → 0
grep -n 'ONE_SHOT_PARAMS' frontend/src/ui/shell/lastLocation.ts                # → :8, no "record"
grep -rln 'case "win_streak"\|key: "win_streak"\|=== "unbeaten_streak"' frontend/src --include='*.tsx' | wc -l   # → 3
```

**The change.**

1. **`statsNav.ts`**, beside `CUP_PARAM`:
   ```ts
   /** `?sort=<TABLE_COLS key>` — the column the Table is sorted by; absent = `pts`. Written with
    * `replace` like every stats param. A record badge (backend-emitted `path`) lands here. */
   export const SORT_PARAM = "sort";
   /** `?dir=asc` — ascending; absent = descending (the default is deleted from the URL, `useTabParam`'s idiom). */
   export const DIR_PARAM = "dir";
   export type SortDir = "asc" | "desc";
   export function parseSortDir(raw: string | null): SortDir { return raw === "asc" ? "asc" : "desc"; }
   /** One-shot anchor of a Streaks or Records section (`?record=<key>`), the shape of `?cup=`. */
   export const RECORD_PARAM = "record";
   export function recordSectionId(key: string): string { return `record-${key}`; }
   ```
   **No href builder** for a record: the backend emits `path` per record and the frontend renders it;
   a second builder here would be the drift `AGENTS.md` §6 warns about (doc comment says so).
2. **`StatsInsights.tsx`** — read `sort`/`dir` once: `const sortRaw = searchParams.get(SORT_PARAM);
   const sortKey = TABLE_COLS.some((c) => c.key === sortRaw) ? sortRaw! : "pts"; const sortDir =
   parseSortDir(searchParams.get(DIR_PARAM));` (import `TABLE_COLS` from `./standings`, which the file
   already imports from). `onSortChange = (key, dir) => { const next = new URLSearchParams(searchParams);
   key === "pts" ? next.delete(SORT_PARAM) : next.set(SORT_PARAM, key); dir === "desc" ?
   next.delete(DIR_PARAM) : next.set(DIR_PARAM, dir); setSearchParams(next, { replace: true }); }`.
   Pass `sortKey={sortKey} sortDir={sortDir} onSortChange={onSortChange}` to the Overview/Table
   `StatsTable` only.
3. **`StatsTable.tsx`** — controlled sort with an uncontrolled fallback, the `fixedColumns` idiom:
   props `sortKey?: string; sortDir?: SortDir; onSortChange?: (key: string, dir: SortDir) => void`;
   `const [localSort, setLocalSort] = useState<{ key: string; dir: SortDir }>({ key: "pts", dir: "desc" })`;
   `const sortKey = props.sortKey ?? localSort.key; const dir = (props.sortDir ?? localSort.dir) === "asc" ? 1 : -1;`
   `setSort(k)` computes the next pair (same toggle rule as today) and calls `onSortChange` when
   given, else `setLocalSort`. New effect: `useEffect(() => { if (!controlled && !effVisible.has(sortKey))
   setVisible((prev) => new Set([...prev, sortKey])); }, [sortKey])` — a deep link to `gpm` makes G/M
   visible (the `fixedColumns` preview is untouched: `controlled` short-circuits, `sortCol` falls back
   to `pts` as today). The dashboard preview passes no sort props and behaves exactly as before.
4. **`lastLocation.ts`** — `ONE_SHOT_PARAMS = ["unread", "comment", "entry", "cup", "idea", "record"]`.
   `sort`/`dir` are **not** one-shot: they are filter state like `mode`, remembered per destination.
5. **`pages/stats/recordIcons.ts` (new)** — the one map:
   ```ts
   import { Award, Coins, Crosshair, Dumbbell, Flame, Gauge, Goal, Lock, PartyPopper, Rocket, Shield, TrendingUp, Trophy, Zap, type LucideIcon } from "lucide-react";
   import type { RecordKey } from "../../api/types";
   /** Every record's glyph — the streak sites, the Records page and the profile badges read this
    * and nothing else (M3). Approved by Roli 2026-09-XX (the table at the top of FEATURES_2026-09-badges.md). */
   export const RECORD_ICONS: Record<RecordKey, LucideIcon> = { most_titles: Trophy, highest_elo: Award, highest_elo_1v1: Award, highest_elo_2v2: Award, most_points: Coins, highest_ppm: Gauge, most_played: Dumbbell, most_goals_per_match: Crosshair, win_streak: Flame, unbeaten_streak: Shield, scoring_streak: Goal, clean_sheet_streak: Lock, biggest_win: Zap, highest_scoring_match: PartyPopper, most_goals_one_side: Rocket, biggest_upset: TrendingUp };
   /** A key the frontend does not know (a newer backend) still gets a glyph. */
   export function recordIcon(key: string): LucideIcon { return (RECORD_ICONS as Record<string, LucideIcon>)[key] ?? Award; }
   /** The mode a chip prints beside the Elo glyph; "" for every other record — a mode, not a count. */
   export function recordModeLabel(key: string): "" | "1v1" | "2v2" { return key === "highest_elo_1v1" ? "1v1" : key === "highest_elo_2v2" ? "2v2" : ""; }
   ```
6. **Tests.** `statsNav.test.ts`: `parseSortDir` (asc/other/null), `recordSectionId`, and
   `canonicalStatsParams` keeps `sort`, `dir` and `record` (it copies unknown params — pin it).
   `recordIcons.test.ts` (new): every `RecordKey` has an icon; the sixteen are distinct except the
   three Elo keys sharing one; the four streak keys map to `Flame`/`Shield`/`Goal`/`Lock` (the glyphs
   the app already uses — pin them so a later "cleanup" cannot swap them). `lastLocation.test.ts`:
   `normalizePath("/stats", "?view=overview&sub=streaks&record=win_streak")` drops `record` and keeps
   the rest; `?sort=ppm` is kept.

**What must not change.** Which columns are visible by default (`DEFAULT_COLS`); the Last-N logic;
the dashboard preview (`StandingsPreviewCard.tsx:35-43`) renders and sorts exactly as before; the
three streak sites and `RecordsView` (M4 repoints them — this task only builds the map).

**Definition of done.** `npm run check` green (717 + new). Browser at 390 and 1280 × blue/light on
the M3 stack: `/stats?view=overview&sub=table&sort=ppm` opens sorted by PPM with the accent arrow on
PPM; `…&sort=gpm` makes G/M visible and sorted; tapping PPM again writes `dir=asc` to the URL and
tapping Pts removes `sort`; `/stats?view=overview&sub=table&sort=nope` falls back to Pts with a clean
render; the dashboard preview is unchanged (pixel-compare the Standings card before/after).

**Gates.** `cd frontend && npm run check`. Browser as above.

**Canon.** `AGENTS.md` §10 "Stats URL scheme" gains `&sort=<col>`, `&dir=asc` and `&record=<key>`
(one-shot); §9 gains "a record's icon comes from `pages/stats/recordIcons.ts`". M7 writes.

**Deviations:**

- Implemented exactly as specified: `SORT_PARAM`/`DIR_PARAM`/`parseSortDir`/`RECORD_PARAM`/
  `recordSectionId` in `statsNav.ts`; `StatsInsights` reads `sort`/`dir` once and passes
  `sortKey`/`sortDir`/`onSortChange` only to the Overview/Table `StatsTable`; `StatsTable` takes
  the three as optional props, falls back to its own `localSort` state when they are absent (the
  dashboard preview), and gained the one new effect that makes a deep-linked sort column visible
  (gated on `controlled`, i.e. `fixedColumns != null`, so the preview is untouched); `record` was
  added to `lastLocation.ts`'s `ONE_SHOT_PARAMS`; `recordIcons.ts` is the one map, sixteen keys,
  used nowhere yet (M4 repoints the four consumers).
- **`?record=` does not yet scroll-and-drop on its own page** — that wiring is
  `pages/stats/useOneShotSectionParam.ts` and its adoption in `StreaksView`/`RecordsView`
  (M4's file set, not M3's). What M3 delivers and what I verified: the constant/helper exist, and
  `record` is registered as one-shot in `lastLocation.ts` — so a page carrying `?record=win_streak`
  is never *remembered* with it (confirmed live: `localStorage["lk:dest-last"]` for `stats` after
  visiting `/stats?view=overview&sub=streaks&record=win_streak&sort=ppm` holds
  `.../streaks?sort=ppm` with `record` gone and `sort` kept — filter state survives, the one-shot
  anchor does not). The parent task's "Prove it" line ("`?record=` scrolls to the record and then
  disappears from the URL") describes the *end-to-end* behaviour M4 completes; I did not add
  scrolling or in-page dropping here because `StreaksView.tsx`/`RecordsView.tsx` are outside M3's
  file set and the plan's own M3 "Definition of done" does not ask for it (only the URL/table
  behaviour and the dashboard-preview parity do). Flagging this now so M4 isn't surprised — verify
  the same URL again after M4 lands and confirm the param disappears from the *address bar itself*.
- Verified in a real headless Chromium (npx-cached `playwright`, not a project devDependency) on
  the isolated stack at 390×844 and 1280×900, `blue` and `light`, all four green:
  `?sort=ppm` → PPM header accent + `▾` (desc default); `?sort=gpm` → G/M becomes visible and
  sorted (accent), while its `GF-GA-GD /m` column-chip group correctly stays un-highlighted since
  only the sorted column, not the whole triplet, was auto-added; `?sort=nope` → falls back to Pts,
  clean render, 0 page errors; tapping PPM again → `dir=asc` in the URL; tapping Pts → both `sort`
  and `dir` removed from the URL. Dashboard preview: columns stay exactly `Pts/PPM/P/Win %/Elo`
  (`DEFAULT_COLS`), default sort stays Pts-desc, tapping a header sorts locally without ever
  touching `/dashboard`'s URL — screenshotted, matches the pre-existing layout. No console errors;
  the only warnings seen are the pre-existing React Router v7 future-flag notices and one
  navigation-timing WebSocket-closed warning, neither related to this change.
- Ports: the plan's M3 row (backend 8093 / vite 8113) collided with an unrelated long-running
  process already bound to 127.0.0.1:8093 on this machine (not part of this repo or this batch,
  PID 736, up since before this session). Used 8193/8213 instead, otherwise followed the isolated-
  stack recipe verbatim (copy of `backend/app.db` → `backend/data/verify-m3.db`, throwaway
  secrets outside the repo, three accounts). Stopped only the two PIDs this session started; the
  DB copy and secrets file were removed afterward.

---

## M4 — Records and Streaks read the one computation; the anchors; the shared icons  ☐

**The gap.** `RecordsView.tsx` computes its records in the browser (`:166-266`) from six requests;
after M1 the backend has the same answer and the page must read it, or the badge and the page are two
implementations. The Streaks and Records sections have no anchor ids, so `?record=` lands nowhere.
Four files carry their own streak/record icon maps.

**Verify first.**
```bash
grep -c 'getStatsPlayerMatches' frontend/src/pages/stats/RecordsView.tsx      # → 2
grep -n 'getStatsRecords' frontend/src/pages/stats/RecordsView.tsx            # → 0
grep -n 'recordSectionId\|RECORD_PARAM' frontend/src/pages/stats/StreaksView.tsx frontend/src/pages/stats/RecordsView.tsx   # → 0
grep -n 'from "lucide-react"' frontend/src/ui/StreakPatches.tsx frontend/src/pages/stats/PlayerStreakChips.tsx frontend/src/pages/stats/StreaksView.tsx   # → 3 imports of the four glyphs
grep -n 'CUP_PARAM' frontend/src/pages/stats/CupsView.tsx                      # → the inline effect at :29-43
```

**The change.**

1. **`pages/stats/useOneShotSectionParam.ts` (new)** — the `CupsView` effect, generalised, so two
   sub-views do not each carry a copy:
   ```ts
   /** Consume a one-shot `?<param>=<key>` once the page is ready: scroll to `sectionIdFor(key)`,
    * drop the param with `replace` (Back returns to a clean URL; N2 owns the offset from then on).
    * An unknown key only cleans the URL. The `?cup=` effect from `CupsView`, shared (M4). */
   export function useOneShotSectionParam(param: string, sectionIdFor: (key: string) => string, knownKeys: readonly string[], ready: boolean): void
   ```
   Body = `CupsView.tsx:29-43` verbatim with the names generalised (`jumpedRef`, `scrollToSectionById
   (id, 40, 0, "auto")`). **`CupsView.tsx` adopts it** (`useOneShotSectionParam(CUP_PARAM, cupSectionId,
   cups.map((c) => c.key), ready)`) and loses its inline effect — one mechanism.
2. **`RecordsView.tsx`** — rewritten onto the endpoint. Props: `{ mode, scope, onSelect, onOpenStreaks }`
   (**`rows` is gone** — Elo now comes from the backend); `StatsInsights.tsx:233` drops `rows={rows}`.
   One query: `useQuery({ queryKey: qk.stats.records(mode, scope), queryFn: () => getStatsRecords({ mode,
   scope }), placeholderData: keepPreviousData })` (a filter, not a subject; no `staleTime` — the
   policy table's `["stats"]` row applies). `clubsQ` as today. `byKey = new Map(records.map(r => [r.key, r]))`.
   - `TitlesGroup` from `byKey.get("most_titles")`: `leaders` → the existing `WinLeader` rows
     (`latest` is `StatsRecordTournament | null` — `fmtShortDate(l.latest.date)` as today); the
     `TieCount` is `holders.length`; icon `recordIcon("most_titles")`.
   - `RecordGroup` ×4 from the four `match` records, **label, explainer and icon from the payload and
     the map** (`r.label`, `r.explainer`, `recordIcon(r.key)`) — the strings leave this file for the
     backend registry, which is what makes the push name the record the way the page does. Rows:
     `RecMatch` built from `row.match` (`teamNames`, goals, club ids — the existing helpers, `m` now
     being `row.match`) and `href = tournamentMatchHref(row.tournament, row.match)`; `TieCount n =
     r.matches.length`. Each group wrapped in `<div id={recordSectionId(r.key)}>`.
   - Footer: `Across {fmtCount(data.finished_matches, "finished match", "finished matches")}.`
     (§5b — the current literal "Across N finished matches." becomes `fmtCount`).
   - `useOneShotSectionParam(RECORD_PARAM, recordSectionId, records.map(r => r.key), !!q.data)`.
   - Loading `q.isLoading && !q.data` → `InlineLoading`; `finished_matches === 0` → the existing
     `EmptyState "No finished matches yet."`. The rest of the markup (`ScoreLine sm`, `ClubMark`
     marks, the "Longest runs in Streaks" ghost button) is unchanged.
3. **`MatchHistoryList.tsx:19`** — `tournamentMatchHref(t: { id: number; status: string }, m: { id: number })`:
   a structural widening so the Records rows (`StatsRecordTournament`) and the existing callers
   (`StatsPlayerMatchesTournament`) both fit without a cast. Body unchanged.
4. **`StreaksView.tsx`** — `StreakCatIcon` is deleted; `icon={<Icon size={12} aria-hidden="true" />}`
   with `const Icon = recordIcon(c.key)`; each `StatsSection` wrapped in `<div key id={recordSectionId
   (c.key)}>`; `useOneShotSectionParam(RECORD_PARAM, recordSectionId, cats.map(c => c.key), !!q.data)`.
5. **`ui/StreakPatches.tsx`** — `iconFor` keeps its labels and takes `Icon: recordIcon(key)`; the lucide
   import goes. **`PlayerStreakChips.tsx`** — `CATEGORIES[].Icon` → `recordIcon(key)`; the lucide import
   goes. `data-streak`, labels and geometry unchanged (`playerStreakChips.test.tsx` stays green as is).
6. **Tests — `recordsView.test.tsx` (new)**: `vi.mock("../api/stats.api")` returning a payload with
   two tied `biggest_win` rows (one a friendly with `tournament.id < 0`) → "2 tied" renders, the
   tournament row is a `Link` to `/live/<id>/match/<mid>` and the friendly row is inert;
   `#record-biggest_win` and `#record-most_titles` exist; `finished_matches: 0` → the empty state;
   `document.querySelectorAll("a a").length === 0` (a `PlayerLink` sits inside a stretched-button row —
   the existing pattern, pin it).

**What must not change.** The Streaks page's rows, chips and copy; `StreakPatches`' geometry and the
accent-border rule; `PlayerStreakChips`' `data-streak`; every `ScoreLine`/`ClubMark` call; the
`onSelect` row action on titles.

**Definition of done.** `npm run check` green; `npm run build` green (a view is restructured).
Browser 390/1280 × blue/light on the M4 stack, against the **same DB copy** the M1 curl used:
`/stats?view=overview&sub=records` shows the same five groups with the same rows and tie counts as
before the rewrite (screenshot both stacks, compare), and the network panel shows **one**
`/stats/records` request where it showed six `/stats/player-matches`; `…&sub=records&record=biggest_upset`
lands with that section's header under the top bar (`getBoundingClientRect().top` ≈ 57 + 4 at 390)
and the URL loses `record`; `…&sub=streaks&record=clean_sheet_streak` likewise; `…&sub=cups&cup=
bauernkranz` still works (the shared hook); Records at `mode=1v1` and `source=both` match the old
page's numbers.

**Gates.** `cd frontend && npm run check && npm run build`. Browser as above.

**Canon.** `DESIGN.md` §6 "Stats sub-view skeleton": *a section that can be deep-linked carries
`id={recordSectionId(key)}` and consumes `?record=` through `useOneShotSectionParam`, the same hook
`?cup=` uses.* `AGENTS.md` §2 frontend: `RecordsView` reads `/stats/records`. M7 writes.

**Deviations:**

---

## M5 — The badge band on the profile  ☑

**The gap.** `ProfileHeader.tsx:180-202` — the text column beside the avatar has name, "Public
profile", and the meta line; nothing between them. No component renders a record.

**Verify first.**
```bash
grep -n 'RecordBadges\|getStatsRecords' frontend/src/pages/profile/ProfileHeader.tsx frontend/src/pages/ProfilePage.tsx   # → 0
ls frontend/src/pages/profile/RecordBadges.tsx    # → no such file
```

**The change.**

1. **`ProfilePage.tsx`** — one more query where the page hoists its queries (`:72-123`):
   `const recordsQ = useQuery({ queryKey: qk.stats.records("overall", "tournaments"), queryFn: () =>
   getStatsRecords({ mode: "overall", scope: "tournaments" }), enabled: <the same guard the others use> })`
   — **exactly the Records page's default key**, so the badge and the page it opens are one cache
   entry. Pass `records={recordsQ.data?.records ?? []}` to `ProfileHeader`. Add `recordsQ.isLoading`
   to `unreadJumpReady`'s list (`:230-245`) — the `?unread=1` jump waits for the header's final height
   like it waits for every other header query.
2. **`pages/profile/RecordBadges.tsx` (new)**:
   ```tsx
   /**
    * The records this player holds today, as one wrapping band of icon chips (M5, Rumpi's idea).
    * Grey `.chip`s with a lucide glyph — never a cup token, never a Crown: the avatar ring a few
    * pixels away means "holds a cup today" (T15/C12) and this must read as a different kind of mark.
    * An ongoing streak record wears `border-accent`, the signal `PlayerStreakChips` already paints on
    * this profile for "the record is being set right now". No count: ties are visible in Stats.
    */
   export default function RecordBadges({ playerId, records }: { playerId: number; records: StatsRecord[] })
   ```
   `held = records.flatMap((r) => { const h = r.holders.find((x) => x.player.id === playerId); return h ? [{ r, ongoing: h.ongoing }] : []; })`
   in payload (registry) order. `held.length === 0` → `return null` (no empty strip). Otherwise
   `<ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Records held" data-record-badges>` and per
   entry `<li><Link to={r.path} data-record={r.key} data-ongoing={ongoing || undefined}
   className={cn("chip inline-flex h-7 items-center gap-1 px-2 no-underline focus-ring", ongoing && "border-accent")}
   title={ongoing ? `${r.label} — record holder, current run` : `${r.label} — record holder`}
   aria-label={`${r.label}: record holder${ongoing ? ", current run" : ""}. Open in Stats`}>
   <Icon size={14} strokeWidth={2.25} aria-hidden="true" />{modeLabel ? <span className="text-micro leading-none">{modeLabel}</span> : null}</Link></li>`
   with `Icon = recordIcon(r.key)`, `modeLabel = recordModeLabel(r.key)`. The `Link` carries no
   `NAV_JUMP_STATE`: opening Stats from a profile is a drill-in, so back pops to the profile (Q6b) —
   and Stats is a destination, so back there is the history step regardless.
3. **`ProfileHeader.tsx`** — new prop `records: StatsRecord[]`; render `<RecordBadges playerId=
   {targetPlayerId} records={records} />` **between** the "This is your profile / Public profile" line
   (`:186`) and the `mt-0.5 text-xs` meta line (`:187`), inside the `min-w-0` text column. Nothing else
   moves; the `ml-auto` edit cluster keeps its place.
4. **Tests — `recordBadges.test.tsx` (new)**: a payload where player 1 holds three records (one
   `win_streak` ongoing, one `highest_elo_1v1`) → three `li`, `[data-ongoing]` only on the streak and
   its class list contains `border-accent`, the Elo chip's text is `1v1` and the others have no text
   node, each `href` equals the payload's `path` untouched; player 2 holds nothing → the component
   renders `null` (no `ul`); rendered inside a stand-in header with the avatar `button` above it,
   `document.querySelectorAll("a a").length === 0`; every `aria-label` names the record and "Open in
   Stats".

**What must not change.** The avatar ring and `ownedCups`; the edit cluster; the poke/guestbook lines;
`PlayerLink` usage (there is none in the header today — do not add one).

**Definition of done.** `npm run check` green. Browser on the M5 stack, 390×844 and 1280×900, `blue`
**and** `light`, three profiles: **Berni's** as Roli (a foreign profile), **Roli's own**, and a player
with **no** records. Measure and write into Deviations: chips per row at 390 on the foreign profile
(expect 7) and on the own profile (expect 4; 3 with the unread bell showing); the tab strip's
`getBoundingClientRect().top` before the query lands and after (the shift, in px, per row); the band
is absent on the no-record profile and the strip does not move; in `light` the chip hairline is
visible on the page ground (sample the edge pixel) and the icon ink (`--color-text-chip`) clears
4.5:1 on `bg-card-chip`; the accent border clears 3:1 in both themes; the ring and the nearest chip
are visibly different marks in both themes (screenshot at 3×); tapping `Highest pts / match` lands on
`/stats?view=overview&sub=table&mode=overall&source=tournaments&sort=ppm` sorted by PPM with **no**
network request for `/stats/records` (the cache entry is shared — assert in the network panel), and
tapping a streak badge lands on the Streaks section anchored; back returns to the profile;
`document.querySelectorAll("a a").length === 0`; 0 console errors.

**Gates.** `cd frontend && npm run check`. Browser as above.

**Canon.** `DESIGN.md` §7 gains a row: *A record held today | `RecordBadges` (`pages/profile/`) | a
wrapping band of grey `.chip`s, one lucide glyph each from `recordIcons.ts`, `border-accent` for an
ongoing streak record, no count, no cup token — it sits beside a cup ring and must never read as one.*
§5b: the ongoing state is worded `current`. `AGENTS.md` §9 "An avatar speaks in the present tense"
gains the sentence that the badge band is the second present-tense mark on a profile and is
deliberately not a ring. M7 writes.

**Deviations:**

- Implemented as specified: `pages/profile/RecordBadges.tsx` (new), `ProfileHeader.tsx` gains a
  `records: StatsRecord[]` prop and renders the band between the "Public profile"/"This is your
  profile" line and the meta line, `ProfilePage.tsx` hoists `recordsQ` at exactly
  `qk.stats.records("overall", "tournaments")` and adds it to `unreadJumpReady`. No file outside
  the task's set was touched.
- **Measured on the M5 isolated stack (backend 8095, vite 8115, `verify-m5.db`, a copy of
  `backend/app.db`) with a headless Chromium (Playwright, invoked from its cached npx install —
  not added as a project dependency) at 390×844 and 1280×900, `blue` and `light` — geometry and
  colours were identical between themes, as expected (CSS variables only).** Dev data holders,
  live from `/stats/records`: Roli holds 8 of the 16 records, Berni 3, Rumpi 4, Atzi 4, Flo 3,
  Mike 0 — Mike stood in for "a player with no records" (`Berni's` profile, the plan's literal
  foreign-profile example, only holds 3, so it does not exercise wrap; **Roli's profile viewed
  by Berni** was used as the second "several badges, foreign" case to get a real 8-badge foreign
  row, since no dev player besides Roli holds enough to wrap at 390px foreign width).
  - **Chips per row at 390px, foreign profile:** the text column measured **278px** (plan
    estimated ~290px). With 8 uniform 32px chips it packs **6 per row**, not 7 — because one of
    Roli's 8 held records is `highest_elo_1v1`, whose `1v1` mode label widens that chip to 51px
    (19px over the 32px baseline); the extra width pushed the 7th plain chip to the next row.
    Recomputed for all-uniform 32px chips (`38n − 6 ≤ 278`): **7 fits, 8 does not** — matching the
    plan's estimate exactly once the one wide chip is accounted for. Row split observed: 6 + 2.
  - **Chips per row at 390px, own profile:** the text column measured **134px** (plan estimated
    ~148px; the three ghost `Button`s + `gap-2` measured **144px**, wider than the plan's ~130px
    guess). That packs **3 per row**, not 4 — the unread-pokes bell was **not** showing in this
    data (Roli's pokes were already read), so the plan's "3 with the bell" case was not
    independently exercised; 3 is simply what 144px of edit cluster leaves at these real
    measurements. Row split for Roli's 8: 3 + 3 + 2.
  - **Tab-strip shift, measured with the `/stats/records` response held via `page.route` so the
    pre-data and post-data position were both captured on the same load** (390px, `blue`):
    foreign/3 badges (1 row): **+31px**. Foreign/8 badges (2 rows): **+66px** (33px/row).
    Own/8 badges (3 rows): **+100px** (33.3px/row). All close to the plan's "~34px per row"
    estimate; the small (1-2px) shortfall is the `mt-1` (4px) plus a 28px row not landing on an
    exact multiple once real font metrics are in play. At 1280px all three cases stayed a single
    row (23+ chips fit; no shift measured — nothing to shift).
  - **No-record profile (Mike):** `[data-record-badges]` is absent from the DOM, and the tab
    strip's position is identical to a same-shaped profile with a band absent — confirmed no
    empty 28px strip and no gap in the header rhythm (screenshot: "Public profile" is immediately
    followed by "Angepöbelt: 404" with no space between).
  - **Contrast, computed via the WCAG relative-luminance formula from the live
    `getComputedStyle()` values** (not eyeballed): icon ink vs. chip background — **blue 8.60:1**,
    **light 17.49:1** (both far past the required 4.5:1). Accent border (added via
    `classList.add("border-accent")` on a live chip to confirm the cascade, since no streak in
    this dev data happens to be `ongoing` right now — the `recordBadges.test.tsx` unit test
    covers the `ongoing` rendering path directly) vs. chip background — **blue 3.50:1**, **light
    6.87:1** (both past 3:1); vs. the page background — blue 6.22:1, light 5.77:1. Chip hairline
    (`border-card-chip` at 55%) vs. the light page background — **2.12:1**, a deliberately subtle
    resting edge (the same token every other `.chip` in the app uses at the same opacity; it is
    not the 3:1 UI-component threshold, which applies to interactive/state boundaries, not a
    passive card edge) — visible at 100% in the screenshot's zoomed crop.
  - **Ring vs. badge, screenshotted at 3× device-scale-factor** on Berni's profile (Berni holds
    the Lorbeerkranz cup in this dev data, so his ring is gold/coloured rather than the neutral
    hairline): the avatar ring and the grey chip band are unambiguously two different marks in
    both themes — solid colour ring vs. bordered grey pills with a lucide glyph, no shared shape,
    no shared colour. No `Crown`, no cup-colour token anywhere in the band.
  - **Tap-through:** clicked `most_points` (Roli holds it) → landed on
    `/stats?view=overview&sub=table&mode=overall&source=tournaments&sort=pts` with **0** further
    requests to `/stats/records` (network listener asserted); clicked `win_streak` → landed on
    `/stats?view=overview&sub=streaks&mode=overall&source=tournaments&record=win_streak`, same
    zero-refetch result; separately clicked `highest_ppm` from Atzi's profile (the plan's own
    example record) → `sort=ppm`, also 0 further requests. All three: back navigated to the
    originating profile, 0 console errors.
  - `document.querySelectorAll("a a").length === 0` on every profile screenshotted (with the
    band rendered, the avatar-open `<button>` above it, and — at 1280px — the sidebar's own
    links on the same page).
- `npm run check` (73 files / 731 tests, tsc clean, eslint clean) and `npm run build` both green
  on this task's own files; both were also run against the shared working tree while M4 was
  mid-edit on `pages/stats/*` (disjoint from this task's file set) — `npm run build` failed once
  transiently on `StatsInsights.tsx`/`RecordsView.tsx` (files this task does not own or touch)
  while that edit was in flight, and passed on retry once M4's tree was internally consistent
  again. Not a defect in this task's files; noted per rule 8's "Group-B workers will see each
  other's in-flight files" warning.
- No backend files touched, so no backend gate applies to this task.

---

## M6 — Standings: evaluate, expect nothing  ☐

**The question.** Should `pages/live/StandingsTable.tsx` show anything about records now that the
profile does? Roli expects "nothing". This task reads, measures and answers; it writes no code unless
it finds something that contradicts the reasoning below, in which case it **stops and reports**.

**Verify first.** `sed -n 162-260p frontend/src/pages/live/StandingsTable.tsx` — the streak chips and
their record highlight; `sed -n 24-48p frontend/src/ui/StreakPatches.tsx` — the accent border.

**What to check and write down.**
1. The volatile records on a tournament night are ongoing streaks. `StandingsTable` already shows a
   current run as a `StreakPatch`, and lights its border **when the run is at least the all-time
   record** (`highlight = Number(r.length) >= recWin`, `:215`) — the same "ties or sets the record"
   rule the badge uses. Confirm on the live tournament in the DB copy that a record-length run shows
   the accent border in both themes.
2. `MIN_LEN = 2` (`:182`) gates *showing a current run*, not *holding a record*; Roli's "no minimum
   threshold" is about badges. Say so — it is not in conflict and must not be "fixed".
3. A stable record (titles, Elo, points) inside a tournament would be a second present-tense mark on
   a screen that deliberately has none (T15: standings avatars keep the hairline; the crown means
   "held it going into this tournament"). A badge there would break "one tense per screen".
4. The one thing a night can newly produce is a *gained* stable record (a player takes Highest Elo
   mid-tournament). Everyone is told by push; the profile shows it; the standings would only repeat
   it. Recommend nothing.

**Definition of done.** Deviations carries the four answers with the measured highlight check; no
file changed (`git status` clean for this task); if anything should be added after all, it is
written as a proposal here, not implemented.

**Gates.** None (no code). **Canon.** None expected.

**Deviations:**

---

## M7 — Documentation pass (runs LAST)  ☐

Files: `AGENTS.md`, `DESIGN.md`, this file. Collect every "Canon" line from M1–M5 (and M6's answer)
and fold them in; **no code**. Specifically:
- `AGENTS.md` §2: `services/stats/records.py`, `services/record_holders.py` (backend);
  `pages/stats/recordIcons.ts`, `pages/stats/useOneShotSectionParam.ts`, `pages/profile/RecordBadges.tsx`
  (frontend). §3 baselines (measured after M5). §5: the two tables, the seeding rule, the rollback
  consequence as measured in M2. §6: `/stats/records` (public, `mode`/`scope`, the backend emits
  `path`), the `record_moved` push with Roli's arithmetic recorded as his decision, `result` for
  generate-over-results and a played tournament's date, the table of result paths and the one function.
  §9: the badge is not a ring; icons come from the one map. §10: the stats URL scheme's `sort`/`dir`/
  `record`; "a live goal is not a result"; `RecordKeyState` semantics; the own-profile row width
  measured by M5. §11: current state.
- `DESIGN.md`: §6 (section anchors), §7 (the `RecordBadges` row), §5b (`current` on the badge),
  the icon table's final glyphs recorded under §1.5 as approved.
- This file: strike any passage a Decisions answer superseded; record the measured numbers.

**Gates.** All four re-run on the documentation tree and recorded: `make test`, `make lint`,
`make gen-types` (no diff), `cd frontend && npm run check && npm run build`.

**Deviations:**

---

## Verification gates (after all tasks)

- `make test` green (baseline 228 + M1's 9 + M2's 12 ≈ 249), `make lint` clean, `make gen-types` no
  diff after M1's commit.
- `cd frontend && npm run check` green (baseline 717 in 71 + the new files), `npm run build` green.
- `curl -s :<B>/stats/records | jq '.records | length'` → 16, keys in registry order.
- `grep -rn 'after_result_change' backend/app/routers | wc -l` → **8** call sites (patch_match,
  swap_sides, generate, reassign, second_leg, delete, decider, date) + `manage.py` → 9.
- `grep -rln 'from "lucide-react"' frontend/src/ui/StreakPatches.tsx frontend/src/pages/stats/PlayerStreakChips.tsx frontend/src/pages/stats/StreaksView.tsx` → **0** (all three read `recordIcons.ts`).
- `document.querySelectorAll("a a").length` = 0 on a profile with badges and on Records.
- Rollback drill done in M2 and written down.
- **Not a gate, not provable here:** push over the wire (no `cryptography`, no VAPID) — the queue is
  asserted, the phone proves delivery.

## Deployment (later, on Roli's go)

Backend and schema change → the **full** deploy: step 2's backup first (`python3 backend/manage.py
backup-deploy-data`), then `ssh hetzner && cd ~/projects/Lorbeer-Turnierplaner && git pull && docker
compose up -d --build`. Expect "Cup defs validated", "DB initialized" and **`Record holders seeded:
16`** — the one-time line that proves the diff base was written **silently** (no push goes out on
deploy). `curl https://lorbeerkranz.xyz/api/stats/records | jq '.records | length'` → 16 proves the
new code is up. **No manual step**, no `_RUNTIME_COLUMNS`, `notification_texts.json` ships in the
image. Rollback: `git checkout f8a02b7 && docker compose up -d --build` — old code ignores both
tables (measured in M2); results entered while rolled back are announced when the new code next
reconciles. Smoke: open Roli's profile on a phone → the band; tap a badge → Stats sorted/anchored;
from a second phone correct a finished score that moves a record → every phone gets its own text.

## Deferred — explicitly NOT here

- `since` ("holds it since 12.09.2026") in the badge tooltip — the column exists in `RecordHolder`;
  exposing it needs a response-model field and a join.
- A value in the push text ("Rumpi: 8 in a row").
- A bell item for a record move (Decision 7).
- Records per mode beyond the three Elos, and any friendlies-scoped record.
- Any change to the Standings (M6's answer).
- `_authors_line` re-based on `_join_names`.

## What this plan could not verify (and why)

- **No checks were run** (read-only session); baselines are `AGENTS.md` §11's.
- **The chips-per-row numbers are computed from class geometry** (`Button` `h-9 px-3`, avatar 56,
  `--page-pad-x` 16, chip 32 + gap 6), not measured; M5 measures them.
- **The reconcile's latency** on a match PATCH (three ratings folds, one streak fold, one players
  fold, one match load ≈ six full passes over ~250 finished matches). Estimated well under 300 ms on
  the VPS; M2 measures it on the Pi and, if the finish PATCH grows noticeably, notes `BackgroundTasks`
  as the follow-up — not taken here because a synchronous call is what the tests can assert.
- **Push over the wire**, as every batch before.

## Decisions still needed from Roli

None block M1 or M2. **Item 1 blocks M3, M4 and M5.**

1. **The icon set** (the table at the top). Approve, or swap glyphs — the map is one file
   (`recordIcons.ts`); the two pairs to look at are `Coins`/`Award` and `Flame`/`Zap`. Cost of a swap
   later: one line per glyph, no other code.
2. **Who holds "Highest-scoring match"?** (a) **both sides** — it is the match's record and both made
   it [default]; (b) the winners only — the loser of a 7:6 also "holds" it under (a); (c) no badge for
   it (it stays on the Records page). One line in `records.py`.
3. **The empty-column rule.** (a) **`played > 0`** — a player with no matches holds no table/Elo
   record even though the Table lists them at 1000 [default; not a floor, a "has an entry at all"];
   (b) Table-literal — a newcomer at 1000 tops Highest Elo when everyone who played is below 1000, and
   on an empty database all six hold everything. One predicate.
4. **Your own profile at 390px** shows ≈4 badges per row (the three edit buttons take the room); a
   foreign profile shows ≈7. (a) **Keep the literal placement** [default, as decided]; (b) let the band
   span the identity block's full width under the avatar row — 7 per row on both, one wrapper moves.
5. **Wrapping vs one row.** (a) **Wrap** [Roli's suggestion, default] — the tab strip moves 34px per
   extra row; (b) one fixed-height row that scrolls sideways (`overflow-x-auto`, `data-no-swipe-nav`)
   — the strip never moves, badges past the seventh are off-screen at 390.
6. **The push copy** — three keys × three languages drafted in M2 step 6, Styrian in your voice.
   Correct at review; strings only.
7. **A bell item too?** Default **no** — a record move has no read state and four of the six
   recipients are onlookers. Yes costs a third table (read state) and a new `/me/notifications` kind.
8. **The three Elo badges** share `Award` with a `1v1`/`2v2` micro-label. Alternative: three glyphs.
   One line each.
