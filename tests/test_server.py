import sys
import types
import importlib
import json
import pytest
import importlib.util
from pathlib import Path


def load_server():
    # create flask stub module for isolated server import
    flask_stub = types.ModuleType('flask')

    class Headers(dict):
        def getlist(self, key):
            val = self.get(key)
            if val is None:
                return []
            if isinstance(val, list):
                return val
            return [val]

    class DummyRequest:
        def __init__(self):
            self.headers = Headers()
            self.remote_addr = "127.0.0.1"
            self.json = None
            self.endpoint = None

        def get_json(self, silent=False):
            return self.json

    request = DummyRequest()

    def jsonify(*args, **kwargs):
        if args:
            d = dict(args[0])
            d.update(kwargs)
            return d
        return kwargs

    class Flask:
        def __init__(self, name, **kwargs):
            self.name = name
            self.static_folder = kwargs.get('static_folder')
            self.static_url_path = kwargs.get('static_url_path')

        def route(self, *a, **kw):
            def decorator(func):
                return func

            return decorator

        def after_request(self, func):
            """Mock implementation of Flask's after_request decorator."""
            return func

        def run(self, *a, **kw):
            pass

    def send_from_directory(directory, filename):
        return f"{directory}/{filename}"

    flask_stub.Flask = Flask
    flask_stub.request = request
    flask_stub.jsonify = jsonify
    flask_stub.send_from_directory = send_from_directory

    cors_stub = types.ModuleType('flask_cors')
    cors_stub.CORS = lambda app: None

    original_flask = sys.modules.get('flask')
    original_flask_cors = sys.modules.get('flask_cors')
    sys.modules['flask'] = flask_stub
    sys.modules['flask_cors'] = cors_stub

    try:
        server_path = Path(__file__).resolve().parents[1] / "backend" / "server.py"
        spec = importlib.util.spec_from_file_location("backend.server_stub", server_path)
        server = importlib.util.module_from_spec(spec)
        server.__package__ = "backend"
        sys.modules[spec.name] = server
        spec.loader.exec_module(server)  # type: ignore[arg-type]
    finally:
        # Restore real flask modules for other tests
        if original_flask is not None:
            sys.modules['flask'] = original_flask
        else:
            sys.modules.pop('flask', None)

        if original_flask_cors is not None:
            sys.modules['flask_cors'] = original_flask_cors
        else:
            sys.modules.pop('flask_cors', None)

    return server, request


@pytest.fixture
def server_env(tmp_path):
    server, request = load_server()
    server.LOBBIES_FILE = tmp_path / 'lobbies.json'
    # Disable budget mode for tests to allow online dictionary lookups to be tested
    server._game_logic.BUDGET_MODE = False
    server._game_logic.DISABLE_ONLINE_DICTIONARY = False
    # basic game state
    server.WORDS = ['apple', 'enter', 'crane', 'crate', 'trace']
    server.current_state.target_word = 'apple'
    server.current_state.guesses.clear()
    server.current_state.is_over = False
    server.current_state.found_greens = set()
    server.current_state.found_yellows = set()
    server.current_state.leaderboard.clear()
    server.current_state.leaderboard['😀'] = {
        'ip': '1',
        'player_id': 'p1',
        'score': 0,
        'used_yellow': [],
        'used_green': [],
        'last_active': 0,
    }
    server.current_state.leaderboard['😎'] = {
        'ip': '2',
        'player_id': 'p2',
        'score': 3,
        'used_yellow': [],
        'used_green': [],
        'last_active': 0,
    }
    server.current_state.player_map = {'p1': '😀', 'p2': '😎'}
    server.current_state.host_token = 'HOSTTOKEN'
    return server, request


def test_result_for_guess(server_env):
    server, _ = server_env
    result = server.result_for_guess('crate', 'trace')
    assert result == ['present', 'correct', 'correct', 'present', 'correct']


