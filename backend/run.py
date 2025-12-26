import argparse
import uvicorn
from app.settings import load_settings

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="EA FC tournament backend")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8001)
    p.add_argument("--reload", action="store_true")
    p.add_argument("--secrets", default="./secrets.json")

    # Optional overrides (override secrets.json)
    p.add_argument("--db-url")
    p.add_argument("--admin-password")
    p.add_argument("--editor-password")
    p.add_argument("--jwt-secret")
    p.add_argument("--log-level")
    return p.parse_args()

def app_factory():
    # IMPORTANT: executed in uvicorn worker process (including reload)
    args = parse_args()
    settings = load_settings(
        secrets_path=args.secrets,
        db_url=args.db_url,
        admin_password=args.admin_password,
        editor_password=args.editor_password,
        jwt_secret=args.jwt_secret,
        log_level=args.log_level,
    )
    from app.main import create_app
    return create_app(settings)

def main() -> None:
    args = parse_args()
    uvicorn.run(
        "run:app_factory",
        host=args.host,
        port=args.port,
        reload=args.reload,
        factory=True,
        log_config=None,
    )

if __name__ == "__main__":
    main()
