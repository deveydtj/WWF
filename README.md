# Wordle With Friends (WWF)

A small multiplayer adaptation of Wordle. The frontend lives under the
`frontend/` directory while `backend/server.py` provides a Flask API that keeps
track of guesses and scores.

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
- **Dark mode toggle** and responsive layout for small screens.
- **Hold‑to‑reset button** (or instant reset once the game is over).
- **Inactive player detection** – entries on the leaderboard fade if a player has not
  acted for several minutes.
- **Info pop‑up** in the options menu explaining gameplay and scoring.
- **"Close call" notification** if another player submits the winning word less than a
  second before you.

## Requirements

- Python 3.7 or newer
- [Flask](https://flask.palletsprojects.com/)
- [Flask-Cors](https://flask-cors.readthedocs.io/)

Install the dependencies with pip:

```bash
pip install Flask Flask-Cors
```

## Running the server

From the project root, run:

```bash
python backend/server.py
```

The server loads its words from `sgb-words.txt` and stores state in
`game_persist.json`. It listens on port `5001`, so open
`http://localhost:5001` in your browser to start playing.
The API attempts to fetch word definitions from dictionaryapi.dev. If that fails
or the network is unavailable, definitions are loaded from
`offline_definitions.json`.

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

Run the unit tests from the repository root. Make sure Pytest and Node.js are
installed (`pip install pytest` and `node --version` should succeed) and then
run:

```bash
python -m pytest -v
```
Some frontend tests execute small Node.js scripts, so a recent Node installation
is required for the full suite to run successfully.

## Repository layout

- `backend/server.py` – Flask backend
- `frontend/index.html` – browser client
- `frontend/static/css/theme.css` – color theme styles
- `frontend/static/css/layout.css` – layout and responsive rules
- `sgb-words.txt` – word list used by the game
- `frontend/static/js/` – modular JavaScript loaded by `index.html`
- `offline_definitions.json` – fallback word definitions
- `package.json` – Node settings used by frontend tests

## Layout Modes

The client adjusts its interface based on viewport width:

- **Light Mode** – up to **600px** wide. The layout stacks vertically with large touch areas and panels sliding up from the bottom.
- **Medium Mode** – widths between **601px** and **900px**. Panels sit beside the board but use narrower widths and slightly smaller tiles.
- **Full Mode** – wider than **900px**. The game uses the largest tile and panel sizes and displays the richest interface.

The mode updates automatically on window resize or device orientation changes.
