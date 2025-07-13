import html
import json
import logging
import os
import queue
import random
import re
import string
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

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

try:
    import redis  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    redis = None

logger = logging.getLogger(__name__)

CLOSE_CALL_WINDOW = 2.0  # seconds

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev_key_for_local_testing_only")
CORS(app)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s:%(message)s")

BASE_DIR = Path(__file__).resolve().parent.parent
DEV_FRONTEND_DIR = BASE_DIR / "frontend"
STATIC_DIR = BASE_DIR / "backend" / "static"
DATA_DIR = BASE_DIR / "data"

# Resolve asset locations from environment variables allowing overrides at
# deploy time while falling back to the bundled data files.
WORD_LIST_PATH = os.environ.get("WORD_LIST_PATH", str(DATA_DIR / "sgb-words.txt"))
DEFN_CACHE_PATH = os.environ.get(
    "DEFN_CACHE_PATH", str(DATA_DIR / "offline_definitions.json")
)

WORDS_FILE = Path(WORD_LIST_PATH).resolve()
GAME_FILE = Path(
    os.environ.get("GAME_FILE", str(BASE_DIR / "game_persist.json"))
).resolve()
ANALYTICS_FILE = BASE_DIR / "analytics.log"
LOBBIES_FILE = Path(
    os.environ.get("LOBBIES_FILE", str(BASE_DIR / "lobbies.json"))
).resolve()
OFFLINE_DEFINITIONS_FILE = Path(DEFN_CACHE_PATH).resolve()
MAX_ROWS = 6

# Optional Redis persistence for multi-instance deployments
REDIS_URL = os.environ.get("REDIS_URL")
redis_client = None
if REDIS_URL and redis is not None:
    try:
        redis_client = redis.from_url(REDIS_URL)
        redis_client.ping()
    except Exception as e:  # pragma: no cover - runtime check
        logger.warning("Redis connection failed: %s", e)
        redis_client = None

# Standard Scrabble letter values used for scoring
SCRABBLE_SCORES = {
    **{letter: 1 for letter in "aeilnorstu"},
    **{letter: 2 for letter in "dg"},
    **{letter: 3 for letter in "bcmp"},
    **{letter: 4 for letter in "fhvwy"},
    "k": 5,
    **{letter: 8 for letter in "jx"},
    **{letter: 10 for letter in "qz"},
}

# Lobby management constants
LOBBY_TTL = 30 * 60  # 30 minutes
LOBBY_CREATION_LIMIT = 5
LOBBY_CREATION_WINDOW = 60  # seconds
LOBBY_CODE_RE = re.compile(r"^[A-Za-z0-9]{6}$")


# ---- Globals ----
WORDS: list[str] = []


def _init_assets() -> None:
    """Load the word list and validate the definitions cache."""
    global WORDS
    try:
        with open(WORDS_FILE) as f:
            WORDS = [line.strip().lower() for line in f if len(line.strip()) == 5]
    except Exception as e:  # pragma: no cover - startup validation
        logger.error("Startup abort: could not load word list '%s': %s", WORDS_FILE, e)
        raise SystemExit(1)
    if not WORDS:
        logger.error("Startup abort: word list '%s' contains no words", WORDS_FILE)
        raise SystemExit(1)
    try:
        with open(OFFLINE_DEFINITIONS_FILE) as f:
            json.load(f)
    except Exception as e:  # pragma: no cover - startup validation
        logger.error(
            "Startup abort: could not parse definitions file '%s': %s",
            OFFLINE_DEFINITIONS_FILE,
            e,
        )
        raise SystemExit(1)


_init_assets()


@dataclass
class GameState:
    leaderboard: dict = field(default_factory=dict)
    ip_to_emoji: dict = field(default_factory=dict)
    player_map: dict = field(default_factory=dict)  # player_id -> emoji mapping
    winner_emoji: str | None = None
    target_word: str = ""
    guesses: list = field(default_factory=list)
    is_over: bool = False
    found_greens: set = field(default_factory=set)
    found_yellows: set = field(default_factory=set)
    past_games: list = field(default_factory=list)
    definition: str | None = None
    last_word: str | None = None
    last_definition: str | None = None
    win_timestamp: float | None = None
    chat_messages: list = field(default_factory=list)
    listeners: set = field(default_factory=set)
    daily_double_index: int | None = None
    daily_double_winners: set = field(default_factory=set)
    daily_double_pending: dict = field(default_factory=dict)
    host_token: str | None = None
    phase: str = "waiting"
    last_activity: float = field(default_factory=time.time)


emoji_lock = threading.Lock()  # guard emoji selection operations

# Lobby dictionary keyed by lobby code
LOBBIES: dict[str, GameState] = {}
CREATION_TIMES: dict[str, list[float]] = {}

# Track recently removed lobbies to prevent immediate recreation
RECENTLY_REMOVED_LOBBIES: dict[str, float] = {}
REMOVAL_COOLDOWN = 30.0  # seconds to prevent recreation after removal

# Current active lobby used by legacy routes
DEFAULT_LOBBY = "DEFAULT"
current_state: GameState = LOBBIES.setdefault(DEFAULT_LOBBY, GameState())


