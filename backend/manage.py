import argparse
import json
import logging
import os
import shlex
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from app.logging_config import setup_logging
from app.settings import load_settings
from app.db import configure_db, init_db, get_engine
from sqlmodel import Session

from app.seed import load_seed_file, seed_from_json, insert_match
from app.services.webpush import derive_public_key_from_private_pem

BACKEND_ROOT = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_ROOT.parent
DEFAULT_DEPLOY_REMOTE_ROOT = "hetzner:/home/rczerny/projects/Lorbeer-Turnierplaner"


def _abs_path(raw: str) -> Path:
    p = Path(raw).expanduser()
    if p.is_absolute():
        return p
    return (Path.cwd() / p).resolve()


def _default_backup_root(kind: str) -> Path:
    return REPO_ROOT / "backup" / kind


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _repo_local_path(path: Path | None) -> Path | None:
    if path is None:
        return None
    resolved = path.resolve()
    return resolved if _is_within(resolved, REPO_ROOT) else None


def _resolve_repo_runtime_path(raw: str, *, anchor: Path = BACKEND_ROOT) -> Path | None:
    value = str(raw or "").strip()
    if not value:
        return None
    candidate = Path(value).expanduser()
    resolved = candidate.resolve() if candidate.is_absolute() else (anchor / candidate).resolve()
    return _repo_local_path(resolved)


def _load_json_dict(path: Path) -> dict:
    if not path.exists() or not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _snapshot_dir(base_dir: Path, *, name: str | None = None) -> Path:
    base_dir.mkdir(parents=True, exist_ok=True)
    snap_name = str(name or datetime.now().strftime("%Y%m%d-%H%M%S")).strip()
    if not snap_name:
        raise RuntimeError("Snapshot name cannot be empty")
    snap_dir = base_dir / snap_name
    if snap_dir.exists():
        raise RuntimeError(f"Snapshot already exists: {snap_dir}")
    (snap_dir / "data").mkdir(parents=True, exist_ok=False)
    return snap_dir


def _write_snapshot_meta(snapshot_dir: Path, payload: dict) -> None:
    meta_path = snapshot_dir / "snapshot.json"
    meta_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def _require_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Required tool not found in PATH: {name}")


def _run(cmd: list[str]) -> None:
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        rendered = " ".join(shlex.quote(part) for part in cmd)
        detail = next(
            (
                line.strip()
                for line in f"{exc.stderr or ''}\n{exc.stdout or ''}".splitlines()
                if line.strip()
            ),
            "",
        )
        suffix = f" | {detail}" if detail else ""
        raise RuntimeError(f"Command failed with exit code {exc.returncode}: {rendered}{suffix}") from exc


def _rsync_dir(source: str, dest: Path, *, delete: bool = False, include_filters: list[str] | None = None) -> None:
    _require_tool("rsync")
    dest.mkdir(parents=True, exist_ok=True)
    cmd = ["rsync", "-a", "--human-readable"]
    if delete:
        cmd.append("--delete")
    if include_filters:
        cmd.append("--prune-empty-dirs")
        for pattern in include_filters:
            cmd.extend(["--include", pattern])
        cmd.extend(["--exclude", "*"])
    cmd.extend([source, f"{dest}/"])
    _run(cmd)


def _rsync_file(source: Path, dest: Path) -> None:
    _require_tool("rsync")
    dest.parent.mkdir(parents=True, exist_ok=True)
    _run(["rsync", "-a", "--human-readable", str(source), str(dest)])


def _sqlite_path_from_settings(db_url: str) -> Path | None:
    raw = str(db_url or "").strip()
    if not raw.startswith("sqlite:///"):
        return None
    path_part = raw.removeprefix("sqlite:///")
    if not path_part or path_part == ":memory:":
        return None
    candidate = Path(path_part)
    if candidate.is_absolute():
        return candidate
    return (BACKEND_ROOT / candidate).resolve()


def _read_target_club_ids(db_path: Path) -> list[tuple[int, str]]:
    """Club ids in the database the recovery writes to — read-only, no engine needed."""
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = con.execute("SELECT id, name FROM club").fetchall()
    finally:
        con.close()
    return [(int(cid), str(name or "")) for cid, name in rows if cid is not None]


