# Local server setup (3 minutes)

This guide walks through the simplest way to run WordSquad locally. It assumes macOS, Linux, or WSL.

## 1) Install prerequisites

- Python **3.12+**
- Node.js **20+**

Tip: `python3 --version` and `node --version` should both succeed.

## 2) Install backend dependencies

From the repository root:

```bash
python -m pip install -r backend/requirements.txt
```

## 3) Validate your environment

Run the lightweight checker:

```bash
./scripts/setup.sh
```

It verifies Python, Node, and the required asset files. It will print warnings if any Python packages are missing.

## 4) Start the game server

```bash
python backend/server.py
```

Then open <http://localhost:5001> in your browser. You can create a lobby, share the six-character code with friends, and start playing immediately.

## 5) Optional: use Docker instead

If you prefer containers:

```bash
docker compose up --build
```

The compose setup hot-reloads backend code and mounts the frontend so changes are reflected without a rebuild. Stop it anytime with `docker compose down`.

## Configuration quick reference

- `GAME_FILE` — path for storing lobby state (defaults to `data/game_persist.json`).
- `REDIS_URL` — use Redis for state instead of the local JSON file.
- `WORD_LIST_PATH` — override the default word list (`data/sgb-words.txt`).
- `DEFN_CACHE_PATH` — override offline definitions (`data/offline_definitions.json`).

These environment variables can be set before launching the server, e.g.:

```bash
GAME_FILE=/tmp/ws-game.json python backend/server.py
```
