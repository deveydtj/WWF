"""Only the player who revealed a Daily Double hint may read its letter."""
import pytest

from backend import server
from tests.test_age_eligibility import client  # noqa: F401 - isolated public state
from tests.test_private_rooms import HEADERS, approve, browser, post, room  # noqa: F401

LETTER = {'row': 1, 'col': 2, 'letter': 'q'}


def join_public(test_client, emoji):
    assert test_client.post('/age-check', json={'age': 20}).status_code == 200
    response = test_client.post('/emoji', json={'emoji': emoji}, headers=HEADERS)
    assert response.status_code == 200, response.json
    return response.json['player_id']


@pytest.fixture
def public_hint(client):  # noqa: F811
    owner_id = join_public(client, '🐶')
    server.current_state.daily_double_revealed['🐶'] = dict(LETTER)
    return client, owner_id


def test_public_owner_reads_own_hint_with_player_header(public_hint):
    owner, owner_id = public_hint
    response = owner.get('/state', query_string={'emoji': '🐶'},
                         headers={server.PLAYER_HEADER: owner_id})
    assert response.status_code == 200
    assert response.json['daily_double_hint'] == LETTER


@pytest.mark.parametrize('player_id', [None, '', 'f' * 32])
def test_public_hint_is_hidden_without_the_players_id(public_hint, player_id):
    _, owner_id = public_hint
    stranger = server.app.test_client()
    join_public(stranger, '🦊')
    headers = {} if player_id is None else {server.PLAYER_HEADER: player_id}
    response = stranger.get('/state', query_string={'emoji': '🐶'}, headers=headers)
    assert response.status_code == 200
    assert 'daily_double_hint' not in response.json
    assert 'q' not in [value for value in response.json.values() if isinstance(value, str)]
    # Shared state stays readable.
    assert response.json['active_emojis'] == ['🐶', '🦊']
    assert owner_id not in response.text


def test_public_hint_is_hidden_from_an_unregistered_age_eligible_browser(public_hint):
    stranger = browser()
    response = stranger.get('/state', query_string={'emoji': '🐶'})
    assert response.status_code == 200
    assert 'daily_double_hint' not in response.json


def reveal_in_room(code, emoji):
    with server.private_rooms.store() as data:
        data['rooms'][code]['game']['daily_double_revealed'][emoji] = dict(LETTER)


def test_private_guest_cannot_read_hosts_hint_by_emoji(room):  # noqa: F811
    host, code, identity, invitation = room
    guest = browser()
    guest_identity = approve(host, code, guest, invitation)
    reveal_in_room(code, identity['emoji'])

    for headers in ({}, {server.PLAYER_HEADER: identity['player_id']}):
        response = guest.get(f'/lobby/{code}/state', query_string={'emoji': identity['emoji']},
                             headers=headers)
        assert response.status_code == 200
        assert response.json.get('daily_double_hint') is None
    assert guest_identity['emoji'] != identity['emoji']

    # The host's own session still sees it, whatever emoji the URL names.
    for emoji in (identity['emoji'], guest_identity['emoji']):
        response = host.get(f'/lobby/{code}/state', query_string={'emoji': emoji})
        assert response.json['daily_double_hint'] == LETTER