def _first_existing(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.exists():
            return path
    return None


def _local_primary_db_path(settings) -> Path | None:
    candidates: list[Path] = []
    settings_db = _sqlite_path_from_settings(settings.db_url)
    if settings_db is not None:
        repo_settings_db = _repo_local_path(settings_db)
        if repo_settings_db is not None:
            candidates.append(repo_settings_db)
    candidates.extend([
        (BACKEND_ROOT / "app.db").resolve(),
        (BACKEND_ROOT / "data" / "app.db").resolve(),
    ])
    return _first_existing(candidates)


def _local_uploads_path() -> Path | None:
    configured = _resolve_repo_runtime_path(os.environ.get("UPLOADS_DIR", ""))
    candidate = configured or (BACKEND_ROOT / "data" / "uploads").resolve()
    return candidate if candidate.exists() and candidate.is_dir() else None


def _local_cups_path() -> Path | None:
    configured = _resolve_repo_runtime_path(os.environ.get("CUPS_CONFIG_PATH", ""))
    if configured is not None:
        return configured if configured.exists() and configured.is_file() else None
    candidate = (BACKEND_ROOT / "data" / "cups.json").resolve()
    return candidate if candidate.exists() and candidate.is_file() else None


def _local_vapid_key_path(secrets_path: Path) -> Path | None:
    candidates: list[Path] = []

    env_path = _resolve_repo_runtime_path(os.environ.get("PUSH_VAPID_PRIVATE_KEY_FILE", ""))
    if env_path is not None:
        candidates.append(env_path)

    secret_value = str(_load_json_dict(secrets_path).get("push_vapid_private_key_file") or "").strip()
    if secret_value:
        secret_path = _resolve_repo_runtime_path(secret_value, anchor=secrets_path.parent.resolve())
        if secret_path is not None:
            candidates.append(secret_path)

    candidates.append((BACKEND_ROOT / "data" / "vapid_private_key.pem").resolve())
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _snapshot_includes(data_dir: Path) -> list[str]:
    return sorted(path.name for path in data_dir.iterdir())


def _backup_local_data(settings, *, path: Path, name: str | None, secrets_path: Path, log: logging.Logger) -> Path:
    snapshot_dir = _snapshot_dir(path, name=name)
    try:
        data_dir = snapshot_dir / "data"

        db_path = _local_primary_db_path(settings)
        if db_path is not None and db_path.is_file():
            _rsync_file(db_path, data_dir / "app.db")

        uploads_path = _local_uploads_path()
        if uploads_path is not None:
            _rsync_dir(f"{uploads_path}/", data_dir / "uploads", delete=True)

        cups_path = _local_cups_path()
        if cups_path is not None:
            _rsync_file(cups_path, data_dir / "cups.json")

        vapid_key_path = _local_vapid_key_path(secrets_path)
        if vapid_key_path is not None:
            _rsync_file(vapid_key_path, data_dir / vapid_key_path.name)
        elif settings.push_vapid_private_key:
            (data_dir / "vapid_private_key.pem").write_text(settings.push_vapid_private_key.strip() + "\n", encoding="utf-8")

        includes = _snapshot_includes(data_dir)
        if not includes:
            raise RuntimeError("No local runtime data found to back up")

        _write_snapshot_meta(
            snapshot_dir,
            {
                "kind": "local",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "source_db": str(db_path) if db_path else None,
                "includes": includes,
            },
        )
        log.info("Local data backup written to %s", snapshot_dir)
        return snapshot_dir
    except Exception:
        shutil.rmtree(snapshot_dir, ignore_errors=True)
        raise


def _backup_deploy_data(*, remote_root: str, path: Path, name: str | None, log: logging.Logger) -> Path:
    snapshot_dir = _snapshot_dir(path, name=name)
    try:
        data_dir = snapshot_dir / "data"
        source = f"{remote_root.rstrip('/')}/backend/data/"
        _rsync_dir(
            source,
            data_dir,
            delete=True,
            include_filters=[
                "/uploads/***",
                "/*.db",
                "/*.sqlite",
                "/*.sqlite3",
                "/*.pem",
                "/cups.json",
            ],
        )
        includes = _snapshot_includes(data_dir)
        if not includes:
            raise RuntimeError(f"No deploy runtime data found at {source}")
        _write_snapshot_meta(
            snapshot_dir,
            {
                "kind": "deploy",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "remote_root": remote_root,
                "includes": includes,
            },
        )
        log.info("Deploy data backup written to %s", snapshot_dir)
        return snapshot_dir
    except Exception:
        shutil.rmtree(snapshot_dir, ignore_errors=True)
        raise


def _first_snapshot_db(snapshot_dir: Path) -> Path | None:
    data_dir = snapshot_dir / "data"
    if not data_dir.exists():
        return None
    for pattern in ("*.db", "*.sqlite", "*.sqlite3"):
        matches = sorted(data_dir.glob(pattern))
        if matches:
            return matches[0]
    return None


def _remove_path(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path, ignore_errors=True)
        return
    try:
        path.unlink(missing_ok=True)
    except TypeError:
        if path.exists():
            path.unlink()


def _local_db_sync_targets(settings) -> list[Path]:
    targets: list[Path] = []
    settings_db = _sqlite_path_from_settings(settings.db_url)
    repo_settings_db = _repo_local_path(settings_db)
    if repo_settings_db is not None:
        targets.append(repo_settings_db)
    for fallback in [
        (BACKEND_ROOT / "app.db").resolve(),
        (BACKEND_ROOT / "data" / "app.db").resolve(),
    ]:
        if fallback not in targets:
            targets.append(fallback)
    return targets


def _sync_local_from_snapshot(snapshot_dir: Path, *, settings, log: logging.Logger) -> None:
    data_dir = snapshot_dir / "data"
    if not data_dir.exists():
        raise RuntimeError(f"Snapshot has no data directory: {snapshot_dir}")

    db_path = _first_snapshot_db(snapshot_dir)
    if db_path is None or not db_path.is_file():
        raise RuntimeError(f"Snapshot has no database file: {snapshot_dir}")
    for target in _local_db_sync_targets(settings):
        _rsync_file(db_path, target)

    uploads_path = data_dir / "uploads"
    local_uploads_path = (BACKEND_ROOT / "data" / "uploads").resolve()
    if uploads_path.is_dir():
        _rsync_dir(f"{uploads_path}/", local_uploads_path, delete=True)
    else:
        _remove_path(local_uploads_path)

    cups_path = data_dir / "cups.json"
    local_cups_path = (BACKEND_ROOT / "data" / "cups.json").resolve()
    if cups_path.is_file():
        _rsync_file(cups_path, local_cups_path)
    else:
        _remove_path(local_cups_path)

    pem_files = sorted(data_dir.glob("*.pem"))
    local_data_dir = (BACKEND_ROOT / "data").resolve()
    synced_pem_names: set[str] = set()
    for pem_file in pem_files:
        synced_pem_names.add(pem_file.name)
        _rsync_file(pem_file, (local_data_dir / pem_file.name).resolve())
    for existing_pem in local_data_dir.glob("*.pem"):
        if existing_pem.name not in synced_pem_names:
            _remove_path(existing_pem)

    log.info("Snapshot %s synced into local backend data", snapshot_dir)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Backend management commands")
    sub = p.add_subparsers(dest="cmd", required=True)

    p.add_argument("--secrets", default=str((BACKEND_ROOT / "secrets.json").resolve()))
    p.add_argument("--db-url")
    p.add_argument("--log-level")

    seed = sub.add_parser("seed", help="Seed DB from JSON")
    seed.add_argument("--file", required=True, help="Path to seed JSON file")

    add_match = sub.add_parser("add-match", help="Add a match from JSON file")
    add_match.add_argument("--file", required=True, help="Path to match JSON file")

    vacuum_db = sub.add_parser("vacuum-db", help="Run SQLite VACUUM (optional ANALYZE)")
    vacuum_db.add_argument("--analyze", action="store_true", help="Run ANALYZE after VACUUM")

    vapid = sub.add_parser("generate-vapid", help="Generate a VAPID private key and matching public key")
    vapid.add_argument("--private-key-out", default="./vapid_private_key.pem", help="Where to write the PEM private key")
    vapid.add_argument("--force", action="store_true", help="Overwrite the private key file if it already exists")

    backup_local = sub.add_parser("backup-local-data", help="Back up local runtime data into a timestamped snapshot")
    backup_local.add_argument(
        "--path",
        default=str(_default_backup_root("local")),
        help="Snapshot base directory (default: repo-root/backup/local)",
    )
    backup_local.add_argument("--name", help="Optional snapshot directory name")

    backup_deploy = sub.add_parser("backup-deploy-data", help="Back up deploy runtime data from Hetzner via rsync")
    backup_deploy.add_argument(
        "--path",
        default=str(_default_backup_root("deploy")),
        help="Snapshot base directory (default: repo-root/backup/deploy)",
    )
    backup_deploy.add_argument("--name", help="Optional snapshot directory name")
    backup_deploy.add_argument(
        "--remote-root",
        default=DEFAULT_DEPLOY_REMOTE_ROOT,
        help="Remote repo root, e.g. hetzner:/home/rczerny/projects/Lorbeer-Turnierplaner",
    )

    recover_stars = sub.add_parser(
        "recover-club-star-history",
        help="Reconstruct club star-rating history by diffing the production backup snapshots",
    )
    recover_stars.add_argument(
        "--path",
        default=str(_default_backup_root("deploy")),
        help="Deploy snapshot base directory (default: repo-root/backup/deploy). Deploy snapshots only.",
    )
    recover_stars.add_argument(
        "--apply",
        action="store_true",
        help="Write the recovered rows. Without it the command only reports (read-only).",
    )

    sync_local = sub.add_parser(
        "sync-local-from-deploy",
        help="Back up local data, pull the latest deploy data, and mirror it into local runtime paths",
    )
    sync_local.add_argument(
        "--deploy-path",
        default=str(_default_backup_root("deploy")),
        help="Deploy snapshot base directory (default: repo-root/backup/deploy)",
    )
    sync_local.add_argument(
        "--local-path",
        default=str(_default_backup_root("local")),
        help="Local snapshot base directory (default: repo-root/backup/local)",
    )
    sync_local.add_argument("--name", help="Optional shared snapshot suffix/name")
    sync_local.add_argument(
        "--remote-root",
        default=DEFAULT_DEPLOY_REMOTE_ROOT,
        help="Remote repo root, e.g. hetzner:/home/rczerny/projects/Lorbeer-Turnierplaner",
    )

    preflight = sub.add_parser(
        "auth-preflight",
        help="Dry-run the auth boot migration against a database (opened read-only) and report; exit 1 on a problem",
    )
    # Accepted after the subcommand too (`auth-preflight --secrets … --db-url …`), which is
    # how the deploy notes spell it; SUPPRESS keeps the global value when they are absent.
    preflight.add_argument("--secrets", default=argparse.SUPPRESS)
    preflight.add_argument("--db-url", default=argparse.SUPPRESS)

    # The escape hatch's five commands (FEATURES_2026-09-auth.md, "The escape hatch"): Roli's
    # way back in if login breaks on deploy day. Shape fixed by L1, bodies by L3. Each
    # resolves the player by login name (case-insensitive), prints one line, commits.
    def _hatch(name: str, help_text: str) -> argparse.ArgumentParser:
        cmd = sub.add_parser(name, help=help_text)
        cmd.add_argument("--secrets", default=argparse.SUPPRESS)
        cmd.add_argument("--db-url", default=argparse.SUPPRESS)
        return cmd

    reset_link = _hatch("reset-link", "Print a one-hour, single-use password reset link for a player")
    reset_link.add_argument("--player", required=True)
    reset_link.add_argument("--origin", help="Origin the link points at (default: the configured auth_origin)")
    set_password = _hatch("set-password", "Prompt (no echo, twice) for a new password and store its argon2id hash")
    set_password.add_argument("--player", required=True)
    make_admin = _hatch("make-admin", "Make a player's account a site admin (or, with --revoke, take it away)")
    make_admin.add_argument("--player", required=True)
    make_admin.add_argument("--revoke", action="store_true")
    invite = _hatch("invite", "Print a one-hour, single-use invite code for a group")
    invite.add_argument("--group", required=True, help="The group's slug, e.g. altherren")
    invite.add_argument("--note", default="")
    sessions = _hatch("sessions", "List a player's live sessions, or revoke them all")
    sessions.add_argument("--player", required=True)
    sessions.add_argument("--revoke-all", action="store_true")
    verify_email = _hatch("verify-email", "Mark an email address verified for a player by hand (the DNS-is-broken hatch)")
    verify_email.add_argument("--player", required=True)
    verify_email.add_argument("--email", required=True)

    # The deliverability gate (E1). With --host, the four flags replace the configured SMTP
    # settings and the password is prompted (never a flag), so the gate can run before the
    # app is configured; the boot guard still decides whether this server may send at all.
    mail_test = _hatch("mail-test", "Send one test email through the configured (or given) transport")
    mail_test.add_argument("--to", required=True, help="Where to send it (a Gmail address shows SPF/DKIM/DMARC)")
    mail_test.add_argument("--host", help="SMTP host (then --user and --from are needed; the password is prompted)")
    mail_test.add_argument("--port", type=int, help="SMTP port (default 465, implicit TLS)")
    mail_test.add_argument("--user", help="SMTP login mailbox")
    mail_test.add_argument("--from", dest="from_addr", help="Sender address, e.g. no-reply@lorbeerkranz.xyz")

    return p.parse_args()


ESCAPE_HATCH_COMMANDS = {"reset-link", "set-password", "make-admin", "invite", "sessions", "verify-email"}


def _hatch_player(s, name: str):
    """The `(Player, Account)` whose login name is `name`, or None (the caller reports)."""
    from app.models import Player
    from app.services.accounts import find_account_by_name

    account = find_account_by_name(s, name)
    player = s.get(Player, int(account.player_id)) if account is not None else None
    return (player, account) if player is not None else (None, None)


def _run_escape_hatch(args, settings) -> int:
    """The five escape-hatch commands. Returns the exit code: 0 done, 1 refused."""
    import datetime as dt
    import getpass

    from fastapi import HTTPException

    from app.models import AuthSession
    from app.services.accounts import set_password as store_password
    from app.services.groups import group_by_slug
    from app.services.invites import create_invite
    from app.services.passwords import hasher_for
    from app.services.reset_links import create_reset, reset_url
    from app.services.sessions import list_sessions, revoke_all_sessions

    with Session(get_engine()) as s:
        if args.cmd == "invite":
            group = group_by_slug(s, args.group)
            if group is None:
                print(f"invite: no group with the slug {args.group!r}", file=sys.stderr)
                return 1
            row, code = create_invite(s, group_id=int(group.id), created_by=None, note=args.note)
            s.commit()
            print(f"{code}  (group {group.slug}, single use, expires {row.expires_at.isoformat(timespec='minutes')} UTC)")
            return 0

        player, account = _hatch_player(s, args.player)
        if account is None:
            print(f"{args.cmd}: no account answers to {args.player!r}", file=sys.stderr)
            return 1
        who = f"{player.display_name} (id={player.id})"

        if args.cmd == "reset-link":
            row, token = create_reset(s, player_id=int(player.id), created_by=None)
            s.commit()
            print(f"{reset_url(args.origin or settings.auth_origin, token)}  ({who}, single use, expires {row.expires_at.isoformat(timespec='minutes')} UTC)")
            return 0

        if args.cmd == "set-password":
            if sys.stdin.isatty():
                first = getpass.getpass(f"New password for {player.display_name}: ")
                second = getpass.getpass("Again: ")
            else:  # piped (`docker compose exec -T`, a test): two lines on stdin, never echoed back
                first = sys.stdin.readline().rstrip("\r\n")
                second = sys.stdin.readline().rstrip("\r\n")
            if first != second:
                print("set-password: the two entries differ — nothing stored", file=sys.stderr)
                return 1
            try:
                store_password(s, account, first, hasher_for(settings.password_hash_profile), origin="set")
            except HTTPException as exc:
                print(f"set-password: {exc.detail} — nothing stored", file=sys.stderr)
                return 1
            s.commit()
            print(f"Password set for {who}; existing sessions stay signed in")
            return 0

        if args.cmd == "verify-email":
            from app.services.account_email import email_key, ensure_email_free, mark_verified_by_hand, validate_email

            try:
                email = validate_email(args.email)
                ensure_email_free(s, email_key(email), except_player_id=int(player.id))
            except HTTPException as exc:
                print(f"verify-email: {exc.detail} — nothing stored", file=sys.stderr)
                return 1
            previous = mark_verified_by_hand(s, account, email)
            s.commit()
            replaced = f" (replacing {previous}; no notice was sent)" if previous else ""
            print(f"Email {email} verified by hand for {who}{replaced}")
            return 0

        if args.cmd == "make-admin":
            account.site_admin = not args.revoke
            account.updated_at = dt.datetime.utcnow()
            s.add(account)
            s.commit()
            print(f"{who} is {'no longer' if args.revoke else 'now'} a site admin")
            return 0

        if args.cmd == "sessions":
            if args.revoke_all:
                n = revoke_all_sessions(s, int(player.id))
                s.commit()
                print(f"Revoked {n} session(s) of {who}")
                return 0
            rows: list[AuthSession] = list_sessions(s, int(player.id))
            print(f"{len(rows)} live session(s) of {who}")
            for row in rows:
                print(
                    f"  #{row.id}  {row.kind:<9} {row.device_label or '—':<20} "
                    f"last seen {row.last_seen_at.isoformat(timespec='minutes')}  from {row.ip or '?'}"
                )
            return 0

    raise AssertionError(f"unhandled escape-hatch command {args.cmd!r}")  # pragma: no cover


def _run_mail_test(args, settings) -> int:
    """`mail-test`: send one `test_message` and say what to read in Gmail. Exit 0 sent,
    1 refused or failed. Never prints the password or the message body."""
    import dataclasses
    import getpass

    from app.services.mail import MailNotConfigured, MailSendError, mail_transport_for
    from app.services.mail_texts import test_message
    from app.settings import AuthConfigError, assert_auth_config_safe

    if args.host:
        if sys.stdin.isatty():
            password = getpass.getpass(f"SMTP password for {args.user or '(no --user)'}: ")
        else:  # piped: one line on stdin, never echoed back
            password = sys.stdin.readline().rstrip("\r\n")
        settings = dataclasses.replace(
            settings,
            smtp_host=str(args.host).strip().lower(),
            smtp_port=int(args.port or 465),
            smtp_user=str(args.user or "").strip(),
            smtp_pass=password,
            smtp_from=str(args.from_addr or "").strip(),
        )
    try:
        assert_auth_config_safe(settings)
    except AuthConfigError as exc:
        print(f"mail-test: refused — {exc}", file=sys.stderr)
        return 1
    transport = mail_transport_for(settings)
    print(f"Mail: {transport.description}")
    if not transport.configured:
        print("mail-test: this server has no way to send mail — nothing sent", file=sys.stderr)
        return 1
    to = str(args.to or "").strip()
    try:
        transport.send(test_message(to=to, description=transport.description))
    except (MailSendError, MailNotConfigured) as exc:
        print(f"mail-test: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(
        f"Sent to {to} via {transport.description}. Open it in Gmail → ⋮ → Show original and read the "
        "SPF, DKIM and DMARC lines: all three must say PASS (DMARC once its record is published)."
    )
    return 0


def _read_only_engine(db_path: Path):
    """A SQLAlchemy engine over `mode=ro` — the recovery command's precedent: nothing it
    runs can write, even by mistake."""
    from sqlalchemy import create_engine
    from sqlalchemy.pool import NullPool

    uri = f"file:{db_path}?mode=ro"
    return create_engine("sqlite://", creator=lambda: sqlite3.connect(uri, uri=True), poolclass=NullPool)


def _render_preflight(report, *, db_path: Path) -> str:
    lines = [f"Auth preflight against {db_path} (read-only, nothing written)", ""]
    lines.append(f"  group to create:            {'altherren' if report.groups_created else '— (exists)'}")
    lines.append(f"  memberships to create:      {report.memberships_created}")
    lines.append(
        f"  accounts with a password:   {report.accounts_migrated}"
        + (f"  ({', '.join(report.migrated_names)})" if report.migrated_names else "")
    )
    lines.append(f"  accounts without a password: {report.accounts_created - report.accounts_migrated}")
    lines.append(
        f"  owners (site admins):       {report.owners_promoted}"
        + (f"  ({', '.join(report.admin_names)})" if report.admin_names else "")
    )
    backfill = ", ".join(f"{t}={n}" for t, n in report.backfilled.items()) or "—"
    lines.append(f"  group_id backfill:          {backfill}")
    for name in report.duplicate_entries:
        lines.append(f"  note: player_accounts entry {name!r} repeats an earlier name; the first one wins")
    if report.accounts_with_password_after == 0:
        lines.append("  WARNING: no account would have a password afterwards — nobody could log in with one.")
    lines.append("")
    if report.unmatched_names:
        lines.append("PROBLEM: player_accounts names that match no player (they would be skipped):")
        lines.extend(f"  - {name}" for name in report.unmatched_names)
    if report.case_collisions:
        lines.append("PROBLEM: players whose names differ only in case (the backend would refuse to boot):")
        lines.extend(f"  - {' / '.join(names)}" for names in report.case_collisions)
    lines.append("RESULT: " + ("FAIL" if report.problems else "OK"))
    return "\n".join(lines)


def main() -> None:
    args = parse_args()

    settings = load_settings(
        secrets_path=args.secrets,
        db_url=args.db_url,
        log_level=args.log_level,
    )
    setup_logging(settings.log_level)
    log = logging.getLogger(__name__)

    db_commands = {"seed", "add-match", "vacuum-db"}
    # The recovery command reads the target DB through a read-only sqlite connection for
    # its report; only --apply needs a configured engine (and `init_db`'s seeding).
    if args.cmd == "recover-club-star-history" and args.apply:
        db_commands = db_commands | {args.cmd}
    if args.cmd in db_commands:
        configure_db(settings.db_url)
        init_db(settings)

    if args.cmd == "mail-test":
        raise SystemExit(_run_mail_test(args, settings))

    if args.cmd in ESCAPE_HATCH_COMMANDS:
        configure_db(settings.db_url)
        raise SystemExit(_run_escape_hatch(args, settings))

    if args.cmd == "auth-preflight":
        from app.services.auth_migration import migrate_from_settings

        db_path = _sqlite_path_from_settings(settings.db_url)
        if db_path is None or not db_path.is_file():
            raise RuntimeError(f"auth-preflight needs an existing SQLite file; db_url={settings.db_url!r}")
        engine = _read_only_engine(db_path)
        try:
            report = migrate_from_settings(engine, settings, dry_run=True)
        finally:
            engine.dispose()
        print(_render_preflight(report, db_path=db_path))
        raise SystemExit(1 if report.problems else 0)

    if args.cmd == "seed":
        data = load_seed_file(args.file)
        from app.db import get_session

        # get_session() yields a Session; easiest is to open one directly:
        # (we keep it explicit and simple)
        with Session(get_engine()) as s:
            res = seed_from_json(s, data)
        log.info("Seed complete: %s", res)

    if args.cmd == "add-match":
        data = load_seed_file(args.file)
        from app.db import get_session
        from app.services.record_holders import after_result_change
        with Session(get_engine()) as s:
            res = insert_match(s, data)
            # The one write that never goes through HTTP. There is no request and so no
            # dispatcher: nobody is pushed, but the holder table stays in step with the
            # results, which is the half that must not drift (M2).
            moves = after_result_change(None, s, tournament_id=int(res.tournament_id), reason="cli")
        log.info("Add match complete: %s", res)
        for move in moves:
            log.info("Record moved: %s gained=%s lost=%s", move.key, list(move.gained), list(move.lost))

    if args.cmd == "recover-club-star-history":
        from app.tools.recover_club_star_history import (
            apply_recovery,
            build_recovery,
            check_target,
            measure_impact,
            render_report,
        )

        root = _abs_path(args.path)
        target_db = _sqlite_path_from_settings(settings.db_url)
        if target_db is None or not target_db.is_file():
            raise RuntimeError(f"Target SQLite database not found for db_url={settings.db_url!r}")

        rec = build_recovery(root)
        missing, mismatched = check_target(target_db, rec)
        impacts, sides_total = measure_impact(target_db, rec.changes)

        applied = None
        if args.apply:
            known = {cid for cid, _name in _read_target_club_ids(target_db)}
            with Session(get_engine()) as s:
                applied = apply_recovery(s, rec, known_club_ids=known)

        print(
            render_report(
                rec,
                root=root,
                impacts=impacts,
                sides_total=sides_total,
                missing=missing,
                mismatched=mismatched,
                applied=applied,
            )
        )

    if args.cmd == "vacuum-db":
        engine = get_engine()
        url = str(engine.url)
        if not url.startswith("sqlite"):
            raise RuntimeError("vacuum-db is only supported for SQLite databases")

        db_path = getattr(engine.url, "database", None)
        before_size = None
        after_size = None
        if db_path and db_path not in (":memory:", ""):
            p = Path(db_path)
            if p.exists() and p.is_file():
                before_size = p.stat().st_size

        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.exec_driver_sql("VACUUM")
            if args.analyze:
                conn.exec_driver_sql("ANALYZE")

        if db_path and db_path not in (":memory:", ""):
            p = Path(db_path)
            if p.exists() and p.is_file():
                after_size = p.stat().st_size

        if before_size is not None and after_size is not None:
            log.info("VACUUM complete: %s bytes -> %s bytes", before_size, after_size)
        else:
            log.info("VACUUM complete")
        if args.analyze:
            log.info("ANALYZE complete")

    if args.cmd == "generate-vapid":
        out_path = Path(args.private_key_out)
        if out_path.exists() and not args.force:
            raise RuntimeError(f"Refusing to overwrite existing file: {out_path}")
        out_path.parent.mkdir(parents=True, exist_ok=True)

        subprocess.run(
            [
                "openssl",
                "ecparam",
                "-name",
                "prime256v1",
                "-genkey",
                "-noout",
                "-out",
                str(out_path),
            ],
            check=True,
        )
        private_key_pem = out_path.read_text(encoding="utf-8").strip()
        public_key = derive_public_key_from_private_pem(private_key_pem)

        log.info("VAPID private key written to %s", out_path)
        print(f"push_vapid_public_key={public_key}")
        print(f"push_vapid_private_key_file={out_path}")
        print("push_vapid_subject=mailto:you@example.com")

    if args.cmd == "backup-local-data":
        _backup_local_data(
            settings,
            path=_abs_path(args.path),
            name=args.name,
            secrets_path=_abs_path(args.secrets),
            log=log,
        )

    if args.cmd == "backup-deploy-data":
        _backup_deploy_data(
            remote_root=str(args.remote_root),
            path=_abs_path(args.path),
            name=args.name,
            log=log,
        )

    if args.cmd == "sync-local-from-deploy":
        sync_name = str(args.name or datetime.utcnow().strftime("%Y%m%d-%H%M%S")).strip()
        local_snapshot = _backup_local_data(
            settings,
            path=_abs_path(args.local_path),
            name=f"{sync_name}-before-sync",
            secrets_path=_abs_path(args.secrets),
            log=log,
        )
        deploy_snapshot = _backup_deploy_data(
            remote_root=str(args.remote_root),
            path=_abs_path(args.deploy_path),
            name=f"{sync_name}-deploy",
            log=log,
        )
        _sync_local_from_snapshot(deploy_snapshot, settings=settings, log=log)
        log.info("Local sync complete. Local backup: %s | Deploy snapshot: %s", local_snapshot, deploy_snapshot)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
