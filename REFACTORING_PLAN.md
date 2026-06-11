# Refactoring Plan — Clean Code, Consistent UI, Solid API Boundary

> Created 2026-06-10 against commit `6ba3e52` (main). Line numbers refer to that commit —
> if they have drifted, locate by symbol name instead.
>
> **Goals** (in priority order):
> 1. Consistent frontend UI across pages (cards, buttons, empty states) — mobile-first, desktop-friendly.
> 2. Clean, typed interface between backend and frontend (no hand-written duplicate types, no contract drift).
> 3. Clean code: thin routers, small components, no copy-paste triplication.
>
> **Non-goals:** No feature changes. No visual redesign — only unification to the existing design
> language. No new dependencies unless a task says so.

---

## How to work on this plan (rules for the implementing model)

1. All work happens on a dedicated branch off `main`, e.g. `refactor/cleanup` (create it first;
   never commit to `main`).
2. **One task per commit** (or small PR). Use the task ID in the commit message, e.g.
   `refactor(A3): route FormData uploads through shared upload helper`.
3. Every task is **behavior-preserving**. If you find yourself changing what the app does, stop.
4. Do **not** reformat unrelated code (see AGENTS.md). Keep diffs scoped to the task.
5. After every task run the relevant checks (see [Verification](#verification)) and make them pass
   before moving on.
6. After **any** backend response-model change: run `make gen-types` from repo root, commit the
   regenerated `frontend/src/api/generated/schema.d.ts` in the same commit, and run the frontend
   typecheck.
7. UI tasks: verify visually at **mobile width (~375px)** and **desktop (≥1024px)** before
   committing. Screenshots in the PR are expected for UI changes (AGENTS.md).
8. If a task turns out to be substantially larger or different than described here, stop and leave
   a note in this file under the task (don't improvise a bigger change).
9. Tick the checkbox of a task when it's merged. This file is the single tracker.

### Models & session workflow (one switch total)

Two models, **one switch** for the whole project. No Haiku anywhere. When unsure which
model something belongs to, take the higher one.

- **Block 1 — Sonnet 4.6:** all implementation except the tasks marked Opus. Set it once
  with `/model` (it's saved as your default for new sessions), then don't touch it again
  until Block 1 is done.
- **Block 2 — Opus 4.8:** the security-relevant task (B2), the three big component
  splits (F1–F3), and both `/code-review` checkpoints. Switch once when Block 1 is
  finished.

Work in a **fresh session per step** of the order table below (`/clear` or a new
session — bounded context keeps usage low *and* quality high; the default model carries
over, so a new session is not a model switch). You never need to remember task IDs — in
each new session just type, with no argument:

    /refactor-task

The command (defined in `.claude/commands/refactor-task.md`, checked into the repo)
reads this plan, finds the first unchecked Block-1 task in the order table, works
forward one commit per task, and stops at the end of the current step with a summary.
Block 1 is therefore ~8 sessions of typing nothing but `/refactor-task`. Variants:

- `/refactor-task B2` — do exactly one named task; this is how the Block-2 tasks are
  invoked on Opus (`/refactor-task B2`, then `/refactor-task F1`, …).
- `/refactor-task all` — don't stop at step boundaries; run until Block 1 is done or a
  task fails. Note this is *more* expensive than per-step sessions (each request
  re-reads the ever-growing session context) and quality degrades as the context fills —
  use it only if you'd rather not check in at all.

Fallback if the command isn't picked up: "Read REFACTORING_PLAN.md and continue with the
next unchecked Block-1 task, following its rules."

**Escalation:** if a Sonnet task misses its DoD twice, stop grinding and redo it in a
fresh Opus 4.8 session (then return to Sonnet for the next task).

**Reviews** are folded into Block 2 so they cost no extra switch: the Opus block starts
with `/code-review` over everything Block 1 produced (this is also A1's safety net) and
ends with a final `/code-review` of the whole branch.

---

## What is already good — do not touch

- `frontend/src/api/client.ts` — single `apiFetch()` wrapper (auth header, `ApiError`, 204
  handling, dev/prod base-URL logic). Extend it, don't replace it.
- `frontend/src/api/queryKeys.ts` — well-designed query-key factory (`qk`). The problem is that
  many call sites bypass it (task A1), not the factory itself.
- `frontend/src/hooks/realtime/` — WebSocket pooling, heartbeat, backoff, surgical cache updates
  in `applyEvent.ts`, resync on reconnect/visibility. Architecture is right; only the event-name
  typing improves (task A6).
- `frontend/src/auth/AuthContext.tsx` — clean context, no prop drilling, role gating works.
- Custom SVG chart engine (`pages/stats/TrendsChart.tsx` internals) — no chart library, lean and
  working. Task F4 only *moves* logic into hooks, it must not rewrite the math.
- Design tokens in `frontend/src/styles.css` (CSS variables, `--page-pad-x` scaling, theme
  support) — the token system is solid; pages just bypass it sometimes.
- Backend: `app/services/` layering where it exists (`events.py`, `notifications.py`,
  `file_storage.py`, `tournament_view.py`, `services/stats/*`), `api_utils.get_or_404`,
  `auth.py` dependencies (`require_editor` / `require_admin`), wide `response_model=` usage.
- Backend tests in `backend/tests/` and frontend unit tests in `frontend/src/test/` — keep green.

---

## Phase A — API boundary (backend ↔ frontend contract)

Mostly mechanical, low risk. Best phase to start with.

### A1 — Migrate all hardcoded query keys to the `qk` factory  ☑
- **Effort:** M (mechanical, many files) · **Risk:** low–medium (cache semantics) · **Model:** Sonnet 4.6 (gets its safety net from the Block-2 `/code-review`)
- **Problem:** 188 `queryKey: [...]` / `invalidateQueries({ queryKey: [...] })` call sites use raw
  string arrays instead of `qk.*` (e.g. `pages/PlayersAdminPage.tsx:55-135`,
  `pages/live/MatchDetailPage.tsx:58-124`, many in `pages/ProfilePage.tsx`, `pages/ClubsPage.tsx`).
  Find them: `grep -rn 'queryKey: \[' frontend/src --include='*.ts*' | grep -v 'qk\.'`
- **Steps:**
  1. For each raw key, find the matching factory in `frontend/src/api/queryKeys.ts` and use it.
  2. If no factory exists, **add one** to `queryKeys.ts` (same style, `as const`).
  3. **Careful with invalidation:** TanStack matches by prefix. Some invalidations intentionally
     use a *prefix* of a longer key (e.g. `applyEvent.ts:64` invalidates `["me", "notifications"]`
     which prefix-matches `qk.notifications(token)`). For these, add explicit prefix factories
     (e.g. `notificationsAll: () => ["me", "notifications"] as const`) — never "fix" a prefix
     invalidation by appending arguments, that silently breaks invalidation.
- **DoD:** the grep above returns 0 hits outside `queryKeys.ts` and tests; `npm run check` passes;
  manual smoke: entering a match result updates standings, posting a comment updates the list.

### A2 — Add response models for the untyped stats endpoints, delete hand-written FE types  ☑
- **Effort:** M · **Risk:** medium (wire shapes must match exactly) · **Model:** Sonnet 4.6
- **Problem:** 4 endpoints return raw dicts with no `response_model`:
  `backend/app/routers/stats.py:63` (`GET /stats/h2h`), `:74` (`POST /stats/h2h-matches`),
  `:101` (`GET /stats/player-matches`), `:118` (`GET /stats/ratings/history`).
  Because of this the frontend keeps ~130 lines of hand-written mirror types in
  `frontend/src/api/types.ts` (lines ~129–256: `StatsH2HResponse`, `StatsH2HMatchesResponse`,
  `StatsPlayerMatchesResponse`, ratings-history types). These drift silently when the backend
  changes.
- **Steps:**
  1. Treat the hand-written types in `frontend/src/api/types.ts` as the documentation of the
     current wire shape. Define matching Pydantic models in `backend/app/schemas/responses.py`
     (use `| None` optional fields for the conditionally-present parts rather than unions, to keep
     the OpenAPI schema simple).
  2. Attach `response_model=` to the 4 endpoints. **Do not change the returned data** — if the
     model doesn't validate what the endpoint actually returns, fix the model, not the data.
  3. `make test` (backend), then `make gen-types`, then replace the hand-written FE types with
     aliases to the generated ones (same pattern as the existing aliases at the top of `types.ts`)
     and delete the now-redundant definitions.
- **DoD:** backend tests pass; `make gen-types` produces the new models; `types.ts` contains no
  hand-maintained response shapes for these endpoints; `npm run check` passes; stats H2H tab,
  player-matches list and trends/elo history render identically.
- **Note:** Introduced `StatsMatchOut` (match without `tournament_id`/`odds`); downstream helpers
  widened from `m: Match` to `m: StatsMatch` in helpers.ts, standings.ts, trendsMath.ts,
  MatchHistoryList.tsx, StarsPerformanceCard.tsx, PlayerMatchesCard.tsx, TrendsCard.tsx,
  TrendsPreviewCard.tsx, MatchH2HPanel.tsx, PlayerLiveStatsModal.tsx, StatsInsights.tsx.
  `Match` remains assignable to `StatsMatch` (structural subtyping), so all live-page callers
  that pass real `Match` objects are unaffected.

### A3 — Route the 3 raw FormData uploads through one shared upload helper  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** 3 files bypass `apiFetch()` with raw `fetch()` (because FormData must not set
  `Content-Type`): `api/playerAvatars.api.ts:27`, `api/playerHeaders.api.ts:24`,
  `api/comments.api.ts:113`. Each hand-rolls auth headers and throws plain `Error` instead of
  `ApiError` — so upload failures behave differently from every other API error.
- **Steps:** Add an `apiUpload(path, { token, body: FormData, method })` helper in
  `api/client.ts` (or a sibling file) that reuses the base-URL logic, sets only the
  `Authorization` header, and throws `ApiError` like `apiFetch`. Use it in all 3 call sites.
- **DoD:** no `fetch(` outside `client.ts` under `frontend/src/api/`
  (`grep -rn 'fetch(' frontend/src/api | grep -v client.ts | grep -v apiFetch` → empty);
  avatar upload, header-image upload and comment-image upload still work (manual test).

### A4 — Consolidate media URL building into one helper  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** `playerAvatarUrl` (`api/playerAvatars.api.ts:9`), `playerHeaderImageUrl`
  (`api/playerHeaders.api.ts:9`) and `commentImageUrl` (`api/comments.api.ts:98`) each duplicate
  `API_BASE` trimming + `?v=<updatedAt>` cache-busting.
- **Steps:** Add `mediaUrl(path: string, updatedAt?: string | null)` (in `api/client.ts` or
  `api/mediaUrl.ts`); reimplement the three public functions on top of it (keep their names and
  signatures — call sites don't change).
- **DoD:** one place builds media URLs; avatars/headers/comment images still load and bust cache
  after re-upload.

### A5 — Handle 401 centrally (expired token → logout + message)  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** if the JWT expires mid-session, mutations fail with opaque errors; the user stays
  "logged in" until reload. `AuthContext` only validates the token on mount
  (`auth/AuthContext.tsx:95-130`).
- **Steps:** In `apiFetch`/`apiUpload`, on a 401 response dispatch a browser event (e.g.
  `window.dispatchEvent(new CustomEvent("api:unauthorized"))`) before throwing. In
  `AuthContext`, listen for it: clear the stored token, reset auth state, show one toast
  ("Session expired — please log in again."). Guard against firing on the login request itself.
- **DoD:** with an invalidated token (e.g. restart backend with a different `jwt_secret`), the
  next API call logs the user out with the toast instead of leaving broken UI.

### A6 — Type the WebSocket event contract  ☑
- **Effort:** S–M · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** event names + payload shapes exist only as a docstring in
  `backend/app/services/events.py:1-17`; the frontend switches on string literals and coerces
  payloads from `unknown` in `hooks/realtime/applyEvent.ts`.
- **Steps:**
  1. Frontend: create `frontend/src/hooks/realtime/wsEvents.ts` exporting the event-name constants
     (`"tournament.sync"`, `"tournament.deleted"`, `"comment.upsert"`, `"comment.delete"`,
     `"comment.meta"`, `"tournaments.changed"`) and a TypeScript payload type per event (reuse
     generated API types for `tournament` / `comment` payloads). Use them in `applyEvent.ts` and
     anywhere else event names appear as literals.
  2. Backend: define the same names as constants in `services/events.py` and use them at the
     emit sites (grep for the literals) so each name exists exactly once per side.
- **DoD:** no string-literal event names outside the two constants modules; `applyEvent.test.ts`
  still passes; live updates (goal entered on one device shows on another) still work.

### A7 — Document the deliberate type narrowings in `types.ts`  ☑
- **Effort:** S · **Risk:** none · **Model:** Sonnet 4.6
- **Problem:** `frontend/src/api/types.ts:52-106` deliberately narrows some generated types
  (e.g. `Match.state`, `leg`). That's fine, but each override needs a one-line comment saying
  *why* it exists and what backend change would invalidate it — otherwise the next regen looks
  like it can be "cleaned up".
- **DoD:** every override in `types.ts` has a reason comment; anything no longer needed after A2
  is deleted instead.

---

## Phase U — UI consistency (cards, buttons, states, layout)

This is the user-visible payoff. Do U1 first; U2–U8 are independent of each other.

### U1 — Define the surface system once, then add a `CardSection` primitive  ☑
- **Effort:** M · **Risk:** low (pure markup swaps) · **Model:** Sonnet 4.6
- **Problem:** `styles.css` defines 6 surface classes (`.surface:109`, `.surface-2:115`,
  `.card-outer:197`, `.card-chip:208`, `.panel-subtle:381`, `.card-inner-flat:397`) but pages
  compose them ad hoc: 34 occurrences of `card-inner-flat` across 13 files, each re-adding its own
  `rounded-2xl` + `p-3`/no-padding + `space-y-*` (e.g. `pages/stats/PlayersStatsCard.tsx:482`,
  `pages/stats/TrendsCard.tsx:229`, `pages/stats/HeadToHeadCard.tsx:62-70`,
  `pages/live/MatchH2HPanel.tsx:11`). Result: nested sections differ in radius/padding per page.
- **Steps:**
  1. Add a comment block at the top of the surface section in `styles.css` defining the canon:
     `card-outer` = top-level page card · `card-inner-flat` = nested section inside a card ·
     `panel-subtle` = de-emphasized row/info block · `card-chip` = small chip ·
     `surface/surface-2` = shell only.
  2. Create `ui/primitives/CardSection.tsx`:
     `<CardSection title?: ReactNode, actions?: ReactNode, padded?: boolean (default true), className?>`
     rendering `card-inner-flat rounded-2xl` + `p-3 space-y-2` when padded. Match the most common
     existing look exactly so most pages don't visibly change.
  3. Migrate all 34 `card-inner-flat` call sites to `<CardSection>`. Where a call site genuinely
     needs a divergent layout, keep the class but leave a `{/* not CardSection because ... */}`
     comment.
- **DoD:** `grep -rn 'card-inner-flat' frontend/src/pages frontend/src/ui --include='*.tsx'`
  only hits `CardSection.tsx` (plus commented exceptions); stats/live/profile pages look unchanged
  except where padding/radius previously diverged; mobile + desktop checked.

### U2 — Unify card title typography  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** `ui/primitives/Card.tsx:30` renders titles as `text-base font-semibold`,
  `ui/primitives/CollapsibleCard.tsx:104` as `text-sm font-semibold` — two different card title
  sizes app-wide.
- **Decision:** standardize on **`text-sm font-semibold`** (the majority via CollapsibleCard,
  fits the dense mobile-first layout). Change `Card.tsx` accordingly. Hierarchy stays:
  page title `text-xl` > card title `text-sm font-semibold` > section labels `.section-label`.
- **DoD:** both primitives render the same title style; pages using `Card` with titles reviewed
  visually.

### U3 — Button sizes as a primitive prop, kill inline `btn-base` compositions  ☑
- **Effort:** S–M · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** `ui/primitives/Button.tsx` supports only `variant="solid|ghost"`; 15 call sites
  compose `btn-base btn-ghost h-9 px-3 ...` manually (e.g. `pages/stats/PlayersStatsCard.tsx:507`,
  `pages/live/TournamentCommentParts.tsx:95`), with drifting heights (`h-8`/`h-9`/`h-10`) and
  icon-button sizes.
- **Steps:** Extend `Button` with `size?: "sm" | "md"` and `iconOnly?: boolean`. Derive the pixel
  values from the **most common current usage** (so visuals don't change) — count before coding.
  Migrate the inline `btn-base` call sites to the primitive.
- **DoD:** `grep -rn 'btn-base' frontend/src/pages --include='*.tsx'` → 0 (only primitives use
  it); buttons look as before; tap targets ≥ ~36px on mobile.

### U4 — `EmptyState` and `LoadingPlaceholder` primitives  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** ~20 ad-hoc "No data…" / "Loading…" blocks with varying markup, e.g.
  `pages/stats/HeadToHeadCard.tsx:206`, `pages/stats/TrendsCard.tsx:285` (inline text in a sized
  box), `pages/stats/TournamentPositionsGrid.tsx:212`. Some look like content, some like errors;
  reserved heights are ad hoc.
- **Steps:** Add `ui/primitives/EmptyState.tsx` (`icon?`, `title`, `hint?`) and
  `LoadingPlaceholder.tsx` (`heightClassName?`, uses the existing `.skeleton` shimmer). Style to
  match the most common current look. Migrate the obvious call sites (grep for `No `, `Loading…`,
  `Keine ` in pages).
- **DoD:** stats cards, friendlies list, guestbook, comments use the primitives; consistent muted
  text + centered layout; loading does not cause layout jumps on the migrated cards.

### U5 — One modal/sheet implementation  ☑
- **Effort:** M · **Risk:** medium (focus/escape/scroll behavior) · **Model:** Sonnet 4.6
- **Problem:** besides `ui/primitives/Modal.tsx` and `Sheet.tsx`, five components roll their own
  fixed/absolute backdrop + escape handling: `pages/stats/HeadToHeadCard.tsx` (history modal),
  `pages/live/PlayerLiveStatsModal.tsx`, `pages/players/PlayerAvatarEditor.tsx`,
  `ui/primitives/VoteVotersModal.tsx`, `ui/primitives/CommentImageCropper.tsx`
  (`ui/shell/MobileChrome.tsx` is the app shell drawer — leave it).
- **Steps:** Migrate each to `Modal` (or `Sheet` where it's bottom-sheet-like on mobile). Extend
  `Modal` with the minimum needed (e.g. `size`/`fullScreenOnMobile`) instead of keeping forks.
  One component per commit.
- **DoD:** all five render through Modal/Sheet; escape closes, backdrop click closes, body scroll
  locked, works at 375px and desktop; croppers still crop correctly (touch-test).

### U6 — `PageLayout` wrapper for page scaffolding  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** every page repeats `<div className="page">` + the desktop-only
  `<div className="mb-4 hidden lg:block"><h1 className="text-xl font-bold ...">` header pattern,
  with small drifts (`space-y-3` vs `space-y-4`, presence of `.page-x`).
- **Steps:** Add `ui/layout/PageLayout.tsx` (`title`, optional `actions`, children). Migrate the
  top-level pages (`TournamentsPage`, `StatsPage`, `ClubsPage`, `FriendliesPage`,
  `PlayersAdminPage`, `SettingsPage`, `ProfilePage`, dashboard). Live pages with custom bleed
  layouts may keep their structure — document why inline.
- **DoD:** consistent page padding/title behavior across pages; no double margins; mobile +
  desktop checked.

### U7 — Form fields through the `Input` primitive  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** `ui/primitives/Input.tsx` (label + field) exists but most forms hand-roll
  `<label><div className="input-label">…</div><input className="input-field"/></label>`
  (e.g. `pages/ClubsPage.tsx:170-175`, tournament creation, friendly setup).
- **Steps:** Migrate hand-rolled label+input/textarea blocks to `Input`/`Textarea`. Extend the
  primitive only if a call site needs something it lacks (e.g. trailing unit, error text).
- **DoD:** forms look unchanged; `input-label` appears only inside primitives (grep).

### U8 — Typography pass on dense text (tables, meta, legends)  ☑
- **Effort:** S · **Risk:** low (visual-only, subtle) · **Model:** Sonnet 4.6
- **Problem:** dense text sizes drift: `text-[10px]` / `text-[11px]` / `text-xs` / `text-[12px]`
  used interchangeably for table cells, legends and meta lines (e.g. `pages/stats/StatsTable.tsx:6`
  `text-[11px]` vs `text-xs` elsewhere; `pages/stats/RatingsCard.tsx:19-20`).
- **Decision:** table/list cells & legends → `text-xs`; secondary meta lines → `text-[11px]`;
  nothing below 11px. Apply per file in stats pages first.
- **DoD:** stats tables and meta rows use the two canonical sizes; spot-check readability on a
  phone.

---

## Phase F — Frontend architecture (big components, duplication)

Do these **after** Phase U primitives exist, so extracted components are built with them.
F1–F3 are the big wins; each is splittable into multiple commits.

### F1 — Split `pages/stats/StatsInsights.tsx` (1562 lines)  ☐
- **Effort:** L · **Risk:** medium · **Model:** Opus 4.8 (Block 2)
- **Mixed today:** tab routing (`?view=`), per-view rendering for ~9 sub-views, the trends
  metric/mode computation (lines ~107–276), chart pan/zoom touch handling (lines ~307–378).
- **Target structure:**
  - `pages/stats/StatsInsights.tsx` — tab routing + filters + layout only (~150 lines).
  - `pages/stats/trends/TrendsExplorer.tsx` — metric picker, view mode, range UI.
  - `pages/stats/trends/useChartData.ts` — the elo/form/metric `useMemo` branches, as a pure-ish
    hook `useChartData(metric, mode, view, rollN, rows, matchesQs, eloQ)`.
  - `pages/stats/trends/useChartGestures.ts` — pinch/pan handlers.
  - One file per remaining sub-view (`PositionsView`, `H2HView`, `RecordsView`, …) if not already
    separate — move, don't rewrite.
- **Rule:** pure move-and-import refactor; no logic edits. Add a unit test for `useChartData`'s
  pure computation (extend `src/test/trendsMath.test.ts` style).
- **DoD:** `StatsInsights.tsx` < ~250 lines; all stats tabs render as before (click through every
  tab, switch metric/mode/scope, pan/zoom the chart on touch); `npm run check` passes.

### F2 — Split `pages/ProfilePage.tsx` (1413 lines)  ☐
- **Effort:** L · **Risk:** medium · **Model:** Opus 4.8 (Block 2)
- **Target:** keep `ProfilePage.tsx` as coordinator (URL params, tabs, queries); extract
  `profile/ProfileHeader.tsx` (avatar/banner/bio/cup badges), `profile/ProfileStatsSection.tsx`,
  `profile/PokesSection.tsx`, `profile/MatchHistorySection.tsx`. Guestbook is already separate —
  reuse as-is.
- **Note:** the client-side "favorite teammates" computation (`ProfilePage.tsx:359-386`) moves
  into a small hook or util with a unit test; consider a backend endpoint only later (out of
  scope here).
- **DoD:** own-profile and foreign-profile views work (editing only on own); page < ~400 lines.

### F3 — Split `pages/live/TournamentCommentsCard.tsx` (1233 lines)  ☐
- **Effort:** L · **Risk:** medium · **Model:** Opus 4.8 (Block 2)
- **Target:** `useCommentMutations(tournamentId)` hook (create/edit/delete/vote/pin/read),
  `comments/CommentFilterBar.tsx` (scope chips + match filter), `comments/CommentList.tsx`
  (tree rendering). `CommentCreateComposer` / `TournamentCommentParts` stay separate files.
- **Why:** `MatchDetailPage` can then reuse the mutations hook instead of duplicating.
- **DoD:** comments work end-to-end (post, reply, edit, vote, pin, image attach, unread
  jump/mark-read) on live tournament and match detail; realtime updates still merge.

### F4 — Extract chart hooks from `pages/stats/TrendsChart.tsx` (1019 lines)  ☑
- **Effort:** M · **Risk:** medium — **do this only as pure code movement** · **Model:** Sonnet 4.6
- **Target:** `charts/useChartScaling.ts` (y-scale + ticks), `charts/useCrosshair.ts`,
  pure SVG path helpers into `charts/chartSvg.ts` with unit tests. The rendering component keeps
  its visual output byte-identical.
- **DoD:** trends chart renders identically (compare screenshots), pan/zoom/crosshair fine on
  touch + mouse.

### F5 — Shared match-display helpers  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** team-name joining `players.map(p => p.display_name).join(" + ")` is duplicated in
  6 files (`pages/live/CurrentGameSection.tsx:18`, `pages/live/MatchDetailPage.tsx:164`,
  `pages/live/MatchList.tsx:107`, `pages/stats/StatsInsights.tsx:1296`,
  `pages/tools/FriendlyMatchesListCard.tsx:133`, +1); `sideOf`/`matchStats` live in
  `pages/stats/standings.ts` but are useful app-wide.
- **Steps:** Create `src/utils/matchDisplay.ts` with `teamName(side?: MatchSide): string` (and
  move/re-export `sideOf`, `winnerSide` if it keeps imports simpler). Replace the 6 call sites.
- **DoD:** one definition of team-name formatting; grep for `join(" + ")` → only the helper.

### F6 — Round out `utils/format.ts`  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Add:** `fmtShortDate` (currently local in `StatsInsights.tsx:~1000`), `fmtRating`
  (scattered `Math.round(rating)`), `fmtRank(pos, total)`. Replace inline occurrences
  (grep `toLocaleDateString` in pages — 5 hits — and `Math.round(` on ratings).
- **DoD:** formatting helpers used at call sites; `src/test/format.test.ts` extended for the new
  helpers.

### F7 — Lazy-load heavy routes  ☑  *(optional)*
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** `app/App.tsx` imports all pages eagerly (0 uses of `lazy(`).
- **Steps:** `React.lazy` + `<Suspense fallback={<PageLoadingScreen/>}>` for `StatsPage`,
  `ProfilePage`, `ClubsPage`, `PlayersAdminPage`. Keep dashboard + live eager (most-visited).
- **DoD:** `npm run build` succeeds, navigating to stats/profile shows the loading screen at most
  briefly; PWA resume-to-last-route still works.

---

## Phase B — Backend cleanup

Independent of the frontend phases (except B2 ordering note). Python, FastAPI + SQLModel.

### B1 — Deduplicate the media upsert triplication  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** three near-identical functions: `_upsert_avatar_file`
  (`app/routers/players.py:70-99`), `_upsert_profile_header_file` (`players.py:126-155`),
  `_upsert_comment_image_file` (`app/routers/comments.py:109-138`). Same write/replace/delete-old
  logic, different row class + path builder.
- **Steps:** Add one generic helper in `app/services/file_storage.py`, e.g.
  `upsert_media_row(s, *, row_cls, row_id, content_type, data, path_builder, updated_at=None)`,
  and reduce the three functions to one-line wrappers (keep their names so routers don't churn).
- **DoD:** `make test` passes (esp. avatar/header/comment-image tests); uploading a new avatar
  with a different extension deletes the old file (manual or test).

### B2 — Centralize permission checks  ☐
- **Effort:** M · **Risk:** medium (security-relevant — review carefully) · **Model:** Opus 4.8 (Block 2)
- **Problem:** owner/admin and "tournament is done" checks are inlined repeatedly:
  `players.py:354, 417, 452, 487, 520, 770, 897` (owner-or-admin variants),
  `tournaments.py:517, 587, 615` ("done" blocks), similar in `comments.py`.
- **Steps:** Create `app/services/authorization.py` with small, explicit helpers, e.g.
  `require_owner_or_admin(claims, owner_player_id)` (raises 403),
  `ensure_tournament_editable(t, claims)` (raises 409/403 for done tournaments). Replace the
  inline checks **one router at a time**, keeping the exact same status codes and detail strings
  (tests must not change).
- **DoD:** all listed call sites use the helpers; `make test` green;
  `backend/tests/test_player_profiles_auth.py` unchanged and passing.

### B3 — Extract fat endpoint bodies into services  ☑
- **Effort:** M–L · **Risk:** medium · split into 3 commits · **Model:** Sonnet 4.6
- **Targets:**
  1. `list_tournaments` (`app/routers/tournaments.py:301-360`) → `services/tournament_view.py`
     (it already serializes tournaments) or a new `services/tournament_list.py`: fetching,
     status map, cup stakes, standings, sorting, payload building.
  2. Guestbook listing (`app/routers/players.py:594-661`: entries + parent map + vote aggregates
     + author names + payload) → new `services/guestbook.py` (note: `services/guestbook_summary.py`
     already exists — keep naming consistent).
  3. Comment listing (`app/routers/comments.py:346-~450`) → `services/comments_view.py`.
- **Rule:** pure extraction; routers keep auth/validation + call the service. Return shapes
  byte-identical (backend tests + `make gen-types` diff must be empty).
- **DoD:** the three endpoints are < ~30 lines each in the router; `make test` green;
  `make gen-types` produces no schema diff.

### B4 — Resolve the stats layering split  ☑
- **Effort:** M · **Risk:** medium · **Model:** Sonnet 4.6
- **Problem:** stats logic lives in three places: `app/stats_core.py` (302 lines),
  `app/services/stats/*` (h2h, odds, ratings, streaks, players, player_matches), and standings
  helpers inside `app/routers/tournaments.py` (`_compute_points_table_finished`, `_top_group`,
  ~lines 804–867). Unclear where new stats go.
- **Steps:**
  1. Move `app/stats_core.py` → `app/services/stats/core.py`; update imports
     (`grep -rn 'stats_core' backend/`). Keep `app/stats.py` as a thin re-export only if many
     imports depend on it, otherwise update them too.
  2. Move the tournament-points helpers from the tournaments router into
     `services/stats/core.py` (or `services/tournament_view.py` if they're only used for
     serialization) and import them back.
- **DoD:** no stats computation in `app/` root or in routers; `make test` green (notably
  `tests/test_stats_core.py`, update its import).

### B5 — Consistent error helpers  ☑
- **Effort:** S · **Risk:** low · **Model:** Sonnet 4.6
- **Problem:** routers raise `HTTPException` ad hoc; `api_utils.get_or_404` exists but 400/403/409
  styles vary. The frontend only displays `detail`, so **no envelope redesign** — just
  consistency.
- **Steps:** Add tiny helpers next to `get_or_404` (`bad_request(msg)`, `forbidden(msg)`,
  `conflict(msg)`); use them in routers touched by B2/B3 (don't sweep the whole codebase in one
  commit). Document the convention in a comment in `api_utils.py`
  (400 invalid input · 403 not allowed · 404 missing · 409 state conflict · 413 too large).
- **DoD:** helpers exist and are used in the refactored routers; status codes unchanged.

### B6 — Batch queries in `list_tournaments`  ☑  *(optional, measure first)*
- **Effort:** M · **Risk:** medium · **Model:** Sonnet 4.6
- **Problem:** the tournament list builds standings per tournament in a loop (N+1-ish;
  `tournaments.py:301-360`). Only worth it if the dashboard/list feels slow with real data.
- **Steps:** After B3 (logic is in one service), log SQL in dev, batch with `selectinload` /
  single queries keyed by tournament id.
- **DoD:** identical response payload (snapshot-compare JSON before/after); fewer queries.
- **Note:** Done in `services/tournament_list.py` (the B3 service). Two changes, both
  behavior-preserving: (1) one `select(Match).options(selectinload(sides→players))` for all
  matches, grouped by `tournament_id` in Python (preserving `order_index` order), replacing the
  per-tournament matches query; (2) winner/decider `display_name` lookups collected across all
  tournaments and resolved in one `Player.id.in_(...)` query instead of up to two per tournament.
  Measured with a temporary before/after harness (7 tournaments, 4 finished): **41 → 21 queries**,
  and the `/tournaments` JSON was byte-identical except for row creation timestamps (different per
  test run). The per-tournament status map and cup-stakes queries were already batched.

---

## Review follow-ups — Block 2, step 9 (`/code-review`)  ☑

The first Block-2 `/code-review` (2026-06-11) over the whole branch surfaced a set of issues,
each tracing back to a Block-1 task that didn't fully meet its DoD. All fixed on this branch
(commits `84a0401`..`56f0c0e`); backend `make test`+`make lint` and frontend `npm run check`+
`npm run build` green.

- **A2 — `/stats/player-matches` 500 (real bug):** the player-not-found early return omitted the
  `scope` field the new `response_model` requires → `ResponseValidationError`. Fixed; the sibling
  stats endpoints (h2h, h2h-matches, ratings/history) were audited and already emit every required
  field. `fix(A2)`.
- **A6 — dead WS payload types:** the per-event payload types were never wired into `applyEvent.ts`
  (reducers used `unknown`). Made `asObj<T>()` generic so the contract is compile-time checked while
  the defensive runtime coercion is preserved. `refactor(A6)`.
- **F5 — incomplete dedup:** `winnerSide` (×6) and a local `sideBy` (×2) survived; moved into
  `helpers.ts` and re-pointed all call sites. `refactor(F5)`.
- **F6 — missed call sites:** `fmtRank` (StatsInsights), `fmtDate` (MatchH2HPanel — also fixed a
  UTC-midnight off-by-one for negative-offset timezones), `fmtAvg`/`fmtRating` (standings).
  `refactor(F6)`.
- **B4 — leftover shim:** `app/stats_core.py` had zero importers; deleted (the `app/stats.py` shim
  is still used and stays). `refactor(B4)`.
- **B6 — half-fixed N+1:** the cup-stakes path still re-queried matches per (cup×tournament) despite
  B6's batch; now reuses the batched `matches_by_tid`. `perf(B6)`.
- **U4 / U5 — primitive polish:** documented the LoadingPlaceholder-vs-InlineLoading split; added a
  `scrollBody` flex slot to `Modal` so callers drop the `calc(vh-rem)` header-height guesses (this
  one still wants a mobile/desktop visual spot-check). `refactor(U4)`, `refactor(U5)`.
- **Investigated, no change:** narrowing `StatsMatch.state` to `MatchState` was rejected — it
  cascades `as` casts to every stats-data entry point (state is a plain string on the wire), so the
  single documented cast in MatchHistoryList is the intended boundary. The A5 401 toast/logout
  (cold-load + upload) is working as A5 specified; documented in code so it isn't re-flagged.

Remaining Block-2 work is unchanged: **B2**, then **F1–F3**, then the final `/code-review` (step 12).

---

## Explicitly out of scope (decided against — don't let a model talk you into them)

- Refresh tokens / auth rework (single-JWT + A5's 401 handling is enough for this app's size).
- Pagination envelopes for list endpoints (datasets are small; revisit if they grow).
- Runtime response validation (zod) on the frontend — generated types + A2 cover it.
- A domain-event bus on the backend — `services/events.py` + `notifications.py` are sufficient;
  keep notification calls explicit at the call sites.
- New UI framework/library, visual redesign, CSS framework migration.
- CI pipeline changes.

---

## Verification

**Per-commit commands**

```bash
# backend (from repo root)
make test          # pytest
make lint          # ruff

# types boundary (after any backend schema/response change)
make gen-types && cd frontend && npx tsc --noEmit

# frontend
cd frontend && npm run check    # typecheck + eslint + vitest
cd frontend && npm run build
```

**Manual smoke checklist** (run at ~375px mobile width *and* ≥1024px desktop; dev servers via
`make dev`):

- [ ] Dashboard: cup card, current-match preview, trends preview render.
- [ ] Tournaments list → open a live tournament; tabs switch; standings update after entering a
      result; reorder matches (editor); admin panel actions.
- [ ] Comments: post / reply / edit / vote / pin / attach image / unread jump + mark-all-read;
      second device (or second browser) receives realtime updates.
- [ ] Match detail page: score editing, clubs per side, H2H panel.
- [ ] Stats: every tab (players, trends incl. pan/zoom on touch, positions, h2h matrix + detail,
      streaks, stars, records, ratings); scope switch tournaments/both/friendlies.
- [ ] Profile: own (edit avatar/header/about) + foreign (read-only); guestbook + pokes.
- [ ] Friendlies: create, edit score, list.
- [ ] Clubs: create/edit/delete club, stars editor.
- [ ] Login/logout; reader (logged out) sees read-only UI; admin-only actions hidden for editor.
- [ ] PWA: installed app still gets push notifications; resume opens last route.

**Suggested order of work**

| Block | Step | Tasks | Rationale |
|-------|------|-------|-----------|
| **1 — Sonnet 4.6** | 1 | A3, A4, A5, A7 | Small, isolated API-layer wins; build confidence. |
| | 2 | A1 | Mechanical sweep; touches many files — do before component splits to avoid conflicts. |
| | 3 | A2, A6 | Contract work (backend + regen + FE swap). |
| | 4 | U1, U2, U3, U4 | Primitives first… |
| | 5 | U5, U6, U7, U8 | …then migrations using them. |
| | 6 | B1, B5, B3, B4 | Backend quick wins, then service extraction + stats layering. |
| | 7 | F5, F6 | Shared helpers before the big splits. |
| | 8 | F4, F7, B6 *(optional)* | Polish — if you do these at all, do them here to keep the single switch. |
| **2 — Opus 4.8** | 9 | `/code-review` the branch | Safety net over everything from Block 1 (especially A1). Fix findings before continuing. |
| | 10 | B2 | Authorization centralization — security-relevant. |
| | 11 | F1, F2, F3 | The big component splits (the Phase-U primitives now exist). |
| | 12 | Final `/code-review` | Last pass before merging to main. |

Avoid running two tasks that touch the same files in parallel (notably: A1 conflicts with
everything in F; finish A1 first).
