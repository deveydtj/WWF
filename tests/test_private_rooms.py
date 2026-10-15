"""HTTP acceptance checks for plan #563; no mocked authorization decisions."""
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend import server
from tests.test_age_eligibility import client  # isolated persistence and public state

HEADERS = {'Origin': 'http://localhost', 'X-WordSquad-Request': '1'}


def post(client, path, body=None):
    return client.post(path, json=body or {}, headers=HEADERS)


def browser():
    client = server.app.test_client()
    assert client.post('/age-check', json={'age': 20}).status_code == 200
    return client


@pytest.fixture
def room(client, tmp_path, monkeypatch):
    monkeypatch.setattr(server.private_rooms, 'file', tmp_path / 'private.json')
    monkeypatch.setattr(server, 'API_REQUEST_TIMES', {})
    monkeypatch.setattr(server, 'GUESS_REQUEST_TIMES', {})
    monkeypatch.setenv('FLASK_ENV', 'development')
    client.post('/age-check', json={'age': 20})
    response = post(client, '/lobby', {'private': True})
    assert response.status_code == 200, response.json
    code = response.json['id']
    identity = post(client, f'/lobby/{code}/emoji', {'emoji': '🐶'}).json
    invitation = post(client, f'/lobby/{code}/admission', {'action': 'rotate'}).json['invitation']
    return client, code, identity, invitation


def approve(host, code, guest, invitation, name='Friend'):
    response = post(guest, '/private/exchange', {'invitation': invitation, 'name': name})
    assert response.status_code == 200, response.json
    pending = host.get(f'/lobby/{code}/admission').json['pending']
    entry = next(item for item in pending if item['name'] == name)
    assert post(host, f'/lobby/{code}/admission', {'action': 'approve', 'id': entry['id']}).status_code == 200
    assert guest.get('/private/request', query_string={'room': code}).json['status'] == 'approved'
    return post(guest, f'/lobby/{code}/emoji', {'emoji': '🦊'}).json


@pytest.mark.parametrize('method,suffix', [
    ('GET', 'state'), ('POST', 'state'), ('GET', 'chat'), ('POST', 'chat'),
    ('GET', 'stream'), ('POST', 'emoji'), ('POST', 'guess'), ('POST', 'hint'),
    ('POST', 'reset'), ('POST', 'kick'), ('POST', 'leave'), ('GET', 'admission'), ('POST', 'admission')])
def test_outsiders_and_pending_guests_cannot_access_private_routes(room, method, suffix):
    host, code, identity, invitation = room
    outsider = browser()
    for pending in (False, True):
        if pending:
            assert post(outsider, '/private/exchange', {'invitation': invitation, 'name': 'Friend'}).status_code == 200
        response = outsider.open(f'/lobby/{code}/{suffix}', method=method, json=identity, headers=HEADERS)
        assert response.status_code == 404
        assert response.json == {'status': 'error', 'msg': 'Room unavailable'}
        assert 'no-store' in response.headers['Cache-Control']


def test_hidden_from_discovery_legacy_routes_and_assets(room):
    host, code, identity, invitation = room
    outsider = browser()
    for client in (host, outsider):
        for path in ('/lobbies', '/lobbies/network', '/state', '/chat'):
            response = client.get(path)
            assert code not in response.text and invitation not in response.text
            assert '🐶' not in response.text
    for path in ('/private.json', '/runtime/private-rooms.json', '/lobbies.json', '/static/../runtime/private-rooms.json'):
        response = outsider.get(path)
        assert invitation not in response.text and identity['player_id'] not in response.text
    before = set(server.LOBBIES)
    assert outsider.get('/lobby/ZZZZZZ/state').status_code == 404
    assert set(server.LOBBIES) == before
    assert code not in server.LOBBIES
    raw = server.private_rooms.file.read_text()
    assert invitation not in raw
    assert host.get_cookie('wordsquad_room_session').value not in raw


