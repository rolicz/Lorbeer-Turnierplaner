# EA FC Tournament Frontend

Responsive React + Vite + TypeScript frontend for the tournament backend.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Edit `.env` to point to your backend (API + WS).

## Pages

- `/tournaments` : list + create tournament (editor/admin)
- `/live/:id` : live tournament (read-only for everyone, edit match results if logged in)
- `/clubs` : manage clubs (editor/admin)
- `/admin/players` : manage players (admin)
- `/login` : password login to obtain JWT

## Notes

- Uses TanStack Query for caching/snappiness.
- Websocket invalidates cached tournament data for realtime updates.
