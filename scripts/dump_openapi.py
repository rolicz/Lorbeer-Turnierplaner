#!/usr/bin/env python3
"""
Dump the FastAPI OpenAPI schema to stdout as JSON.
No server required — imports the app directly.

Usage (from repo root):
    PYTHONPATH=backend backend/.venv/bin/python scripts/dump_openapi.py > /tmp/openapi.json
"""
import json
import os
import tempfile

os.environ.setdefault("UPLOADS_DIR", tempfile.mkdtemp())

from app.main import create_app
from app.settings import Settings

app = create_app(
    Settings(
        db_url="sqlite://",
        player_accounts=(),
        log_level="ERROR",
        app_env="test",
    )
)

print(json.dumps(app.openapi(), indent=2))