def test_approved_guest_plays_but_cannot_impersonate_or_manage(room):
    host, code, host_identity, invitation = room
    guest = browser()
    identity = approve(host, code, guest, invitation)
    base = f'/lobby/{code}'
    assert post(guest, base + '/chat', {**identity, 'text': 'Hello'}).status_code == 200
    assert guest.get(base + '/chat').json['messages'][0]['text'] == 'Hello'
    assert post(guest, base + '/state', host_identity).status_code == 403
    assert post(guest, base + '/emoji', host_identity).status_code == 403
    assert post(guest, base + '/guess', {**host_identity, 'guess': 'apple'}).status_code == 403
    for suffix in ('reset', 'kick', 'admission'):
        assert post(guest, base + '/' + suffix, host_identity).status_code == 404
    with server.private_rooms.store() as shared:
        word = shared['rooms'][code]['game']['target_word']
    assert post(guest, base + '/guess', {**identity, 'guess': word}).status_code == 200
    assert guest.get(base + '/state').json['is_over'] is True
    assert post(host, base + '/reset').status_code == 200


def test_lock_rotation_rejection_kick_and_new_explicit_approval(room):
    host, code, _, invitation = room
    guest = browser()
    url = f'/lobby/{code}/admission'
    post(guest, '/private/exchange', {'invitation': invitation, 'name': 'Friend'})
    pending_id = host.get(url).json['pending'][0]['id']
    assert post(host, url, {'action': 'lock', 'locked': True}).status_code == 200
    assert post(host, url, {'action': 'approve', 'id': pending_id}).status_code == 409
    assert post(browser(), '/private/exchange', {'invitation': invitation, 'name': 'Other'}).status_code == 404
    post(host, url, {'action': 'lock', 'locked': False})
    rotated = post(host, url, {'action': 'rotate'}).json['invitation']
    assert guest.get('/private/request', query_string={'room': code}).status_code == 404
    assert post(host, url, {'action': 'approve', 'id': pending_id}).status_code == 404
    assert post(guest, '/private/exchange', {'invitation': invitation, 'name': 'Friend'}).status_code == 404
    identity = approve(host, code, guest, rotated)
    post(host, f'/lobby/{code}/kick', {'emoji': identity['emoji']})
    assert guest.get(f'/lobby/{code}/state').status_code == 404
    assert post(guest, '/private/exchange', {'invitation': rotated, 'name': 'Friend'}).json['status'] == 'pending'
    pending_id = host.get(url).json['pending'][0]['id']
    post(host, url, {'action': 'reject', 'id': pending_id})
    assert guest.get('/private/request', query_string={'room': code}).status_code == 404


def test_stream_revocation_and_connection_bounds(room, monkeypatch):
    host, code, _, invitation = room
    guest = browser()
    identity = approve(host, code, guest, invitation)
    monkeypatch.setattr(server.private_rooms, 'streams_per_member', 1)
    response = guest.get(f'/lobby/{code}/stream', buffered=False)
    iterator = iter(response.response)
    assert b'data:' in next(iterator)
    assert guest.get(f'/lobby/{code}/stream').status_code == 429
    post(host, f'/lobby/{code}/kick', {'emoji': identity['emoji']})
    with pytest.raises(StopIteration):
        next(iterator)
    response.close()


def test_restart_expiry_and_corrupt_storage_fail_closed(room):
    host, code, _, invitation = room
    guest = browser()
    identity = approve(host, code, guest, invitation)
    # A fresh store reader (as after a process restart) restores membership.
    assert guest.get('/private/context', query_string={'room': code}).json['player_id'] == identity['player_id']
    with server.private_rooms.store() as shared:
        record = shared['rooms'][code]
        sid = next(key for key, member in record['members'].items() if member['player_id'] == identity['player_id'])
        record['members'][sid]['expires'] = time.time() - 1
    assert guest.get(f'/lobby/{code}/state').status_code == 404
    server.private_rooms.file.write_text('{broken')
    assert host.get(f'/lobby/{code}/state').status_code == 503
    server.private_rooms.file.unlink()
    assert host.get(f'/lobby/{code}/state').status_code == 404


