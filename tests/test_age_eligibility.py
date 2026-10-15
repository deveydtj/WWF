"""Exercise eligibility through real Flask requests, including direct bypasses."""
import time
from types import SimpleNamespace

import pytest
from flask import session

from backend import server, data_persistence
from backend.config import ConfigError, validate_production_config

API_REQUESTS = [
    ('POST', '/lobby'), ('GET', '/lobbies'), ('GET', '/lobbies/network'),
    ('GET', '/state'), ('POST', '/state'), ('POST', '/emoji'),
    ('POST', '/guess'), ('POST', '/hint'), ('POST', '/reset'),
    ('GET', '/chat'), ('POST', '/chat'), ('GET', '/stream'),
    ('GET', '/lobby/ABC123/state'), ('POST', '/lobby/ABC123/state'),
    ('POST', '/lobby/ABC123/emoji'), ('POST', '/lobby/ABC123/guess'),
    ('POST', '/lobby/ABC123/reset'), ('POST', '/lobby/ABC123/kick'),
    ('POST', '/lobby/ABC123/leave'), ('GET', '/lobby/ABC123/chat'),
    ('POST', '/lobby/ABC123/chat'), ('GET', '/lobby/ABC123/stream'),
]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setitem(server.app.config, 'TESTING', True)
    state = server._reset_state(server.GameState())
    lobbies = {server.DEFAULT_LOBBY: state}
    monkeypatch.setattr(server, 'LOBBIES', lobbies)
    monkeypatch.setattr(server, 'current_state', state)
    monkeypatch.setattr(server, 'CREATION_TIMES', {})
    monkeypatch.setattr(server, 'RECENTLY_REMOVED_LOBBIES', {})
    for target in (server, data_persistence):
        monkeypatch.setattr(target, 'GAME_FILE', tmp_path / 'game.json')
        monkeypatch.setattr(target, 'LOBBIES_FILE', tmp_path / 'lobbies.json')
        monkeypatch.setattr(target, 'redis_client', None)
    monkeypatch.setattr(data_persistence, 'LOBBIES', lobbies)
    yield server.app.test_client()


@pytest.mark.parametrize(('method', 'path'), API_REQUESTS)
@pytest.mark.parametrize('blocked', [False, True], ids=['unscreened', 'under13'])
def test_every_game_api_blocks_unscreened_and_under13(client, method, path, blocked):
    if blocked:
        assert client.post('/age-check', json={'age': 12}).status_code == 403
    result = client.open(path, method=method, json={'text': 'must not be stored'})
    assert result.status_code == 403
    assert result.json['code'] == 'age_check_required'
    assert result.json['eligibility'] == ('blocked' if blocked else 'unknown')
    assert 'no-store' in result.headers['Cache-Control']
    assert set(server.LOBBIES) == {server.DEFAULT_LOBBY}
    assert not server.current_state.chat_messages
    assert not server.current_state.player_map
    assert not server.GAME_FILE.exists()
    assert not server.LOBBIES_FILE.exists()


@pytest.mark.parametrize('path', ['/game', '/lobby/ABC123', '/enhanced-scaling-test', '/static/game.html'])
def test_direct_html_links_require_screen(client, path):
    response = client.get(path)
    assert response.status_code == 302
    assert response.location.startswith('/age-check?next=')


def test_age13_can_create_register_play_and_chat_without_rechecking(client):
    result = client.post('/age-check', json={'age': 13})
    assert result.status_code == 200
    cookie = result.headers['Set-Cookie']
    assert 'HttpOnly' in cookie and 'SameSite=Lax' in cookie
    assert 'Expires=' not in cookie and 'Max-Age=' not in cookie
    with client.session_transaction() as stored:
        assert set(stored) == {'age_eligible', 'age_checked_at', '_permanent'}
        assert stored['age_eligible'] is True
        assert stored['_permanent'] is False
    assert client.get('/age-status').json == {'eligibility': 'eligible'}
    assert client.get('/game').status_code == 200
    created = client.post('/lobby').json
    base = '/lobby/' + created['id']
    registration = client.post(base + '/emoji', json={'emoji': '🐶'}).json
    identity = {'emoji': registration['emoji'], 'player_id': registration['player_id']}
    assert client.get(base + '/state').status_code == 200
    assert client.post(base + '/chat', json={**identity, 'text': 'Hello squad'}).status_code == 200
    assert client.get(base + '/chat').json['messages'][0]['text'] == 'Hello squad'
    guess = server.LOBBIES[created['id']].target_word
    assert client.post(base + '/guess', json={**identity, 'guess': guess}).status_code == 200
    assert client.get('/age-status').json == {'eligibility': 'eligible'}


