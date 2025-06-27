from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import random
import json
import os
import time
try:
    import requests as _requests
except ModuleNotFoundError:  # pragma: no cover - fallback when requests missing
    import urllib.request
    import urllib.error

    class _SimpleResponse:
        def __init__(self, data: str):
            self._data = data

        def raise_for_status(self) -> None:
            pass

        def json(self):
            return json.loads(self._data)

    class _RequestsShim:
        class RequestException(Exception):
            pass

        @staticmethod
        def get(url, headers=None, timeout=5):
            req = urllib.request.Request(url, headers=headers or {})
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return _SimpleResponse(resp.read().decode("utf-8"))
            except urllib.error.URLError as e:  # noqa: B904 - fallback shim
                raise _RequestsShim.RequestException(e) from e

    requests = _RequestsShim()
else:
    requests = _requests
import logging
import re

CLOSE_CALL_WINDOW = 2.0  # seconds
import html
import threading
import queue
from pathlib import Path

app = Flask(__name__)
app.secret_key = "a_wordle_secret"
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s:%(message)s")

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
WORDS_FILE = BASE_DIR / "sgb-words.txt"
GAME_FILE = BASE_DIR / "game_persist.json"
ANALYTICS_FILE = BASE_DIR / "analytics.log"
MAX_ROWS = 6

# Standard Scrabble letter values used for scoring
SCRABBLE_SCORES = {
    **{l: 1 for l in "aeilnorstu"},
    **{l: 2 for l in "dg"},
    **{l: 3 for l in "bcmp"},
    **{l: 4 for l in "fhvwy"},
    "k": 5,
    **{l: 8 for l in "jx"},
    **{l: 10 for l in "qz"},
}

# ---- Globals ----
WORDS = []
target_word = ""
guesses = []
is_over = False
winner_emoji = None

leaderboard = {}      # emoji: {ip, score, used_yellow, used_green, last_active}
ip_to_emoji = {}      # ip: emoji
found_greens = set()  # all letters found as green by anyone this game
found_yellows = set() # all letters found as yellow by anyone this game
past_games = []       # list of finished games’ guess lists
definition = None     # definition for the last solved word
last_word = None      # last completed word
last_definition = None  # definition of last completed word
win_timestamp = None   # timestamp when the winning guess was submitted
chat_messages = []     # list of chat messages
listeners = set()      # SSE client queues
emoji_lock = threading.Lock()  # guard emoji selection operations

# Daily Double state
daily_double_index = None  # board tile index (0-based) containing the bonus
daily_double_winners = set()  # emojis that triggered the bonus
daily_double_pending = {}  # emoji -> row index eligible for hint selection


def sanitize_definition(text: str) -> str:
    """Remove HTML tags and extra whitespace from a definition."""
    text = re.sub(r"<[^>]*>", "", text)
    text = html.unescape(text)
    return " ".join(text.split())


def _reset_state() -> None:
    """Initialize all persistent in-memory structures to defaults."""
    leaderboard.clear()
    ip_to_emoji.clear()
    global winner_emoji, target_word, is_over, definition
    global last_word, last_definition, win_timestamp
    global daily_double_index, daily_double_winners, daily_double_pending
    winner_emoji = None
    target_word = ""
    guesses.clear()
    is_over = False
    found_greens.clear()
    found_yellows.clear()
    past_games.clear()
    definition = None
    last_word = None
    last_definition = None
    win_timestamp = None
    chat_messages.clear()
    daily_double_index = None
    daily_double_winners.clear()
    daily_double_pending.clear()


def save_data():
    data = {
        "leaderboard": leaderboard,
        "ip_to_emoji": ip_to_emoji,
        "winner_emoji": winner_emoji,
        "target_word": target_word,
        "guesses": guesses,
        "is_over": is_over,
        "found_greens": list(found_greens),
        "found_yellows": list(found_yellows),
        "past_games": past_games,
        "definition": definition,
        "last_word": last_word,
        "last_definition": last_definition,
        "win_timestamp": win_timestamp,
        "chat_messages": chat_messages,
        "daily_double_index": daily_double_index,
        "daily_double_winners": list(daily_double_winners),
        "daily_double_pending": daily_double_pending
    }
    with open(GAME_FILE, "w") as f:
        json.dump(data, f)