def get_lobby(code: str) -> GameState:
    """Return the GameState for ``code``, creating it if needed."""
    lobby = LOBBIES.get(code)
    if lobby is None:
        # Check if this lobby was recently removed due to being empty
        removal_time = RECENTLY_REMOVED_LOBBIES.get(code)
        if removal_time and (time.time() - removal_time) < REMOVAL_COOLDOWN:
            # Lobby was recently removed, return None to indicate it shouldn't be recreated
            return None
        
        lobby = _reset_state(GameState())
        LOBBIES[code] = lobby
        load_data(lobby)
        if not lobby.target_word:
            pick_new_word(lobby)
            save_data(lobby)
    return lobby


def purge_lobbies() -> None:
    """Remove lobbies that are finished or idle beyond ``LOBBY_TTL``."""
    now = time.time()
    expired = []
    for cid, state in LOBBIES.items():
        if cid == DEFAULT_LOBBY:
            continue
        if now - state.last_activity > LOBBY_TTL and (
            state.phase == "finished" or not state.leaderboard
        ):
            expired.append(cid)
    for cid in expired:
        LOBBIES.pop(cid, None)
    
    # Clean up old entries from recently removed lobbies tracking
    expired_removals = []
    for lobby_code, removal_time in RECENTLY_REMOVED_LOBBIES.items():
        if now - removal_time > REMOVAL_COOLDOWN * 2:  # Keep entries for twice the cooldown period
            expired_removals.append(lobby_code)
    for lobby_code in expired_removals:
        RECENTLY_REMOVED_LOBBIES.pop(lobby_code, None)


def _with_lobby(code: str, func):
    """Temporarily switch ``current_state`` to the lobby for ``code``."""
    if not LOBBY_CODE_RE.fullmatch(code):
        return jsonify({"status": "error", "msg": "Invalid lobby code"}), 400
    purge_lobbies()
    global current_state
    state = get_lobby(code)
    if state is None:
        # Lobby was recently removed and shouldn't be recreated
        return jsonify({"status": "error", "msg": "Lobby no longer exists"}), 404
    prev = current_state
    current_state = state
    try:
        return func()
    finally:
        current_state = prev


def sanitize_definition(text: str) -> str:
    """Remove HTML tags and extra whitespace from a definition."""
    text = re.sub(r"<[^>]*>", "", text)
    text = html.unescape(text)
    return " ".join(text.split())


def _reset_state(s: GameState | None = None) -> GameState:
    """Initialize all persistent in-memory structures to defaults.

    When ``s`` is ``None``, reset :data:`current_state` in place rather than
    creating a new ``GameState``.  The previous behaviour of returning a brand
    new instance made it easy to accidentally discard the reset object and
    leave the global state unchanged.
    """
    if s is None:
        s = current_state
    else:
        host_token = s.host_token
        s.leaderboard.clear()
        s.ip_to_emoji.clear()
        s.player_map.clear()
        s.guesses.clear()
        s.found_greens.clear()
        s.found_yellows.clear()
        s.past_games.clear()
        s.chat_messages.clear()
        s.daily_double_winners.clear()
        s.daily_double_pending.clear()
        s.host_token = host_token
    s.winner_emoji = None
    s.target_word = ""
    s.is_over = False
    s.definition = None
    s.last_word = None
    s.last_definition = None
    s.win_timestamp = None
    s.daily_double_index = None
    s.phase = "waiting"
    s.last_activity = time.time()
    return s


def _lobby_id(s: GameState) -> str:
    """Return the lobby code for the given ``GameState``."""
    for cid, state in LOBBIES.items():
        if state is s:
            return cid
    return DEFAULT_LOBBY


def save_data(s: GameState | None = None):
    if s is None:
        s = current_state
    code = _lobby_id(s)
    data = {
        "leaderboard": s.leaderboard,
        "ip_to_emoji": s.ip_to_emoji,
        "player_map": s.player_map,
        "winner_emoji": s.winner_emoji,
        "target_word": s.target_word,
        "guesses": s.guesses,
        "is_over": s.is_over,
        "found_greens": list(s.found_greens),
        "found_yellows": list(s.found_yellows),
        "past_games": s.past_games,
        "definition": s.definition,
        "last_word": s.last_word,
        "last_definition": s.last_definition,
        "win_timestamp": s.win_timestamp,
        "chat_messages": s.chat_messages,
        "daily_double_index": s.daily_double_index,
        "daily_double_winners": list(s.daily_double_winners),
        "daily_double_pending": s.daily_double_pending,
        "host_token": s.host_token,
        "phase": s.phase,
        "last_activity": s.last_activity,
    }
    if redis_client:
        try:
            redis_client.set(f"wwf:{code}", json.dumps(data))
        except Exception as e:  # pragma: no cover - redis failures
            logger.warning("Redis save failed: %s", e)
    if code == DEFAULT_LOBBY:
        with open(GAME_FILE, "w") as f:
            json.dump(data, f)
    else:
        try:
            all_data = {}
            if LOBBIES_FILE.exists():
                with open(LOBBIES_FILE) as f:
                    all_data = json.load(f)
        except Exception:
            all_data = {}
        all_data[code] = data
        try:
            with open(LOBBIES_FILE, "w") as f:
                json.dump(all_data, f)
        except Exception as e:  # pragma: no cover - persistence errors
            logger.warning("Lobby save failed: %s", e)


