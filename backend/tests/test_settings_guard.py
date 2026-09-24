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


# ---- mail (E0): the four rules, every combination --------------------------------------------

SMTP_FULL = dict(
    smtp_host="smtp.example.test",
    smtp_user="login@example.test",
    smtp_pass="hunter2-app-password",
    smtp_from="no-reply@example.test",
)
SMTP_SHAPES = {
    "none": {},
    "half": {"smtp_host": "smtp.example.test", "smtp_pass": "hunter2-app-password"},
    "full": SMTP_FULL,
}
ENV_SHAPES = {"production": PRODUCTION, "development": DEV, "test": dict(app_env="test", **{k: v for k, v in DEV.items() if k != "app_env"})}

HALF = "SMTP is half-configured"
SMTP_ON_DEV = "SMTP credentials are set on a development server"
SINK_IN_PROD = "MAIL_SINK_DIR is set on a production server"
FLAG_IN_PROD = "MAIL_DEV_SMTP is set on a production server"

# The whole matrix, written out rather than recomputed, so it cannot share a bug with the
# guard: (env, smtp, sink, dev flag) → the refusal, or None for a server that boots.
MAIL_MATRIX = {
    # production
    ("production", "none", False, False): None,
    ("production", "none", False, True): FLAG_IN_PROD,
    ("production", "none", True, False): SINK_IN_PROD,
    ("production", "none", True, True): SINK_IN_PROD,
    ("production", "half", False, False): HALF,
    ("production", "half", False, True): HALF,
    ("production", "half", True, False): HALF,
    ("production", "half", True, True): HALF,
    ("production", "full", False, False): None,  # the one real-mail shape
    ("production", "full", False, True): FLAG_IN_PROD,
    ("production", "full", True, False): SINK_IN_PROD,
    ("production", "full", True, True): SINK_IN_PROD,
}
for _env in ("development", "test"):
    MAIL_MATRIX.update(
        {
            (_env, "none", False, False): None,  # the shipped default: mail off
            (_env, "none", False, True): None,  # a dev flag with nothing to allow is harmless
            (_env, "none", True, False): None,  # every verification stack
            (_env, "none", True, True): None,
            (_env, "half", False, False): HALF,
            (_env, "half", False, True): HALF,
            (_env, "half", True, False): HALF,
            (_env, "half", True, True): HALF,
            (_env, "full", False, False): SMTP_ON_DEV,
            (_env, "full", False, True): None,  # "if you really mean it"
            (_env, "full", True, False): SMTP_ON_DEV,  # a sink does not excuse the credentials
            (_env, "full", True, True): None,  # the sink wins over SMTP (test_mail_transport)
        }
    )


@pytest.mark.parametrize("env, smtp, sink, flag", sorted(MAIL_MATRIX))
def test_the_mail_guard_matrix(env, smtp, sink, flag, tmp_path):
    s = _settings(**ENV_SHAPES[env], **SMTP_SHAPES[smtp], mail_sink_dir=str(tmp_path / "mail") if sink else "", mail_dev_smtp=flag)
    expected = MAIL_MATRIX[(env, smtp, sink, flag)]
    if expected is None:
        assert_auth_config_safe(s)
    else:
        with pytest.raises(AuthConfigError, match=expected):
            assert_auth_config_safe(s)


def test_the_matrix_is_complete():
    assert len(MAIL_MATRIX) == 3 * 3 * 2 * 2


def test_half_configured_smtp_names_what_is_set_and_what_is_missing():
    with pytest.raises(AuthConfigError) as info:
        assert_auth_config_safe(_settings(**PRODUCTION, smtp_host="smtp.example.test", smtp_pass="S3cr3t-VALUE"))
    msg = str(info.value)
    assert "smtp_host, smtp_pass set but smtp_user, smtp_from missing" in msg
    assert "S3cr3t-VALUE" not in msg and "smtp.example.test" not in msg  # names keys, never values


@pytest.mark.parametrize("only", ["smtp_host", "smtp_user", "smtp_pass", "smtp_from"])
def test_any_single_smtp_key_alone_is_half_configured(only):
    with pytest.raises(AuthConfigError, match=HALF):
        assert_auth_config_safe(_settings(**PRODUCTION, **{only: SMTP_FULL[only]}))


