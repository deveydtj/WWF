"""
Analytics and logging functionality for WordSquad.
Tracks game events for analysis and monitoring.
"""
import json
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

# Global analytics file path - will be initialized by init_analytics
ANALYTICS_FILE = None


def init_analytics(analytics_file: Path):
    """Initialize analytics with the target log file."""
    global ANALYTICS_FILE
    ANALYTICS_FILE = analytics_file


def _log_event(event: str, **fields) -> None:
    """Write a structured analytics event to the analytics file."""
    if not ANALYTICS_FILE:
        return
        
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
    """Log a player joining a lobby."""
    _log_event("lobby_joined", lobby_id=lobby_id, emoji=emoji, ip=ip)


def log_lobby_finished(lobby_id: str, ip: str | None = None) -> None:
    """Log a lobby finishing or being reset."""
    data = {"lobby_id": lobby_id}
    if ip:
        data["ip"] = ip
    _log_event("lobby_finished", **data)


def log_player_kicked(lobby_id: str, emoji: str) -> None:
    """Log a player being kicked from a lobby."""
    _log_event("player_kicked", lobby_id=lobby_id, emoji=emoji)


def log_game_event(event: str, lobby_id: str, emoji: str = None, **extra_fields) -> None:
    """Log a general game event with optional extra fields."""
    data = {"lobby_id": lobby_id}
    if emoji:
        data["emoji"] = emoji
    data.update(extra_fields)
    _log_event(event, **data)