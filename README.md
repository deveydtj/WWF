# WordSquad

> Multiplayer Wordle-style puzzling with chat, emoji leaderboards, and mobile-friendly controls.

WordSquad combines a Flask API with a vanilla JavaScript frontend bundled by Vite. Players share a six-guess board, chat in real time, and compete on an emoji leaderboard. Play in an open lobby with a shareable code or a private room with invitations and host approval.

## Quick start

Install **Python 3.12+** and **Node.js 22.12+** (or 20.19+ on Node 20, as required by the bundled Vite version). From the repository root on macOS, Linux, or WSL:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm install
./scripts/setup.sh
npm run build
python backend/server.py
```

Open <http://localhost:5001>. Complete the age check, choose an avatar, and create or join a room. Press **Control-C** in the terminal to stop the server. The setup script checks prerequisites; it does not install dependencies or build the frontend.

After setup, macOS users can double-click **Start WordSquad.command** to start the server and open the landing page. It uses `.venv` when available. **Start LAN Server.command** also rebuilds the frontend when dependencies are installed and prints the address for phones and other devices on the same Wi-Fi.

## Playing together

- **Open lobbies:** Share the six-character code or lobby link. Players on the same network can also discover open lobbies from the landing page.
- **Private rooms:** Choose **Private** before creating a room. Open the lock button, choose **Replace & copy invitation**, and send the link to friends. Guests request admission and the host approves them. Private rooms stay out of lobby discovery; a room code alone grants no access. Invitations expire after one hour, and replacing one invalidates the previous invitation.

Private rooms retain membership across refreshes, support admission locking and kicking, and close when the host leaves. See [Private rooms and streamer mode](docs/PRIVATE_ROOMS.md) for session limits, storage, and recovery behavior.

## Highlights

- Realtime multiplayer with SSE updates, emoji leaderboards, chat, and history.
- Hard mode, Daily Double bonuses, hint badges, and “close call” notifications.
- Squad votes to reset an unfinished round and host controls for starting the next word.
- Responsive layout for phones, tablets, and desktops with on-screen + physical keyboard support.
- Optional keyboard and action haptics on compatible touch browsers, controlled separately from sound. iPhone Safari does not support custom vibration, so its Haptics control stays hidden.
- Word definitions shown after each round so everyone can learn the solution.

## Where things live

- `backend/server.py` — Flask API and SSE stream
- `backend/private_rooms.py` — private admission, membership, and shared state
- `backend/game_logic.py` / `backend/models.py` — word handling and game state
- `frontend/index.html` / `frontend/game.html` — landing page and game client
- `frontend/join.html` / `frontend/age-check.html` — invitation and age screens
- `frontend/static/js/` — modular client logic
- `frontend/static/css/` — theme and layout styles
- `frontend/dist/` / `backend/static/` — generated frontend builds
- `data/` — word list and offline definitions cache
- `tests/` / `tests/playwright/` — Python and browser tests
- `infra/terraform/` — AWS infrastructure
- `docs/` — architecture, requirements, and deployment guides

## Local development

`python backend/server.py` serves the frontend and API together on port **5001**, including access from other devices on your network. Restart it after backend changes, or use Flask's development reloader:

```bash
python -m flask --app backend.server run --reload --host=0.0.0.0 --port=5001
```

Flask prefers built HTML and assets in `backend/static/`, falling back to `frontend/` when the corresponding built files are absent. After frontend edits, run `npm run build` from the repository root and refresh the browser. The build writes `frontend/dist/` and replaces the generated copy in `backend/static/`; edit the sources in `frontend/`.

### Configuration

Set environment variables before starting the server. File defaults below are relative to the repository root.

| Variable | Purpose / default |
| --- | --- |
| `GAME_FILE` | Default public game's state: `game_persist.json` |
| `LOBBIES_FILE` | Other open lobbies: `lobbies.json` |
| `PRIVATE_ROOMS_FILE` | Private-room state in local development: `runtime/private-rooms.json` |
| `REDIS_URL` | Optional Redis persistence locally; authenticated TLS Redis (`rediss://`) is required for production private rooms |
| `WORD_LIST_PATH` | Word list: `data/sgb-words.txt` |
| `DEFN_CACHE_PATH` | Offline definitions: `data/offline_definitions.json` |
| `SECRET_KEY` | Session signing key; generated on startup locally when unset; production requires a random key of at least 32 characters |
| `PUBLIC_ORIGIN` | Exact HTTPS origin required for production private rooms, without a trailing slash |
| `OPERATOR_TOKEN` | Dedicated bearer credential for maintenance endpoints; requests are denied when unset |

