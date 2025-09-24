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
from pathlib import Path
from typing import Any

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Import our modules
try:
    from .models import GameState, get_emoji_variant, get_base_emoji, EMOJI_VARIANTS
    from .game_logic import init_game_assets, generate_lobby_code, pick_new_word, sanitize_definition, fetch_definition, start_definition_lookup, SCRABBLE_SCORES, MAX_ROWS, WORDS
    from .data_persistence import init_persistence, save_data, load_data
    from .analytics import init_analytics, log_daily_double_used, log_lobby_created, log_lobby_joined, log_lobby_finished, log_player_kicked
    from .config import validate_production_config, get_config_summary
except ImportError:
    # Handle running as script instead of module
    from models import GameState, get_emoji_variant, get_base_emoji, EMOJI_VARIANTS
    from game_logic import init_game_assets, generate_lobby_code, pick_new_word, sanitize_definition, fetch_definition, start_definition_lookup, SCRABBLE_SCORES, MAX_ROWS, WORDS
    from data_persistence import init_persistence, save_data, load_data
    from analytics import init_analytics, log_daily_double_used, log_lobby_created, log_lobby_joined, log_lobby_finished, log_player_kicked
    from config import validate_production_config, get_config_summary

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
    from redis import ConnectionPool
except Exception:  # pragma: no cover - optional dependency
    redis = None
    ConnectionPool = None

CLOSE_CALL_WINDOW = 2.0  # seconds

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev_key_for_local_testing_only")

# Validate secret key for production
if not os.environ.get("SECRET_KEY") and os.environ.get("FLASK_ENV") == "production":
    logger.error("SECRET_KEY environment variable must be set for production")
    raise SystemExit(1)

CORS(app)

@app.after_request
def add_cache_control_headers(response):
    """Add appropriate cache-control headers to responses."""
    # Set different cache policies based on content type and path
    # Override any existing cache-control if needed
    if request.endpoint in ['index', 'game_page', 'lobby_page']:
        # HTML pages - short cache with must-revalidate for freshness
        response.headers['Cache-Control'] = 'public, max-age=300, must-revalidate'
    elif request.path.startswith('/static/') or request.path.startswith('/assets/'):
        # Static assets - longer cache for performance
        response.headers['Cache-Control'] = 'public, max-age=86400, immutable'
    elif request.endpoint in ['js_files', 'css_files', 'asset_files', 'lobby_js_files', 'lobby_css_files', 'lobby_asset_files']:
        # JS/CSS files - longer cache for performance
        response.headers['Cache-Control'] = 'public, max-age=86400, immutable'
    elif request.endpoint in ['health', 'state', 'lobby_state', 'chat', 'lobby_chat']:
        # API endpoints - no cache to ensure real-time data
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    elif not response.headers.get('Cache-Control'):
        # Default for other endpoints - short cache if no cache-control already set
        response.headers['Cache-Control'] = 'public, max-age=60'
    
    return response

# Configure logging based on environment
def configure_logging():
    """Configure logging for production vs development."""
    log_level = logging.INFO
    log_format = "%(asctime)s %(levelname)s:%(name)s:%(message)s"
    
    # More detailed logging for production
    if os.environ.get("FLASK_ENV") == "production":
        log_format = "%(asctime)s %(levelname)s [%(name)s:%(filename)s:%(lineno)d] %(message)s"
        # Add request ID context if available
        if hasattr(logging, 'structlog'):
            # Use structured logging if available
            pass
    
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=[
            logging.StreamHandler(),
            # Add file handler for production if needed
        ]
    )

configure_logging()

logger = logging.getLogger(__name__)

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
        # Use connection pooling for better performance
        pool = ConnectionPool.from_url(REDIS_URL, max_connections=20, retry_on_timeout=True)
        redis_client = redis.Redis(connection_pool=pool)
        redis_client.ping()
        logger.info("Redis connection established with connection pooling")
    except Exception as e:  # pragma: no cover - runtime check
        logger.warning("Redis connection failed: %s", e)
        redis_client = None

