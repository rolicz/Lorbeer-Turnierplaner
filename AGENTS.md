# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: FastAPI + SQLModel API, auth, websocket, and scheduling logic. Entrypoint is `backend/app/main.py`.
- `backend/tests/`: pytest suite, files named `test_*.py`.
- `frontend/`: React + Vite + Tailwind UI in `frontend/src/`, static assets in `frontend/public/`.
- `deploy/`: Caddy reverse-proxy config for production.
- Root `docker-compose.yml` wires frontend, backend, and caddy for production.

## Build, Test, and Development Commands
- `make backend`: run the API locally on `127.0.0.1:8001`.
- `make backend-lan`: run the API on `0.0.0.0:8001` for LAN access.
- `make frontend`: run the Vite dev server on `:8000`.
- `make frontend-lan`: run the Vite dev server on `0.0.0.0:8000`.
- `make dev`: run backend + frontend together (Linux/macOS).
- `make test`: run backend tests (pytest).
- Frontend checks: `npm run check` (typecheck + eslint), `npm run build` (tsc + Vite build).

## Coding Style & Naming Conventions
- Match surrounding style in each file; avoid large reformatting-only changes.
- Python: use snake_case for functions/vars; keep imports grouped and ordered.
- TypeScript/React: use camelCase for functions/vars, PascalCase for components.
- Keep modules small and focused; prefer colocated helpers in `frontend/src/` or `backend/app/`.

## Testing Guidelines
- Backend tests live in `backend/tests/` and use pytest (`test_*.py` naming).
- Run tests with `make test` from repo root or `make test` inside `backend/`.
- No frontend test runner is configured; ensure UI changes are manually verified.

## Commit & Pull Request Guidelines
- Recent commits are short, lowercase phrases (e.g., “minor optic changes”); follow that tone.
- PRs should include: a brief summary, testing notes (commands run), and screenshots for UI changes.
- Link relevant issues or describe the user-facing impact if no issue exists.

## Configuration & Secrets
- Backend requires `backend/secrets.json` (see `README.md` for template). Do not commit secrets.
- Frontend uses Vite build-time envs; local dev uses `frontend/.env.local`.
