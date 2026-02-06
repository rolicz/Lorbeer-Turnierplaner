# Gemini CLI Project Overview - EA FC Tournament Planner

This document provides a comprehensive overview of the "EA FC Tournament Planner" project, designed to serve as an instructional context for the Gemini CLI agent.

## Project Overview

The EA FC Tournament Planner is a monorepo application for managing small EA FC tournaments. It supports 1v1 and 2v2 formats, generates fixtures, allows live result entry, club assignment per match, and maintains tournament history. The application is designed to be responsive and work well on both mobile and desktop devices.

The project is structured into three main parts:
*   `backend/`: A FastAPI application providing the API and WebSocket services.
*   `frontend/`: A React application built with Vite and Tailwind CSS for the user interface.
*   `deploy/`: Contains Caddy reverse proxy configuration for production deployment.

## Technologies Used

*   **Backend:** FastAPI, SQLModel (SQLite), JWT authentication, WebSockets (Python).
*   **Frontend:** React, Vite, Tailwind CSS (TypeScript/JavaScript).
*   **Deployment:** Docker, Docker Compose, Caddy.

## Key Features

*   **Tournament Creation:** Supports 1v1 and 2v2 round-robin style tournaments for small groups.
*   **Live Match Editing:** Allows editing of goals, match state, and club assignments per match side.
*   **Match Management:** Features for second leg matches (all-or-none) and reordering matches.
*   **User Roles:** Implements Reader (read-only), Editor (normal operations), and Admin (advanced operations) roles.
*   **Live Updates:** Provides real-time updates via WebSockets.
*   **Challenge Cup Tracking:** Tracks current owner and history based on finished tournaments.

## Local Development

### Backend Setup

1.  Navigate to the backend directory: `cd backend`
2.  Create a Python virtual environment: `python3 -m venv .venv`
3.  Activate the virtual environment (if needed, depends on your shell): `source .venv/bin/activate`
4.  Install dependencies: `./.venv/bin/python -m pip install -r requirements.txt`
5.  **Configuration:** Create `backend/secrets.json` (do not commit) with the following structure.
    ```json
    {
      "db_url": "sqlite:////data/app.db",
      "editor_password": "change-me-editor",
      "admin_password": "change-me-admin",
      "jwt_secret": "dev-change-me",
      "log_level": "INFO"
    }
    ```
    **Note:** For local development without Docker, `db_url` can be `sqlite:///./app.db` or a full path like `sqlite:////tmp/app.db`. The `/data/app.db` path is primarily for Docker persistence.
6.  Run the backend locally (default: `http://127.0.0.1:8001`): `make run`
7.  Run the backend for LAN access: `make run-lan`
8.  API documentation will be available at: `http://127.0.0.1:8001/docs`

### Frontend Setup

1.  Navigate to the frontend directory: `cd frontend`
2.  Install dependencies: `npm install`
3.  **Configuration:** Create `frontend/.env.local` for local development (do not commit) with the following content:
    ```env
    VITE_API_BASE_URL=http://127.0.0.1:8001
    VITE_WS_BASE_URL=ws://127.0.0.1:8001
    ```
    For LAN development, replace `127.0.0.1` with your machine's LAN IP.
4.  Run the frontend locally (default: `http://127.0.0.1:8000`): `npm run dev -- --port 8000`
5.  Run the frontend for LAN access: `npm run dev -- --host 0.0.0.0 --port 8000`

## Docker Deployment

The project can be deployed using Docker Compose with three containers: `frontend`, `backend`, and `caddy`.

1.  **Prerequisites:**
    *   Configure DNS A records for your domain (e.g., `lorbeerkranz.xyz`) to point to your server's IPv4.
    *   Ensure ports TCP 80 and 443 are open on your server's firewall.
2.  **Persist SQLite Database:**
    *   Create a directory for database persistence: `mkdir -p backend/data`
    *   Ensure your `docker-compose.yml` includes appropriate volume mounts for `backend/data` and `backend/secrets.json`.
3.  **Caddyfile:** Place your Caddy configuration in `deploy/Caddyfile`.
4.  **Build and Run:** From the project root, run: `docker compose up -d --build`
5.  **Logging and Debugging:**
    *   View running services: `docker compose ps`
    *   Follow logs: `docker compose logs -f` (or specify services like `docker compose logs -f backend`)
    *   Restart a service: `docker compose restart backend`
    *   Rebuild a service after changes: `docker compose up -d --build backend`

## Authentication & Roles

*   **Reader:** Read-only access, no login required.
*   **Editor:** Allows normal write operations (e.g., entering results, managing clubs, reordering matches).
*   **Admin:** Provides advanced operations (e.g., creating/renaming players, deleting tournaments, editing past data).

Login is performed by `POST`ing credentials to `/auth/login`. The response includes a JWT token, which should be sent in subsequent requests via the `Authorization: Bearer <token>` header.

## Testing

Backend tests can be executed by navigating to the `backend` directory and running: `make test`

## Configuration Notes

*   **Backend `secrets.json`:** This file is required and should *not* be committed to version control. It contains sensitive information like database URL, passwords, and JWT secret.
*   **Frontend `.env`:** Vite environment variables are build-time. Changes to `frontend/.env.production` require rebuilding the frontend Docker image.
*   **Database URL:** For local development, consider `sqlite:///./app.db` in `secrets.json`. The `/data/app.db` path is specifically for Docker volume persistence.
