"""
Squad votes for resetting a word mid-round.

A round is *settled* once the word is found or every row is used. Settled
rounds keep their points, and starting the next word needs no vote.

Resetting an unsettled round needs a squad vote. When the vote passes, every
point earned or lost during that round is refunded, so a reset can never be
used to wipe out a round someone is losing.
"""
import secrets

VOTE_SECONDS = 30
# A failed vote can't be called again straight away, so nobody can spam it.
VOTE_COOLDOWN_SECONDS = 20
# Matches the five-minute window after which the leaderboard dims a player.
ACTIVE_WINDOW_SECONDS = 5 * 60


def round_in_progress(s) -> bool:
    """True while the word is unsolved and at least one guess has been made."""
    return not s.is_over and bool(s.guesses)


def record_points(s, emoji: str, delta) -> None:
    """Remember a score change so the round can be refunded later."""
    s.round_points[emoji] = s.round_points.get(emoji, 0) + delta


def refund_round(s) -> dict:
    """Undo every score change from the current, unsettled round."""
    refunded = {}
    for emoji, delta in s.round_points.items():
        entry = s.leaderboard.get(emoji)
        if entry is not None and delta:
            entry["score"] -= delta
            refunded[emoji] = delta
    # Daily Double hints earned in the voided round are voided with it.
    for emoji in s.daily_double_winners:
        s.daily_double_pending.pop(emoji, None)
    s.round_points.clear()
    return refunded


def forget_player(s, emoji: str) -> None:
    """Drop a departed player's round points so a rejoin starts clean."""
    s.round_points.pop(emoji, None)


def rename_player(s, old: str, new: str) -> None:
    """Carry round points and votes across an emoji change."""
    if old in s.round_points:
        s.round_points[new] = s.round_points.pop(old)
    vote = s.reset_vote
    if vote:
        for key in ("eligible", "yes", "no"):
            vote[key] = [new if e == old else e for e in vote[key]]
        if vote["starter"] == old:
            vote["starter"] = new


def _eligible_voters(s, starter: str, now: float) -> list:
    voters = [
        emoji
        for emoji, entry in s.leaderboard.items()
        if now - entry.get("last_active", 0) <= ACTIVE_WINDOW_SECONDS
    ]
    if starter not in voters:
        voters.append(starter)
    return voters


def _tally(s, vote):
    # Players who left since the vote started no longer count.
    eligible = [e for e in vote["eligible"] if e in s.leaderboard]
    yes = [e for e in vote["yes"] if e in eligible]
    no = [e for e in vote["no"] if e in eligible]
    needed = len(eligible) // 2 + 1
    return eligible, yes, no, needed


def _finish(s, outcome: str, now: float) -> str:
    vote = s.reset_vote
    _, yes, no, needed = _tally(s, vote)
    s.reset_vote_result = {
        "id": vote["id"],
        "outcome": outcome,
        "starter": vote["starter"],
        "yes": len(yes),
        "no": len(no),
        "needed": needed,
        "ts": now,
    }
    s.reset_vote = None
    if outcome in ("failed", "expired"):
        s.reset_vote_cooldown_until = now + VOTE_COOLDOWN_SECONDS
    return outcome


def settle(s, now: float):
    """Close the open vote if it has been decided or has run out of time.

    Returns ``"passed"``, ``"failed"`` or ``"expired"`` when the vote closed
    during this call, otherwise ``None``. The caller resets on ``"passed"``.
    """
    vote = s.reset_vote
    if not vote:
        return None
    if not round_in_progress(s):
        # The word was found or the rows ran out: the round is settled.
        return _finish(s, "settled", now)
    eligible, yes, no, needed = _tally(s, vote)
    if len(yes) >= needed:
        return _finish(s, "passed", now)
    if len(eligible) - len(no) < needed:
        return _finish(s, "failed", now)
    if now >= vote["expires"]:
        return _finish(s, "expired", now)
    return None


def cast(s, emoji: str, choice: str, now: float):
    """Start a vote or record a ballot. Returns ``(outcome, error)``."""
    if choice not in ("yes", "no"):
        return None, "Vote yes or no."
    settle(s, now)
    vote = s.reset_vote
    if vote is None:
        if choice != "yes":
            return None, "There's no vote to answer."
        wait = s.reset_vote_cooldown_until - now
        if wait > 0:
            return None, f"The squad just voted. Try again in {int(wait) + 1}s."
        s.reset_vote = {
            "id": secrets.token_hex(4),
            "starter": emoji,
            "eligible": _eligible_voters(s, emoji, now),
            "yes": [emoji],
            "no": [],
            "started": now,
            "expires": now + VOTE_SECONDS,
        }
    else:
        if emoji not in vote["eligible"]:
            return None, "This vote started before you joined. Sit this one out."
        mine, other = ("yes", "no") if choice == "yes" else ("no", "yes")
        if emoji not in vote[mine]:
            vote[mine].append(emoji)
        if emoji in vote[other]:
            vote[other].remove(emoji)
    return settle(s, now) or "pending", None


def public_view(s, now: float):
    """Describe the open vote for clients, hiding one that has run out."""
    vote = s.reset_vote
    if not vote or now >= vote["expires"]:
        return None
    eligible, yes, no, needed = _tally(s, vote)
    return {
        "id": vote["id"],
        "starter": vote["starter"],
        "eligible": eligible,
        "yes": yes,
        "no": no,
        "needed": needed,
        "seconds_left": max(0.0, round(vote["expires"] - now, 1)),
        "duration": VOTE_SECONDS,
    }


def public_result(s, now: float):
    """Describe the last finished vote so every client can announce it once."""
    result = s.reset_vote_result
    if not result:
        return None
    view = {k: v for k, v in result.items() if k != "ts"}
    view["age"] = round(now - result.get("ts", now), 1)
    return view