def load_data(s: GameState | None = None):
    global WORDS
    if s is None:
        s = current_state

    code = _lobby_id(s)

    # Load word list
    with open(WORDS_FILE) as f:
        WORDS = [line.strip().lower() for line in f if len(line.strip()) == 5]

    data = None
    if redis_client:
        try:
            blob = redis_client.get(f"wwf:{code}")
            if blob:
                data = json.loads(blob)
        except Exception as e:  # pragma: no cover - redis failures
            logger.warning("Redis load failed: %s", e)

    if data is None and code == DEFAULT_LOBBY and os.path.exists(GAME_FILE):
        with open(GAME_FILE) as f:
            try:
                data = json.load(f)
            except Exception:
                _reset_state(s)
                data = None
    elif data is None and code != DEFAULT_LOBBY and os.path.exists(LOBBIES_FILE):
        try:
            with open(LOBBIES_FILE) as f:
                data_all = json.load(f)
            data = data_all.get(code)
        except Exception:
            data = None

    if not data:
        _reset_state(s)
        return

    try:
        s.leaderboard = data.get("leaderboard", {})
        s.ip_to_emoji = data.get("ip_to_emoji", {})
        s.player_map = data.get("player_map", {})
        s.winner_emoji = data.get("winner_emoji")
        s.target_word = data.get("target_word", "")
        s.guesses[:] = data.get("guesses", [])
        s.is_over = data.get("is_over", False)
        s.found_greens = set(data.get("found_greens", []))
        s.found_yellows = set(data.get("found_yellows", []))
        s.past_games[:] = data.get("past_games", [])
        s.definition = data.get("definition")
        s.last_word = data.get("last_word")
        s.last_definition = data.get("last_definition")
        s.win_timestamp = data.get("win_timestamp")
        s.chat_messages[:] = data.get("chat_messages", [])
        s.daily_double_index = data.get("daily_double_index")
        s.daily_double_winners = set(data.get("daily_double_winners", []))
        s.daily_double_pending = data.get("daily_double_pending", {})
        s.host_token = data.get("host_token")
        s.phase = data.get("phase", "waiting")
        s.last_activity = data.get("last_activity", time.time())
    except Exception:
        _reset_state(s)


# ---- Game Logic ----


def generate_lobby_code() -> str:
    """Return a random six-character lobby code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=6))


def pick_new_word(s: GameState | None = None):
    """Choose a new target word and reset all in-memory game current_state."""
    if s is None:
        s = current_state
    s.target_word = random.choice(WORDS)
    s.guesses.clear()
    s.is_over = False
    s.winner_emoji = None
    s.found_greens = set()
    s.found_yellows = set()
    s.definition = None
    s.win_timestamp = None
    if MAX_ROWS > 1:
        s.daily_double_index = random.randint(0, (MAX_ROWS - 1) * 5 - 1)
    else:
        s.daily_double_index = None
    s.daily_double_winners.clear()
    for player in list(s.daily_double_pending.keys()):
        s.daily_double_pending[player] = 0
    s.phase = "waiting"
    s.last_activity = time.time()


def fetch_definition(word):
    """Look up a word's definition online with an offline JSON fallback."""
    url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0 "
            "Gecko/20100101 Firefox/109.0"
        )
    }
    logger.info(f"Fetching definition for '{word}'")
    try:
        logger.info(f"Trying online dictionary API for '{word}'")
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
                    logger.info(f"Online definition for '{word}': {definition}")
                    return definition
    except requests.RequestException as e:
        logger.info(f"Online lookup failed for '{word}': {e}. Trying offline cache.")
        try:
            with open(OFFLINE_DEFINITIONS_FILE) as f:
                offline = json.load(f)
            definition = offline.get(word)
            if definition:
                definition = sanitize_definition(definition)
                logger.info(f"Offline definition for '{word}': {definition}")
            else:
                logger.info(f"No offline definition found for '{word}'")
            return definition
        except Exception as e2:
            logger.info(f"Offline lookup failed for '{word}': {e2}")
    except Exception as e:
        logger.info(f"Unexpected error fetching definition for '{word}': {e}")
    logger.info(f"No definition found for '{word}'")
    return None


def _definition_worker(word: str, s: GameState) -> None:
    """Background task to fetch a word's definition and persist it."""
    s.definition = fetch_definition(word)
    logger.info(f"Definition lookup complete for '{word}': {s.definition or 'None'}")
    s.last_word = word
    s.last_definition = s.definition
    save_data(s)
    broadcast_state(s)


def start_definition_lookup(word: str, s: GameState | None = None) -> threading.Thread:
    """Start asynchronous definition lookup for the solved word."""
    if s is None:
        s = current_state
    t = threading.Thread(target=_definition_worker, args=(word, s))
    t.daemon = True
    t.start()
    return t


def get_client_ip():
    """Return the client's IP address, accounting for proxies."""
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].split(",")[0]
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


def get_required_letters_and_positions(s: GameState | None = None):
    """Aggregate hard mode constraints from prior guesses."""
    if s is None:
        s = current_state
    required_letters = set()
    green_positions = {}
    for g in s.guesses:
        for i, res in enumerate(g["result"]):
            if res == "correct":
                required_letters.add(g["guess"][i])
                green_positions[i] = g["guess"][i]
            elif res == "present":
                required_letters.add(g["guess"][i])
    return required_letters, green_positions


