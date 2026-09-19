# Features 2026-09 — Media sizes: the server pre-computes the smaller sizes and serves the one that is needed

> Branch `feature/2026-09-guestbook` is where this plan is written down (baseline `7ccd59c`);
> the **implementation branch is `feature/2026-09-media`, cut off `main` after the guestbook
> batch has merged** — that merge commit is the real baseline and is unknown at writing.
> Written 2026-09-19 in a read-only planning session: no gate was run, but every number below
> was **measured on this machine** against the real `backend/data/uploads` (the methods are named
> where the numbers are). Baselines to re-read from `AGENTS.md` §11 after the merge — at
> `7ccd59c` they are `make test` **286 passed** (last run at K4's tree `ad21035`; nothing since
> has touched `backend/`) and `cd frontend && npm run check` **780 tests in 80 files**.
> Symbol names are the source of truth; line numbers reference `7ccd59c`.
> Read `AGENTS.md` first (§5 persistence, §6 API + the cache-policy table, §7 deployment,
> §9 conventions, §10 gotchas), then `DESIGN.md` §7 (`AvatarCircle`, the guestbook citation,
> `ImageLightbox`).
> This batch **touches the backend and adds the project's first image dependency**, but adds
> **no table and no column**: the schema is untouched, `_RUNTIME_COLUMNS` is untouched, and
> the only new persistent thing is a **cache directory** that is safe to delete. It is a
> **full** deploy all the same (the backend image is rebuilt with a new wheel in it).
> **Not deployed** at the end of the batch — Roli tests first.
>
> Task IDs `W1`–`W4`. `A C D DS F G K M N P Q R S T U` are taken
> (`grep -rhoE '^## [A-Z]+[0-9]+' *.md` at `7ccd59c` lists exactly those); `W` is free.

## Why this batch exists

Roli, verbatim: *"can you pre-compute smaller sizes on server -> then serve whats requested
(needed)"*. Asked how wide to scope it he chose **all media — avatars, header images and
guestbook subject snapshots**; asked about comment images once the plan was written he added
them too (*"yeah comment images as well, go"*, 2026-09-20), so the families are **four**.