def test_leave_revokes_guest_and_host_leave_deletes_room(room):
    host, code, identity, invitation = room
    guest = browser()
    approve(host, code, guest, invitation)
    assert post(guest, f'/lobby/{code}/leave').status_code == 200
    assert guest.get(f'/lobby/{code}/state').status_code == 404
    assert post(host, f'/lobby/{code}/leave').json['lobby_removed'] is True
    assert host.get(f'/lobby/{code}/state').status_code == 404
    assert post(guest, '/private/exchange', {'invitation': invitation, 'name': 'Friend'}).status_code == 404


def test_csrf_limits_and_malformed_requests(room, monkeypatch):
    host, code, _, invitation = room
    for headers in ({}, {'Origin': 'https://evil.test', 'X-WordSquad-Request': '1'}):
        assert host.post(f'/lobby/{code}/reset', json={}, headers=headers).status_code == 403
        assert host.post('/private/exchange', json={'invitation': invitation, 'name': 'Guest'}, headers=headers).status_code == 403
        assert host.post('/lobby', json={'private': True}, headers=headers).status_code == 403
    assert host.post(f'/lobby/{code}/guess', json=[], headers=HEADERS).status_code == 400
    assert post(host, f'/lobby/{code}/guess', {'guess': {}}).status_code == 400
    monkeypatch.setattr(server.private_rooms, 'max_pending', 1)
    assert post(browser(), '/private/exchange', {'invitation': invitation, 'name': 'A'}).status_code == 200
    assert post(browser(), '/private/exchange', {'invitation': invitation, 'name': 'B'}).status_code == 429
    probe = browser()
    for _ in range(30):
        assert post(probe, '/private/exchange', {'invitation': 'invalid', 'name': 'A'}).status_code == 404
    assert post(probe, '/private/exchange', {'invitation': 'invalid', 'name': 'A'}).status_code == 429


def test_public_lobbies_on_same_ip_still_work_and_context_is_isolated(room):
    host, private_code, _, invitation = room
    public = browser()
    code = post(public, '/lobby').json['id']
    first = post(public, f'/lobby/{code}/emoji', {'emoji': '🐸'}).json
    second = browser()
    other = post(second, f'/lobby/{code}/emoji', {'emoji': '🐸'}).json
    assert other['player_id'] != first['player_id']
    assert other['emoji'] != first['emoji']
    assert code in [item['id'] for item in second.get('/lobbies/network').json['lobbies']]
    with ThreadPoolExecutor(max_workers=2) as pool:
        private_future = pool.submit(lambda: host.get(f'/lobby/{private_code}/state').json)
        public_future = pool.submit(lambda: public.get(f'/lobby/{code}/state').json)
        assert private_future.result()['active_emojis'] == ['🐶']
        assert set(public_future.result()['active_emojis']) == {'🐸', '🐸-red'}
    assert server._state() is server.current_state


def test_public_contexts_overlap_without_global_switch(room):
    host, _, _, _ = room
    codes = [post(host, '/lobby').json['id'] for _ in range(2)]
    barrier = threading.Barrier(2)
    def read(code):
        with server.app.test_request_context():
            def selected():
                before = server._state()
                barrier.wait(timeout=3)
                assert before is server._state()
                return server._lobby_id(server._state())
            return server._with_lobby(code, selected)
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(read, codes)) == codes


def test_operator_routes_require_dedicated_token(room, monkeypatch):
    host, _, _, _ = room
    monkeypatch.setenv('OPERATOR_TOKEN', 'operator-test-secret')
    for path in ('/internal/purge', '/admin/notify-update'):
        assert post(host, path).status_code == 403
        assert server.app.test_client().post(path, json={}, headers={'Authorization': 'Bearer operator-test-secret'}).status_code == 200


def test_production_never_falls_back_to_local_storage(room, monkeypatch):
    host, code, _, _ = room
    monkeypatch.setenv('FLASK_ENV', 'production')
    monkeypatch.setenv('PUBLIC_ORIGIN', 'https://wordsquad.test')
    assert host.get(f'/lobby/{code}/state').status_code == 503


