# WordSquad

WordSquad is a small multiplayer adaptation of Wordle. The frontend lives under the
`frontend/` directory while `backend/server.py` provides a Flask API. The
server supports **multiple lobbies**, each identified by a six character code.
Every lobby maintains its own guesses, chat log and scoreboard while sharing
the same application code. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for a diagram
of the overall flow.

## Game Features

- **Emoji leaderboard:** choose a unique emoji to represent yourself and compete for the
  highest score.
- **Hard mode:** every guess must include letters and positions you have already
  discovered.
- **On‑screen and physical keyboard support** for desktop and mobile play.
- **History panel** showing guesses from the current and previous games.
- **Word definition popup** when a game ends so everyone can learn the meaning of the
  solution.
- **In-game chat box** so players can talk while solving the puzzle together.
- **Unique player IDs** allow multiple devices on the same IP to join without
  overwriting each other's emoji.
- **Dark mode toggle** and responsive layout for small screens.
- **Hold‑to‑reset button** (or instant reset once the game is over).
- **Inactive player detection** – entries on the leaderboard fade if a player has not
  acted for several minutes.
- **Info pop‑up** in the options menu explaining gameplay and scoring.
- **"Close call" notification** if another player submits the winning word within
  two seconds of your own guess.
- **Daily Double** bonus that awards a hidden letter when you uncover a special tile.
  The qualifying player may privately reveal one tile on the next row.
- **Hint badge** shows next to your emoji while a Daily Double hint is unused.
- **Accessible color contrast** ensures text is readable in light and dark modes.

## Requirements

