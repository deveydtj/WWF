import sys
import types
import importlib
import json
import pytest


def load_server():
    # create flask stub module
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
        def __init__(self, name):
            self.name = name

        def route(self, *a, **kw):
            def decorator(func):
                return func

            return decorator

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

    sys.modules['flask'] = flask_stub
    sys.modules['flask_cors'] = cors_stub

    server = importlib.import_module('server')
    importlib.reload(server)

    return server, request


@pytest.fixture
def server_env():
    server, request = load_server()
    # basic game state
    server.WORDS = ['apple', 'enter', 'crane', 'crate', 'trace']
    server.target_word = 'apple'
    server.guesses.clear()
    server.is_over = False
    server.found_greens = set()
    server.found_yellows = set()
    server.leaderboard.clear()
    server.leaderboard['😀'] = {
        'ip': '1',
        'score': 0,
        'used_yellow': [],
        'used_green': [],
        'last_active': 0,
    }
    server.leaderboard['😎'] = {
        'ip': '2',
        'score': 3,
        'used_yellow': [],
        'used_green': [],
        'last_active': 0,
    }
    return server, request


def test_result_for_guess(server_env):
    server, _ = server_env
    result = server.result_for_guess('crate', 'trace')
    assert result == ['present', 'correct', 'correct', 'present', 'correct']


def test_duplicate_guess_and_sorted_leaderboard(server_env):
    server, request = server_env

    request.json = {'guess': 'enter', 'emoji': '😀'}
    request.remote_addr = '1'
    first = server.guess_word()

    lb = first['state']['leaderboard']
    scores = [e['score'] for e in lb]
    assert scores == sorted(scores, reverse=True)

    request.json = {'guess': 'enter', 'emoji': '😀'}
    duplicate = server.guess_word()
    assert duplicate['status'] == 'error'
    assert 'already guessed' in duplicate['msg']


def test_validate_hard_mode_missing_letter(server_env):
    server, _ = server_env

    # Prior guess finds a yellow 'E'
    result = server.result_for_guess('enter', server.target_word)
    server.guesses.append({'guess': 'enter', 'result': result, 'emoji': '😀'})

    ok, msg = server.validate_hard_mode('crank')
    assert not ok
    assert 'E' in msg


def test_validate_hard_mode_wrong_green_position(server_env):
    server, _ = server_env

    # Prior guess reveals 'E' is green in position 5
    result = server.result_for_guess('crane', server.target_word)
    server.guesses.append({'guess': 'crane', 'result': result, 'emoji': '😀'})

    ok, msg = server.validate_hard_mode('enter')
    assert not ok
    assert 'position 5' in msg


def test_validate_hard_mode_valid_guess(server_env):
    server, _ = server_env

    # Multiple prior guesses accumulating constraints
    r1 = server.result_for_guess('enter', server.target_word)
    server.guesses.append({'guess': 'enter', 'result': r1, 'emoji': '😀'})
    r2 = server.result_for_guess('crane', server.target_word)
    server.guesses.append({'guess': 'crane', 'result': r2, 'emoji': '😀'})

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

    request.json = {'emoji': '🤖'}
    request.remote_addr = '3'
    resp = server.set_emoji()

    assert resp['status'] == 'ok'
    assert server.leaderboard['🤖']['ip'] == '3'
    assert server.ip_to_emoji['3'] == '🤖'


def test_set_emoji_duplicate_different_ip(server_env):
    server, request = server_env

    request.json = {'emoji': '😀'}
    request.remote_addr = '3'
    resp = server.set_emoji()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 409
    assert data['status'] == 'error'
    assert 'taken' in data['msg']
    assert '3' not in server.ip_to_emoji


