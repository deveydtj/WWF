"""
Data models for the WordSquad game.
"""
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GameState:
    """Represents the complete state of a game lobby."""
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
    chat_rate_limits: dict = field(default_factory=dict)  # player_id -> last_message_time
    listeners: set = field(default_factory=set)
    daily_double_index: int | None = None
    daily_double_winners: set = field(default_factory=set)
    daily_double_pending: dict = field(default_factory=dict)
    host_token: str | None = None
    phase: str = "waiting"
    last_activity: float = field(default_factory=time.time)


# Color variants for duplicate emojis
EMOJI_VARIANTS = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"]


def get_emoji_variant(base_emoji: str, existing_emojis: set) -> str:
    """
    Generate a variant of the base emoji if duplicates exist.

    Args:
        base_emoji: The base emoji string (e.g., "🐶")
        existing_emojis: Set of existing emoji keys in the leaderboard

    Returns:
        A unique emoji variant string (e.g., "🐶-red", "🐶-blue")
    """
    # If base emoji is not taken, return it as-is
    if base_emoji not in existing_emojis:
        return base_emoji

    # Try each color variant until we find an available one
    for variant in EMOJI_VARIANTS:
        variant_emoji = f"{base_emoji}-{variant}"
        if variant_emoji not in existing_emojis:
            return variant_emoji

    # If all predefined variants are taken, use numbered variants
    counter = len(EMOJI_VARIANTS) + 1
    while True:
        variant_emoji = f"{base_emoji}-{counter}"
        if variant_emoji not in existing_emojis:
            return variant_emoji
        counter += 1


def get_base_emoji(emoji_variant: str) -> str:
    """
    Extract the base emoji from a variant.

    Args:
        emoji_variant: Either a base emoji or variant (e.g., "🐶" or "🐶-red")

    Returns:
        The base emoji string (e.g., "🐶")
    """
    if "-" in emoji_variant:
        return emoji_variant.split("-")[0]
    return emoji_variant