- Python **3.12.x**
- Node.js **20.x**
- [Flask](https://flask.palletsprojects.com/)
- [Flask-Cors](https://flask-cors.readthedocs.io/)

Install the dependencies with pip:

```bash
pip install Flask Flask-Cors
```

Run `./setup.sh` to verify that Python, Node.js and required assets are present
before starting development.

## Running the server

From the project root, run:

```bash
python backend/server.py
```
Detailed steps for verifying dependencies and running the server are provided in
[LOCAL_SERVER_SETUP.md](docs/LOCAL_SERVER_SETUP.md).

The server now locates its frontend and data files relative to `server.py`,
so you can run it from any directory.

The server loads its words from `data/sgb-words.txt` and stores state in
`game_persist.json` by default. Set the `GAME_FILE` environment variable to
override this path or configure `REDIS_URL` to persist state in Redis instead.
It listens on port `5001`, so open
`http://localhost:5001` in your browser to start playing.
The API attempts to fetch word definitions from dictionaryapi.dev. If that fails
or the network is unavailable, definitions are loaded from
`data/offline_definitions.json`.

Each lobby exposes a set of REST endpoints under `/lobby/<id>`:

- `GET /lobby/<id>/state` – retrieve the latest state
- `POST /lobby/<id>/state` – heartbeat to mark the player active
- `POST /lobby/<id>/emoji` – claim or change an emoji
- `POST /lobby/<id>/guess` – submit a word
- `POST /lobby/<id>/reset` – start a new round (host token required)
- `POST /lobby/<id>/kick` – remove a player from the lobby (host token required)
- `GET /lobby/<id>/stream` – Server‑Sent Events channel

`POST /emoji` responds with a `player_id` that uniquely identifies the browser.
Include this id with all subsequent requests so multiple players on the same IP
can join concurrently.

The SSE stream pushes state updates in real time. The client falls back to
polling these endpoints if the stream disconnects.

## Point System

Points are shared across all players on the leaderboard. Letter discoveries are
valued using traditional Scrabble tile scores. A green letter awards its full
value. A yellow letter grants **half** its value, with the remaining half paid
out if that letter later turns green. The standard bonuses and penalties still
apply:

- **+3** bonus for guessing the correct word.
- **-3** penalty if your final guess is wrong when the board is full.
- **-1** penalty for repeating a guess that adds no new letters.

You can view these rules at any time in-game by opening the ℹ️ info pop-up from
the options menu.

## Testing

Run the test suite from the repository root. Ensure Pytest and Node.js are
installed (`pip install pytest` and `node --version` should succeed). Cypress
requires an Xvfb display server when running headless and Terraform 1.4 or
newer must also be available. Once these dependencies are installed, run:

```bash
python -m pytest -v
```
Some frontend tests execute small Node.js scripts, so a recent Node installation
is required for the full suite to run successfully.
An optional end-to-end test using Playwright will run if the `playwright`
package and browsers are installed. It checks lobby creation through automatic
expiration.

## Repository layout

- `backend/server.py` – Flask backend
- `frontend/index.html` – landing page served from `/`
- `frontend/game.html` – main game client
- `frontend/static/css/theme.css` – color theme styles
- `frontend/static/css/layout.css` – layout and responsive rules
- `data/sgb-words.txt` – word list used by the game
- `frontend/static/js/` – modular JavaScript loaded by `index.html`
- `data/offline_definitions.json` – fallback word definitions
- `docs/` – project documentation including architecture and deployment guides
- `package.json` – Node settings used by frontend tests
- `frontend/landing.js` and `frontend/landing.css` – landing page assets

## Layout Modes

The client adjusts its interface based on viewport width:

- **Light Mode** – up to **600px** wide. The layout stacks vertically with large touch areas and panels sliding up from the bottom.
- **Medium Mode** – widths between **601px** and **900px**. Panels sit beside the board but use narrower widths and slightly smaller tiles.
- **Full Mode** – wider than **900px**. The game uses the largest tile and panel sizes and displays the richest interface.

The mode updates automatically on window resize or device orientation changes.


## Landing Page

The home page served at `/` is the starting point for all players. It mirrors the neumorphic style of the game board and stores your dark-mode setting, chosen emoji, and most recent lobby code in `localStorage`. See [LANDING_PAGE_REQUIREMENTS.md](docs/LANDING_PAGE_REQUIREMENTS.md) for the full specification. Key pieces include:

- A sticky header with theme toggle plus Help and GitHub links.
- A hero card with **Create Lobby**, **Join Lobby**, **Quick Play**, and a re-join chip when available.
- Feature highlight cards for emoji avatars, Daily Double bonuses, and real-time chat.
- A collapsible **How to Play** accordion.
- A simple footer noting the project is not affiliated with Wordle.

`landing.js` manages form validation, fetch calls, and preference storage while `landing.css` defines layout and neumorphic styling.


## Docker

Ensure [Docker Desktop](https://www.docker.com/products/docker-desktop) is installed.
Build and start the full stack with:

```bash
docker compose up --build
```

Stop the containers with `docker compose down`.

The compose file mounts your `backend/` directory so changes trigger a reload.
It also mounts the `frontend/` folder to `/app/frontend` so the server can
fall back to unbuilt assets during development. The `data/` folder is mounted
read-only so the default word list and definitions cache are always
available.

Environment variables such as `FLASK_ENV` and `VITE_API_URL` can be set in the
compose file or a `.env` file.

### Building the frontend locally

If you change the UI outside of Docker you must rebuild the assets before
starting Compose. The postbuild script automatically copies the files into
`backend/static`:

```bash
cd frontend && npm ci && npm run build && cd ..
```

The backend volume mount overrides the image's bundled assets, so copying the
`dist` output ensures the container serves your latest build. If `backend/static`
is empty the server automatically falls back to the mounted `frontend/`
directory, which is convenient for rapid development.

## Asset configuration

Two additional environment variables control where the server loads its words
and offline definition cache:

- `WORD_LIST_PATH` – path to the text file containing the allowed five-letter
  words. Defaults to `data/sgb-words.txt`.
- `DEFN_CACHE_PATH` – path to the JSON file of offline definitions. Defaults to
  `data/offline_definitions.json`.

The paths are resolved at startup. If the word list cannot be read or is empty
the server logs `Startup abort: word list '<path>' contains no words` and exits.
Failure to parse the definitions file logs `Startup abort: could not parse
definitions file '<path>': <error>`.

Example override for staging:

```bash
docker run -e WORD_LIST_PATH=/opt/wwf/words.txt \
           -e DEFN_CACHE_PATH=/opt/wwf/defs.json wwf-image
```


## Local Development

Run the Flask API with the built frontend assets using Docker Compose:

```bash
docker compose up --build
```

Visit <http://localhost:5001> to use the app. AWS deployments use this same
configuration.

## Continuous Integration

All pushes and pull requests trigger the **CI/CD** workflow under
`.github/workflows/ci.yml`. The workflow installs Python and Node dependencies,
runs the Pytest suite and Cypress end-to-end tests, then builds the Docker image
and pushes it to Amazon ECR. When changes land on `main` the workflow also
invalidates the CloudFront cache so the latest frontend assets are served.

## Infrastructure as Code

Terraform templates in `infra/terraform` provision the AWS resources needed for
a production deployment. These include an S3 bucket for the static frontend,
CloudFront distribution with HTTPS via ACM, an Application Load Balancer, and an
ECS Fargate service running the Flask API. Set `enable_efs` to mount a shared
EFS volume and override the `GAME_FILE` path. Refer to the README in that
directory for usage instructions.

## Repository Practices

- Branch names follow the short `feat/*`, `fix/*`, or `docs/*` pattern.
- Pull requests must pass status checks for Pytest, Cypress, and `terraform plan` before merging to `main`.
- See [DEPLOY_GUIDE.md](docs/DEPLOY_GUIDE.md) for details on configuring deployment secrets and running Terraform. Further architectural details can be found in [ARCHITECTURE.md](docs/ARCHITECTURE.md).