def test_under13_cannot_change_answer_in_same_session(client):
    assert client.post('/age-check', json={'age': 12}).status_code == 403
    assert client.post('/age-check', json={'age': 99}).status_code == 403
    assert client.get('/age-status').json == {'eligibility': 'blocked'}
    assert client.get('/').status_code == 200
    assert client.get('/age-check').status_code == 200


@pytest.mark.parametrize('age', [None, True, False, '13', 13.5, -1, 121, {}, []])
def test_invalid_age_never_grants_access(client, age):
    assert client.post('/age-check', json={'age': age}).status_code == 400
    assert client.get('/age-status').json == {'eligibility': 'unknown'}
    assert client.post('/lobby').status_code == 403


def test_non_json_and_malformed_requests_fail_closed(client):
    for payload in ('age=13', '{invalid', '[]'):
        assert client.post('/age-check', data=payload).status_code == 400
    assert client.get('/age-status').json == {'eligibility': 'unknown'}


def test_expired_session_cannot_access_game(client):
    client.post('/age-check', json={'age': 13})
    with client.session_transaction() as stored:
        stored['age_checked_at'] = time.time() - server.AGE_SESSION_TTL - 1
    assert client.get('/age-status').json == {'eligibility': 'unknown'}
    assert client.get('/state').status_code == 403
    assert client.post('/age-check', json={'age': 20}).status_code == 200


def test_tampered_cookie_cannot_grant_access(client):
    client.post('/age-check', json={'age': 13})
    cookie = client.get_cookie('wordsquad_age_session')
    client.set_cookie('wordsquad_age_session', cookie.value + 'tampered')
    assert client.get('/state').status_code == 403


def test_a_new_browser_session_requires_its_own_check(client):
    client.post('/age-check', json={'age': 13})
    other = server.app.test_client()
    assert other.get('/age-status').json == {'eligibility': 'unknown'}
    assert other.get('/state').status_code == 403


@pytest.mark.parametrize('headers', [{'Origin': 'https://other.example'},
                                      {'Sec-Fetch-Site': 'cross-site'}])
def test_other_origins_cannot_set_eligibility_or_post_game_data(client, headers):
    assert client.post('/age-check', json={'age': 13}, headers=headers).status_code == 403
    assert client.get('/age-status').json == {'eligibility': 'unknown'}
    client.post('/age-check', json={'age': 13})
    assert client.post('/lobby', headers=headers).status_code == 403


def test_live_stream_closes_at_eligibility_expiry(client, monkeypatch):
    now = time.time()
    queue = server.queue.Queue()
    queue.put('test-update')
    monkeypatch.setattr(server.queue, 'Queue', lambda: queue)
    with server.app.test_request_context('/stream'):
        session['age_checked_at'] = now
        response = server.stream()
        iterator = iter(response.response)
        assert next(iterator) == 'data: test-update\n\n'
        assert queue in server.current_state.listeners
        monkeypatch.setattr(server, 'time', SimpleNamespace(time=lambda: now + server.AGE_SESSION_TTL + 1))
        with pytest.raises(StopIteration):
            next(iterator)
        assert queue not in server.current_state.listeners


def test_production_rejects_short_session_signing_keys(monkeypatch):
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setenv('SECRET_KEY', 'too-short')
    with pytest.raises(ConfigError, match='at least 32 characters'):
        validate_production_config()


def test_secure_cookie_and_origin_check_behind_https_alb(client, monkeypatch):
    from werkzeug.middleware.proxy_fix import ProxyFix
    monkeypatch.setitem(server.app.config, 'SESSION_COOKIE_SECURE', True)
    monkeypatch.setattr(server.app, 'wsgi_app', ProxyFix(server.app.wsgi_app, x_for=0, x_proto=1, x_host=0))
    response = client.post('/age-check', json={'age': 13},
                           headers={'X-Forwarded-Proto': 'https', 'Origin': 'https://localhost'})
    assert response.status_code == 200
    assert 'Secure;' in response.headers['Set-Cookie']
