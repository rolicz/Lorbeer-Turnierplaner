import os

DB_URL = os.getenv("DB_URL", "sqlite:///./app.db")

EDITOR_PASSWORD = os.getenv("EDITOR_PASSWORD", "change-me-editor")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-me-admin")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-change-me")
JWT_ALG = "HS256"

CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
