# Design Fixes 2026-09 — the blind audit's Parts 1, 2 and 4, plus the vocabulary sweeps

> Branch `feature/2026-09-design-fixes` off `main` (baseline `2e23365`). Written 2026-09-17 from
> `DESIGN_AUDIT_2026-09-17.md` and the eight raw reports in `design-audit-2026-09-17/`.
> Symbol names are the source of truth; line numbers reference the baseline.
> Read `AGENTS.md` first (canonical project knowledge), then `DESIGN.md` (the visual canon).
> Every task below was checked against the canon and says one of three things: *follows it*,
> *changes a named line of it* (applied by C15), or *blocked on Roli*.
> **Not deployed** at the end of this batch — Roli tests locally first.
>
> Task IDs: `C1`/`C2` also exist in `FEATURES_2026-09.md` (Font Awesome, dead code). If that
> matters for `git log --grep`, rename this file's prefix before the first commit; the IDs
> appear nowhere else yet.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code
   style (Tailwind + design tokens, `qk` query-key factory, generated API types, lucide-react).
   The sweeps (C10) are the one task allowed to touch many files, and it runs alone.
2. Work on branch `feature/2026-09-design-fixes`. **Never switch branches, never touch `main`,
   never push.** One or more commits per task, message prefixed with the task ID
   (`fix(C3): …`, `refactor(C8): …`, `docs(C15): …`).
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never `git commit -a`.
   Each task lists its file set; if you need a file outside it, stop and report.
   `DESIGN.md` and `AGENTS.md` are edited by **C15 only**: write the canon line your task changes
   under "Canon" in your task section and leave the files alone.
4. **Verify first.** Every task names the check that proves the defect still exists. Run it before
   changing anything; if the defect is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing: frontend touched → `cd frontend && npm run check`
   (+ `npm run build` where the task says so). No task here touches the backend; if you find you
   must, stop — that is a different plan.
6. UI must work at ~390px and ≥1024px, verified in a real browser (Playwright against the
   isolated stack below) in **both** the `blue` and the `light` theme. Measure, do not eyeball:
   contrast with the WCAG formula on sampled pixels, geometry with `getBoundingClientRect`.
7. Never read or print `backend/secrets.json`. Never run destructive commands on
   `backend/app.db` or `backend/data/app.db` — copy first. Never bind 8000/8001/8010/5173.
8. **One mechanism per job — reuse before you create.** This batch exists to collapse N ways of
   doing a thing into one; a worker that invents its own way while fixing that is the batch
   defeating itself. Before writing a helper, a hook, a wrapper or a class string, look for the
   existing one — and if your task names a mechanism, use **that** one and no other. The shared
   things this batch depends on, none of which may be re-implemented:

   | job | the one implementation | who builds it |
   |---|---|---|
   | asking before an irreversible action | `ui/primitives/ConfirmDialog` — one per site, local `useState` | exists; C7 wires 11 more |
   | a locale | the two constants exported from `utils/format.ts` — **no call site spells a locale string** | C1 |
   | a per-match average | `fmtAvg` — `fmtPct` is deleted, inline `.toFixed(2)` is not allowed back | C10 |
   | a count + a noun | `fmtCount` | C10 |
   | two names on one line | `teamName` in `utils/matchDisplay.ts` — every `join` routes through it | C10 |
   | a player's colour | `colorForIdx` in `trendsMath.ts` and the theme tokens it reads | C2 |
   | a "see more" link | the `StandingsPreviewCard.tsx:49` look — copy it; the audit already counted four | C14 |
   | a score, a record, a club symbol, an avatar | `ScoreLine`, `RecordLine`, `ClubMark`, `AvatarCircle` | all exist |

   **C11 and C13 run after C2 on purpose:** they take their colours from the token mechanism C2
   establishes and add no parallel one. If your task genuinely needs something new and shared,
   put it where the existing family lives (a primitive in `ui/primitives/`, a formatter in
   `utils/format.ts`), and say so in **Deviations** in your first sentence, so the next task reuses
   it instead of writing its own. Two implementations of one job is a failed task even when both
   are correct and the tests are green.
9. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the
   task did not say, what you measured, what you left). Include that edit in your commit.
   If blocked or the code does not match this spec, stop, note it here, commit nothing broken.

### Runtime verification (isolated stack)

**Tasks run in parallel, so every task has its own ports and its own database copy.** Use the row
for *your* task and nothing else — two workers on one port or one `verify.db` will fight.

| task | backend | vite | db copy |
|---|---|---|---|
| C1 | 8031 | 8041 | `backend/data/verify-c1.db` |
| C2 | 8032 | 8042 | `backend/data/verify-c2.db` |
| C3 | 8033 | 8043 | `backend/data/verify-c3.db` |
| C4 | 8034 | 8044 | `backend/data/verify-c4.db` |
| C5 | 8035 | 8045 | `backend/data/verify-c5.db` |
| C6 | 8038 | 8048 | `backend/data/verify-c6.db` |
| C7 | 8036 | 8046 | `backend/data/verify-c7.db` |
| C8 | 8039 | 8049 | `backend/data/verify-c8.db` |
| C9 | 8037 | 8047 | `backend/data/verify-c9.db` |
| C10 | 8050 | 8060 | `backend/data/verify-c10.db` |
| C11 | 8051 | 8061 | `backend/data/verify-c11.db` |
| C12 | 8052 | 8062 | `backend/data/verify-c12.db` |
| C13 | 8053 | 8063 | `backend/data/verify-c13.db` |
| C14 | 8054 | 8064 | `backend/data/verify-c14.db` |

`backend/data/*.db` is gitignored, so the copies never reach a commit. **Never** point the stack at
`backend/app.db` or `backend/data/app.db` — those are Roli's real synced data.

```bash
# <B>, <V>, <DB> from your row above
cp backend/app.db backend/data/<DB>

# A throwaway secrets file, because backend/secrets.json must never be read (Rule 7) and the
# editor/admin flows need a login. Write it OUTSIDE the repo so it cannot be committed:
SEC=$(mktemp -d)/secrets.json
cat > "$SEC" <<'JSON'
{ "db_url": "sqlite:///./app.db",
  "player_accounts": [ { "name": "Roli", "password": "verify-only", "admin": true } ],
  "jwt_secret": "verify-only", "ws_require_auth": false, "log_level": "WARNING" }
JSON

cd backend && UPLOADS_DIR="$PWD/data/uploads" .venv/bin/python run.py \
  --host 127.0.0.1 --port <B> --secrets "$SEC" --db-url "sqlite:///$PWD/data/<DB>" &
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:<B> VITE_WS_BASE_URL=ws://127.0.0.1:<B> \
  npx vite --port <V> --strictPort &

# log in (the body field is `username`, not `name`):
curl -s -X POST http://127.0.0.1:<B>/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"Roli","password":"verify-only"}'
# then in the browser, before the first navigation:
#   localStorage ea_fc_token=<token> · ea_fc_role=admin · ea_fc_player_id=1 · ea_fc_player_name=Roli
#   localStorage theme = "blue" | "light"
```
Playwright lives in the npx cache (see `FEATURES_2026-09.md` "Runtime verification" for the
one-liner). **Kill only the PIDs you started** — never a broad `pkill`; Roli has long-running
servers on 8000/8001/8010/5173.

Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5, Mike=6; tournament 21 is live (2v2),
19 is done (1v1), 17 is done (2v2). Reader role is enough for read-only checks.

---

## Decisions (Roli, 2026-09-17 — do not relitigate)

- **Locale is split** (Roli, second pass): **numeric dates are `de-AT`**, pinned in one constant,
  and the padded/unpadded mismatch is settled with it — but the **spelled-out and abbreviated month
  forms use `en-GB`**, so a German month name never appears in the English UI. `en-GB` is chosen
  over `en-US` because it is day-first and therefore agrees with the numeric shape. Known wart to
  settle in C10's pick table: `en-GB` abbreviates September as "Sept", the audit's "only
  four-letter month".
- **All eleven unconfirmed actions get the dialog**, logout and "clear the friendly form" included.
  Which carry the red block follows the rule inferred from the existing thirteen (C7).
- **The trends palette keeps its six hues; lightness comes from the theme.** Player identity is
  stable across themes; the generator becomes theme-aware without a re-render storm (C2).
- **In scope from Part 3:** one label per quantity (played, points, win rate, per-match average,
  Elo, goal difference); one spelling for a 2v2 team on one line; one separator for a score in
  prose; pluralisation through `fmtCount`; the small text splits (ellipsis, Login/Log in, Title
  Case, empty-state full stops, "None yet.", still-running words, profile-door tooltips, "a of b").
- **Explicitly deferred** (design-system work, a later batch — see "Deferred" at the end): the
  eight section-heading treatments, the eight `.inset` paddings, adopting `Button.iconOnly`
  across 43 call sites, an avatar size scale, the nine filter/tab control idioms, the desktop
  width rework.
- **Sweep picks default to the majority** and are listed in one table (C10) so single rows can be
  vetoed at review.

**Answered 2026-09-17, second pass — these three tasks are no longer blocked:**
- **C11 — draw in the light theme moves to yellow-800 `133 77 14`.** 5.75:1 on the page, 4.64:1 on
  its own badge, ΔE to `loss` 33 instead of 21. `DESIGN.md` §2's table row and `light.css`'s R3
  comment change with it. *(The gold-cup half of C11 — one token or a text/mark split — is still
  open; see the Decisions list.)*
- **C12(a) — the duplicate crown goes.** `CupOwnerBadge` is removed where the avatar already wears
  the cup ring (Players page, profile header), so a crown on a person means only "held it going
  into this tournament". *(C12(b), the picker's accent selection ring, is still open.)*
- **C13 — "live" is green everywhere.** The nav dot takes the status green; `--color-live` and the
  `DESIGN.md` §2 row are rewritten. The five in-page markers already agree, so this is the smaller
  of the two moves and the canon stops contradicting itself.

