"""The default /game board must survive a restart under gunicorn.

Production runs ``gunicorn backend.server:app``, which imports the module and
never runs its ``__main__`` block. Each test imports the server in a fresh
interpreter the same way, as happens on every wake, deploy and crash.
"""
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

PLAY = textwrap.dedent("""
    import json, sys
    from backend.server import app, current_state
    client = app.test_client()
    client.post('/age-check', json={'age': 30})
    out = {'target': current_state.target_word, 'board': [g['guess'] for g in current_state.guesses],
           'players': sorted(current_state.leaderboard)}
    emoji = client.post('/emoji', json={'emoji': sys.argv[1], 'player_id': sys.argv[2] or None}).get_json()
    from backend.game_logic import WORDS
    greens = {i: g['guess'][i] for g in current_state.guesses for i, r in enumerate(g['result']) if r == 'correct'}
    found = {g['guess'][i] for g in current_state.guesses for i, r in enumerate(g['result']) if r != 'absent'}
    used = {g['guess'] for g in current_state.guesses} | {current_state.target_word}
    # A legal hard-mode guess that doesn't end the round.
    word = next(w for w in sorted(WORDS) if w not in used and all(w[i] == c for i, c in greens.items())
                and found <= set(w))
    guess = client.post('/guess', json={'guess': word, 'emoji': emoji['emoji'],
                                         'player_id': emoji['player_id']}, headers={'X-WordSquad-Request': '1'})
    out.update(guess_status=guess.status_code, player_id=emoji['player_id'], guessed=word)
    print(json.dumps(out))
""")


def boot_and_play(tmp_path, emoji, player_id=""):
    env = dict(os.environ, GAME_FILE=str(tmp_path / "game_persist.json"),
               LOBBIES_FILE=str(tmp_path / "lobbies.json"),
               PRIVATE_ROOMS_FILE=str(tmp_path / "private-rooms.json"))
    env.pop("REDIS_URL", None)
    env.pop("FLASK_ENV", None)
    result = subprocess.run([sys.executable, "-c", PLAY, emoji, player_id], cwd=REPO, env=env,
                            capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stderr[-2000:]
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_first_boot_has_a_word_and_accepts_guesses(tmp_path):
    first = boot_and_play(tmp_path, "🦊")
    assert first["target"], "an imported server must pick a word for /game"
    assert first["guess_status"] == 200


def test_board_and_players_survive_a_restart(tmp_path):
    first = boot_and_play(tmp_path, "🦊")
    saved = json.loads((tmp_path / "game_persist.json").read_text())
    second = boot_and_play(tmp_path, "🦊", first["player_id"])
    assert second["target"] == saved["target_word"]
    assert second["board"] == [first["guessed"]]
    assert "🦊" in second["players"]
    assert second["guess_status"] == 200


def test_importing_does_not_write_files(tmp_path):
    env = dict(os.environ, GAME_FILE=str(tmp_path / "game_persist.json"),
               LOBBIES_FILE=str(tmp_path / "lobbies.json"))
    env.pop("REDIS_URL", None)
    env.pop("FLASK_ENV", None)
    code = "from backend.server import current_state; assert current_state.target_word"
    subprocess.run([sys.executable, "-c", code], cwd=REPO, env=env, check=True, timeout=60)
    assert not (tmp_path / "game_persist.json").exists()
