import argparse
import json
import logging
import os
import shlex
import shutil
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

    return p.parse_args()


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
    if args.cmd in db_commands:
        configure_db(settings.db_url)
        init_db()

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
        with Session(get_engine()) as s:
            res = insert_match(s, data)
        log.info("Add match complete: %s", res)

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
