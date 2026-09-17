# Containers, states and actions

Scope: `frontend/src` (excluding `api/generated/` and `src/test/`), read on 2026-09-17 at `main` (`56d8719` plus one dirty file). Every count below is from `grep`/`awk` over the `.tsx`/`.ts`/`.css` sources, followed by reading the file; where a count was sampled rather than enumerated it says so. Line numbers are as of that tree. "Screen" names what a viewer is looking at when the code runs.

Method note: the styled surfaces are defined in one stylesheet (`frontend/src/styles.css`) as three classes (`.card`, `.inset`, `.chip`) plus a handful of control classes (`.btn-*`, `.input-field`, `.select-field`, `.stepper`, `.section-label`, `.section-head`, `.list-divided`, `.row`, `.row-tap`, `.skeleton`, `.overlay-scrim`, `.nav-shell`, `.pull-refresh-indicator`). Everything else is Tailwind class strings in components. Counts of a class name are counts of literal occurrences in JSX/`cn()` strings, comments excluded.

---

## Surfaces — 9 box treatments (3 shared classes + 6 hand-rolled families), and the shared ones are re-padded at half their call sites

**What varies:** the box a piece of content sits in — background tint, border, radius, shadow — and, within the two shared box classes, how much padding the call site keeps.

- **A — `.card` (level 1)** · 25 places: `rounded-2xl p-3`, `bg-card-outer`, 1px hairline at 0.55 alpha, two-layer drop shadow (`styles.css:52-57`).
  - `frontend/src/ui/SelectClubsPanel.tsx:179` — (the "Clubs" panel on match edit, friendly form, friendlies row editor, live Current tab) `card overflow-hidden p-0`
  - `frontend/src/pages/SettingsPage.tsx:40` — (every Settings group) `card min-w-0`
  - `frontend/src/pages/NotFoundPage.tsx:22` — (404) `card … py-10`
  - `frontend/src/ui/FilterSelect.tsx:130` — (dropdown menu: club star/league filter, comments scope, decider winner/loser) `card fixed z-[60] … px-0 py-1 shadow-pop`
  - `frontend/src/ui/primitives/ErrorToast.tsx:98` — (error toast) `card p-2 shadow-xl`
  - `frontend/src/pages/stats/PlayerProfile.tsx:97` — (Stats → Player, nobody picked) `card py-6` on an `EmptyState`
  - `frontend/src/pages/stats/PlayerProfile.tsx:99` — (Stats → Player hero row)
  - `frontend/src/pages/profile/GuestbookSection.tsx:95` — (profile Guestbook feed) `card min-w-0 p-0`
  - `frontend/src/pages/stats/h2h/MatchupView.tsx:174`, `:200` — (Stats → matchup header, matchup tiles)
  - `frontend/src/pages/live/MatchDetailPage.tsx:390`, `:466` — (match detail → Edit result: "Result", "Advanced")
  - `frontend/src/pages/ideas/IdeasPage.tsx:268` — (Ideas feed) `card min-w-0 p-0`
  - `frontend/src/ui/shell/AppCrashBoundary.tsx:55` — (app crash screen)
  - `frontend/src/ui/primitives/FilterPill.tsx:314` — (stats/friendlies filter popover) `card fixed z-40 w-64 … shadow-pop backdrop-blur-md`
  - `frontend/src/pages/stats/CupDetail.tsx:105` — (Stats → Cups holder block)
  - `frontend/src/pages/live/AdminPanel.tsx:478` — (fallback wrapper; the one caller `LiveTournamentPage.tsx:769` passes `wrap={false}`, so this `card` renders nowhere)
  - `frontend/src/pages/live/TournamentCommentsCard.tsx:888` — (tournament Comments feed, match Comments tab, live Current tab's comments) `card min-w-0 p-0`
  - `frontend/src/pages/tournaments/NewTournamentForm.tsx:59`, `:72`, `:83` — (Tournaments → New: Name, Mode, Players)
  - `frontend/src/ui/shell/NotificationBell.tsx:125` — (bell popover) `card absolute z-50 … p-0 shadow-pop backdrop-blur-md`
  - `frontend/src/ui/primitives/Modal.tsx:101` — (every sheet: club picker, image croppers, avatar editor, H2H history, voters, confirm dialogs) `card w-full p-3 sm:p-4`
  - `frontend/src/ui/primitives/Modal.tsx:122` — (centered-only modal) `card p-4 …` — 0 callers (all 6 `<Modal>` sites pass `fullScreenOnMobile`)
  - `frontend/src/pages/LoginPage.tsx:47` — (Login) via `<Card variant="card">`
  - **Padding is overridden at 11 of these 25 sites with 7 different values**: `p-0` ×5 (`SelectClubsPanel:179`, `GuestbookSection:95`, `IdeasPage:268`, `TournamentCommentsCard:888`, `NotificationBell:125`), `p-2` (`ErrorToast:98`), `px-0 py-1` (`FilterSelect:130`), `py-6` (`PlayerProfile:97`), `py-10` (`NotFoundPage:22`), `p-3 sm:p-4` (`Modal:101`), `p-4` (`Modal:122`).

- **B — `.inset` (level 2)** · 58 rendered places (68 grep hits minus 10 comments/definitions): `rounded-xl p-3`, `bg-card-chip` at 0.5, no border; in the light theme it swaps to `bg-card-inner` with a hairline (`styles.css:60-72`).
  - Default `p-3` kept at 13: `StatTile.tsx:30` (17 tiles on Stats → Player, Stats → Cups, profile Stats, matchup), `MatchOverviewPanel.tsx:70` (score panel on dashboard, live Overview/Current, match edit, friendly form, friendlies editor), `CardSection.tsx:22` (match H2H tab ×3, voters modal ×3), `IdeaCard.tsx:115` (each idea), `CommentList.tsx:234/238/249/262` → `TournamentCommentParts.tsx:88` (each root comment), `WhatIfSection.tsx:249` (What-if projection), `OverviewSection.tsx:132`, `:167`, `:175`, `:199` (live Overview winner / tie / empties), `PushNotificationsSettings.tsx:82`, `:125`, `:130`, `:135` (Settings → Notifications notes), `GuestbookEntryCard.tsx:96` (`inset p-3`, explicit).
  - `px-3 py-2` at 20: `ClubPicker.tsx:291` (search box), `SelectClubsPanel.tsx:97` (club slot), `FilterSelect.tsx:108` (dropdown trigger), `HeadToHeadRows.tsx:80`, `:139` (duo rows), `ProfileOverviewTab.tsx:46`, `:51`, `:156`, `:162` (rival / teammate cards), `PlayerStreakChips.tsx:54` (streak tiles), `MatchDetailPage.tsx:292`, `:303` (invalid / not-found), `H2HView.tsx:73`, `:79`, `:589` (rival cards, rivalry rows), `explainers.tsx:27` (Elo note), `MatchH2HPanel.tsx:189`, `:252` (error / empty), `LiveTournamentPage.tsx:606` (invalid id).
  - `px-3 py-2.5` at 3: `DuoDetail.tsx:43`, `MatchH2HPanel.tsx:47` (summary cards).
  - `p-2` at 4: `TrendsExplorer.tsx:147`, `TrendsPreviewCard.tsx:339` (chart boxes), `TournamentCommentParts.tsx:315` (comment image box), `ErrorToast.tsx:100` (`py-2`).
  - `p-1.5` at 3: `OverviewSection.tsx:230`, `:264`, `:304` (live Overview standings / next / played).
  - `py-2` at 2: `ViewportReadout.tsx:242`, `:273` (Settings → Diagnostics readout).
  - `p-0` at 6: `AvatarCircle.tsx:70` (every avatar disc is an `inset p-0 rounded-full`), `CommentImageCropper.tsx:200`, `PlayerAvatarEditor.tsx:207` (crop viewports), `DiagnosticsSettings.tsx:135`, `CardSection.tsx:22` (`padded={false}`).
  - `inset` used as an `EmptyState` wrapper at 2: `OverviewSection.tsx:175`, `:199`.
  - Net: **8 distinct paddings on one surface class** (`p-3`, `px-3 py-2`, `px-3 py-2.5`, `p-2`, `py-2`, `p-1.5`, `p-0`, `mx-1 mb-1 mt-1` at `ClubPicker.tsx:354`).

- **C — `.chip` (level 3 tag)** · 11 places: `rounded-full px-2.5 py-1 text-xs`, chip bg, hairline (`styles.css:76-81`). `VoteVotersModal.tsx:57`, `:74` (voter names), `TournamentCommentParts.tsx:172`, `:173` ("pinned"/"editing"), `CommentComposer.tsx:210` (Goal/Shots badge), `AdminPanel.tsx:215`, `:218` (status / second-leg), `IdeaCard.tsx:231`, `:236`, `:279` (kind, areas, vote count), `IdeaComposer.tsx:82` ("New idea"), `TrendsExplorer.tsx:171` (legend key, as a `<button>`).

- **D — bordered message box (hand-rolled)** · 5 places: `rounded-xl border border-{error|warn}/40 bg-{error|warn}/10 p-3 text-xs text-{error|warn}`.
  - `frontend/src/ui/primitives/ConfirmDialog.tsx:49` — (the "what is lost" block in 9 of 13 confirm dialogs)
  - `frontend/src/ui/shell/AppCrashBoundary.tsx:66` — (crash screen message)
  - `frontend/src/ui/layout/PushNotificationsSettings.tsx:140` — (Settings → Notifications error)
  - `frontend/src/ui/layout/DiagnosticsSettings.tsx:31-32`, `:85` — (Settings → Diagnostics entry, error or warn tone)
  - `frontend/src/pages/live/MatchDetailPage.tsx:365` — (Edit result conflict, warn tone)

- **E — `rounded-xl` boxes with their own fill/border, neither `card` nor `inset`** · 8 places:
  - `frontend/src/pages/SettingsPage.tsx:234` — (Appearance theme tiles) `rounded-xl border border-border-card-chip/40 px-2.5 py-2`, selected `bg-bg-card-chip/55`
  - `frontend/src/pages/SettingsPage.tsx:169`, `:183` — (Account "View as" tiles) `rounded-xl px-2.5 py-2`, no border, selected `bg-bg-card-chip/50`
  - `frontend/src/pages/profile/ProfileHeader.tsx:136` — (profile banner) `rounded-xl border border-border-card-inner/60 bg-bg-card-inner`
  - `frontend/src/ui/shell/AppCrashBoundary.tsx:98` — (stack `<pre>`) `rounded-xl bg-bg-card-chip/50 p-3`
  - `frontend/src/pages/live/comments/CommentComposer.tsx:179-182` — (goal side choice) `rounded-xl border px-2 py-2`, `border-border-card-chip/40 bg-bg-card-chip/50` / selected `border-accent/40 bg-accent/15`
  - `frontend/src/ui/primitives/SegmentedSwitch.tsx:64` — (every segmented switch track) `rounded-xl bg-bg-card-chip/35 p-1`
  - `frontend/src/pages/live/WhatIfSection.tsx:294` — (What-if focus row) `rounded-xl bg-accent/10`
  - `styles.css:296-301` `.stepper` — (goal steppers) `rounded-xl`, chip bg 0.35, border chip 0.65
  - (Form fields, for comparison: `.input-field`/`.select-field` `styles.css:265-286` are `rounded-xl`, chip bg at full alpha, full-alpha hairline — a third fill/border pair on the same radius.)

- **F — `rounded-md` micro tiles** · 11 places, all on two screens: `PositionsView.tsx:34-49`, `:408`, `:418` (Stats → Positions grid and legend), `H2HView.tsx:461`, `:463`, `:472` (Stats → H2H matrix). The only `rounded-md` in the app.

- **G — docked bottom strip inside a card** · 3 places, identical string: `sticky bottom-nav-clear z-10 rounded-b-2xl border-t border-border-card-outer/55 bg-bg-card-outer p-2 lg:bottom-0` — `GuestbookSection.tsx:148`, `IdeaComposer.tsx:75`, `CommentComposer.tsx:323+329`.

- **H — chrome surfaces** · 5 places, each its own recipe: mobile top bar `nav-shell` (`MobileChrome.tsx:68`: `border-b` 0.8, page bg, `shadow-pop` once scrolled); bottom tab bar `nav-shell border-t` (`BottomTabBar.tsx:276`); desktop sidebar `border-r border-border-card-chip/40 bg-bg-card-outer/60` (`Sidebar.tsx:117`); drawer `border-r border-border-card-chip/40 bg-bg-card-outer shadow-pop` (`MobileChrome.tsx:143`); floating filter capsule `rounded-full border-2 border-accent/45 bg-bg-card-outer shadow-pop backdrop-blur-md` (`FilterPill.tsx:288`); pull-to-refresh `rounded-full` bg-card-inner 0.92 + hairline + its own shadow (`styles.css:433-443`).

- **I — nesting depth observed**: card › inset › inset at `TournamentCommentsCard.tsx:888` › `TournamentCommentParts.tsx:88` › `:315` (comment image box) and, because every avatar is an `inset p-0` (`AvatarCircle.tsx:70`), card › inset › inset on every idea (`IdeaCard.tsx:115` › `:123`) and guestbook entry (`GuestbookEntryCard.tsx:96` › `:110`). `Modal` (card) › `inset` search + `inset` star history at `ClubPicker.tsx:291`, `:354`. `card` › `StatTile` (inset) at `CupDetail.tsx:105` › `:119`. `ErrorToast.tsx:98` › `:100` card › inset for a two-line toast.

- **Radius inventory** (all `.tsx`): `rounded-full` ×64, `rounded-xl` ×48, `rounded-md` ×11, bare `rounded` ×1 (`StandingsTable.tsx:347`, the leader bar), `rounded-lg` ×4 (all `SegmentedSwitch.tsx:71`, `:83`), `rounded-b-2xl` ×4, `rounded-r` ×3, `rounded-t` ×2; `rounded-2xl` only via `.card`.
- **Shadow inventory**: `.card`'s own two-layer shadow; `shadow-pop` ×7 sites (3 popovers, drawer, filter capsule, scrolled top bar, dropdown menu); `shadow-xl` ×1 (`ErrorToast.tsx:98`); `shadow-sm` ×3 (`CupOwnerBadge.tsx:28`, `StreakPatches.tsx:31`, `TournamentLaurelMarkers.tsx:24`); `shadow-card` and `shadow-focus` are defined in `tailwind.config.cjs:62-64` and used 0 times.

---

## Section headings inside a page — 8 treatments

**What varies:** size, weight, case, colour, the element used, the rule beside it, and the gap above it.

- **A — uppercase label with trailing hairline** (`section-head` + `section-label`: `text-xs font-semibold uppercase tracking-wider text-text-muted`, `mb-2`, rule after) · 31 places.
  - `frontend/src/pages/stats/StatsSection.tsx:36` — (every block in Stats: Table, Positions, Streaks, Records, Cups, H2H, Player, matchup — 20+ instances through this one component)
  - `frontend/src/pages/live/OverviewSection.tsx:128`, `:180`, `:205`, `:258`, `:285` — (live Overview: Winner / Current match / Standings / Next / Played)
  - `frontend/src/pages/live/AdminPanel.tsx:225`, `:292`, `:313`, `:343` — (live Controls: Actions / Date / Name / Decider)
  - `frontend/src/pages/live/LiveTournamentPage.tsx:688`, `:766` — (Standings decider note; Controls tab title)
  - `frontend/src/pages/live/WhatIfSection.tsx:277`, `:325` — (Projected table / Every match)
  - `frontend/src/pages/live/MatchList.tsx:66` — (Matches tab count + view switch)
  - `frontend/src/pages/profile/ProfileOverviewTab.tsx:100`, `:127`, `:137`, `:176` — (About / Rivals / Favorite teammates / Recent matches)
  - `frontend/src/pages/profile/ProfileStatsSection.tsx:73`, `:114`, `:123` — (Key numbers / Profile net / Streaks)
  - `frontend/src/pages/dashboard/CupsPreviewCard.tsx:64`, `StandingsPreviewCard.tsx:24`, `TrendsPreviewCard.tsx:278`, `CurrentMatchPreviewCard.tsx:58` — (dashboard sections; three of the four labels are `<Link>`s with a chevron, one is a span)
  - `frontend/src/pages/TournamentsPage.tsx:146` — (month groups)
  - `frontend/src/pages/tools/FriendlyList.tsx:198` — (day groups, as an `<h2>`; the only `section-label` on an `h2`)
  - `frontend/src/pages/tools/FriendlyMatchCard.tsx:430` — (friendly form "Setup")
  - `frontend/src/pages/PlayersAdminPage.tsx:169` — (Players → Add "Create player")

- **B — the same uppercase label with no rule, used as a control caption** · 12 places: `ClubsPage.tsx:391`, `:404`, `:418` (Clubs browse: Group / Stars / League next to a switch and two selects), `controls.tsx:6` (slider label), `StatsTable.tsx:128` ("Columns"), `TrendsExplorer.tsx:36` (Metric / View / Range), `WhatIfSection.tsx:235` ("Player"), `IdeaCard.tsx:331` ("Status" beside a select), `IdeasPage.tsx:245` ("Area" beside chips), `IdeaFields.tsx:131`, `:162` ("Kind", "Where?"), `ClubList.tsx:156` (group header inside a collapsible).

- **C — sentence-case `text-sm font-semibold` block title** · 22 places, on 4 different elements:
  - as `<h2>` ×10: `Card.tsx:30`, `SettingsPage.tsx:41` (`mb-3`), `GuestbookSection.tsx:97`, `TournamentCommentsCard.tsx:890`, `IdeasPage.tsx:270` (these three sit in a `border-b … px-3 py-2.5` header row with an icon and a count), `MatchDetailPage.tsx:391`, `:467` (`mb-2`), `NewTournamentForm.tsx:60`, `:73`, `:85`
  - as `<h3>` ×2: `ClubStarHistory.tsx:51`, `MatchH2HPanel.tsx:48`
  - as `<div>` ×8: `CardSection.tsx:25`, `CollapsibleCard.tsx:104`, `Modal.tsx:73`, `CommentList.tsx:243` (`mb-3`), `:256`, `MatchH2HPanel.tsx:180`, `:247`, `ClubPicker.tsx:110`, `:391`
  - as `<span>` ×2: `SelectClubsPanel.tsx:195`, `NotificationBell.tsx:131`

- **D — `text-lg font-semibold` `<h2>`** · 1 place: `CupDetail.tsx:108` (cup name).

- **E — `text-xs font-medium text-text-muted` sub-label** · 4 places: `FilterPill.tsx:318` (popover group names), `StreaksView.tsx:72` ("Current"), `PlayerProfile.tsx:140` ("Compare with"), `MatchDetailPage.tsx:394` ("Status").

- **F — table header row `text-xs uppercase tracking-wide text-text-muted`** (no `font-semibold`, `tracking-wide` not `wider`) · 3 places: `StatsTable.tsx:160`, `CupDetail.tsx:235`, `OverviewSection.tsx:231`.

- **G — `text-xs font-semibold text-text-normal` sub-heading** · 4 places: `DiagnosticsSettings.tsx:108`, `:120`, `:131`, `AppCrashBoundary.tsx:95`.

- **H — form-field captions, three styles for the same fields**: `FormLabel`/`input-label` (`text-xs text-text-muted mb-1`) ×14 (`ClubsPage.tsx:488`, `:499`, `AdminPanel.tsx:389`, `:408`, `PushNotificationsSettings.tsx:90`, `:103`, `TournamentCommentParts.tsx:272`, `clubControls.tsx:120`, `:162`, `ClubStarsEditor.tsx:122`, `FriendlyMatchCard.tsx:119`, `PlayerAvatarEditor.tsx:255`, `CommentImageCropper.tsx:236`, `ViewportReadout.tsx:345`); `w-24 text-sm font-medium text-text-normal` span ×3 (`ClubsPage.tsx:334`, `:344`, `:355`, the Create tab); `text-xs text-text-muted` bare span ×2 (`CommentComposer.tsx:463`, `:480`). On the Clubs page the Stars and League fields are captioned as `text-sm font-medium` on the Create tab (`:344`, `:355`), as uppercase `section-label` on the Browse tab (`:404`, `:418`) and as `FormLabel` in the row editor (`:488`, `:499`).

- **Gap above a titled block** (the `space-y`/`gap` of the parent that holds `section-head` children; `section-head` itself carries `mb-2`): `space-y-2` ×5, `space-y-5` ×2, `flex flex-col gap-3` ×2, `space-y-4` ×1, `space-y-3` ×1, `space-y-1` ×1, `flex flex-col gap-5` ×1 — 6 distinct values (4/8/12/16/20px) from 13 sampled parents (those within 12 lines above a `section-head`). Page-level column is `.page` = `space-y-3` (`styles.css:405`), Dashboard overrides to `space-y-4` (`DashboardPage.tsx:907`), the stats sub-views use `space-y-4/5/6` (`PlayerProfile.tsx:94`, `H2HView.tsx:400`, `RecordsView.tsx:271`, `CupsView.tsx:219`).

---

## Empty states — 3 shapes, and the shared one is padded 10 ways

**What varies:** whether an empty list shows the shared `EmptyState` (centered `text-sm text-text-muted`, optional `text-xs opacity-75` hint, no box of its own — `EmptyState.tsx:9-12`), a hand-written sentence, or nothing at all.

- **A — `EmptyState` component** · 35 places. Its `className` at the call site decides the padding and the surface:
  - `py-2` ×15 — all in Stats (`CupDetail.tsx:288`, `RecordsView.tsx:100`, `:150`, `H2HView.tsx:348`, `:493`, `:535`, `:566`, `:610`, `StarsView.tsx:82`, `StreaksView.tsx:68`, `PlayerProfile.tsx:183`, `DuoLeaderboard.tsx:17`, `DuoDetail.tsx:88`, `DuoRivalries.tsx:22`, `MatchupView.tsx:261`)
  - `py-6` ×4 — `PositionsView.tsx:272`, `RecordsView.tsx:268`, `StreaksView.tsx:39`, `StatsTable.tsx:156`
  - `px-3 py-6` ×4 — `NotificationBell.tsx:140`, `GuestbookSection.tsx:133`, `CommentList.tsx:264`, `IdeasPage.tsx:287`
  - `py-8` ×2 — `FriendlyMatchesListCard.tsx:357`, `:359`
  - `px-3 py-8` — `ClubPicker.tsx:387`; `px-1 py-6` — `ClubsPage.tsx:469`
  - `inset` ×2 — `OverviewSection.tsx:175`, `:199` (the empty sentence gets a level-2 box)
  - `card py-6` — `PlayerProfile.tsx:97` (the empty sentence gets a level-1 box)
  - `grid h-40 place-items-center` — `charts.tsx:140`
  - no className ×3 — `WhatIfSection.tsx:210`, `CommentList.tsx:222`, `:231`
  - `hint` supplied at 4 of 35: `FriendlyMatchesListCard.tsx:359`, `WhatIfSection.tsx:210`, `IdeasPage.tsx:289`, `DiagnosticsSettings.tsx:235`.

- **B — a bare sentence, no component** · 11 places, 7 different type styles:
  - `frontend/src/pages/TournamentsPage.tsx:130` — (Tournaments, none yet) `px-4 py-12 text-center text-sm text-text-muted` plus an inline `text-accent underline` "Create one." button — a hand-built `EmptyState`
  - `frontend/src/pages/profile/ProfileOverviewTab.tsx:170` — (profile Favorite teammates) `text-sm text-text-muted`, left-aligned
  - `frontend/src/pages/profile/ProfileOverviewTab.tsx:121` — (profile About, no bio) `text-sm text-text-normal` "No profile text yet."
  - `frontend/src/pages/dashboard/CupsPreviewCard.tsx:108` — (dashboard cup, no reigns) `<p class="text-sm text-text-muted">`
  - `frontend/src/pages/stats/cupParts.tsx:92-94` — (cup with no owner) `text-base font-semibold` "No owner yet" + muted meta
  - `frontend/src/pages/live/MatchH2HPanel.tsx:252` — (match H2H, no finished matches) `inset px-3 py-2 text-sm text-text-muted`
  - `frontend/src/ui/primitives/VoteVotersModal.tsx:45` — (votes modal) `<CardSection class="text-sm text-text-muted">` "No votes yet."
  - `frontend/src/ui/ClubStarHistory.tsx:56` — (club editor / picker) `<p class="text-xs text-text-muted">`
  - `frontend/src/ui/layout/DiagnosticsSettings.tsx:149` — (crash entry trail) `<p class="text-xs text-text-muted">`
  - `frontend/src/pages/live/OverviewSection.tsx:167-172` — (done tournament, tie) `inset` + `text-sm text-text-normal` + `text-xs` muted
  - `frontend/src/pages/profile/ProfileHeader.tsx:148` — (no banner) `aspect-[16/9] grid place-items-center text-sm text-text-muted bg-bg-card-chip/25` "No header image"

- **C — nothing rendered** · 9 places:
  - `frontend/src/pages/dashboard/CurrentMatchPreviewCard.tsx:50` — (dashboard "Live now" section vanishes; `return null`)
  - `frontend/src/pages/dashboard/TrendsPreviewCard.tsx:322` — (dashboard Trends chart omitted when no players/tournaments; header and switch stay)
  - `frontend/src/pages/stats/RecordsView.tsx:273` — (Most tournament wins block omitted)
  - `frontend/src/pages/live/OverviewSection.tsx:256`, `:283` — (Next matches / Played matches blocks omitted)
  - `frontend/src/pages/stats/StreaksView.tsx:70` — ("Current" chips omitted)
  - `frontend/src/pages/PlayersAdminPage.tsx:183` — (`<List>` with no empty branch)
  - `frontend/src/pages/live/MatchList.tsx:86` — (`list-divided` with no empty branch, header still says "0 matches")
  - `frontend/src/pages/live/StandingsTable.tsx:325` — (no empty branch)

---

## Loading — 6 idioms

**What varies:** whether a viewer sees a full-page spinner, a small inline spinner with text, a shimmer bar, the previous data with nothing, a sentence, or a spinning icon inside a button.

- **A — `PageLoadingScreen`** (40px ring spinner + "Loading" + 3–7 pulsing dots, `min-h-[38svh]`) · 11 places: every page's first paint — `SettingsPage.tsx:94`, `PlayersAdminPage.tsx:144`, `FriendliesPage.tsx:26`, `ProfilePage.tsx:259`, `TournamentsPage.tsx:118`, `DashboardPage.tsx:41`, `ClubsPage.tsx:315`, `LiveTournamentPage.tsx:612`, `MatchDetailPage.tsx:297`, `StatsPage.tsx:81`, and the lazy-route fallback `App.tsx:24`. `sectionCount` is 3 at 5 sites, 4 at 4, 5 at 2, default at 1 — so the dot row is 4, 5 or 6 dots depending on the page (`PageLoadingScreen.tsx:11`).

- **B — `InlineLoading`** (14px accent spinner + label, `text-sm text-text-muted`) · 30 places. Label text: "Loading…" ×19 (3 of them the default), "Loading clubs…" ×3 (`MatchDetailPage.tsx:454`, `FriendlyMatchCard.tsx:425`), "Loading history…" (`ClubStarHistory.tsx:54`), "Loading cups…" (`CupsPreviewCard.tsx:29`), "Loading live match…" (`CurrentMatchPreviewCard.tsx:73`), "Loading match trends…" (`TrendsPreviewCard.tsx:320`), "Loading H2H…" (`MatchH2HPanel.tsx:188`), "Loading last-N…" (`StatsTable.tsx:150`), "Loading players…" (`FriendlyMatchCard.tsx:500`) — 9 distinct labels. Outer padding: none ×25, `py-2` ×3 (`CupsPreviewCard.tsx:29`, `:86`, `CurrentMatchPreviewCard.tsx:73`), wrapped in `px-3 py-6 text-center` ×1 (`NotificationBell.tsx:138`), `col-span-full` ×1.

- **C — `LoadingPlaceholder` shimmer** (`h-12 rounded-xl skeleton`) · 3 places, all feeds: `IdeasPage.tsx:281`, `GuestbookSection.tsx:132`, `TournamentCommentsCard.tsx:932` (each inside `px-3 py-3`). The three feeds are also the only screens whose *first* load is a skeleton rather than a spinner.

- **D — previous content stays, no indicator** (`placeholderData: keepPreviousData`, spinner gated on `isLoading && !data`) · 16 queries in 11 files: `ClubsPage.tsx:137`, `RecordsView.tsx:170`, `:184`, `TrendsExplorer.tsx:59`, `:68`, `PlayerProfile.tsx:72`, `:82`, `:87`, `FriendlyMatchesListCard.tsx:277`, `PositionsView.tsx:86`, `:94`, `MatchupView.tsx:142`, `H2HView.tsx:98`, `:240`, `:306`, `standings.ts:35`, `:42`, `StarsView.tsx:56`, `StatsTable.tsx:56`, `StreaksView.tsx:33`. Changing Mode/Source/game/tab on these screens shows nothing while the refetch runs.

- **E — a sentence only** · 1 place: `FriendlyMatchCard.tsx:415` "Computing odds…" (`text-xs text-text-muted`, no spinner).

- **F — spinning icon inside a button, or a swapped label**: `Loader2` in `ProfileHeader.tsx:224`, `:312`; `RotateCw` rotating in `PushNotificationsSettings.tsx:78`; pull-to-refresh `AppShell.tsx:96`. Label swaps ending in an ellipsis: 20 sites ("Saving…" ×9, "Creating…" ×3, "Posting…", "Applying…", "Reopening…", "Swapping…", "Re-assigning…"/"Checking…", "Marking…", "Resetting…", "Finishing…", "Disabling…"/"Enabling…"/"Sending…"), of which 2 use three periods instead of the ellipsis character: `LoginPage.tsx:708` "Logging in...", `DiagnosticsSettings.tsx:243` "Clearing...".

---

## Errors — 6 shapes

**What varies:** toast vs inline box vs inline text vs boundary screen, and the tone tokens used.

- **A — bottom-right toast** (`ErrorToastViewport`: fixed `z-[70]`, `card p-2 shadow-xl` › `inset py-2`, red icon, 4.2 s auto-dismiss, ×7 close button `h-7 w-7`) · 72 `<ErrorToastOnError>` mounts in 27 files + 5 direct `showErrorToast` calls (`AuthProvider.tsx:135`, `TournamentCommentsCard.tsx:409`, `MatchDetailPage.tsx:231`, `IdeasPage.tsx:161`, `:180`). Toast titles follow two templates: "… loading failed" ×35, "Could not …" ×32, and five others ("Image crop failed", "Login failed", "Comment action failed", "Admin action failed", "Avatar action failed"). Errors raised inside a modal (`PlayerAvatarEditor.tsx:203`, `CommentImageCropper.tsx:196`) also toast, over the sheet.

- **B — inline bordered box, error/warn tokens** (`rounded-xl border …/40 bg-…/10 p-3 text-xs`) · 5 places: `ConfirmDialog.tsx:49` (confirm dialogs), `AppCrashBoundary.tsx:66`, `PushNotificationsSettings.tsx:140` (with an underlined "Dismiss" text button `:141` — the only dismissible inline error), `DiagnosticsSettings.tsx:85`, `MatchDetailPage.tsx:365` (warn: edit conflict, with a ghost "Use their values" button).

- **C — inline `inset` with `text-error`** · 1 place: `MatchH2HPanel.tsx:189` (match H2H tab) — the one query error shown in place rather than toasted; the same panel's siblings toast.

- **D — route boundary** · 1: `RouteErrorBoundary.tsx:43-53` — no card; centered `text-base font-semibold` + two lines + ghost "Go back" / solid "Reload".

- **E — app boundary** · 1: `AppCrashBoundary.tsx:48-101` — `card` + red box + two `size="md"` buttons + `<details>` with a `bg-bg-card-chip/50` `<pre>`.

- **F — "not found / invalid / not allowed" inline** · 5 places, 4 shapes: `NotFoundPage.tsx:22` (card `py-10`, compass icon, solid `md` link button); `MatchDetailPage.tsx:303` (`inset px-3 py-2 text-sm` + raw `text-accent` "Back" button, inside `PageLayout`); `MatchDetailPage.tsx:292` and `LiveTournamentPage.tsx:606` (`inset px-3 py-2 text-sm text-text-muted`, returned *without* `PageLayout`, so no desktop back chevron); `ProfilePage.tsx:267` (bare `px-1 py-8 text-center text-sm` inside `PageLayout`).

---

## Buttons — 2 variants × 3 named sizes in the component, 43 hand-sized icon buttons, ~30 styled raw `<button>`s

**What varies:** height, horizontal padding, whether a shared component is used at all, and how icon-only buttons are sized.

- **A — `<Button>` component** · 130 places in 41 files (`Button.tsx`): `variant="ghost"` 101, solid 29 (28 by omission, 1 explicit at `FriendlyMatchCard.tsx:374`). Sizes: none 112 (`btn-base` = `px-4 py-2 text-sm` ≈ 36px), `size="sm"` 13 (`h-8 px-3` = 32px: `SelectClubsPanel.tsx:301`, `ViewportReadout.tsx:334`, `CupDetail.tsx:170`, `StatsInsights.tsx:224`, `RecordsView.tsx:306`, `H2HView.tsx:576`, `WhatIfSection.tsx:331`, `CommentComposer.tsx:346`, `:358`, `OverviewSection.tsx:215`, `:293`, `IdeaCard.tsx:175`, `:186`, `:199`), `size="md"` 6 + 3 via `buttonClass` (`h-9 px-3` = 36px: `AppCrashBoundary.tsx:71`, `:77`, `DiagnosticsSettings.tsx:192`, `:203`, `SettingsPage.tsx:119`, `:142`, `:134`, `:151`, `NotFoundPage.tsx:27`). Default and `md` are the same height with different side padding (`px-4` vs `px-3`).

- **B — icon-only `<Button>` sized by hand** · 43 places; the component's own `iconOnly` prop (`Button.tsx:29`, `h-8 w-8`) is used 0 times. The same square is spelled three ways: `inline-flex h-N w-N shrink-0 items-center justify-center p-0` ×16, `h-N w-N p-0 inline-flex items-center justify-center` ×19, `inline-flex h-N w-N items-center justify-center p-0` ×8; 8 of them add `md:w-auto md:px-3/4` to grow a label in at desktop.
  - 28px `h-7 w-7` ×1 — `ErrorToast.tsx:110` (toast close)
  - 32px `h-8 w-8` ×17 — `IdeaCard.tsx:291`, `:304`, `:316`; `IdeaComposer.tsx:93`, `:130`, `:141`; `CommentComposer.tsx:221`, `:383`, `:394`; `GuestbookEntryCard.tsx:153`, `:177`, `:192`, `:207`, `:272`; `TournamentCommentParts.tsx:356` (guestbook entry actions, idea actions, composer image actions, comment voters)
  - 36px `h-9 w-9` ×13 — `TournamentCommentParts.tsx:210`, `:225`, `:236`, `:247`, `:259`; `MatchList.tsx:192`, `:201`, `:215`; `ProfileHeader.tsx:221`, `:255`; `PushNotificationsSettings.tsx:74`; `NotificationBell.tsx:109`; `MobileChrome.tsx:155` (comment actions, match reorder/swap, profile header actions, bell, drawer close)
  - 40px `h-10 w-10` ×12 — `CommentComposer.tsx:137`, `:503`, `:530`; `TournamentCommentParts.tsx:304`, `:383`; `IdeaComposer.tsx:177`, `:211`; `FriendlyMatchCard.tsx:352`, `:367`, `:379`; `SelectClubsPanel.tsx:323`; `Modal.tsx:85`; `MobileChrome.tsx:96`, `:106` (send buttons, cancel-reply, dice, modal close, menu/back)
  - The same action takes different sizes on neighbouring screens: comment "Reply"/"Edit"/"Delete" are `h-9 w-9` (`TournamentCommentParts.tsx:225-259`), guestbook "Reply"/"Edit"/"Delete" are `h-8 w-8` (`GuestbookEntryCard.tsx:177-207`), idea "Edit"/"Delete" are `h-8 w-8` (`IdeaCard.tsx:304`, `:316`); "Delete header image" is `h-9 w-9` (`ProfileHeader.tsx:255`) while "Delete avatar" beside it in the editor is a full-width-label default button (`PlayerAvatarEditor.tsx:295`).

- **C — icon-only controls outside `<Button>`, by tap size**: 16px `ClubPicker.tsx:306` (clear-search X, no size classes at all); 20px `explainers.tsx:14` (`InfoButton` `h-5 w-5`); 32px `InlineBack.tsx:20` (`h-8 w-8 rounded-xl`), `DuoPicker.tsx:586` (`rounded-full p-2`); 36px `TopBarStatus.tsx:52` (marker, not a button), `AvatarButton` default `h-9 w-9`; 40px stepper `h-9 w-10` (`styles.css:307`); 44px `SectionTabs.tsx:87` (`h-11`), `FilterPill.tsx:288` (`h-11`), `StatsTable.tsx:174` (`h-11` sort). Seven distinct target sizes for a bare icon across the app.

- **D — raw `<button>` with its own look (not the stretched-overlay pattern)** · 31 places:
  - tiles: `SettingsPage.tsx:228` (theme, `rounded-xl border`), `:166`, `:179` (view-as, `rounded-xl` no border)
  - pill toggles not using `Chip`: `CommentFilterBar.tsx:29` (`rounded-full px-3 py-1.5 text-sm`, `bg-bg-card-chip/60`, no border), `AdminPanel.tsx:359` (`rounded-full px-3 py-1.5 text-xs`, ring when selected)
  - pill buttons: `DuoDetail.tsx:62` ("Matches", `rounded-full bg-bg-card-chip/50 px-3 py-1.5 text-xs font-medium`), `TournamentCommentsCard.tsx:897` ("Collapse all", `rounded-full px-1 text-xs text-text-muted`), `TrendsExplorer.tsx:165` (legend, `.chip`), `PlayerProfile.tsx:146`, `SelectClubsPanel.tsx:232`, `:252`, `:264` (`chipClass`)
  - text links styled as actions — 8 looks: `text-accent` (`MatchDetailPage.tsx:307` "Back"), `text-accent underline underline-offset-2` (`TournamentsPage.tsx:135` "Create one."), `font-medium text-accent` (`TrendsExplorer.tsx:156` "Reset zoom"), `text-xs font-medium text-accent` (`ProfileOverviewTab.tsx:179` "View all →", `ProfileStatsSection.tsx:76` "Full stats →" as `<Link>`), `text-xs font-medium underline` (`PushNotificationsSettings.tsx:141` "Dismiss"), `text-xs text-text-muted` + chevron (`StandingsPreviewCard.tsx:49` "Full table"), `text-xs font-medium text-text-normal` + chevron (`CurrentMatchPreviewCard.tsx:63` tournament name), `section-label` + chevron as `<Link>` (`CupsPreviewCard.tsx:68`, `StandingsPreviewCard.tsx:28`, `TrendsPreviewCard.tsx:283`)
  - table sort headers: `StatsTable.tsx:169` (`h-11`, accent when active), `CupDetail.tsx:243` (no height, accent when active)
  - unstyled wrappers around a `Pill`: `GuestbookSection.tsx:104`, `PlayersAdminPage.tsx:207`, `:215`, `TournamentsPage.tsx:188`, `IdeaCard.tsx:148`
  - others: `ClubPicker.tsx:359` ("No club" row), `H2HView.tsx:446` (matrix name), `:466` (matrix cell), `:588` (rivalry row as `inset` button), `OverviewSection.tsx:184`, `:261`, `CurrentMatchPreviewCard.tsx:75`, `TrendsPreviewCard.tsx:323` (panel wrappers), `cupParts.tsx:141` (timeline segment), `Sidebar.tsx:215` (collapse), `CollapsibleCard.tsx:92`, `DiagnosticsSettings.tsx:54`, `CommentList.tsx:204` (disclosure rows), `AvatarButton.tsx:41`
  - links styled as buttons via `buttonClass`: 5 (`NotFoundPage.tsx:27`, `SettingsPage.tsx:134`, `:151`, `MatchH2HPanel.tsx:66`, `ClubStarsEditor.tsx:77` decorative).

- **E — "the whole row is the action" mechanisms** · 7 different ones: stretched `<button>`/`<Link>` overlay `absolute inset-0 z-0` ×9 (`List.tsx:62`, `ClubList.tsx:99`, `FriendlyList.tsx:156`, `MatchList.tsx:169`, `H2HView.tsx:512`, `RecordsView.tsx:131`, `CupDetail.tsx:185`, `CupsPreviewCard.tsx:94`, `CurrentGameSection.tsx:336`); `<div role="button" tabIndex={0}>` with its own key handler ×1 (`StandingsTable.tsx:333-345`); `<tr onClick>` ×2 (`StatsTable.tsx:189`, `CupDetail.tsx:257`); a whole-row `<button class="row row-tap">` ×1 (`DuoLeaderboard.tsx:24`); `<Link class="inset block …">` ×2 (`ProfileOverviewTab.tsx:51`, `:162`); `<button class="inset …">` ×3 (`H2HView.tsx:75`, `:588`, `OverviewSection.tsx:261`); `<Link class="row-tap …">` ×2 (`RecordsView.tsx:92`, `OverviewSection.tsx:310`); `RowShell` toggling `<button>`/`<div>` (`HeadToHeadRows.tsx:18-46`).

- **F — "icon on a phone, label on desktop"** (`md:hidden` icon + `hidden md:inline` label) · 23 buttons in 9 files: `CurrentGameSection.tsx` ×5, `FriendlyMatchCard.tsx` ×3, `TournamentCommentParts.tsx` ×3, `PlayerAvatarEditor.tsx` ×3, `IdeaCard.tsx` ×2, `CommentImageCropper.tsx` ×2, `ProfileHeader.tsx` ×2, `ClubsPage.tsx` ×2, `GuestbookSection.tsx` ×1. On the same screens the neighbouring buttons keep their label at every width: `AdminPanel.tsx:230-270` (5 text-only), `ClubsPage.tsx:373` "Create" next to `:445-457` "Clear"/"Refresh" (icon-swapped), `LoginPage.tsx:703` (label always, by comment).

---

## Destructive confirmation — 1 dialog component, 13 flows through it, 11 destructive/irreversible actions with no confirmation, 0 native `confirm()`

**What varies:** whether an action asks first, and whether the dialog shows a red "what is lost" block.

- **A — `ConfirmDialog`** (a `Modal` sheet, `max-w-md`; title, muted subtitle, optional red block, ghost "Cancel" + solid verb) · 13 flows:
  - with the red block (9): Delete club (`ClubsPage.tsx:555`), Delete message (`GuestbookSection.tsx:169`), Delete friendly (`FriendlyMatchesListCard.tsx:390`), Delete comment (`TournamentCommentsCard.tsx:976`), Reset match (`CurrentGameSection.tsx:399`), Delete tournament (`LiveTournamentPage.tsx:839`), Re-assign schedule (`:868`), Delete idea (`IdeasPage.tsx:357`), Clear crash log (`DiagnosticsSettings.tsx:239`)
  - without (4): Mark guestbook read (`GuestbookSection.tsx:193`), Finish never-started match (`CurrentGameSection.tsx:419`), Swap sides (`MatchDetailPage.tsx:478`), Mark comments read (`LiveTournamentPage.tsx:897`)
- **B — native `window.confirm`** · 0. **Inline "are you sure?"** · 0.
- **C — no confirmation** · 11 actions that delete, discard or reopen data on one tap:
  - `frontend/src/pages/players/PlayerAvatarEditor.tsx:295-318` — (avatar editor) "Delete" avatar, immediate
  - `frontend/src/pages/profile/ProfileHeader.tsx:248-258` — (profile header) delete header image, immediate, icon-only
  - `frontend/src/pages/ideas/IdeaCard.tsx:183-193` → `IdeasPage.tsx:221-224` — (idea edit) "Remove image", immediate
  - `frontend/src/pages/live/AdminPanel.tsx:236` — (Controls) "Remove second leg" — deletes leg-2 matches, immediate
  - `frontend/src/pages/live/AdminPanel.tsx:257` — (Controls) "Set last match to playing" — reopens a finished tournament, immediate
  - `frontend/src/pages/live/AdminPanel.tsx:245` — (Controls) "Reshuffle order", immediate
  - `frontend/src/pages/live/AdminPanel.tsx:447` — (Controls) "Clear to draw" — removes a saved decider, immediate
  - `frontend/src/pages/live/CurrentGameSection.tsx:262` — (live Current) "Swap Home/Away", immediate — the same swap on `MatchDetailPage.tsx:478` asks first
  - `frontend/src/pages/live/MatchList.tsx:209` — (Matches tab) "Swap sides", immediate
  - `frontend/src/pages/SettingsPage.tsx:139` — (Settings) "Logout", immediate
  - `frontend/src/pages/tools/FriendlyMatchCard.tsx:347` — (friendly form) "Clear" the whole form, immediate
- Where the delete control lives, per screen: inside the row's editor only (Clubs `ClubsPage.tsx:523`, Friendlies `FriendlyMatchesListCard.tsx:219`), on the row itself (comments `TournamentCommentParts.tsx:254`, guestbook `GuestbookEntryCard.tsx:198`, ideas `IdeaCard.tsx:311`), in a separate Controls tab (tournament `AdminPanel.tsx:268`), inside a modal (avatar `PlayerAvatarEditor.tsx:295`), beside the thing (header image `ProfileHeader.tsx:248`) — 5 placements.

---

## Filters and tabs — 9 control idioms for "choose a view or narrow a list"

**What varies:** the control used to make the same kind of choice, and where on the screen it sits.

- **A — `SectionTabs`** (underline tab strip, `h-11`, `text-sm font-medium`, accent underline) · 10 pages: Settings, Friendlies, Profile, Players, Tournaments, Clubs, Stats, Match detail, Ideas, Live tournament (`SettingsPage.tsx:99`, `FriendliesPage.tsx:31`, `ProfilePage.tsx:299`, `PlayersAdminPage.tsx:165`, `TournamentsPage.tsx:125`, `ClubsPage.tsx:327`, `StatsInsights.tsx:208`, `MatchDetailPage.tsx:340`, `IdeasPage.tsx:241`, `LiveTournamentPage.tsx:640`).
- **B — `SegmentedSwitch`** (`rounded-xl` track, `h-8 text-xs` segments, sliding accent indicator) · 8: friendlies row editor Edit/H2H (`FriendlyMatchesListCard.tsx:163`), dashboard Trends Last N/Total (`TrendsPreviewCard.tsx:294`), friendly form 1v1/2v2 (`FriendlyMatchCard.tsx:433`), Matches tab Compact/Details (`MatchList.tsx:72`), Clubs Group by (`ClubsPage.tsx:392`), match edit Status (`MatchDetailPage.tsx:395`), new tournament Mode (`NewTournamentForm.tsx:74`), Ideas sort (`IdeasPage.tsx:255`).
- **C — `ChipGroup`** (wrapping `rounded-full border px-3 py-1.5 text-sm` chips, one selected) · 13: stats sub-view (`StatsInsights.tsx:213`), Trends Metric/View/Range (`TrendsExplorer.tsx:186`, `:192`, `:195`, `:198`, `:217`), H2H history Compact/Details (`H2HView.tsx:338`), matrix metric (`:404`), rivalry order (`:581`), matchup Against/Together (`MatchupView.tsx:189`), matchup Compact/Details (`:244`), Player Compact/Details (`PlayerProfile.tsx:173`), idea Kind (`IdeaFields.tsx:132`).
- **D — single `Chip` toggles** · 8: Last N (`StatsTable.tsx:114`), column groups (`:135`), Per match (`TrendsExplorer.tsx:187`), Ideas area All/… (`IdeasPage.tsx:246`, `:250`), club-picker side A/B (`ClubPicker.tsx:278`), scorer suggestions (`CommentComposer.tsx:435`), idea areas multi-select (`IdeaFields.tsx:169`).
- **E — `chipClass` on a raw `<button aria-pressed>`** · 4: `PlayerProfile.tsx:146` (radar overlay), `SelectClubsPanel.tsx:232`, `:252`, `:264` (club filter disclosure and active-filter chips).
- **F — hand-rolled pill toggles, neither `Chip` nor `chipClass`** · 2, each with its own spec: comments scope chips `rounded-full px-3 py-1.5 text-sm`, unselected `bg-bg-card-chip/60`, no border (`CommentFilterBar.tsx:29-37`); decider type chips `rounded-full px-3 py-1.5 text-xs`, selected adds `ring-1 ring-inset ring-accent/40` (`AdminPanel.tsx:359-368`). `Chip` itself always carries a 1px border and `text-sm` (`Chip.tsx:20-23`).
- **G — `FilterPill`** (floating bottom-right capsule + portal popover of `ChipGroup`s) · 2: Stats Mode/Source (`StatsFilterPill.tsx:73`), Friendlies list Mode/View (`FriendlyMatchesListCard.tsx:388`).
- **H — `FilterSelect`** (custom `inset` trigger + `card` menu) · 5: club star/league filters (`clubControls.tsx:128`, `:168`), comments scope in the composer (`TournamentCommentsCard.tsx:766`), decider winner/loser (`AdminPanel.tsx:390`, `:409`).
- **I — native `<select>` as a filter** · 3: Clubs Stars/League (`ClubsPage.tsx:405`, `:419`, `select-field w-auto`), idea Status (`IdeaCard.tsx:332`). (Another 11 native selects are form fields, styled `select-field` ×8 or `input-field` ×3 — `ClubsPage.tsx:345`, `:356`, `:489` use `input-field` on a `<select>`.)
- Other choosers: range slider `Slider` (`StatsTable.tsx:119`, `TrendsExplorer.tsx:208`) and native range (`PlayerAvatarEditor.tsx:256`, cropper); Settings tile grids (`SettingsPage.tsx:166-190`, `:228-244`); `AvatarButton` rows (`PlayerPicker`, `DuoPicker`, `NewTournamentForm.tsx:102`, friendly `AvatarPlayerSelect`); search inputs — `input-field` on Clubs (`ClubsPage.tsx:433`) vs an `inset` box with an icon and a transparent input in the club picker (`ClubPicker.tsx:291-304`).
- **The same choice, different control**: Compact/Details is a `SegmentedSwitch` on the Matches tab (`MatchList.tsx:72`), a `FilterPill` group on the friendlies list (`FriendlyMatchesListCard.tsx:325`), and a `ChipGroup` in H2H history, the matchup and the Player view (`H2HView.tsx:338`, `MatchupView.tsx:244`, `PlayerProfile.tsx:173`). 1v1/2v2 is a `SegmentedSwitch` on two forms (`NewTournamentForm.tsx:74`, `FriendlyMatchCard.tsx:433`) and a `FilterPill` group on Stats and the friendlies list. Sort is a `SegmentedSwitch` on Ideas (`IdeasPage.tsx:255`), a `ChipGroup` in H2H (`:404`, `:581`), and clickable column headers in tables (`StatsTable.tsx:169`, `CupDetail.tsx:243`).
- **Where the filters sit**: floating over the content (Stats, Friendlies list); an inline row directly under the tab strip (Ideas `IdeasPage.tsx:244`, Clubs `ClubsPage.tsx:389`); inside a card's header band (Comments `TournamentCommentsCard.tsx:913`); inside a collapsible panel body (club filters `SelectClubsPanel.tsx:231`).

---

## Modals, sheets, drawers, popovers — 8 overlay treatments

**What varies:** scrim colour, z-index, blur, padding, width and how it closes.

- **A — `Modal` bottom sheet / centered ≥sm** (`card w-full p-3 sm:p-4`, scrim `bg-black/60`, `z-50`, close ×`h-10 w-10`) · 6 callers: club picker (`ClubPicker.tsx:264`, `max-w-md`, `max-h-[84vh]`), image cropper (`CommentImageCropper.tsx:188`, `max-w-2xl`), H2H match history (`H2HView.tsx:325`, `max-w-4xl`, `max-h-[88vh]`), confirm dialogs (`ConfirmDialog.tsx:39`, `max-w-md`), avatar editor (`PlayerAvatarEditor.tsx:195`, `max-w-lg`), voters (`VoteVotersModal.tsx:34`, `max-w-lg`, `max-h-[84vh]`). Four widths; two explicit height caps (84vh, 88vh) plus the default `max-h-sheet`.
- **B — `Modal` centered-only** (`card p-4`, `w-[min(92vw,520px)]`) · 0 callers (`Modal.tsx:118-127`).
- **C — navigation drawer** (`MobileChrome.tsx:129-148`): scrim `bg-black/55 backdrop-blur-[2px]`, aside `bg-bg-card-outer shadow-pop`, `z-50`, close ×`h-9 w-9`.
- **D — image lightbox** (`ImageLightbox.tsx:92`): `bg-black/85`, no card, `z-50`, closes on any click, no ×; 5 callers.
- **E — popovers** · 3, three recipes: bell (`NotificationBell.tsx:125`: in-flow `absolute z-50`, `w-[min(22rem,…)]`, `p-0`, `shadow-pop backdrop-blur-md`, header band); filter pill (`FilterPill.tsx:314`: portal `fixed z-40 w-64`, `p-3` from `.card`, `shadow-pop backdrop-blur-md`); dropdown menu (`FilterSelect.tsx:130`: portal `fixed z-[60]`, width = trigger, `px-0 py-1`, `shadow-pop`, no blur). All three close on outside-click/Escape only.
- **F — toast** (`ErrorToast.tsx:97`): `fixed z-[70]`, `card p-2 shadow-xl` — the only `shadow-xl` in the app.
- **G — sticky docks** inside cards: composers ×3 (identical, see Surfaces G); sticky group headers `bg-bg-card-outer z-10` in the club picker (`ClubPicker.tsx:391`); sticky table corners/columns `bg-bg-default z-10/z-20` (`StatsTable.tsx:161`, `H2HView.tsx:427`, `PositionsView.tsx:317`).
- **H — floating capsule** (`FilterPill.tsx:271-288`): `fixed bottom-nav-clear right-4 z-40`, `h-11 rounded-full border-2`, tucks away on scroll-down, pulses once per session.
- Scrims: 3 values on 3 overlays (`/60`, `/55`+blur, `/85`). z ladder in use: 10, 20, 30, 40, 50, 60, 70 (`z-10` ×28, `z-0` ×9, `z-50` ×5, `z-30` ×4, `z-20` ×4, `z-40` ×2, `z-[60]`, `z-[70]`). Close-control sizes on overlays: 28 (toast), 36 (drawer), 40 (modal), none (popovers, lightbox).

---

## Tags and badges as containers — 13 distinct `rounded-full` treatments

**What varies:** padding, text size, weight, whether there is a border, and how the colour is set.

- `.chip` span (`px-2.5 py-1 text-xs`, hairline) ×11 — see Surfaces C.
- `Pill` (`border px-2.5 py-1 text-xs font-medium leading-none min-w-14`, status bg/text/border tokens; `Pill.tsx:20-24`) ×14: match status (`MatchOverviewPanel.tsx:76`), tournament date/mode (`TournamentMetaPills.tsx:27`, `MatchHistoryList.tsx:190`, `:194`), placement (`ProfileOverviewTab.tsx:196`, `MatchHistorySection.tsx:38`), unread counts (`TournamentsPage.tsx:197`, `PlayersAdminPage.tsx:208`, `:216`, `GuestbookSection.tsx:105`), cup era (`CupsPreviewCard.tsx:77`, `CupDetail.tsx:109`), idea status (`IdeaCard.tsx:105`).
- `Chip` button (`border px-3 py-1.5 text-sm`) — the selectable one.
- Reign chip `px-2 py-0.5 text-xs font-semibold`, no border / accent ring (`cupParts.tsx:20-23`).
- Streak "live" `bg-status-bg-green/60 px-1.5 text-xs` (`StreaksView.tsx:63`); streak current `bg-bg-card-chip/50 px-2 py-0.5 text-xs` (`:79`).
- Unread replies `h-8 rounded-full border border-border-card-inner bg-bg-card-chip/25 px-2 text-xs` (`GuestbookEntryCard.tsx:161`).
- `StreakPatch` `border font-mono h-5/h-6 px-1.5/px-2 text-micro/text-xs shadow-sm`, colours in inline style (`StreakPatches.tsx:29-42`).
- `CupOwnerBadge` `h-6/h-7 border shadow-sm`, colours in inline style (`CupOwnerBadge.tsx:25-38`).
- Tab badge `px-1.5 text-xs font-semibold bg-accent/15` (`SectionTabs.tsx:100`); bell badge `px-1 text-micro text-white bg-accent ring-2` (`NotificationBell.tsx:114`); diagnostics source tag `border px-2 py-0.5 text-micro` (`DiagnosticsSettings.tsx:63`); positions micro tags `bg-bg-card-chip/60 px-1 text-micro` (`PositionsView.tsx:387`, `:395`); comment-scope chip and decider chip (Filters F).

---

## Fresh-eye observations

Things that would strike someone opening the app cold. Separate from the counted findings above; some of them are consistent in the code and still look arbitrary on screen.

1. **Three surfaces for "no data".** The same one-line "No … yet." sits directly on the page in Stats (`py-2`), inside a level-2 `inset` box on the live Overview (`OverviewSection.tsx:175`), and inside a full level-1 `card` on Stats → Player (`PlayerProfile.tsx:97`). A viewer sees an empty sentence framed three different ways for the same meaning.
2. **The loading dots change count by page.** `PageLoadingScreen` draws `sectionCount + 1` dots (`PageLoadingScreen.tsx:11`) — 4 on Settings, 5 on Tournaments, 6 on a live tournament — and nothing on screen explains why.
3. **Same button, three sizes, by neighbourhood.** Reply/Edit/Delete are 36px on a comment, 32px on a guestbook entry, 32px on an idea; Send is 40px everywhere; the toast's × is 28px; the club-picker's clear-search × is 16px with no hit area at all (`ClubPicker.tsx:306`).
4. **Delete asks, except when it doesn't.** Nine deletes open a red confirm sheet; deleting an avatar or the profile banner happens on one tap with no dialog (`PlayerAvatarEditor.tsx:295`, `ProfileHeader.tsx:248`), and "Remove second leg" deletes matches on one tap (`AdminPanel.tsx:236`). "Swap sides" asks on the match page and does not ask on the live Current tab or the Matches tab.
5. **Filters live in three places.** On Stats and Friendlies the filter is a floating capsule bottom-right that hides while you scroll; on Ideas and Clubs it is a row under the tabs; in Comments it is a chip strip inside the card. The Clubs page filters with two native OS dropdowns while every other filter in the app is a custom chip, switch or popover.
6. **"Compact / Details" is a switch here and chips there.** The identical two-way choice is a sliding `SegmentedSwitch` on the Matches tab, a chip pair on the matchup, the Player view and the H2H history sheet, and a popover group on the friendlies list.
7. **Section titles shout or don't.** Most blocks are titled in small uppercase with a rule (`section-label`); the three feeds (Comments, Guestbook, Ideas), the New-tournament form, Settings groups and the match-edit page use sentence-case bold titles; the Cups page uses `text-lg`. On the Clubs page the same "Stars"/"League" fields are captioned uppercase on one tab and sentence-case on the next.
8. **Two heights called three names.** `Button` default (`px-4 py-2`) and `size="md"` (`h-9 px-3`) are both 36px tall; `sm` is 32px. The `iconOnly` prop exists and no one uses it.
9. **The dead branches.** `Modal`'s centered-only layout (`Modal.tsx:118-127`), `AdminPanel`'s `card` wrapper (`AdminPanel.tsx:478`), `Card`'s header/`inset` variants beyond Login, `CollapsibleCard`'s `card`/`inset` variants (its one caller passes `variant="none"`), `SegmentedSwitch.widthClass` (accepted, ignored, still passed at `MatchList.tsx:79` and `MatchDetailPage.tsx:403`), and the `shadow-card`/`shadow-focus` tokens are all defined and never reached.
10. **Popovers disagree with each other.** The bell panel blurs its backdrop and sits at z-50; the filter popover blurs and sits at z-40 (below a modal); the dropdown menu does not blur and sits at z-60 (above a modal). The toast floats above all of them at z-70 with a different shadow (`shadow-xl`) from every other floating surface (`shadow-pop`).
11. **Row tapping is invisible on two screens.** Standings rows (`StandingsTable.tsx:333`) and stats-table rows (`StatsTable.tsx:189`) are clickable with only a hover tint — no chevron, no underline, no button — while `ListRow` elsewhere shows a chevron by default (`List.tsx:60`), and the Overview's "Open Standings" link sits above a table that is itself not tappable.
12. **The same error is a toast almost everywhere and a box in two places.** 72 error mounts are toasts that vanish in 4.2 seconds; the match H2H tab (`MatchH2HPanel.tsx:189`) and the push settings (`PushNotificationsSettings.tsx:140`) keep theirs on screen, and only the second one can be dismissed.
13. **Ellipsis characters.** Twenty busy labels end in "…" and two in "..." (`LoginPage.tsx:708`, `DiagnosticsSettings.tsx:243`).
14. **Every avatar is a box.** `AvatarCircle` is built on the level-2 `inset` class (`AvatarCircle.tsx:70`), so in the light theme every avatar in a comment, idea or guestbook entry is a grey-bordered disc inside a grey-bordered card inside a white card.
