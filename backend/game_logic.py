"""
Core game logic for WordSquad.
"""
import json
import logging
import random
import re
import string
import threading
import time
from pathlib import Path

try:
    from .models import GameState
except ImportError:
    # Handle running as script instead of module
    from models import GameState

logger = logging.getLogger(__name__)

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

# Game constants
MAX_ROWS = 6

# Global word list - will be initialized by init_game_assets
WORDS: list[str] = []
WORDS_LOADED: bool = False

# File paths - will be set by init_game_assets
OFFLINE_DEFINITIONS_FILE = None


def init_game_assets(words_file: Path, offline_definitions_file: Path) -> None:
    """Initialize game assets - word list and validate definitions cache."""
    global WORDS, WORDS_LOADED, OFFLINE_DEFINITIONS_FILE
    
    OFFLINE_DEFINITIONS_FILE = offline_definitions_file
    
    try:
        with open(words_file) as f:
            # Clear the existing list and extend it with new words
            # This preserves the list object that was imported by other modules
            WORDS.clear()
            WORDS.extend([line.strip().lower() for line in f if len(line.strip()) == 5])
        WORDS_LOADED = True
        logger.info(f"Loaded {len(WORDS)} words from {words_file}")
    except Exception as e:  # pragma: no cover - startup validation
        logger.error("Startup abort: could not load word list '%s': %s", words_file, e)
        raise SystemExit(1)
    if not WORDS:
        logger.error("Startup abort: word list '%s' contains no words", words_file)
        raise SystemExit(1)
    
    try:
        with open(offline_definitions_file) as f:
            json.load(f)
    except Exception as e:  # pragma: no cover - startup validation
        logger.error(
            "Startup abort: could not parse definitions file '%s': %s",
            offline_definitions_file,
            e,
        )
        raise SystemExit(1)


def generate_lobby_code() -> str:
    """Return a random six-character lobby code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=6))


def pick_new_word(s: GameState) -> None:
    """Choose a new target word and reset all in-memory game state."""
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


def sanitize_definition(text: str) -> str:
    """Clean up a dictionary definition for safe display."""
    if not text:
        return ""
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Convert common HTML entities
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def fetch_definition(word: str):
    """Look up a word's definition online with an offline JSON fallback."""
    # Import here to avoid circular imports
    try:
        import requests
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
        resp = requests.get(url, headers=headers, timeout=3)  # Reduced from 5 to 3 seconds
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


def start_definition_lookup(word: str, game_state: GameState, save_data_func, broadcast_func) -> threading.Thread:
    """Start asynchronous definition lookup for the solved word."""
    def _definition_worker(word: str, s: GameState) -> None:
        """Background task to fetch a word's definition and persist it."""
        s.definition = fetch_definition(word)
        logger.info(f"Definition lookup complete for '{word}': {s.definition or 'None'}")
        s.last_word = word
        s.last_definition = s.definition
        save_data_func(s)
        broadcast_func(s)
    
    t = threading.Thread(target=_definition_worker, args=(word, game_state))
    t.daemon = True
    t.start()
    return t