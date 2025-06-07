# Wordle With Friends (WWF)

A small multiplayer adaptation of Wordle. The frontend lives in `index.html` while
`server.py` provides a Flask API that keeps track of guesses and scores.

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
python server.py
```

The server loads its words from `sgb-words.txt` and stores state in
`game_persist.json`. It listens on port `5001`, so open
`http://localhost:5001` in your browser to start playing.

## Testing

Run the unit tests from the repository root. Make sure Pytest is installed
(``pip install pytest`` if needed) and then run:

```bash
python -m pytest -v
```

## Repository layout

- `server.py` – Flask backend
- `index.html` – browser client
- `sgb-words.txt` – word list used by the game
- `tests/` – Pytest suite