def load_data():
    global WORDS, leaderboard, ip_to_emoji, winner_emoji
    global target_word, guesses, is_over, found_greens, found_yellows, past_games, definition
    global last_word, last_definition, win_timestamp, chat_messages
    global daily_double_index, daily_double_winners, daily_double_pending

    # Load word list
    with open(WORDS_FILE) as f:
        WORDS = [line.strip().lower() for line in f if len(line.strip()) == 5]

    if os.path.exists(GAME_FILE):
        with open(GAME_FILE) as f:
            try:
                data = json.load(f)
                leaderboard   = data.get("leaderboard", {})
                ip_to_emoji   = data.get("ip_to_emoji", {})
                winner_emoji  = data.get("winner_emoji")
                target_word   = data.get("target_word", "")
                guesses[:]    = data.get("guesses", [])
                is_over       = data.get("is_over", False)
                found_greens  = set(data.get("found_greens", []))
                found_yellows = set(data.get("found_yellows", []))
                past_games[:] = data.get("past_games", [])
                definition    = data.get("definition")
                last_word     = data.get("last_word")
                last_definition = data.get("last_definition")
                win_timestamp = data.get("win_timestamp")
                chat_messages[:] = data.get("chat_messages", [])
                daily_double_index = data.get("daily_double_index")
                daily_double_winners = set(data.get("daily_double_winners", []))
                daily_double_pending = data.get("daily_double_pending", {})
            except Exception:
                _reset_state()
    else:
        _reset_state()

# ---- Game Logic ----
def pick_new_word():
    """Choose a new target word and reset all in-memory game state."""
    global target_word, guesses, is_over, winner_emoji, found_greens, found_yellows, definition, win_timestamp
    global daily_double_index, daily_double_winners, daily_double_pending
    target_word = random.choice(WORDS)
    guesses.clear()
    is_over = False
    winner_emoji = None
    found_greens = set()
    found_yellows = set()
    definition = None
    win_timestamp = None
    daily_double_index = random.randint(0, (MAX_ROWS - 1) * 5 - 1)
    daily_double_winners.clear()
    daily_double_pending.clear()

def fetch_definition(word):
    """Look up a word's definition online with an offline JSON fallback."""
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0 "
            "Gecko/20100101 Firefox/109.0"
        )
    }
    logging.info(f"Fetching definition for '{word}'")
    try:
        logging.info(f"Trying online dictionary API for '{word}'")
        resp = requests.get(url, headers=headers, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and data:
            meanings = data[0].get("meanings")
            if meanings:
                defs = meanings[0].get("definitions")
                if defs:
                    definition = defs[0].get("definition")
                    if definition:
                        definition = sanitize_definition(definition)
                    logging.info(f"Online definition for '{word}': {definition}")
                    return definition
    except requests.RequestException as e:
        logging.info(f"Online lookup failed for '{word}': {e}. Trying offline cache.")
        try:
            with open("offline_definitions.json") as f:
                offline = json.load(f)
            definition = offline.get(word)
            if definition:
                definition = sanitize_definition(definition)
                logging.info(f"Offline definition for '{word}': {definition}")
            else:
                logging.info(f"No offline definition found for '{word}'")
            return definition
        except Exception as e2:
            logging.info(f"Offline lookup failed for '{word}': {e2}")
    except Exception as e:
        logging.info(f"Unexpected error fetching definition for '{word}': {e}")
    logging.info(f"No definition found for '{word}'")
    return None


def _definition_worker(word: str) -> None:
    """Background task to fetch a word's definition and persist it."""
    global definition, last_word, last_definition
    definition = fetch_definition(word)
    logging.info(
        f"Definition lookup complete for '{word}': {definition or 'None'}"
    )
    last_word = word
    last_definition = definition
    save_data()
    broadcast_state()


def start_definition_lookup(word: str) -> threading.Thread:
    """Start asynchronous definition lookup for the solved word."""
    t = threading.Thread(target=_definition_worker, args=(word,))
    t.daemon = True
    t.start()
    return t

def get_client_ip():
    """Return the client's IP address, accounting for proxies."""
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].split(',')[0]
    return request.remote_addr or "unknown"