def test_set_emoji_changes_remove_previous(server_env):
    server, request = server_env

    # establish initial mapping for ip '1'
    request.json = {'emoji': '😀'}
    request.remote_addr = '1'
    resp1 = server.set_emoji()
    assert resp1['status'] == 'ok'
    assert server.ip_to_emoji['1'] == '😀'

    # change to a new emoji
    request.json = {'emoji': '🥳'}
    resp2 = server.set_emoji()

    assert resp2['status'] == 'ok'
    assert server.ip_to_emoji['1'] == '🥳'
    assert '🥳' in server.leaderboard
    assert '😀' not in server.leaderboard


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

    before = server.leaderboard['😀']['last_active']
    request.method = 'POST'
    request.json = {'emoji': '😀'}
    server.state()

    assert server.leaderboard['😀']['last_active'] > before

    with open(game_file) as f:
        data = json.load(f)

    assert data['leaderboard']['😀']['last_active'] == server.leaderboard['😀']['last_active']


def test_guess_word_correct_word_wins_game(server_env, monkeypatch):
    server, request = server_env

    monkeypatch.setattr(server, 'fetch_definition', lambda w: 'def')

    request.json = {'guess': server.target_word, 'emoji': '😀'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['won'] is True
    assert resp['over'] is True
    assert server.is_over
    assert server.winner_emoji == '😀'
    assert resp['pointsDelta'] == 11
    assert server.leaderboard['😀']['score'] == 11

    # After game over, resetting should archive game and start fresh
    prev_guesses = list(server.guesses)
    prev_word = server.target_word
    monkeypatch.setattr(server.random, 'choice', lambda words: 'enter')
    reset = server.reset_game()

    assert reset['status'] == 'ok'
    assert server.past_games[-1] == prev_guesses
    assert server.target_word == 'enter'
    assert server.target_word != prev_word
    assert server.guesses == []
    assert not server.is_over


@pytest.mark.parametrize('word', ['appl', 'zzzzz'])
def test_guess_word_invalid_word_returns_400(server_env, word):
    server, request = server_env

    request.json = {'guess': word, 'emoji': '😀'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 400
    assert data['status'] == 'error'


def test_guess_word_after_game_over_returns_403(server_env):
    server, request = server_env

    server.is_over = True
    request.json = {'guess': 'crate', 'emoji': '😀'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert isinstance(resp, tuple)
    data, status = resp
    assert status == 403
    assert 'over' in data['msg'].lower()


def test_guess_word_points_for_new_letters_and_penalties(server_env):
    server, request = server_env

    request.json = {'guess': 'crane', 'emoji': '😀'}
    request.remote_addr = '1'
    first = server.guess_word()

    assert first['pointsDelta'] == 3
    assert server.leaderboard['😀']['score'] == 3
    assert server.found_greens == {'e'}
    assert server.found_yellows == {'a'}

    request.json = {'guess': 'trace', 'emoji': '😀'}
    second = server.guess_word()

    assert second['pointsDelta'] == -1
    assert server.leaderboard['😀']['score'] == 2

def test_pick_new_word_resets_state(server_env, monkeypatch):
    server, _ = server_env
    # Set up some non-empty state that should be cleared
    server.guesses.append({'guess': 'apple', 'result': [], 'emoji': '😀'})
    server.is_over = True
    server.winner_emoji = '😎'
    server.found_greens = {'a'}
    server.found_yellows = {'b'}
    server.definition = 'some definition'

    # Deterministic word selection
    monkeypatch.setattr(server.random, 'choice', lambda words: 'crane')

    server.pick_new_word()

    assert server.target_word == 'crane'
    assert server.guesses == []
    assert not server.is_over
    assert server.winner_emoji is None
    assert server.found_greens == set()
    assert server.found_yellows == set()
    assert server.definition is None


def test_fetch_definition_success(monkeypatch, server_env):
    server, _ = server_env

    payload = json.dumps([
        {
            'meanings': [
                {
                    'definitions': [
                        {'definition': 'a fruit'}
                    ]
                }
            ]
        }
    ]).encode('utf-8')

    class DummyResp:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            pass

        def read(self):
            return payload

    monkeypatch.setattr(server.urllib.request, 'urlopen', lambda *a, **k: DummyResp())

    definition = server.fetch_definition('apple')
    assert definition == 'a fruit'


def test_fetch_definition_exception(monkeypatch, server_env):
    server, _ = server_env

    def raise_err(*a, **k):
        raise ValueError('fail')

    monkeypatch.setattr(server.urllib.request, 'urlopen', raise_err)

    definition = server.fetch_definition('apple')
    assert definition is None


def test_definition_available_after_game_over(monkeypatch, server_env):
    server, request = server_env

    monkeypatch.setattr(server, 'fetch_definition', lambda w: 'a fruit')

    request.json = {'guess': server.target_word, 'emoji': '😀'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['over'] is True
    assert resp['state']['definition'] == 'a fruit'
    assert server.definition == 'a fruit'
    assert server.last_word == server.target_word
    assert server.last_definition == 'a fruit'

    request.method = 'GET'
    request.json = None
    state = server.state()
    assert state['definition'] == 'a fruit'


def test_definition_fetched_on_loss(monkeypatch, server_env):
    server, request = server_env

    monkeypatch.setattr(server, 'fetch_definition', lambda w: 'a fruit')
    monkeypatch.setattr(server, 'MAX_ROWS', 1)

    request.json = {'guess': 'enter', 'emoji': '😀'}
    request.remote_addr = '1'
    resp = server.guess_word()

    assert resp['over'] is True
    assert resp['won'] is False
    assert server.is_over
    assert resp['state']['definition'] == 'a fruit'
    assert server.definition == 'a fruit'
    assert server.last_word == server.target_word
    assert server.last_definition == 'a fruit'

    request.method = 'GET'
    request.json = None
    state = server.state()
    assert state['definition'] == 'a fruit'


def test_save_and_load_round_trip(tmp_path, server_env, monkeypatch):
    server, _ = server_env
    game_file = tmp_path / 'game.json'
    monkeypatch.setattr(server, 'GAME_FILE', str(game_file))

    server.leaderboard = {
        '🤖': {
            'ip': '1',
            'score': 99,
            'used_yellow': ['y'],
            'used_green': ['g'],
            'last_active': 42,
        }
    }
    server.ip_to_emoji = {'1': '🤖'}
    server.winner_emoji = '🤖'
    server.target_word = 'enter'
    server.guesses = [{'guess': 'enter', 'result': ['correct'] * 5, 'emoji': '🤖'}]
    server.is_over = True
    server.found_greens = {'e'}
    server.found_yellows = {'n', 't'}
    server.past_games = [[{'guess': 'apple', 'result': [], 'emoji': '😀'}]]
    server.definition = 'def'
    server.last_word = 'apple'
    server.last_definition = 'fruit'

    expected = {
        'leaderboard': dict(server.leaderboard),
        'ip_to_emoji': dict(server.ip_to_emoji),
        'winner_emoji': server.winner_emoji,
        'target_word': server.target_word,
        'guesses': list(server.guesses),
        'is_over': server.is_over,
        'found_greens': set(server.found_greens),
        'found_yellows': set(server.found_yellows),
        'past_games': list(server.past_games),
        'definition': server.definition,
        'last_word': server.last_word,
        'last_definition': server.last_definition,
    }

    server.save_data()

    server.leaderboard = {}
    server.ip_to_emoji = {}
    server.winner_emoji = None
    server.target_word = ''
    server.guesses = []
    server.is_over = False
    server.found_greens = set()
    server.found_yellows = set()
    server.past_games = []
    server.definition = None
    server.last_word = None
    server.last_definition = None

    server.load_data()

    assert server.leaderboard == expected['leaderboard']
    assert server.ip_to_emoji == expected['ip_to_emoji']
    assert server.winner_emoji == expected['winner_emoji']
    assert server.target_word == expected['target_word']
    assert server.guesses == expected['guesses']
    assert server.is_over == expected['is_over']
    assert server.found_greens == expected['found_greens']
    assert server.found_yellows == expected['found_yellows']
    assert server.past_games == expected['past_games']
    assert server.definition == expected['definition']
    assert server.last_word == expected['last_word']
    assert server.last_definition == expected['last_definition']

