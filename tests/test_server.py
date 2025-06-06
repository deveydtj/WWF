import sys
import types
import importlib
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
