"""
Data persistence layer for WordSquad.
Handles saving/loading game state to/from Redis and file system.
"""
import json
import logging
import os
import time
from pathlib import Path

try:
    from .models import GameState
except ImportError:
    # Handle running as script instead of module
    from models import GameState

logger = logging.getLogger(__name__)

# Global variables - will be initialized by init_persistence
redis_client = None
GAME_FILE = None
LOBBIES_FILE = None 
DEFAULT_LOBBY = None
LOBBIES = None


def init_persistence(redis_client_instance, game_file: Path, lobbies_file: Path, default_lobby_name: str, lobbies_dict: dict):
    """Initialize persistence layer with required dependencies."""
    global redis_client, GAME_FILE, LOBBIES_FILE, DEFAULT_LOBBY, LOBBIES
    redis_client = redis_client_instance
    GAME_FILE = game_file
    LOBBIES_FILE = lobbies_file
    DEFAULT_LOBBY = default_lobby_name
    LOBBIES = lobbies_dict


def _lobby_id(s: GameState) -> str:
    """Return the lobby code for the given GameState."""
    for cid, state in LOBBIES.items():
        if state is s:
            return cid
    return DEFAULT_LOBBY


def save_data(s: GameState, lobby_code: str = None):
    """Save game state to Redis and/or file system."""
    if lobby_code is None:
        code = _lobby_id(s)
    else:
        code = lobby_code
    
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


def load_data(s: GameState, lobby_code: str = None, reset_state_func=None):
    """Load game state from Redis or file system."""
    if lobby_code is None:
        code = _lobby_id(s)
    else:
        code = lobby_code

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
                if reset_state_func:
                    reset_state_func(s)
                data = None
    elif data is None and code != DEFAULT_LOBBY and os.path.exists(LOBBIES_FILE):
        try:
            with open(LOBBIES_FILE) as f:
                data_all = json.load(f)
            data = data_all.get(code)
        except Exception:
            data = None

    if not data:
        if reset_state_func:
            reset_state_func(s)
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
        if reset_state_func:
            reset_state_func(s)