@pytest.mark.parametrize("missing", ["smtp_host", "smtp_user", "smtp_pass", "smtp_from"])
def test_any_one_smtp_key_missing_is_half_configured(missing):
    keys = {k: v for k, v in SMTP_FULL.items() if k != missing}
    with pytest.raises(AuthConfigError, match=f"missing.*{missing}|{missing}.*missing"):
        assert_auth_config_safe(_settings(**PRODUCTION, **keys))


def test_the_refusal_messages_name_the_setting_and_the_way_out(tmp_path):
    with pytest.raises(AuthConfigError) as dev:
        assert_auth_config_safe(_settings(**DEV, **SMTP_FULL))
    assert "MAIL_SINK_DIR" in str(dev.value) and "MAIL_DEV_SMTP=1" in str(dev.value)
    assert SMTP_FULL["smtp_pass"] not in str(dev.value)
    with pytest.raises(AuthConfigError, match="MAIL_SINK_DIR"):
        assert_auth_config_safe(_settings(**PRODUCTION, mail_sink_dir=str(tmp_path)))
    with pytest.raises(AuthConfigError, match="MAIL_DEV_SMTP"):
        assert_auth_config_safe(_settings(**PRODUCTION, **SMTP_FULL, mail_dev_smtp=True))


def test_the_settings_repr_never_prints_the_smtp_password():
    s = _settings(**PRODUCTION, **SMTP_FULL)
    assert SMTP_FULL["smtp_pass"] not in repr(s) and SMTP_FULL["smtp_pass"] not in str(s)
    assert "smtp_pass" not in repr(s)
    assert "smtp.example.test" in repr(s)  # the rest is still printable


def test_create_app_refuses_smtp_on_a_dev_server_before_it_configures_anything(monkeypatch):
    import app.main as main_module

    called = []
    monkeypatch.setattr(main_module, "configure_db", lambda url: called.append(url))
    with pytest.raises(AuthConfigError, match=SMTP_ON_DEV):
        create_app(_settings(**DEV, **SMTP_FULL))
    assert called == []


def test_load_settings_reads_the_mail_keys_from_the_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "  SMTP.Example.TEST ")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", " login@example.test ")
    monkeypatch.setenv("SMTP_PASS", "env-pass")
    monkeypatch.setenv("SMTP_FROM", " no-reply@example.test ")
    monkeypatch.setenv("MAIL_SINK_DIR", str(tmp_path / "mail"))
    monkeypatch.setenv("MAIL_DEV_SMTP", "1")
    s = load_settings(secrets_path=str(tmp_path / "absent.json"))
    assert (s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, s.smtp_from) == (
        "smtp.example.test",
        587,
        "login@example.test",
        "env-pass",
        "no-reply@example.test",
    )
    assert s.mail_sink_dir == str(tmp_path / "mail") and s.mail_dev_smtp is True


def test_load_settings_reads_the_mail_keys_from_a_secrets_file(tmp_path, monkeypatch):
    for key in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "MAIL_SINK_DIR", "MAIL_DEV_SMTP"):
        monkeypatch.delenv(key, raising=False)
    secrets = tmp_path / "secrets.json"
    secrets.write_text(
        '{"smtp_host": "smtp.example.test", "smtp_user": "u@example.test", "smtp_pass": "p", "smtp_from": "f@example.test"}',
        encoding="utf-8",
    )
    s = load_settings(secrets_path=str(secrets))
    assert (s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, s.smtp_from) == ("smtp.example.test", 465, "u@example.test", "p", "f@example.test")
    assert (s.mail_sink_dir, s.mail_dev_smtp) == ("", False)
    # …and a development server refuses exactly that file.
    with pytest.raises(AuthConfigError, match=SMTP_ON_DEV):
        assert_auth_config_safe(s)


def test_the_mail_defaults_are_off():
    s = _settings()
    assert (s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass, s.smtp_from, s.mail_sink_dir, s.mail_dev_smtp) == (
        "",
        465,
        "",
        "",
        "",
        "",
        False,
    )
