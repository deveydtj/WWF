"""Regression checks for lobbies left by a solo player."""
import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from tests.test_server import load_server


@pytest.fixture
def lobby_env(tmp_path, monkeypatch):
    monkeypatch.setenv('LOBBIES_FILE', str(tmp_path / 'lobbies.json'))
    monkeypatch.setenv('GAME_FILE', str(tmp_path / 'game.json'))
    server, request = load_server()
    server.WORDS = ['apple']
    monkeypatch.setattr(server, 'log_lobby_created', lambda *args: None)
    monkeypatch.setattr(server, 'log_lobby_joined', lambda *args: None)
    code = server.lobby_create()['id']
    request.json = {'emoji': '🐶', 'player_id': 'solo-player'}
    server.lobby_emoji(code)
    return server, request, code


def test_left_lobby_does_not_reappear_after_removal_cooldown(lobby_env, monkeypatch):
    server, request, code = lobby_env
    assert server.lobby_network_list()['lobbies'] == [
        {'id': code, 'players': 1, 'your_emoji': '🐶'}
    ]
    assert server.lobby_leave(code)['lobby_removed'] is True
    assert code not in json.loads(server.LOBBIES_FILE.read_text())
    assert server.lobby_network_list()['lobbies'] == []
    now = server.time.time()
    monkeypatch.setattr(server.time, 'time', lambda: now + server.REMOVAL_COOLDOWN + 1)
    request.method = 'GET'
    server.lobby_state(code)
    assert server.lobby_network_list()['lobbies'] == []


def test_network_list_runs_idle_cleanup(lobby_env):
    server, _, code = lobby_env
    server.LOBBIES[code].last_activity -= server.LOBBY_TTL + 1
    server._last_purge_time = 0
    assert server.lobby_network_list()['lobbies'] == []
    assert code not in server.LOBBIES
    assert code not in json.loads(server.LOBBIES_FILE.read_text())


def test_expired_saved_lobby_cannot_be_restored(lobby_env):
    server, request, code = lobby_env
    lobby = server.LOBBIES[code]
    lobby.last_activity -= server.LOBBY_TTL + 1
    server.save_data(lobby, code)
    server.LOBBIES.pop(code)
    request.method = 'GET'
    assert server.lobby_state(code)[1] == 404
    assert server.lobby_network_list()['lobbies'] == []
    assert code not in json.loads(server.LOBBIES_FILE.read_text())


def test_last_player_kicked_deletes_saved_lobby(lobby_env, monkeypatch):
    server, request, code = lobby_env
    import backend.data_persistence as persistence
    redis = Mock()
    monkeypatch.setattr(persistence, 'redis_client', redis)
    request.json = {'emoji': '🐶', 'host_token': server.LOBBIES[code].host_token}
    assert server.lobby_kick(code)['lobby_removed'] is True
    assert code not in json.loads(server.LOBBIES_FILE.read_text())
    redis.delete.assert_called_once_with(f'wwf:{code}')


@pytest.mark.parametrize('endpoint', ['lobby_list', 'lobby_network_list'])
def test_lobby_lists_are_not_cached(lobby_env, endpoint):
    server, request, _ = lobby_env
    request.endpoint = endpoint
    response = SimpleNamespace(headers={}, status_code=200)
    server.add_cache_control_headers(response)
    assert 'no-store' in response.headers['Cache-Control']


@pytest.mark.parametrize('phase', ['waiting', 'active', 'finished'])
def test_abandoned_solo_lobby_expires_from_network_list(lobby_env, phase):
    server, _, code = lobby_env
    server.LOBBIES[code].phase = phase
    server.LOBBIES[code].last_activity -= server.LOBBY_TTL + 1
    server.force_purge_lobbies()
    assert server.lobby_network_list()['lobbies'] == []


@pytest.mark.parametrize('host_ip, visitor_ip', [
    ('127.0.0.1', '192.168.12.50'),
    ('::1', '192.168.12.50'),
    ('192.168.12.50', '127.0.0.1'),
])
def test_localhost_host_is_discoverable_from_lan(lobby_env, host_ip, visitor_ip):
    server, request, code = lobby_env
    lobby = server.LOBBIES[code]
    lobby.ip_to_emoji = {host_ip: '🐶'}
    request.remote_addr = visitor_ip
    assert server.lobby_network_list()['lobbies'] == [{'id': code, 'players': 1}]


@pytest.mark.parametrize('first, second, expected', [
    ('127.0.0.1', '8.8.8.8', False),
    ('8.8.8.8', '::1', False),
    ('192.168.12.50', '192.168.13.50', False),
    ('192.168.12.50', '192.168.12.60', True),
    ('10.1.2.3', '10.1.2.4', True),
    ('172.20.1.2', '172.20.1.3', True),
    ('172.32.1.2', '172.32.1.3', False),
    ('localhost', '192.168.12.50', True),
    ('::1', '127.0.0.1', True),
    ('invalid', 'invalid', False),
])
def test_network_matching_keeps_public_and_other_subnets_separate(lobby_env, first, second, expected):
    server, _, _ = lobby_env
    assert server._is_same_network(first, second) is expected
