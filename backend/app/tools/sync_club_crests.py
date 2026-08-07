"""
One-time (re-runnable) club crest sync from TheSportsDB.

Local-first by design: crest images are downloaded ONCE into the uploads dir
(`club_crests/{club_id}.png`) and afterwards served by our own backend at
`/clubs/{id}/crest` — no runtime requests to any external host.

Usage (local dev, from backend/):
    .venv/bin/python -m app.tools.sync_club_crests --db-url sqlite:///./data/app.db

Usage (production, inside the container — /data is the mounted volume):
    docker compose exec backend python -m app.tools.sync_club_crests

Only clubs without a stored crest are touched (use --refresh to redo all).
Clubs in the National (Men)/(Women) pseudo-leagues are skipped — the frontend
renders their country flag instead. Unmatched clubs keep the monogram badge;
they are listed at the end so aliases can be added to ALIASES below, or a
crest can be uploaded manually via PUT /clubs/{id}/crest.
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import json
import os
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

from sqlmodel import Session, select

from ..db import configure_db, get_engine, init_db
from ..models import Club, ClubCrestFile, League
from ..services.file_storage import media_path_for_club_crest, upsert_media_row

API_BASE = "https://www.thesportsdb.com/api/v1/json/3"
API_DELAY_S = 2.1  # free tier: 30 requests/min
CDN_DELAY_S = 0.3
USER_AGENT = "turnierplaner-crest-sync/1.0 (private hobby app)"

# Our league names -> TheSportsDB league names (bulk fetch). Wrong/missing
# entries are harmless: their clubs go through the per-club search fallback.
LEAGUE_MAP: dict[str, str] = {
    "Premier League": "English Premier League",
    "La Liga": "Spanish La Liga",
    "Bundesliga": "German Bundesliga",
    "Serie A": "Italian Serie A",
    "Ligue 1": "French Ligue 1",
    "Süper Lig": "Turkish Super Lig",
    "Österreichische Bundesliga": "Austrian Bundesliga",
    "Liga Portugal": "Portuguese Primeira Liga",
    "Eredivisie": "Dutch Eredivisie",
    "Primera División": "Argentinian Primera Division",
    "Scottish Premiership": "Scottish Premiership",
    "Belgian Pro League": "Belgian Pro League",
    "MLS": "American Major League Soccer",
    "Swiss Super League": "Swiss Super League",
    "EFL League One": "English League 1",
    "Danish Superliga": "Danish Superliga",
    "Eliteserien": "Norwegian Eliteserien",
    "Ekstraklasa": "Polish Ekstraklasa",
    "Allsvenskan": "Swedish Allsvenskan",
    "Serie B": "Italian Serie B",
    "League of Ireland Premier Division": "Irish Premier Division",
    "Saudi League": "Saudi Pro League",
    "K League": "South Korean K League 1",
    "Chinese Super League": "Chinese Super League",
    "A-League": "Australian A-League",
    "Liga 1 (Romania)": "Romanian Liga 1",
    "Indian Super League": "Indian Super League",
    "EFL Championship": "English League Championship",
    "EFL League Two": "English League 2",
    "2. Bundesliga": "German 2. Bundesliga",
    "3. Bundesliga": "German 3. Bundesliga",
    "Ligue 2": "French Ligue 2",
    "LaLiga 2": "Spanish La Liga 2",
    "Woman's Super League (England)": "English Womens Super League",
    "Liga F (Spain)": "Spanish Womens Liga F",
    "Frauen-Bundesliga (Germany)": "German Womens Bundesliga",
    "Serie A Femminile (Italy)": "Italian Womens Serie A",
    "Arkema Première Ligue (France)": "French Womens Division 1",
    "NWSL (North America))": "American NWSL",
}

SKIP_LEAGUES = {"National (Men)", "National (Women)"}

# Hard cases: our club name -> name to search/match on TheSportsDB instead.
# Covers nicknames (Spurs), DB typos (Manfield, Bejing, Grandada…) and clubs
# whose TSDB name differs structurally. Extend whenever the sync prints misses.
ALIASES: dict[str, str] = {
    "Spurs": "Tottenham Hotspur",
    "Liverpool F.C.": "Liverpool",
    "Nottingham Forest F.C.": "Nottingham Forest",
    "Sunderland A.F.C.": "Sunderland",
    "AS Monaco": "Monaco",
    "Atletic Club Bilbao": "Athletic Bilbao",
    "Real Betis Sevilla": "Real Betis",
    "FC St. Pauli": "St. Pauli",
    "Lazio (Latium)": "Lazio",
    "Paris Saint-Germain F.C.": "Paris Saint-Germain",
    "Başakşehir F.K.": "Istanbul Basaksehir",
    "Karagümrük SK": "Fatih Karagumruk",
    "Çaykur Rizespor": "Rizespor",
    "RB Salzburg": "Red Bull Salzburg",
    "Sporting CP Lissabon": "Sporting CP",
    "NAC Brada": "NAC Breda",
    "Racing Club de Avellaneda": "Racing Club",
    "San Lorenzo": "San Lorenzo de Almagro",
    "Unión de Santa Fe": "Union de Santa Fe",
    "Hibernian Edinburgh": "Hibernian",
    "KVC Westerlo": "Westerlo",
    "OH Leuven": "Oud-Heverlee Leuven",
    "Royale Union Saint-Gilloise": "Union Saint-Gilloise",
    "Sint-Truidense V.V.": "Sint-Truiden",
    "Philadelphia": "Philadelphia Union",
    "Sporting KC": "Sporting Kansas City",
    "St. Louis CITY SC": "St. Louis City",
    "Manfield Town": "Mansfield Town",
    "Peterborough": "Peterborough United",
    "Rotherham Utd": "Rotherham United",
    "Sønderjyske Fodbold": "Sonderjyske",
    "Halmstads BK": "Halmstad",
    "Östers IF": "Öster",
    "Bruk-Bet": "Termalica Nieciecza",
    "St. Pats Dublin": "St Patrick's Athletic",
    "Al Ittihad": "Al-Ittihad",
    "Al Najmah": "Al-Najma",
    "Al Shabab": "Al-Shabab",
    "Daejon Hana": "Daejeon Hana Citizen",
    "Bejing FC": "Beijing Guoan",
    "SZ Peng City": "Shenzhen Peng City",
    "Tianjin JMT FC": "Tianjin Jinmen Tiger",
    "Zhejiang Pro": "Zhejiang",
    "FC Dinamo 1948": "Dinamo Bucuresti",
    "FC Univ. Cluj": "Universitatea Cluj",
    "FK Csíkszereda": "Csikszereda",
    "Univ. Craiova": "Universitatea Craiova",
    "Ipswich": "Ipswich Town",
    "Bormley FC": "Bromley",
    "Cambridge Utd": "Cambridge United",
    "Düsseldorf": "Fortuna Dusseldorf",
    "Alemania Aachen": "Alemannia Aachen",
    "AS Saint-Étienne": "Saint-Etienne",
    "Grandada CF": "Granada",
}

# Tokens that carry no identity — dropped before matching.
_STOP_TOKENS = {
    "fc", "cf", "afc", "ac", "as", "sc", "ssc", "sv", "vfl", "vfb", "tsg", "rc",
    "cd", "ca", "club", "de", "f.c", "s.c", "the", "1", "1899", "04", "05", "09",
}


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    out = []
    for ch in s:
        out.append(ch if ch.isalnum() or ch.isspace() else " ")
    return " ".join("".join(out).split())


def tokens(name: str) -> frozenset[str]:
    # Single letters are noise left over from dotted abbreviations ("F.C." -> "f c").
    kept = frozenset(t for t in norm(name).split() if t not in _STOP_TOKENS and len(t) > 1)
    return kept or frozenset(norm(name).split())


def _api(path: str) -> dict:
    url = f"{API_BASE}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    time.sleep(API_DELAY_S)
    return data


def fetch_league_teams(tsdb_league: str) -> list[dict]:
    q = urllib.parse.quote(tsdb_league)
    try:
        data = _api(f"search_all_teams.php?l={q}")
    except Exception as e:  # noqa: BLE001 — network errors just mean "no bulk list"
        print(f"  ! league fetch failed ({tsdb_league}): {e}")
        return []
    return data.get("teams") or []


def search_team(name: str) -> list[dict]:
    q = urllib.parse.quote(name)
    try:
        data = _api(f"searchteams.php?t={q}")
    except Exception as e:  # noqa: BLE001
        print(f"  ! search failed ({name}): {e}")
        return []
    teams = data.get("teams") or []
    return [t for t in teams if (t.get("strSport") or "") == "Soccer"]


def candidate_names(team: dict) -> list[str]:
    names = [team.get("strTeam") or ""]
    alt = team.get("strTeamAlternate") or ""
    names += [a.strip() for a in alt.split(",") if a.strip()]
    short = team.get("strTeamShort") or ""
    if short:
        names.append(short)
    return [n for n in names if n]


def match_team(club_name: str, teams: list[dict]) -> dict | None:
    """Best TheSportsDB team for a club name, or None if nothing is convincing."""
    alias = ALIASES.get(club_name)
    if alias:
        for t in teams:
            if (t.get("strTeam") or "").lower() == alias.lower():
                return t

    want_n = norm(club_name)
    want_t = tokens(club_name)

    best: tuple[float, dict] | None = None
    for t in teams:
        for cand in candidate_names(t):
            cn = norm(cand)
            if not cn:
                continue
            if cn == want_n:
                return t
            ct = tokens(cand)
            score = 0.0
            if want_t and ct and (want_t <= ct or ct <= want_t):
                score = 0.92
            score = max(score, difflib.SequenceMatcher(None, want_n, cn).ratio())
            if best is None or score > best[0]:
                best = (score, t)
    if best and best[0] >= 0.85:
        return best[1]
    return None


def find_via_search(club_name: str) -> dict | None:
    """Per-club fallback: try progressively simpler search queries.

    TheSportsDB's search endpoint is literal-minded — "Liverpool F.C." finds
    nothing while "Liverpool" works — so retry with the alias, the raw name,
    the normalized name, and finally the stop-token-stripped name.
    """
    alias = ALIASES.get(club_name)
    target = alias or club_name
    kept = tokens(target)
    stripped = " ".join(t for t in norm(target).split() if t in kept)
    queries: list[str] = []
    for q in (alias, club_name, norm(target), stripped):
        if q and q not in queries:
            queries.append(q)
    for q in queries:
        teams = search_team(q)
        if not teams:
            continue
        team = match_team(target, teams)
        if team:
            return team
    return None


def download_badge(url: str) -> tuple[bytes, str] | None:
    # /small keeps images ~128px — plenty for badge-sized rendering.
    req = urllib.request.Request(url + "/small", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            ct = (resp.headers.get("Content-Type") or "image/png").split(";")[0].strip()
    except Exception as e:  # noqa: BLE001
        print(f"  ! download failed ({url}): {e}")
        return None
    time.sleep(CDN_DELAY_S)
    if not data or not ct.startswith("image/"):
        return None
    return data, ct


def main() -> int:
    p = argparse.ArgumentParser(description="Sync club crests from TheSportsDB")
    p.add_argument("--db-url", default=os.getenv("DB_URL", "sqlite:///./data/app.db"))
    p.add_argument("--game", default="EA FC 26")
    p.add_argument("--refresh", action="store_true", help="also redo clubs that already have a crest")
    p.add_argument("--dry-run", action="store_true", help="match only, download/store nothing")
    p.add_argument("--limit", type=int, default=0, help="stop after N stored crests (0 = no limit)")
    args = p.parse_args()

    configure_db(args.db_url)
    init_db()

    with Session(get_engine()) as s:
        rows = s.exec(
            select(Club, League.name)
            .join(League, Club.league_id == League.id, isouter=True)
            .where(Club.game == args.game)
            .order_by(Club.league_id, Club.name)
        ).all()
        have = set(s.exec(select(ClubCrestFile.club_id)).all()) if not args.refresh else set()

    by_league: dict[str, list[Club]] = {}
    skipped_national = 0
    for club, league_name in rows:
        ln = league_name or ""
        if ln in SKIP_LEAGUES:
            skipped_national += 1
            continue
        if club.id in have:
            continue
        by_league.setdefault(ln, []).append(club)

    total = sum(len(v) for v in by_league.values())
    print(f"Clubs to sync: {total} (skipped: {skipped_national} national, {len(have)} already done)")

    stored = 0
    missed: list[tuple[str, str]] = []

    def store(club: Club, team: dict) -> bool:
        nonlocal stored
        badge = team.get("strBadge") or team.get("strTeamBadge") or ""
        if not badge:
            return False
        if args.dry_run:
            stored += 1
            return True
        dl = download_badge(badge)
        if not dl:
            return False
        data, ct = dl
        with Session(get_engine()) as s2:
            upsert_media_row(
                s2,
                row_cls=ClubCrestFile,
                row_id=club.id,
                id_field="club_id",
                content_type=ct,
                data=data,
                path_builder=media_path_for_club_crest,
                updated_at=dt.datetime.utcnow(),
            )
            s2.commit()
        stored += 1
        return True

    for league_name, clubs in by_league.items():
        tsdb_league = LEAGUE_MAP.get(league_name)
        teams = fetch_league_teams(tsdb_league) if tsdb_league else []
        print(f"[{league_name}] {len(clubs)} clubs, {len(teams)} TSDB teams ({tsdb_league or 'no mapping'})")

        leftovers: list[Club] = []
        for club in clubs:
            team = match_team(club.name, teams) if teams else None
            if team and store(club, team):
                pass
            else:
                leftovers.append(club)
            if args.limit and stored >= args.limit:
                break

        for club in leftovers:
            if args.limit and stored >= args.limit:
                break
            team = find_via_search(club.name)
            if not (team and store(club, team)):
                missed.append((league_name, club.name))

        if args.limit and stored >= args.limit:
            break

    print(f"\nStored: {stored}  Missed: {len(missed)}")
    for league_name, name in missed:
        print(f"  miss: {name}  [{league_name}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
