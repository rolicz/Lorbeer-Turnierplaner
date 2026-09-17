# People

Scope: every component under `frontend/src` (excluding `src/test/`) that draws a player — avatar, name, pair, decoration, "you". Counts are exhaustive over the non-test source unless a line says "sampled". Line numbers are from the working tree on 2026-09-17 (`frontend/src/pages/stats/PlayerProfile.tsx` carries uncommitted edits; its lines are as on disk).

Two primitives do most of the drawing:
- `frontend/src/ui/primitives/AvatarCircle.tsx` — the one avatar component (19 direct call sites + 1 inside `AvatarButton`). Circle, `rounded-full`, image via `playerAvatarUrl(id, updatedAt)` else the **first character of the name, upper-cased** (`:60`), else `?`. A 1px neutral hairline ring is painted *inside* the box on every instance (`:26-27`, `:65-67`); a 2.5px cup-coloured ring replaces it when `cups` is passed and non-empty (conic split for two cups, `:29-34`).
- `frontend/src/ui/primitives/PlayerLink.tsx` — the one "identity → `/profiles/{id}`" link (14 instances in 10 files). Default tooltip `Open <name>'s profile` (`:42`).

No component anywhere abbreviates a name (no first-name split, no initials beyond the single-character avatar fallback). Every name is `display_name` in full, then `truncate`d by CSS. So "abbreviation" has 0 variants; truncation has several (below).

---

## Avatar sizes — 7 variants (AvatarCircle) + 4 (AvatarButton)

**What varies:** the disc diameter, from 24px to 56px, with no rule tying size to context (the same "leaderboard row" context appears at 24, 28 and 36px).

- **A — 56px (`h-14 w-14`)** · 3 places
  - `frontend/src/pages/stats/PlayerProfile.tsx:106` — Stats → Player, the identity card
  - `frontend/src/pages/profile/ProfileHeader.tsx:162-168` — profile header (image present; wrapped in a lightbox button)
  - `frontend/src/pages/profile/ProfileHeader.tsx:171-177` — profile header (no image; not a button)
- **B — 48px (`h-12 w-12`)** · 1 place (+1 picker)
  - `frontend/src/pages/stats/cupParts.tsx:48,71-77` — `CupHolder` default, rendered by Stats → Overview → Cups (`CupDetail.tsx:114-129`)
  - `frontend/src/pages/tournaments/NewTournamentForm.tsx:95-103` — new-tournament player picker (`AvatarButton`, `h-12 w-12`)
- **C — 40px (`h-10 w-10`)** · 4 places (+2 pickers)
  - `frontend/src/pages/PlayersAdminPage.tsx:202` — Players page list row
  - `frontend/src/pages/stats/h2h/MatchupView.tsx:80-86` — matchup header, solo side
  - `frontend/src/pages/live/OverviewSection.tsx:140-145` — live tournament → Overview, "Winner" block
  - `frontend/src/pages/dashboard/CupsPreviewCard.tsx:102` — dashboard cups preview (`CupHolder` with `avatarSizeClass="h-10 w-10"`)
  - `frontend/src/pages/stats/PlayerPicker.tsx:14,25-35` — `AvatarButton` default `h-10 w-10`, used by Stats → Player (`PlayerProfile.tsx:97`) and Stats → H2H → "Head-to-head by player" (`H2HView.tsx:489`)
- **D — 36px (`h-9 w-9`)** · 1 place (+2 pickers)
  - `frontend/src/pages/live/StandingsTable.tsx:350-355` — live tournament → Standings / Results rows
  - `frontend/src/pages/live/WhatIfSection.tsx:230-239` — What-if player picker (`PlayerPicker size="h-9 w-9"`)
  - `frontend/src/pages/stats/h2h/DuoPicker.tsx:27-36` — Stats → H2H → Duos picker (`h-9 w-9`)
- **E — 32px (`h-8 w-8`)** · 4 places (+2 pickers)
  - `frontend/src/pages/stats/CupDetail.tsx:193-199` — Cups sub-view, "Reigns" rows
  - `frontend/src/pages/profile/GuestbookEntryCard.tsx:110-116` — profile → Guestbook entry byline
  - `frontend/src/pages/live/WhatIfSection.tsx:297-302` — What-if "Projected table" rows
  - `frontend/src/pages/stats/h2h/MatchupView.tsx:80-86` — matchup header, 2v2 team member
  - `frontend/src/pages/tools/FriendlyMatchCard.tsx:124-134,139-148` — friendly form side pickers (`AvatarButton h-8 w-8`, incl. a "None" disc with a `Ban` icon)
- **F — 28px (`h-7 w-7`)** · 4 places
  - `frontend/src/pages/stats/CupDetail.tsx:265-271` — Cups sub-view, "Per player" table
  - `frontend/src/pages/stats/StatsTable.tsx:195` — Stats → Overview → Table, and the dashboard "Standings" preview (`StandingsPreviewCard.tsx:35-42`)
  - `frontend/src/pages/live/TournamentCommentParts.tsx:159-165` — tournament comment byline
  - `frontend/src/pages/ideas/IdeaCard.tsx:123-129` — Ideas board card byline
