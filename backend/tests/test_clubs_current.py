from sqlmodel import Session

from app.db import get_engine
from tests.conftest import create_league


def test_clubs_require_league_id(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Bundesliga")

    r = client.post("/clubs", json={"name": "FC Test", "game": "EA FC 26", "star_rating": 4.5}, headers=editor_headers)
    assert r.status_code == 400
    assert r.json()["detail"] == "Missing league_id"

    r2 = client.post(
        "/clubs",
        json={"name": "FC Test", "game": "EA FC 26", "star_rating": 4.5, "league_id": league_id},
        headers=editor_headers,
    )
    assert r2.status_code == 200, r2.text
    club = r2.json()
    assert club["name"] == "FC Test"
    assert club["league_id"] == league_id

    r3 = client.get("/clubs")
    assert r3.status_code == 200
    names = {c["name"] for c in r3.json()}
    assert "FC Test" in names


def test_clubs_uniqueness_by_name_and_game(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Premier League")
    r1 = client.post(
        "/clubs",
        json={"name": "Real", "game": "EA FC 26", "star_rating": 4.5, "league_id": league_id},
        headers=editor_headers,
    )
    assert r1.status_code == 200
    id1 = r1.json()["id"]

    r2 = client.post(
        "/clubs",
        json={"name": "Real", "game": "EA FC 26", "star_rating": 3.0, "league_id": league_id},
        headers=editor_headers,
    )
    assert r2.status_code == 200
    assert r2.json()["id"] == id1


def test_clubs_filter_by_game(client, editor_headers, admin_headers):
    league_id = create_league(client, admin_headers, "Serie A")
    client.post(
        "/clubs",
        json={"name": "Team25", "game": "EA FC 25", "star_rating": 3.5, "league_id": league_id},
        headers=editor_headers,
    )
    client.post(
        "/clubs",
        json={"name": "Team26", "game": "EA FC 26", "star_rating": 4.0, "league_id": league_id},
        headers=editor_headers,
    )

    r = client.get("/clubs?game=EA FC 26")
    assert r.status_code == 200
    names = {c["name"] for c in r.json()}
    assert "Team26" in names
    assert "Team25" not in names


# ---- delete (A9) ------------------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def _club_with_league(client, editor_headers, admin_headers, name: str) -> int:
    league_id = create_league(client, admin_headers, f"League {name}")
    r = client.post(
        "/clubs",
        json={"name": name, "game": "EA FC 26", "star_rating": 4.0, "league_id": league_id},
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_delete_club_refuses_when_only_a_friendly_uses_it(client, editor_headers, admin_headers):
    """A friendly is a recorded match too — 12 clubs in the real DB are referenced only by one."""
    club_id = _club_with_league(client, editor_headers, admin_headers, "Friendly FC")
    p1 = client.post("/players", json={"display_name": "DC-A"}, headers=admin_headers).json()["id"]
    p2 = client.post("/players", json={"display_name": "DC-B"}, headers=admin_headers).json()["id"]

    r = client.post(
        "/friendlies",
        json={
            "mode": "1v1",
            "teamA_player_ids": [p1],
            "teamB_player_ids": [p2],
            "clubA_id": club_id,
            "clubB_id": None,
            "a_goals": 2,
            "b_goals": 1,
        },
        headers=editor_headers,
    )
    assert r.status_code == 200, r.text

    d = client.delete(f"/clubs/{club_id}", headers=admin_headers)
    assert d.status_code == 409, d.text
    assert d.json()["detail"] == "Club is used in friendlies; cannot delete"

    # Still there, and the friendly still points at a club that exists.
    assert club_id in {c["id"] for c in client.get("/clubs").json()}
    (side,) = [s for s in client.get("/friendlies").json()[0]["sides"] if s["side"] == "A"]
    assert side["club_id"] == club_id


def test_delete_unused_club_takes_its_crest_with_it(client, editor_headers, admin_headers):
    """`club.id` is not AUTOINCREMENT: an orphaned crest would be inherited by the next club."""
    club_id = _club_with_league(client, editor_headers, admin_headers, "Crest FC")
    assert client.put(
        f"/clubs/{club_id}/crest",
        files={"file": ("crest.png", PNG, "image/png")},
        headers=admin_headers,
    ).status_code == 200
    assert client.get(f"/clubs/{club_id}/crest").status_code == 200

    from app.models import ClubCrestFile
    from app.services.file_storage import media_exists

    with Session(get_engine()) as s:
        row = s.get(ClubCrestFile, club_id)
        assert row is not None
        rel_path = row.file_path
    assert media_exists(rel_path)

    assert client.delete(f"/clubs/{club_id}", headers=admin_headers).status_code == 204

    with Session(get_engine()) as s:
        assert s.get(ClubCrestFile, club_id) is None
    assert not media_exists(rel_path)
    assert client.get(f"/clubs/{club_id}/crest").status_code == 404


# ---- promote a group's rating to global, forward-only (L12) -----------------


def _promote_setup(client, editor_headers, admin_headers, name: str):
    """A club whose global rating is 3.0 since 60 days ago and whose group rated it 4.5
    ten days ago. Returns (club id, current group id, a second group's id)."""
    import datetime as dt

    from sqlmodel import select

    from app.models import ClubStarRating, Group
    from app.services.club_stars import current_group_id
    from tests.conftest import create_club

    league_id = create_league(client, admin_headers, f"{name} League")
    cid = create_club(client, editor_headers, name, "EA FC 26", 3.0, league_id)
    with Session(get_engine()) as s:
        gid = current_group_id(s)
        (opening,) = s.exec(select(ClubStarRating).where(ClubStarRating.club_id == cid)).all()
        opening.group_id = None
        opening.valid_from = opening.valid_from - dt.timedelta(days=60)
        s.add(opening)
        s.commit()
    r = client.patch(f"/clubs/{cid}", json={"star_rating": 4.5}, headers=editor_headers)
    assert r.status_code == 200, r.text
    with Session(get_engine()) as s:
        today = dt.datetime.utcnow().date()
        row = s.exec(
            select(ClubStarRating).where(ClubStarRating.club_id == cid, ClubStarRating.valid_from == today)
        ).one()
        row.valid_from = today - dt.timedelta(days=10)
        s.add(row)
        other = Group(slug=f"other-{cid}", name="Other")
        s.add(other)
        s.commit()
        return cid, gid, int(other.id)


def test_promote_applies_from_today_and_rewrites_no_past_day_of_any_group(client, editor_headers, admin_headers):
    import datetime as dt

    from app.services.club_stars import StarRatingResolver

    cid, gid, other = _promote_setup(client, editor_headers, admin_headers, "Promote FC")
    today = dt.datetime.utcnow().date()
    days = [today - dt.timedelta(days=n) for n in (90, 60, 11, 10, 5, 1)]

    def resolve():
        with Session(get_engine()) as s:
            return {
                g: [StarRatingResolver.load(s, group_id=g).as_of(cid, d) for d in [*days, today]] for g in (gid, other)
            }

    before = resolve()
    assert before[gid] == [3.0, 3.0, 3.0, 4.5, 4.5, 4.5, 4.5]
    assert before[other] == [3.0] * 7
    assert client.get(f"/clubs/{cid}/star-history").json()["current_is_global"] is False

    r = client.post(f"/clubs/{cid}/stars/promote", headers=admin_headers)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["current_is_global"] is True
    assert [(e["stars"], e["scope"]) for e in out["entries"]] == [(3.0, "global"), (4.5, "group"), (4.5, "global")]
    assert out["entries"][-1]["valid_from"] == today.isoformat()

    after = resolve()
    assert after[gid] == before[gid]  # nothing this group counts moves
    assert after[other][:-1] == before[other][:-1]  # no past day of another group moves…
    assert after[other][-1] == 4.5  # …and from today on, every group counts it

    again = client.post(f"/clubs/{cid}/stars/promote", headers=admin_headers)
    assert again.status_code == 409


def test_promote_turns_todays_own_row_global_and_blocks_a_second_scope_that_day(client, editor_headers, admin_headers):
    from tests.conftest import create_club

    league_id = create_league(client, admin_headers, "Same Day League")
    cid = create_club(client, editor_headers, "Same Day FC", "EA FC 26", 2.5, league_id)
    first = client.get(f"/clubs/{cid}/star-history").json()
    assert [e["scope"] for e in first["entries"]] == ["group"]  # POST /clubs is a group write

    r = client.post(f"/clubs/{cid}/stars/promote", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert [(e["stars"], e["scope"]) for e in r.json()["entries"]] == [(2.5, "global")]  # the same row, now global

    # One row per club per day (R4's unique constraint): the group cannot add its own today.
    r = client.patch(f"/clubs/{cid}", json={"star_rating": 3.0}, headers=editor_headers)
    assert r.status_code == 409, r.text
    assert "tomorrow" in r.json()["detail"]


def test_promote_is_site_admin_only(client, editor_headers, admin_headers):
    from tests.conftest import cookie_headers, login
    from tests.test_admin import _pid, _set_role

    cid, _gid, _other = _promote_setup(client, editor_headers, admin_headers, "Admin Only FC")
    _set_role(_pid("Editor2"), "owner")
    owner_headers = cookie_headers(login(client, "Editor2", "editor2-secret"))
    assert client.post(f"/clubs/{cid}/stars/promote", headers=owner_headers).status_code == 403
    assert client.post(f"/clubs/{cid}/stars/promote", headers=editor_headers).status_code == 403
    assert client.post("/clubs/999999/stars/promote", headers=admin_headers).status_code == 404
