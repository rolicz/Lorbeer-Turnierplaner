# PLAN-8 — TODO-8 fixes & features

Living plan. Work phase-by-phase, commit per phase, tick boxes as we go. Keep going
over this file until **every** box is checked (per TODO-8 Remarks). Verify each phase
with `npm run check` + build (+ `make test` for backend phases) and Playwright DOM/console
checks. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
**Never** commit `TODO-8.md`. Push/deploy only on explicit request.

Model plan: **plan on Opus** (this). Implementation — **Opus for Phase D (ELO: data
correctness + view-mode design)**, **Sonnet for Phases A/B/C** (mechanical). I'll say
"switch to <model>" at each boundary.

---

## Phase 0 — WebSocket 403 (item: General) ✅ DONE (commit 9cbde7f)
- [x] Per-tournament + global WS hooks now pass the auth token (`buildWsUrlForPath(path, token)`), matching `usePlayerProfileWS`. Fixes 403→"reconnecting" on a server with `WS_REQUIRE_AUTH=true`.
- [x] **Anonymous viewers (resolved):** set `WS_REQUIRE_AUTH=false` on the **server** (env only, no code) so logged-out visitors also get live updates — live data is public. → **Deployment action when pushing:** ensure `WS_REQUIRE_AUTH=false` (or unset, since it defaults false) in the server's backend env / docker-compose.

## Phase A — Trends polish ✅ DONE (commit 16ccefb)
- [x] **A1 — always show tournament names** (removed toggle; labels always on)
- [x] **A2 — dashboard trends preview consistency** (bordered container; rolling over tournaments not matches; dynamic yMax; showLabels)

## Phase B — Stats small fixes ✅ DONE (commit dd9153f)
- [x] **B1 — Positions scroll** (dropped max-h-[72vh]; plain overflow-x-auto)
- [x] **B2 — H2H matrix add PPM + Rivalry** (ppm=(3w+d)/played; rivalry=rivalry_score)
- [x] **B3 — default logged-in player** (useAuth in StatsInsights; selfInRows → selectedId; myId → H2HView)

## Phase C — Tournaments overview participants ✅ DONE (commit 5f52655)
- [x] **C1 — backend** (participants field on TournamentListItemOut; populated from match sides; TS types regenerated)
- [x] **C2 — frontend** (muted truncated line below meta row in each tournament card)

## Phase D — ELO trends ✅ DONE (commit e656f78)
Design (**confirmed**): ELO is a **running** value sourced from a **backend history endpoint**.
View mapping — **Cumulative = running rating**; **Per event = net ELO Δ**; **Last N hidden**; **Per-match hidden**.
- [x] **D1 — backend rating history** (compute_stats_ratings_history; GET /stats/ratings/history; 3 tests pass)
- [x] **D2 — frontend ELO metric** ("Elo" chip; fetches history; Rating/Δ per event view modes)

## Phase E — Verification ✅ DONE
- [x] `npm run typecheck` + `npm run lint` + `npm run build` green.
- [x] `npm run check` — 76 frontend tests pass (9 files).
- [x] Backend `make test` — 88 tests pass (incl. 3 new ratings-history tests).
- [x] Build clean (2347 modules, no new errors).

---

## Open questions — RESOLVED
1. **Anonymous WS** → set server `WS_REQUIRE_AUTH=false` (live data is public). Deployment-time env action, no code.
2. **ELO data source** → backend history endpoint (`/stats/ratings/history`), single source of truth.
3. **ELO view modes** → Cumulative=running rating · Per-event=net Δ · Last-N hidden · no per-match.