# Lobby management constants
LOBBY_TTL = 30 * 60  # 30 minutes
LOBBY_CREATION_LIMIT = 5
LOBBY_CREATION_WINDOW = 60  # seconds
LOBBY_CODE_RE = re.compile(r"^[A-Za-z0-9]{6}$")

# Enhanced rate limiting
API_RATE_LIMIT = 100  # requests per minute per IP
API_RATE_WINDOW = 60  # seconds
GUESS_RATE_LIMIT = 30  # guesses per minute per player
GUESS_RATE_WINDOW = 60  # seconds

# Performance optimization: rate-limit purge operations
PURGE_COOLDOWN = 5.0  # Only purge at most once every 5 seconds
_last_purge_time = 0.0

# Initialize game assets 
init_game_assets(WORDS_FILE, OFFLINE_DEFINITIONS_FILE)

# Validate production configuration
try:
    validate_production_config()
    logger.info("Configuration summary: %s", get_config_summary())
except Exception as e:
    logger.error("Configuration validation failed: %s", e)
    if os.environ.get("FLASK_ENV") == "production":
        raise SystemExit(1)
    else:
        logger.warning("Continuing in development mode despite configuration issues")

emoji_lock = threading.Lock()  # guard emoji selection operations

# Lobby dictionary keyed by lobby code
LOBBIES: dict[str, GameState] = {}
CREATION_TIMES: dict[str, list[float]] = {}

# Enhanced rate limiting tracking
API_REQUEST_TIMES: dict[str, list[float]] = {}  # IP -> request timestamps
GUESS_REQUEST_TIMES: dict[str, list[float]] = {}  # player_id -> guess timestamps

# Track recently removed lobbies to prevent immediate recreation
RECENTLY_REMOVED_LOBBIES: dict[str, float] = {}
REMOVAL_COOLDOWN = 30.0  # seconds to prevent recreation after removal

# Current active lobby used by legacy routes
DEFAULT_LOBBY = "DEFAULT"
current_state: GameState = LOBBIES.setdefault(DEFAULT_LOBBY, GameState())

# Initialize data persistence layer
init_persistence(redis_client, GAME_FILE, LOBBIES_FILE, DEFAULT_LOBBY, LOBBIES)

# Initialize analytics
init_analytics(ANALYTICS_FILE)


# Create backward compatible wrappers for persistence functions
def save_data_legacy(s: GameState | None = None):
    """Backward compatible wrapper for save_data."""
    if s is None:
        s = current_state
    save_data(s, _lobby_id(s))


def load_data_legacy(s: GameState | None = None):
    """Backward compatible wrapper for load_data."""
    if s is None:
        s = current_state
    load_data(s, _lobby_id(s), _reset_state)


def get_lobby(code: str) -> GameState:
    """Return the GameState for ``code``, creating it if needed."""
    lobby = LOBBIES.get(code)
    if lobby is None:
        # Check if this lobby was recently removed due to being empty
        removal_time = RECENTLY_REMOVED_LOBBIES.get(code)
        if removal_time and (time.time() - removal_time) < REMOVAL_COOLDOWN:
            # Lobby was recently removed, return None to indicate it shouldn't
            # be recreated
            return None

        lobby = _reset_state(GameState())
        LOBBIES[code] = lobby
        load_data(lobby, _lobby_id(lobby), _reset_state)
        if not lobby.target_word:
            pick_new_word(lobby)
            save_data(lobby, _lobby_id(lobby))
    return lobby


def purge_lobbies() -> None:
    """Remove lobbies that are finished or idle beyond ``LOBBY_TTL``.
    
    Performance optimization: Only perform actual purge at most once every
    PURGE_COOLDOWN seconds to avoid O(n) operations on every lobby request.
    """
    global _last_purge_time
    now = time.time()
    
    # Rate limit purge operations - only purge if enough time has passed
    if now - _last_purge_time < PURGE_COOLDOWN:
        return
    
    _last_purge_time = now
    _do_purge_lobbies()


