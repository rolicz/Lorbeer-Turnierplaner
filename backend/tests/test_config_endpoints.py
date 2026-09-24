from fastapi.testclient import TestClient

from tests.conftest import LoopbackScope


def test_health_endpoint(client, anon):
    # Loopback only (L2): Docker's healthcheck calls from inside the container; from any other
    # peer — a session or not — the gate answers 401.
    r = TestClient(LoopbackScope(client.app)).get("/health")
    assert r.status_code == 200, r.text
    assert r.json() == {"status": "ok"}
    assert client.get("/health").status_code == 401
    assert anon.get("/health").status_code == 401


def test_cup_defs_lists_bundled_cups(client):
    r = client.get("/cup/defs")
    assert r.status_code == 200, r.text

    cups = r.json()["cups"]
    by_key = {c["key"]: c for c in cups}
    assert set(by_key) == {"default", "bauernkranz"}

    lorbeer = by_key["default"]
    assert lorbeer["name"] == "Lorbeerkranz"
    assert lorbeer["since_date"] is None
    assert lorbeer["eras"] == [{"since": "2026-07-11", "mode": "2v2"}]

    bauern = by_key["bauernkranz"]
    assert bauern["name"] == "Bauernkranz"
    assert bauern["since_date"] == "2026-01-05"
    assert bauern["eras"] == [{"since": "2026-07-11", "mode": "1v1"}]
