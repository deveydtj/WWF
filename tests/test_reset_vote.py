"""Squad votes: mid-round resets need a majority and refund only that round."""
import time

import pytest

from backend import server
from tests.test_age_eligibility import client  # noqa: F401 - isolated persistence
from tests.test_private_rooms import HEADERS, approve, browser, post, room  # noqa: F401

# None of these share a letter with "fjord", so they score as misses.
MISSES = ['abuse', 'beach', 'aisle', 'album', 'vixen', 'swamp']


@pytest.fixture
def lobby(client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(server, 'API_REQUEST_TIMES', {})
    monkeypatch.setattr(server, 'GUESS_REQUEST_TIMES', {})
    client.post('/age-check', json={'age': 20})
    code = post(client, '/lobby').json['id']
    server.LOBBIES[code].target_word = 'fjord'

    def join(emoji):
        player = browser()
        identity = post(player, f'/lobby/{code}/emoji', {'emoji': emoji}).json
        return player, {'emoji': identity['emoji'], 'player_id': identity['player_id']}

    return code, join


def guess(player, code, identity, word):
    response = post(player, f'/lobby/{code}/guess', {**identity, 'guess': word})
    assert response.status_code == 200, response.json
    return response.json


def vote(player, code, identity, choice='yes'):
    return post(player, f'/lobby/{code}/vote-reset', {**identity, 'vote': choice})


def scores(code):
    return {e: v['score'] for e, v in server.LOBBIES[code].leaderboard.items()}


def test_passed_vote_refunds_only_the_unfinished_round(lobby):
    code, join = lobby
    a, ida = join('🐶')
    b, idb = join('🐱')
    state = server.LOBBIES[code]

    # Round 1 is settled by finding the word: its points stay.
    guess(b, code, idb, 'frond')
    guess(a, code, ida, 'fjord')
    settled = scores(code)
    assert settled['🐶'] > 0
    assert vote(b, code, idb).json['outcome'] == 'new_word'
    assert scores(code) == settled

    # Round 2 is scrapped by the squad: its points are refunded.
    state.target_word = 'crane'
    guess(a, code, ida, 'crate')
    guess(b, code, idb, 'crave')
    assert scores(code) != settled
    first = vote(a, code, ida).json
    assert first['outcome'] == 'pending'
    assert first['vote']['needed'] == 2
    second = vote(b, code, idb).json
    assert second['outcome'] == 'passed'
    assert scores(code) == settled
    assert state.guesses == [] and state.round_points == {}
    assert all(entry['voided'] for entry in state.past_games[-1])
    assert not any(entry.get('voided') for entry in state.past_games[-2])
    result = a.get(f'/lobby/{code}/state').json['reset_vote_result']
    assert result['outcome'] == 'passed' and result['yes'] == 2


def test_squad_can_vote_a_reset_down_and_must_wait_to_call_again(lobby):
    code, join = lobby
    (a, ida), (b, idb), (c, idc) = join('🐶'), join('🐱'), join('🦊')
    guess(a, code, ida, 'frond')
    before = scores(code)
    assert vote(a, code, ida).json['outcome'] == 'pending'
    assert vote(b, code, idb, 'no').json['outcome'] == 'pending'
    assert vote(c, code, idc, 'no').json['outcome'] == 'failed'
    state = server.LOBBIES[code]
    assert state.reset_vote is None and len(state.guesses) == 1
    assert scores(code) == before
    again = vote(a, code, ida)
    assert again.status_code == 409 and 'Try again' in again.json['msg']


def test_vote_runs_out_of_time(lobby):
    code, join = lobby
    (a, ida), (b, idb) = join('🐶'), join('🐱')
    guess(a, code, ida, 'frond')
    vote(a, code, ida)
    server.LOBBIES[code].reset_vote['expires'] = time.time() - 1
    assert a.get(f'/lobby/{code}/state').json['reset_vote'] is None
    post(b, f'/lobby/{code}/state', idb)  # heartbeat closes it for everyone
    state = server.LOBBIES[code]
    assert state.reset_vote is None
    assert state.reset_vote_result['outcome'] == 'expired'
    assert len(state.guesses) == 1


def test_finding_the_word_settles_an_open_vote_and_keeps_points(lobby):
    code, join = lobby
    (a, ida), (b, idb) = join('🐶'), join('🐱')
    guess(a, code, ida, 'frond')
    vote(a, code, ida)
    guess(b, code, idb, 'fjord')
    kept = scores(code)
    state = server.LOBBIES[code]
    assert state.reset_vote is None
    assert state.reset_vote_result['outcome'] == 'settled'
    assert vote(a, code, ida).json['outcome'] == 'new_word'
    assert scores(code) == kept


def test_full_board_without_the_word_keeps_points(lobby):
    code, join = lobby
    a, ida = join('🐶')
    for word in MISSES:
        guess(a, code, ida, word)
    state = server.LOBBIES[code]
    assert state.is_over
    lost = scores(code)['🐶']
    assert lost < 0  # includes the failed-final-row penalty
    assert vote(a, code, ida).json['outcome'] == 'new_word'
    assert scores(code)['🐶'] == lost


def test_host_reset_cannot_skip_the_vote_mid_round(lobby, client):  # noqa: F811
    code, join = lobby
    a, ida = join('🐶')
    token = server.LOBBIES[code].host_token
    # An untouched board has nothing at stake.
    assert post(client, f'/lobby/{code}/reset', {'host_token': token}).status_code == 200
    server.LOBBIES[code].target_word = 'fjord'
    guess(a, code, ida, 'frond')
    response = post(client, f'/lobby/{code}/reset', {'host_token': token})
    assert response.status_code == 409
    assert len(server.LOBBIES[code].guesses) == 1


def test_idle_players_do_not_block_and_late_joiners_sit_out(lobby):
    code, join = lobby
    (a, ida), (b, idb) = join('🐶'), join('🐱')
    guess(a, code, ida, 'frond')
    server.LOBBIES[code].leaderboard[idb['emoji']]['last_active'] = 0
    # The only active player is a majority of one.
    assert vote(a, code, ida).json['outcome'] == 'passed'

    server.LOBBIES[code].target_word = 'fjord'
    guess(a, code, ida, 'frond')
    post(b, f'/lobby/{code}/state', idb)
    assert vote(a, code, ida).json['outcome'] == 'pending'
    late, idl = join('🦊')
    response = vote(late, code, idl)
    assert response.status_code == 409 and 'before you joined' in response.json['msg']


def test_leaving_player_takes_their_round_points_and_vote_with_them(lobby):
    code, join = lobby
    (a, ida), (b, idb), (c, idc) = join('🐶'), join('🐱'), join('🦊')
    guess(c, code, idc, 'frond')
    vote(a, code, ida)
    assert post(c, f'/lobby/{code}/leave', idc).status_code == 200
    assert idc['emoji'] not in server.LOBBIES[code].round_points
    # Two eligible players remain, so one more yes passes.
    assert vote(b, code, idb).json['outcome'] == 'passed'


def test_changing_emoji_mid_round_keeps_the_refund(lobby):
    code, join = lobby
    a, ida = join('🐶')
    guess(a, code, ida, 'frond')
    changed = post(a, f'/lobby/{code}/emoji', {'emoji': '🐸', 'player_id': ida['player_id']}).json
    ida = {'emoji': changed['emoji'], 'player_id': ida['player_id']}
    assert vote(a, code, ida).json['outcome'] == 'passed'
    assert scores(code)['🐸'] == 0


def test_private_room_guests_vote_but_only_the_host_starts_the_next_word(room):  # noqa: F811
    host, code, host_identity, invitation = room
    guest = browser()
    identity = approve(host, code, guest, invitation)
    base = f'/lobby/{code}'
    with server.private_rooms.store() as shared:
        shared['rooms'][code]['game']['target_word'] = 'fjord'
    assert post(guest, base + '/guess', {'guess': 'beach'}).status_code == 200
    started = post(guest, base + '/vote-reset', {'vote': 'yes'})
    assert started.json['outcome'] == 'pending', started.json
    assert host.get(base + '/state').json['reset_vote']['starter'] == identity['emoji']
    assert post(host, base + '/vote-reset', {'vote': 'yes'}).json['outcome'] == 'passed'
    state = host.get(base + '/state').json
    assert state['guesses'] == []
    assert all(entry['score'] == 0 for entry in state['leaderboard'])

    with server.private_rooms.store() as shared:
        word = shared['rooms'][code]['game']['target_word']
    assert post(guest, base + '/guess', {'guess': word}).status_code == 200
    assert post(guest, base + '/vote-reset', {'vote': 'yes'}).status_code == 403
    assert post(host, base + '/vote-reset', {'vote': 'yes'}).json['outcome'] == 'new_word'