Today every media file is served whole, whatever it is drawn at. There is one endpoint per
family, it reads the row, it reads the file, it returns the bytes. A 512×512 avatar is 319–502 KB
and is drawn at 24–80 px; a 1920×1080 header image is 0.5–2.9 MB and is drawn at 358 px on a
phone; a guestbook citation draws a **71×40** thumbnail of a pinned header snapshot and downloads
**2.66 MB** to do it (Q-B measured that one and named this fix: *"a `?w=` thumbnail on
`GET /players/guestbook-subjects/{id}/image`"*).

**Measured on the dev machine (Raspberry Pi 5, 2026-09-19) against `backend/data/uploads`**, which
is production's media plus this branch's own writes:

| family | files | on disk | dimensions | in scope |
|---|---|---|---|---|
| `avatars/` | 6 | **2.07 MB** (41 – 502 KB each) | 512×512 | **yes** |
| `profile_headers/` | 4 | **7.17 MB** (524 – 2,940 KB) | 1920×1080 | **yes** |
| `guestbook_subjects/` | 4 | **6.21 MB** | 2×1920×1080, 2×512×512 | **yes** |
| `club_crests/` | 591 | 21 MB | 200 px | **no — see below** |
| `comments/` | 6 | **17 MB** | — | **yes** (added 2026-09-20) |
| whole `uploads/` | | 53 MB | | |

**Crests are deliberately excluded, and the next reader should not re-propose them.** They are
591 files averaging 36 KB, they are drawn at 16–22 px, and Roli was offered a re-encode of exactly
that corpus in September 2026 and **declined it** (`AGENTS.md` §11, "Club crests are 200px PNGs…
Offered and **declined** (2026-09-16)"). Folding them in here would re-open a closed decision and
would triple this batch's disk footprint for a corpus whose own measured answer was "palette PNG",
not "resize". `comments/` is 17 MB over 6 files and **is in**: Roli added it after the plan was written,
and it cost what this paragraph predicted — one more call site on the module W1 builds, not a new
code path. W1 serves it; no frontend task in this batch asks a comment image for a width yet,
so the saving on that family is waiting for a call site, not for a mechanism.

### What the saving actually is, on a real screen

Measured with Pillow/LANCZOS/WebP q82 over the real files (script and raw table under
"Decided by this plan", §3). Cold cache, 390 px viewport, `devicePixelRatio` 3:

| screen | today | after | saving |
|---|---|---|---|
| Stats → Table: 6 avatars at `h-7` (28 px) → `w=128` | **2,117 KB** | **18.8 KB** | −99.1 % |
| A profile's identity block: banner (358 px → `w=1152`) + 80 px avatar (→ `w=256`) | **2,919 KB** | **44.8 KB** | −98.5 % |
| One guestbook citation of a **header** snapshot (71×40 → `w=256`) | **2,940 KB** | **8.9 KB** | −99.7 % |
| One guestbook citation of an **avatar** snapshot (40×40 → `w=128`) | **502 KB** | **3.9 KB** | −99.2 % |

At 1280 px desktop, dpr 1, the banner needs 1104 px → `w=1152` = 39.2 KB against the same
2,600 KB; at dpr 2 it takes the top rung, 54.6 KB.

**The saving is not small, and it is not a micro-optimisation**: the profile page of a player with
a header image and four guestbook citations moves from **≈ 9.3 MB** of images to **≈ 65 KB**. On
Roli's phone on mobile data that is the difference between a page that paints and a page that
waits. Two honest caveats, both stated rather than buried: (a) the browser caches these for a week
(`max-age=604800`) or a year (snapshots, `immutable`), so the saving is felt on a **cold** cache —
a new install, a new device, a cleared Safari, a first visit to a profile; and (b) the whole
derived cache for today's media is **1.43 MB**, which is less than one header image, so the disk
cost is not a trade-off worth thinking about.

## Rules for implementing agents

1. Implement ONLY your task. No drive-by reformatting, no scope creep. Match surrounding code
   style (thin routers, bodies in `services/`, error helpers from `api_utils.py`; Tailwind +
   design tokens, `qk` query-key factory, generated API types, lucide-react with an explicit
   `size`).
2. Work on branch `feature/2026-09-media`. **Never switch branches, never touch `main`, never
   push.** One or more commits per task, message prefixed with the task ID (`feat(W1): …`,
   `perf(W3): …`, `docs(W4): …`).
3. **Parallel-worker discipline:** commit only your task's files with
   `git commit -o -m "msg" -- <paths>` — never `git add`, never `git add -A`, never
   `git commit -a`. Each task lists its file set; if you need a file outside it, stop and report.
   `AGENTS.md` and `DESIGN.md` are edited by **W4 only**: write the canon line your task changes
   under "Canon" in your task section and leave the files alone.
4. **Verify first.** Every task names the check that proves the gap still exists. Run it before
   changing anything; if the gap is gone, tick the task with "already fixed at <sha>" and stop.
5. Checks must be green before committing. Backend touched → `make test` + `make lint`. **The
   OpenAPI surface changes in W1 → `make gen-types`, and `frontend/src/api/generated/schema.d.ts`
   goes in the same commit.** Frontend touched → `cd frontend && npm run check`
   (+ `npm run build`, which W2 and W3 both owe: they change what the browser fetches).
   Baselines: `AGENTS.md` §11 after the guestbook merge (286 / 780 at `7ccd59c`).
6. UI must work at ~390 px and ≥1024 px, verified in a real browser (Playwright against the
   isolated stack below) in **both** the `blue` and the `light` theme. Measure, do not eyeball —
   and in this batch the measurement is bytes: `performance.getEntriesByType("resource")`.
7. Never read or print `backend/secrets.json`. **This batch is about `backend/data/uploads`, so
   every stack points `UPLOADS_DIR` at a COPY OUTSIDE THE REPO** (recipe below) — never at
   `backend/data/uploads`, never at a path inside the repo, because a derived cache written under
   `backend/data/uploads` would pollute real media and a `verify-*-uploads` directory inside the
   repo would show up as untracked. Never run destructive commands on `backend/app.db`,
   `backend/data/app.db` or `backend/data/uploads` — copy first. Never write into `backup/`.
   **Never bind 8000/8001/8010/5173 — Roli's dev servers are live there.** Kill only the PIDs you
   started, by exact PID; never a pattern-matching `pkill`.
8. **One mechanism per job — reuse before you create.** A second place that decides a width, or a
   second way to build a media URL, is a failed task even when both are correct and the tests are
   green. The shared things this batch depends on:

   | job | the one implementation | who builds it |
   |---|---|---|
   | which widths exist, server-side | `services/media_derivatives.py::MEDIA_WIDTHS` + `MediaWidth` (a `Literal`, so FastAPI publishes it as an OpenAPI enum) | W1 |
   | deriving and caching one size | `services/media_derivatives.py::derived_bytes` | W1 |
   | where a derivative lives on disk | `services/media_derivatives.py::derived_rel_path` | W1 |
   | anything that knows where the media root is | `services/file_storage.py` — and **only** it (its `list_media` docstring already says so) | W1 extends it |
   | throwing a source's derivatives away | `services/media_derivatives.py::purge_derivatives`, called from `file_storage`'s two byte-changing paths | W1 |
   | the boot sweep | `sweep_orphan_derivatives()` from `init_db()`, the `sweep_orphan_subjects` shape | W1 |
   | serving a media file, derived or not | `services/media_derivatives.py::media_response` — one helper, all four endpoints, across two routers | W1 |
   | which widths exist, in the browser | `frontend/src/api/mediaSizes.ts::MEDIA_WIDTHS`, typed `satisfies` the **generated** union so the two sides cannot drift | W2, **its first commit** |
   | "how many device pixels does this CSS box need" | `mediaSizes.ts::mediaWidthFor(cssPx)` | W2 |
   | reading an avatar's px out of its Tailwind size class | `mediaSizes.ts::avatarPxFromSizeClass` | W2 |
   | putting `?v=` and `?w=` on a media URL | `api/client.ts::mediaUrl` — the one builder, unchanged in shape | W2 |
   | asking for an avatar at the size it is drawn | `ui/primitives/AvatarCircle` — **inside the component**, from the `sizeClass` it already has; no call site gains an argument | W2 |
   | the full-size picture | `ImageLightbox`, fed a URL with **no `w`** — it zooms to 6× | exists; nobody changes it |
   | the crop editor's source | the original, no `w` | exists; nobody changes it |

   If your task genuinely needs something new and shared, put it where the existing family lives
   and say so in **Deviations** in your first sentence.
9. Tick your task's checkbox here and fill in **Deviations** under it (what you changed that the
   task did not say, what you measured, what you left). Include that edit in your commit. If
   blocked or the code does not match this spec, stop, note it here, commit nothing broken.

### Runtime verification (isolated stack)

**Tasks run in parallel, so every task has its own ports, its own database copy and its own
uploads copy.** Earlier batches used 8031–8064, 8071–8085, 8091–8098, 8111–8118 and 8121–8124 /
8141–8144. This one takes **8151–8154 / 8171–8174**: no plan file mentions any of them
(`grep -rhoE '\b8[0-9]{3}\b' *.md` at `7ccd59c` jumps straight from 8144 to 8193) and nothing on
this machine is listening on them (`ss -ltn` today: 22, 2019, 5184, 8000, 8001, 8010, 8080, 8093,
8443, 8444, 8787, 8790).

| task | backend | vite | db copy |
|---|---|---|---|
| W1 | 8151 | 8171 | `backend/data/verify-w1.db` |
| W2 | 8152 | 8172 | `backend/data/verify-w2.db` |
| W3 | 8153 | 8173 | `backend/data/verify-w3.db` |
| W4 | 8154 | 8174 | `backend/data/verify-w4.db` |

`backend/data/*.db` is gitignored. **Never** point the stack at `backend/app.db` or
`backend/data/app.db`, and never at the real `backend/data/uploads`.

```bash
# <B>, <V>, <DB> from your row above. Run from the repo root.
cp backend/app.db backend/data/<DB>
UP=$(mktemp -d)/uploads && rsync -a backend/data/uploads/ "$UP"/     # a copy, OUTSIDE the repo

# A throwaway secrets file OUTSIDE the repo (Rule 7). `db_url` names YOUR COPY, spelled
# absolutely, so a stack started without --db-url cannot reach backend/app.db; same idea for
# UPLOADS_DIR — pass it, and never let the default backend/data/uploads be the fallback.
SEC=$(mktemp -d)/secrets.json
cat > "$SEC" <<JSON
{ "db_url": "sqlite:///$PWD/backend/data/<DB>",
  "player_accounts": [ { "name": "Roli",  "password": "verify-only", "admin": true },
                       { "name": "Berni", "password": "verify-only", "admin": false } ],
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

Dev DB players: Roli=1, Flo=2, Rumpi=3, Berni=4, Atzi=5, Mike=6. Player 1 has both a header image
and an avatar; players 1, 2, 3, 4, 6 have avatars; headers exist for 1, 2, 3, 5; guestbook
snapshots 1, 3, 4, 5 exist. Check with `curl -sI :<B>/players/1/header-image` before relying on
anything. `rm -rf "$UP"` when done, and kill only the PIDs you started.

**Playwright note:** the byte measurements in every DoD need a real device pixel ratio. Use
`browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })` and read
transfer sizes with

```js
performance.getEntriesByType("resource")
  .filter(r => /\/players\//.test(r.name))
  .map(r => [r.name.replace(/^.*\/players\//, ""), r.transferSize])
```

with the browser cache disabled for the run (a fresh context is enough; `?v=` and `?w=` make the
URLs distinct anyway).

---

## Decisions (Roli 2026-09-19 — do not relitigate)

- **Pre-compute smaller sizes on the server and serve the one that is needed.** That is the whole
  batch.
- **Scope: avatars, header images and guestbook subject snapshots** — plus **comment images**,
  added by Roli on 2026-09-20 (*"yeah comment images as well, go"*). Four families.
- **Crests are out.** 591 files, 36 KB average, 21 MB; the re-encode was offered in September and
  declined. Do not fold them in and do not re-propose them here.

### Decided by this plan — the seven answers

**1. The dependency: `Pillow==12.3.0`, and `AGENTS.md` §9's "no new dependencies unless the plan
says so" is hereby said.** There is no image library in the backend today
(`backend/requirements.txt` is fastapi, uvicorn, sqlmodel, PyJWT, python-multipart, cryptography,
pytest, httpx) and there is no way to resize a JPEG in the standard library. Pillow is the only
serious candidate, it is the most widely deployed Python imaging library there is, and — the thing
that actually matters for this repo — **it ships as a wheel for both targets, so nothing has to be
compiled anywhere.** Measured, not assumed:

- `pip download --no-deps --only-binary=:all: Pillow` on this Pi fetched
  `pillow-12.3.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl`, 6.3 MB. The
  production image is `python:3.11-slim`, which is Debian/glibc on x86-64, so it takes the
  equivalent `manylinux_..._x86_64` wheel — **no apt packages, no build tooling, no change to
  `backend/Dockerfile`** beyond the line `requirements.txt` already installs. (This is the
  opposite of the frontend's alpine/musl situation in `AGENTS.md` §10; nothing carries over.)
- That wheel was unpacked into a scratch directory and imported under **the project's own
  `backend/.venv/bin/python` (3.11.2)**: `Pillow 12.3.0`, `features.check("webp") → True`, and a
  1920×1080 PNG resized to 1152 and saved as WebP q82 came out at **40,178 bytes**, matching to
  0.1 % what the system Pillow 11.1.0 produced for the same file. The version is not load-bearing.
- Cost to the image: `PIL/` 8.3 MB + `pillow.libs/` 16 MB ≈ **24 MB** added to the backend image.
  Build time is a wheel download, not a compile.
- Cost on the Pi: **`make test` will fail with `ModuleNotFoundError: No module named 'PIL'` until
  the venv is updated.** W1's first step is therefore
  `backend/.venv/bin/python -m pip install -r backend/requirements.txt` (or `make -C backend
  install`). That writes into `backend/.venv`, which is gitignored (`.gitignore:15`), so it is not
  a tree change and is not committed. **Every later worker in this batch must do the same before
  `make test`.**

**2. Derive on demand, cache to disk. The derived files are a cache and deleting them is always
safe.** The alternative — generate every size at upload time — needs a one-off backfill over
production's uploads, a documented deploy step, and a second code path for "a file that was
already there". Deriving lazily needs none of that: the first request for a size that has never
been asked for pays for it once, every request after that is a file read, and a new upload is
covered by the same path with no extra code. Measured cost of that one-off pay, on the Pi (the
slowest machine involved; the VPS is faster):

| source | rung | encode |
|---|---|---|
| 512×512 avatar | 64 / 128 / 256 / 384 | 13–20 / 17–24 / 26–37 / 41–52 ms |
| 1920×1080 header | 64–384 | 82–135 ms (decode dominates) |
| 1920×1080 header | 768 / 1152 / 1536 | 139–188 / 201–264 / 293–365 ms |

A cold stats page derives six avatars at once; FastAPI runs `def` endpoints in a threadpool and
Pillow releases the GIL during resize and encode, so they overlap across the Pi's cores. The
worst first load in the app adds roughly **0.1–0.4 s, once, ever**.

Two requests racing for the same missing derivative both derive it and both write it; `write_media`
writes to a temp file and `os.replace`s, so the file is never half-written and the loser's copy is
byte-identical. No lock, and no lock wanted.

**Every failure path falls back to the original.** Pillow cannot open it, the format is one a
resize would damage, the source is already smaller than the rung, the encode raises — the endpoint
serves the source bytes with the source's own content type. **A derivative is an optimisation and
must never be able to turn a working picture into a 500.**

**3. The widths: a fixed ladder of seven, `64, 128, 256, 384, 768, 1152, 1536`, and nothing else
exists.** They are derived from what the app actually draws, at dpr 1, 2 and 3 — not invented:

| rung | who asks for it (measured from the code) |
|---|---|
| 64 | a 24–32 px avatar at dpr 1–2 (`h-6`…`h-8`: Positions, Records, Streaks, Ideas comments, the stats table) |
| 128 | a 24–40 px avatar at dpr 3, a 40–56 px at dpr 2, and the **avatar** citation thumbnail (40 px) at dpr 3 |
| 256 | the profile's 80 px avatar at dpr 3 (240), the 56 px stats card at dpr 3, and the **header** citation thumbnail (71 px) at dpr 3 (213) |
| 384 | the profile banner at 390 px CSS, dpr 1 (the column is 358 px) |
| 768 | the banner at 390 px, dpr 2 (716) |
| 1152 | the banner at 390 px dpr 3 (1074), and the widest desktop column (1104) at dpr 1 |
| 1536 | the banner on a retina desktop (1104 × 2 = 2208, capped here) |
| *(omitted)* | the lightbox and the crop editor: the **original**, always |

Avatar box sizes in the app today, read out of the 25 `AvatarCircle`/`AvatarButton` call sites:
`h-6` 24, `h-7` 28, `h-8` 32, `h-9` 36, `h-10` 40 (the default), `h-12` 48, `h-14` 56, `h-20` 80.
The page column is `mx-auto w-full max-w-6xl page-x` with `--page-pad-x` 16 / 20 / 24 px at
</640 / ≥640 / ≥1024, and the desktop sidebar is `w-60` (240 px) — so the banner is **358 px** at a
390 px viewport and at most **1104 px** on any desktop.

**The endpoint accepts only these seven and FastAPI enforces it**: `w` is typed
`Optional[Literal[64, 128, 256, 384, 768, 1152, 1536]]`, so `?w=137` is a **422** before a line of
our code runs and no arbitrary integer can ever fill the disk. That is the whole answer to
"an open-ended `?w=` is a disk-filling vector": there is nothing to snap, because nothing else
parses. The ceiling on the cache is therefore exact and knowable — **at most seven files per
source**, and for today's media the entire cache, every rung of every in-scope file, is
**1.43 MB over 74 files** (avatars 158 KB / 24 files, headers 880 KB / 28, snapshots 426 KB / 22).

And the ladder cannot drift between the two languages, because the browser's copy is typed against
the **generated** one. Verified with a throwaway FastAPI app + this repo's own
`openapi-typescript@7.13.0`: `Optional[Literal[64, …]]` renders as
`w?: (64 | 128 | 256 | 384 | 768 | 1152 | 1536) | null` inside
`operations["get_player_avatar_players__player_id__avatar_get"]["parameters"]["query"]`. W2's
`MEDIA_WIDTHS` is `as const satisfies readonly MediaWidth[]` over exactly that union (the
`SUBJECT_KINDS satisfies readonly GuestbookSubjectKind[]` idiom `guestbookSubjects.ts` already
uses), plus a test-side assertion that catches the other direction too.

**4. The format: every derivative is WebP, at quality 82, resized with LANCZOS. The source keeps
its own format.** `AGENTS.md` §11 records that a **palette PNG** beat WebP for club crests — that
measurement is about flat badge art with a handful of colours and **does not transfer to
photographs**, which is what avatars and header images are. Measured here on the real files, same
pixels each time:

| source | rung | PNG | **WebP q82** | JPEG q82 |
|---|---|---|---|---|
| `avatars/1.png` 512², 319 KB | 256 | 82.5 KB | **5.6 KB** | 9.2 KB |
| `avatars/3.png` 512², 502 KB | 256 | 129.1 KB | **11.5 KB** | 14.7 KB |
| `profile_headers/1.png` 1920×1080, 2,600 KB | 1152 | 1,003 KB | **39.2 KB** | 98.4 KB |
| `profile_headers/3.png` 1920×1080, 2,940 KB | 768 | 568 KB | **43.0 KB** | 62.7 KB |

WebP is **12–25× smaller than PNG** and 1.4–2.5× smaller than JPEG for this content, and unlike
JPEG it keeps alpha, which four of the six avatars have (RGBA). There is **no content
negotiation** — no `Accept` sniffing, no `<picture>`, no `Vary` — because every browser this app
runs in has supported WebP since 2020 (Safari 14 / iOS 14) and a negotiated response is a second
mechanism for one job. A derivative's `Content-Type` is `image/webp`, full stop.

**Two formats are never derived**, by content type: `image/svg+xml` (already resolution
independent, and rasterising it would be a downgrade) and `image/gif` (a resize would drop the
animation). Both fall through to the original. A source **already narrower than the requested
rung** does the same, which is why `avatars/*` have no rung above 384 in the table above and
`w=768` on an avatar simply returns the 512-wide original.

**5. The wire: one optional `?w=` on each of the four endpoints, riding beside the existing
`?v=`, with the source's own cache headers.**

```
GET /players/{player_id}/avatar?v=<updated_at>&w=256        → image/webp, Cache-Control: public, max-age=604800
GET /players/{player_id}/header-image?v=<updated_at>&w=1152 → image/webp, Cache-Control: public, max-age=604800
GET /players/guestbook-subjects/{id}/image?v=<captured_at>&w=256
                                                            → image/webp, Cache-Control: public, max-age=31536000, immutable
GET /comments/{comment_id}/image?v=<updated_at>&w=384       → image/webp, Cache-Control: public, max-age=604800
```

**A derivative is exactly as cacheable as its source** — same header, byte for byte, because the
two facts that make a source cacheable are equally true of a derivative: an avatar's URL carries
`?v=<updated_at>` so a replaced picture is a new URL, and a snapshot never changes at all, which is
what earns it `immutable`. `?w=` only makes the URL *more* specific, never less.

`?v=` is still the client's cache-buster and the server still **ignores it** (it always has: the
endpoint reads the row). The derived file on disk is keyed on a **server-side** token taken from
the same row, so a client cannot poison the cache by lying in `?v=`, and a replaced source can
never serve a stale derivative: new `updated_at` → new token → a path that has never been written.
The chain `upload → new updated_at → new ?v= → browser refetches → new token → fresh derivative`
holds end to end.

On disk: `uploads/derived/{source relative path}/{token}-{width}.webp`, e.g.
`derived/avatars/3.png/20260912132900123456-256.webp`. Keying the directory on the **source's own
relative path** (not on a family + id) is what lets one `purge_derivatives(rel_path)` serve every
family, present and future, and what makes the boot sweep a question about files rather than a
question about the database.

Behind Caddy nothing changes: `handle_path /api/*` strips the prefix and passes the query string
through untouched, and `encode gzip zstd` already applies to the images served today (WebP and PNG
are both incompressible, so it does nothing either way).

**6. The frontend: one module answers "how many pixels", and no call site gains an argument.**
`frontend/src/api/mediaSizes.ts` holds the ladder, the dpr cap and `mediaWidthFor(cssPx)`;
`mediaUrl(path, updatedAt, width)` in `api/client.ts` is still the only URL builder and still
produces the **byte-identical** URL it produces today when `width` is omitted — so nothing that
does not opt in changes, and no existing cache entry is invalidated by this batch.

- **`AvatarCircle` asks for its own size, from inside itself.** It already receives
  `sizeClass="h-8 w-8"`; `avatarPxFromSizeClass` reads the `h-N` and multiplies by 4 (Tailwind's
  scale, and all 25 call sites in the app spell exactly that shape). One component, one line, and
  **not one of the 25 call sites changes** — which is Roli's own constraint: *"`AvatarCircle` is
  one component and should not grow a size argument at every use if its existing `size` already
  says what is needed."* An unrecognised class (`h-full`, `h-[3.25rem]`) returns `null` and the
  original is served, so a future call site can only ever be slow, never broken. The ring padding
  (1 px, or 2.5 px for a cup ring) is **not** subtracted: asking for the full box can only
  over-serve by a few pixels and never under-serve, and one fewer thing to get wrong is worth more
  than the 5 px.
- **The citation asks for its thumbnail.** `SubjectCitation` draws `h-10` (40 px) at
  `aspect-square` for an avatar and `aspect-[16/9]` — 71 px — for a header, and those two numbers
  are already in the component. `mediaWidthFor(40)` / `mediaWidthFor(71)`.
- **The banner uses `srcset`/`sizes`**, which is the platform's own answer to "a box whose width
  depends on the viewport" and needs no measurement in JS, no resize listener and no re-render.
  One `sizes` string, built from the layout above.
- **The lightbox and the crop editor keep the original.** `ImageLightbox` zooms to 6×; that *is*
  the full-size use, and it is the reason the banner's `src` and the lightbox's `src` have to stop
  being the same string in `ProfileHeader`.

**7. What must not regress** — each of these is a DoD line somewhere below, not a hope:
the profile header's full-size image (the lightbox, unchanged, no `w`); the crop editor's source;
the crest precedence chain crest → nation flag → monogram (untouched — crests are out of scope and
`clubs.api.ts::clubCrestUrl` is in nobody's file set); the local-first rule (deriving happens on
our own backend; no CDN, no runtime fetch, no new asset host); `?v=` cache-busting, so a replaced
avatar still appears immediately; and the fallback chain, so that a picture that renders today
still renders after this batch even if Pillow hates it.

**8. Task order and parallelism.** W1 alone → W2's **first commit** (the mechanism) → **group A**
{W2 rest, W3} in parallel → W4.

---

## Task overview & order

| # | ID | Title | Files (disjoint per parallel group) | Runs |
|---|----|-------|-------------------------------------|------|
| 1 | W1 | Pillow, the derived cache, and `?w=` on the four media endpoints | `backend/requirements.txt`, `backend/app/services/media_derivatives.py` (new), `backend/app/services/file_storage.py`, `backend/app/routers/players.py`, `backend/app/routers/comments.py`, `backend/app/db.py`, `backend/tests/test_media_derivatives.py` (new), `frontend/src/api/generated/schema.d.ts` | **first, alone** |
| 2 | W2 | The one place the browser asks for a size | `frontend/src/api/mediaSizes.ts` (new, **first commit**), `frontend/src/api/client.ts` (**first commit**), `frontend/src/api/playerAvatars.api.ts` (**first commit**), `frontend/src/api/playerHeaders.api.ts` (**first commit**), `frontend/src/api/players.api.ts` (**first commit**), `frontend/src/ui/primitives/AvatarCircle.tsx`, `frontend/src/test/mediaSizes.test.ts` (new), `frontend/src/test/avatarMediaWidth.test.tsx` (new) | second; group A after its first commit |
| 3 | W3 | The two big pictures: the banner and the citation thumbnail | `frontend/src/pages/profile/ProfileHeader.tsx`, `frontend/src/pages/profile/GuestbookEntryCard.tsx`, `frontend/src/test/profileBannerSizes.test.tsx` (new), `frontend/src/test/subjectCitationWidth.test.tsx` (new) | group A |
| 4 | W4 | Documentation pass | `AGENTS.md`, `DESIGN.md`, this file | last |

**Order:** W1 alone → W2 commit 1 → {W2 commit 2, W3} in parallel → W4.
**Why W1 alone:** W2 types its ladder against `schema.d.ts`, so a half-written `players.py` breaks
`make gen-types` for anyone sharing the worktree, and W3 cannot measure a single byte until the
server can serve a rung. **Why W2's first commit is separate:** W3 needs
`playerHeaderImageUrl(id, v, w)`, `guestbookSubjectImageUrl(sid, v, w)` and `mediaWidthFor` — all
in W2's set — but does not need `AvatarCircle`. So W2 lands the **mechanism** (`mediaSizes.ts`,
`client.ts`, the three api helpers) as one commit, `feat(W2): the widths the browser may ask for`,
and W3 starts from there. **Why W2 and W3 are then disjoint:** W2 owns `ui/primitives` and
`api/`; W3 owns the two profile pages. Group-A workers will see each other's in-flight files in
`npm run check`; commit only your own, and W3 does not run its final `npm run check` until W2's
first commit is in.

---

## W1 — Pillow, the derived cache, and `?w=` on the four media endpoints  ☑

**The gap.** `routers/players.py::get_player_avatar` (`:376`), `get_player_header_image` (`:446`),
`get_guestbook_subject_image` (`:462`) and `routers/comments.py::get_comment_image` (`:684`) each
read a row, `read_media` the file and return every byte of it; `services/file_storage.py` has five path builders, `read_media`, `list_media`,
`media_exists`, `write_media`, `delete_media` and `upsert_media_row`, and nothing that resizes
anything; `backend/requirements.txt` has no image library.

**Verify first.**
```bash
grep -n "Pillow\|pillow" backend/requirements.txt                       # → 0
ls backend/app/services/media_derivatives.py                            # → no such file
grep -n "w: \|Query" backend/app/routers/players.py | head              # → no width param on any media GET
backend/.venv/bin/python -c "import PIL"                                # → ModuleNotFoundError
```

**Step 0 — the venv.** `backend/.venv/bin/python -m pip install -r backend/requirements.txt` after
you have added the line. `backend/.venv` is gitignored; this is not a tree change and is not
committed. Every later worker in this batch does the same.

**The change.**

1. **`backend/requirements.txt`** — one line, after `python-multipart==0.0.20`:
   ```
   Pillow==12.3.0
   ```
   Nothing else in the file moves. Do **not** add `--only-binary` flags or a constraints file; the
   wheel is what pip picks by default on both targets.

2. **`services/file_storage.py`** — three small readers/removers beside the ones that exist, so
   that this module stays the only one that knows where the media root is:
   ```python
   def list_media_tree(rel_dir: str) -> list[str]:
       """Every file under `rel_dir`, recursively, relative to the media root; [] when the
       directory does not exist. Sorted, so a sweep's behaviour is reproducible."""

   def media_mtime(rel_path: str) -> float | None:
       """The file's mtime, or None when it is not there. A derivative older than its source
       is stale by definition — that is the whole of the boot sweep's second rule."""

   def delete_media_dir(rel_dir: str) -> int:
       """Remove `rel_dir` and everything under it; returns how many files went. Missing
       directory → 0. Used only for the derived cache, which is safe to delete by design."""
   ```
   and **two purge calls**, because there are exactly two ways the bytes under a relative path can
   change (add the import at the bottom of the module, inside the functions, to avoid an import
   cycle — `media_derivatives` imports `file_storage`):
   - in `upsert_media_row`, right after `rel_path = path_builder(row_id, content_type)`:
     `purge_derivatives(rel_path)` — covers the overwrite-in-place case, where the path does not
     change and `delete_media` is never called;
   - in `delete_media`, after the unlink: `purge_derivatives(rel_path)` — covers the avatar and
     header `DELETE` endpoints, `release_subjects`, `sweep_orphan_subjects` and the
     extension-changed branch of `upsert_media_row`, all in one place.

   `purge_derivatives` must not recurse: derivative **writes** go through `write_media` (which has
   no purge) and derivative **removal** goes through `delete_media_dir` (which is not
   `delete_media`). A test asserts a derive does not delete itself.

3. **`services/media_derivatives.py` (new)** — the only module that knows a derivative exists:
   ```python
   """Serve the size that is needed (W1).

   Every media file used to be served whole, whatever it was drawn at: a 2.66 MB header
   image behind a 71x40 citation thumbnail, a 500 KB avatar behind a 28px disc. This module
   derives the size that was asked for and caches it on disk, and everything about it is
   built so that a failure costs nothing: the cache is safe to delete, an unreadable or
   unresizable source falls through to the original, and a width that is not on the ladder
   never reaches here at all (FastAPI rejects it).
   """

   #: The only widths that exist. Spelled once, here. The four endpoints annotate `w` with
   #: `MediaWidth`, FastAPI publishes it as an OpenAPI enum, and the browser's ladder is
   #: `satisfies` the generated union — so the two sides cannot drift apart.
   MEDIA_WIDTHS: tuple[int, ...] = (64, 128, 256, 384, 768, 1152, 1536)
   MediaWidth = Literal[64, 128, 256, 384, 768, 1152, 1536]

   DERIVED_DIR = "derived"
   DERIVED_CONTENT_TYPE = "image/webp"
   WEBP_QUALITY = 82
   #: A resize would damage these rather than shrink them: an SVG is already resolution
   #: independent, and a GIF would lose its animation. Both fall through to the original.
   NEVER_DERIVED: tuple[str, ...] = ("image/svg+xml", "image/gif")


   def version_token(moment: dt.datetime) -> str:
       """The source version, as a filename-safe string: `updated_at` for an avatar or a
       header, `captured_at` for a pinned snapshot. It comes from the row, never from the
       caller's `?v=`, so a client cannot poison the cache — and a replaced source lands on
       a path that has never been written, which is why a stale derivative is impossible
       rather than merely unlikely."""
       return moment.strftime("%Y%m%d%H%M%S%f")


   def derived_rel_path(source_rel_path: str, token: str, width: int) -> str:
       """`derived/avatars/3.png/20260912132900123456-256.webp`. Keyed on the source's own
       relative path, so one purge serves every family."""


   def purge_derivatives(source_rel_path: str) -> int:
       """Throw away every derivative of one source. Called by `file_storage` from the two
       paths that change bytes under a relative path."""


   def derived_bytes(*, source_rel_path: str, content_type: str, token: str, width: int) -> bytes | None:
       """The source at `width`, from the cache or freshly made — or **None**, meaning
       "serve the original", which is the answer for every single thing that can go wrong:
       a never-derived format, a source already narrower than `width`, a missing file, a
       source Pillow cannot open, an encode that raises. A caller that sees None returns the
       source bytes with the source's own content type.

       On a miss it reads the source once, resizes with LANCZOS preserving the aspect ratio,
       encodes WebP at `WEBP_QUALITY` and writes the cache file with `write_media` (temp file
       + `os.replace`), so two racing requests cannot produce a half-written file. No lock.
       """


   def sweep_orphan_derivatives() -> int:
       """Whatever is no longer worth keeping under `derived/`: a directory whose source file
       is gone, and any cached file **older than its own source** (which is what a rollback
       leaves behind — old code overwrites an avatar without knowing this directory exists).
       Returns how many files went; idempotent; called from `init_db()`. Needs no database:
       every question it asks is about files."""
   ```
   Log a `log.warning` — never raise — when Pillow refuses a source, naming the path, because a
   picture the app cannot resize is worth knowing about even though it still renders.

4. **`routers/players.py` and `routers/comments.py`** — one helper and four three-line edits.
   Import `MediaWidthParam`, `media_response` and `version_token` from the new service. The helper
   itself lives **in the service**, not in a router, because the fourth family is in the other
   router and a router that imports a router is how one mechanism becomes two.
   ```python
   def _media_response(*, source_rel_path: str, content_type: str, token: str, width: int | None,
                       cache_control: str, missing: str) -> Response:
       """Serve a media file at the size that was asked for, or whole (W1). The one place
       any media GET turns a row into bytes: a derivative is only ever an optimisation, so
       every path that cannot produce one lands on the original here rather than erroring."""
       if width is not None:
           data = derived_bytes(source_rel_path=source_rel_path, content_type=content_type,
                                token=token, width=width)
           if data is not None:
               return Response(content=data, media_type=DERIVED_CONTENT_TYPE,
                               headers={"Cache-Control": cache_control})
       data = read_media(source_rel_path)
       if data is None:
           raise HTTPException(status_code=404, detail=missing)
       return Response(content=data, media_type=content_type, headers={"Cache-Control": cache_control})
   ```
   Each endpoint keeps its own row lookup, its own `Cache-Control` and its own 404 wording, and
   ends with one call:
   ```python
   @router.get("/{player_id}/avatar")
   def get_player_avatar(
       player_id: int,
       w: Optional[MediaWidth] = Query(None, description="Serve this pre-computed width instead of the original; omit for the original."),
   ):
       with Session(get_engine()) as s:
           fs_row = s.get(PlayerAvatarFile, player_id)
           if not fs_row:
               raise HTTPException(status_code=404, detail="Avatar not found")
           content_type, file_path, updated_at = fs_row.content_type, fs_row.file_path, fs_row.updated_at
       return _media_response(source_rel_path=file_path, content_type=content_type,
                              token=version_token(updated_at), width=w,
                              cache_control="public, max-age=604800", missing="Avatar file missing")
   ```
   The same shape for `get_player_header_image` (`"Header image file missing"`, same
   `Cache-Control`) and `get_guestbook_subject_image` (token from `snap.captured_at`,
   `"public, max-age=31536000, immutable"`, `"Guestbook subject image file missing"`). **The
   docstrings on the existing two endpoints stay** — extend, do not replace.

5. **`app/db.py`** — after the guestbook sweep in `init_db()`, the same shape:
   ```python
   # The derived media cache (W1): a directory whose source is gone, or a cached size older
   # than the picture it was made from — which is what a rollback leaves, since old code
   # overwrites an avatar without knowing the cache exists. Silent when there is nothing.
   from .services.media_derivatives import sweep_orphan_derivatives

   swept_media = sweep_orphan_derivatives()
   if swept_media > 0:
       log.info("Derived media swept: %s", swept_media)
   ```

6. **`backend/tests/test_media_derivatives.py` (new)** — the conftest already puts `UPLOADS_DIR`
   in `tmp_path`, so these write nowhere real. At least:
   - `w` omitted → the original bytes, the source's content type, the source's `Cache-Control`
     (all four endpoints);
   - `w=128` on an uploaded 512×512 PNG avatar → **200**, `content-type: image/webp`, fewer bytes
     than the source, and `Image.open(...)` on the body reports width 128;
   - the same request twice → identical bytes and the cache file exists on disk after the first;
   - `?w=137` → **422** (the ladder is the framework's business, not ours) and nothing is written
     under `derived/`;
   - every rung of `MEDIA_WIDTHS` answers 200 on a header image, and the count of files under
     `derived/` never exceeds `len(MEDIA_WIDTHS)` for one source;
   - a rung **wider than the source** → the original, not an upscale (an avatar at `w=768`);
   - `image/gif` and `image/svg+xml` sources → the original bytes and content type, and nothing
     under `derived/`;
   - a corrupt source (a `.png` full of `b"not an image"`) → the original bytes, status 200, and
     a warning logged, **never a 500**;
   - a re-upload of the same player's avatar → the derived path changes (new token) and the new
     request's bytes differ from the first's;
   - the snapshot endpoint keeps `public, max-age=31536000, immutable` **on the derivative**;
   - `purge_derivatives`: deleting the avatar removes the whole `derived/avatars/{id}.{ext}/`
     directory; re-uploading over the same path removes it too;
   - `sweep_orphan_derivatives`: a hand-planted directory with no source, and a hand-planted file
     with an mtime older than its source, are both removed; a second call returns 0.

**Definition of done.**
- `?w=` exists on all four endpoints, typed so that only the seven rungs parse.
- No table, no column, no `_RUNTIME_COLUMNS` entry, no `create_all` change. `git diff` touches
  `backend/app/models.py` **not at all**.
- On the isolated stack (`:8151`, DB copy, uploads copy **outside the repo**), record in
  Deviations: the byte size and `content-type` of `/players/1/avatar` with no `w` and with
  `w=64,128,256`; of `/players/1/header-image` at `w=384,768,1152,1536`; and of
  `/players/guestbook-subjects/1/image` at `w=256` — with the `Cache-Control` of each, and the
  wall-clock of the first (cold) versus the second (cached) request for the 1152 rung.
- `ls -R $UP/derived` after that run, and its total size, in Deviations.
- **The rollback check, measured**, the K1/M2 way: extract the batch's baseline sha with
  `git archive | tar -x` into a temp dir (never touch `.git`), boot it on the repo's venv against
  the same DB copy and the same uploads copy the new code has already written `derived/` into, and
  assert: it boots clean; `GET /players/1/avatar` is **200** and **byte-identical** to the source
  file; `GET /players/1/avatar?w=128` is **200 and returns the original** (old FastAPI ignores an
  unknown query param — confirm that, do not assume it); `derived/` is untouched. Then boot the
  new code again and record the `Derived media swept: N` line, if any.
- `Derived media swept:` must **not** appear on a boot with nothing to do.

**Gates.** `make test`, `make lint`, `make gen-types` (committed with the router change),
`cd frontend && npm run check` (it must stay green: `schema.d.ts` grows, nothing consumes the new
key yet).

**Canon** (W4 writes it):
- §2 backend modules: `media_derivatives.py` — the only module that knows a derivative exists;
  `MEDIA_WIDTHS`/`MediaWidth` is the one ladder, `derived_bytes` the one derivation,
  `purge_derivatives` called from `file_storage`'s two byte-changing paths,
  `sweep_orphan_derivatives` from `init_db()`. `file_storage.py` gains `list_media_tree`,
  `media_mtime`, `delete_media_dir` and stays the only module that knows where the root is.
- §4/§7: `uploads/derived/` is a **cache** — inside the bind mount because it holds files, safe to
  delete at any time, regenerated on demand, never backed up on its own account.
- §5 media: the derived path shape and the version token; **no schema change at all**.
- §6 API: `?w=` on the **four** media GETs (avatar, header image, guestbook subject snapshot,
  comment image), seven rungs, 422 off-ladder, WebP out, the source's own `Cache-Control` on the
  derivative, and the rule that every failure serves the original.
- §9: Pillow is the first image dependency, the plan said so, and why (wheels on both targets).
- §10: `make test` fails with `ModuleNotFoundError: No module named 'PIL'` until the venv is
  re-installed — the one manual step on this machine.

**Deviations:**

- **Comment images are in** (Roli, 2026-09-20, after the plan was written: *"yeah comment images as
  well, go"*). `GET /comments/{comment_id}/image` is the fourth family and it cost exactly what
  this plan predicted for it — **one more call site**, no new code path: the same `media_response`,
  and its purges come free, because `_upsert_comment_image_file` already goes through
  `upsert_media_row` and the image DELETE through `delete_media`, which are the two paths W1 hangs
  the purge on. The four places that said "out of scope" are corrected above (the corpus table, the
  prose under it, the decisions list and "Decisions still needed" item 3). **Crests stay out** — that
  decision is Roli's, from 2026-09-16, and this batch does not reopen it.
- **`Optional[Literal[64, …]]` alone rejects every single request, and that is a bug in this plan,
  not a preference.** Measured before anything was built on it: with `w: MediaWidth | None =
  Query(None)`, `?w=128` answers **422** — `{"type":"literal_error","input":"128"}`. A query value
  is always a string, and pydantic v2 coerces a string into an `int` but **not** into an int
  `Literal`. The fix is the smallest thing that keeps every promise the plan makes about the wire:
  ```python
  MediaWidthParam = Annotated[MediaWidth | None, BeforeValidator(_width_from_query), Query(description=…)]
  ```
  spelled once in `media_derivatives.py` and used by all four endpoints, where `_width_from_query`
  turns digits into an int and does nothing else — the `Literal` still does all the deciding.
  **`Query` must sit inside the `Annotated`**: as a plain default (`w: MediaWidthParam =
  Query(None, …)`) it silently replaces the validator and every request is a 422 again. Both
  measured. The generated type is exactly what the plan predicted, so W2's spec stands unchanged:
  `w?: (64 | 128 | 256 | 384 | 768 | 1152 | 1536) | null`. Off-ladder is still the framework's
  answer, measured: `?w=137`, `?w=1920`, `?w=abc`, `?w=0` and `?w=` are all **422**, and nothing is
  written under `derived/`.
- **The one helper lives in the service, not in a router** — `media_derivatives.py::media_response`,
  not `routers/players.py::_media_response`. The fourth family is in `routers/comments.py`, and a
  router importing another router is how one mechanism quietly becomes two.
- **EXIF orientation is applied** (`ImageOps.exif_transpose`), which the plan does not mention
  because it was written for avatars and headers — both of which arrive from the frontend's crop
  editor as a canvas re-encode with no EXIF at all. A comment image is a raw phone upload, the
  browser rotates it when it draws the original, and a derivative that ignored the tag would be the
  same picture lying on its side.
- **Three small shapes the plan did not spell**, each written down because a later reader would
  otherwise have to re-derive them: `purge_derivatives` is a **no-op for a path already under
  `derived/`** (a derivative has no derivatives — that is what keeps the sweep's own deletes from
  recursing through `delete_media`); `file_storage` got a private `_purge_derivatives` wrapper, so
  the lazy import that breaks the cycle is written once instead of at both call sites; and the sweep
  removes a source's **empty directory** as well as its stale files, so a second sweep has nothing
  to look at. `derived_bytes` also returns None when the source is *exactly* the requested width,
  not only when it is narrower, and `version_token(None)` is `"0"` (no row in the app has a null
  timestamp; it is there so a future one cannot 500).

**Measured on the isolated stack** (`:8151`, `backend/data/verify-w1.db`, an uploads copy **outside
the repo**; real dev media, which is production's):

| request | bytes | content-type | `Cache-Control` |
|---|---|---|---|
| `/players/1/avatar` | 326,702 | image/png | `public, max-age=604800` |
| `…?w=64` | **1,060** | image/webp | `public, max-age=604800` |
| `…?w=128` | **2,430** | image/webp | `public, max-age=604800` |
| `…?w=256` | **5,784** | image/webp | `public, max-age=604800` |
| `…?w=768` | 326,702 | image/png | `public, max-age=604800` |
| `/players/1/header-image` | 2,662,379 | image/png | `public, max-age=604800` |
| `…?w=384` | **9,080** | image/webp | `public, max-age=604800` |
| `…?w=768` | **21,930** | image/webp | `public, max-age=604800` |
| `…?w=1152` | **40,178** | image/webp | `public, max-age=604800` |
| `…?w=1536` | **55,868** | image/webp | `public, max-age=604800` |
| `/players/guestbook-subjects/4/image` (a header pin) | 2,662,379 | image/png | `public, max-age=31536000, immutable` |
| `…?w=256` | **4,926** | image/webp | `public, max-age=31536000, immutable` |
| `/players/guestbook-subjects/5/image` (an avatar pin) | 326,702 | image/png | `public, max-age=31536000, immutable` |
| `…?w=128` | **2,430** | image/webp | `public, max-age=31536000, immutable` |
| `/comments/79/image` | 4,412,874 | image/png | `public, max-age=604800` |
| `…?w=384` | **10,784** | image/webp | `public, max-age=604800` |
| `…?w=768` | **29,488** | image/webp | `public, max-age=604800` |

The `Cache-Control` column is the point of that table as much as the byte column: a derivative
carries its source's header **byte for byte**, `immutable` included. `?w=768` on a 512 px avatar is
the original, unchanged, at its own content type — never an upscale. The plan predicted 39.2 KB for
the 1152 rung of `profile_headers/1.png` from a bench script; the endpoint served **40,178 bytes**,
which is that same number to three figures.

**Cold versus cached**, same stack, `make test` running on the same Pi at the time (so the cold
numbers are if anything pessimistic): the 1152 rung **275 ms** cold, **3.5 ms** cached (3.50 / 3.50 /
3.54 over three runs); an avatar's 128 rung **27.7 ms** cold, **3.5 ms** cached. Serving the 2.66 MB
original from disk takes 5.5 ms locally — i.e. after the first request a rung is *faster* than the
original as well as 66× smaller.

**The whole cache, every rung of every file in all four families**: **116 files, 2,684,334 bytes**
(`derived/avatars` 24 / 190,288 · `derived/profile_headers` 28 / 921,452 ·
`derived/guestbook_subjects` 22 / 456,974 · `derived/comments` 42 / 1,115,620), built in **24 s**.
The three families the plan costed come to **74 files / 1,568,714 bytes** against its predicted
"1.43 MB over 74 files" — the file counts are exact, the bytes 7 % over. An avatar holds only four
rungs (64–384) because 768 and up are wider than a 512 px source and return the original, exactly as
§3's table says. On disk it looks like this, which is the shape one `purge_derivatives(rel_path)`
serves for every family present and future:

```
derived/avatars/1.png/20260207224955205956-{64,128,256,384}.webp
derived/profile_headers/1.png/20260214214546578278-{64,128,256,384,768,1152,1536}.webp
derived/guestbook_subjects/4.png/20260919175011010559-{64,…,1536}.webp
derived/comments/79.png/20260402213312392088-{64,…,1536}.webp
```

**The rollback claim, measured rather than asserted** (the K1/M2 method: `a0b1392` extracted with
`git archive | tar -x` into a temp dir, so `.git` was never touched, and booted on the repo's own
venv against the **same** DB copy and the **same** uploads copy the new code had already written
116 derivatives into):

- it boots clean — no new log line, because there is no schema change to absorb;
- `GET /players/1/avatar` → **200**, `image/png`, md5 `50dd9d1e71cc2b09ba0cf58d20db5d36`,
  **byte-identical to `avatars/1.png` on disk**;
- `GET /players/1/avatar?w=128` → **200 and the original** (326,702 bytes, `image/png`, same md5):
  old FastAPI ignores an unknown query parameter. **Confirmed, not assumed** — and so does
  `?w=137`, which the new code 422s;
- the header, the snapshot and the comment image answer the same way with `?w=`;
- **`derived/` is untouched**: a `find … -printf "%P %s %T@"` manifest before and after is identical,
  116 files, same sizes, same mtimes.

Then the case the sweep exists for: **still rolled back**, an avatar was re-uploaded through the old
code (Berni, player 4), which overwrote `avatars/4.png` in place and left its four cached rungs
sitting there, now older than their own source. Booting the new code logged exactly
**`Derived media swept: 4`**, removed the empty directory with them, and the next request re-derived
on demand (200, `image/webp`, 3,546 bytes). A **third** boot printed no sweep line at all — a boot
with nothing to do is silent, which is the other half of that DoD.

**Pillow arrives as a wheel on both targets, measured.** On this Pi, `pip` took
`pillow-12.3.0-cp311-cp311-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl` (6.3 MB, "Using
cached", no compile), and `PIL.features.check("webp")` is `True`. For the production image
(`python:3.11-slim`, Debian/glibc x86-64) PyPI carries
`pillow-12.3.0-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl`, **6.93 MB** — so the
deploy note's "expect a download, not a compile" is a fact about a file that exists, not a hope.
**One side effect of Step 0 worth writing down**: `pip install -r requirements.txt` also installed
**cryptography 45.0.7** (with cffi and pycparser), which `requirements.txt` has always listed but
this venv did not have — that absence is what `AGENTS.md` §11 means by "no `cryptography` in the
venv". Push still has no VAPID key here and still goes nowhere from this machine; the venv simply
now matches the file it was installed from.

**Gates, on the committed tree.** `make test` **303 passed** in 13:45 (the baseline 286 plus this
task's 17; nothing pre-existing moved), `make lint` clean, `make gen-types` regenerated and then
**idempotent** (a second run is a no-diff), `cd frontend && npm run check` **780 tests in 80 files**
in 78 s — the baseline exactly, because nothing in the browser consumes the new key yet. Step 0's
`pip install -r requirements.txt` is a venv change, not a tree change, and **every later worker in
this batch owes it** or the suite dies on `ModuleNotFoundError: No module named 'PIL'`.

**What W1 deliberately left.** No call site asks for a width yet — the browser half is W2 and W3,
and until then `?w=` is a capability nobody uses, which is why `npm run check` is unchanged at
780/80. **Comment images have no drawn-size call site in this batch at all**: the server serves them
at any rung, and what the feed actually draws them at was never measured, so nobody should assume
the 17 MB is saved until someone does. `/ideas/{id}/image` and `/clubs/{id}/crest` were **not**
given `?w=` — the first is outside the plan, the second is Roli's closed decision. And nothing
pre-warms the cache, as decided.

---

## W2 — The one place the browser asks for a size  ☑

**The gap.** `mediaUrl` (`api/client.ts:79`) takes a path and an `updatedAt` and nothing else;
`playerAvatarUrl` (`api/playerAvatars.api.ts:9`), `playerHeaderImageUrl`
(`api/playerHeaders.api.ts:9`) and `guestbookSubjectImageUrl` (`api/players.api.ts:167`) each
forward those two; `AvatarCircle` (`ui/primitives/AvatarCircle.tsx:75`) renders
`playerAvatarUrl(playerId, updatedAt)` for every disc from 24 px to 80 px.

**Verify first.**
```bash
ls frontend/src/api/mediaSizes.ts                                            # → no such file
grep -n "width" frontend/src/api/client.ts                                   # → 0
grep -n "playerAvatarUrl(playerId, updatedAt)" frontend/src/ui/primitives/AvatarCircle.tsx  # → :75
```
W1 must be in: `grep -c '1152' frontend/src/api/generated/schema.d.ts` → ≥ 1.

**The change — commit 1, `feat(W2): the widths the browser may ask for`** (this commit is what
W3 waits for; it changes no pixel, because nothing passes a width yet):

1. **`frontend/src/api/mediaSizes.ts` (new, pure)**:
   ```ts
   import type { operations } from "./generated/schema";

   /**
    * The widths the server can serve (W1). Taken from the **generated** schema rather than
    * retyped: the backend's `Literal` is published as an OpenAPI enum, so a rung added or
    * removed on the server is a type error here on the next `make gen-types`.
    */
   export type MediaWidth = NonNullable<
     NonNullable<operations["get_player_avatar_players__player_id__avatar_get"]["parameters"]["query"]>["w"]
   >;

   export const MEDIA_WIDTHS = [64, 128, 256, 384, 768, 1152, 1536] as const satisfies readonly MediaWidth[];

   /**
    * No device this app runs on draws past 3×, and a 4× request would double the bytes for
    * nothing. jsdom reports 1, which is what makes the tests deterministic.
    */
   export const MAX_DPR = 3;

   export function devicePixelRatioCapped(): number {
     const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
     return Math.min(dpr, MAX_DPR);
   }

   /**
    * The smallest rung that covers a box of `cssPx`, or **undefined** when none does —
    * which means "ask for the original", the honest answer for a picture bigger than the
    * ladder and for a size we could not work out.
    */
   export function mediaWidthFor(cssPx: number): MediaWidth | undefined {
     if (!Number.isFinite(cssPx) || cssPx <= 0) return undefined;
     const need = Math.ceil(cssPx * devicePixelRatioCapped());
     return MEDIA_WIDTHS.find((w) => w >= need);
   }

   /**
    * The px behind `h-20 w-20` — Tailwind's scale, 4px a step. All 25 `AvatarCircle` /
    * `AvatarButton` call sites spell exactly that shape; anything else (`h-full`,
    * `h-[3.25rem]`) returns null, and the original is served. A future call site can
    * therefore only ever be slow, never broken.
    */
   export function avatarPxFromSizeClass(sizeClass: string): number | null {
     const m = /(?:^|\s)h-(\d+)(?:\s|$)/.exec(sizeClass);
     return m ? Number(m[1]) * 4 : null;
   }
   ```
2. **`api/client.ts`** — `mediaUrl` gains a third parameter and **must keep producing the
   byte-identical URL it produces today when it is omitted** (no `URLSearchParams`, no reordering:
   an existing cached URL must not change):
   ```ts
   export function mediaUrl(path: string, updatedAt?: string | null, width?: number | null): string {
     const base = API_BASE.replace(/\/+$/, "");
     const qs: string[] = [];
     if (updatedAt) qs.push(`v=${encodeURIComponent(updatedAt)}`);
     if (width) qs.push(`w=${width}`);
     const q = qs.length ? `?${qs.join("&")}` : "";
     return `${base}${path.startsWith("/") ? "" : "/"}${path}${q}`;
   }
   ```
3. **The three helpers** gain `width?: MediaWidth | null` as a third parameter and forward it:
   `playerAvatarUrl`, `playerHeaderImageUrl`, `guestbookSubjectImageUrl`. Nothing else in those
   files moves. `clubCrestUrl` and `commentImageUrl` and `ideaImageUrl` are **not** touched —
   crests are out of scope, and no task in this batch draws a comment image at a known size
   (W1 serves `?w=` for them; nothing asks yet), and `mediaUrl`'s new parameter is optional.

**The change — commit 2, `perf(W2): an avatar asks for the size it is drawn at`:**

4. **`ui/primitives/AvatarCircle.tsx`** — two lines inside the component, no prop added:
   ```ts
   // The disc already says how big it is; asking each of the 25 call sites to say it again
   // is how one component grows 25 chances to disagree with itself. The ring padding is
   // deliberately not subtracted: over-serving by 5px is free, under-serving is a blurry face.
   const boxPx = avatarPxFromSizeClass(sizeClass);
   const avatarWidth = boxPx == null ? undefined : mediaWidthFor(boxPx);
   ```
   and `src={playerAvatarUrl(playerId, updatedAt, avatarWidth)}`. `loading="lazy"` and
   `decoding="async"` stay exactly as they are.

5. **Tests.**
   - `frontend/src/test/mediaSizes.test.ts`: the ladder is ascending and unique;
     `mediaWidthFor` at dpr 1 and at a stubbed dpr 3 for 24/28/32/40/56/71/80/358/1104 gives the
     rungs in §3's table; `mediaWidthFor(4000)` → `undefined`; `avatarPxFromSizeClass` for
     `"h-6 w-6"`, `"h-20 w-20"`, `"h-10 w-10"`, `"h-full"`, `""`; `devicePixelRatioCapped` caps at
     3; and the **both-directions ladder guard**, written so eslint sees it used:
     ```ts
     const everyRungListed: Exclude<MediaWidth, (typeof MEDIA_WIDTHS)[number]> extends never ? true : never = true;
     expect(everyRungListed).toBe(true);
     ```
     (`as const satisfies` already catches a rung the server does not have; this catches one the
     server has and the browser forgot.)
   - `frontend/src/test/avatarMediaWidth.test.tsx`: render `AvatarCircle` at `h-6`, `h-10`, `h-20`
     and at an unparseable class; assert the `img` `src` carries the expected `w=` (and **no**
     `w=` for the unparseable one), and that `?v=` is still there and still first.

**Definition of done.**
- `grep -rn "mediaWidthFor\|avatarPxFromSizeClass" frontend/src | grep -v test | grep -v mediaSizes.ts`
  lists **only** `AvatarCircle.tsx` after commit 2 (W3 adds two more later).
- **No `AvatarCircle` or `AvatarButton` call site is edited.** `git diff --stat` on commit 2 shows
  `AvatarCircle.tsx` and the two test files, nothing else.
- On the isolated stack (`:8152`/`:8172`, dpr 3, 390 px), measure **Stats → Table** and the
  **Players page** in both themes: the number of `/players/*/avatar` requests, the total
  `transferSize` before and after, and the `w=` each one carried. Put the before/after totals in
  Deviations — the plan predicts ≈ 2,117 KB → ≈ 19 KB for six avatars at `h-7`.
- Existing URLs are unchanged: a `mediaUrl(path, v)` call still produces exactly what it produced
  at the baseline sha (assert it in the test, string-equal).

**Gates.** `cd frontend && npm run check` + `npm run build`.

**Canon** (W4 writes it):
- §2 frontend modules: `api/mediaSizes.ts` — the ladder (typed off the generated schema), the dpr
  cap, `mediaWidthFor`, `avatarPxFromSizeClass`; `mediaUrl` is still the one media URL builder and
  now carries `?v=` **and** `?w=`.
- §9/`DESIGN.md` §7: **an avatar asks for its own size from inside `AvatarCircle`** — a call site
  never spells a width, because the `sizeClass` it already passes is the answer.
- §10: `mediaUrl` without a width is byte-identical to before, deliberately, so this batch
  invalidates no cached URL.

**Deviations:**

- **The module, `mediaUrl`, the three helpers, `AvatarCircle` and both tests shipped exactly as
  specced**, in the two commits the plan asked for: `dc788fd` *feat(W2): the widths the browser may
  ask for* (the mechanism W3 codes against — `mediaSizes.ts`, `client.ts`, the three api helpers;
  no pixel moves, because nothing passes a width yet) and the commit this paragraph is in,
  *perf(W2): an avatar asks for the size it is drawn at*. `MediaWidth` really is the generated
  union and not `unknown`: probed with a throwaway `const bad: MediaWidth = 137`, which is
  `TS2322`.
- **The plan's own measuring recipe does not work against a vite dev server, and the next worker
  should not reach for it.** The "Playwright note" says to read
  `performance.getEntriesByType("resource")` and sum `transferSize`. Two things, both measured
  here: media entries report **`transferSize: 0`**, because the API is a different origin and sends
  no `Timing-Allow-Origin`; and the 250-entry resource-timing buffer is **full of ES modules**
  before an avatar is ever requested, so Stats → Table reported **zero** avatar entries at all
  while the screenshot plainly showed six. The numbers below were taken from `page.on("response")`
  and each response's own `content-length` — the wire, not the timing API.
- **A test that spells `/api` fails on this machine**: vitest *does* load `.env.local`, so during
  `npm run check` `import.meta.env.VITE_API_BASE_URL` is the Pi's LAN address and `API_BASE` is
  `http://192.168.178.78:8001`. `avatarMediaWidth.test.tsx` builds its expected `src` from
  `API_BASE`; what it pins is everything after the base.
- **Every avatar in the app parses today** — the `null` branch is a promise to the future, not a
  live fallback. The size classes in use are `h-6/7/8/9/10/12/14/20` over 20 `<AvatarCircle>` and 5
  `<AvatarButton>` call sites (`AvatarButton` forwards its own `className` as `sizeClass`, default
  `h-9 w-9`), so nothing falls through to the original; `mediaSizes.test.ts` and
  `avatarMediaWidth.test.tsx` pin the unparseable case instead.
- **One arithmetic consequence W3 and W4 should know**: `mediaWidthFor` was built as specced —
  the smallest rung `>= cssPx × dpr`, else `undefined` — so at **dpr 3** a 1104px desktop banner
  needs 3,312 and gets `undefined`, i.e. the original. That is deliberate (§3's rung table caps
  the banner at 1536 by *choosing* a rung, which is what `srcset` does per-candidate), and it is
  why the banner must go through `srcset`/`sizes` rather than through one `mediaWidthFor` call.
  No avatar can reach it: the largest disc is 80px, which is 240 at dpr 3.

**Measured on the isolated stack** (`:8152`/`:8172`, `backend/data/verify-w2.db`, an uploads copy
**outside the repo**; fresh browser context per row, so every row is a cold cache). Six avatars,
the same six files each time; **both themes produced byte-identical numbers**, as they must — a
theme cannot change a picture — so the theme column is folded:

| screen | viewport / dpr | requests | total bytes | each carried |
|---|---|---|---|---|
| Stats → Table | 390 / dpr 3 | 6 | **2,168,688 → 19,098** (−99.1 %) | `w=128` |
| Stats → Table | 1280 / dpr 2 | 6 | **2,168,688 → 7,420** (−99.7 %) | `w=64` |
| Players | 390 / dpr 3 | 6 | **2,168,688 → 19,098** (−99.1 %) | `w=128` |
| Players | 1280 / dpr 2 | 6 | **2,168,688 → 19,098** (−99.1 %) | `w=128` |

The plan predicted 2,117 KB → 18.8 KB for the six `h-7` discs at 390/dpr 3; the wire says
**2,118 KB → 18.7 KB**. Per file at `w=128`: 2,430 · 2,744 · 2,940 · 3,492 · 3,546 · 3,946 B; at
`w=64`: 1,060 · 1,124 · 1,130 · 1,314 · 1,364 · 1,428 B. The Players page draws `h-10` (40px), so
it asks for `w=128` at dpr 3 **and** at dpr 2 (80 → 128) — the one row where the desktop saves no
more than the phone.

**The pictures are the rung, and the rung is enough.** `naturalWidth` in the DOM is **128** at
390/dpr 3 and **64** at 1280/dpr 2, against a drawn box of 26px (28px minus the 1px hairline ring
on each side; 23px where a cup ring takes 2.5px) — 26 × 3 = 78 ≤ 128 and 26 × 2 = 52 ≤ 64, so no
disc is upscaled, in either theme, at either width. Screenshots in both themes at both widths show
sharp faces and untouched rings, and no page error was recorded on any of the eight runs.

**The no-width invariant, on a real screen and not only in a test.** On `/clubs` and `/profiles/1`
at 390/dpr 3: `/players/1/header-image` and `/clubs/{id}/crest` were requested with **`?v=` only,
no `w=`** — byte-identical to the URLs they had before this batch — while the profile's 80px
avatar asked for `w=256`, the rung §3 predicts for it. In `mediaSizes.test.ts` the same promise is
pinned against a copy of the pre-W2 builder over six URL shapes (absolute and relative path, a
version, `null`, `undefined`, `""`), each asserted three ways: no third argument, `undefined` and
`null`.

**Gates, on the committed tree.** `cd frontend && npm run check` **795 tests in 82 files** in 87 s
(the baseline 780/80 plus this task's 15 in 2 files; nothing pre-existing moved) and
`npm run build` green (`index-*.js` 734.99 kB, the pre-existing >500 kB hint). W3 had nothing in
the tree while this ran, so the count is exactly mine.

---

## W3 — The two big pictures: the banner and the citation thumbnail  ☑

**The gap.** `ProfileHeader.tsx:83-85` builds one `avatarImageSrc` and one `headerImageSrc` and
uses each for **two** jobs — the drawn picture and the lightbox — so the banner at 358 px CSS and
the 6×-zoomable lightbox fetch the same 2.66 MB file (`:172`, `:170`). `GuestbookEntryCard.tsx`'s
`SubjectCitation` (`:98`) draws a 71×40 or 40×40 thumbnail from
`guestbookSubjectImageUrl(subject.snapshot_id, subject.captured_at)` (`:137`) — the full pinned
copy, which its own docstring already admits ("the bytes are the full pinned copy (there is no
thumbnail endpoint and this batch adds no backend)"). That sentence is what this task retires.

**Verify first.**
```bash
grep -n "headerImageSrc" frontend/src/pages/profile/ProfileHeader.tsx          # → :85 and used for both img and lightbox
grep -n "guestbookSubjectImageUrl" frontend/src/pages/profile/GuestbookEntryCard.tsx   # → :137, no width
grep -rn "srcSet\|sizes=" frontend/src/pages/profile/ProfileHeader.tsx         # → 0
```
W2's first commit must be in: `grep -n "export function mediaWidthFor" frontend/src/api/mediaSizes.ts` → 1.

**The change.**

1. **`ProfileHeader.tsx` — split the two jobs.** `headerImageSrc` keeps its name and its meaning
   and stays the **original** (it feeds `setHeaderLightboxSrc` at `:170`, the "Edit header image"
   title at `:382` and the `?:` at `:385`). Add, next to it:
   ```tsx
   /**
    * The banner is drawn at the page column's width — 358px on a 390px phone, at most
    * 1104px on any desktop (`max-w-6xl`, `--page-pad-x` 16/20/24, the `lg:` sidebar) — and
    * used to download the 1920px original to do it (2.66MB, measured). `srcset` is the
    * platform's own answer: no measurement in JS, no resize listener, and it survives a
    * rotation. The lightbox above still gets `headerImageSrc`, the real thing, because it
    * zooms to 6x and that *is* the full-size use.
    *
    * `sizes` deliberately **over**-states the desktop column (1104px is the widest it ever
    * gets; at 1024-1280 it is narrower, and narrower again when the sidebar is expanded
    * rather than collapsed to 68px). A `sizes` that is too small picks a rung that is too
    * small and the banner is blurry; one that is too large costs exactly one rung on a
    * narrow desktop — 39KB instead of 21KB. Over-state it.
    */
   const BANNER_WIDTHS = [384, 768, 1152, 1536] as const;
   const BANNER_SIZES =
     "(min-width: 1024px) 1104px, (min-width: 640px) calc(100vw - 40px), calc(100vw - 32px)";
   ```
   and on the `<img>` at `:171`:
   ```tsx
   src={playerHeaderImageUrl(targetPlayerId, headerUpdatedAt, 1152)}
   srcSet={BANNER_WIDTHS.map((w) => `${playerHeaderImageUrl(targetPlayerId, headerUpdatedAt, w)} ${w}w`).join(", ")}
   sizes={BANNER_SIZES}
   ```
   Everything else on that element — `alt=""`, the class list, `loading="lazy"`,
   `decoding="async"` — is unchanged, and so is the `<button>` around it, the `SubjectCommentTrigger`
   overlay and the "No header image" placeholder.
   **The avatar in this file needs no change at all**: `AvatarCircle` now asks for its own size
   (W2), and `avatarImageSrc` is only ever handed to the lightbox, where the original is right.
2. **`GuestbookEntryCard.tsx` — the citation asks for a thumbnail.** The two numbers are already
   in the component (`h-10` and the two aspect ratios); name them and use them:
   ```tsx
   // The citation's own geometry, in one place: `h-10` is 40px tall, square for an avatar
   // and 16:9 (71px) for a banner. At dpr3 that is w=128 and w=256 — against a pinned copy
   // that is 2.94MB (measured). The lightbox the citation opens still gets the real thing.
   const CITATION_THUMB_CSS_W = subject.kind === "avatar" ? 40 : 71;
   ```
   and on the `<img>` at `:137`:
   ```tsx
   src={guestbookSubjectImageUrl(subject.snapshot_id, subject.captured_at, mediaWidthFor(CITATION_THUMB_CSS_W))}
   ```
   `onError` → `setImageFailed(true)` stays exactly as it is, and it is now also the safety net for
   a derivative that cannot be produced — though W1 guarantees the endpoint falls back to the
   original rather than failing, so it should never fire for that reason.
   **`GuestbookSection.tsx` is not in this file set and must not be touched**: its `ImageLightbox`
   (`:272`) calls `guestbookSubjectImageUrl` with no width, which is correct and stays.
3. **Tests.**
   - `frontend/src/test/profileBannerSizes.test.tsx`: render the profile header with a header
     image; assert the banner `img` has a `srcSet` with exactly four candidates carrying
     `w=384/768/1152/1536` and matching `Nw` descriptors, a `sizes` attribute, a `src` with
     `w=1152`; and that opening the lightbox passes a `src` with **no** `w=` (the full-size
     guarantee, asserted rather than hoped).
   - `frontend/src/test/subjectCitationWidth.test.tsx`: an entry whose subject is a
     `header_image` renders a thumb whose `src` carries the dpr-1 rung for 71 px, an `avatar`
     subject the rung for 40 px; the `about` subject renders no `img` at all; and the citation's
     `onError` fallback still renders the kind glyph.

**Definition of done.**
- Measured on the isolated stack (`:8153`/`:8173`) at **390×844 dpr 3** and at **1280×900 dpr 1**,
  in **both** the `blue` and the `light` theme, on a profile that has a header image and at least
  two guestbook citations (player 1 in the dev DB): the full list of `/players/*` image requests
  with their `transferSize` and their `w=`, **before and after**, in Deviations. The plan predicts
  the banner + avatar alone move from **2,919 KB to 44.8 KB** at 390/dpr3, and each citation of a
  1920×1080 snapshot from **2,940 KB to 8.9 KB** — so a profile with four citations is ≈ 9.3 MB
  before and ≈ 65 KB after. Report what the real page did, not what this predicts.
- `document.querySelector("img[data-subject-thumb='image']").currentSrc` contains `w=256` at
  dpr 3 and the banner's `currentSrc` contains `w=1152`; at 1280/dpr 1 the banner is also `w=1152`.
- **Nothing visual moved.** The banner is the same 16:9 box at the same position; measure the
  identity block's top offset and the tab strip's top offset at 390 px in both themes and compare
  against the baseline sha — `M8`/`M9` spent two tasks on those numbers and this task must not
  cost a pixel of them.
- The lightbox still shows the original: open the banner lightbox, zoom to 6×, and confirm the
  network request for it carries no `w=`.

**Gates.** `cd frontend && npm run check` + `npm run build`.

**Canon** (W4 writes it):
- `DESIGN.md` §7, the citation row: the "bytes are the full pinned copy (there is no thumbnail
  endpoint)" sentence is now **wrong** and must be replaced — the citation asks for `w=128`/`w=256`
  and the pinned copy is still what the lightbox opens.
- `DESIGN.md` §7 / `AGENTS.md` §10: **the drawn picture and the zoomable picture are two different
  URLs.** A surface that draws a picture asks for the size it draws; `ImageLightbox` and the crop
  editor always get the original. Never feed one variable to both.
- §10: the banner's `sizes` string and where its three numbers come from (358 px at 390, 1104 px
  max on desktop, the 16/20/24 px gutters), so the next person to change the page column knows
  what else moves.
- §2/§6 and `DESIGN.md` §7: **comment images are the fourth call site** and they took the
  banner's treatment, not a rung — `TournamentCommentParts.tsx`'s `COMMENT_IMAGE_WIDTHS` /
  `COMMENT_IMAGE_SIZES`, and `commentImageUrl(id, v, w)` beside the other three helpers.

**Deviations:**

- **Comment images are in, and they are the banner's problem, not the citation's** (Roli,
  2026-09-20, after the plan was written: *"yeah comment images as well, go"*). W1 gave
  `GET /comments/{id}/image` its `?w=` and left the browser side open, saying in as many words that
  "what the feed draws them at was never measured". It is measured now, and the measurement is what
  chose the treatment rather than a preference: the feed's picture is `w-full` inside the comment
  column, so its width **follows the viewport** exactly as the banner's does — measured `<img>`
  widths **222 / 292 / 332** at 320 / 390 / 430 (viewport − 98), **534 / 662 / 794** at 640 / 768 /
  900 (viewport − 106), and **670 / 926 / 1038** at 1024 / 1280 / 1440+, where the page column caps
  it. No single rung covers a range of 222 → 1038: `mediaWidthFor(292)` is 1152 at dpr 3 but **384**
  at dpr 1, which is a visibly blurry picture on a 926 px desktop box, and a hard-coded 1152 is
  4.4× more bytes than a dpr-1 phone needs. So it gets `srcset`/`sizes` — **the same mechanism this
  task introduces for the banner, one more consumer of it, not a second one** (rule 8). The rung
  both real screens land on is **1152**: 292 × 3 = 876 on Roli's phone, 926 × 1 = 926 on a 1280 px
  desktop, and that is also the `src` fallback. This cost two files outside W3's declared set —
  `frontend/src/pages/live/TournamentCommentParts.tsx` (the only place in the app that draws a
  comment image; `grep -rn commentImageUrl frontend/src` is that file and `comments.api.ts`) and
  `frontend/src/api/comments.api.ts`, whose `commentImageUrl` gained the same optional third
  parameter W2 gave the other three helpers. Neither is in W2's set — W2's own text names
  `commentImageUrl` as deliberately untouched — so there was no collision, and a third test file,
  `frontend/src/test/commentImageWidth.test.tsx`, went with them.
- **EXIF was checked with a rotated upload, because the dev corpus cannot check it.** All six
  comment images in `backend/data/uploads/comments/` are 1920×1440 and carry **no** orientation
  tag: they came through `CommentImageCropper`, which is a canvas re-encode, not a raw phone
  upload. So one was made — a 1600×1200 JPEG stored landscape with `orientation=6`, a red bar down
  its stored left edge — and `PUT /comments/265/image` on the isolated stack took it. The browser
  reads the **original** as 1200×1600 (it applies the tag) and the derivatives as **384×512** and
  **1152×1536**, with the red bar on the displayed **top** edge and no EXIF tag of their own: W1's
  `ImageOps.exif_transpose` bakes the rotation in, so a rung renders identically to the original
  and no `srcset` candidate can flip relative to another.
- **The plan's `BANNER_SIZES` string is right and was re-measured rather than trusted.** The
  `<img>` is **286 / 356 / 396** at 320 / 390 / 430 — viewport − 34, not − 32, because the card
  around it has a 1 px border on each side — **598 / 726 / 858** at 640 / 768 / 900 (− 42, not
  − 40), and **734 / 990 / 1102** at 1024 / 1280 / 1440+. The plan's three terms each over-state
  by 2 px and the desktop term by up to 370 px at 1024, which is the over-statement it asks for in
  writing; it was kept verbatim.
- **Two small shapes the plan did not spell.** The banner `<img>` carries `data-profile-banner` and
  the comment `<img>` carries `data-comment-image`, so a test (and the byte measurement) can name
  the *drawn* picture and tell it from the lightbox's copy of the same file — there was no selector
  that distinguished them. And `SubjectCitation`'s number is a local `thumbCssWidth` rather than the
  plan's module-level `CITATION_THUMB_CSS_W`, because it depends on `subject.kind` and so cannot be
  a module constant.

**Measured on the isolated stack** (`:8153`/`:8173`, `backend/data/verify-w3.db`, an uploads copy
**outside the repo**; player 1, who has a header image, two citations of a header snapshot and one
of an avatar snapshot; tournament 8, whose feed carries three images). **Blue and light are
byte-for-byte identical at every viewport** (asserted, not assumed — the theme changes no URL).

| surface | before | after | |
|---|---|---|---|
| **identity block** (banner + 80 px avatar), 390/dpr3 | **2,989,081** (2,662,379 + 326,702) | **45,962** (`w=1152` 40,178 + `w=256` 5,784) | **−98.5 %** |
| identity block, 1280/dpr1 | 2,989,081 | **42,608** (`w=1152` + `w=128`) | −98.6 % |
| **one citation of a header snapshot**, 390/dpr3 | **2,662,379** | **4,926** (`w=256`) | **−99.8 %** |
| the same citation, 1280/dpr1 | 2,662,379 | **1,406** (`w=128`) | −99.9 % |
| one citation of an avatar snapshot, 390/dpr3 | 326,702 | **2,430** (`w=128`) | −99.3 % |
| **the comments feed of tournament 8** (3 images), 390/dpr3 **and** 1280/dpr1 | **5,829,717** (3,461,835 + 158,952 + 2,208,930) | **116,382** (all three at `w=1152`: 37,910 + 50,972 + 27,500) | **−98.0 %** |
| the whole profile page, guestbook tab, 390/dpr3 | 6,492,268 | **59,694** | −99.1 % |
| the whole comments page, 390/dpr3 | 6,603,188 | **122,358** | −98.1 % |

The plan predicted **2,919 KB → 44.8 KB** for the identity block; the page did 2,919.0 KB →
**44.9 KB**. It predicted 8.9 KB for a citation against a 2,940 KB snapshot; player 1's snapshot is
2,600 KB and its citation is **4.8 KB**. The "before" column is the tree at `9a55829`, i.e. W1's
server with no browser-side width; W2's own commits had already taken the avatars down before this
task ran, and the avatar figures above are its saving, quoted so the identity block is one number.

**The DoD's own checks, each answered:**
- `img[data-profile-banner].currentSrc` carries **`w=1152`** at 390/dpr3 **and** at 1280/dpr1, and
  `img[data-subject-thumb='image'].currentSrc` carries **`w=256`** at dpr 3 (`w=128` at dpr 1).
- **Nothing visual moved.** Identity block top **287 → 287**, avatar top **302 → 302**, tab strip
  top **508 → 508**, document height **1358 → 1358** (overview) and **1833 → 1833** (guestbook), at
  390 px in **both** themes; 643 / 643 / 832 and 1576 / 2109 at 1280 px, likewise unchanged. M8 and
  M9 spent two tasks on those numbers and this task cost none of them.
- **The lightbox still shows the original.** Opened from the banner and zoomed with the wheel until
  the picture was drawn **1519 px** wide, its `currentSrc` is
  `/players/1/header-image?v=…` with **no `w=`** — and the network shows the request for the
  original being made at that moment, because the page never fetched it before. The comment
  lightbox is the same: `onOpenImage` is handed a URL with no width, asserted in the test too.
- **Desktop density, the plan's one deliberate regression.** At 1280/dpr2 and 1440/dpr2 both the
  banner (box 990 / 1102) and the comment image (box 926 / 1038) take the top rung **1536** against
  a 1920 px original — 55,868 bytes instead of 2,662,379. At 1920/dpr1 they take 1152 for a 1102 px
  box, the over-stated `sizes` costing one rung exactly as designed. Roli accepted the ceiling
  knowing the lightbox shows the true original, and the lightbox does.

**Gates, on the committed tree.** `cd frontend && npm run check` **806 tests in 85 files** in 73 s
(780/80 at the batch baseline, plus W2's 15 in 2 files and this task's 11 in 3), `npm run build`
green (`index-*.js` **735.23 kB**, the pre-existing >500 kB hint). Step 0's
`backend/.venv/bin/python -m pip install -r backend/requirements.txt` was run first, as every
worker in this batch owes.

**What W3 deliberately left.** `GuestbookSection.tsx`'s snapshot lightbox and
`ProfileHeader`'s crop editor still pass no width, which is correct and is the point.
`/ideas/{id}/image` has no `?w=` on the server and so has no call site here either, and crests stay
Roli's closed decision. Nothing pre-warms the cache: the first phone to open a profile pays the
275 ms W1 measured for the 1152 rung, once, ever.

---

## W4 — Documentation pass  ☐

**Verify first.** `grep -n "Pillow\|derived/\|mediaSizes" AGENTS.md` → 0;
`grep -n "mediaWidthFor\|srcSet" DESIGN.md` → 0.

**The change.** Fold every "Canon" block above into `AGENTS.md` (§2 backend and frontend modules,
§4 the config table if `UPLOADS_DIR`'s description needs it, §5 media, §6 the API map and the
four endpoints' contract, §7 deployment and the persistent-data list, §9 the dependency decision
and the icon/format conventions it touches, §10 the gotchas, §11 "Current state" — the batch, its
commit count, **no new tables**, the expected log lines, the deploy shape) and `DESIGN.md` (§7's
`AvatarCircle`, citation and `ImageLightbox` rows), in the voice those files use, and correct
anything the three implementation tasks' Deviations contradict. Delete nothing a worker did not
mark stale. Tick all four boxes here. Then run the whole gate set once more on the final tree and
write the numbers into §11 (`make test`, `make lint`, `make gen-types` no diff, `npm run check`,
`npm run build`).

Three things `AGENTS.md` says today that this batch changes and that must not be left standing:
- §9 "No new dependencies unless the plan says so" — still true, and now has its first exception
  with a reason; say so where the dependency is listed, not only in the batch note.
- §11's crest bullet ("Q17 made the compact lists fetch them… Offered and **declined**") should
  gain one clause noting that W1's mechanism exists and that crests were deliberately left out of
  it, so the next reader does not think it was an oversight.
- §2's `file_storage.py` description and §5's media list both enumerate the upload directories;
  `derived/` is not one of them in the same sense — it is a cache — and must be described as one.

**Gates.** All of them, on the final tree; `git status` shows only the three files.

**Deviations:**

---

## Deployment notes

- **Full deploy** (the backend image is rebuilt with a new wheel in it): §7's checklist, **the
  step-2 data backup first** (`python3 backend/manage.py backup-deploy-data`). The standard
  `git pull && docker compose up -d --build` is all it takes — **no manual step, no schema change,
  no backfill, no `/data/cups.json` edit.**
- **The one thing to watch in the build log** is `pip install`: expect a
  `pillow-12.3.0-cp311-cp311-manylinux…_x86_64.whl` **download**, not a compile. If it starts
  building from source, stop and report — it means the wheel did not match and the image would
  need build tooling, which this plan says it does not.
- **The derived cache lives in the bind mount, automatically.** It is
  `${UPLOADS_DIR}/derived` = `/data/uploads/derived`, and `./backend/data:/data` is already
  mounted, so nothing in `docker-compose.yml` changes. It has to be on the mount, because it holds
  files and a container rebuild would otherwise throw it away on every deploy — which would be
  *correct* but wasteful.
- **Nothing pre-warms it.** The first person to open each screen pays 0.1–0.4 s once; after that it
  is a file read. Do not add a warm-up step.
- Smoke, in order:
  ```bash
  curl -sI 'https://lorbeerkranz.xyz/api/players/1/avatar?w=128' | grep -i 'content-type\|cache-control'
  #   → content-type: image/webp   AND   cache-control: public, max-age=604800   ← the new code is up
  curl -sI 'https://lorbeerkranz.xyz/api/players/1/avatar' | grep -i content-type
  #   → the source's own type (image/png), unchanged
  curl -so /dev/null -w '%{size_download}\n' 'https://lorbeerkranz.xyz/api/players/1/header-image?w=1152'
  #   → tens of KB, against ~2.6 MB without the parameter
  curl -sI 'https://lorbeerkranz.xyz/api/players/1/avatar?w=137'    # → 422
  ssh hetzner 'ls -R ~/projects/Lorbeer-Turnierplaner/backend/data/uploads/derived | head'
  ```
  then open a profile on the phone and confirm the banner and the guestbook citations still look
  right, and that the lightbox still zooms to a sharp picture.
- **Rollback** to the pre-batch sha costs nothing and needs no cleanup: old code has no `w`
  parameter, FastAPI ignores an unknown query parameter, so every request is answered with the
  original — correct, just heavy — and `derived/` is simply never read or written. Rolling forward
  again reuses whatever is in it, and the boot sweep removes anything the rolled-back code made
  stale by overwriting a source (`Derived media swept: N`). W1 measures all of this rather than
  asserting it.
- **`sync-local-from-deploy` will pull the derived cache down with the rest of `uploads/`** (it
  rsyncs the directory whole). That is harmless — 1.43 MB at today's media, and the dev box would
  regenerate it anyway — and it is noted here only so nobody mistakes it for a bug. If it ever
  becomes annoying, the fix is one `--exclude='derived/***'` in `manage.py`, not a new command.
- **Deleting the cache is always safe**, on the server or anywhere else:
  `rm -rf /data/uploads/derived` and it rebuilds on demand. That is the property every other
  decision in this batch was chosen to protect.

## Decisions still needed from Roli

1. **The banner's ceiling is 1536 px, not the 1920 px original.** On a retina desktop the banner
   is drawn in a 1104 px box, so 1536 is 1.39× density instead of 1.74× — invisible, and 54.6 KB
   instead of 2,600 KB. The lightbox is unaffected and always shows the true original. If he wants
   the banner itself to stay pixel-for-pixel what it is today on a retina desktop, that is one
   extra `srcset` candidate in W3 with no `w=` and a `1920w` descriptor — and a MacBook then pulls
   2.6 MB for the banner again.
2. **The cache is never pre-warmed and never pre-generated.** The first viewer of each size pays
   0.1–0.4 s once. The alternative is a `manage.py warm-media` command and a deploy step; this plan
   says no, because a step that must be remembered is a step that will be forgotten.
3. ~~**Comment images (17 MB over 6 files) are out of scope**~~ — **answered 2026-09-20: they are
   in.** The mechanism took them as one more call site, exactly as predicted. What is still open is
   the *browser* half: no surface asks a comment image for a width yet, so W1's saving on that
   family only lands once someone measures what the feed actually draws them at.
4. **WebP for everything derived, with no fallback for a browser that cannot read it.** Every
   browser this app runs in has read WebP since 2020. Saying so out loud because it is the one
   decision here that is a *compatibility* bet rather than a measurement.
5. **`?w=` is the whole API.** No `?h=`, no `?fit=`, no quality parameter, no `?dpr=`. If a future
   surface needs a square crop of a 16:9 header, that is a new parameter and a new decision, not a
   quiet extension of this one.

### Critical Files for Implementation
- /home/roli/projects/turnierplaner-reloaded/backend/app/routers/players.py
- /home/roli/projects/turnierplaner-reloaded/backend/app/services/file_storage.py
- /home/roli/projects/turnierplaner-reloaded/backend/app/db.py
- /home/roli/projects/turnierplaner-reloaded/backend/requirements.txt
- /home/roli/projects/turnierplaner-reloaded/frontend/src/api/client.ts
- /home/roli/projects/turnierplaner-reloaded/frontend/src/ui/primitives/AvatarCircle.tsx
- /home/roli/projects/turnierplaner-reloaded/frontend/src/pages/profile/ProfileHeader.tsx
- /home/roli/projects/turnierplaner-reloaded/frontend/src/pages/profile/GuestbookEntryCard.tsx