def test_duplicate_guess_and_sorted_leaderboard(server_env):
    server, request = server_env

    request.json = {'guess': 'enter', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    first = server.guess_word()

    lb = first['state']['leaderboard']
    scores = [e['score'] for e in lb]
    assert scores == sorted(scores, reverse=True)

    request.json = {'guess': 'enter', 'emoji': '😀', 'player_id': 'p1'}
    duplicate = server.guess_word()
    assert isinstance(duplicate, tuple)
    data, status = duplicate
    assert status == 400
    assert data['status'] == 'error'
    assert 'already guessed' in data['msg']


def test_validate_hard_mode_missing_letter(server_env):
    server, _ = server_env

    # Prior guess finds a yellow 'E'
    result = server.result_for_guess('enter', server.current_state.target_word)
    server.current_state.guesses.append({'guess': 'enter', 'result': result, 'emoji': '😀', 'player_id': 'p1'})

    ok, msg = server.validate_hard_mode('crank')
    assert not ok
    assert 'E' in msg


def test_validate_hard_mode_wrong_green_position(server_env):
    server, _ = server_env

    # Prior guess reveals 'E' is green in position 5
    result = server.result_for_guess('crane', server.current_state.target_word)
    server.current_state.guesses.append({'guess': 'crane', 'result': result, 'emoji': '😀', 'player_id': 'p1'})

    ok, msg = server.validate_hard_mode('enter')
    assert not ok
    assert 'position 5' in msg


def test_validate_hard_mode_valid_guess(server_env):
    server, _ = server_env

    # Multiple prior guesses accumulating constraints
    r1 = server.result_for_guess('enter', server.current_state.target_word)
    server.current_state.guesses.append({'guess': 'enter', 'result': r1, 'emoji': '😀', 'player_id': 'p1'})
    r2 = server.result_for_guess('crane', server.current_state.target_word)
    server.current_state.guesses.append({'guess': 'crane', 'result': r2, 'emoji': '😀', 'player_id': 'p1'})

    ok, msg = server.validate_hard_mode('trace')
    assert ok
    assert msg == ''


def test_get_client_ip_remote_addr(server_env):
    server, request = server_env
    request.remote_addr = '10.1.1.1'
    assert server.get_client_ip() == '10.1.1.1'


def test_get_client_ip_x_forwarded_for(server_env):
    server, request = server_env
    request.remote_addr = '10.1.1.1'
    request.headers['X-Forwarded-For'] = '1.2.3.4, 5.6.7.8'
    assert server.get_client_ip() == '1.2.3.4'


def test_set_emoji_registers_and_maps(server_env):
    server, request = server_env

    request.json = {'emoji': '🤖', 'player_id': 'p1'}
    request.remote_addr = '3'
    resp = server.set_emoji()

    assert resp['status'] == 'ok'
    assert server.current_state.leaderboard['🤖']['ip'] == '3'
    assert server.current_state.leaderboard['🤖']['player_id']
    pid = server.current_state.leaderboard['🤖']['player_id']
    assert server.current_state.player_map[pid] == '🤖'


def test_set_emoji_duplicate_different_ip(server_env):
    server, request = server_env

    request.json = {'emoji': '😀', 'player_id': 'p3'}
    request.remote_addr = '3'
    resp = server.set_emoji()

    # Now with emoji variants, duplicates should succeed with a variant
    assert isinstance(resp, dict)  # Should return success dict, not error tuple
    assert resp['status'] == 'ok'
    assert resp['emoji'] == '😀-red'  # Should get first variant
    assert resp['base_emoji'] == '😀'
    assert 'p3' in server.current_state.player_map


def test_set_emoji_changes_migrate_score(server_env):
    server, request = server_env

    # establish initial mapping for ip '1'
    server.current_state.leaderboard['😀']['score'] = 5
    request.json = {'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp1 = server.set_emoji()
    assert resp1['status'] == 'ok'
    pid1 = server.current_state.leaderboard['😀']['player_id']
    assert server.current_state.player_map[pid1] == '😀'

    # change to a new emoji
    request.json = {'emoji': '🥳', 'player_id': 'p1'}
    resp2 = server.set_emoji()

    assert resp2['status'] == 'ok'
    pid_new = server.current_state.leaderboard['🥳']['player_id']
    assert server.current_state.player_map[pid_new] == '🥳'
    assert '🥳' in server.current_state.leaderboard
    assert '😀' not in server.current_state.leaderboard
    assert server.current_state.leaderboard['🥳']['score'] == 5


def test_two_players_same_ip_do_not_override(server_env):
    server, request = server_env
    server.current_state.leaderboard.clear()
    server.current_state.player_map.clear()

    request.json = {'emoji': '🤖', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp1 = server.set_emoji()
    assert resp1['status'] == 'ok'

    request.json = {'emoji': '😀', 'player_id': 'p2'}
    request.remote_addr = '1'
    resp2 = server.set_emoji()
    assert resp2['status'] == 'ok'

    assert server.current_state.leaderboard['🤖']['player_id'] == 'p1'
    assert server.current_state.leaderboard['😀']['player_id'] == 'p2'


def test_state_get_returns_sorted_leaderboard(server_env):
    server, request = server_env

    request.method = 'GET'
    request.json = None
    state = server.state()

    lb_scores = [entry['score'] for entry in state['leaderboard']]
    assert lb_scores == sorted(lb_scores, reverse=True)
    assert state['guesses'] == []
    assert not state['is_over']
    assert state['target_word'] is None


def test_state_post_updates_last_active_and_persists(tmp_path, server_env):
    server, request = server_env

    game_file = tmp_path / 'game.json'
    server.GAME_FILE = str(game_file)
    
    # Update the persistence module's GAME_FILE variable to match
    import backend.data_persistence
    backend.data_persistence.GAME_FILE = game_file

    before = server.current_state.leaderboard['😀']['last_active']
    request.method = 'POST'
    request.json = {'emoji': '😀', 'player_id': 'p1'}
    server.state()

    assert server.current_state.leaderboard['😀']['last_active'] > before

    with open(game_file) as f:
        data = json.load(f)

    assert data['leaderboard']['😀']['last_active'] == server.current_state.leaderboard['😀']['last_active']


def test_guess_word_correct_word_wins_game(server_env, monkeypatch):
    server, request = server_env

    monkeypatch.setattr(server, 'fetch_definition', lambda w: 'def')

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['won'] is True
    assert resp['over'] is True
    assert server.current_state.is_over
    assert server.current_state.winner_emoji == '😀'
    assert resp['pointsDelta'] == 9
    assert server.current_state.leaderboard['😀']['score'] == 9

    # After game over, resetting should archive game and start fresh
    prev_guesses = list(server.current_state.guesses)
    prev_word = server.current_state.target_word
    monkeypatch.setattr(server.random, 'choice', lambda words: 'enter')
    reset = server.reset_game()

    assert reset['status'] == 'ok'
    assert server.current_state.past_games[-1] == prev_guesses
    assert server.current_state.target_word == 'enter'
    assert server.current_state.target_word != prev_word
    assert server.current_state.guesses == []
    assert not server.current_state.is_over


@pytest.mark.parametrize('word', ['appl', 'zzzzz'])
def test_guess_word_invalid_word_returns_400(server_env, word):
    server, request = server_env

    request.json = {'guess': word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 400
    assert data['status'] == 'error'


def test_guess_word_invalid_word_duplicate_returns_400(server_env):
    server, request = server_env

    request.json = {'guess': 'zzzzz', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    request.json = {'guess': 'zzzzz', 'emoji': '😀', 'player_id': 'p1'}
    dup = server.guess_word()

    assert isinstance(dup, tuple)
    data, status = dup
    assert status == 400
    assert data['status'] == 'error'


def test_guess_word_after_game_over_returns_403(server_env):
    server, request = server_env

    server.current_state.is_over = True
    request.json = {'guess': 'crate', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 403
    assert 'over' in data['msg'].lower()


def test_guess_without_player_id_reregisters(server_env):
    server, request = server_env

    request.json = {'guess': 'enter', 'emoji': '🤖', 'player_id': None}
    request.remote_addr = '3'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    assert resp[1] == 403

    # Frontend would re-register the player and retry the guess
    request.json = {'emoji': '🤖', 'player_id': None}
    reg = server.set_emoji()
    pid = reg['player_id']

    request.json = {'guess': 'enter', 'emoji': '🤖', 'player_id': pid}
    request.remote_addr = '3'
    success = server.guess_word()

    assert success['status'] == 'ok'


def test_server_restart_player_auto_reconnection_fix(server_env):
    """Test that players are automatically reconnected after server restart."""
    server, request = server_env
    
    # Player registers and makes a guess
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '1'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    request.json = {'guess': 'crane', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '1'
    first_guess = server.guess_word()
    assert first_guess['status'] == 'ok'
    
    # Simulate server restart scenario: emoji exists but player_id is mismatched
    # This simulates what happens when:
    # 1. Server restarts and state is loaded from persistence
    # 2. Client tries to make request with old player_id (from before restart)
    # 3. The emoji exists but the player_id doesn't match
    
    # Save the current leaderboard entry
    saved_entry = dict(server.current_state.leaderboard['🎮'])
    
    # Create a mismatched player_id scenario (simulating server restart)
    # Use a realistic UUID that would be generated after restart
    import uuid
    restart_player_id = uuid.uuid4().hex
    server.current_state.leaderboard['🎮']['player_id'] = restart_player_id
    server.current_state.player_map.pop(original_player_id, None)
    server.current_state.player_map[restart_player_id] = '🎮'
    
    # Try to make a guess with the original player_id (should auto-reconnect)
    request.json = {'guess': 'trace', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '1'  # Same IP as original registration
    second_guess = server.guess_word()
    
    # The fix should automatically reconnect the player instead of rejecting them
    assert not isinstance(second_guess, tuple), f"Expected success but got error: {second_guess}"
    assert second_guess['status'] == 'ok'
    
    # Verify that the player was automatically reconnected
    assert server.current_state.leaderboard['🎮']['player_id'] == original_player_id
    assert server.current_state.player_map[original_player_id] == '🎮'
    assert restart_player_id not in server.current_state.player_map
    
    print("✓ Player was successfully auto-reconnected after server restart!")


def test_server_restart_player_auto_reconnection_wrong_ip_rejected(server_env):
    """Test that auto-reconnection is rejected for wrong IP to prevent hijacking."""
    server, request = server_env
    
    # Player registers from IP '1'
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '1'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    # Simulate server restart with mismatched player_id
    import uuid
    restart_player_id = uuid.uuid4().hex
    server.current_state.leaderboard['🎮']['player_id'] = restart_player_id
    server.current_state.player_map.pop(original_player_id, None)
    server.current_state.player_map[restart_player_id] = '🎮'
    
    # Try to reconnect from different IP - should be rejected
    request.json = {'guess': 'trace', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '2'  # Different IP than original registration
    second_guess = server.guess_word()
    
    # Should be rejected since IP doesn't match
    assert isinstance(second_guess, tuple)
    data, status = second_guess
    assert status == 403
    assert "Please pick an emoji before playing" in data['msg']
    
    print("✓ Auto-reconnection properly rejected for mismatched IP!")


def test_server_restart_player_auto_reconnection_non_uuid_rejected(server_env):
    """Test that auto-reconnection is rejected for non-UUID player_ids to prevent abuse."""
    server, request = server_env
    
    # Player registers 
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '1'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    # Simulate someone trying to hijack with a simple non-UUID player_id
    server.current_state.leaderboard['🎮']['player_id'] = 'simple_string'
    server.current_state.player_map.pop(original_player_id, None)
    server.current_state.player_map['simple_string'] = '🎮'
    
    # Try to reconnect with original UUID - should be rejected because 
    # stored player_id is not a UUID (doesn't look like server restart)
    request.json = {'guess': 'trace', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '1'  # Same IP
    second_guess = server.guess_word()
    
    # Should be rejected since stored player_id doesn't look like UUID
    assert isinstance(second_guess, tuple)
    data, status = second_guess
    assert status == 403
    assert "Please pick an emoji before playing" in data['msg']
    
    print("✓ Auto-reconnection properly rejected for non-UUID stored player_id!")


def test_server_restart_player_auto_reconnection_wrong_ip_rejected(server_env):
    """Test that auto-reconnection is rejected for wrong IP to prevent hijacking."""
    server, request = server_env
    
    # Player registers from IP '1'
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '1'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    # Simulate server restart with mismatched player_id
    server.current_state.leaderboard['🎮']['player_id'] = 'different_player_id'
    server.current_state.player_map.pop(original_player_id, None)
    server.current_state.player_map['different_player_id'] = '🎮'
    
    # Try to reconnect from different IP - should be rejected
    request.json = {'guess': 'trace', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '2'  # Different IP than original registration
    second_guess = server.guess_word()
    
    # Should be rejected since IP doesn't match
    assert isinstance(second_guess, tuple)
    data, status = second_guess
    assert status == 403
    assert "Please pick an emoji before playing" in data['msg']
    
    print("✓ Auto-reconnection properly rejected for mismatched IP!")


def test_state_endpoint_auto_reconnection_fix(server_env):
    """Test that players are automatically reconnected on /state requests after server restart."""
    server, request = server_env
    
    # Player registers and gets assigned an emoji
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '192.168.1.100'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    # Verify player is registered
    assert '🎮' in server.current_state.leaderboard
    assert server.current_state.leaderboard['🎮']['player_id'] == original_player_id
    assert original_player_id in server.current_state.player_map
    
    # Simulate server restart scenario: emoji exists but player_id is mismatched
    import uuid
    restart_player_id = uuid.uuid4().hex
    server.current_state.leaderboard['🎮']['player_id'] = restart_player_id
    server.current_state.player_map.pop(original_player_id, None)
    server.current_state.player_map[restart_player_id] = '🎮'
    
    # Player makes a state request with their OLD player_id (from before restart)
    # This should trigger the auto-reconnection logic in the /state endpoint
    request.json = {'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '192.168.1.100'  # Same IP as original registration
    request.method = 'POST'
    state_response = server.state()
    
    # Verify auto-reconnection worked - player should be reconnected with original player_id
    assert server.current_state.leaderboard['🎮']['player_id'] == original_player_id
    assert original_player_id in server.current_state.player_map
    assert restart_player_id not in server.current_state.player_map
    
    print("✓ Auto-reconnection on /state endpoint successful!")


def test_state_endpoint_auto_reconnection_wrong_ip_rejected(server_env):
    """Test that /state endpoint auto-reconnection is rejected for wrong IP to prevent hijacking."""
    server, request = server_env
    
    # Player registers from specific IP
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '192.168.1.100'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    # Simulate server restart with mismatched player_id
    import uuid
    restart_player_id = uuid.uuid4().hex
    server.current_state.leaderboard['🎮']['player_id'] = restart_player_id
    server.current_state.player_map.pop(original_player_id, None)
    server.current_state.player_map[restart_player_id] = '🎮'
    
    # Try to reconnect from different IP - should NOT auto-reconnect
    request.json = {'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '192.168.1.200'  # Different IP than original registration
    request.method = 'POST'
    state_response = server.state()
    
    # Verify auto-reconnection was NOT performed due to IP mismatch
    assert server.current_state.leaderboard['🎮']['player_id'] == restart_player_id  # Should remain unchanged
    assert restart_player_id in server.current_state.player_map
    assert original_player_id not in server.current_state.player_map
    
    print("✓ /state endpoint auto-reconnection properly rejected for mismatched IP!")


def test_server_restart_player_reconnection(server_env, tmp_path, monkeypatch):
    """Test basic server restart scenario (kept for reference)."""
    server, request = server_env
    
    # This test shows that with proper persistence, reconnection works
    # The issue was more about mismatched player_ids, which the above tests address
    
    request.json = {'emoji': '🎮', 'player_id': None}
    request.remote_addr = '1'
    reg_resp = server.set_emoji()
    original_player_id = reg_resp['player_id']
    
    request.json = {'guess': 'crane', 'emoji': '🎮', 'player_id': original_player_id}
    request.remote_addr = '1'
    first_guess = server.guess_word()
    assert first_guess['status'] == 'ok'
    
    # With the fix, this should work even if there's a player_id mismatch
    # The test above covers the specific auto-reconnection scenario


def test_guess_word_points_for_new_letters_and_penalties(server_env):
    server, request = server_env

    request.json = {'guess': 'crane', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    first = server.guess_word()

    assert first['pointsDelta'] == pytest.approx(1.5)
    assert server.current_state.leaderboard['😀']['score'] == pytest.approx(1.5)
    assert server.current_state.found_greens == {'e'}
    assert server.current_state.found_yellows == {'a'}

    request.json = {'guess': 'trace', 'emoji': '😀', 'player_id': 'p1'}
    second = server.guess_word()

    assert second['pointsDelta'] == -1
    assert server.current_state.leaderboard['😀']['score'] == pytest.approx(0.5)

def test_pick_new_word_resets_state(server_env, monkeypatch):
    server, _ = server_env
    # Set up some non-empty state that should be cleared
    server.current_state.guesses.append({'guess': 'apple', 'result': [], 'emoji': '😀', 'player_id': 'p1'})
    server.current_state.is_over = True
    server.current_state.winner_emoji = '😎'
    server.current_state.found_greens = {'a'}
    server.current_state.found_yellows = {'b'}
    server.current_state.definition = 'some definition'

    # Deterministic word selection
    monkeypatch.setattr(server.random, 'choice', lambda words: 'crane')

    server.pick_new_word(server.current_state)

    assert server.current_state.target_word == 'crane'
    assert server.current_state.guesses == []
    assert not server.current_state.is_over
    assert server.current_state.winner_emoji is None
    assert server.current_state.found_greens == set()
    assert server.current_state.found_yellows == set()
    assert server.current_state.definition is None


def test_fetch_definition_success(monkeypatch, server_env):
    server, _ = server_env

    payload = [
        {
            'meanings': [
                {
                    'definitions': [
                        {'definition': 'a fruit'}
                    ]
                }
            ]
        }
    ]

    class DummyResp:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    monkeypatch.setattr(server.requests, 'get', lambda *a, **k: DummyResp())

    definition = server.fetch_definition('apple')
    assert definition == 'a fruit'


def test_fetch_definition_strips_html(monkeypatch, server_env):
    server, _ = server_env

    payload = [
        {
            'meanings': [
                {
                    'definitions': [
                        {'definition': '<b>a fruit</b>'}
                    ]
                }
            ]
        }
    ]

    class DummyResp:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    monkeypatch.setattr(server.requests, 'get', lambda *a, **k: DummyResp())

    definition = server.fetch_definition('apple')
    assert definition == 'a fruit'


def test_sanitize_definition_cleans_text(server_env):
    server, _ = server_env
    raw = '  <b>Fruit&nbsp;</b>   of <i>the</i>  tree  '
    cleaned = server.sanitize_definition(raw)
    assert cleaned == 'Fruit of the tree'


def test_fetch_definition_exception(monkeypatch, server_env):
    server, _ = server_env

    def raise_err(*a, **k):
        raise ValueError('fail')

    monkeypatch.setattr(server.requests, 'get', raise_err)

    definition = server.fetch_definition('apple')
    assert definition is None


def test_fetch_definition_sets_user_agent(monkeypatch, server_env):
    server, _ = server_env

    captured = {}

    class DummyResp:
        def raise_for_status(self):
            pass

        def json(self):
            return []

    def fake_get(url, headers=None, **kw):
        captured['ua'] = headers.get('User-Agent')
        return DummyResp()

    monkeypatch.setattr(server.requests, 'get', fake_get)

    server.fetch_definition('apple')

    assert captured['ua'] and 'Mozilla' in captured['ua']


def test_fetch_definition_offline_fallback(monkeypatch, server_env):
    server, _ = server_env

    def fail(*a, **k):
        raise server.requests.RequestException('offline')

    monkeypatch.setattr(server.requests, 'get', fail)

    definition = server.fetch_definition('crane')
    assert definition == 'a large bird or lifting machine'


def test_definition_worker_broadcasts_specific_state(monkeypatch, server_env):
    server, _ = server_env

    captured = {}

    def fake_broadcast(s=None):
        captured['state'] = s

    monkeypatch.setattr(server, 'broadcast_state', fake_broadcast)

    state = server.GameState()
    server._definition_worker('apple', state)

    assert captured['state'] is state


def test_definition_available_after_game_over(monkeypatch, server_env):
    server, request = server_env

    monkeypatch.setattr(server, 'fetch_definition', lambda w: 'a fruit')

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['over'] is True
    assert resp['state']['definition'] == 'a fruit'
    assert server.current_state.definition == 'a fruit'
    assert server.current_state.last_word == server.current_state.target_word
    assert server.current_state.last_definition == 'a fruit'

    request.method = 'GET'
    request.json = None
    state = server.state()
    assert state['definition'] == 'a fruit'


def test_definition_fetched_on_loss(monkeypatch, server_env):
    server, request = server_env

    monkeypatch.setattr(server, 'fetch_definition', lambda w: 'a fruit')
    monkeypatch.setattr(server, 'MAX_ROWS', 1)

    request.json = {'guess': 'enter', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['over'] is True
    assert resp['won'] is False
    assert server.current_state.is_over
    assert resp['state']['definition'] == 'a fruit'
    assert server.current_state.definition == 'a fruit'
    assert server.current_state.last_word == server.current_state.target_word
    assert server.current_state.last_definition == 'a fruit'

    request.method = 'GET'
    request.json = None
    state = server.state()
    assert state['definition'] == 'a fruit'


def test_save_and_load_round_trip(tmp_path, server_env, monkeypatch):
    server, _ = server_env
    game_file = tmp_path / 'game.json'
    monkeypatch.setattr(server, 'GAME_FILE', str(game_file))

    server.current_state.leaderboard = {
        '🤖': {
            'ip': '1',
            'player_id': 'p1',
            'score': 99,
            'used_yellow': ['y'],
            'used_green': ['g'],
            'last_active': 42,
        }
    }
    server.current_state.ip_to_emoji = {'1': '🤖'}
    server.current_state.player_map = {'p1': '🤖'}
    server.current_state.winner_emoji = '🤖'
    server.current_state.target_word = 'enter'
    server.current_state.guesses = [{'guess': 'enter', 'result': ['correct'] * 5, 'emoji': '🤖'}]
    server.current_state.is_over = True
    server.current_state.found_greens = {'e'}
    server.current_state.found_yellows = {'n', 't'}
    server.current_state.past_games = [[{'guess': 'apple', 'result': [], 'emoji': '😀', 'player_id': 'p1'}]]
    server.current_state.definition = 'def'
    server.current_state.last_word = 'apple'
    server.current_state.last_definition = 'fruit'

    expected = {
        'leaderboard': dict(server.current_state.leaderboard),
        'ip_to_emoji': dict(server.current_state.ip_to_emoji),
        'player_map': dict(server.current_state.player_map),
        'winner_emoji': server.current_state.winner_emoji,
        'target_word': server.current_state.target_word,
        'guesses': list(server.current_state.guesses),
        'is_over': server.current_state.is_over,
        'found_greens': set(server.current_state.found_greens),
        'found_yellows': set(server.current_state.found_yellows),
        'past_games': list(server.current_state.past_games),
        'definition': server.current_state.definition,
        'last_word': server.current_state.last_word,
        'last_definition': server.current_state.last_definition,
    }

    server.save_data_legacy()

    server.current_state.leaderboard = {}
    server.current_state.ip_to_emoji = {}
    server.current_state.player_map = {}
    server.current_state.winner_emoji = None
    server.current_state.target_word = ''
    server.current_state.guesses = []
    server.current_state.is_over = False
    server.current_state.found_greens = set()
    server.current_state.found_yellows = set()
    server.current_state.past_games = []
    server.current_state.definition = None
    server.current_state.last_word = None
    server.current_state.last_definition = None

    server.load_data_legacy()

    assert server.current_state.leaderboard == expected['leaderboard']
    assert server.current_state.ip_to_emoji == expected['ip_to_emoji']
    assert server.current_state.player_map == expected['player_map']
    assert server.current_state.winner_emoji == expected['winner_emoji']
    assert server.current_state.target_word == expected['target_word']
    assert server.current_state.guesses == expected['guesses']
    assert server.current_state.is_over == expected['is_over']
    assert server.current_state.found_greens == expected['found_greens']
    assert server.current_state.found_yellows == expected['found_yellows']
    assert server.current_state.past_games == expected['past_games']
    assert server.current_state.definition == expected['definition']
    assert server.current_state.last_word == expected['last_word']
    assert server.current_state.last_definition == expected['last_definition']


def test_close_call_trigger(monkeypatch, server_env):
    server, request = server_env

    monkeypatch.setattr(server.time, 'time', lambda: 1.0)
    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    win = server.guess_word()
    assert win['won'] is True

    monkeypatch.setattr(server.time, 'time', lambda: 1.5)
    request.json = {'guess': server.current_state.target_word, 'emoji': '😎', 'player_id': 'p2'}
    request.remote_addr = '2'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 403
    assert data['close_call']['delta_ms'] == 500
    assert data['close_call']['winner'] == '😀'


def test_close_call_not_triggered(monkeypatch, server_env):
    server, request = server_env

    monkeypatch.setattr(server.time, 'time', lambda: 1.0)
    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    monkeypatch.setattr(server.time, 'time', lambda: 3.5)
    request.json = {'guess': server.current_state.target_word, 'emoji': '😎', 'player_id': 'p2'}
    request.remote_addr = '2'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 403
    assert 'close_call' not in data


def test_daily_double_awarded(monkeypatch, server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0

    monkeypatch.setattr(server.time, 'time', lambda: 1.0)
    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['daily_double'] is True
    assert resp['daily_double_available'] is True


def test_daily_double_not_awarded(server_env):
    server, request = server_env
    server.current_state.daily_double_index = 5  # row 1 first tile

    request.json = {'guess': 'enter', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['daily_double'] is False


def test_hint_selection_for_daily_double_winner(server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 2}
    resp = server.select_hint()

    assert resp['status'] == 'ok'
    assert resp['row'] == 1
    assert resp['letter'] == server.current_state.target_word[2]
    assert '😀' not in server.current_state.daily_double_pending
    assert resp['daily_double_available'] is False


def test_hint_selection_invalid_player(server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    request.json = {'emoji': '😎', 'player_id': 'p2', 'col': 2}
    request.remote_addr = '2'
    resp = server.select_hint()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status in (400, 403)


def test_hint_cannot_be_used_twice(server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 2}
    request.remote_addr = '1'
    first = server.select_hint()
    assert first['status'] == 'ok'

    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 1}
    second = server.select_hint()
    assert isinstance(second, tuple)
    data, status = second
    assert status == 400


def test_state_reports_daily_double_available(server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    request.method = 'POST'
    request.json = {'emoji': '😀', 'player_id': 'p1'}
    state = server.state()
    assert state.get('daily_double_available') is True

    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 2}
    request.remote_addr = '1'
    server.select_hint()

    request.json = {'emoji': '😀', 'player_id': 'p1'}
    state2 = server.state()
    assert state2['daily_double_available'] is False


def test_chat_post_and_get(server_env):
    server, request = server_env

    request.method = 'POST'
    request.json = {'text': 'hello', 'emoji': '😀', 'player_id': 'p1'}
    resp = server.chat()
    assert resp['status'] == 'ok'
    assert server.current_state.chat_messages[-1]['text'] == 'hello'

    request.method = 'GET'
    request.json = None
    data = server.chat()
    assert data['messages'][-1]['text'] == 'hello'


def test_hint_logs_analytics(tmp_path, monkeypatch, server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0
    log_file = tmp_path / 'analytics.log'
    monkeypatch.setattr(server, 'ANALYTICS_FILE', str(log_file))
    
    # Update the analytics module's ANALYTICS_FILE variable to match
    import backend.analytics
    backend.analytics.ANALYTICS_FILE = log_file

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 2}
    request.remote_addr = '1'
    resp = server.select_hint()
    assert resp['status'] == 'ok'

    with open(log_file) as f:
        line = f.readline()
    entry = json.loads(line)
    assert entry['event'] == 'daily_double_used'
    assert entry['emoji'] == '😀'
    assert entry['ip'] == '1'


def test_reconnect_with_active_daily_double(tmp_path, server_env, monkeypatch):
    server, request = server_env
    server.current_state.daily_double_index = 0
    game_file = tmp_path / 'game.json'
    monkeypatch.setattr(server, 'GAME_FILE', str(game_file))

    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.guess_word()

    server.save_data_legacy()
    server._reset_state()
    server.load_data_legacy()

    request.method = 'POST'
    request.json = {'emoji': '😀', 'player_id': 'p1'}
    state = server.state()
    assert state['daily_double_available'] is True


def test_daily_double_awarded_only_once(server_env):
    server, request = server_env
    server.WORDS.append('ample')
    server.current_state.daily_double_index = 0
    request.json = {'guess': 'ample', 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    first = server.guess_word()
    assert first['daily_double'] is True
    assert server.current_state.daily_double_pending['😀'] == 1


def test_daily_double_carries_over_on_win(server_env):
    server, request = server_env
    server.current_state.daily_double_index = 0
    request.json = {'guess': server.current_state.target_word, 'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    resp = server.guess_word()
    assert resp['daily_double'] is True
    assert resp['over'] is True

    server.reset_game()
    assert server.current_state.daily_double_pending.get('😀') == 0

    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 0}
    hint_resp = server.select_hint()
    assert hint_resp['status'] == 'ok'
    assert '😀' not in server.current_state.daily_double_pending


def test_broadcast_state_includes_daily_double_status(server_env):
    server, request = server_env
    
    # Setup multiple players, one with daily double
    server.current_state.daily_double_pending['😀'] = 1
    server.current_state.leaderboard['😀'] = {'score': 100, 'player_id': 'p1', 'last_active': 1234567890}
    server.current_state.leaderboard['😂'] = {'score': 50, 'player_id': 'p2', 'last_active': 1234567890}
    
    # Test broadcast payload (SSE scenario)
    from queue import Queue
    import json
    mock_queue = Queue()
    server.current_state.listeners.add(mock_queue)
    
    server.broadcast_state()
    
    broadcast_data = mock_queue.get_nowait()
    parsed_data = json.loads(broadcast_data)
    
    # SSE broadcasts should include daily_double_status for all players
    assert 'daily_double_status' in parsed_data
    assert parsed_data['daily_double_status']['😀'] is True
    assert parsed_data['daily_double_status']['😂'] is False
    
    # Should not include the player-specific field
    assert 'daily_double_available' not in parsed_data
    
    # Clean up
    server.current_state.listeners.discard(mock_queue)
    

def test_hint_endpoint_broadcasts_state(server_env):
    server, request = server_env
    
    # Setup
    server.current_state.daily_double_pending['😀'] = 1
    server.current_state.target_word = 'HELLO'
    server.current_state.leaderboard['😀'] = {'score': 100, 'player_id': 'p1', 'last_active': 1234567890}
    
    # Create mock SSE queue
    from queue import Queue
    import json
    mock_queue = Queue()
    server.current_state.listeners.add(mock_queue)
    
    # Use hint
    request.json = {'emoji': '😀', 'player_id': 'p1', 'col': 2}
    response = server.select_hint()
    
    # Should work and broadcast
    assert response['status'] == 'ok'
    assert '😀' not in server.current_state.daily_double_pending
    
    # Should have sent SSE broadcast
    assert not mock_queue.empty()
    broadcast_data = mock_queue.get_nowait()
    parsed_data = json.loads(broadcast_data)
    assert 'daily_double_status' in parsed_data
    assert parsed_data['daily_double_status']['😀'] is False  # Used the hint
    
    # Clean up
    server.current_state.listeners.discard(mock_queue)


def test_chat_empty_message_returns_400(server_env):
    server, request = server_env
    request.method = 'POST'
    request.json = {'text': '   ', 'emoji': '😀', 'player_id': 'p1'}
    resp = server.chat()
    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 400
    assert data['status'] == 'error'


def test_set_emoji_invalid_input(server_env):
    server, request = server_env
    request.json = {'emoji': ''}
    resp = server.set_emoji()
    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 400
    assert data['status'] == 'error'


def test_lobby_create_and_isolated_state(server_env):
    server, request = server_env

    lobby_resp = server.lobby_create()
    code = lobby_resp['id']
    assert 'host_token' in lobby_resp
    assert len(code) == 6
    assert code in server.LOBBIES

    server.LOBBIES[code].target_word = 'apple'

    request.json = {'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.lobby_emoji(code)

    q = server.queue.Queue()
    server.LOBBIES[code].listeners.add(q)

    request.json = {'guess': 'apple', 'emoji': '😀', 'player_id': 'p1'}
    server.lobby_guess(code)

    assert not q.empty()


def test_sse_isolation_between_lobbies(server_env):
    server, request = server_env

    l1 = server.lobby_create()['id']
    l2 = server.lobby_create()['id']
    server.LOBBIES[l1].target_word = 'apple'
    server.LOBBIES[l2].target_word = 'apple'

    request.json = {'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.lobby_emoji(l1)
    server.lobby_emoji(l2)

    q1 = server.queue.Queue()
    q2 = server.queue.Queue()
    server.LOBBIES[l1].listeners.add(q1)
    server.LOBBIES[l2].listeners.add(q2)

    request.json = {'guess': 'apple', 'emoji': '😀', 'player_id': 'p1'}
    server.lobby_guess(l1)

    assert not q1.empty()
    assert q2.empty()


def test_lobby_guess_and_chat_isolation(server_env):
    server, request = server_env

    l1 = server.lobby_create()['id']
    l2 = server.lobby_create()['id']
    server.LOBBIES[l1].target_word = 'apple'
    server.LOBBIES[l2].target_word = 'enter'

    request.json = {'emoji': '😀', 'player_id': 'p1'}
    request.remote_addr = '1'
    server.lobby_emoji(l1)
    server.lobby_emoji(l2)

    request.json = {'guess': 'apple', 'emoji': '😀', 'player_id': 'p1'}
    server.lobby_guess(l1)

    assert server.LOBBIES[l2].guesses == []

    request.method = 'POST'
    request.json = {'text': 'hi', 'emoji': '😀', 'player_id': 'p1'}
    server.lobby_chat(l1)

    assert server.LOBBIES[l2].chat_messages == []


def test_lobby_reset_requires_token(server_env):
    server, request = server_env

    resp = server.lobby_create()
    code = resp['id']
    token = resp['host_token']

    request.json = {'host_token': 'bad'}
    bad = server.lobby_reset(code)
    assert isinstance(bad, tuple)
    assert bad[1] == 403

    request.json = {'host_token': token}
    good = server.lobby_reset(code)
    assert good['status'] == 'ok'


def test_lobby_create_rate_limit(server_env, monkeypatch):
    server, request = server_env

    t = [0]

    def fake_time():
        return t[0]

    monkeypatch.setattr(server.time, 'time', fake_time)

    for i in range(5):
        t[0] = i
        resp = server.lobby_create()
        assert 'id' in resp

    t[0] = 5
    limited = server.lobby_create()
    assert isinstance(limited, tuple)
    data, status = limited
    assert status == 429

    t[0] = 70
    resp2 = server.lobby_create()
    assert 'id' in resp2


def test_lobby_code_validation(server_env):
    server, request = server_env

    bad = server.lobby_state('invalid!')
    assert isinstance(bad, tuple)
    data, status = bad
    assert status == 400
    assert data['status'] == 'error'


def test_lobby_analytics_create_join_finish(tmp_path, server_env, monkeypatch):
    server, request = server_env
    log_file = tmp_path / 'analytics.log'
    monkeypatch.setattr(server, 'ANALYTICS_FILE', str(log_file))
    
    # Update the analytics module's ANALYTICS_FILE variable to match
    import backend.analytics
    backend.analytics.ANALYTICS_FILE = log_file

    request.remote_addr = '1'
    resp = server.lobby_create()
    code = resp['id']

    with open(log_file) as f:
        entry = json.loads(f.readline())
    assert entry['event'] == 'lobby_created'
    assert entry['lobby_id'] == code
    assert entry['ip'] == '1'

    request.json = {'emoji': '😀', 'player_id': 'p1'}
    server.lobby_emoji(code)

    with open(log_file) as f:
        entries = [json.loads(line) for line in f.readlines()]
    join = entries[1]
    assert join['event'] == 'lobby_joined'
    assert join['lobby_id'] == code
    assert join['emoji'] == '😀'

    request.json = {'guess': server.LOBBIES[code].target_word, 'emoji': '😀', 'player_id': 'p1'}
    server.lobby_guess(code)

    request.json = {'host_token': resp['host_token']}
    server.lobby_reset(code)

    with open(log_file) as f:
        entries = [json.loads(line) for line in f.readlines()]
    finished = [e for e in entries if e['event'] == 'lobby_finished']
    assert len(finished) == 1
    final = finished[0]
    assert final['lobby_id'] == code
    assert final['ip'] == '1'

# Ensure only one lobby_finished entry is logged for default lobby resets
def test_reset_game_logs_finished(tmp_path, server_env, monkeypatch):
    server, _ = server_env
    log_file = tmp_path / 'analytics.log'
    monkeypatch.setattr(server, 'ANALYTICS_FILE', str(log_file))
    
    # Update the analytics module's ANALYTICS_FILE variable to match
    import backend.analytics
    backend.analytics.ANALYTICS_FILE = log_file

    server.reset_game()

    with open(log_file) as f:
        entries = [json.loads(line) for line in f.readlines()]

    assert len(entries) == 1
    entry = entries[0]
    assert entry['event'] == 'lobby_finished'
    assert entry['lobby_id'] == server.DEFAULT_LOBBY
    assert entry['ip'] == '127.0.0.1'

# Add new tests for lobby code generation and purge


def test_generate_lobby_code_valid(server_env):
    server, _ = server_env
    codes = {server.generate_lobby_code() for _ in range(50)}
    assert len(codes) == 50
    for code in codes:
        assert server.LOBBY_CODE_RE.fullmatch(code)


def test_purge_lobbies_removes_idle_finished(server_env):
    server, _ = server_env
    resp = server.lobby_create()
    code = resp['id']
    state = server.LOBBIES[code]
    state.phase = 'finished'
    state.last_activity -= server.LOBBY_TTL + 1
    # Use force_purge to bypass rate limiting in tests
    server.force_purge_lobbies()
    assert code not in server.LOBBIES


def test_cleanup_endpoint_triggers_purge(monkeypatch, server_env):
    server, _ = server_env
    called = {}

    def fake_force_purge():
        called['yes'] = True

    # The cleanup endpoint now calls force_purge_lobbies
    monkeypatch.setattr(server, 'force_purge_lobbies', fake_force_purge)
    resp = server.cleanup_lobbies()
    assert resp['status'] == 'ok'
    assert called.get('yes')


def test_lobby_page_serves_game_html(server_env):
    server, _ = server_env
    path = server.lobby_page('ABC123')
    assert path.endswith('game.html')


def test_empty_lobby_removed_immediately_after_kick(server_env):
    """Test that a lobby is removed immediately when last player is kicked."""
    server, request = server_env
    
    # Create a lobby
    resp = server.lobby_create()
    code = resp['id']
    host_token = resp['host_token']
    
    # Add a player to the lobby using direct leaderboard manipulation
    server.LOBBIES[code].leaderboard['🐶'] = {
        'ip': '127.0.0.1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    
    # Verify lobby exists and has one player
    assert code in server.LOBBIES
    assert len(server.LOBBIES[code].leaderboard) == 1
    assert "🐶" in server.LOBBIES[code].leaderboard
    
    # Kick the only player
    request.json = {"emoji": "🐶", "host_token": host_token}
    resp = server.lobby_kick(code)
    
    # Verify the kick was successful
    assert resp["status"] == "ok"
    
    # Verify lobby is immediately removed (not waiting for TTL)
    assert code not in server.LOBBIES


def test_lobby_not_removed_if_still_has_players_after_kick(server_env):
    """Test that a lobby is not removed if players remain after a kick."""
    server, request = server_env
    
    # Create a lobby
    resp = server.lobby_create()
    code = resp['id']
    host_token = resp['host_token']
    
    # Add two players to the lobby using direct leaderboard manipulation
    server.LOBBIES[code].leaderboard['🐶'] = {
        'ip': '127.0.0.1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[code].leaderboard['🐸'] = {
        'ip': '192.168.1.2', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    
    # Verify lobby has two players
    assert len(server.LOBBIES[code].leaderboard) == 2
    
    # Kick one player
    request.json = {"emoji": "🐶", "host_token": host_token}
    resp = server.lobby_kick(code)
    
    # Verify the kick was successful
    assert resp["status"] == "ok"
    
    # Verify lobby still exists with one player
    assert code in server.LOBBIES
    assert len(server.LOBBIES[code].leaderboard) == 1
    assert "🐸" in server.LOBBIES[code].leaderboard

def test_get_lobby_creates_and_returns(server_env):
    server, _ = server_env
    code = 'ZXCV12'
    assert code not in server.LOBBIES
    lobby = server.get_lobby(code)
    assert code in server.LOBBIES
    assert server.LOBBIES[code] is lobby
    # second call returns same object
    again = server.get_lobby(code)
    assert again is lobby


def test_lobby_id_returns_correct_code(server_env):
    server, _ = server_env
    code = 'ID1234'
    lobby = server.get_lobby(code)
    assert server._lobby_id(lobby) == code


def test_with_lobby_switches_and_restores(server_env):
    server, _ = server_env
    code = 'ROOM11'
    server.get_lobby(code)
    original = server.current_state

    def dummy():
        return server._lobby_id(server.current_state)

    result = server._with_lobby(code, dummy)
    assert result == code
    assert server.current_state is original


def test_with_lobby_rejects_invalid_code(server_env):
    server, _ = server_env
    data, status = server._with_lobby('bad!', lambda: None)
    assert status == 400
    assert data['status'] == 'error'


def test_lobby_kick_removes_player(server_env):
    server, request = server_env
    resp = server.lobby_create()
    code = resp['id']
    token = resp['host_token']
    # Add two players so lobby won't be removed when we kick one
    server.LOBBIES[code].leaderboard['😎'] = {
        'ip': '2', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[code].leaderboard['🤖'] = {
        'ip': '3', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    request.json = {'emoji': '😎', 'player_id': 'p2', 'host_token': token}
    resp = server.lobby_kick(code)
    assert resp['status'] == 'ok'
    # Lobby should still exist with the remaining player
    assert code in server.LOBBIES
    assert '😎' not in server.LOBBIES[code].leaderboard
    assert '🤖' in server.LOBBIES[code].leaderboard


def test_lobby_kick_requires_token(server_env):
    server, request = server_env
    resp = server.lobby_create()
    code = resp['id']
    # Add two players so lobby won't be removed when the kick fails
    server.LOBBIES[code].leaderboard['😀'] = {
        'ip': '1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[code].leaderboard['🤖'] = {
        'ip': '2', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    request.json = {'emoji': '😀', 'player_id': 'p1', 'host_token': 'BAD'}
    resp = server.lobby_kick(code)
    assert isinstance(resp, tuple)
    assert resp[1] == 403


def test_lobby_leave_removes_player(server_env):
    """Test that a player can leave a lobby and is removed from it."""
    server, request = server_env
    
    # Create a lobby
    resp = server.lobby_create()
    code = resp['id']
    
    # Add two players to the lobby
    server.LOBBIES[code].leaderboard['🐶'] = {
        'ip': '127.0.0.1', 'player_id': 'player1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[code].leaderboard['🐸'] = {
        'ip': '192.168.1.2', 'player_id': 'player2', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[code].ip_to_emoji['127.0.0.1'] = '🐶'
    server.LOBBIES[code].ip_to_emoji['192.168.1.2'] = '🐸'
    server.LOBBIES[code].player_map['player1'] = '🐶'
    server.LOBBIES[code].player_map['player2'] = '🐸'
    
    # Verify lobby has two players
    assert len(server.LOBBIES[code].leaderboard) == 2
    
    # Have one player leave
    request.json = {"emoji": "🐶", "player_id": "player1"}
    resp = server.lobby_leave(code)
    
    # Verify the leave was successful
    assert resp["status"] == "ok"
    assert "lobby_removed" not in resp  # Lobby should still exist with remaining player
    
    # Verify lobby still exists with one player
    assert code in server.LOBBIES
    assert len(server.LOBBIES[code].leaderboard) == 1
    assert "🐸" in server.LOBBIES[code].leaderboard
    assert "🐶" not in server.LOBBIES[code].leaderboard
    
    # Verify ip_to_emoji and player_map were cleaned up
    assert '127.0.0.1' not in server.LOBBIES[code].ip_to_emoji
    assert 'player1' not in server.LOBBIES[code].player_map
    assert '192.168.1.2' in server.LOBBIES[code].ip_to_emoji
    assert 'player2' in server.LOBBIES[code].player_map


def test_lobby_leave_last_player_removes_lobby(server_env):
    """Test that a lobby is removed immediately when last player leaves."""
    server, request = server_env
    
    # Create a lobby
    resp = server.lobby_create()
    code = resp['id']
    
    # Add one player to the lobby
    server.LOBBIES[code].leaderboard['🐶'] = {
        'ip': '127.0.0.1', 'player_id': 'player1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[code].ip_to_emoji['127.0.0.1'] = '🐶'
    server.LOBBIES[code].player_map['player1'] = '🐶'
    
    # Verify lobby exists and has one player
    assert code in server.LOBBIES
    assert len(server.LOBBIES[code].leaderboard) == 1
    assert "🐶" in server.LOBBIES[code].leaderboard
    
    # Have the only player leave
    request.json = {"emoji": "🐶", "player_id": "player1"}
    resp = server.lobby_leave(code)
    
    # Verify the leave was successful
    assert resp["status"] == "ok"
    assert resp.get("lobby_removed") == True
    
    # Verify lobby is immediately removed (not waiting for TTL)
    assert code not in server.LOBBIES


def test_lobby_leave_requires_valid_player(server_env):
    """Test that leaving requires a valid player in the lobby."""
    server, request = server_env
    
    # Create a lobby
    resp = server.lobby_create()
    code = resp['id']
    
    # Add one player to the lobby
    server.LOBBIES[code].leaderboard['🐶'] = {
        'ip': '127.0.0.1', 'player_id': 'player1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    
    # Try to leave with invalid emoji
    request.json = {"emoji": "🐸", "player_id": "player1"}
    resp = server.lobby_leave(code)
    
    assert isinstance(resp, tuple)
    assert resp[1] == 404
    assert resp[0]["status"] == "error"
    assert resp[0]["msg"] == "Player not in lobby"
    
    # Try to leave with invalid player_id
    request.json = {"emoji": "🐶", "player_id": "wrong_player"}
    resp = server.lobby_leave(code)
    
    assert isinstance(resp, tuple)
    assert resp[1] == 403
    assert resp[0]["status"] == "error"
    assert resp[0]["msg"] == "Invalid player credentials"
    
    # Try to leave with missing emoji
    request.json = {"player_id": "player1"}
    resp = server.lobby_leave(code)
    
    assert isinstance(resp, tuple)
    assert resp[1] == 400
    assert resp[0]["status"] == "error"
    assert resp[0]["msg"] == "Missing emoji"
    
    # Try to leave with missing player_id
    request.json = {"emoji": "🐶"}
    resp = server.lobby_leave(code)
    
    assert isinstance(resp, tuple)
    assert resp[1] == 400
    assert resp[0]["status"] == "error"
    assert resp[0]["msg"] == "Missing player_id"


def test_lobby_leave_does_not_affect_default_lobby(server_env):
    """Test that leaving the default lobby doesn't remove it even if empty."""
    server, request = server_env
    
    # Clear the default lobby first to ensure clean state
    server.LOBBIES[server.DEFAULT_LOBBY].leaderboard.clear()
    server.LOBBIES[server.DEFAULT_LOBBY].ip_to_emoji.clear()
    server.LOBBIES[server.DEFAULT_LOBBY].player_map.clear()
    
    # Add a player to the default lobby
    server.LOBBIES[server.DEFAULT_LOBBY].leaderboard['🐶'] = {
        'ip': '127.0.0.1', 'player_id': 'player1', 'score': 0, 'used_yellow': [], 'used_green': [], 'last_active': 0
    }
    server.LOBBIES[server.DEFAULT_LOBBY].ip_to_emoji['127.0.0.1'] = '🐶'
    server.LOBBIES[server.DEFAULT_LOBBY].player_map['player1'] = '🐶'
    
    # Set current_state to the default lobby
    server.current_state = server.LOBBIES[server.DEFAULT_LOBBY]
    
    # Have the player leave
    request.json = {"emoji": "🐶", "player_id": "player1"}
    resp = server.leave_lobby()  # Call the function directly since we're using DEFAULT_LOBBY
    
    # Verify the leave was successful but lobby was not removed
    assert resp["status"] == "ok"
    assert "lobby_removed" not in resp
    
    # Verify default lobby still exists even though it's empty
    assert server.DEFAULT_LOBBY in server.LOBBIES
    assert len(server.LOBBIES[server.DEFAULT_LOBBY].leaderboard) == 0


def test_lobby_kick_missing_player(server_env):
    server, request = server_env
    resp = server.lobby_create()
    code = resp['id']
    token = resp['host_token']
    request.json = {'emoji': '🤖', 'host_token': token}
    resp = server.lobby_kick(code)
    assert isinstance(resp, tuple)
    assert resp[1] == 404


def test_create_lobby_then_get_state(server_env):
    server, request = server_env

    create_resp = server.lobby_create()
    code = create_resp['id']

    request.method = 'GET'
    request.json = None
    state = server.lobby_state(code)

    assert state['phase'] == 'waiting'
    assert code in server.LOBBIES


def test_offline_definitions_cache_initialization(tmp_path, server_env):
    """Test that offline definitions are cached during initialization."""
    server, _ = server_env
    
    # Create a test definitions file
    test_definitions = {
        "hello": "a greeting",
        "world": "<b>the earth</b>",  # HTML to test sanitization
        "empty": "",
        "none": None
    }
    definitions_file = tmp_path / "test_definitions.json"
    with open(definitions_file, 'w') as f:
        json.dump(test_definitions, f)
    
    # Initialize game assets with our test file
    words_file = tmp_path / "test_words.txt"
    with open(words_file, 'w') as f:
        f.write("hello\nworld\n")
    
    server.init_game_assets(words_file, definitions_file)
    
    # Check that definitions are cached and sanitized
    import backend.game_logic as gl
    assert gl.OFFLINE_DEFINITIONS_CACHE["hello"] == "a greeting"
    assert gl.OFFLINE_DEFINITIONS_CACHE["world"] == "the earth"  # HTML stripped
    assert gl.OFFLINE_DEFINITIONS_CACHE["empty"] is None
    assert gl.OFFLINE_DEFINITIONS_CACHE["none"] is None


def test_fetch_definition_uses_cache_on_network_failure(monkeypatch, server_env):
    """Test that cached definitions are used when network requests fail."""
    server, _ = server_env

    def fail_request(*a, **k):
        raise server.requests.RequestException('Network failure')

    monkeypatch.setattr(server.requests, 'get', fail_request)

    # This should use cached definition since network fails
    definition = server.fetch_definition('crane')
    assert definition == 'a large bird or lifting machine'


def test_fetch_definition_no_cache_on_unexpected_error(monkeypatch, server_env):
    """Test that unexpected errors don't trigger cached fallback."""
    server, _ = server_env

    def raise_unexpected_error(*a, **k):
        raise ValueError('Unexpected programming error')

    monkeypatch.setattr(server.requests, 'get', raise_unexpected_error)

    # This should NOT use cached definition for unexpected errors
    definition = server.fetch_definition('crane')
    assert definition is None


def test_fetch_definition_thread_safety(server_env):
    """Test that cached definition access is thread-safe."""
    server, _ = server_env
    import threading
    import time
    
    results = []
    errors = []
    
    def lookup_definition(word):
        try:
            # Import the helper function
            from backend.game_logic import _get_cached_offline_definition
            result = _get_cached_offline_definition(word)
            results.append(result)
        except Exception as e:
            errors.append(e)
    
    # Create multiple threads trying to access the cache simultaneously
    threads = []
    for i in range(10):
        thread = threading.Thread(target=lookup_definition, args=('crane',))
        threads.append(thread)
    
    # Start all threads
    for thread in threads:
        thread.start()
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    # Check results
    assert len(errors) == 0, f"Thread safety errors: {errors}"
    assert len(results) == 10
    assert all(result == 'a large bird or lifting machine' for result in results)


def test_cached_offline_definition_function(server_env):
    """Test the _get_cached_offline_definition helper function."""
    server, _ = server_env
    from backend.game_logic import _get_cached_offline_definition
    
    # Test existing definition
    definition = _get_cached_offline_definition('crane')
    assert definition == 'a large bird or lifting machine'
    
    # Test non-existent definition
    definition = _get_cached_offline_definition('nonexistent')
    assert definition is None


def test_fetch_definition_network_success_bypasses_cache(monkeypatch, server_env):
    """Test that successful network requests don't use cache."""
    server, _ = server_env
    
    online_definition = "online definition from API"
    
    payload = [
        {
            'meanings': [
                {
                    'definitions': [
                        {'definition': online_definition}
                    ]
                }
            ]
        }
    ]

    class DummyResp:
        def raise_for_status(self):
            pass

        def json(self):
            return payload

    monkeypatch.setattr(server.requests, 'get', lambda *a, **k: DummyResp())

    # Should get online definition, not cached one
    definition = server.fetch_definition('crane')
    assert definition == online_definition
    assert definition != 'a large bird or lifting machine'  # Not the cached version


def test_empty_offline_definitions_cache(tmp_path, server_env):
    """Test behavior with empty offline definitions file."""
    server, _ = server_env
    
    # Create empty definitions file
    definitions_file = tmp_path / "empty_definitions.json"
    with open(definitions_file, 'w') as f:
        json.dump({}, f)
    
    words_file = tmp_path / "test_words.txt"
    with open(words_file, 'w') as f:
        f.write("hello\n")
    
    server.init_game_assets(words_file, definitions_file)
    
    # Cache should be empty
    import backend.game_logic as gl
    assert len(gl.OFFLINE_DEFINITIONS_CACHE) == 0
    
    # Should return None for any word
    from backend.game_logic import _get_cached_offline_definition
    definition = _get_cached_offline_definition('anything')
    assert definition is None