def validate_hard_mode(guess, s: GameState | None = None):
    """Check a guess against hard mode constraints."""
    if s is None:
        s = current_state
    required_letters, green_positions = get_required_letters_and_positions(s)
    for idx, ch in green_positions.items():
        if guess[idx] != ch:
            return False, f"Letter {ch.upper()} must be in position {idx+1}."
    if required_letters:
        if not all(letter in guess for letter in required_letters):
            missing = [letter for letter in required_letters if letter not in guess]
            missing_str = ", ".join(m.upper() for m in missing)
            return False, f"Guess must contain letter(s): {missing_str}."
    return True, ""


def build_state_payload(emoji: str | None = None, s: GameState | None = None):
    """Assemble the full game current_state dictionary returned to clients.

    When ``emoji`` is provided, include a ``daily_double_available`` boolean
    indicating whether that player currently has an unused hint.
    """
    if s is None:
        s = current_state
    lb = [
        {
            "emoji": player,
            "score": s.leaderboard[player]["score"],
            "last_active": s.leaderboard[player].get("last_active", 0),
        }
        for player in s.leaderboard
    ]
    lb.sort(key=lambda e: e["score"], reverse=True)

    payload = {
        "guesses": s.guesses,
        "target_word": s.target_word if s.is_over else None,
        "is_over": s.is_over,
        "leaderboard": lb,
        "active_emojis": list(s.leaderboard.keys()),
        "winner_emoji": s.winner_emoji,
        "max_rows": MAX_ROWS,
        "phase": s.phase,
        "past_games": s.past_games,
        "definition": s.definition if s.is_over else None,
        "last_word": s.last_word,
        "last_definition": s.last_definition,
        "chat_messages": s.chat_messages,
    }

    if emoji is not None:
        payload["daily_double_available"] = emoji in s.daily_double_pending

    return payload


def broadcast_state(s: GameState | None = None) -> None:
    """Send the latest game current_state to all connected SSE clients."""
    if s is None:
        s = current_state
    data = json.dumps(build_state_payload(s=s))
    for q in list(s.listeners):
        try:
            q.put_nowait(data)
        except Exception:
            s.listeners.discard(q)


