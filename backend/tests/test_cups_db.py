"""
L12 — cups live in the database; `cups.json` is the seed.

The file is imported once, into an empty `cup` table, for the current group; after that
the rows are the source, the file is still validated at every boot (a malformed one still
refuses to boot), and `get_cup_def` / `/cup/defs` read the rows.
"""

import datetime as dt
import json

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import cup_defs
from app.cup_defs import CupDef, CupEra, get_cup_def, load_cup_defs, read_cups_file, replace_cup_defs, seed_cups_from_file
from app.db import get_engine
from app.main import create_app
from app.models import Cup
from app.models import CupEra as CupEraRow
from app.services.groups import current_group
from tests.conftest import make_settings

PROD_DEFS_JSON = (
    '{"cups":[{"key":"default","name":"Lorbeerkranz","since_date":null,"eras":[{"since":"2026-07-11","mode":"2v2"}]},'
    '{"key":"bauernkranz","name":"Bauernkranz","since_date":"2026-01-05","eras":[{"since":"2026-07-11","mode":"1v1"}]}]}'
)


def _rows():
    with Session(get_engine()) as s:
        cups = s.exec(select(Cup).order_by(Cup.sort_order)).all()
        eras = s.exec(select(CupEraRow)).all()
        return [(c.key, c.name, c.since_date, c.sort_order) for c in cups], len(eras)


def test_the_boot_imports_the_two_production_cups_with_their_eras(client):
    cups, era_count = _rows()
    assert cups == [
        ("default", "Lorbeerkranz", None, 0),
        ("bauernkranz", "Bauernkranz", dt.date(2026, 1, 5), 1),
    ]
    assert era_count == 2
    # The wire is byte-identical to what the file produced before the import (the bundled
    # `cups.json` is production's `/data/cups.json`, diffed on 2026-09-23).
    assert client.get("/cup/defs").text == PROD_DEFS_JSON

    lorbeer = get_cup_def("default")
    assert lorbeer.eras == [CupEra(since=dt.date(2026, 7, 11), mode="2v2")]
    # The 2026-07-11 boundary (AGENTS.md §10): the deciding tournament is dated 11.07.
    assert lorbeer.active_era_mode(dt.date(2026, 7, 10)) == "any"
    assert lorbeer.active_era_mode(dt.date(2026, 7, 11)) == "2v2"
    assert get_cup_def("bauernkranz").active_era_mode(dt.date(2026, 7, 11)) == "1v1"


def test_the_import_runs_once_and_the_rows_win_over_the_file_afterwards(client, tmp_path, monkeypatch):
    engine = get_engine()
    assert seed_cups_from_file(engine) == 0  # the boot already imported: nothing to do

    edited = tmp_path / "cups.json"
    edited.write_text(json.dumps({"cups": [{"key": "default", "name": "Renamed in the file"}]}))
    monkeypatch.setenv("CUPS_CONFIG_PATH", str(edited))
    warnings: list[str] = []
    monkeypatch.setattr(cup_defs.log, "warning", lambda msg, *args: warnings.append(msg % args))
    assert seed_cups_from_file(engine) == 0
    assert len(warnings) == 1 and "differs from the database" in warnings[0]
    assert [d.name for d in load_cup_defs()] == ["Lorbeerkranz", "Bauernkranz"]
    assert _rows()[0][0] == ("default", "Lorbeerkranz", None, 0)


def test_get_cup_def_reads_the_rows(client):
    with Session(get_engine()) as s:
        replace_cup_defs(
            s,
            int(current_group(s).id),
            [CupDef(key="default", name="From the rows", since_date=None, eras=[
                CupEra(since=dt.date(2026, 8, 1), mode="1v1"),
                CupEra(since=dt.date(2026, 2, 1), mode="any"),
            ])],
        )
        s.commit()
    d = get_cup_def("default")
    assert d.name == "From the rows"
    assert [e.since for e in d.eras] == [dt.date(2026, 2, 1), dt.date(2026, 8, 1)]  # sorted by `since`
    with pytest.raises(KeyError):
        get_cup_def("bauernkranz")
    assert client.get("/cup/defs").json()["cups"][0]["name"] == "From the rows"


def test_a_group_without_a_default_cup_still_gets_one_at_read_time(client):
    with Session(get_engine()) as s:
        replace_cup_defs(s, int(current_group(s).id), [CupDef(key="other", name="Other", since_date=None)])
        s.commit()
    assert [d.key for d in load_cup_defs()] == ["default", "other"]
    cups, _ = _rows()
    assert [c[0] for c in cups] == ["other"]  # the synthesized default is never stored


def test_a_malformed_seed_still_refuses_to_boot(tmp_path, monkeypatch):
    bad = tmp_path / "cups.json"
    bad.write_text(json.dumps({"cups": [{"key": "default", "name": "C", "eras": [{"since": "2026-01-01", "mode": "3v3"}]}]}))
    monkeypatch.setenv("CUPS_CONFIG_PATH", str(bad))
    monkeypatch.setenv("UPLOADS_DIR", str(tmp_path / "uploads"))
    with pytest.raises(ValueError):
        read_cups_file()
    app = create_app(make_settings(tmp_path / "boot.db"))
    with pytest.raises(ValueError):
        with TestClient(app):
            pass


def test_a_malformed_seed_refuses_to_boot_even_after_the_import(client, tmp_path, monkeypatch):
    # The rows exist; the file is still validated at every boot, as it always was.
    bad = tmp_path / "cups.json"
    bad.write_text("{not json")
    monkeypatch.setenv("CUPS_CONFIG_PATH", str(bad))
    with pytest.raises(ValueError):
        with TestClient(client.app):
            pass