**Answered 2026-09-17, third pass — nothing is blocked any more:**
- **C11 — the gold cup is split** into a *text* value (dark, ≥4.5:1, for the holder's name) and a
  *mark* value (brighter, ≥3:1, for ring, crown and dot), so the Lorbeerkranz reads gold in both
  themes instead of amber in dark and brown in light. `cupColors.ts` and its 3 consumers follow.
- **C11 — draw moves to yellow-300 `253 224 71` in the dark themes** as well, so a drawn score is
  no longer the same amber as every cup mark. This changes how *every* draw looks in the blue theme,
  not an edge case — verify it on a real match list before calling the task done.
- **C12(b) — the picker keeps its accent selection ring.** No change; the collision is conceptual
  (no picker passes `cups`, so a ring can never mean two things on one disc) and is not worth
  touching six pickers. Record it in `DESIGN.md` as a deliberate exception so it is not re-audited.
- **C14 — the three accent text links take the dashboard's muted text + chevron look**
  ("Full table ›" is the precedent). Accent then means "selected" only.

## Task overview & order

| # | ID | Title | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------------------------------|------|
| 1 | C1 | Locale pinned to `de-AT`, one shape per date helper (1.11) | `utils/format.ts`, `pages/TournamentsPage.tsx`, `pages/stats/charts.tsx` (line 188 only), `pages/tools/FriendlyMatchCard.tsx` (line 386 only), `test/format.test.ts`, `test/cupsPreview.test.tsx` | **first, alone** |
| 2 | C2 | The palette takes its lightness from the theme; sparkline and dots on tokens (1.1, 1.2) | `pages/stats/trendsMath.ts`, `pages/stats/charts.tsx`, `pages/stats/PlayerProfile.tsx`, `pages/stats/trends/TrendsExplorer.tsx`, `pages/dashboard/TrendsPreviewCard.tsx`, `themes/defaults.css`, `themes/light.css`, `test/trendsMath.test.ts` | group A |
| 3 | C3 | Hairlines, placeholders, the League select (1.3, 1.5, 1.6, 1.13) | `styles.css`, `pages/stats/StatsTable.tsx`, `pages/stats/CupDetail.tsx`, `pages/ClubsPage.tsx`, `ui/ClubPicker.tsx` | group A |
| 4 | C4 | The comments feed says `vs` for an unplayed match (1.7) | `pages/live/TournamentCommentsCard.tsx`, `pages/live/comments/CommentList.tsx` | group A |
| 5 | C5 | The W/D/L badge follows the result, not the density (1.9) | `pages/stats/MatchHistoryList.tsx`, `test/matchHistoryList.test.tsx` | group A |
| 6 | C7 | Every irreversible action asks first (1.8) | `pages/players/PlayerAvatarEditor.tsx`, `pages/profile/ProfileHeader.tsx`, `pages/ideas/IdeaCard.tsx`, `pages/ideas/IdeasPage.tsx`, `pages/live/AdminPanel.tsx`, `pages/live/LiveTournamentPage.tsx`, `pages/live/CurrentGameSection.tsx`, `pages/live/MatchList.tsx`, `pages/SettingsPage.tsx`, `pages/tools/FriendlyMatchCard.tsx`, new tests | group A |
| 7 | C9 | A name in a pill opens the profile (2.7) | `ui/primitives/VoteVotersModal.tsx`, `pages/stats/h2h/DuoDetail.tsx` | group A |
| 8 | C6 | Floating elements: verify the clearance the canon promises (1.4) | none expected; `pages/stats/StatsInsights.tsx`, `pages/tools/FriendlyMatchesListCard.tsx`, `pages/ideas/IdeasPage.tsx` only if a measurement fails | after group A |
| 9 | C8 | Defined and never reached (Part 4) | `ui/primitives/Modal.tsx` + its 6 callers, `pages/live/AdminPanel.tsx`, `pages/live/StandingsTable.tsx`, `pages/live/LiveTournamentPage.tsx`, `ui/primitives/CollapsibleCard.tsx`, `pages/clubs/ClubList.tsx`, `ui/primitives/SegmentedSwitch.tsx`, `pages/live/MatchList.tsx`, `pages/live/MatchDetailPage.tsx`, `tailwind.config.cjs`, `ui/primitives/Pill.tsx`, `ui/theme.ts`, `ui/theme-legacy.ts` | after group A |
| 10 | C10 | Vocabulary sweeps (1.12, 2.1, 2.9, 2.10, Part 3 subset) | see the pick table | after C8, **alone** |
| 11 | C11 | Draw, loss and cup gold — all decided (1.10, 2.5, 2.6) | `themes/defaults.css`, `themes/light.css`, `cupColors.ts`, and the six mark consumers: `ui/primitives/AvatarCircle.tsx`, `ui/primitives/CupOwnerBadge.tsx`, `pages/stats/cupParts.tsx`, `pages/dashboard/CupsPreviewCard.tsx`, `pages/stats/TournamentLaurelMarkers.tsx`, `pages/stats/PositionsView.tsx` | **after C10** (both edit `cupParts.tsx`) |
| 12 | C12 | The crown goes; the picker ring stays — decided (2.2, 2.3) | `pages/PlayersAdminPage.tsx`, `pages/profile/ProfileHeader.tsx`, `test/avatarRing.test.tsx` | **after C10** |
| 13 | C13 | The colour of "live" — decided: green everywhere (2.4) | `themes/defaults.css`, `themes/light.css` (two lines; no `styles.css` edit) | after C11 |
| 14 | C14 | Accent means "selected" only — decided (2.8) | 3 link sites | after C10 |
| 15 | C15 | Documentation pass | `DESIGN.md`, `AGENTS.md`, this file | last |

**Order:** C1 alone → **group A** {C2, C3, C4, C5, C7, C9} in parallel (file sets verified
disjoint above) → C6 and C8 (disjoint from each other) → **C10 alone** → C11–C14 (C11 before C13;
C11, C12 and C14 may run in parallel — their file sets are disjoint) → C15.
**Nothing runs beside C10.** C10 touches `cupParts.tsx`, `MatchList.tsx`, `StandingsTable.tsx`,
`ClubPicker.tsx`, `MatchDetailPage.tsx` and `TrendsExplorer.tsx`, which C11, C12 and C14 also
touch; with `git commit -o -- <paths>` and no `git add`, whichever commits second commits the
other's half-finished file.

All tasks are frontend-only. Gates per task: `cd frontend && npm run check`; `npm run build`
additionally for C2 (CSS tokens read by the bundle), C8 (props and config removed) and C10
(≈35 files). Browser verification at 390×844 and 1280×900, `blue` **and** `light`, for every
task that changes a pixel (C2, C3, C5, C6, C7, C9, C10, C11–C14).

---

## C1 — Numeric dates pinned to `de-AT`, spelled months `en-GB`, one shape per helper (audit 1.11)  ☑

**The defect.** All five date helpers in `frontend/src/utils/format.ts` and the three inline
formatters (`pages/TournamentsPage.tsx:98`, `pages/stats/charts.tsx:188`,
`pages/tools/FriendlyMatchCard.tsx:386`) pass `undefined` as the locale, so the same screen reads
`12.9.2026` on an Austrian phone, `12/09/2026` on a British one and `9/12/2026` on an American
one (source-3 §Dates, 9 shapes). On a German-locale phone `fmtDate` (no options) is unpadded
and `fmtDateTime` (`2-digit`) is padded — one day, two column widths. `src/test/cupsPreview.test.tsx:114`
pins the en-GB shape `23/04/2026`.

**Roli's decision (two constants, not one).** Numeric forms → `de-AT`. Spelled-out and abbreviated
month forms → `en-GB`, so no German month name appears in the English UI. Which helper takes which:

| helper / site | locale | renders |
|---|---|---|
| `fmtDate`, `fmtDateTime`, `fmtTs` | `de-AT` | `03.09.2026`, `03.09.2026, 14:30` |
| `fmtDateLong` (friendlies day headings) | `en-GB` | `3 September 2026` |
| `fmtShortDate` (Records, Streaks) | `en-GB` | `3 Sept 2026` (four-digit, row 19) |
| `TournamentsPage.tsx:98` (month headings) | `en-GB` | `September 2026` |
| `charts.tsx:188` (axis ticks) | `en-GB` | `Sept` |
| `FriendlyMatchCard.tsx:386` (time only) | `de-AT` | `14:30:45` |

Export both as named constants from `utils/format.ts` (e.g. `APP_LOCALE_NUMERIC` /
`APP_LOCALE_MONTHS`) so no call site spells a locale string itself.

**Verify first.**
```bash
grep -n 'toLocale' frontend/src/utils/format.ts frontend/src/pages/TournamentsPage.tsx frontend/src/pages/stats/charts.tsx frontend/src/pages/tools/FriendlyMatchCard.tsx
# expect 8 hits, every one with `undefined` or no locale argument
grep -n '23\\/04\\/2026' frontend/src/test/cupsPreview.test.tsx   # expect line 114
node -e 'console.log(new Date(2026,8,3).toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric"}))'  # expect 03.09.2026
```
(Verified 2026-09-17 on Node 24.13: `03.09.2026` · `03.09.2026, 14:30` · `3. September 2026` ·
`03. Sep. 2026` · `September 2026` · `Sep` · `14:30` · `05. Jän. 2026` · `März 2026`.)

**The change — TWO constants, not one.** `frontend/src/utils/format.ts`:
- ```ts
  // Roli, 2026-09-17: a date must read the same on every phone, so nothing passes `undefined`.
  // Numbers are Austrian; spelled-out and abbreviated months are English, because the UI is
  // English and "März 2026" in it is a bug, not a feature. en-GB (not en-US) so the spelled
  // form stays day-first and agrees with the numeric one.
  export const APP_LOCALE_NUMERIC = "de-AT";
  export const APP_LOCALE_MONTHS = "en-GB";
  ```
  **Both names are normative** — do not rename them; `C15` documents them and Rule 8 forbids a
  third. No call site anywhere spells a locale string itself.
- `fmtDate` → `(APP_LOCALE_NUMERIC, { day: "2-digit", month: "2-digit", year: "numeric" })`
  → `12.09.2026`. The `2-digit` day/month is what settles the padding: it now matches `fmtDateTime`.
- `fmtDateTime`, `fmtTs` → `(APP_LOCALE_NUMERIC, …same options…)` → `12.09.2026, 14:30` (24h).
- `fmtDateLong` → `(APP_LOCALE_MONTHS, { day: "numeric", month: "long", year: "numeric" })`
  → `12 September 2026`.
- `fmtShortDate` → `(APP_LOCALE_MONTHS, { day: "2-digit", month: "short", year: "numeric" })`
  → `12 Sept 2026`. **Four-digit year** (pick-table row 19, and this task's table above is wrong
  where it says `26` — the year is never omitted elsewhere in the app and `26` reads as a day).
  Rewrite the helper's doc comment, which still promises `'26` and never printed the apostrophe.
- Inline callers: `pages/TournamentsPage.tsx:98` (month heading) and `pages/stats/charts.tsx:188`
  (axis ticks) pass **`APP_LOCALE_MONTHS`** → `September 2026`, `Sept`;
  `pages/tools/FriendlyMatchCard.tsx:386` becomes
  `new Date(lastSavedAt).toLocaleTimeString(APP_LOCALE_NUMERIC, { hour: "2-digit", minute: "2-digit" })`
  — the only seconds in the product UI go with it (source-3 §Times of day).
- Tests: `test/cupsPreview.test.tsx:114` → `23.04.2026`, `:118` → `11.07.2026`.
  `test/format.test.ts`: one shape assertion per helper (`fmtDate === "12.09.2026"`,
  `fmtDateTime === "12.09.2026, 14:30"`, `fmtDateLong === "12 September 2026"`,
  `fmtShortDate === "12 Sept 2026"`) so the shapes are pinned.

**What must not change.** `diagnostics/crashLog.ts:512` (`formatTimestamp`, ISO, locale-free) and
`ui/layout/ViewportReadout.tsx:174` (UTC ISO in copied text) stay as they are — they are for
pasting into a bug report. `NotificationBell.tsx:19-30` (`timeAgo`) keeps its relative form and
falls through to `fmtDate` after 7 days as today. `fmtMonthDate` (no app caller, D1) untouched.
The `<input type="date">` in `AdminPanel.tsx:296` is the browser's.

**Definition of done.** Every `toLocale*` call in `frontend/src` (excluding `test/`) passes one of
the two constants:
```bash
grep -rn 'toLocale' frontend/src --include='*.ts' --include='*.tsx' | grep -v test/ | grep -vc 'APP_LOCALE_'   # → 0
```
and in a browser whose own locale is `en-US`, the tournaments list reads `12.09.2026`, a comment
byline `12.09.2026, 14:30`, a Streaks row `12 Sept 2026`, a friendlies day heading
`12 September 2026`, a tournaments month heading `September 2026`, and the friendly form's Saved
line `14:30`. **No German month appears anywhere.** `npm run check` green.

**Gates.** `npm run check`. Browser check at 390 in `blue` only (no pixel change beyond text).

**Known wart (row 19's neighbour, flagged for review not decision):** `en-GB` abbreviates
September as `Sept`, four letters where every other month is three. Roli was told; keep it unless
he vetoes.

**Deviations:** None from the task spec — implemented literally as written, only the listed
files touched. Verify-first confirmed the defect (8 `toLocale*` calls, all `undefined`/no-locale
argument; `cupsPreview.test.tsx:114`/`:118` pinned `23/04/2026`/`11/07/2026`). Node 24.13 shape
check reproduced the task's own "Verified 2026-09-17" line exactly before any edit.
After the change: DoD grep (`grep -rn 'toLocale' frontend/src … | grep -v test/ | grep -vc
'APP_LOCALE_'`) → `0`. `npm run check` green: typecheck clean, eslint clean, vitest **686/686**
(681 baseline + 5 new shape-pin tests in `format.test.ts`: `fmtDate`, `fmtDateLong` ×2,
`fmtDateTime`, `fmtShortDate`). Browser gate run against the isolated stack (backend 8031 /
vite 8041 / `backend/data/verify-c1.db`, deleted afterward) in **both** `blue` and `light`
(the task only asked for `blue`, but both cost nothing extra and the task's own DoD lists
several surfaces) at 390px, admin session: `/tournaments` month heading `September 2026` +
numeric date `13.09.2026`; `/friendlies` day heading `28 August 2026`; `/stats?view=overview&sub=streaks`
short date `04 Jan 2026`; `/stats?view=trends` axis ticks `Dec/2026/Feb/Apr/Jun/Aug` (en-GB
3-letter forms; no September tick was in the visible range, so the `Sept` 4-letter wart wasn't
re-observed live, but the Node-level check above confirms it); comment bylines on tournaments
19 and 17 (`fmtTs`) render `11.09.2026, 20:24` / `11.07.2026, 19:47` — `de-AT`, correct. A
full-page body-text scan for the eleven German month abbreviations (`Jän`, `Feb.`, `März`, …)
found zero hits on every page visited. Zero console/page errors in either theme. Did not
exercise `FriendlyMatchCard.tsx`'s "Saved HH:MM" line live (it only renders after a save
mutation) — verified instead by the Node-level shape check plus reading the diff, which is
mechanical (one `toLocaleTimeString` call, same pattern as every other site).

---

## C2 — The palette takes its lightness from the theme; sparkline and dots on tokens (audit 1.1, 1.2)  ☑

**The defect.** `frontend/src/pages/stats/trendsMath.ts:8` (`colorForIdx`) spreads hue round the
wheel at a **fixed** `hsl(hue 72% 56%)`, with no theme input. Measured against its own card
(pixel-4 §Trends): light — Flo **1.31:1**, Berni **1.50:1**, Rumpi **1.63:1**; blue — Atzi **2.06:1**.
The dashed "no data" segments are the same colour at `opacity 0.28` (`charts.tsx:258`) — Atzi in
blue **1.03:1**. The same palette feeds the Trends chart, the dashboard chart, both legends, the
"Compare with" dots (`PlayerProfile.tsx:153`, dimmed to `opacity 0.45`: Flo **1.14:1** light,
Atzi **1.34:1** blue), the radar overlay, the cup reign timeline and its legend (`cupParts.tsx:134,162`)
and the reign rows (`CupDetail.tsx:177`) — all through `usePlayerColors.ts`. Separately, the form
sparkline (`charts.tsx:6-8`) is a hard-coded `rgb(34 197 94)` / amber / red: **2.28:1** on the light
theme's white card. Roli: keep the six hues, derive lightness from the theme.

**Verify first.**
```bash
sed -n '8,15p' frontend/src/pages/stats/trendsMath.ts          # hsl(${hue} 72% 56%), no theme input
grep -n 'opacity={skipped' frontend/src/pages/stats/charts.tsx  # 0.28
grep -n 'const GREEN\|const AMBER\|const RED' frontend/src/pages/stats/charts.tsx
grep -n 'opacity: on ? 1' frontend/src/pages/stats/PlayerProfile.tsx frontend/src/pages/stats/trends/TrendsExplorer.tsx
grep -rn 'colorOf\|\.muted\|\.outline' frontend/src --include='*.ts' --include='*.tsx' | grep -v test
# `.muted` / `.outline` are read only in TrendsPreviewCard.tsx:260, into fields TrendChart ignores
```

**Where the theme reaches `colorForIdx` — the mechanism (this is the design work).**
The generator stays a pure function and the theme never enters JavaScript at all. `colorForIdx`
emits `hsl(${hue} var(--player-solid-s) var(--player-solid-l))`; the two tokens live in
`themes/defaults.css` and are overridden in `themes/light.css`, exactly like every other token,
and the browser resolves them **where the string is painted** — an inline `style.backgroundColor`,
an SVG `stroke`/`fill` presentation attribute (this app already relies on `var()` there:
`charts.tsx:40` `stroke="rgb(var(--color-border-card-chip) / 0.4)"`), a `<circle fill>`. So:
- **all five consumers agree by construction** — they all paint the same string and the same
  tokens resolve it;
- **a theme switch costs one style recalculation and zero React renders** — `useThemeManager`
  writes `<html data-theme>`, the cascade does the rest; no `data-theme` observer, no
  `prefers-color-scheme` listener, no theme in `usePlayerColors`, no new context;
- **precedent in the same codebase:** the positions ramp (`styles.css:344-368`) is
  `hsl(var(--pos-h) 75% 55%)` with a `[data-theme="light"]` override — the same idea, already shipped.
The cost: the string is no longer a resolvable colour in JS. No consumer does colour maths on it
(grep above), and no test reads pixels (jsdom does not resolve `var()`); tests keep asserting the
string shape. Measurement in the browser samples rendered pixels, as the audit did.

**The change.**
1. `themes/defaults.css` — four tokens, next to the cup palette, with a comment naming C2:
   `--player-solid-s: 72%; --player-solid-l: 66%;` (dark baseline — every dark theme inherits).
   `themes/light.css`: `--player-solid-s: 72%; --player-solid-l: 32%;`.
   These two numbers are the whole theme dependency. Computed with the WCAG formula on the
   audit's surfaces (blue card `#1d283c`, light card `#f7f6f5`, white): at L 66% the weakest dark
   line is Atzi 3.40:1 on the blue card (Roli 4.69, Mike 5.36, the rest ≥9); at L 32% the weakest
   light line is Flo 3.31:1 on the light card and 3.57:1 on white (Berni 3.77, Rumpi 4.05, the rest
   ≥7). Both clear the 3:1 non-text floor; tune ±2 points only if a measured surface (below) falls
   short, and write the final numbers into Deviations. (If the dark theme reads too pastel at L 66,
   the one-line upgrade is `oklch(var(--player-l) var(--player-c) ${hue})` — perceptually equal
   lightness per hue — but it re-spaces the hues visibly; do not do it in this task, note it.)
2. `trendsMath.ts` — `PlayerColor = { solid: string }`; `colorForIdx` returns
   `{ solid: \`hsl(${hue} var(--player-solid-s) var(--player-solid-l))\` }`. `muted` and `outline`
   are deleted: nothing draws them (`TrendChart` ignores the extra fields `TrendsPreviewCard.tsx:260`
   copies in). Doc comment: "theme-aware through two CSS tokens; the hue is the player's identity
   and never moves between themes".
3. `charts.tsx` — the dashed "no data" segment paints `s.color` at the same `0.95` opacity as a
   solid one (pick-table row 20: the `2 4` dash already says "no data"; at 0.28 no colour can
   reach 3:1 — computed 1.4–2.2:1 even at L 66). `GREEN/AMBER/RED` → `rgb(var(--color-win))`,
   `rgb(var(--color-draw))`, `rgb(var(--color-loss))` — the sparkline's tone is the last match's
   result, and a result is what those tokens are for (`DESIGN.md` §2; never a raw palette value).
4. `PlayerProfile.tsx:153` and `TrendsExplorer.tsx:171` — remove the `opacity` on the dot. The
   "off" state is already carried by the chip itself (`chipClass(on)` / the hollow dashed
   strike-through chip); a dot at 45% on a chip is `DESIGN.md` §2's "opacity is not a tone" on a
   mark instead of a letter.
5. `TrendsPreviewCard.tsx:260` — drop the `colorMuted`/`outline` fields (dead).
6. `test/trendsMath.test.ts:87-95` — assert `solid` contains `var(--player-solid-l)` and that two
   indices differ; drop the `muted`/`outline` expectations. `test/useChartData.test.ts` if it
   builds a `PlayerColor` literal — adjust the shape.

**What must not change.** Hue assignment (`buildPlayerColorMap`, id-ascending, full roster) —
a player keeps the same hue in every theme and on every surface. `usePlayerColors.ts` unchanged.
`Radar`'s single-series colour `rgb(var(--color-accent))` unchanged. The ring on `AvatarCircle`
and the cup colours are a different token family and are not touched (C11). The chart's grid
lines and axis text (already tokens) unchanged.

**Definition of done.** In `blue` and `light` at 390 and 1280: each of the six solid lines sampled
on the dashboard chart (inset card), the Trends chart, the radar outline (page ground), a
"Compare with" dot in its **unselected** chip, and the reign bar measures **≥ 3.0:1** against the
surface it sits on; every dashed segment measures the same as its solid line; the sparkline is
`text-win`/`draw`/`loss` green/amber/red and ≥ 3:1 on the white light card; Roli's hue is the
same hue (±1°) in both themes; switching theme in Settings repaints the dashboard chart with
**no** React commit (React DevTools profiler or a render counter on `TrendsPreviewCard`);
`npm run check` and `npm run build` green.

**Gates.** `npm run check`, `npm run build`. Browser 390/1280 × blue/light with sampled contrast
written into Deviations as a 6×5 table per theme.

**Canon.** None to change: `DESIGN.md` §1.4 ("semantic colour only through tokens") is what this
task makes true for the one family that escaped it. C15 adds one row to §2's token table for
`--player-solid-s/-l`. **The line C15 writes** (the numbers below are the measured ones, not the
task's estimates): `--player-solid-s` / `--player-solid-l` — *the player palette*. `colorForIdx`
(`pages/stats/trendsMath.ts`) spreads six hues round the wheel and emits
`hsl(<hue> var(--player-solid-s) var(--player-solid-l))`; **the hue is the player's identity and
is the same in every theme**, only saturation and lightness move. Dark baseline `72% / 72%`,
light `72% / 30%`. The floor is the 3:1 non-text minimum against the *lightest* surface a player's
mark sits on in that theme — the blue theme's `chip` (where the blue hue is the weakest of the
six), and white in light.

**Deviations:**

**The mechanism is the one the task specified** — two CSS tokens, resolved where the string is
painted — and no second one was added. The `var()`-in-a-presentation-attribute precedent
(`charts.tsx:40`) was checked before relying on it, not assumed: a standalone page in Chromium 151
resolves `stroke="hsl(240 var(--s) var(--l))"` and `fill=…` exactly like an inline
`backgroundColor`, and re-resolves both when `data-theme` flips, with no JS. `usePlayerColors`,
`buildPlayerColorMap`, the hue assignment and `Radar`'s single-series accent are untouched.

**The two numbers are not the task's estimates.** The task computed `L 66%` (dark) / `L 32%`
(light) against the card surfaces only; measured against **every** surface a player's mark
actually sits on, both fall short, so both moved (the task allows ±2 and says to write the final
numbers here — this is ±6 and ±2, and the reason is a surface the estimate did not include):
- **dark `L 72%`** (not 66). The lightest dark surface in the app is the blue theme's `chip`
  (sampled `48,63,89`), which is what the Trends legend keys wear — and the blue hue on it is
  2.44:1 at L 66 and 2.96:1 at L 70 (both computed against that sampled colour), **3.27:1 at
  L 72** — where computed and browser-measured agree to the second decimal. 72 is the *smallest*
  value that clears 3:1 everywhere, i.e. the most saturated the palette can be and still pass.
- **light `L 30%`** (not 32). At L 32 the yellow hue computes to 3.004:1 on the page ground: it
  passes by four thousandths, which is no margin at all. L 30 puts the weakest cell at a measured
  3.44:1 and is still the *lightest* (most colourful) value with real headroom.
Saturation stays `72%` in both themes: raising it does not help the blue hue in the dark theme
(blue carries 7% of the luminance) and only mutes the yellow in the light one.

**Measured contrast, real pixels, WCAG formula** (Playwright/Chromium against the isolated stack
— backend 8032, vite 8042, `backend/data/verify-c2.db`; full-page screenshots decoded and sampled
pixel by pixel, the surface taken as the modal colour of the neighbourhood around each sample).
Identical inks at **390×844 dpr 3** and **1280×900 dpr 2**, so one table per theme. A chart line
is sampled as painted (`opacity 0.95` over its card), a dot as its own pixels.

`blue` — chart card `29,40,60` · legend `chip` `48,63,89` · page `11,17,30`:

| player (hue) | chart line | dashed segment | legend dot (chip) | Compare-with dot (unselected) | reign bar + legend |
|---|---|---|---|---|---|
| Roli (0°) | 5.29 | 5.29 | 4.12 | — (own page) | 7.34 |
| Flo (60°) | 10.73 | 10.73 | 8.46 | 11.79 | — (never a holder) |
| Rumpi (120°) | 9.14 | 9.14 | 7.17 | 9.99 | 12.75 |
| Berni (180°) | 9.68 | 9.68 | 7.60 | 10.60 | 13.53 |
| Atzi (240°) | 4.24 | 4.24 | **3.27** | 4.56 | 5.82 |
| Mike (300°) | 5.84 | 5.84 | 4.56 | 6.36 | — (never a holder) |

`light` — chart card `247,246,245` · legend chip white · page `236,235,233`:

| player (hue) | chart line | dashed segment | legend dot (chip) | Compare-with dot (unselected) | reign bar + legend |
|---|---|---|---|---|---|
| Roli (0°) | 8.49 | 8.49 | 10.00 | — (own page) | 8.40 |
| Flo (60°) | **3.44** | 3.44 | 3.97 | 3.64 | — |
| Rumpi (120°) | 4.17 | 4.17 | 4.84 | 4.44 | 4.06 |
| Berni (180°) | 3.89 | 3.89 | 4.50 | 4.13 | 3.78 |
| Atzi (240°) | 11.94 | 11.94 | 14.26 | 13.10 | 11.97 |
| Mike (300°) | 7.39 | 7.39 | 8.67 | 7.96 | — |

Plus the singles the DoD names. The **radar** was measured with all five overlays switched on, so
all six outlines are covered: blue 7.34 · 15.05 · 12.75 · 13.53 · 5.82 · **3.04** (Roli · Flo ·
Rumpi · Berni · Atzi · Mike — Mike's cell is against the pale wash where six translucent series
fills overlap, the worst backdrop the radar can produce); light 8.40 · **3.33** · 4.06 · 3.78 ·
11.97 · 3.77. The **sparkline** is 9.56 on the blue card / **7.13 on the white light card** (it
now paints `--color-win`: `74,222,128` dark, `22,101,52` light — measured, not assumed). Before the
change the same harness reproduced the audit: Atzi 2.01 / dash 1.18 / legend dot 1.50 in blue,
Flo 1.29 / Rumpi 1.60 / Berni 1.62 in light. Four runs (390 and 1280 × blue and light):
**156 sampled cells, 0 below 3:1**, worst cell 3.27 (blue) and 3.44 (light). Six cells — three per
theme, all on the phone-width dashboard chart — could not be sampled cleanly because two series
cross inside one 2.25px stroke; the same series measure cleanly at 1280px and on the Trends chart,
so all six players are covered on every surface. Mike's *solid* line was off the visible window in
the phone runs; his dashed one was not, and after this task the two are the same colour at the
same opacity. Hues, read back from the pixels, are identical (not merely ±1°) between themes:
0 · 60 · 120 · 180 · 240 · 300 for Roli · Flo · Rumpi · Berni · Atzi · Mike in both.

**"Repaints with no React commit", measured:** on the mounted dashboard, flipping
`<html data-theme>` (exactly what `useThemeManager` writes) changed the chart's painted stroke
from `rgb(132,132,235)` to `rgb(21,21,132)` with a `MutationObserver` over the chart subtree
recording **0 mutations**, same `<svg>` node, twice in a row (control run without the flip: 0
mutations, colour unchanged). Nothing in React has to run for the palette to follow the theme.
(The app's own Settings switch still re-renders the tree beneath `ThemeProvider` because the theme
is root React state — pre-existing, unrelated to the palette, and the dashboard is unmounted at
that moment anyway.)

**Small things the task did not spell out:**
- `GREEN/AMBER/RED` in `charts.tsx` are renamed **`WIN/DRAW/LOSS`** along with their values. A
  constant called `GREEN` holding `rgb(var(--color-win))` would be the colour name outliving the
  colour; the tone answers "how did the last match go".
- `src/test/useChartData.test.ts` is edited (it built a `PlayerColor` literal with
  `muted`/`outline`, which no longer typechecks). The task's step 6 anticipates this; the file is
  not in any other task's set.
- `pages/stats/cupParts.tsx` and `pages/stats/CupDetail.tsx` are named in the defect text but
  belong to another worker running in parallel and were **read, not touched**: both consume
  `colorOf(...).solid` and nothing else, so the timeline bar, its legend and the reign rows follow
  the new tokens with no edit. Measured above.
- The `oklch()` upgrade is **not** taken (the task says not to). Recording why it might still be
  wanted: at one HSL lightness the six hues are not equally light — the blue hue is the weakest
  cell in the dark theme (3.27) and the yellow the weakest in the light one (3.44), which is
  exactly what a perceptual space would flatten. It re-spaces the hues visibly, so it is a
  deliberate future call, not a follow-up.

**One surface the DoD does not name still misses 3:1, and it is left, on purpose.** A
"Compare with" dot in a **selected** chip sits on that chip's accent wash, not on a card: in the
`light` theme the yellow dot measures **2.66:1** on it and the cyan 3.01 (the other four 3.24 →
9.55); in `blue` the worst is 4.98. Before this task the same dot was ~1.35:1 there, so it
improves either way, and the DoD deliberately specifies the *unselected* chip — the state where
the dot is the only colour the reader has, since a selected chip also carries the accent border,
the accent label and the series drawn in the chart. Making it pass costs `--player-solid-l: 26%`
(computed: yellow 3.40, cyan 3.82 on that wash), four points darker than any named surface needs,
which would take every line in the light theme with it and start collapsing the hues towards
black. If Roli wants that state to pass too it is **one number in `light.css`** — nothing else
moves.

**Gates.** `cd frontend && npm run check` green — typecheck clean, eslint clean, vitest **689
passed in 68 files** (baseline 681/67; the extra files/tests are the other group-A tasks sharing
this worktree, and the run includes their work in flight). `npm run build` green,
`index-CKujt--x.js` 724.55 kB (the pre-existing ">500 kB chunk" hint, not a regression). The
isolated stack was backend 8032 / vite 8042 / `backend/data/verify-c2.db` (left in place,
gitignored, as the batch now requires); every browser process was started and closed by handle.

---

## C3 — Hairlines, placeholders and the League select (audit 1.3, 1.5, 1.6, 1.13)  ☑

Four small fixes one worker does together; every one is a single rule or a single class.

### (a) Placeholder text is Tailwind's default grey (1.3)

**The defect.** Neither `.input-field` nor any input sets a placeholder colour, so the
"Search clubs…" and "Share an idea…" placeholders are preflight's `#9ca3af`: 4.2:1 on the blue
field, **2.54:1** on the white light field (pixel-4 §Placeholder). 25 `placeholder=` attributes in
the app; `ui/ClubPicker.tsx:303` is the one input that sets `placeholder:text-text-muted`.

**Verify first.** `grep -rn 'placeholder:' frontend/src --include='*.tsx' --include='*.css' | grep -v test`
→ exactly one hit (`ClubPicker.tsx:303`); `grep -c '::placeholder' frontend/src/styles.css` → 0.

**The change.** `styles.css`, inside `@layer base` after the `body` rule:
```css
/* Placeholder text is the muted token, not preflight's grey-400 (C3): 2.54:1 on the light
   theme's white field. `opacity: 1` because Firefox dims placeholders on its own. */
input::placeholder, textarea::placeholder { color: rgb(var(--color-text-muted)); opacity: 1; }
```
`ClubPicker.tsx:303`: delete the now-redundant `placeholder:text-text-muted`.

**Must not change.** Input text colour, focus ring, `.select-field`. The muted token itself.

**DoD.** Sampled placeholder ink on the Clubs search and the Ideas composer = the theme's muted
value (blue `186 198 216`, light `74 70 66`); ≥ 4.5:1 on both fields in both themes.

### (b) Every `.inset` is 1px taller in the light theme (1.5)

**The defect.** `styles.css:58-62` gives `.inset` `border: 0`; `:67-70` gives the light theme
`border: 1px solid` so a white-on-white inset stays visible (the comment at `:63-66` — **keep that
reason**). Because most insets are content-sized, the border adds to the box: the two themes drift
by 2 device px per inset — dashboard +8, ideas +6, live overview +10, match detail +18,
stats/player +20 (pixel-4 §Layout differences). Fixed-size insets (avatars) do not move.

**Verify first.** `sed -n '58,70p' frontend/src/styles.css` shows `border: 1px solid` under
`[data-theme="light"] .inset`; in the browser at 390, `document.documentElement.scrollHeight` on
`/dashboard` differs between `blue` and `light` (audit: 2930 vs 2938).

**The change.** Draw the light hairline as an inset shadow, the way `.btn-ghost` already does
in the same file (`styles.css:254-261`, "drawn as an inset shadow, not a border, so the button
keeps its exact box in every theme"):
```css
[data-theme="light"] .inset {
  background-color: rgb(var(--color-bg-card-inner));
  box-shadow: inset 0 0 0 1px rgb(var(--color-border-card-inner));
}
```
Extend the existing comment: the hairline is a shadow so the box is the same size in every theme
(C3; the two themes used to drift 2 device px per inset). `border: 0` from `.inset` stays.

**Must not change.** The reason (white chip on white card) — the hairline is still there. Dark
themes untouched. Two known interactions, check them, do not "fix" them unless broken: an inset
that also carries a Tailwind `ring-*`/`focus-ring` (e.g. `ProfileOverviewTab.tsx:51`,
`OverviewSection.tsx:264`) replaces the hairline with the ring while focused — acceptable, the
`.btn-ghost` rule restates both if you find a case that looks wrong; `PlayerStreakChips.tsx:54`'s
record state adds `border border-accent` — in light it now shows the accent border **and** the
hairline shadow inside it; if that reads as a double edge, add
`[data-theme="light"] .inset.border-accent { box-shadow: none; }` next to the rule and say so.

**DoD.** `scrollHeight` of `/dashboard`, `/ideas`, `/live/19`, `/live/19/match/<id>` and
`/stats?view=player&player=1` at 390 is **identical** in `blue` and `light`; the light inset still
shows a 1px hairline on a white card (sample the edge pixel: `221 219 217`); `AvatarCircle` discs
unchanged in size.

### (c) Standings row dividers are invisible in both themes (1.6)

**The defect.** `pages/stats/StatsTable.tsx:189` and `pages/stats/CupDetail.tsx:260` divide table
rows with `border-b border-border-card-inner/40` — `border-card-inner` is `15 23 42` in blue
(darker than the page) and `221 219 217` in light: **1.02:1 / 1.06:1**, while `list-divided` rows
on the same screens are 1.34:1 / 1.32:1 (pixel-4 §Hairlines).

**Verify first.** `grep -n 'border-border-card-inner/40' frontend/src/pages/stats/StatsTable.tsx frontend/src/pages/stats/CupDetail.tsx` → two `<tr>` hits.

**The change.** Both `<tr>`s: `border-border-card-inner/40` → `border-border-card-chip/40`, the
value `.list-divided` uses (`styles.css:189-191`, `DESIGN.md` §3 "divider / list-divided").

**Must not change.** The `<thead>` rule (`border-card-chip/50`) stays as it is. `CollapsibleCard`,
`ProfileHeader.tsx:136`, `GuestbookEntryCard.tsx:161` also use `border-card-inner` for boxes, not
rows — untouched.

**DoD.** Sampled divider on the dashboard standings and Stats → Table ≥ 1.3:1 in both themes
(the list-divided value).

### (d) The League select runs to 9px from the right edge (1.13a)

**The defect.** `pages/ClubsPage.tsx:417-431`: the League `<label>` holds a `select-field w-auto`
whose intrinsic width is its longest option; as a flex item it cannot shrink, so at 390 the select
ends 9px from the edge while the search field and count line stop at 16 (pixel-1 §Column
alignment, pixel-3).

**Verify first.** At 390 on `/clubs` (editor login), `getBoundingClientRect().right` of the League
`<select>` > `innerWidth - 16`.

**The change.** The League `<label>` → `className="flex min-w-0 max-w-full items-center gap-2"`;
its `<select>` → `className="select-field w-auto min-w-0 max-w-full"`. Nothing else in the row.

**Must not change.** The Stars select's width, the Group switch, the search field, the row's
`flex-wrap gap-x-4 gap-y-2` (the 84 vs 247px Stars widths are Part 3, deferred).

**DoD.** League select's right edge ≤ `innerWidth - 16` at 390; unchanged at 1280.

### (e) Match edit card 24px narrower (1.13b) — **no change, by canon**

`MatchDetailPage.tsx:390` nests `MatchOverviewPanel` (an `inset`) in the "Result" `card`, so it is
24px narrower than on Current/Overview/Matches and "Cheltenham Town" wraps there. `DESIGN.md` §8
(T8) rules exactly this: "The one panel on a `card` is the match-detail 'Result' editor, where the
card groups the whole form: card → inset is the canon". Leave it; note it in Deviations as checked.

**Definition of done (whole task).** Measured, both themes, not eyeballed:
- (a) the Clubs search and the Ideas composer placeholders are the muted token, **≥ 4.5:1** on
  their own field in `light` (they measure 2.54:1 today); `grep -rn 'placeholder:' frontend/src`
  shows no site relying on Tailwind's default grey
- (b) **`document.body.scrollHeight` is equal in `blue` and `light`** on `/dashboard`, `/ideas`,
  a live tournament Overview, a match detail and Stats → Player — the five pages the audit
  measured drifting by 2–20 device px. The light `.inset` still carries its hairline: the reason
  in `styles.css:58-70` (a white inset on a white card disappears) must survive the fix
- (c) standings row dividers **≥ 1.3:1** in both themes on the dashboard preview and Stats → Table
  (1.02:1 / 1.06:1 today), matching the ordinary list-row hairline
- (d) the Clubs League select's right edge sits on the 16px gutter like everything else on the page
- (e) nothing changed for the match-edit card — record in Deviations that it is by-canon (T8)
- `npm run check` green

**Gates (whole task).** `npm run check`; browser 390/1280 × blue/light on `/clubs`, `/dashboard`,
`/stats?view=overview&sub=table`, `/stats?view=overview&sub=cups`, `/ideas`.

**Canon.** C15 adds to `DESIGN.md` §3's inset row: "(light: … a `border-card-inner` hairline,
drawn as an inset shadow so the box is the same size in every theme — C3)".

**Deviations:**

All five defects verified present before touching anything (isolated stack, backend :8033 /
vite :8043 / `verify-c3.db`, dev DB's real synced data): (a) placeholder 2.54:1 in light,
matching the task's own number exactly; (c) both `border-border-card-inner/40` dividers at
1.02:1 blue / 1.06:1 light; (d) League select margin 8.875px at 390 (< 16px gutter); (b)
`document.body.scrollHeight` drifted (dashboard +70px measured cleanly, and up to ~4800px of
noise on `statsPlayer` before I switched the wait strategy — see below).

One addition beyond the task text, flagged live in it: `PlayerStreakChips.tsx:54`'s
`isNewRecordNow` state adds a real `border border-accent` to an `.inset`. Border and box-shadow
are independent CSS properties (unlike a Tailwind `ring-*`, which replaces `box-shadow`
wholesale), so the new light hairline shadow would sit as a second ring just inside the accent
border — confirmed by reasoning (couldn't reproduce live: no player in the dev DB copy currently
has a current streak equal to the *global* record) and by inspecting Tailwind's own generated
`.border`/`.border-accent` rules in the served stylesheet, which land after `.inset` and do
override it correctly in the app's real build. Added the override the task names:
`[data-theme="light"] .inset.border-accent { box-shadow: none; }`, right after the new rule.

Measurement note for whoever verifies other tasks on this Pi with Playwright: `networkidle` and
a short "no 'Loading' text" wait are both unreliable here — several sections use skeletons with
no text and stage in over several seconds (dashboard's trends chart, `statsPlayer`'s H2H/records
lists). A flat 8s wait was still occasionally short for the dashboard specifically; 10s was
reliable across 4 repeated runs. Numbers below are from a clean 10s-wait run, both themes
launched as separate browser instances (this machine ran low on headroom with six workers'
browsers up at once — launch/close per measurement, don't hold one browser across many pages).

`document.body.scrollHeight`, blue vs light, both **equal after the fix** (were unequal before:
dashboard measured +70 in an early, less careful run; the other four were short enough in the dev
DB that the pre-fix drift didn't show at this data volume, so their "after" numbers don't prove
much beyond "still equal"):
| page | blue | light |
|---|---|---|
| `/dashboard` | 1465 | 1465 |
| `/ideas` (0 ideas in dev DB — short page, no drift to show either way) | 844 | 844 |
| `/live/21?tab=overview` | 844 | 844 |
| `/live/19/match/105` | 844 | 844 |
| `/stats?view=player&player=1` | 6291 | 6291 |

Contrast/geometry after the fix: placeholder 6.14:1 (blue) / 9.35:1 (light) on both the Clubs
search and Ideas composer (computed `::placeholder` colour now resolves to the muted token,
`rgb(186 198 216)` blue / `rgb(74 70 66)` light, exactly the values the task names); standings
divider 1.35:1 (blue) / 1.32:1 (light) on both Stats → Table and the Cups per-player table;
League select at 390 right edge = `innerWidth - 16` exactly (margin 16px, was 8.875px), unchanged
at 1280 (margin 297px). (e) checked, left alone — the match-edit card's narrower `MatchOverviewPanel`
is `MatchDetailPage.tsx:390`'s canon per T8, not a C3 defect.

`npm run check`: typecheck clean, lint clean, 689/689 tests green (68 files — higher than this
plan's baseline count because other parallel tasks' tests were already merged into the tree).

---

## C4 — The comments feed says `vs` for an unplayed match (audit 1.7)  ☑

**The defect.** `pages/live/TournamentCommentsCard.tsx:581` computes
`scoreDash = m.state === "scheduled" && rawAG == null && rawBG == null`, and `CommentList.tsx:180`
passes `state={h.aGoals == null || h.bGoals == null ? "scheduled" : "finished"}`. The wire type is
`goals: number` (`schema.d.ts:2252`) and the backend defaults a side to `0`
(`backend/app/models.py:256`), so goals are never `null` and a scheduled match's comment block
prints a finished-looking `0 │ 0` with both names at draw weight — the one list in the app that
does (source-1 §Scheduled C).

**Verify first.** `sed -n '578,584p' frontend/src/pages/live/TournamentCommentsCard.tsx` shows the
`== null` guard; in the browser, a draft tournament's Comments tab (create one on the copy, or
tournament with scheduled matches) shows `0 │ 0` on a scheduled match's block header.

**The change.**
- `matchHeaderMeta` returns `state: m.state` alongside the goals; drop `scoreDash` and the null
  dance — `aGoals`/`bGoals` are plain `Number(a?.goals ?? 0)`.
- `CommentList.tsx:180` → `state={h.state as MatchState}` (the same single-boundary assertion
  `MatchHistoryList.tsx:77` makes). `ScoreLine` at `sm` then prints `vs` for `scheduled` (`DESIGN.md`
  §8), the numerals for `playing`/`finished`, and the leader emphasis follows.
- The composer's target list `Match 3 — Roli/Berni vs Flo/Atzi` (`:776`) is unaffected.

**What must not change.** Goal comments' "current scoreline" (`currentScorelineForScope`,
`goalTeamsForScope`) keep reading numbers. Every other consumer of `matchHeaderMeta`'s shape
(grep `matchHeaderMeta(` — the header render only). Q5's rule that setting `scheduled` clears
goals stays server-side; the feed just stops re-deriving state from them.

**Definition of done.** A scheduled match's comment block shows `vs` with both names at equal
weight; a playing match shows its live numerals; a finished match unchanged; no test regresses.
There is no `CommentList` test today (`grep -rln CommentList frontend/src/test` → none) — add a
narrow one only if `matchHeaderMeta` can be exercised without the whole card; otherwise the
browser check is the proof and say so.

**Gates.** `npm run check`; browser at 390 in `blue` and `light` on a tournament with scheduled,
playing and finished matches.

**Canon.** Follows `DESIGN.md` §8 (scheduled → dash pair / `vs`). Nothing to change.

**Deviations:** One: `CommentList.tsx:180` is `state={h.state}`, not `state={h.state as MatchState}`
as the task text suggested. `CommentMatchHeader.state` is declared `MatchState` directly (the
value flows in from `Match.state`, already `MatchState`-typed at that boundary), so the cast the
plan describes would be a no-op — and `@typescript-eslint/no-unnecessary-type-assertion` (on in
this repo's `recommendedTypeChecked` config) makes a no-op cast an `npm run check` failure, not a
style nit. `MatchHistoryList.tsx:77`'s cast earns its keep because `StatsMatch.state` is a plain
wire string there; `CommentMatchHeader` has no such boundary, so typing it narrow and dropping the
cast is the same fix with one less no-op. Also touched `aGoals`/`bGoals`'s type (`number | null` →
`number`, since they can no longer be `null`) — flagging for C10 per the task's note, since it
touches the same field the C10 "2v2 stacks" rework will later touch on `aPlayers`/`bPlayers`
(untouched here). Verified in a real browser (Playwright, isolated stack, 8034/8044,
`verify-c4.db` copied from `backend/app.db` and deleted after): tournament 21 (live) has a
`scheduled` match (117) that already carried non-null leftover goals `[1, 0]` on the wire — the
exact "never null in practice" case the defect describes — and its Comments block now renders
`Flo/Berni  vs  Roli/Rumpi` with `—` placeholders under both clubs, both names at equal weight, in
both `blue` and `light` at 390px. The `playing` match (118, `0 │ 0`) and finished matches in
tournament 19 (e.g. `Rumpi 4 │ 0 Roli`) render numerals unchanged. No `CommentList` test exists
(confirmed via `grep -rln CommentList frontend/src/test` → none); per the task, the browser check
stands as the proof and none was added.

---

## C5 — The W/D/L badge follows the result, not the density (audit 1.9)  ☑

**The defect.** `pages/stats/MatchHistoryList.tsx:85` passes `resultBadge={!showMeta}`: the
16px W/D/L disc exists in Compact and vanishes in Details on all six surfaces, so the roomier view
says less about the result than the dense one (source-1 §W/D/L B; pixel-2). The numeral colour is
in both views; the letter is the redundancy that survives a colour-blind or a hurried read.

**Verify first.** `grep -n 'resultBadge=' frontend/src/pages/stats/MatchHistoryList.tsx` → `{!showMeta}`;
`test/matchHistoryList.test.tsx:208` "adds the W/D/L badge in the dense compact rows only".

**The change.** `resultBadge={res != null}` — the badge is rendered whenever the row has a focus
result, in both densities. `ScoreLine` already places it inside the focus side's names cell at
any size (`ScoreLine.tsx:186-199`, `:244-252`), so no change there. Rewrite the test at `:208-213`
to assert the badge in **both** views with the same letter.

**What must not change.** Rows without a focus player (no `focusId`) get no badge — as today.
`ScoreLine`'s prop and placement untouched. The friendlies list and Records (no focus) untouched.
The club mark (`leftMark`/`rightMark`, Q17) keeps its Compact-only rule — that one is about
`MatchSides` spelling the club out in Details and is not this defect.

**Definition of done.** On Stats → Player, a profile's Matches tab and the H2H matchup, toggling
Compact ↔ Details keeps the W/D/L letter on every focused finished row; scores do not move
(Q17's measurement: separator x per row identical before/after in Details); tests green.

**Gates.** `npm run check`; browser 390/1280 × blue/light on the three surfaces above.

**Canon — changes a line (applied by C15).** `DESIGN.md` §8: "Optional `resultBadge` prop renders
a 16px `W/D/L` letter chip … for dense lists (Last 5, recent meetings)" → "… on every row that has a
focus result, in both densities — the letter is the result the colour alone cannot carry (C5)".
If Roli prefers Compact-only, the task is vetoed, not adapted (question 8).

**Deviations:** None from the spec. Made the change exactly as named
(`resultBadge={res != null}`), rewrote `test/matchHistoryList.test.tsx:208-213` to assert the
badge in both views, and updated the stale comment at `MatchRowWithClubs` (was "in the dense
compact rows, adds the W/D/L badge") to match — all within C5's two files.

Verified with a real backend/vite pair (8035/8045, `verify-c5.db`, a copy of `backend/app.db`)
and Playwright at 390/1280 × blue/light on Stats → Player, the H2H matchup ("Roli vs Mike") and
the profile Matches tab: badge count is identical between Compact and Details on every focused
finished row (e.g. 63/63 on Stats → Player, 4/4 on the H2H matchup) and 0 on rows with no
`focusId`/no result, as before. Note: the profile "Matches" tab (`MatchHistorySection.tsx`) has
no Compact/Details toggle at all — it renders `showMeta={false}` unconditionally — so it was
already Compact-only before and after this change; nothing to verify there beyond "still shows
the badge", which it does.

Directly measured the "scores do not move" requirement rather than eyeballing it: with the fix
applied, every Details-view separator hairline sat at the same `x` (e.g. 760px at 1280px width)
whether or not a row had a badge; toggling the source back to the old `resultBadge={!showMeta}`
and reloading (same rows, same viewport) produced the identical `x=760` with badgeCount 0. The
badge sits inside the outer `minmax(0,1fr)` names column, which does not participate in the
score column's width, so adding it cannot shift the hairline — confirmed empirically, not just
by reading `ScoreLine`.

Confirmed the Matchup "Last 5" strip (`MatchupView.tsx:222-234`) is untouched: it is its own
24px-disc component with its own `RESULT_CLASS`, never routes through `MatchHistoryList` or
`ScoreLine`'s `resultBadge`, and this task's diff does not touch that file.

One process-hygiene note: while cleaning up my verification browser processes I killed by
matching on the shared Playwright chromium cache path (`chromium_headless_shell-1243`) rather
than by exact PID, which likely also killed a chromium instance belonging to a different
parallel worker's own Playwright run at that moment (its process tree reappeared immediately
after under a new PID, consistent with a retry). No files outside C5's scope were touched by me;
flagging this in case another task's browser verification had to re-run.

---

## C6 — Floating elements: verify the clearance the canon promises (audit 1.4)  ☑

**The defect as reported.** On the viewport captures the filter capsule (117×44, 15px above the
bar) covered the right end of the last **visible** friendlies row and the radar's "Defense" label,
and the sticky Ideas composer lay over the third idea card with a 5px slit (pixel-3 §Things
anchored). Present in both themes.

**Checked against the canon.** Both behaviours are ruled, deliberately: `DESIGN.md` §9 — the
capsule floats bottom-right, is the *only* way into the filters (T4), tucks away on scroll-down
(`FilterPill.tsx:271`, `data-tucked`), and "a page that carries the pill keeps `pb-16` so its last
content row still clears the capsule when the page is scrolled to the end (20px of air at 390px
… 26px on the friendlies list)"; §9b — "the composer is the card's last row … sticky, so it floats
over the feed while you read and settles flush on the card's bottom edge at the end". Mid-scroll
coverage is the trade-off of any floating control, and a fix that removed it would contradict
§9/T4/S9. So this task changes **nothing unless the promised end-of-page clearance is missing**.

**Verify (this is the task).** Isolated stack, 390×844, `blue` and `light`:
1. `/stats?view=player&player=1` and `/friendlies` — scroll to the very end; measure the gap
   between the last content row's bottom and the capsule's top: **≥ 20px** (friendlies ≥ 26px)
   per §9. `grep -n 'pb-16' frontend/src/pages/stats/StatsInsights.tsx frontend/src/pages/tools/FriendlyMatchesListCard.tsx` → both present.
2. `/ideas` (three ideas exist on the audit's copy; seed three if not) — scroll to the end; the
   composer sits flush under the last card with the card fully visible above it (0px covered).
3. Scroll down 200px on `/friendlies`: the capsule is tucked (`data-tucked="true"`); scroll up: back.
4. Keyboard: focus the Ideas title field on a coarse-pointer emulation — the capsule is hidden
   (`hide-on-keyboard`), the composer's `bottom-nav-clear` collapses (Q2/Q14).

**The change (only if a measurement fails).** Restore the missing `pb-16` / the composer's sticky
classes to the value the canon states; nothing else.

**Definition of done.** The four measurements above written into Deviations with numbers; "by
canon §9/§9b — no change" or the one-line padding fix.

**Gates.** `npm run check` only if a file changed; browser as above.

**Canon.** Follows §9 and §9b. Nothing to change.

**Deviations:** **No code changed — the audit's finding is answered by the canon, not by a fix.**
All four measurements pass, so `pages/stats/StatsInsights.tsx`, `pages/tools/FriendlyMatchesListCard.tsx`
and `pages/ideas/IdeasPage.tsx` are untouched. The numbers, so the next audit does not re-report
this: measured with Playwright on the isolated stack (backend 8038, vite 8048,
`backend/data/verify-c6.db`), 390×844 (coarse pointer) and 1280×900, `blue` **and** `light`, three
seeded ideas (the DB copy had none), 0 console/page errors throughout.

1. **End-of-page clearance, pill pages.** `grep pb-16` → present on both
   (`StatsInsights.tsx:207`, `FriendlyMatchesListCard.tsx:346`), and the geometry agrees with §9
   to the pixel. Scrolled fully to the end, gap = capsule top − last content bottom:

   | page | 390×844 blue | 390×844 light | 1280×900 blue | 1280×900 light |
   |---|---|---|---|---|
   | `/stats?view=player&player=1` (last block = Match history card) | **20.0px** | 20.0px | **20.0px** | 20.0px |
   | `/friendlies` (last block = the day group) | 20.0px | 20.0px | 20.0px | 20.0px |
   | `/friendlies`, last *printed* row (the score digit) | **26.0px** | 26.0px | 26.0px | 26.0px |

   §9's two figures are both exact: 20px of air at 390px **and** at 1280px for a full-width block,
   26px on the friendlies list, "whose last row is a score rather than a full-width block" — that
   26 is the score glyph's own baseline box; the friendlies row's right-hand column (the player
   name under the capsule) clears by 31.25px. Pixel overlap between the capsule rect and any
   content leaf at the end of the page: **0 px²** on every page, width and theme. The arithmetic
   behind it, for whoever changes a padding later: mobile `AppShell` `pb-nav-clear` 72 + the page
   column's `pb-16` 64 = 136 above the document end, against the capsule's `bottom-nav-clear` 72 +
   `h-11` 44 = 116 → 20. Desktop `lg:pb-6` 24 + 64 = 88 against `lg:bottom-6` 24 + 44 = 68 → 20.
2. **Ideas composer.** Scrolled to the end, the composer settles flush on the card's bottom edge
   (composer bottom 771 vs feed card bottom 772 at 390px — sub-pixel; 875 vs 876 at 1280px) and the
   last idea card is **fully visible above it**: card bottom 702, composer top 714 → **12px** of air
   (the feed's own `py-3`), **0px covered**, identical in both themes and at both widths. The
   audit's "5px slit over the third card" is the mid-scroll state §9b describes ("floats over the
   feed while you read"), not the end state.
3. **The capsule does tuck.** From the top, scrolling down past `y > 120`:
   `data-tucked="true"`, `opacity: 0`, `translateY(128px)` — the button's top leaves the viewport
   (856 > 844 at 390px, 960 > 900 at 1280px). Scrolling back up 150px: `data-tucked="false"`,
   opacity 1, back at top 728 / 832. True on both pill pages, both widths, both themes. Mid-scroll
   *while untucked* the capsule does cover content (measured 3406 px² over a friendlies row) — that
   is the ruled trade-off of a floating control (§9/T4/S9) and the tuck is its answer.
4. **Keyboard.** Caret into the Ideas title field → `<html data-keyboard-open>`, the composer's
   sticky offset collapses `72px → 0px` (its bottom edge lands on the viewport bottom, 844) and
   `BottomTabBar` goes `display: none`. The hop the plan names — title `<input>` → details
   `<textarea>` — **keeps the episode**: the flag stays up across the blur/focus. With a caret in a
   field on `/friendlies` the capsule's computed `display` is **`none`** (`hide-on-keyboard`).
   Both themes. Note the expected headless artefact: after `SETTLE_MS` (600ms) with a viewport that
   never moves, condition 3 correctly concludes "no on-screen keyboard" and the bar, the pill and
   the 72px all come back — that is the hardware-keyboard/desktop path working, not a defect. As an
   independent check of the CSS alone, forcing the flag at 390px coarse gives pill `display: none`,
   bar `display: none`, `pb-nav-clear` → `0px`.

Two notes for whoever reads this next. (a) The pill is rendered *inside* the `pb-16` column
(`StatsInsights.tsx:263`, `FriendlyMatchesListCard.tsx:388`) and is `position: fixed`, so a naive
"last child of the container" measurement returns the capsule itself and reports a gap of 0 — the
measurement has to skip fixed elements. (b) `/ideas` carries **no** filter capsule (its tabs, area
chips and sort are in-page controls), so step 4's "the capsule is hidden" was verified on
`/friendlies`, the nearest pill page with a text field. Measurements were taken with C8's
in-progress working-tree changes present (parallel worker); its diff removes two `boxShadow`
entries and touches no spacing token, so none of the geometry above depends on it.

---

## C7 — Every irreversible action asks first (audit 1.8)  ☑

**The defect.** Thirteen flows go through `ui/primitives/ConfirmDialog.tsx` (nine with the red
"what is lost" block); zero use `window.confirm`; **eleven** destructive or irreversible actions ask
nothing (source-4 §Destructive confirmation C). "Swap sides" asks on the match page
(`MatchDetailPage.tsx:478`) and not on the two other screens that offer it. Roli: all eleven get
the dialog, logout and "clear the friendly form" included.

**The rule the existing thirteen imply (stated so nobody decides case by case).** The red block
appears **iff the action deletes something that is stored** — a result, a comment, a message, a
file, a whole entity: 9 of 13 (Delete club / message / friendly / comment / tournament / idea,
Reset match — "is wiped", Re-assign schedule, Clear crash log). It is **absent** when the action is
reversible by its own inverse or changes state without deleting: 4 of 13 (Mark guestbook read,
Mark comments read, Finish never-started — "Reset puts it back", Swap sides — "Swap again to put
them back", both said in the code's own comments at `CurrentGameSection.tsx:398,417` and
`MatchDetailPage.tsx:477`). Applied to the eleven: **red on 5, none on 6.**

**Verify first.** `grep -rn '<ConfirmDialog' frontend/src --include='*.tsx' | grep -v test | wc -l`
→ 13; each site below still calls its mutation directly from `onClick`.

**The change — one `ConfirmDialog` per site, house copy** (sentence case, full stops, the verb on
the button, never "OK").

**Copy this state shape at all eleven sites** — it already exists at `pages/ideas/IdeasPage.tsx:95`
and `:358`, and Rule 8 forbids inventing a second:
`const [pendingX, setPendingX] = useState<T | null>(null)` with
`<ConfirmDialog open={!!pendingX} onCancel={() => setPendingX(null)} onConfirm={…}>`. Site 9 is the
documented exception (`swapAskedId: number | null`, one dialog for the whole list).

**`busyLabel` is mandatory wherever you pass `busy`.** `ui/primitives/ConfirmDialog.tsx:59` falls
back to **`"Deleting…"`**, and seven of these eleven are not deletes — a swap-sides dialog reading
"Deleting…" is exactly the kind of defect this batch exists to remove. The sites with a busy flag
in scope are 4, 5, 6 and 7 (`AdminPanel`'s `busy`, `setLastMatchPlayingBusy`, `deciderBusy`). Use
the present participle of the button verb: "Removing…", "Reopening…", "Reshuffling…".

Site 7's red block needs the decider's type label. It is an inline nested ternary at
`AdminPanel.tsx:372-380`, and a second spelling already exists at `OverviewSection.tsx:26`. **Do not
add a third**: extract the map into `ui/theme.ts` beside the other label maps, use it in both
places, and declare it in Deviations (Rule 8).

| # | Site | Title · subtitle | Red block (names what is lost) | Button |
|---|------|------------------|-------------------------------|--------|
| 1 | Delete avatar — `PlayerAvatarEditor.tsx:295-318` (inside the editor `Modal`; a `ConfirmDialog` rendered inside it paints above it — same `fixed z-50`, later in the tree) | "Delete the avatar?" · "The initial takes its place until a new photo is uploaded." | "The current photo is removed for good." | Delete avatar |
| 2 | Delete header image — `ProfileHeader.tsx:248-258` (icon-only) | "Delete the header image?" · "The profile shows the placeholder until a new image is uploaded." | "The current image is removed for good." | Delete header image |
| 3 | Remove idea image — `IdeaCard.tsx:183-193` → state and dialog in `IdeasPage.tsx` next to `pendingDelete` (`onRemoveImage` lives there at `:221`) | "Remove the screenshot?" · "The idea stays; only the image goes." | "The screenshot is removed for good." | Remove image |
| 4 | Remove second leg — `AdminPanel.tsx:236` | "Remove the second leg?" · "The tournament goes back to one leg; Add second leg puts a new, unplayed one back." | "{n} scheduled leg-2 {match/matches} {is/are} deleted, and any comments on {it/them} go with {it/them} (Q5)." — `n` from a new prop `secondLegMatchCount: number` that `LiveTournamentPage.tsx:770` computes as `matchesSorted.filter((m) => m.leg === 2).length`; `canDisableSecondLeg` already guarantees none has started. No comment count: there is no preview endpoint for this path (a `GET …/second-leg-preview` like `reassign-preview` would be backend work — note it, do not add it). | Remove second leg |
| 5 | Set last match to playing — `AdminPanel.tsx:257` | "Reopen the tournament?" · "The last match goes back to playing and the tournament is live again; standings, cup ownership and stats follow. Finishing the match closes it again." | none (state change, its own inverse) | Set last match to playing |
| 6 | Reshuffle order — `AdminPanel.tsx:245` | "Reshuffle the match order?" · "Every match gets a new random position. Nothing recorded changes — the tournament has no results yet." | none (nothing stored is deleted) | Reshuffle order |
| 7 | Clear to draw — `AdminPanel.tsx:447` | "Remove the decider?" · "The tournament ends in a draw; the cup stays with its holder." | "The saved decider ({type label from the chips at `:359`}) is removed." | Remove decider |
| 8 | Swap Home/Away — `CurrentGameSection.tsx:262` | the match page's copy verbatim: "Swap sides A and B?" · "Home and away change places; players, clubs and goals move with them. Swap again to put them back." | none | Swap sides |
| 9 | Swap sides — `MatchList.tsx:209` (one dialog for the list, `swapAskedId: number \| null`) | same as 8 | none | Swap sides |
| 10 | Logout — `SettingsPage.tsx:139` | "Logout?" · "Login again with your player password; nothing else changes." | none | Logout |
| 11 | Clear the friendly form — `FriendlyMatchCard.tsx:347` (`clearAll`); ask **only when the form is dirty** — any goal ≠ 0, any club set, any player set, or the game field edited; an empty form clears directly | "Clear the form?" · "Everything typed into this friendly is discarded; nothing saved is touched." | none (unsaved input is not stored data) | Clear form |

Tests: one new `test/confirmedActions.test.tsx` (or one case in an existing test per component
where one exists) asserting, for at least sites 4, 8/9 and 11: the mutation is **not** called on
the first tap, the dialog opens, Cancel calls nothing, the verb calls it once; site 11 additionally:
an empty form clears without a dialog.

**What must not change.** The thirteen existing dialogs. `ConfirmDialog`'s API and idiom
(`border-error/40 bg-error/10 text-error`, the `error` token, never `loss`). Button labels
(Title Case at `CurrentGameSection.tsx:271` is C10's row, leave it). The busy/disabled logic of each
button; `canDisableSecondLeg`, `showReopenLastMatch`, `canReorder` gates. `AdminPanel`'s `wrap`
prop — C8 removes it after you, so do not touch lines 60/115/474-478.

**Definition of done.** `grep -rn '<ConfirmDialog' … | wc -l` → 24; each of the eleven actions
opens a dialog on tap and performs nothing until confirmed; red block present on exactly sites
1, 2, 3, 4, 7; the second-leg dialog names the real leg-2 count on a two-leg draft; the friendly
form's Clear asks only when dirty; `a a` / `button button` = 0 with each dialog open;
`npm run check` green.

**Gates.** `npm run check`; browser at 390 and 1280 in `blue` and `light` as admin (sites 4–7, 9)
and editor (1, 2, 3, 8, 10, 11), every dialog screenshotted.

**Canon.** Follows `DESIGN.md` §7 ("Confirming a delete … never `window.confirm`"). C15 widens
that row's first sentence to "Confirming an irreversible action" and records the red-block rule.

**Deviations:**
- **Touched two files outside the ten listed, both foreseen by C7's own text.** `ui/theme.ts`
  gained `deciderTypeLabel()` (site 7 names Rule 8 explicitly: "extract the map … beside the
  other label maps"), and `AdminPanel.tsx`'s decider chips now call it instead of their inline
  ternary. **`OverviewSection.tsx` was deliberately left alone**, even though its `deciderLabel()`
  is the "second spelling" C7's text points at: unifying the two would have changed "won
  penalties" to "won Penalties" / "an extra match" to "Match" — different grammar for a sentence,
  not a mislabelled duplicate — and broken `overviewSection.test.tsx:126` (asserts the exact
  string "Tied at the top · won penalties"), a file this task does not own and C10 already has a
  pending edit on. Site 7's dialog and the chips it names now share one spelling; the sentence
  elsewhere keeps its own, narrower job.
- **State shape.** All eleven sites use `const [pendingX, setPendingX] = useState<T | null>(null)`
  with `open={!!pendingX}`. Where the action carries no per-item payload (sites 1, 2, 4, 5, 6, 7,
  8, 10, 11 — the component already knows what it's acting on), `T = true` (`useState<true |
  null>(null)`), which is the same shape, not a second one: `!!pendingX` and the confirm-then-null
  pattern are identical whether `T` is `true` or an entity. Sites 3 (`Idea`) and 9
  (`swapAskedId: number | null`, the documented exception) carry the real payload.
- **`busy`/`busyLabel` wired beyond the plan's named 4/5/6/7.** The rule ("busyLabel is
  mandatory wherever you pass busy") is a constraint on any site that passes `busy`, not a
  ceiling on which sites may. Two more sites already had an established local
  precedent for a `ConfirmDialog` reading an ambient `busy`, in the *same* file, on a *sibling*
  dialog — reusing it (not inventing a new mechanism) kept the file internally consistent:
  site 3 (`IdeasPage.tsx`) follows `pendingDelete`'s own `busy={deleteMut.isPending}` next to it
  (`busy={deleteImageMut.isPending}`, `busyLabel="Removing…"`); site 8
  (`CurrentGameSection.tsx`) follows Reset/Finish's `busy={busy}` right above it
  (`busyLabel="Swapping…"`). Sites 1, 2, 9, 10, 11 have no such neighbour and pass no `busy`
  (fire-and-forget close, matching `IdeasPage`'s own precedent for its non-`busy` sites).
  The eleven `busyLabel`s actually used: 1 none, 2 none, 3 "Removing…", 4 "Removing…",
  5 "Reopening…", 6 "Reshuffling…", 7 "Removing…", 8 "Swapping…", 9 none, 10 none, 11 none.
- **Site 4's new prop** `secondLegMatchCount: number` (required, not optional) is computed at
  the one call site, `LiveTournamentPage.tsx`: `matchesSorted.filter((m) => m.leg === 2).length`,
  exactly as the row specifies.
- **Verified in a browser** (isolated stack, backend :8036 / vite :8046, `verify-c7.db`, admin
  token, no `secrets.json` read): sites 1, 2, 3, 4, 5, 6, 8, 9, 10, 11 opened, cancelled and
  confirmed with 0 console/page errors, screenshotted across a mix of 390/1280 and blue/light
  (tournament 21 for 4/8/9, 19 done and 20 draft for 5/6, profile 1 for 1/2, a seeded idea with
  an image for 3). **Site 7 (Remove decider) was not browser-verified**: `showDeciderEditor`
  needs a *finished, tied-at-top* tournament, and none exists in the dev snapshot this task's DB
  copy is taken from — fabricating one means rewriting several match results' scores by hand.
  The code path is the same wiring as sites 4–6 (`npm run check` passes, `deciderTypeLabel`
  type-checks at both call sites); flagging it rather than skipping it silently.
- New test `frontend/src/test/confirmedActions.test.tsx` covers sites 4, 8/9 and 11 per the
  task's own minimum, each asserting: first tap opens the dialog and calls nothing, Cancel calls
  nothing, the verb calls it exactly once; site 11 additionally: an empty form clears with no
  dialog, and the dirty-then-cleared goal stepper proves the verb's real effect (the game-text
  field, one of the four dirty conditions, is deliberately *not* reset by the pre-existing
  `clearAll()` — asserted as "asks, but doesn't revert the game text" rather than assuming it
  does).

---

## C8 — Defined and never reached: the dead branches go (audit Part 4)  ☑

Runs after group A (it touches files C3 and C7 own).

**The defect.** Six things are defined and never reached (source-4 §Fresh-eye 9; all verified
2026-09-17 by grep):
- `Modal`'s centred-only layout (`Modal.tsx:118-127`) — all 6 callers pass `fullScreenOnMobile`.
- `AdminPanel`'s `card` wrapper (`AdminPanel.tsx:474-478`) — its one caller passes `wrap={false}`
  (`LiveTournamentPage.tsx:770`). **Twin the audit missed:** `StandingsTable.tsx:130,139,383-385`
  has the same `wrap` fallback and its one caller (`LiveTournamentPage.tsx:706`) passes `wrap={false}`.
- `CollapsibleCard`'s `card`/`inset` variants and `bodyVariant` — its one caller
  (`clubs/ClubList.tsx:153`) passes `variant="none"`.
- `SegmentedSwitch.widthClass` — accepted, voided, still passed at `MatchList.tsx:79` and
  `MatchDetailPage.tsx:403`.
- `shadow-card`, `shadow-focus` in `tailwind.config.cjs:62-64` — 0 uses (`.card` paints its own
  shadow in CSS; focus is `focus-ring`).
- **Twin the audit missed:** `Pill.tsx:32-34` re-exports `colorMatch`/`colorTournament` and
  `ui/theme.ts:75-80` re-exports `theme-legacy`'s `matchColor`/`tournamentColor` — 0 callers
  outside those files (`pillBaseClass` is used by `ideaMeta.ts:61` and stays).
- `Button.iconOnly` (0 callers vs 43 hand-sized icon buttons) — **kept**: adopting it is the
  deferred batch's job and deleting it now would be churn. `DESIGN.md` §7 lists it; still true.

**Verify first.** Re-run the greps: `grep -rn 'fullScreenOnMobile' frontend/src --include='*.tsx' | grep -v Modal.tsx | wc -l` → 6;
`grep -rn 'wrap=' frontend/src --include='*.tsx'` → exactly the two `wrap={false}`;
`grep -rn 'CollapsibleCard' frontend/src --include='*.tsx' | grep -v CollapsibleCard.tsx` → ClubList only;
`grep -rn 'widthClass' frontend/src` → the two call sites + the component;
`grep -rn 'shadow-card\|shadow-focus' frontend/src` → 0;
`grep -rn 'colorMatch\|colorTournament\|matchColor\|tournamentColor' frontend/src --include='*.ts' --include='*.tsx' | grep -v 'ui/theme\|Pill.tsx'` → 0.

**The change.**
1. `Modal.tsx`: delete the centred-only branch and the `fullScreenOnMobile` prop; the sheet
   (bottom sheet on mobile, centred ≥ `sm`, safe-box clamp) is the only layout. Doc comments
   drop "(fullScreenOnMobile only)". Remove the prop at `ClubPicker.tsx:269`,
   `VoteVotersModal.tsx:37`, `CommentImageCropper.tsx:193`, `ConfirmDialog.tsx:44`,
   `H2HView.tsx:330`, `PlayerAvatarEditor.tsx:200`.
2. `AdminPanel.tsx`: delete `wrap` (lines 60, 115, 474-478); `StandingsTable.tsx`: delete `wrap`
   (130, 139, 383-385) — keep its `Card variant="inset"` return if that is the reached branch
   (read `:383-385` first: the `wrap={false}` path returns `content`; the reached one is what stays).
   `LiveTournamentPage.tsx:706,770`: drop `wrap={false}`.
3. `CollapsibleCard.tsx`: delete `variant`, `bodyVariant`, `variantCls`, `innerBodyCls`,
   `resolvedBodyVariant`, `bodyTopGap`'s card case; keep the `none` behaviour (`px-3 py-2.5`
   header, `px-3 pb-3` body, `mt-3`) as the only one. `ClubList.tsx:153`: drop `variant="none"`.
4. `SegmentedSwitch.tsx`: delete `widthClass` and its `void`; `MatchList.tsx:79`,
   `MatchDetailPage.tsx:403`: drop the prop.
5. `tailwind.config.cjs`: delete the `card` and `focus` `boxShadow` entries; keep `pop`.
6. `Pill.tsx:32-34`: delete the two re-exports; `ui/theme.ts:75-80`: delete the "Legacy exports"
   block; delete `ui/theme-legacy.ts` if nothing else imports it (`grep -rn theme-legacy`).

**What must not change.** Every sheet keeps its `maxWidth`, `className` (`max-h-[84vh]` etc.)
and `scrollBody`; `ConfirmDialog` unchanged in look; `Card` keeps `variant` — but note what step 2 does to it:
deleting `StandingsTable.tsx:383-385` removes the **only** `variant="inset"` caller, leaving
`LoginPage.tsx:47` alone. Keep the prop and the branch (a one-caller prop is not dead code) and
say so in Deviations, so the next audit does not re-flag it; `ideaMeta.ts`'s `pillBaseClass` import; the clubs list's
group headers look identical (measure one group header row before/after at 390).

**Definition of done.** Every grep in "Verify first" returns 0 (or the component alone);
`npm run check` and `npm run build` green; the six modals, the clubs list groups, the two
segmented switches and the admin panel render pixel-identical at 390 and 1280 in both themes
(before/after screenshots).

**Gates.** `npm run check`, `npm run build`; browser as above.

**Canon — changes a line (applied by C15).** `DESIGN.md` §3: "`Card` and `CollapsibleCard` take
`variant="card" | "inset" | "none"` (plus `bodyVariant` on the collapsible)" → "`Card` takes
`variant="card" | "inset" | "none"`; `CollapsibleCard` has no surface of its own — its one use,
the clubs list, lays its groups flat on the page (C8)". §7's `Modal` row: "(card on scrim,
full-screen sheet on mobile)" is already the truth; drop nothing.

**Deviations:** Implemented as written, plus the necessary knock-on cleanup the spec didn't
spell out line-by-line:
- **Line numbers had shifted from C7's 11 dialogs**, as warned. Found every site by symbol
  instead: `wrap` in `AdminPanel.tsx` was now at 63/120/539-543 (not 60/115/474-478),
  `StandingsTable.tsx`'s at 130/139/383-385 (unchanged). Re-verified each against the current
  file before touching it.
- **StandingsTable's `Card variant="inset"` branch was confirmed unreached** (the sole caller,
  `LiveTournamentPage.tsx:701`, passes `wrap={false}`), so per the task's own correction it was
  deleted along with `wrap`, leaving `StandingsTable` always borderless. This drops `Card`'s only
  other caller besides `LoginPage.tsx:47` — exactly the one-caller state the task text already
  flagged; `Card.tsx` itself (out of scope) was not touched, so `variant="inset"` still exists
  there, just with one caller now. Confirmed by the correction note before starting.
- **Two unused declarations came out with their branches**, not named in the task text but
  required for `npm run check` to stay green (`no-unused-vars`): `StandingsTable.tsx`'s
  `const title = …` (only consumer was the deleted `<Card title={title} …>`) and its now-unused
  `import Card from "../../ui/primitives/Card"`.
- **`ui/theme-legacy.ts` had zero importers anywhere** (grepped `theme-legacy` across `frontend/src`
  including `test/`) once `ui/theme.ts`'s re-export was removed — deleted the file, as the task
  allowed.
- **Left alone, out of C8's file list:** `test/confirmedActions.test.tsx` (C7's file) still spreads
  a `wrap: false` prop into `<AdminPanel {...props} />`. `AdminPanel` no longer declares `wrap`;
  the extra key is silently accepted (TS excess-property checks don't fire through a spread of a
  variable, only on a fresh object literal assigned directly to the prop type), so `npm run check`
  stays green and the test still passes 689/689. Not touched — it's not in C8's file set and isn't
  broken, just a harmless dead key in a fixture; flagging it here so C7's owner (or a later sweep)
  can drop it without rediscovery.
- **Runtime verification** on the isolated stack (backend :8039, vite :8049, `verify-c8.db`, copy
  deleted afterward): Playwright (390×844 and 1280×900, `blue` and `light`) against the clubs page
  (`CollapsibleCard` groups), live tournament 21's Overview/Matches/Standings/Controls tabs
  (`StandingsTable` and `AdminPanel` now-unwrapped, `MatchList`'s Compact/Details `SegmentedSwitch`),
  match 118's Edit-result tab (`MatchDetailPage`'s Scheduled/Playing/Finished `SegmentedSwitch`,
  the `ClubPicker` sheet opened from the Clubs disclosure), and Settings → Logout
  (`ConfirmDialog`). **0 console/page errors** on every surface × viewport × theme combination.
  Screenshots confirm: the clubs list's group headers are unchanged (flat, `px-3 py-2.5` header /
  `px-3 pb-3` body, no card ring); the admin panel and standings render with no double surface
  (identical to the pre-existing `wrap={false}` look); both segmented switches size to their
  label text; `Modal` (ClubPicker, ConfirmDialog) renders as a bottom sheet at 390px and a centred
  card at 1280px in both themes — the one layout the component now has.
- No other deviations. `Button.iconOnly` left untouched (kept per the task text, deferred batch's
  job). `pillBaseClass`, `matchStatusPill`, `tournamentStatusPill`, `pillDateClass` and
  `deciderTypeLabel` (C7's, live callers in `AdminPanel.tsx`) all kept — none were on the removal
  list.

---

## C9 — A name in a pill opens the profile (audit 2.7)  ☑

**The defect.** Three pills of one shape, three behaviours: the Streaks "Current" pills open a
profile (`StreaksView.tsx:71-83`, a `PlayerLink`), the voter chips do nothing
(`VoteVotersModal.tsx:55-59,74-78`, inert `.chip` spans), the trends legend chips toggle a line
(`TrendsExplorer.tsx:165`, a `.chip` with a colour dot and strike-through). Plus one raw pill-shaped
`<button>` "Matches" (`DuoDetail.tsx:62`).

**Checked against the canon.** `AGENTS.md` §9 / `DESIGN.md` §7: "Identity is a link — a player's
avatar/name opens `/profiles/<id>` through `PlayerLink`" (N4). The voter chips are identities and
should already be links; once they are, the rule reads: **a name in a pill opens the profile; a
legend key (dot + name, hollow when off) toggles.** The legend chip is visually its own thing
(colour dot, strike-through), so the two do not collide.

**Verify first.** `sed -n '55,59p;74,78p' frontend/src/ui/primitives/VoteVotersModal.tsx` → `<span className="chip">`;
`sed -n '58,66p' frontend/src/pages/stats/h2h/DuoDetail.tsx` → a raw `<button className="… rounded-full …">`.

**The change.**
- `VoteVotersModal.tsx`: each voter → `<PlayerLink playerId={row.id} name={row.display_name} className="chip">{row.display_name}</PlayerLink>`
  (check the row carries the player id; `PlayerLink` stops propagation so the modal stays open).
- `DuoDetail.tsx:62`: the "Matches" pill → `<Button variant="ghost" size="sm" …>Matches</Button>`
  (`DESIGN.md` §7: actions are `Button`, "never raw `btn-base`/`icon-button` classes"; a raw
  `<button>` styled as a chip is the same breach).
- Streaks "Current" pills: unchanged (they are what the rule says).

**What must not change.** The legend chips in `TrendsExplorer` and the "Compare with" chips
(C2 owns those files). `VoteVotersModal`'s `text-loss` on the downvote thumb (`:70`) is a separate
canon breach ("a message is not a result"); **note it in Deviations, do not fix it here** — it is
outside the audit's list.

**Definition of done.** Every voter chip is an `<a href="/profiles/…">` with the default tooltip;
`a a` = 0 in the open modal; the "Matches" control is a `Button` of the `sm` ghost look and still
opens the modal.

**Gates.** `npm run check`; browser at 390 in `blue` and `light`: the voters modal on an idea with
votes, Stats → H2H → Duos.

**Deviations:** None from spec. `VoteVotersModal.tsx`'s two `.chip` spans (upvoters, downvoters)
now render as `<PlayerLink playerId={row.id} name={row.display_name} className="chip">`;
`DuoDetail.tsx:62`'s raw `<button className="… rounded-full …">` is now
`<Button variant="ghost" size="sm" className="shrink-0">` (matches the `RecordsView.tsx`/
`H2HView.tsx`/`CupDetail.tsx` ghost-sm precedent, no `type="button"` — none of those three set it
either). Left `VoteVotersModal.tsx:70`'s `text-loss` on the downvote thumb untouched, as instructed
— a separate canon breach, not this task's. Verified against isolated stack (backend :8037,
vite :8047, `backend/data/verify-c9.db`, deleted after): created a throwaway idea, upvoted it as
two players (Roli + Flo) via the API to populate both the idea's voters modal and confirm the
downvoters code path (structurally identical, no idea with a downvote existed in the dev copy — the
plan's Bauernkranz/1v1 dev-DB `ideas` table is empty on this snapshot). Playwright (390×844 and
1280×900, `blue` and `light`): `document.querySelectorAll("a a").length` = 0 on every surface;
clicking a voter chip navigated to `/profiles/<id>` and closed the modal; the "Matches" button
renders as a bordered ghost pill and still opens the duo's match-history modal. Screenshots and the
verify script are in the session scratchpad, not committed (throwaway).

---

## C10 — Vocabulary sweeps: one word per quantity, one plural helper, the text splits (audit 1.12, 2.1, 2.9, 2.10 + Part 3 subset)  ☐

Runs **alone, after C8** (≈35 files). Picks default to the majority; the count that justifies each
is in the table; **thin majorities and context splits are flagged** so Roli can veto by row number.
Counts are the audit's (source-3, verified 2026-09-17 by exact-string grep where a string could be
grepped); a site list per row is in `design-audit-2026-09-17/source-3-text.md`.

**Verify first.** For each row, grep the losing variant before touching it (the command is the
"Variants" cell); a row whose losing variant returns 0 is already done — tick it and move on.

| Row | Subject | Variants (count · where) | Pick | Why | Change at |
|---|---|---|---|---|---|
| 1 | Played — the unit | `P` glued, `RecordLine` default + column/chip (7) · `matches` (`playedLabel` 2 + `fmtCount` 4) · `games` (2) · `Played` (5) | **Split by context:** `RecordLine` and column headers → `P`; tile and chip labels → `Played`; a count in prose → `fmtCount(n, "match", "matches")`; `games` goes | a fixed-column line and a tile label have different constraints; `P` is the majority on the line (7 vs 4), `Played` the only tile form, and `games` (2) has no context of its own | drop `playedLabel="matches"` at `H2HView.tsx:600`, `MatchH2HPanel.tsx:58`; drop `playedLabel="games"` at `HeadToHeadRows.tsx:91,155` |
| 2 | Points — the label | header/chip `Pts` (3) · unit after a number `pts` (4) · metric chip `Points` (1) | header/chip → `Pts`; unit → `pts` | a unit after a number is lowercase (`ppm` is); a header is a label | `TrendsExplorer.tsx:22` `Points` → `Pts` |
| 3 | Win rate | `Win %` (5) · `Win rate` (2) · `Win%` (2) · no sign at all (1) | `Win %` everywhere; the H2H matrix cell prints `%` | majority | `ProfileStatsSection.tsx:92`, `PlayerProfile.tsx:126`, `standings.ts:96,112`; `H2HView.tsx:141` → `` `${Math.round(v.pct)}%` `` |
| 4 | Per-match average | tile words `Pts / match` etc. (7) · header/chip abbreviations `PPM`/`G/M`/`GA/M`/`GD/M` (7) · unit `ppm` (6) · bare number (1) — and 4 code paths (`fmtAvg`, `fmtPct`, inline `toFixed(2)`, `fmtOdd`) | **7–7 tie, split by context:** tiles keep the words, headers/chips keep the abbreviations, a number in a row carries `ppm`; every path goes through **`fmtAvg`**, `fmtPct` is deleted (it never formats a percentage) | a column header and a tile label are different jobs; one formatter keeps profile and Stats → Player agreeing | `DuoLeaderboard.tsx:44` gains ` ppm`; `fmtPct` callers (6) → `fmtAvg`; inline `.toFixed(2)` (8: `PlayerProfile.tsx:127-129`, `H2HView.tsx:67,139`, `HeadToHeadRows.tsx:97`, `DuoLeaderboard.tsx:44`, `StarsView.tsx:123`, `DuoDetail.tsx:57`) → `fmtAvg`; delete `fmtPct` + its test |
| 5 | Elo | `Elo` (4) · `Rating` (1) · `1052★` (1, **2.1**) | `Elo` | majority; `★` means a club's stars everywhere else — three reviewers found it | `TrendsExplorer.tsx:193` → `Elo`; `PlayerProfile.tsx:113` → `Elo {fmtRating(row.rating)} · …` |
| 6 | Goal difference | `GD` (4 paths) · `Goal diff` (4) · `GD/M` (1) · bare signed number (1, `gdLabel=""`) | **4–4 tie, split by context:** `RecordLine`/columns → `GD`; tile/chip → `Goal diff`; `GD/M` stays (a column); the bare number takes `GD` back | same split as row 1 | `DuoLeaderboard.tsx:40` drop `gdLabel=""` — measure the row at 390 afterwards; if a name truncates, keep `""` and say so |
| 7 | A 2v2 team on one line | `A/B` (5 sites) · `A / B` (4) · muted-slash span `A` `/` `B` (3) · `A + B` via `teamName` (4 visible + 3 aria) | **`A / B`** (spaced slash) through **one new helper** — `teamName` cannot be that helper, see **Row 7 in full** below | slash family 12 vs plus 7; spaced 7 vs unspaced 5 — **thin**, flagged | see **Row 7 in full** below the table — it is the only row with a mechanism to build, and it has a landmine |
| 8 | A score written in prose | en dash `3–1` (2) · hyphen `3-1` (2) · colon as a *score* (1: the Finish title) — `RecordLine`'s `14:6` and the Goals tile are GF:GA records, not scores, and stay | **en dash** | 2/2/1 — **thin**, flagged; the typographic score convention, and the Reset dialog on the same match already uses it | `CurrentGameSection.tsx:421` title, `CommentComposer.tsx:167` "makes it", `LiveTournamentPage.tsx:305` decider |
| 9 | Pluralisation (**1.12** + the ternaries) | never pluralised (5) · hand-rolled (13) · `fmtCount` (4) | `fmtCount` wherever the string is *count + noun*; pronoun/verb agreement stays hand-rolled | the helper exists and its comment says why | **1.12:** `cupParts.tsx:27,135,146` (`fmtCount(n, "tournament", "tournaments")`), `MatchupView.tsx:203` (×3), `SelectClubsPanel.tsx:295` (`${filtered} of ${fmtCount(sorted, "club", "clubs")}`); **ternaries:** `ClubPicker.tsx:268`, `PositionsView.tsx:283`, `StarsView.tsx:76`, `WhatIfSection.tsx:161`, `TournamentCommentParts.tsx:193` + `GuestbookEntryCard.tsx:135` (`reply`/`replies`), `DiagnosticsSettings.tsx:248`, `LiveTournamentPage.tsx:854,874` (the noun only; `it/them`, `is/are`, `was/were` at `:859-860` stay); leave `GuestbookSection.tsx:184-186`, `IdeasPage.tsx:377-379` (sentence-level). Tests: `cupsPreview.test.tsx:115,119` → `"2 tournaments held"` stays, `"1 tournaments held"` → `"1 tournament held"` |
| 10 | Ellipsis | `…` (68) · `...` (2) | `…` | majority | `LoginPage.tsx:76`, `DiagnosticsSettings.tsx:243` |
| 11 | Login wording | `Login`/`Logout` (4) · `Log in` (1) | `Login` | majority — **flagged**: "Log in" is the verb, "Login" the noun; veto if grammar wins | `IdeaCard.tsx:279` → "Login to vote" |
| 12 | Title Case outliers | sentence case ≈45 buttons / 15 tabs / 4 titles · Title Case 5 / 1 / 1 | sentence case | majority | "Create tournament" (`NewTournamentForm.tsx:119`), "Open standings" / "Open results" / "Open matches" (`OverviewSection.tsx:225,299`), "Swap home/away" (`CurrentGameSection.tsx:271`), "All friendlies" (`FriendliesPage.tsx:14`), "Player login" (`LoginPage.tsx:47`). Tests: `overviewSection.test.tsx:142,151,153,160,161` regexes |
| 13 | Empty-state full stop | with (31) · without (4) | full stop | majority | `ClubPicker.tsx:387`, `WhatIfSection.tsx:210`, `cupParts.tsx:92`, `DiagnosticsSettings.tsx:234` |
| 14 | "None yet." | `No <thing> yet.` (≈22) · `None yet.` (3) | name the thing | majority | `RecordsView.tsx:100` → "No matches yet.", `:150` → "No titles yet.", `StreaksView.tsx:68` → "No streaks yet." |
| 15 | Still running | `current` (3) · `now` (2) · `live` (1) · `ongoing` (1) | **split:** a state tag/heading → `current`; the open end of a date range → `now` | `current` is the majority state word; "12.09.2026 – now" is a date placeholder, not a state — flagged | `StreaksView.tsx:63` chip `live` → `current`, and it stops wearing the green status pill because it is not a match state. **Use the canon primitive, do not hand-spell another `rounded-full`**: `DESIGN.md` §3 level 3 gives `.chip` for this shape, and the audit counted 13 distinct `rounded-full` recipes already (3.5). The `"Current"` heading at `:71` is a `<div className="mb-1 text-xs font-medium text-text-muted">` — **not a pill** — so it is not the thing to copy, `streakDisplay.ts:7` `ongoing` → `current`, `ClubStarHistory.tsx:70` tag `now` → `current`; `cupReigns.ts:105` keeps `now` |
| 16 | Profile-door tooltip | `Open X's profile` (`PlayerLink` default, 14) · `Open profile: X` (2) · `Open X's full profile` (1) · `… · drag to reorder` (1) | `Open X's profile`; the drag suffix stays | majority | `StandingsTable.tsx:336`, `PlayersAdminPage.tsx:200` (`ariaLabel`), `PlayerProfile.tsx:104` |
| 17 | "a of b" | `#3/8` rank (`fmtRank`, 3) · `3 of 10` count (2) · `5 / 12` current / record (1) | **no change** — three idioms for three things: a rank, a count of a total, a pair under a label that says "current / record" | listed so the split is a decision, not an oversight | — |
| 18 | `×N` (**2.9**) | `×N` = tournaments held (4) · tied at the top (1) · count of a mode (1) | `×N` means "held"; the other two say it in words | majority | `RecordsView.tsx:58` `×{n}` → `{n} tied`; `PositionsView.tsx:286` `` ` · ${n}× ${m}` `` → `` ` · ${m}: ${n}` `` ("7 tournaments · 1v1: 4 · 2v2: 3") |
| 19 | Short date's year (from C1) | `12. Sep. 26` (no apostrophe, 4 sites) · four-digit everywhere else | four-digit year | the year is never omitted elsewhere; `26` read as a day | done in C1 (`fmtShortDate`); listed for veto |
| 20 | Dashed "no data" segment (from C2) | 28% opacity | full opacity, the dash carries the meaning | no colour reaches 3:1 at 28% | done in C2; listed for veto |
| 21 | "P" beside "pts" (**2.10**) | `3P … GD +8` under `9 pts` | **no change** — row 1 keeps `P` on the line and `pts` as the unit | the two are one letter apart by design of the record line; listed so the audit's point is answered | — |

Not in this table, on purpose: the 12 German strings (the audit itself calls them likely flavour;
`AGENTS.md` §1 says notification texts are dialect by design), the "still running" chip's colour
beyond row 15, and the date shapes beyond rows 19 (C1 owns them).

### Row 7 in full — the 2v2 team name

**Why this row is not a one-liner.** The obvious change ("switch `teamName` to `" / "`") is wrong
twice over, and both were missed until review:

1. **`teamName` cannot be the shared helper.** `frontend/src/utils/matchDisplay.ts:3` is
   `teamName(side?: MatchSide | null)` — it takes a **`MatchSide`**. Six of the nine sites do not
   have one: `H2HView.tsx:317` and `HeadToHeadRows.tsx:133-134` join a stats DTO's player array,
   `MatchupView.tsx:108-109` an id array, `matchupSummary.ts:41` and
   `TournamentCommentsCard.tsx:92` a plain `string[]`, and `FriendlyMatchCard.tsx:207,211` a
   `string[]` **with a `"Team A"`/`"Team B"` fallback `teamName` does not have** (it returns `—`).
   Telling a worker "route every join through `teamName`" produces nine hand-edits — nine
   implementations of one job, which Rule 8 calls a failed task.
2. **Something parses the separator.** `pages/live/MatchList.tsx:15-16`:
   ```ts
   function splitPlayers(names: string): string[] {
     return names.split(" + ").map((s) => s.trim()).filter(Boolean);
   }
   ```
   used at `:91-92` as `splitPlayers(teamName(a))` to feed `ScoreLine` **stacked** 2v2 names.
   Change `teamName`'s separator and every 2v2 row in the live match list silently collapses to one
   line — against `DESIGN.md` §8 ("2v2 stacks two lines"). `MatchList.tsx` was not in this row's
   site list.

**The mechanism (this is the one implementation; Rule 8).** In `utils/matchDisplay.ts`:
```ts
/** The one way two names share a line. Stacking is ScoreLine's job — see DESIGN.md §8. */
export const NAME_JOINER = " / ";
export function joinNames(names: readonly string[]): string {
  return names.filter(Boolean).join(NAME_JOINER);
}
```
- `teamName(side)` **delegates**: `joinNames(players.map((p) => p.display_name))`, keeping its `—`
  empty case. It stays the convenience wrapper for a `MatchSide`; it is not the helper.
- **Delete `splitPlayers` from `MatchList.tsx`.** At `:91-92` pass the array straight through:
  `(a?.players ?? []).map((p) => p.display_name)`. Nothing in the app may parse a joined name
  string back into an array — that is what made a separator change dangerous.
- **`matchHeaderMeta.aPlayers`/`bPlayers` become `string[]`.** `TournamentCommentsCard.tsx:92`
  (`sidePlayersLabel`) returns the array; `CommentList.tsx:181` passes it to `ScoreLine` so a 2v2
  comment header **stacks** like the other seven (canon §8); the composer target list at `:776`
  calls `joinNames(...)` itself, because that one genuinely needs a string.
- `RecordsView.tsx:79` likewise takes the array (via `:202`'s `teamNames()`), so Records stops
  being the one score list that collapses a team onto one line.
- The remaining prose sites call `joinNames`: `H2HView.tsx:311` (**a template literal, not a
  `join` — the "every join" wording never reached it**), `:317`, `HeadToHeadRows.tsx:133-134`,
  `MatchupView.tsx:108-109`, `matchupSummary.ts:41`, `FriendlyMatchCard.tsx:207,211` (wrap:
  `joinNames(names) || "Team A"`).
- The muted-separator styling at `DuoLeaderboard.tsx:32`, `DuoDetail.tsx:47` and
  `HeadToHeadRows.tsx:80` stays — it renders its own spans and never joins.

**Row 7's gate** (the batch gate's `join` grep is necessary but not sufficient):
```bash
cd frontend/src
grep -rn 'join("/")\|join(" / ")\|join(" + ")' . | grep -v test/   # → 0
grep -rn 'splitPlayers' .                                          # → 0
grep -rn 'NAME_JOINER\|joinNames' utils/matchDisplay.ts            # → the one definition
```
Then look at a 2v2 row on the live Matches tab, the Records list and a 2v2 comment header at 390px:
**all three stack two lines.** If any renders `A / B` on one line, the row is not done.

**What must not change.** `RecordLine`'s geometry and `recordWidths` (labels are text inside a
fixed track; `P` is the default — dropping overrides shortens tracks, never lengthens them);
`ScoreLine`'s API; every `aria-label` that repeats a visible string changes with it (row 7's
`join(" + ")` at `MatchList.tsx:154`, `FriendlyList.tsx:154`, `WhatIfSection.tsx:132`); the
`Streaks · current / record` label. Nothing German. No file outside the site list without a note.

**Definition of done.** Every losing variant's grep returns 0 (write the 21 greps and their counts
into Deviations); `fmtPct` no longer exists; two ScoreLines stack that did not; `npm run check`
and `npm run build` green; a screenshot per changed surface at 390 in `blue` (the changes are
text; `light` on the four surfaces where a token changed: row 15's chip).

**Gates.** `npm run check`, `npm run build`; browser 390 on every surface in the "Change at" column.

**Canon.** C15 adds a short "Words" paragraph to `DESIGN.md` §5 or a new §5b recording rows 1–8,
15, 16 and 18 as the vocabulary (the canon has no word list today; A8's "1 games together" note
becomes an example there).

**Deviations:**

---

## C11 — Draw, loss and cup gold (audit 1.10, 2.5, 2.6)  ☐

**All three parts are DECIDED.** (1) Light-theme draw → yellow-800 `133 77 14`. (2) The gold cup
splits into a text value and a brighter mark value. (3) Dark-theme draw → yellow-300 `253 224 71`.
Part (3) touches every drawn score in the theme Roli actually uses, so it gets its own browser
check on a populated match list, not just a token diff.

**The defects.** (1.10) Light theme: win `22 101 52` / draw `146 64 14` / loss `153 27 27` — all
legible, but draw and loss are **ΔE ≈ 21** apart (blue theme: 69); on a match-history row the
draw "5" and the loss "2" are two dark warm digits, and the D/L badge discs share a tint.
(2.5) Dark themes: draw `251 191 36` **is** cup gold `251 191 36` (and the winner's trophy) — a
drawn score, the Lorbeerkranz ring and the trophy in one colour. (2.6) The Lorbeerkranz is yellow
in dark and brown `166 74 12` in light; the Bauernkranz stays green; each theme has one weak crown
(gold 4.0:1 light, green 3.3:1 blue).

**Checked against the canon.** `DESIGN.md` §2 chose all three values on purpose and measured them
(A6, R3): light draw went to amber-800 to clear 4.5:1 on its `bg-draw/15` badge; light cup gold was
darkened so the holder's *name* clears 4.5:1; and §2 calls draw == warn and loss == error
"coincidences, not couplings" — the same words cover draw == cup gold. **Any fix here changes
§2's table and the R3/A6 comments in `light.css`/`defaults.css`; that is why it is blocked.**

**The mechanics, once decided.**
- (1) Light draw → **yellow-800 `133 77 14`**: computed 5.75:1 on the page ground, **4.64:1** on its
  own `/15` badge (R3's floor 4.5), 6.85:1 on white, ΔE to loss **33** (from 21), to win 59. The
  only Tailwind step that clears the badge floor with a larger distance; yellower customs
  (`hsl(48 100% 24%)` ΔE 52) fall to 4.04:1 on the badge. Moving loss instead does not help
  (red-900 `127 29 29`: ΔE to amber-800 still 22). Files: `light.css` one line + comment;
  `DESIGN.md` §2 table row. Alternative: accept — the D/L letter (C5, now in both densities) is
  the disambiguator.
- (2) Cup gold split: keep `--color-cup-gold` for **text** (the holder's name, ≥ 4.5:1) and add
  `--color-cup-gold-mark` for **marks** (ring, crown disc, dot — non-text, ≥ 3:1): light e.g.
  amber-600 `217 119 6` (3.0:1 on the page ground, reads gold); dark = the same amber-400.
  Files: `defaults.css`, `light.css`, `cupColors.ts` (a second map or a `{text, mark}` pair),
  `AvatarCircle.tsx:31`, `CupOwnerBadge.tsx:22-36`, `cupParts.tsx`/`CupsPreviewCard` dots,
  `TournamentLaurelMarkers.tsx`, `PositionsView` legend. Alternative: accept (canon A6).
- (3) Dark draw vs cup gold: move draw to yellow-300 `253 224 71` (still ≥ 10:1 on dark cards;
  ΔE to amber-400 ≈ 20 — a visible step, not a different colour) or accept the coincidence.
  Files: `defaults.css` one line; §2 table.

**What must not change.** `--color-warn`/`--color-error` (tuned for sentences); the dark
result tokens' ≥ 4.5:1 on every card; `cupColors.ts`'s rule that a cup never borrows a gradient or
a status colour.

**DoD (once unblocked).** ΔE(draw, loss) ≥ 30 in light; every result token ≥ 4.5:1 on ground and
on its `/15` badge in both themes; if split, every cup mark ≥ 3:1 non-text and the holder's name
≥ 4.5:1; `DESIGN.md` §2 table and both theme-file comments rewritten (C15 or this task — this task
owns the CSS comment, C15 the canon).

**Gates.** `npm run check`; browser 390 × blue/light on a profile's Matches tab, the dashboard
cups block, the tournaments list crowns.

**Verify first.**
```bash
cd frontend/src/themes
grep -n 'color-draw\|color-loss\|color-cup-gold' defaults.css light.css
# expect light --color-draw 146 64 14 (amber-800) and dark 251 191 36 (amber-400);
# one --color-cup-gold per theme, amber-400 dark / 166 74 12 light
grep -rn 'cup-gold' ../cupColors.ts ../ui ../pages | grep -v test/   # the consumers that follow a split
```
If `--color-draw` already reads `133 77 14` in `light.css`, this task is done — tick and stop.

**Definition of done.** Measured with the WCAG formula on sampled pixels, both themes:
- light `draw` ≥ 4.5:1 on the page ground **and** on its own `bg-draw/15` badge; ΔE to `loss` ≥ 30
- dark `draw` ≥ 4.5:1 on the page ground and distinguishable in hue from `--color-cup-gold`
- the cup **text** value ≥ 4.5:1 where a holder's name is painted (`cupParts.tsx`), the cup **mark**
  value ≥ 3:1 for ring, crown and dot
- **the Form sparkline is re-measured on the light theme's white player card ≥ 3:1.** C2 set it to
  the result tokens and measured it against the *old* draw; this task moves draw in both themes, so
  C2's number is stale the moment this lands. Re-measuring it here is what keeps the two in step.
- a match list, a standings row and a cup block look right at 390 in both themes — **this changes
  every drawn score in the theme Roli uses**, so look at real data, not a token diff

**Gates.** `npm run check`; browser at 390×844 and 1280×900 in `blue` **and** `light`.

**Deviations:**

---

## C12 — The crown and the ring (audit 2.2, 2.3)  ☐

**(a) is DECIDED: remove the crown where the avatar already wears the cup ring** (Players page,
profile header), so a crown on a person means only "held it going into this tournament".
**(b) is DECIDED: no change.** The picker keeps its 2px accent selection ring. `AvatarButton` is
**out of this task's blast radius** — do not touch it. Instead, C15 records the exception in
`DESIGN.md`: a ring means "holds a cup" except on a picker avatar, where it means "selected", and
the two cannot meet because no picker passes `cups`.

**The defects.** (2.2) `CupOwnerBadge` means "holds the cup today" on the Players page
(`PlayersAdminPage.tsx:241`) and the profile header (`ProfileHeader.tsx:187`) — next to an
avatar whose ring already says exactly that — and "held it going into this tournament" in the
standings (`StandingsTable.tsx:360`), where the avatar has no ring. (The tournaments-list crown,
the date-pill laurel and the Positions tile crown are about the *cup*, not a person, and stay.)
(2.3) A ring means "holds a cup" on 11 surfaces and "is selected" on the 6 pickers
(`AvatarButton.tsx:60`, `ring-2` accent); they never collide only because no picker passes `cups`.
The friendly form's "None" slot draws the same 2px orange ring.

**Checked against the canon.** `DESIGN.md` §7 / `AGENTS.md` §9 (T15): "Colour is the information
and its tense is always today" for the ring; the standings' crown is Roli's explicit call
("owned it going into this tournament"). Removing the crown where the ring already speaks
follows T15's spirit and leaves the crown-on-a-person one meaning; the canon does not say it
either way, so it is his call. For the picker: `Chip`/`SegmentedSwitch` share one selected style
(`bg-accent/15 ring-1 ring-inset ring-accent/40`, §7) — giving the *button box* that wash instead of
ringing the *avatar* keeps "ring = cup" whole.

**The mechanics.** Delete the `CupOwnerBadge` at `PlayersAdminPage.tsx:237-243` and
`ProfileHeader.tsx:184-190` (imports with them), and `test/avatarRing.test.tsx` if it asserts the
badge. **That is the whole task.** `ui/primitives/AvatarButton.tsx` and its four callers
(`pages/stats/PlayerPicker.tsx`, `pages/stats/h2h/DuoPicker.tsx`, `pages/tools/FriendlyMatchCard.tsx`,
`pages/tournaments/NewTournamentForm.tsx`) are **out of scope — do not open them.** The picker keeps
its accent selection ring by decision; C15 records it in `DESIGN.md` as a deliberate exception.

**Canon (C15).** §7 `AvatarCircle` row: add "a selected picker avatar is a Chip-washed button, never a
ring (C12)"; and, if (a), "the crown is never drawn beside a ringed avatar".

**Verify first.**
```bash
cd frontend/src
sed -n '237,243p' pages/PlayersAdminPage.tsx      # expect a <CupOwnerBadge …>
sed -n '184,190p' pages/profile/ProfileHeader.tsx # expect a <CupOwnerBadge …>
grep -n 'cups=' pages/PlayersAdminPage.tsx pages/profile/ProfileHeader.tsx
# expect the avatar at both sites already receives cups -> the ring already says "holds it today"
```
If either badge is gone, tick that half and say so.

**Definition of done.** No `CupOwnerBadge` on the Players page or the profile header; the cup ring
on the avatar is untouched at both; `CupOwnerBadge` still renders in the tournament standings
(`StandingsTable.tsx:359-361`), which is now its only meaning — "held it going into this
tournament"; unused imports gone; `ui/primitives/AvatarButton.tsx` **not in the diff**;
`npm run check` green.

**Gates.** `npm run check`; browser at 390 and 1280 in `blue` — the Players page and one profile,
confirming a cup holder still reads as one from the ring alone.

**Deviations:**

---

## C13 — The colour of "live" (audit 2.4)  ☐

> **Decided: green everywhere.** The nav dot changes; the six in-page markers stay.

**DECIDED: green means "happening now".** The nav dot takes the status green; the six in-page
markers are already right and do not change. `DESIGN.md` §2's `--color-live` row is rewritten in
C15 — flag it there, do not leave the canon saying both.

**The defect.** Five in-page markers for a playing match use the green status family
(`MatchList.tsx:98,104`, `WhatIfSection.tsx:67,72`, `TournamentsPage.tsx:161`, the standings leader
bar, the hero pill via `matchStatusPill`); the three navigation "Live now" dots paint
`--color-live`, **red-500** in dark (`defaults.css`), red-600 in light. A reader learns green =
now on every page and meets a red pulse in the bar.

**Checked against the canon — the canon contradicts itself.** `DESIGN.md` §2 lists both:
"`status-*` (green = live/playing, blue = draft/scheduled…)" and "`--color-live` … live/playing
marker … red-500". T10 made the nav dot the app's one live indicator; A8 made it read the token.
Either answer rewrites one of those two lines.

**The mechanics, once decided.** (a) **Green nav dot:** `--color-live` → `34 197 94` in
`defaults.css` and a light value ≥ 3:1 non-text on the page ground (green-600 `22 163 74` = 3.4:1;
if the token is also used as *text* anywhere — `grep -rn 'text-live'` → 0 today — it must clear 4.5)
in `light.css`; `.live-dot`/`.live-ping` follow; DESIGN.md §2 row rewritten. Cost: 2 lines.
(b) **Red in-page markers:** the 6 sites above → `text-live`/`bg-live`; `matchStatusPill`'s
`playing` → a red status family that does not exist yet (new `status-*-live` tokens ×2 themes);
DESIGN.md §2 "green = live/playing" rewritten. Cost: 6 sites + 6 tokens.

**Verify first.**
```bash
cd frontend/src
grep -n 'color-live' themes/defaults.css themes/light.css   # expect red-500 / red-600
grep -rn 'text-live\|bg-live' . | grep -v test/            # expect 0 — no text uses the token
grep -n 'live-dot\|live-ping' styles.css                   # expect the two rules at ~:463
```
Two token lines are the whole change: the three dots (`Sidebar.tsx:67-68`,
`BottomTabBar.tsx:66-67`, `MobileChrome.tsx:176-177`) use only those two classes, so `styles.css`
is **not** edited. Because nothing paints text with the token, the 4.5:1 text floor does not apply —
a dot is a non-text mark at ≥ 3:1.

**Definition of done.** `--color-live` is the status green in both theme files; the tab-bar dot,
the sidebar "Live now" dot and the drawer dot are green and ≥ 3:1 against their own background in
both themes; the pulse still animates; nothing else changed colour
(`git diff --stat` touches two files); `npm run check` green.

**Gates.** `npm run check`; browser at 390×844 (tab bar + drawer) and 1280×900 (sidebar) in `blue`
**and** `light`, with a live tournament in the data so the dot actually renders.

**Deviations:**

---

## C14 — Accent means "selected" only (audit 2.8)  ☐

> **Decided: the three accent text links take the dashboard's muted text + chevron look.**
> `StandingsPreviewCard.tsx:49` ("Full table ›") is the precedent to copy — match it exactly rather
> than inventing a fourth "see more" style, since the audit already counted four.

**The defect.** Orange (blue theme) / blue (light) is the active tab, segment, chip and sort arrow
— and the "View all →" (`ProfileOverviewTab.tsx:179`), "Full stats →" (`ProfileStatsSection.tsx:76`)
and "Reset zoom" (`TrendsExplorer.tsx:156`) text links. The dashboard's own "Full table ›"
(`StandingsPreviewCard.tsx:49`) is muted text + chevron, which does not collide. (The theme-level
half — "blue means selected in one theme and press-me in the other" — is a theme redesign and is
deferred, not decided here.)

**Verify first.**
```bash
cd frontend/src
grep -n 'text-accent' pages/profile/ProfileOverviewTab.tsx pages/profile/ProfileStatsSection.tsx pages/stats/trends/TrendsExplorer.tsx
# expect 3 hits: :179 "View all →", :76 "Full stats →", :156 "Reset zoom"
sed -n '48,53p' pages/dashboard/StandingsPreviewCard.tsx      # the precedent, verbatim
```

**The mechanics.** Two of the three are navigation; one is not. They do **not** get the same
treatment, and the difference is the rule:

- **A link that goes somewhere** (`ProfileOverviewTab.tsx:179` "View all", `ProfileStatsSection.tsx:76`
  "Full stats") takes the precedent **verbatim** — copy the class string from
  `pages/dashboard/StandingsPreviewCard.tsx:48-53`, do not retype it from this plan:
  ```
  inline-flex items-center gap-1 text-xs text-text-muted transition hover:text-text-normal
  ```
  followed by `<ChevronRight size={14} />` in place of the `→`. **`inline-flex items-center gap-1`
  and `transition` are load-bearing** — without them the SVG does not align to the text and there
  is no gap, which is a *fourth* look, not the precedent. Keep each site's existing
  `order-1 shrink-0` (`.section-head` needs it) and **drop `font-medium`** (the precedent has none).
- **A button that does something** (`TrendsExplorer.tsx:156` "Reset zoom" — an action, no arrow)
  takes the same muted text **without a chevron**. A `ChevronRight` on "Reset zoom" would promise
  navigation that does not happen. This is not a new variant: it is the same treatment minus an
  affordance it has no use for.

**Scope — say it plainly.** Audit 2.8 lists more accent-as-action sites than this task touches.
`MatchDetailPage.tsx:307` ("Back"), `TournamentsPage.tsx:135` ("Create one.") and
`PushNotificationsSettings.tsx:141` ("Dismiss") are **out of scope**: the first two are recovery
paths where findability beats consistency, the third is an error affordance. The raw reports count
eight accent/text-action looks in total (`source-4-frame.md:218`) and five ways to say "see more"
(`pixel-3-desktop-chrome.md:215`); this task closes the three that sit in a section header next to
a selected chip. **Record in Deviations that 2.8 is partially closed**, so the next audit is not
surprised.

**What must not change.** The dashboard precedent itself. The `→` inside
`OverviewSection.tsx`'s "Open Standings →" buttons — those are filled buttons, not text links.

**Definition of done.** `grep -rn 'text-accent' frontend/src/pages/profile frontend/src/pages/stats/trends | grep -v test/`
returns 0 for those three sites; the two navigation links are pixel-identical to "Full table ›" at
390 and 1280 (same height, same gap, same muted colour, chevron baseline-aligned); "Reset zoom"
reads as muted text with no chevron; `npm run check` green.

**Gates.** `npm run check`; browser at 390×844 and 1280×900 in `blue` **and** `light` — the accent
differs per theme, so "no longer accent" must be confirmed in both.

**Deviations:**

---

## C15 — Documentation pass (runs LAST)  ☐

Applies every "Canon" line listed above in one commit so no two workers touched
`DESIGN.md`/`AGENTS.md`:
- `DESIGN.md` §2: `--player-solid-s/-l` row (C2); C11's table changes if unblocked; C13's row if
  unblocked. §3: inset hairline as shadow (C3); `CollapsibleCard` sentence (C8). §7: "Confirming an
  irreversible action" + the red-block rule (C7); `AvatarCircle`/picker lines (C12) if unblocked.
  §8: the `resultBadge` sentence (C5). §5/§5b: the vocabulary paragraph (C10). "Last checked
  against the code" date.
- `AGENTS.md` §9: add this tracker to the list of planning files; note the locale constant
  (**`APP_LOCALE_NUMERIC` / `APP_LOCALE_MONTHS`**, C1 — numbers de-AT, months en-GB) under §9
  "Style"; §11 current state: baseline, checks, what is deployed.
- This file: every task ticked with its Deviations filled; the verification-gates section below
  with the final numbers.

**DoD.** `grep -n` for each changed canon sentence finds the new wording; nothing in `DESIGN.md`
describes a prop or branch C8 deleted (`fullScreenOnMobile`, `bodyVariant`, `widthClass`,
`shadow-card`); `npm run check` green at the branch head.

**Deviations:**

---

## Verification gates (after all tasks)

- `cd frontend && npm run check` — typecheck, eslint, vitest (baseline at `f1ea22b`: 681 tests in
  67 files; `2e23365` is one commit later — record the new count).
- `cd frontend && npm run build` — green (the pre-existing >500 kB chunk hint is not a regression).
- No backend task in this batch: `make test` / `make lint` / `make gen-types` are unaffected; run
  `make gen-types` once at the end to confirm "no diff" anyway.
- `document.querySelectorAll("a a").length` = 0 on every surface touched (C7 dialogs open, C9 modal).
- The audit's own numbers, re-measured on the isolated stack at 390×844 and 1280×900 in `blue`
  and `light`: the six palette lines ≥ 3:1 (C2); placeholders ≥ 4.5:1 (C3); `scrollHeight` equal
  across themes (C3); standings dividers ≥ 1.3:1 (C3); League select inside the gutter (C3);
  end-of-page clearance ≥ 20px (C6).
- **Re-count what the batch claims to have collapsed.** The gates above re-measure pixels; these
  re-measure *variants*, because a half-landed sweep leaves three spellings where there were two
  and is worse than no sweep. Run after C10 and again after C14, and expect **1** for each:
  ```bash
  cd frontend/src
  grep -rn 'join("/")\|join(" / ")' . | grep -v test/   # 2v2 teams: expect 0 — all through teamName
  grep -rn '"Win rate"\|"Win%"' . | grep -v test/        # win rate: expect 0 — "Win %" only
  grep -rnE 'fmtRating\([^)]*\)[^ ]*★' . | grep -v test/  # the star on an Elo number: expect 0
  grep -rnE '[a-z]\.\.\.' --include='*.tsx' --include='*.ts' . | grep -v test/  # expect 1
  grep -rn 'playedLabel=' . | grep -v test/              # expect 0 — the split is by context now
  ```
  Expected after the batch: `join` **0** · `Win rate|Win%` **0** · the Elo star **0** ·
  `[a-z]\.\.\.` **1** (only `diagnostics/crashLog.ts:191`'s `\n... (truncated)` marker, which is
  copied-text plumbing, not a UI label) · `playedLabel=` **0**.
  Each returns a count the audit put a number on; if one is not what the pick table promised, the
  sweep is incomplete, not "mostly done". A worker that cannot reach 0 on a line must say which
  sites resisted and why, in its Deviations section — never leave it to be rediscovered.

## Deployment (later, on Roli's go)

Frontend-only: `ssh hetzner && cd ~/projects/Lorbeer-Turnierplaner && git pull && docker compose up -d --build frontend`.
No backup needed, no schema change, no manual step. Smoke: dashboard in both themes on the phone,
one draft tournament's Comments tab (C4), one destructive action's dialog (C7).

## Deferred — design-system work for a later batch (Roli, 2026-09-17; explicitly NOT here)

- The eight section-heading treatments (audit 3.5).
- The eight `.inset` paddings and the eleven `.card` padding overrides (3.5).
- Adopting `Button.iconOnly` across the 43 hand-sized icon buttons and the seven tap-target sizes (3.5).
- An avatar size scale — 7 values through `AvatarCircle` plus 4 in the pickers, the fallback
  initial that does not scale (3.3).
- Unifying the nine filter/tab control idioms and the four filter placements (3.5).
- The desktop width rework — the 992px column, the ~150px islands, the two standings grids (3.6).
- Also parked from the audit, undecided: the 12 German strings (3.4), the theme-level accent/button
  role swap (2.8's second half), "you" is never said (3.3), the crest-weight follow-up (`AGENTS.md` §11).

## What this plan could not verify (and why)

- **No pixels were re-measured.** The 71 captures are gone; every contrast and distance quoted is
  the reports' number, checked against the source that produces it. C2's and C11's candidate
  values were **computed** with the WCAG formula from the token triplets, not sampled from a
  render — the implementer's DoD samples them.
- **No checks were run.** The session was read-only; `npm run check` was not executed, so the
  "681 tests / 67 files" baseline is `AGENTS.md` §11's at `f1ea22b`, one commit behind `2e23365`.
- **`var()` inside an SVG presentation attribute on iOS Safari** (C2) rests on the precedent
  already shipped at `charts.tsx:40/46/205/212/224`, not on a fresh device test.
- **`de-AT` output** was verified in Node 24's ICU (`03.09.2026`, `05. Jän. 2026`, `März 2026`); the
  browser's ICU may abbreviate a month differently ("Sept." vs "Sep.") — C1's tests pin Node's,
  the browser check confirms the phone's.
- **C6** depends on the canon's promised clearance being present; it was read in the source
  (`pb-16` at `StatsInsights.tsx:207`, `FriendlyMatchesListCard.tsx:346`), not measured.
- **The confirm-rule inference (C7)** rests on the nine/four split and the code's own comments at
  three sites; if Roli reads "irreversible" more widely (reshuffle, clear form), those two rows
  gain a red block — a one-line change each.
- **C3(b)'s interaction list** (`.inset` + `ring`/`border` classes) came from a grep that also
  matched `inset-y-*`; the implementer re-checks visually.

## Decisions still needed from Roli

**None are blocking.** Every task is decided and implementable. Eight questions were answered
across three passes on 2026-09-17 and are recorded in "Decisions" at the top. Two things still
want Roli's eye, but at review rather than before work starts:

1. **C10 — the pick table.** Veto rows by number when you read it. The thin ones are flagged:
   row 7 (2v2 `A / B`, 7 spaced vs 5 unspaced), row 8 (prose score en dash, 2/2/1), row 11
   ("Login" 4 vs "Log in" 1 — the majority is the noun), row 19 (short date keeps a four-digit
   year), plus `en-GB` abbreviating September as **"Sept"** — the audit's "only four-letter month"
   — keep it or special-case the abbreviation.
2. **C5 — the W/D/L badge in both densities.** Planned as "the badge follows the result", which
   changes `DESIGN.md` §8's "for dense lists". Proceeding unless vetoed; say so if Compact-only
   was the intent.