Local play needs no Redis or AWS account. Production private rooms deny access if Redis is unavailable. Public lobby state still uses process-local memory, so configuring Redis does not make public games coherent across multiple workers.

### Age eligibility

Multiplayer and chat require a neutral age check before registration. Ages 13+ can participate. Only the eligibility result and check time are held in a signed, HttpOnly browser-session cookie; the submitted age is not retained. An under-13 answer blocks participation, with an option to correct the answer. Allowed sessions require a new check after 12 hours. Public home/how-to content remains available. See [COPPA readiness](docs/COPPA_READINESS.md) for the remaining privacy work.

## Docker workflow

Build the frontend first: the Compose Dockerfile requires `frontend/dist/`.

```bash
npm install
npm run build
docker compose up --build
```

Open <http://localhost:5001>. Compose reloads backend changes and mounts `frontend/`, `backend/`, and `runtime/`; public state is stored under `runtime/` in this workflow. Frontend changes still need `npm run build`. Stop everything with `docker compose down`.

The legacy `scripts/start_docker.sh` helper resets the checkout to the remote branch and deletes untracked files. Use the Compose commands above when keeping local work.

## Tests

Run from the repository root with the virtual environment active and npm dependencies installed:

```bash
python -m pytest -v
npm run lint:css
npm run build
```

Some Python tests invoke Node.js. Optional Python Playwright tests are skipped when that Python package is absent; it is not included in `backend/requirements.txt`.

Run JavaScript Playwright tests separately. For example, the theme startup checks use mocked routes and do not need a running server:

```bash
npx playwright install chromium
npx playwright test tests/playwright/theme-startup.spec.js --project=chromium
```

Private-room and age-eligibility browser tests require Google Chrome and an isolated Flask server selected with `WORDSQUAD_TEST_URL`. Use temporary state files for that server. See [private-room local verification](docs/PRIVATE_ROOMS.md#local-verification) for commands and the optional disposable Redis check.

## Scoring cheat sheet

- Letter discoveries are scored once across the whole lobby: Scrabble-style values, full for green letters and half for yellow, with the remaining half awarded on green.
- Bonuses: **+3** for solving the word.
- Penalties: **-3** for an incorrect final-row guess, **-1** for a non-final incorrect guess that earns no discovery points.
- The in-game ℹ️ popup always shows the current rules.

## Deployment

Terraform provisions an S3/CloudFront frontend and one EC2 API server that stops when idle and wakes on visits. The live configuration also runs authenticated TLS Redis on that server for private rooms. The first visitor after an idle shutdown may see the waking page while the API starts.

Production sets `FLASK_ENV=production` and injects `SECRET_KEY` through `session_secret_arn` from Secrets Manager or SSM. Private rooms also need `PUBLIC_ORIGIN`, Redis, and the appropriate secret ARNs. Follow the [deployment guide](docs/DEPLOY_GUIDE.md) and [infrastructure README](infra/terraform/README.md) for configuration, deployment scripts, and storage protections.

The operator details and privacy notice are temporarily deferred in live tfvars with `enforce_privacy_publication_gate = false`. The gate is enabled by default; this override does not mark the notice as reviewed or establish COPPA certification.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — how data and requests flow
- [REQUIREMENTS.md](docs/REQUIREMENTS.md) — detailed feature specs and layout notes
- [LOCAL_SERVER_SETUP.md](docs/LOCAL_SERVER_SETUP.md) — copy/paste setup guide with common fixes
- [DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md) — Terraform-based deployment steps
- [PRIVATE_ROOMS.md](docs/PRIVATE_ROOMS.md) — invitations, host controls, storage, and verification
- [COPPA_READINESS.md](docs/COPPA_READINESS.md) — age eligibility and remaining privacy requirements
- [Infrastructure README](infra/terraform/README.md) — sleep/wake behavior, Redis, and operations