- **G — 24px (`h-6 w-6`)** · 3 places
  - `frontend/src/pages/stats/PositionsView.tsx:352` — Stats → Overview → Positions column header
  - `frontend/src/pages/stats/RecordsView.tsx:137` — Stats → Overview → Records, "Most tournament wins"
  - `frontend/src/pages/stats/StreaksView.tsx:57` — Stats → Overview → Streaks, record rows

Shape: 19/19 `AvatarCircle` sites are circles. The one non-circle "avatar" surface is the avatar editor's crop frame, a `rounded-xl` square with a circular guide drawn over it (`frontend/src/pages/players/PlayerAvatarEditor.tsx:243,246-248`).

## Avatar fallback initial — 2 variants

**What varies:** the size of the letter shown when a player has no photo; it does not follow the disc size.

- **A — `text-sm font-semibold text-text-muted` (14px)** · 16 of 19 sites (the default, `AvatarCircle.tsx:46`), including the three 24px discs (`PositionsView.tsx:352`, `RecordsView.tsx:137`, `StreaksView.tsx:57`) and the 28px discs in `StatsTable.tsx:195` and `CupDetail.tsx:265`
- **B — `text-xs font-semibold text-text-muted` (12px)** · 3 sites, all bylines
  - `frontend/src/pages/live/TournamentCommentParts.tsx:164` — 28px disc
  - `frontend/src/pages/ideas/IdeaCard.tsx:128` — 28px disc
  - `frontend/src/pages/profile/GuestbookEntryCard.tsx:115` — 32px disc
- Non-letter fallbacks: `Trophy` in a muted disc when a cup has no owner (`cupParts.tsx:87-90`); `Ban` icon for the "None" picker option (`FriendlyMatchCard.tsx:132`); `?` when the name is empty (`AvatarCircle.tsx:60`); the profile header passes `String(targetPlayerId)` as the name when unknown, so the initial becomes a digit (`ProfileHeader.tsx:164,173`).

## Avatar ring — 3 treatments, and which screens get the cup ring

**What varies:** whether an avatar can show the cup-coloured ring, and what the accent ring on a picker means next to it.

- **A — neutral hairline only (`cups` never passed)** · 8 `AvatarCircle` sites + all 5 `AvatarButton` sites
  - `frontend/src/pages/stats/PositionsView.tsx:352`, `frontend/src/pages/profile/GuestbookEntryCard.tsx:110`, `frontend/src/pages/live/WhatIfSection.tsx:297`, `frontend/src/pages/live/StandingsTable.tsx:350`, `frontend/src/pages/live/TournamentCommentParts.tsx:159`, `frontend/src/pages/live/OverviewSection.tsx:140`, `frontend/src/pages/ideas/IdeaCard.tsx:123`, `frontend/src/ui/primitives/AvatarButton.tsx:55-62`
- **B — cup-coloured ring when the player holds a cup today (`cups={cupsHeldByPlayerId.get(id)}` via `hooks/useCupHolders.ts`)** · 11 sites
  - `frontend/src/pages/PlayersAdminPage.tsx:202`, `frontend/src/pages/stats/CupDetail.tsx:193-199,265-271`, `frontend/src/pages/stats/RecordsView.tsx:137`, `frontend/src/pages/stats/PlayerProfile.tsx:106`, `frontend/src/pages/profile/ProfileHeader.tsx:162-177` (2, from `ownedCups`), `frontend/src/pages/stats/StatsTable.tsx:195`, `frontend/src/pages/stats/StreaksView.tsx:57`, `frontend/src/pages/stats/h2h/MatchupView.tsx:80-86`, `frontend/src/pages/stats/cupParts.tsx:71-77`
- **C — accent selection ring (`ring-2 ring-[accent/0.85]`, drawn outside the hairline)** · 1 component, 5 screens
  - `frontend/src/ui/primitives/AvatarButton.tsx:60` — new-tournament picker, friendly form, What-if picker, Stats Player picker, H2H player picker, Duo picker

So a ring around an avatar means "holds a cup" on 11 surfaces and "is selected" on 5 others; the two never meet on one disc only because no picker passes `cups`.

## Name typography — 12 combinations

**What varies:** size and weight of a player's name when it is the subject of a row or block. Grouped by the class string on the name span.