def result_for_guess(guess, target):
    """Return Wordle-style feedback comparing a guess to the target."""
    result = ["absent"] * 5
    target_letters = list(target)
    for i in range(5):
        if guess[i] == target[i]:
            result[i] = "correct"
            target_letters[i] = None
    for i in range(5):
        if result[i] == "correct":
            continue
        if guess[i] in target_letters:
            result[i] = "present"
            target_letters[target_letters.index(guess[i])] = None
    return result

def get_required_letters_and_positions():
    """Aggregate hard mode constraints from prior guesses."""
    required_letters = set()
    green_positions = {}
    for g in guesses:
        for i, res in enumerate(g["result"]):
            if res == "correct":
                required_letters.add(g["guess"][i])
                green_positions[i] = g["guess"][i]
            elif res == "present":
                required_letters.add(g["guess"][i])
    return required_letters, green_positions

def validate_hard_mode(guess):
    """Check a guess against hard mode constraints."""
    required_letters, green_positions = get_required_letters_and_positions()
    for idx, ch in green_positions.items():
        if guess[idx] != ch:
            return False, f"Letter {ch.upper()} must be in position {idx+1}."
    if required_letters:
        if not all(l in guess for l in required_letters):
            missing = [l for l in required_letters if l not in guess]
            return False, f"Guess must contain letter(s): {', '.join(m.upper() for m in missing)}."
    return True, ""

def build_state_payload(emoji: str | None = None):
    """Assemble the full game state dictionary returned to clients.

    When ``emoji`` is provided, include a ``daily_double_available`` boolean
    indicating whether that player currently has an unused hint.
    """
    lb = [
        {
            "emoji": emoji,
            "score": leaderboard[emoji]["score"],
            "last_active": leaderboard[emoji].get("last_active", 0),
        }
        for emoji in leaderboard
    ]
    lb.sort(key=lambda e: e["score"], reverse=True)

    payload = {
        "guesses": guesses,
        "target_word": target_word if is_over else None,
        "is_over": is_over,
        "leaderboard": lb,
        "active_emojis": list(leaderboard.keys()),
        "winner_emoji": winner_emoji,
        "max_rows": MAX_ROWS,
        "past_games": past_games,
        "definition": definition if is_over else None,
        "last_word": last_word,
        "last_definition": last_definition,
        "chat_messages": chat_messages,
    }

    if emoji is not None:
        payload["daily_double_available"] = emoji in daily_double_pending

    return payload


def broadcast_state() -> None:
    """Send the latest game state to all connected SSE clients."""
    data = json.dumps(build_state_payload())
    for q in list(listeners):
        try:
            q.put_nowait(data)
        except Exception:
            listeners.discard(q)