def test_secure_session_cookie_and_session_bound_pending_request(client, tmp_path, monkeypatch):
    monkeypatch.setattr(server.private_rooms, 'file', tmp_path / 'private.json')
    monkeypatch.setitem(server.app.config, 'SESSION_COOKIE_SECURE', True)
    client.post('/age-check', json={'age': 20})
    created = post(client, '/lobby', {'private': True})
    cookie = created.headers['Set-Cookie']
    assert 'Secure' in cookie and 'HttpOnly' in cookie and 'SameSite=Strict' in cookie
    assert 'Expires=' not in cookie


def test_shared_redis_survives_new_process_and_revocation(client, tmp_path, monkeypatch):
    """Run with an isolated WORDSQUAD_TEST_REDIS_URL; never a production store."""
    import os
    import subprocess
    import sys
    import redis
    url = os.environ.get('WORDSQUAD_TEST_REDIS_URL')
    if not url:
        pytest.skip('Requires isolated Redis integration server')
    connection = redis.Redis.from_url(url)
    connection.delete('wwf:private:v1', 'wwf:private:lock')
    monkeypatch.setattr(server, 'redis_client', connection)
    monkeypatch.setattr(server.private_rooms, 'file', tmp_path / 'unused.json')
    client.post('/age-check', json={'age': 20})
    created = post(client, '/lobby', {'private': True})
    assert created.status_code == 200, created.json
    code = created.json['id']
    invitation = post(client, f'/lobby/{code}/admission', {'action': 'rotate'}).json['invitation']
    guest = browser()
    identity = approve(client, code, guest, invitation)
    script = '''
import json, sys
from backend import server
body = json.load(sys.stdin)
client = server.app.test_client()
client.post('/age-check', json={'age': 20})
client.set_cookie('wordsquad_room_session', body['session'])
response = client.get('/lobby/' + body['code'] + '/state')
print(response.status_code)
'''
    def another_process():
        result = subprocess.run([sys.executable, '-c', script], input=json.dumps({
            'session': guest.get_cookie('wordsquad_room_session').value, 'code': code}),
            text=True, capture_output=True, check=True,
            env={**os.environ, 'REDIS_URL': url, 'FLASK_ENV': 'development'})
        return int(result.stdout.strip())
    assert another_process() == 200
    assert post(client, f'/lobby/{code}/kick', {'emoji': identity['emoji']}).status_code == 200
    assert another_process() == 404
    assert not server.private_rooms.file.exists()
    # A stale worker cannot commit after losing its transaction lease.
    with pytest.raises(RuntimeError):
        with server.private_rooms.store() as data:
            data['rooms'].clear()
            connection.delete('wwf:private:lock')
    assert code in json.loads(connection.get('wwf:private:v1'))['rooms']
    # Failed Redis operations must not silently use the local fallback.
    monkeypatch.setattr(connection, 'get', lambda *args: (_ for _ in ()).throw(ConnectionError('offline')))
    assert client.get(f'/lobby/{code}/state').status_code == 503
    assert not server.private_rooms.file.exists()


def test_expired_invitation_cross_room_access_and_history_bounds(room, monkeypatch):
    host, code, _, invitation = room
    guest = browser()
    identity = approve(host, code, guest, invitation)
    other = post(host, '/lobby', {'private': True}).json['id']
    assert guest.get(f'/lobby/{other}/state').status_code == 404
    with server.private_rooms.store() as shared:
        shared['rooms'][code]['invite_expires'] = time.time() - 1
    assert post(browser(), '/private/exchange', {'invitation': invitation, 'name': 'Late'}).status_code == 404
    assert guest.get(f'/lobby/{code}/state').status_code == 200
    monkeypatch.setattr(server.private_rooms, 'max_history', 2)
    for _ in range(4):
        assert post(host, f'/lobby/{code}/reset').status_code == 200
    assert len(host.get(f'/lobby/{code}/state').json['past_games']) == 2
    assert identity['player_id'] == guest.get('/private/context', query_string={'room': code}).json['player_id']