- **A — `text-lg font-bold`** · 1: `frontend/src/pages/stats/PlayerProfile.tsx:109` (Stats → Player card)
- **B — `text-lg font-semibold`** · 1: `frontend/src/pages/live/OverviewSection.tsx:148-152` (Overview "Winner")
- **C — `text-base font-semibold`** · 2: `frontend/src/pages/profile/ProfileHeader.tsx:181-183` (profile header); `frontend/src/pages/stats/cupParts.tsx:79-81` (cup holder — and coloured in the cup's colour, see Colour)
- **D — `font-bold` at `text-base` (solo) / `text-sm` (team)** · 1: `frontend/src/pages/stats/h2h/MatchupView.tsx:88`
- **E — `text-sm font-semibold`** · 6: `frontend/src/pages/stats/CupDetail.tsx:212` (reign holder); `frontend/src/pages/stats/h2h/DuoDetail.tsx:46-48`; `frontend/src/pages/stats/HeadToHeadRows.tsx:80-82` (DuoRow) and `:139,142` (TeamRivalryRow); `frontend/src/pages/live/MatchH2HPanel.tsx:180` (match detail H2H heading)
- **F — `font-semibold` inheriting `text-xs`** · 4: `frontend/src/pages/stats/H2HView.tsx:60` (Favorite/Nemesis card, grid `text-xs` at `:496`); `frontend/src/pages/profile/ProfileOverviewTab.tsx:33` (same card on the profile, grid at `:143`) and `:161` (favorite teammates, grid at `:158`)
- **G — `font-medium` inheriting the row/table size** · 5: `frontend/src/pages/live/StandingsTable.tsx:358` (base size); `frontend/src/pages/stats/StatsTable.tsx:196` (`text-sm` table); `frontend/src/pages/stats/CupDetail.tsx:273` (`text-sm` table, with a `N days held` subline); `frontend/src/pages/PlayersAdminPage.tsx:236` (base size); `frontend/src/pages/stats/H2HView.tsx:591` (`text-sm font-medium`, "Top rivalries")
- **H — `text-sm` regular** · 4: `frontend/src/pages/stats/StreaksView.tsx:59`; `frontend/src/pages/stats/RecordsView.tsx:139`; `frontend/src/pages/stats/H2HView.tsx:518` (opponent list); `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:31`
- **I — `text-xs font-semibold`** · 3 bylines: `frontend/src/pages/live/TournamentCommentParts.tsx:169-171` (comment; the "Anonymous" author is `text-xs text-text-muted` instead); `frontend/src/pages/profile/GuestbookEntryCard.tsx:118`; `frontend/src/pages/ideas/IdeaCard.tsx:132-137`
- **J — `text-xs font-medium`** · 2: `frontend/src/pages/stats/H2HView.tsx:452` (matrix row header, `text-accent` when selected) and `:436` (matrix column header, rotated −90°, muted)
- **K — `text-xs text-text-muted`** · 6: `frontend/src/pages/stats/PositionsView.tsx:353` (under the header avatar); `frontend/src/ui/primitives/AvatarButton.tsx:64-71` (under every picker avatar; `font-medium text-text-normal` when selected); `frontend/src/pages/dashboard/TrendsPreviewCard.tsx:309-312` (legend); `frontend/src/pages/stats/cupParts.tsx:150-156` (reign legend); `frontend/src/ui/SelectClubsPanel.tsx:99` (club slot side label); `frontend/src/pages/live/comments/CommentComposer.tsx:185-190` (goal side chooser)
- **L — score-line names** · 9 sites through `frontend/src/ui/primitives/ScoreLine.tsx:43-47,236-242`: `text-lg` hero / `text-base` md / `text-sm` sm; weight is result-driven — `font-semibold` for the leading side, `font-medium` when level, `text-text-muted` for the trailing side (`FriendlyList.tsx:121`, `WhatIfSection.tsx:121`, `MatchList.tsx:229`, `OverviewSection.tsx:274,322`, `comments/CommentList.tsx:181`, `RecordsView.tsx:79`, `MatchHistoryList.tsx:79`, `MatchOverviewPanel.tsx:82`)

Plus names inside running text (not a name style of their own): What-if clause (`WhatIfSection.tsx:146-161,258-266`), decider summary (`LiveTournamentPage.tsx:296-314`), "X defending" (`MatchHistoryList.tsx:155-158`), reign meta "took it from X" / "ended by X" (`CupDetail.tsx:221-228`), tie sentence (`OverviewSection.tsx:170`), notification headline (`NotificationBell.tsx:40-42,156`), unread-author strings (`useProfilePokes.ts:85` → `2x Roli`; `guestbookTree.ts:131-133` → `Roli x2`), record hints (`CupDetail.tsx:151,156`), tournament list winner (`TournamentsPage.tsx:166-170`) and participants (`:219-221`).

## Name truncation — 5 widths

**What varies:** how a long name is cut.

- **A — `truncate` to the container** · the large majority (sampled: every name span in sections above except the ones below)
- **B — wrap on phone, truncate from `md`** · `frontend/src/ui/primitives/ScoreLine.tsx:87` (`break-words leading-tight md:truncate`) — all 9 score-line surfaces
- **C — fixed pixel cap** · 3: `frontend/src/pages/stats/H2HView.tsx:452` (`max-w-[120px]`); `frontend/src/pages/TournamentsPage.tsx:169` (`max-w-[150px] sm:max-w-[260px]`, winner); `frontend/src/ui/primitives/AvatarButton.tsx:65` (`max-w-16` = 64px under every picker avatar)
- **D — never truncated, overflow visible** · `frontend/src/pages/stats/H2HView.tsx:436` (rotated column headers, `whitespace-nowrap` in a 96px-tall box); `frontend/src/pages/stats/cupParts.tsx:150-156` (legend); `frontend/src/ui/primitives/VoteVotersModal.tsx:55-59,74-78` (voter chips)
- **E — `truncate text-center`** · `frontend/src/pages/stats/PositionsView.tsx:353`

## Is a name a link? — 4 behaviours

**What varies:** what tapping a person does. Counted per rendering site.

- **A — identity is a `PlayerLink` to `/profiles/{id}`** · 12 sites (14 links)
  - avatar + name in one link (7): `frontend/src/pages/stats/StatsTable.tsx:194` (row → Stats player), `frontend/src/pages/stats/StreaksView.tsx:56`, `frontend/src/pages/stats/RecordsView.tsx:136` (row → Stats player), `frontend/src/pages/stats/CupDetail.tsx:264` (row → Stats player), `frontend/src/pages/stats/cupParts.tsx:66` (dashboard block → Cups view), `frontend/src/pages/stats/h2h/MatchupView.tsx:74`, `frontend/src/pages/stats/PositionsView.tsx:345` (also a drag handle)
  - avatar as a `decorative` link + name as its own link (3): `frontend/src/pages/stats/CupDetail.tsx:187,206` (row → tournament), `frontend/src/pages/live/OverviewSection.tsx:134,148`, `frontend/src/pages/ideas/IdeaCard.tsx:122,132`
  - name only (2): `frontend/src/pages/stats/H2HView.tsx:517` (row → matchup), `frontend/src/pages/stats/StreaksView.tsx:75-81` (the "Current" pills — a pill-shaped link)
- **B — the whole row opens the profile, no `PlayerLink`** · 3 sites
  - `frontend/src/pages/live/StandingsTable.tsx:333-345` (`role="button"` div, `navigate('/profiles/…')`, title `Open profile: X`)
  - `frontend/src/pages/PlayersAdminPage.tsx:199-200,150` (`ListRow onClick` → profile; aria `Open profile: X`)
  - `frontend/src/pages/stats/PlayerProfile.tsx:100-104` (button → profile; title `Open X's full profile`)
- **C — the name is shown and tapping it does something other than open the profile** · 15 sites
  - `frontend/src/pages/stats/H2HView.tsx:445-453` (select player), `:588-590` (open matchup); `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:24-29` (select duo); `frontend/src/pages/stats/HeadToHeadRows.tsx:73-76,128-131` (open matches modal); `frontend/src/pages/stats/H2HView.tsx:74-84` and `frontend/src/pages/profile/ProfileOverviewTab.tsx:47-55` (Favorite/Nemesis → matchup); `frontend/src/pages/profile/ProfileOverviewTab.tsx:171-178` (teammate → matchup "together"); `frontend/src/pages/stats/trends/TrendsExplorer.tsx:165-178` (toggle series); `frontend/src/pages/stats/PlayerProfile.tsx:146-156` (toggle overlay); `frontend/src/ui/primitives/AvatarButton.tsx:38-49` (select, 5 pickers); `frontend/src/pages/SettingsPage.tsx:179-189` (switch actor); `frontend/src/pages/stats/cupParts.tsx:128-140` (timeline segment → reign row); `frontend/src/pages/stats/PositionsView.tsx:413-431` (tile → tournament); `frontend/src/pages/TournamentsPage.tsx:174-178` (row → tournament, winner name inside)
- **D — the name is shown and tapping does nothing** · 20 sites
  - bylines: `frontend/src/pages/live/TournamentCommentParts.tsx:157-172` (comment author, avatar + name, **no link**), `frontend/src/pages/profile/GuestbookEntryCard.tsx:109-119` (guestbook author, **no link**)
  - lists: `frontend/src/pages/live/WhatIfSection.tsx:283-311` (projected table: avatar + name, no link), `frontend/src/pages/live/OverviewSection.tsx:238-253` (Overview mini table), `frontend/src/ui/primitives/VoteVotersModal.tsx:55-59,74-78`, `frontend/src/pages/dashboard/TrendsPreviewCard.tsx:307-316`, `frontend/src/pages/stats/cupParts.tsx:148-157` (legend), `frontend/src/pages/TournamentsPage.tsx:219-221` (participants), `frontend/src/pages/stats/h2h/DuoRivalries.tsx` (via `TeamRivalryRow` without `onOpenMatches`, sampled)
  - every score line (9 sites, list L above) — the row may open a match, the names themselves never open a person
  - text: `frontend/src/ui/primitives/MatchOverviewPanel.tsx:35-39,79-87`, `frontend/src/pages/live/MatchH2HPanel.tsx:180`, `frontend/src/pages/live/comments/CommentComposer.tsx:185-190`, `frontend/src/ui/SelectClubsPanel.tsx:99`, `frontend/src/pages/SettingsPage.tsx:108`, `frontend/src/pages/stats/CupDetail.tsx:151,156,221-228`, `frontend/src/pages/live/LiveTournamentPage.tsx:296-314`, `frontend/src/ui/shell/NotificationBell.tsx:156`

Tooltip phrasings for the profile door: `Open X's profile` (`PlayerLink.tsx:42`, default for A), `Open X's profile · drag to reorder` (`PositionsView.tsx:348`), `Open profile: X` (`StandingsTable.tsx:336`, `PlayersAdminPage.tsx:200`), `Open X's full profile` (`PlayerProfile.tsx:104`) — 4 phrasings.

## A 2v2 team — 7 drawings

**What varies:** how two names on one side are joined.

- **A — stacked, one line per player** · 9 score-line sites where `leftNames` is an array (`FriendlyList.tsx:82-85,121`; `WhatIfSection.tsx:90-101,121`; `MatchList.tsx:15-17,89-90,138-143,229`; `OverviewSection.tsx:37-40,274,322`; `MatchHistoryList.tsx:41-48,79`; `MatchOverviewPanel.tsx:35-39,82`), plus the goal-side chooser (`comments/CommentComposer.tsx:185-190`) and the matchup header, where each stacked member gets an avatar (`h2h/MatchupView.tsx:71-89`)
- **B — `A/B`, no spaces, one string** · 4 sources
  - `frontend/src/pages/live/TournamentCommentsCard.tsx:87-92` (`names.join("/")`, with the comment "to avoid the 'Foo & Bar' look") → used for the comment feed's match-block score line (`:587`, `comments/CommentList.tsx:181`) and the composer's target list `Match 3 — Roli/Berni vs Flo/Atzi` (`:776`)
  - `frontend/src/pages/stats/HeadToHeadRows.tsx:133-134` (team rivalry rows)
  - `frontend/src/pages/tools/FriendlyMatchCard.tsx:205-211` (side labels handed to the club slots and picker chips)
  - `frontend/src/pages/stats/H2HView.tsx:317` (modal title)
- **C — `A / B`, spaced, one string** · 3 sources: `frontend/src/pages/stats/h2h/matchupSummary.ts:38-42` → `frontend/src/pages/live/MatchH2HPanel.tsx:180-181,203-207` (match detail H2H heading and its link labels); `frontend/src/pages/stats/h2h/MatchupView.tsx:108-109`
- **D — `A` `<span muted>/</span>` `B`** · 3 places: `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:32`; `frontend/src/pages/stats/h2h/DuoDetail.tsx:47`; `frontend/src/pages/stats/HeadToHeadRows.tsx:80` (DuoRow)
- **E — `A + B`** · 1 helper, 4 visible uses: `frontend/src/utils/matchDisplay.ts:3-7` (`teamName`) → `frontend/src/pages/live/MatchDetailPage.tsx:267-268` (club slot labels on the match page), `frontend/src/pages/live/CurrentGameSection.tsx:16-18,81-82` (club slot labels on the Current tab) and `:413` ("Roli + Berni 2–1 Flo + Atzi is wiped"), `frontend/src/pages/stats/RecordsView.tsx:42-44,79` (Records score lines receive the **joined string**, so a 2v2 team prints on one line here while every other score line stacks it). Also in `aria-label`s only: `MatchList.tsx:154`, `FriendlyList.tsx:154`, `WhatIfSection.tsx:132-133`.
- **F — `A, B`** · lists of people rather than teams: `frontend/src/pages/TournamentsPage.tsx:220` (participants), `frontend/src/pages/stats/CupDetail.tsx:35,62`, `frontend/src/pages/profile/useProfilePokes.ts:85`, `frontend/src/pages/profile/guestbookTree.ts:131-133`
- **G — `A · B`** · 1: `frontend/src/pages/live/OverviewSection.tsx:170` (tied candidates)

The same `ClubSlot` label (`frontend/src/ui/SelectClubsPanel.tsx:99`) therefore reads `Roli + Berni` on the tournament match page and Current tab (2 callers) and `Roli/Berni` on the friendly form (1 caller). "vs" between sides is a muted `<span>` in 4 places (`H2HView.tsx:592`, `HeadToHeadRows.tsx:145`, `MatchH2HPanel.tsx:181`, `MatchupView.tsx:177-179` where it becomes "and" for teammates) and a `vs` word inside a scheduled small score line (`ScoreLine.tsx:286`).

## Bylines (comment · guestbook · idea) — 3 near-identical, 3 different

**What varies:** three surfaces draw "who wrote this, when" with the same layout and different details.

- **Comment** `frontend/src/pages/live/TournamentCommentParts.tsx:155-180`: avatar 28px, **no link**, initial `text-xs`; name `text-xs font-semibold`; second line `fmtTs(createdAt)` + ` · edited <full timestamp>`; an "Anonymous" comment draws **no avatar** and a muted name, so the byline starts 36px further left than a named one.
- **Guestbook** `frontend/src/pages/profile/GuestbookEntryCard.tsx:108-122`: avatar 32px, **no link**, initial `text-xs`; name `text-xs font-semibold`; second line `fmtDateTime(created_at)` + ` · edited` (no timestamp).
- **Idea** `frontend/src/pages/ideas/IdeaCard.tsx:120-141`: avatar 28px inside a decorative `PlayerLink`, name a `PlayerLink`, initial `text-xs`; second line `fmtDateTime(created_at)` + ` · edited`.

So of 3 bylines, 1 links to the profile and 2 do not; 2 are 28px and 1 is 32px; 2 date formats.

## Decorations on a person — what each means where

### Crown — 5 places, 4 meanings
- `frontend/src/ui/primitives/CupOwnerBadge.tsx` (24px disc, 12px stroked crown, cup colour) at:
  - `frontend/src/pages/PlayersAdminPage.tsx:237-243` — Players list: **holds the cup today** (next to a name whose avatar already wears the cup ring, `:202`)
  - `frontend/src/pages/profile/ProfileHeader.tsx:184-190` — profile header: **holds the cup today** (again next to a ringed avatar, `:162-177`)
  - `frontend/src/pages/live/StandingsTable.tsx:359-361` — tournament standings: **held the cup going into this tournament** (title `… owner (before tournament)`; the avatar at `:350` gets no ring)
- `frontend/src/pages/stats/PositionsView.tsx:421-426` — Positions tile, 9px **filled** crown in cup colour: **won this tournament with that cup at stake**
- `frontend/src/pages/TournamentsPage.tsx:35-50` — tournament list, 28px disc, 14px stroked crown: **the cup is at stake in this tournament** (not attached to a person)
- `frontend/src/pages/stats/TournamentLaurelMarkers.tsx:19-36` — 14px disc, 8px filled crown on the date pill of match-history blocks: **cup at stake** (not attached to a person)

### Trophy — 5 places, 3 meanings
- winner: `frontend/src/pages/live/OverviewSection.tsx:133` (20px gold) and `frontend/src/pages/TournamentsPage.tsx:168` (12px gold, before the winner's name)
- "no owner yet" avatar placeholder: `frontend/src/pages/stats/cupParts.tsx:87-90` (18px muted)
- section/tab icon: `frontend/src/pages/stats/RecordsView.tsx:118`, `frontend/src/pages/live/LiveTournamentPage.tsx:591`

### Rings — see "Avatar ring" above (cup = holds today, 11 sites; accent = selected, 5 pickers).

### Position numbers — 3 styles + 1 tile
- right-aligned, regular, muted `w-4 text-right text-xs tabular-nums`: `frontend/src/pages/live/StandingsTable.tsx:348`, `frontend/src/pages/stats/StatsTable.tsx:192`, `frontend/src/pages/live/WhatIfSection.tsx:295`, `frontend/src/pages/live/OverviewSection.tsx:246` — 4
- centred, **bold**, muted `w-4 text-center text-xs font-bold`: `frontend/src/pages/stats/StreaksView.tsx:54`, `frontend/src/pages/stats/RecordsView.tsx:134` — 2
- right-aligned, **mono**, `w-5`: `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:30` — 1
- inside a tile with a colour ramp by place (`--pos-p`), `text-xs font-semibold`: `frontend/src/pages/stats/PositionsView.tsx:413-428`

### "First place" marks — 3 different ones
- 2px green bar at the row's left edge: `frontend/src/pages/live/StandingsTable.tsx:347`
- first row `font-semibold text-text-normal`, others muted: `frontend/src/pages/live/OverviewSection.tsx:240-244`
- tile colour ramp: `frontend/src/pages/stats/PositionsView.tsx:416-418`

### Movement arrows ▲ ▼ — 1 place: `frontend/src/pages/live/StandingsTable.tsx:115-121,349` (delta vs finished-only table)

### Streak patches — 2 places, 2 shapes
- `frontend/src/ui/StreakPatches.tsx` chips (icon + number, accent border when a record) on standings rows: `frontend/src/pages/live/StandingsTable.tsx:362-364` (`streak-compact`, 20px tall, 10px icon)
- a green `live` pill after the name for an ongoing streak: `frontend/src/pages/stats/StreaksView.tsx:66`

### Colour on a person — 2 sources, 3 forms
- **player colour** (`frontend/src/pages/stats/usePlayerColors.ts`, stable per player), always as a dot, never on the name: `frontend/src/pages/stats/CupDetail.tsx:176` (8px dot before the reign holder), `frontend/src/pages/stats/cupParts.tsx:143,150-156` (timeline segment + 8px legend dot), `frontend/src/pages/dashboard/TrendsPreviewCard.tsx:309-312` (10px dot, inert legend), `frontend/src/pages/stats/trends/TrendsExplorer.tsx:161-178` (10px dot inside a toggle chip, struck through when hidden), `frontend/src/pages/stats/PlayerProfile.tsx:142-156` (10px dot inside a toggle chip) — 5 files
- **cup colour on the name text** · 1: `frontend/src/pages/stats/cupParts.tsx:79-81` (`style={{ color }}` — Cups sub-view and dashboard holder line), the only coloured name in the app
- **accent** on a name: `frontend/src/pages/stats/H2HView.tsx:452` (selected matrix row), `frontend/src/ui/primitives/AvatarButton.tsx:68-70` (selected picker label goes from muted to normal, not accent); accent wash on a whole row: `frontend/src/pages/live/WhatIfSection.tsx:291` (focus row, `bg-accent/10` + `font-semibold`), `frontend/src/pages/stats/h2h/DuoLeaderboard.tsx:28` (`bg-accent/10`)

### Result marks next to a name — 1 mechanism
- `ScoreLine` `focus`/`result`: the focus player's numeral is coloured win/draw/loss and, in compact rows, a 16px W/D/L disc sits at that side's outer edge (`frontend/src/ui/primitives/ScoreLine.tsx:193-209,244-252`; consumers `MatchHistoryList.tsx:57-88`). Matchup "Last 5" uses 24px W/D/L discs with no name (`MatchupView.tsx:222-234`).

### Chips that hold a name — 3 looks, 3 behaviours
- `chip` class, inert: `frontend/src/ui/primitives/VoteVotersModal.tsx:55-59,74-78`
- `chip` class, toggle button (legend): `frontend/src/pages/stats/trends/TrendsExplorer.tsx:165-178`; `chipClass()` toggle: `frontend/src/pages/stats/PlayerProfile.tsx:146-156`
- hand-rolled pill `rounded-full bg-bg-card-chip/50 px-2 py-0.5 text-xs`, a profile link: `frontend/src/pages/stats/StreaksView.tsx:71-83`
- `×N` reign chip + the word `current`: `frontend/src/pages/stats/cupParts.tsx:26-32`, `CupDetail.tsx:214-215`

## The current user — marked in 4 places, unmarked in every list

**What varies:** whether "you" is ever distinguished from other people.

- **A — marked** · 4 places
  - `frontend/src/pages/SettingsPage.tsx:108-113` — Account block: `{playerName || "Guest"}` in `font-medium`, then role and ` · as <actor>` when viewing as someone else
  - `frontend/src/pages/SettingsPage.tsx:172-175` — "View as" list: `{playerName || "Me"} (me)` — the only "(me)" suffix in the app
  - `frontend/src/pages/profile/ProfileHeader.tsx:192` — `This is your profile` vs `Public profile` (plus own-only counters `:194-205`, own-only unread lines `:211,270`)
  - `frontend/src/ui/shell/NotificationBell.tsx:40-42` — second person in the headline (`… replied to your comment`, `… poked you`)
- **B — the reader's own name printed as a name, not as "you"** · 2 places
  - `frontend/src/pages/live/TournamentCommentsCard.tsx:783-792` — composer chip `Roli` / `Anonymous` (falls back to `Me` only if the name is missing)
  - `frontend/src/pages/live/TournamentCommentParts.tsx:276-286` — edit "Posted as" select: name or `Me`, `Anonymous`, `<other> (original)`
- **C — the reader is pre-selected but not labelled** · 1: `frontend/src/pages/live/WhatIfSection.tsx:172-178` (opens on `actorPlayerId`; the picker shows only the accent selection ring)
- **D — no self marking at all** · every list of people: `StandingsTable.tsx:333-380`, `StatsTable.tsx:189-207`, `StreaksView.tsx:52-69`, `RecordsView.tsx:125-147`, `PositionsView.tsx:317-357`, `CupDetail.tsx:170-233,259-283`, `PlayersAdminPage.tsx:184-250`, `H2HView.tsx:430-455,504-525`, `TournamentCommentParts.tsx:155-180` (own comments look like everyone's; only the action buttons differ by permission), `GuestbookEntryCard.tsx:108-122`, `IdeaCard.tsx:120-141`, `VoteVotersModal.tsx:53-79`, the trends legends, all 5 pickers. The shell (sidebar, drawer, tab bar, top bar) shows no logged-in name or avatar anywhere (`grep useAuth ui/shell/*` → only `AppShell.tsx:30`, which reads the token).

## Empty-name fallbacks — 8 spellings

- `—`: score-line sides with no players (`MatchOverviewPanel.tsx:37`, `OverviewSection.tsx:39`, `FriendlyList.tsx:84`, `MatchList.tsx:91-92`, `MatchHistoryList.tsx:47-48`, `WhatIfSection.tsx:92-93`, `matchDisplay.ts:5`, `matchupSummary.ts:40`); rival cards (`H2HView.tsx:60`, `ProfileOverviewTab.tsx:33`); decider (`LiveTournamentPage.tsx:298-303`)
- `Anonymous`: `frontend/src/pages/live/TournamentCommentsCard.tsx:466`
- `Player #N`: `TournamentCommentsCard.tsx:467`, `TournamentCommentParts.tsx:284`, `ProfileHeader.tsx:182`, `useProfilePokes.ts:77`, `guestbookTree.ts:128`
- `#N`: `MatchupView.tsx:106`, `RecordsView.tsx:258`, `LiveTournamentPage.tsx:298,302`, `SettingsPage.tsx:112`
- bare `N` as the avatar initial: `ProfileHeader.tsx:164,173`
- `Guest` / `Me`: `SettingsPage.tsx:108,174`; `Me`: `TournamentCommentParts.tsx:279`, `TournamentCommentsCard.tsx:791`
- `Unassigned` / `Team A` / `Team B`: `FriendlyMatchCard.tsx:115,207,211`; `CommentComposer.tsx:463,480`
- `?`: `AvatarCircle.tsx:60`

---

## Fresh-eye observations

Things that look arbitrary or wrong on first contact, even where the app is internally consistent about them.

1. **A crown does not have one meaning.** On the Players page and the profile it says "holds the cup now" — and the avatar next to it already says the same thing with its coloured ring, so the fact is drawn twice. In the tournament standings the identical badge says "held the cup *before* this tournament", and the avatar there says nothing. In the Positions grid a smaller filled crown says "won it". In the tournament list and on match-history date pills the crown is not about a person at all.
2. **A tournament comment's author is a dead avatar and name; an idea's author is a link.** The two cards are laid out the same way. A reader who learns on the Ideas board that a byline opens a profile will tap comment bylines and get nothing; the guestbook is dead too.
3. **In the tournament standings the whole row is the profile; in every stats list the row is something else and only the name is the profile.** Same avatar + name + record look, opposite tap model (3 whole-row sites vs 12 name-link sites).
4. **Six ways to write a 2v2 team**: stacked lines, `A/B`, `A / B`, `A` `/` `B` with a muted slash, `A + B`, and — in the Records list only — the stacked-looking score line collapses to a single `A + B` line. The very same club slot label reads `Roli + Berni` on a tournament match and `Roli/Berni` on a friendly.
5. **The two micro-grids draw the same people differently**: the Positions grid heads its columns with a 24px avatar over a name; the H2H matrix heads its columns with rotated text and its rows with a text button, no avatar anywhere.
6. **Two trends legends for the same series**: the dashboard legend is inert dots in a three-column grid; the Stats legend is toggle chips with strike-through. The "Compare with" chips on the Player view are a third rendering of the same dot + name.
7. **The cup holder's *name* is painted in the cup's colour** (dashboard and Cups view). Nowhere else is a name coloured by anything; elsewhere colour belongs to a dot, and that dot means "this player" in one context (player colour) and "this cup" in another (cup colour), at 8px and 10px.
8. **Rank digits come in three typographies** (regular right-aligned, bold centred, mono right-aligned in a wider column), and "you are first" is a green bar in one table, bold text in another, a colour ramp in a third.
9. **The fallback initial does not scale with the disc**: a 24px avatar shows a 14px letter, a 28px comment avatar shows a 12px one, a 28px stats-table avatar shows a 14px one.
10. **"You" is nearly never said.** Only Settings writes "(me)" and only the profile header says "your". In standings, tables, comments, voters, pickers and every leaderboard the reader's own row is indistinguishable, and the composer labels the reader by name rather than "you" — while the notification bell speaks in the second person.
11. **A pill that looks like every other chip is sometimes a door**: the Streaks "Current" pills open a profile, the voter chips do nothing, the legend chips toggle a line.
12. **An anonymous comment loses its avatar**, so its byline sits 36px left of the named ones in the same feed.
13. **The avatar editor crops in a rounded square with a circle drawn over it**, while every avatar in the app is a circle.
14. **A player's name is width-capped in exactly three places** (64px under picker avatars, 120px in the H2H matrix, 150px for the tournament-list winner) and free everywhere else; long names in the rotated matrix header are never cut at all.
15. **The profile header avatar opens a lightbox when there is a photo and is inert when there is not** — the same 56px disc, two behaviours, no cue.
16. **The Records list is the one place a 2v2 score line does not stack** (it receives the `A + B` string), so Records rows sit taller/shorter than the identical rows in Streaks or the match history depending on the mode.
17. **Four tooltip phrasings for the same door** (`Open X's profile`, `Open profile: X`, `Open X's full profile`, `… · drag to reorder`).