def log_daily_double_used(emoji: str, ip: str) -> None:
    """Append a Daily Double usage event to the analytics log."""
    entry = {
        "event": "daily_double_used",
        "emoji": emoji,
        "ip": ip,
        "timestamp": time.time(),
    }
    try:
        with open(ANALYTICS_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:  # pragma: no cover - logging failures shouldn't break API
        logging.info(f"Failed to log analytics event: {e}")

# ---- API Routes ----

@app.route("/stream")
def stream():
    """Server-Sent Events endpoint for real-time updates."""
    from flask import Response

    q = queue.Queue()
    listeners.add(q)

    def gen():
        try:
            while True:
                data = q.get()
                yield f"data: {data}\n\n"
        finally:
            listeners.discard(q)

    return Response(gen(), mimetype="text/event-stream")

@app.route("/state", methods=["GET", "POST"])
def state():
    # ——— Heartbeat: bump AFK timestamp on every client poll ———
    emoji = None
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        e = data.get("emoji")
        if e and e in leaderboard:
            leaderboard[e]["last_active"] = time.time()
            save_data()
            emoji = e
    else:
        try:
            emoji = request.args.get("emoji")
        except Exception:
            emoji = None

    # Build and return current game state
    return jsonify(build_state_payload(emoji))

@app.route("/emoji", methods=["POST"])
def set_emoji():
    """Register or change the player's emoji avatar."""
    data = request.json or {}
    emoji = data.get("emoji")
    ip = get_client_ip()
    now = time.time()

    if not emoji or not isinstance(emoji, str):
        return jsonify({"status": "error", "msg": "Invalid emoji."}), 400

    with emoji_lock:
        if emoji in leaderboard and leaderboard[emoji]["ip"] != ip:
            return (
                jsonify({"status": "error", "msg": "That emoji is taken!"}),
                409,
            )

        prev_emoji = ip_to_emoji.get(ip)
        if prev_emoji and prev_emoji != emoji:
            # Move existing entry so score and history persist
            entry = leaderboard.pop(
                prev_emoji,
                {
                    "ip": ip,
                    "score": 0,
                    "used_yellow": [],
                    "used_green": [],
                    "last_active": now,
                },
            )
            leaderboard[emoji] = entry
        else:
            leaderboard.setdefault(
                emoji,
                {
                    "ip": ip,
                    "score": 0,
                    "used_yellow": [],
                    "used_green": [],
                    "last_active": now,
                },
            )
        leaderboard[emoji]["ip"] = ip
        leaderboard[emoji]["last_active"] = now
        ip_to_emoji[ip] = emoji
        save_data()
    broadcast_state()
    return jsonify({"status": "ok"})

@app.route("/guess", methods=["POST"])
def guess_word():
    """Process a player's guess and update scores and game state."""
    global is_over, winner_emoji, found_greens, found_yellows, definition
    global last_word, last_definition, win_timestamp
    data = request.json or {}
    guess = (data.get("guess") or "").strip().lower()
    # ▶ Prevent duplicates
    emoji = data.get("emoji")
    ip = get_client_ip()
    points_delta = 0
    now = time.time()

    if is_over:
        close_call = None
        if guess == target_word and win_timestamp and emoji != winner_emoji:
            diff = now - win_timestamp
            if diff <= CLOSE_CALL_WINDOW:
                close_call = {"delta_ms": int(diff * 1000), "winner": winner_emoji}
        resp = {"status": "error", "msg": "Game is over. Please reset."}
        if close_call:
            resp["close_call"] = close_call
        return jsonify(resp), 403
    if not guess or len(guess) != 5 or guess not in WORDS:
        return jsonify({"status": "error", "msg": "Not a valid 5-letter word."}), 400
    existing = [g["guess"] for g in guesses]
    if guess in existing:
        return jsonify(status="error", msg="You’ve already guessed that word."), 400
    if emoji not in leaderboard or leaderboard[emoji]["ip"] != ip:
        return jsonify({"status": "error", "msg": "Please pick an emoji before playing."}), 403

    leaderboard[emoji]["last_active"] = now

    ok, msg = validate_hard_mode(guess)
    if not ok:
        return jsonify({"status": "error", "msg": msg}), 400

    row_index = len(guesses)
    result = result_for_guess(guess, target_word)
    new_entry = {"guess": guess, "result": result, "emoji": emoji, "ts": now}
    already_guessed = any(g["guess"] == guess for g in guesses)
    guesses.append(new_entry)

    dd_award = False
    award_row = None
    award_col = None
    if daily_double_index is not None:
        dd_row = daily_double_index // 5
        dd_col = daily_double_index % 5
        if row_index == dd_row and result[dd_col] == "correct" and emoji not in daily_double_winners:
            daily_double_winners.add(emoji)
            daily_double_pending[emoji] = row_index + 1
            dd_award = True
            award_row = dd_row
            award_col = dd_col

    # Points logic: Only award for globally new discoveries!
    global_found_this_turn = set()
    for i, r in enumerate(result):
        letter = guess[i]
        value = SCRABBLE_SCORES.get(letter, 1)
        if r == "correct":
            # if we've never scored this letter as green *this game*:
            if letter not in found_greens and letter not in global_found_this_turn:
                if letter in found_yellows:
                    # yellow previously discovered → award remaining half
                    points_delta += value / 2
                    found_yellows.remove(letter)
                else:
                    # brand-new green → full value
                    points_delta += value
                found_greens.add(letter)
                global_found_this_turn.add(letter)
        elif r == "present":
            if letter not in found_greens and letter not in found_yellows and letter not in global_found_this_turn:
                # yellow discovery → half value
                points_delta += value / 2
                found_yellows.add(letter)
                global_found_this_turn.add(letter)

    # Bonus for win, penalty for wrong final guess
    won = guess == target_word
    over = False

    if won:
        points_delta += 3
        winner_emoji = emoji
        is_over = True
        over = True
        win_timestamp = now
    elif len(guesses) == MAX_ROWS:
        is_over = True
        over = True
        if not won:
            points_delta -= 3  # Last guess, failed

    if over:
        start_definition_lookup(target_word)

    # -1 penalty for duplicate guesses with no new yellows/greens
    if points_delta == 0 and not won and not over:
        points_delta -= 1

    leaderboard[emoji]["score"] += points_delta
    save_data()
    # — attach this turn’s points so client can render a history
    new_entry["points"] = points_delta

    resp_state = build_state_payload(emoji)
    broadcast_state()

    resp = {
        "status": "ok",
        "pointsDelta": points_delta,
        "state": resp_state,
        "won": won,
        "over": over,
        "daily_double": dd_award,
        "daily_double_available": emoji in daily_double_pending,
    }
    if dd_award:
        resp["daily_double_tile"] = {"row": award_row, "col": award_col}
    return jsonify(resp)


@app.route("/hint", methods=["POST"])
def select_hint():
    """Allow a Daily Double winner to reveal a letter in the next row."""
    data = request.get_json(silent=True) or {}
    emoji = data.get("emoji")
    col = data.get("col")
    ip = get_client_ip()

    if emoji not in leaderboard or leaderboard[emoji]["ip"] != ip:
        return jsonify({"status": "error", "msg": "Invalid player."}), 403

    if emoji not in daily_double_pending:
        return jsonify({"status": "error", "msg": "No hint available."}), 400

    try:
        col = int(col)
    except (TypeError, ValueError):
        return jsonify({"status": "error", "msg": "Invalid column."}), 400

    if not 0 <= col < 5:
        return jsonify({"status": "error", "msg": "Invalid column."}), 400

    row = daily_double_pending.pop(emoji)
    letter = target_word[col]
    save_data()
    log_daily_double_used(emoji, ip)
    return jsonify({
        "status": "ok",
        "row": row,
        "col": col,
        "letter": letter,
        "daily_double_available": False,
    })

@app.route("/chat", methods=["GET", "POST"])
def chat():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        emoji = data.get("emoji")
        if not text:
            return jsonify({"status": "error", "msg": "Empty message."}), 400
        if emoji not in leaderboard:
            return jsonify({"status": "error", "msg": "Pick an emoji first."}), 400
        chat_messages.append({"emoji": emoji, "text": text, "ts": time.time()})
        save_data()
        broadcast_state()
        return jsonify({"status": "ok"})
    return jsonify({"messages": chat_messages})

@app.route("/reset", methods=["POST"])
def reset_game():
    """Archive the current game and start a fresh one."""
    # Save the just-finished game into history
    past_games.append(list(guesses))
    pick_new_word()
    save_data()
    broadcast_state()
    return jsonify({"status": "ok"})

@app.route("/")
def index():
    # Serve the bundled frontend from the new directory
    return send_from_directory(str(FRONTEND_DIR), "index.html")

# Serve static JavaScript modules
@app.route('/static/js/<path:filename>')
@app.route('/js/<path:filename>')
def js_files(filename):
    return send_from_directory(str(FRONTEND_DIR / 'static' / 'js'), filename)

# Serve CSS assets
@app.route('/static/css/<path:filename>')
@app.route('/css/<path:filename>')
def css_files(filename):
    return send_from_directory(str(FRONTEND_DIR / 'static' / 'css'), filename)

if __name__ == "__main__":
    load_data()
    if not target_word:
        pick_new_word()
        save_data()
    app.run(host='0.0.0.0', port=5001)