def _log_event(event: str, **fields) -> None:
    """Write a structured analytics event to ``ANALYTICS_FILE``."""
    entry = {"event": event, "timestamp": time.time(), **fields}
    try:
        with open(ANALYTICS_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:  # pragma: no cover - logging failures shouldn't break API
        logger.info(f"Failed to log analytics event: {e}")


def log_daily_double_used(emoji: str, ip: str) -> None:
    """Append a Daily Double usage event to the analytics log."""
    _log_event("daily_double_used", emoji=emoji, ip=ip)


def log_lobby_created(lobby_id: str, ip: str) -> None:
    """Log creation of a new lobby."""
    _log_event("lobby_created", lobby_id=lobby_id, ip=ip)


def log_lobby_joined(lobby_id: str, emoji: str, ip: str) -> None:
    """Log a player joining ``lobby_id``."""
    _log_event("lobby_joined", lobby_id=lobby_id, emoji=emoji, ip=ip)


def log_lobby_finished(lobby_id: str, ip: str | None = None) -> None:
    """Log a lobby finishing or being reset."""
    data = {"lobby_id": lobby_id}
    if ip:
        data["ip"] = ip
    _log_event("lobby_finished", **data)


def log_player_kicked(lobby_id: str, emoji: str) -> None:
    """Log a player being kicked from ``lobby_id``."""
    _log_event("player_kicked", lobby_id=lobby_id, emoji=emoji)


# ---- API Routes ----


@app.route("/stream")
def stream():
    """Server-Sent Events endpoint for real-time updates."""
    from flask import Response

    q = queue.Queue()
    current_state.listeners.add(q)

    def gen():
        try:
            while True:
                data = q.get()
                yield f"data: {data}\n\n"
        finally:
            current_state.listeners.discard(q)

    return Response(gen(), mimetype="text/event-stream")


@app.route("/state", methods=["GET", "POST"])
def state():
    # ——— Heartbeat: bump AFK timestamp on every client poll ———
    emoji = None
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        e = data.get("emoji")
        pid = data.get("player_id")
        if (
            e
            and pid
            and e in current_state.leaderboard
            and current_state.leaderboard[e].get("player_id") == pid
        ):
            current_state.leaderboard[e]["last_active"] = time.time()
            current_state.last_activity = time.time()
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
    player_id = data.get("player_id")
    ip = get_client_ip()
    now = time.time()

    if not emoji or not isinstance(emoji, str):
        return jsonify({"status": "error", "msg": "Invalid emoji."}), 400

    if not player_id:
        player_id = uuid.uuid4().hex
    new_player = player_id not in current_state.player_map
    logger.info("Emoji request: %s player=%s ip=%s", emoji, player_id, ip)

    with emoji_lock:
        if (
            emoji in current_state.leaderboard
            and current_state.leaderboard[emoji].get("player_id") != player_id
        ):
            return (
                jsonify({"status": "error", "msg": "That emoji is taken!"}),
                409,
            )

        prev_emoji = current_state.player_map.get(player_id)
        if prev_emoji and prev_emoji != emoji:
            # Move existing entry so score and history persist
            entry = current_state.leaderboard.pop(
                prev_emoji,
                {
                    "ip": ip,
                    "player_id": player_id,
                    "score": 0,
                    "used_yellow": [],
                    "used_green": [],
                    "last_active": now,
                },
            )
            current_state.leaderboard[emoji] = entry
        else:
            current_state.leaderboard.setdefault(
                emoji,
                {
                    "ip": ip,
                    "player_id": player_id,
                    "score": 0,
                    "used_yellow": [],
                    "used_green": [],
                    "last_active": now,
                },
            )
        current_state.leaderboard[emoji]["ip"] = ip
        current_state.leaderboard[emoji]["player_id"] = player_id
        current_state.leaderboard[emoji]["last_active"] = now
        current_state.ip_to_emoji[ip] = emoji
        current_state.player_map[player_id] = emoji
        current_state.last_activity = now
        save_data()
    logger.info(
        "Emoji %s mapped to player %s (ip %s) new=%s",
        emoji,
        player_id,
        ip,
        new_player,
    )
    broadcast_state()
    if new_player:
        log_lobby_joined(_lobby_id(current_state), emoji, ip)
    return jsonify({"status": "ok", "player_id": player_id})


@app.route("/guess", methods=["POST"])
def guess_word():
    """Process a player's guess and update scores and game state."""
    data = request.json or {}
    guess = (data.get("guess") or "").strip().lower()
    # ▶ Prevent duplicates
    emoji = data.get("emoji")
    player_id = data.get("player_id")
    ip = get_client_ip()
    points_delta = 0
    logger.info(
        "Guess attempt '%s' by %s (player=%s ip=%s)", guess, emoji, player_id, ip
    )
    now = time.time()

    current_state.last_activity = now
    if current_state.phase == "waiting":
        current_state.phase = "active"
    if current_state.is_over:
        close_call = None
        if (
            guess == current_state.target_word
            and current_state.win_timestamp
            and emoji != current_state.winner_emoji
        ):
            diff = now - current_state.win_timestamp
            if diff <= CLOSE_CALL_WINDOW:
                close_call = {
                    "delta_ms": int(diff * 1000),
                    "winner": current_state.winner_emoji,
                }
        resp = {"status": "error", "msg": "Game is over. Please reset."}
        if close_call:
            resp["close_call"] = close_call
        return jsonify(resp), 403
    if not guess or len(guess) != 5 or guess not in WORDS:
        return jsonify({"status": "error", "msg": "Not a valid 5-letter word."}), 400
    existing = [g["guess"] for g in current_state.guesses]
    if guess in existing:
        return jsonify(status="error", msg="You’ve already guessed that word."), 400
    if (
        emoji not in current_state.leaderboard
        or current_state.leaderboard[emoji].get("player_id") != player_id
    ):
        return (
            jsonify({"status": "error", "msg": "Please pick an emoji before playing."}),
            403,
        )

    current_state.leaderboard[emoji]["last_active"] = now

    ok, msg = validate_hard_mode(guess)
    if not ok:
        return jsonify({"status": "error", "msg": msg}), 400

    row_index = len(current_state.guesses)
    result = result_for_guess(guess, current_state.target_word)
    new_entry = {"guess": guess, "result": result, "emoji": emoji, "ts": now}
    current_state.guesses.append(new_entry)

    dd_award = False
    award_row = None
    award_col = None
    if current_state.daily_double_index is not None:
        dd_row = current_state.daily_double_index // 5
        dd_col = current_state.daily_double_index % 5
        if (
            row_index == dd_row
            and result[dd_col] == "correct"
            and emoji not in current_state.daily_double_winners
        ):
            current_state.daily_double_winners.add(emoji)
            current_state.daily_double_pending[emoji] = row_index + 1
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
            if (
                letter not in current_state.found_greens
                and letter not in global_found_this_turn
            ):
                if letter in current_state.found_yellows:
                    # yellow previously discovered → award remaining half
                    points_delta += value / 2
                    current_state.found_yellows.remove(letter)
                else:
                    # brand-new green → full value
                    points_delta += value
                current_state.found_greens.add(letter)
                global_found_this_turn.add(letter)
        elif r == "present":
            if (
                letter not in current_state.found_greens
                and letter not in current_state.found_yellows
                and letter not in global_found_this_turn
            ):
                # yellow discovery → half value
                points_delta += value / 2
                current_state.found_yellows.add(letter)
                global_found_this_turn.add(letter)

    # Bonus for win, penalty for wrong final guess
    won = guess == current_state.target_word
    over = False

    if won:
        points_delta += 3
        current_state.winner_emoji = emoji
        current_state.is_over = True
        over = True
        current_state.win_timestamp = now
    elif len(current_state.guesses) == MAX_ROWS:
        current_state.is_over = True
        over = True
        if not won:
            points_delta -= 3  # Last guess, failed

    if over:
        current_state.phase = "finished"
        start_definition_lookup(current_state.target_word, current_state)

    # -1 penalty for duplicate guesses with no new yellows/greens
    if points_delta == 0 and not won and not over:
        points_delta -= 1

    current_state.leaderboard[emoji]["score"] += points_delta
    save_data()
    # — attach this turn’s points so client can render a history
    new_entry["points"] = points_delta

    resp_state = build_state_payload(emoji)
    broadcast_state()

    logger.info(
        "Guess result '%s' by %s points=%s won=%s over=%s",
        guess,
        emoji,
        points_delta,
        won,
        over,
    )

    resp = {
        "status": "ok",
        "pointsDelta": points_delta,
        "state": resp_state,
        "won": won,
        "over": over,
        "daily_double": dd_award,
        "daily_double_available": emoji in current_state.daily_double_pending,
    }
    if dd_award:
        resp["daily_double_tile"] = {"row": award_row, "col": award_col}
    return jsonify(resp)


@app.route("/hint", methods=["POST"])
def select_hint():
    """Allow a Daily Double winner to reveal a letter in the next row."""
    data = request.get_json(silent=True) or {}
    emoji = data.get("emoji")
    player_id = data.get("player_id")
    col = data.get("col")
    ip = get_client_ip()

    if (
        emoji not in current_state.leaderboard
        or current_state.leaderboard[emoji].get("player_id") != player_id
    ):
        return jsonify({"status": "error", "msg": "Invalid player."}), 403

    if emoji not in current_state.daily_double_pending:
        return jsonify({"status": "error", "msg": "No hint available."}), 400

    try:
        col = int(col)
    except (TypeError, ValueError):
        return jsonify({"status": "error", "msg": "Invalid column."}), 400

    if not 0 <= col < 5:
        return jsonify({"status": "error", "msg": "Invalid column."}), 400

    row = current_state.daily_double_pending.pop(emoji)
    letter = current_state.target_word[col]
    save_data()
    log_daily_double_used(emoji, ip)
    return jsonify(
        {
            "status": "ok",
            "row": row,
            "col": col,
            "letter": letter,
            "daily_double_available": False,
        }
    )


@app.route("/chat", methods=["GET", "POST"])
def chat():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        emoji = data.get("emoji")
        player_id = data.get("player_id")
        if not text:
            return jsonify({"status": "error", "msg": "Empty message."}), 400
        if (
            emoji not in current_state.leaderboard
            or current_state.leaderboard[emoji].get("player_id") != player_id
        ):
            return jsonify({"status": "error", "msg": "Pick an emoji first."}), 400
        current_state.chat_messages.append(
            {"emoji": emoji, "text": text, "ts": time.time()}
        )
        current_state.last_activity = time.time()
        save_data()
        broadcast_state()
        return jsonify({"status": "ok"})
    return jsonify({"messages": current_state.chat_messages})


@app.route("/reset", methods=["POST"])
def reset_game():
    """Archive the current game and start a fresh one."""
    # Save the just-finished game into history
    logger.info("Resetting lobby %s", _lobby_id(current_state))
    current_state.past_games.append(list(current_state.guesses))
    pick_new_word(current_state)
    current_state.last_activity = time.time()
    save_data()
    broadcast_state()
    log_lobby_finished(_lobby_id(current_state), get_client_ip())
    logger.info("Lobby %s reset complete", _lobby_id(current_state))
    return jsonify({"status": "ok"})


# ---- Lobby-aware Routes ----


@app.route("/lobby", methods=["POST"])
def lobby_create():
    """Create a new lobby and return its code."""
    purge_lobbies()
    ip = get_client_ip()
    now = time.time()
    times = CREATION_TIMES.setdefault(ip, [])
    times[:] = [t for t in times if now - t < LOBBY_CREATION_WINDOW]
    if len(times) >= LOBBY_CREATION_LIMIT:
        return jsonify({"status": "error", "msg": "Rate limit"}), 429
    times.append(now)

    logger.info("Lobby create request from %s", ip)

    code = generate_lobby_code()
    while code in LOBBIES:
        code = generate_lobby_code()
    state = _reset_state(GameState())
    pick_new_word(state)
    token = "".join(random.choices(string.ascii_letters + string.digits, k=32))
    state.host_token = token
    LOBBIES[code] = state
    save_data(state)
    log_lobby_created(code, ip)
    logger.info("Lobby %s created host=%s", code, ip)
    return jsonify({"id": code, "host_token": token})


@app.route("/lobbies", methods=["GET"])
def lobby_list():
    """Return a list of active lobbies and player counts."""
    data = [
        {"id": cid, "players": len(s.leaderboard)}
        for cid, s in LOBBIES.items()
        if cid != DEFAULT_LOBBY
    ]
    return jsonify({"lobbies": data})


@app.route("/lobbies/network", methods=["GET"])
def lobby_network_list():
    """Return a list of active lobbies from the same network as the client."""
    client_ip = get_client_ip()
    data = []
    
    for cid, s in LOBBIES.items():
        if cid == DEFAULT_LOBBY:
            continue
            
        # Check if the client's IP has players in this lobby
        if client_ip in s.ip_to_emoji:
            data.append({
                "id": cid,
                "players": len(s.leaderboard),
                "your_emoji": s.ip_to_emoji.get(client_ip)
            })
        # Also include lobbies where any player shares the same network segment
        # (for local networks, we can check if IP starts with same prefix)
        else:
            # Simple network detection: same IP or same local network (192.168.x.x, 10.x.x.x, etc.)
            for lobby_ip in s.ip_to_emoji.keys():
                if _is_same_network(client_ip, lobby_ip):
                    data.append({
                        "id": cid,
                        "players": len(s.leaderboard)
                    })
                    break
    
    return jsonify({"lobbies": data})


def _is_same_network(ip1, ip2):
    """Check if two IP addresses are likely on the same local network."""
    if ip1 == ip2:
        return True
    
    # Handle localhost/loopback
    if ip1 in ["127.0.0.1", "localhost"] or ip2 in ["127.0.0.1", "localhost"]:
        return ip1 == ip2
    
    # For simplicity, check if they share the same first 3 octets for private networks
    try:
        parts1 = ip1.split('.')
        parts2 = ip2.split('.')
        
        if len(parts1) == 4 and len(parts2) == 4:
            # Check for common private network prefixes
            if (parts1[0] == '192' and parts1[1] == '168' and 
                parts2[0] == '192' and parts2[1] == '168' and 
                parts1[2] == parts2[2]):
                return True
            elif (parts1[0] == '10' and parts2[0] == '10' and 
                  parts1[1] == parts2[1] and parts1[2] == parts2[2]):
                return True
            elif (parts1[0] == '172' and parts2[0] == '172' and 
                  16 <= int(parts1[1]) <= 31 and 16 <= int(parts2[1]) <= 31 and
                  parts1[1] == parts2[1] and parts1[2] == parts2[2]):
                return True
    except (ValueError, IndexError):
        pass
    
    return False


@app.route("/lobby/<code>/stream")
def lobby_stream(code):
    return _with_lobby(code, stream)


@app.route("/lobby/<code>/state", methods=["GET", "POST"])
def lobby_state(code):
    return _with_lobby(code, state)


@app.route("/lobby/<code>/emoji", methods=["POST"])
def lobby_emoji(code):
    return _with_lobby(code, set_emoji)


@app.route("/lobby/<code>/guess", methods=["POST"])
def lobby_guess(code):
    return _with_lobby(code, guess_word)


@app.route("/lobby/<code>/reset", methods=["POST"])
def lobby_reset(code):
    state = LOBBIES.get(code)
    if not state:
        return jsonify({"status": "error", "msg": "No such lobby"}), 404
    data = request.get_json(silent=True) or {}
    token = data.get("host_token")
    if token != state.host_token:
        return jsonify({"status": "error", "msg": "Invalid host token"}), 403
    resp = _with_lobby(code, reset_game)
    return resp


def kick_player():
    """Remove a player from the current lobby."""
    data = request.get_json(silent=True) or {}
    emoji = data.get("emoji")
    token = data.get("host_token")
    if not emoji:
        return jsonify({"status": "error", "msg": "Missing emoji"}), 400
    if token != current_state.host_token:
        return jsonify({"status": "error", "msg": "Invalid host token"}), 403
    if emoji not in current_state.leaderboard:
        return jsonify({"status": "error", "msg": "No such player"}), 404
    ip = current_state.leaderboard[emoji]["ip"]
    pid = current_state.leaderboard[emoji].get("player_id")
    current_state.leaderboard.pop(emoji, None)
    current_state.ip_to_emoji.pop(ip, None)
    if pid:
        current_state.player_map.pop(pid, None)
    current_state.daily_double_pending.pop(emoji, None)
    if current_state.winner_emoji == emoji:
        current_state.winner_emoji = None
    
    # Check if lobby is now empty and remove it immediately
    lobby_code = _lobby_id(current_state)
    if lobby_code != DEFAULT_LOBBY and not current_state.leaderboard:
        # Lobby is empty, remove it immediately
        LOBBIES.pop(lobby_code, None)
        # Track the removal time to prevent immediate recreation
        RECENTLY_REMOVED_LOBBIES[lobby_code] = time.time()
        logger.info(f"Removed empty lobby {lobby_code}")
        return jsonify({"status": "ok", "lobby_removed": True})
    
    broadcast_state()
    log_player_kicked(lobby_code, emoji)
    return jsonify({"status": "ok"})


def remove_empty_lobby(lobby_code: str) -> bool:
    """Remove a lobby if it has no players. Returns True if removed."""
    if lobby_code == DEFAULT_LOBBY:
        return False
    
    lobby = LOBBIES.get(lobby_code)
    if lobby and not lobby.leaderboard:
        LOBBIES.pop(lobby_code, None)
        # Track the removal time to prevent immediate recreation
        RECENTLY_REMOVED_LOBBIES[lobby_code] = time.time()
        logger.info(f"Removed empty lobby {lobby_code}")
        return True
    return False


def leave_lobby():
    """Remove the calling player from the current lobby."""
    data = request.get_json(silent=True) or {}
    emoji = data.get("emoji")
    player_id = data.get("player_id")
    
    if not emoji:
        return jsonify({"status": "error", "msg": "Missing emoji"}), 400
    if not player_id:
        return jsonify({"status": "error", "msg": "Missing player_id"}), 400
    
    # Verify the player exists in the lobby
    if emoji not in current_state.leaderboard:
        return jsonify({"status": "error", "msg": "Player not in lobby"}), 404
    
    # Verify player_id matches
    stored_player_id = current_state.leaderboard[emoji].get("player_id")
    if stored_player_id != player_id:
        return jsonify({"status": "error", "msg": "Invalid player credentials"}), 403
    
    # Remove the player from the lobby
    ip = current_state.leaderboard[emoji]["ip"]
    current_state.leaderboard.pop(emoji, None)
    current_state.ip_to_emoji.pop(ip, None)
    current_state.player_map.pop(player_id, None)
    current_state.daily_double_pending.pop(emoji, None)
    if current_state.winner_emoji == emoji:
        current_state.winner_emoji = None
    
    # Check if lobby is now empty and remove it immediately
    lobby_code = _lobby_id(current_state)
    if lobby_code != DEFAULT_LOBBY and not current_state.leaderboard:
        # Lobby is empty, remove it immediately
        LOBBIES.pop(lobby_code, None)
        # Track the removal time to prevent immediate recreation
        RECENTLY_REMOVED_LOBBIES[lobby_code] = time.time()
        logger.info(f"Removed empty lobby {lobby_code} after player {emoji} left")
        return jsonify({"status": "ok", "lobby_removed": True})
    
    # Save state and broadcast changes
    current_state.last_activity = time.time()
    save_data()
    broadcast_state()
    
    return jsonify({"status": "ok"})


@app.route("/lobby/<code>/kick", methods=["POST"])
def lobby_kick(code):
    return _with_lobby(code, kick_player)


@app.route("/lobby/<code>/leave", methods=["POST"])
def lobby_leave(code):
    return _with_lobby(code, leave_lobby)


@app.route("/lobby/<code>/chat", methods=["GET", "POST"])
def lobby_chat(code):
    return _with_lobby(code, chat)


# ---- Maintenance ----


@app.route("/internal/purge", methods=["POST"])
def cleanup_lobbies():
    """Purge idle or finished lobbies.

    This endpoint is intended for the scheduled Lambda job defined in the
    Terraform configuration. It simply calls ``purge_lobbies`` and returns a
    small status payload.
    """
    purge_lobbies()
    return jsonify({"status": "ok"})


@app.route("/health")
def health() -> Any:
    """Health check ensuring required assets are loaded."""
    missing = []
    if not WORDS:
        missing.append("word_list")
    if not OFFLINE_DEFINITIONS_FILE.exists():
        missing.append("definitions_cache")
    if missing:
        return jsonify({"status": "unhealthy", "missing": missing}), 503
    return jsonify({"status": "ok"})


@app.route("/")
def index():
    """Serve the landing page."""
    root = STATIC_DIR if (STATIC_DIR / "index.html").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "index.html")