def force_purge_lobbies() -> None:
    """Force immediate purge of lobbies, bypassing rate limiting.
    
    Used for scheduled cleanup operations and background maintenance.
    """
    global _last_purge_time
    _last_purge_time = time.time()
    _do_purge_lobbies()


def _do_purge_lobbies() -> None:
    """Internal implementation of lobby purging."""
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
        if now - removal_time > REMOVAL_COOLDOWN * 2:
            # Keep entries for twice the cooldown period
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


def _definition_worker(word: str, s: GameState) -> None:
    """Background task to fetch a word's definition and persist it."""
    s.definition = fetch_definition(word)
    s.last_word = word
    s.last_definition = s.definition
    save_data_legacy(s)
    broadcast_state(s)


# ---- Game Logic ----


def get_client_ip():
    """Return the client's IP address, accounting for proxies."""
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].split(",")[0]
    return request.remote_addr or "unknown"


def check_api_rate_limit(ip: str) -> bool:
    """Check if the IP has exceeded the API rate limit."""
    now = time.time()
    times = API_REQUEST_TIMES.setdefault(ip, [])
    # Remove timestamps older than the window
    times[:] = [t for t in times if now - t < API_RATE_WINDOW]
    
    if len(times) >= API_RATE_LIMIT:
        return False
    
    times.append(now)
    return True


def check_guess_rate_limit(player_id: str) -> bool:
    """Check if the player has exceeded the guess rate limit."""
    now = time.time()
    times = GUESS_REQUEST_TIMES.setdefault(player_id, [])
    # Remove timestamps older than the window
    times[:] = [t for t in times if now - t < GUESS_RATE_WINDOW]
    
    if len(times) >= GUESS_RATE_LIMIT:
        return False
    
    times.append(now)
    return True


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
            return False, f"Letter {ch.upper()} must be in position {idx + 1}."
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
        # Include player-specific daily double status when requested for a specific player
        payload["daily_double_available"] = emoji in s.daily_double_pending
    else:
        # For broadcasts (SSE), include daily double status for all active players
        payload["daily_double_status"] = {
            player: player in s.daily_double_pending
            for player in s.leaderboard.keys()
        }

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


def broadcast_server_update_notification(message: str = "Server is being updated. Please save your progress.", delay_seconds: int = 5) -> None:
    """Broadcast a server update notification to all connected clients across all lobbies."""
    update_data = {
        "type": "server_update",
        "message": message,
        "delay_seconds": delay_seconds,
        "timestamp": time.time()
    }
    data = json.dumps(update_data)
    
    # Broadcast to all lobbies including the default lobby
    total_clients = 0
    for lobby_state in LOBBIES.values():
        for q in list(lobby_state.listeners):
            try:
                q.put_nowait(data)
                total_clients += 1
            except Exception:
                lobby_state.listeners.discard(q)
    
    logger.info(f"Server update notification sent to {total_clients} clients across {len(LOBBIES)} lobbies")


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
            save_data_legacy()
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
    base_emoji = data.get("emoji")
    player_id = data.get("player_id")
    ip = get_client_ip()
    now = time.time()

    if not base_emoji or not isinstance(base_emoji, str):
        return jsonify({"status": "error", "msg": "Invalid emoji."}), 400

    if not player_id:
        player_id = uuid.uuid4().hex
    new_player = player_id not in current_state.player_map
    logger.info(
        "Emoji request: %s player=%s ip=%s", base_emoji, player_id, ip
    )

    with emoji_lock:
        # Check if player already has an emoji assigned
        prev_emoji = current_state.player_map.get(player_id)

        # If player is requesting the same base emoji they already have
        # (any variant), keep their current emoji
        if prev_emoji and get_base_emoji(prev_emoji) == base_emoji:
            emoji_variant = prev_emoji
        else:
            # Player is changing to a different base emoji or is new
            # Get a unique emoji variant for this base emoji, excluding their
            # current emoji if changing
            existing_emojis = set(current_state.leaderboard.keys())
            if prev_emoji and prev_emoji in existing_emojis:
                existing_emojis.remove(prev_emoji)
            emoji_variant = get_emoji_variant(base_emoji, existing_emojis)

        # If player had a different emoji before, remove the old entry
        if prev_emoji and prev_emoji != emoji_variant:
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
            current_state.leaderboard[emoji_variant] = entry
        else:
            # Create new entry or update existing one
            current_state.leaderboard.setdefault(
                emoji_variant,
                {
                    "ip": ip,
                    "player_id": player_id,
                    "score": 0,
                    "used_yellow": [],
                    "used_green": [],
                    "last_active": now,
                },
            )

        # Update player mappings
        current_state.leaderboard[emoji_variant]["ip"] = ip
        current_state.leaderboard[emoji_variant]["player_id"] = player_id
        current_state.leaderboard[emoji_variant]["last_active"] = now
        current_state.ip_to_emoji[ip] = emoji_variant
        current_state.player_map[player_id] = emoji_variant
        current_state.last_activity = now
        save_data_legacy()

    logger.info(
        "Emoji %s (variant: %s) mapped to player %s (ip %s) new=%s",
        base_emoji,
        emoji_variant,
        player_id,
        ip,
        new_player,
    )
    broadcast_state()
    if new_player:
        log_lobby_joined(_lobby_id(current_state), emoji_variant, ip)

    # Return the variant that was assigned
    return jsonify({
        "status": "ok",
        "player_id": player_id,
        "emoji": emoji_variant,
        "base_emoji": base_emoji
    })


