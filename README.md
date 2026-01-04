# WordSquad

> Multiplayer Wordle-style puzzling with chat, emoji leaderboards, and mobile-friendly controls.

WordSquad is a Flask API (`backend/`) plus a static frontend (`frontend/`). Each six-character lobby keeps its own guesses, chat, and scoreboard. Use the short steps below or jump to [ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deeper view.

## Quick start

1) Install prerequisites: **Python 3.12+** and **Node 20+**.
2) Install dependencies and validate your setup:
```bash
python -m pip install -r backend/requirements.txt
./scripts/setup.sh
```
3) Run the server and open the game:
```bash
python backend/server.py
# visit http://localhost:5001
```

Prefer containers? `docker compose up --build` works from the repo root.

## Highlights

- Realtime multiplayer with SSE updates, emoji leaderboards, chat, and history.
- Hard mode, Daily Double bonuses, hint badges, and “close call” notifications.
- Responsive layout for phones, tablets, and desktops with on-screen + physical keyboard support.
- Word definitions shown after each round so everyone can learn the solution.

## Where things live

- `backend/server.py` — Flask API and SSE stream
- `frontend/index.html` / `frontend/game.html` — landing page and game client
- `frontend/static/js/` — modular client logic
- `frontend/static/css/` — theme and layout styles
- `data/` — word list and offline definitions cache
- `docs/` — architecture, requirements, and deployment guides

## Local development essentials

- **Default run:** `python backend/server.py` serves everything on port **5001**. The server finds assets relative to `server.py`.
- **Config knobs:**
  - `GAME_FILE` to change where lobby state is stored (defaults to `data/game_persist.json`).
  - `REDIS_URL` to persist state in Redis instead of a local JSON file.
  - `WORD_LIST_PATH` and `DEFN_CACHE_PATH` to override the default word list and offline definitions.
- **Frontend tweaks:** Editing files in `frontend/static` requires no build. Running `npm run build` inside `frontend/` copies optimized assets into `backend/static` for production use.

## Docker workflow

```bash
docker compose up --build
# or
./scripts/start_docker.sh
```

Compose hot-reloads backend changes and mounts `frontend/` so unbuilt assets are available during development. Stop everything with `docker compose down`.

## Tests

- Python suite: `python -m pytest -v`
- Playwright/Cypress end-to-end tests auto-run when their browsers are installed (skipped otherwise). Node 20+ is required for the frontend-side helpers.

## Scoring cheat sheet

- Lobby-wide points: Scrabble-style values (full for green letters, half for yellow until upgraded).
- Bonuses: **+3** for solving the word.
- Penalties: **-3** for an incorrect final-row guess, **-1** for repeating a guess that adds no info.
- The in-game ℹ️ popup always shows the current rules.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — how data and requests flow
- [REQUIREMENTS.md](docs/REQUIREMENTS.md) — detailed feature specs and layout notes
- [LOCAL_SERVER_SETUP.md](docs/LOCAL_SERVER_SETUP.md) — copy/paste setup guide with common fixes
- [DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md) — Terraform-based deployment steps