@app.route("/landing.css")
def landing_css():
    """Serve the landing page stylesheet."""
    root = STATIC_DIR if (STATIC_DIR / "landing.css").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "landing.css")


@app.route("/landing.js")
def landing_js():
    """Serve the landing page script."""
    root = STATIC_DIR if (STATIC_DIR / "landing.js").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "landing.js")


@app.route("/game")
def game_page():
    """Serve the main game client."""
    root = STATIC_DIR if (STATIC_DIR / "game.html").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "game.html")


@app.route("/lobby/<code>")
def lobby_page(code: str):
    """Serve the game client for a specific lobby."""
    root = STATIC_DIR if (STATIC_DIR / "game.html").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "game.html")


# Serve static JavaScript modules
@app.route("/static/js/<path:filename>")
@app.route("/js/<path:filename>")
def js_files(filename):
    root = STATIC_DIR if (STATIC_DIR / "static" / "js").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root / "static" / "js"), filename)


# Support asset requests when game.html is served from /lobby/<code>
@app.route("/lobby/static/js/<path:filename>")
def lobby_js_files(filename):
    return js_files(filename)


# Serve CSS assets
@app.route("/static/css/<path:filename>")
@app.route("/css/<path:filename>")
def css_files(filename):
    root = STATIC_DIR if (STATIC_DIR / "static" / "css").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root / "static" / "css"), filename)


@app.route("/lobby/static/css/<path:filename>")
def lobby_css_files(filename):
    return css_files(filename)


# Serve Vite-generated assets
@app.route("/assets/<path:filename>")
def asset_files(filename):
    root = STATIC_DIR if (STATIC_DIR / "assets").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root / "assets"), filename)


@app.route("/lobby/assets/<path:filename>")
def lobby_asset_files(filename):
    return asset_files(filename)


@app.route("/<path:requested_path>")
def spa_fallback_route(requested_path: str):
    """Send index.html for client-side routes."""
    if requested_path.startswith(("api/", "static/", "assets/")) or requested_path in (
        "favicon.ico",
        "robots.txt",
    ):
        return "", 404
    root = STATIC_DIR if (STATIC_DIR / "index.html").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "index.html")


if __name__ == "__main__":
    load_data()
    if not current_state.target_word:
        pick_new_word(current_state)
        save_data()

    # Launch a background thread that periodically purges idle lobbies
    def _purge_loop() -> None:
        while True:
            time.sleep(600)
            try:
                purge_lobbies()
            except Exception as e:  # pragma: no cover - best effort cleanup
                logger.warning("Purge thread error: %s", e)

    t = threading.Thread(target=_purge_loop, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5001)