@app.route("/guess", methods=["POST"])
def guess_word():
    """Process a player's guess and update scores and game state."""
    # Apply API rate limiting
    ip = get_client_ip()
    if not check_api_rate_limit(ip):
        return jsonify({"status": "error", "msg": "Too many requests. Please slow down."}), 429
    
    data = request.json or {}
    guess = (data.get("guess") or "").strip().lower()
    # ▶ Prevent duplicates
    emoji = data.get("emoji")
    player_id = data.get("player_id")
    
    # Apply guess-specific rate limiting  
    if player_id and not check_guess_rate_limit(player_id):
        return jsonify({"status": "error", "msg": "Too many guesses. Please wait before trying again."}), 429
    
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
        # Check if this might be a player reconnecting after server restart
        # If the emoji exists in leaderboard but player_id doesn't match,
        # and the IP matches the emoji's registered IP, re-register the player
        # Additional safety: both player_ids should look like UUIDs (server restart scenario)
        if (emoji in current_state.leaderboard and 
            current_state.leaderboard[emoji].get("ip") == ip and
            player_id is not None and
            len(player_id) == 32 and  # UUID hex string length
            all(c in '0123456789abcdef' for c in player_id)):  # Valid hex chars
            old_player_id = current_state.leaderboard[emoji].get("player_id")
            # Also check that old player_id looks like a UUID for safety
            if (old_player_id and len(old_player_id) == 32 and 
                all(c in '0123456789abcdef' for c in old_player_id)):
                # This looks like a server restart scenario - player exists but player_id doesn't match
                # Update the player_id to re-register them automatically
                current_state.leaderboard[emoji]["player_id"] = player_id
                # Update player_map
                current_state.player_map.pop(old_player_id, None)
                current_state.player_map[player_id] = emoji
                logger.info(
                    "Auto-reconnected player %s (old_id=%s, new_id=%s) after server restart", 
                    emoji, old_player_id, player_id
                )
            else:
                return (
                    jsonify({"status": "error", "msg": "Please pick an emoji before playing."}),
                    403,
                )
        else:
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
        # Fetch definition synchronously when game ends
        current_state.definition = fetch_definition(current_state.target_word)
        current_state.last_word = current_state.target_word
        current_state.last_definition = current_state.definition

    # -1 penalty for duplicate guesses with no new yellows/greens
    if points_delta == 0 and not won and not over:
        points_delta -= 1

    current_state.leaderboard[emoji]["score"] += points_delta
    save_data_legacy()
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
        # Check if this might be a player reconnecting after server restart
        if (emoji in current_state.leaderboard and 
            current_state.leaderboard[emoji].get("ip") == ip and
            player_id is not None and
            len(player_id) == 32 and  # UUID hex string length
            all(c in '0123456789abcdef' for c in player_id)):  # Valid hex chars
            old_player_id = current_state.leaderboard[emoji].get("player_id")
            if (old_player_id and len(old_player_id) == 32 and 
                all(c in '0123456789abcdef' for c in old_player_id)):
                # Auto-reconnect the player
                current_state.leaderboard[emoji]["player_id"] = player_id
                current_state.player_map.pop(old_player_id, None)
                current_state.player_map[player_id] = emoji
                logger.info(
                    "Auto-reconnected player %s for hint selection after server restart", emoji
                )
            else:
                return jsonify({"status": "error", "msg": "Invalid player."}), 403
        else:
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
    save_data_legacy()
    broadcast_state()  # Notify other players that daily double was used
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
        current_time = time.time()
        
        if not text:
            return jsonify({"status": "error", "msg": "Empty message."}), 400
            
        if len(text) > 140:
            return jsonify({"status": "error", "msg": "Message too long."}), 400
            
        if (
            emoji not in current_state.leaderboard
            or current_state.leaderboard[emoji].get("player_id") != player_id
        ):
            # Check if this might be a player reconnecting after server restart
            ip = get_client_ip()
            if (emoji in current_state.leaderboard and 
                current_state.leaderboard[emoji].get("ip") == ip and
                player_id is not None and
                len(player_id) == 32 and  # UUID hex string length
                all(c in '0123456789abcdef' for c in player_id)):  # Valid hex chars
                old_player_id = current_state.leaderboard[emoji].get("player_id")
                if (old_player_id and len(old_player_id) == 32 and 
                    all(c in '0123456789abcdef' for c in old_player_id)):
                    # Auto-reconnect the player
                    current_state.leaderboard[emoji]["player_id"] = player_id
                    current_state.player_map.pop(old_player_id, None)
                    current_state.player_map[player_id] = emoji
                    logger.info(
                        "Auto-reconnected player %s for chat after server restart", emoji
                    )
                else:
                    return jsonify({"status": "error", "msg": "Pick an emoji first."}), 400
            else:
                return jsonify({"status": "error", "msg": "Pick an emoji first."}), 400
            
        # Rate limiting: 1 message per second per player
        last_message_time = current_state.chat_rate_limits.get(player_id, 0)
        if current_time - last_message_time < 1.0:
            return jsonify({"status": "error", "msg": "Please wait before sending another message."}), 429
            
        current_state.chat_rate_limits[player_id] = current_time
        current_state.chat_messages.append(
            {"emoji": emoji, "text": text, "ts": current_time}
        )
        current_state.last_activity = current_time
        save_data_legacy()
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
    save_data_legacy()
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
    save_data(state, _lobby_id(state))
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
            # Simple network detection: same IP or same local network
            # (192.168.x.x, 10.x.x.x, etc.)
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

    # For simplicity, check if they share the same first 3 octets for
    # private networks
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
                  16 <= int(parts1[1]) <= 31 and
                  16 <= int(parts2[1]) <= 31 and
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
        # Check if this might be a player reconnecting after server restart
        ip = get_client_ip()
        if (current_state.leaderboard[emoji].get("ip") == ip and
            player_id is not None and
            len(player_id) == 32 and  # UUID hex string length
            all(c in '0123456789abcdef' for c in player_id) and  # Valid hex chars
            stored_player_id and len(stored_player_id) == 32 and 
            all(c in '0123456789abcdef' for c in stored_player_id)):
            # Auto-reconnect the player before allowing them to leave
            current_state.leaderboard[emoji]["player_id"] = player_id
            current_state.player_map.pop(stored_player_id, None)
            current_state.player_map[player_id] = emoji
            logger.info(
                "Auto-reconnected player %s for leave request after server restart", emoji
            )
        else:
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
    save_data_legacy()
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
    Terraform configuration. It forces immediate purge bypassing rate limiting.
    """
    force_purge_lobbies()
    return jsonify({"status": "ok"})


@app.route("/admin/notify-update", methods=["POST"])
def notify_server_update():
    """Notify all connected clients to refresh their page due to server update.
    
    This endpoint can be called by deployment scripts to trigger a graceful
    page refresh for all connected clients when the server is being updated.
    
    Request body (optional JSON):
    {
        "message": "Custom message to display to users",
        "delay_seconds": 10  // How long to wait before refresh (default: 5)
    }
    """
    data = request.get_json(silent=True) or {}
    message = data.get("message", "Server is being updated. Please save your progress.")
    delay_seconds = data.get("delay_seconds", 5)
    
    # Validate delay_seconds is reasonable (1-60 seconds)
    if not isinstance(delay_seconds, int) or delay_seconds < 1 or delay_seconds > 60:
        return jsonify({"status": "error", "msg": "delay_seconds must be an integer between 1 and 60"}), 400
    
    # Log the update notification
    logger.info(f"Server update notification triggered: message='{message}', delay={delay_seconds}s")
    
    # Broadcast to all connected clients
    broadcast_server_update_notification(message, delay_seconds)
    
    return jsonify({
        "status": "ok", 
        "message": message,
        "delay_seconds": delay_seconds,
        "lobbies_notified": len(LOBBIES)
    })


@app.route("/health")
def health() -> Any:
    """Enhanced health check for production readiness."""
    try:
        from .game_logic import WORDS
    except ImportError:
        from game_logic import WORDS
    missing = []
    warnings = []
    
    # Check critical assets
    if not WORDS:
        missing.append("word_list")
    if not OFFLINE_DEFINITIONS_FILE.exists():
        missing.append("definitions_cache")
    
    # Check production configuration
    if os.environ.get("FLASK_ENV") == "production":
        if not os.environ.get("SECRET_KEY"):
            missing.append("secret_key")
        if app.secret_key == "dev_key_for_local_testing_only":
            missing.append("production_secret_key")
    
    # Check Redis connection if configured
    if REDIS_URL and redis_client:
        try:
            redis_client.ping()
        except Exception as e:
            warnings.append(f"redis_connection_issue: {str(e)}")
    
    # Check file system permissions
    try:
        # Check if we can write to the game file directory
        GAME_FILE.parent.mkdir(exist_ok=True)
        test_file = GAME_FILE.parent / "health_check.tmp"
        test_file.write_text("test")
        test_file.unlink()
    except Exception as e:
        warnings.append(f"filesystem_write_issue: {str(e)}")
    
    # Return status
    if missing:
        return jsonify({
            "status": "unhealthy", 
            "missing": missing,
            "warnings": warnings,
            "timestamp": time.time()
        }), 503
    
    return jsonify({
        "status": "ok",
        "warnings": warnings,
        "active_lobbies": len(LOBBIES),
        "words_loaded": len(WORDS),
        "redis_enabled": bool(redis_client),
        "timestamp": time.time()
    })


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


@app.route("/enhanced-scaling-test")
def enhanced_scaling_test():
    """Serve the enhanced scaling test page."""
    root = STATIC_DIR if (STATIC_DIR / "enhanced-scaling-test.html").exists() else DEV_FRONTEND_DIR
    return send_from_directory(str(root), "enhanced-scaling-test.html")


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
    load_data_legacy()
    if not current_state.target_word:
        pick_new_word(current_state)
        save_data_legacy()

    # Launch a background thread that periodically purges idle lobbies
    def _purge_loop() -> None:
        while True:
            time.sleep(600)
            try:
                force_purge_lobbies()
            except Exception as e:  # pragma: no cover - best effort cleanup
                logger.warning("Purge thread error: %s", e)

    t = threading.Thread(target=_purge_loop, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5001)
