from dataclasses import dataclass, field
import time


@dataclass
class Lobby:
    """Container for per-lobby state and metadata."""
    id: str
    host_token: str
    state: dict = field(default_factory=dict)
    players: dict = field(default_factory=dict)
    chat: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
