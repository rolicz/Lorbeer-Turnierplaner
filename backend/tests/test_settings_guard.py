"""The auth boot guard (L1): `settings.assert_auth_config_safe`, and the settings it reads."""

import dataclasses
import logging

import pytest

from app.main import create_app
from app.settings import AuthConfigError, Settings, assert_auth_config_safe, load_settings


def _settings(**overrides) -> Settings:
    base = Settings(
        db_url="sqlite:///:memory:",
        player_accounts=(),
        log_level="INFO",
    )
    return dataclasses.replace(base, **overrides)


PRODUCTION = dict(app_env="production", trusted_proxy_hops=1)
DEV = dict(app_env="development", auth_dev_origin=True, auth_origin="http://localhost:8252")


def test_the_production_shape_is_accepted_without_a_warning(caplog):
    with caplog.at_level(logging.WARNING, logger="app.settings"):
        assert_auth_config_safe(_settings(**PRODUCTION))
    assert caplog.records == []


def test_the_dev_origin_shape_is_accepted():
    assert_auth_config_safe(_settings(**DEV))


def test_the_defaults_are_safe():
    # Every `Settings(...)` a test or a tool builds without naming the new keys lands here.
    s = _settings()
    assert (s.app_env, s.auth_dev_origin, s.auth_origin, s.password_hash_profile) == (
        "development",
        False,
        "https://lorbeerkranz.xyz",
        "default",
    )
    assert_auth_config_safe(s)


def test_a_dev_origin_on_a_production_server_is_refused():
    with pytest.raises(AuthConfigError, match="AUTH_DEV_ORIGIN is set on a production server"):
        assert_auth_config_safe(_settings(**PRODUCTION, auth_dev_origin=True))


def test_a_plain_http_origin_in_pinned_mode_is_refused():
    with pytest.raises(AuthConfigError, match="AUTH_ORIGIN must be https in pinned mode"):
        assert_auth_config_safe(_settings(auth_origin="http://lorbeerkranz.xyz"))


def test_the_test_hash_profile_on_a_production_server_is_refused():
    with pytest.raises(AuthConfigError, match="PASSWORD_HASH_PROFILE='test' on a production server"):
        assert_auth_config_safe(_settings(**PRODUCTION, password_hash_profile="test"))


def test_an_unknown_app_env_or_hash_profile_is_refused():
    # A typo such as `prod` must not silently switch the production guards off.
    with pytest.raises(AuthConfigError, match="APP_ENV='prod'"):
        assert_auth_config_safe(_settings(app_env="prod"))
    with pytest.raises(AuthConfigError, match="PASSWORD_HASH_PROFILE='fast'"):
        assert_auth_config_safe(_settings(password_hash_profile="fast"))


def test_no_proxy_hops_in_production_warns_and_boots(caplog):
    with caplog.at_level(logging.WARNING, logger="app.settings"):
        assert_auth_config_safe(_settings(app_env="production", trusted_proxy_hops=0))
    assert any("TRUSTED_PROXY_HOPS=0" in r.getMessage() and "one rate-limit bucket" in r.getMessage() for r in caplog.records)


def test_create_app_refuses_before_it_configures_anything(monkeypatch):
    import app.main as main_module

    called = []
    monkeypatch.setattr(main_module, "configure_db", lambda url: called.append(url))
    with pytest.raises(AuthConfigError):
        create_app(_settings(**PRODUCTION, auth_dev_origin=True))
    assert called == []


def test_load_settings_reads_the_auth_keys_from_the_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_ENV", "Production")
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    monkeypatch.setenv("AUTH_DEV_ORIGIN", "0")
    monkeypatch.setenv("AUTH_ORIGIN", "https://example.test/")
    monkeypatch.setenv("PASSWORD_HASH_PROFILE", "default")
    s = load_settings(secrets_path=str(tmp_path / "absent.json"))
    assert (s.app_env, s.trusted_proxy_hops, s.auth_dev_origin, s.auth_origin) == (
        "production",
        1,
        False,
        "https://example.test",
    )
    assert s.session_ttl_days == 90
    assert_auth_config_safe(s)


def test_load_settings_reads_the_dev_flag_from_a_secrets_file(tmp_path, monkeypatch):
    for key in ("APP_ENV", "AUTH_DEV_ORIGIN", "TRUSTED_PROXY_HOPS", "PASSWORD_HASH_PROFILE", "AUTH_ORIGIN"):
        monkeypatch.delenv(key, raising=False)
    secrets = tmp_path / "secrets.json"
    secrets.write_text('{"auth_dev_origin": true, "password_hash_profile": "test"}', encoding="utf-8")
    s = load_settings(secrets_path=str(secrets))
    assert s.auth_dev_origin is True
    assert s.password_hash_profile == "test"
    assert s.app_env == "development"
    assert s.trusted_proxy_hops == 0
