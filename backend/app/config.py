import os

DB_URL = os.getenv("DB_URL", "sqlite:///./app.db")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-change-me")
JWT_ALG = "HS256"

CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
