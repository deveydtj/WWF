#!/usr/bin/env python3
"""
Test for the lobby removal fix - ensuring removed lobbies don't get recreated
by subsequent requests and don't appear in network lobbies list.
"""

import sys
import os
import time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import server
import pytest
from unittest.mock import Mock


def test_removed_lobby_not_recreated_by_subsequent_requests():
    """Test that a removed lobby doesn't get recreated by subsequent requests."""
    # Setup test app
    app = server.app.test_client()
    
    # Clear existing lobbies
    server.LOBBIES = {'DEFAULT': server.get_lobby('DEFAULT')}
    server.RECENTLY_REMOVED_LOBBIES = {}
    
    # Create a lobby
    resp = app.post('/lobby', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 200
    data = resp.get_json()
    lobby_code = data['id']
    
    # Add a player to the lobby
    app.post(f'/lobby/{lobby_code}/emoji', 
             json={'emoji': '🐶', 'player_id': 'player1'},
             environ_base={'REMOTE_ADDR': '127.0.0.1'})
    
    # Verify lobby exists and has player
    assert lobby_code in server.LOBBIES
    assert len(server.LOBBIES[lobby_code].leaderboard) == 1
    
    # Have the player leave (last player)
    resp = app.post(f'/lobby/{lobby_code}/leave',
                   json={'emoji': '🐶', 'player_id': 'player1'},
                   environ_base={'REMOTE_ADDR': '127.0.0.1'})
    
    # Verify the leave was successful and lobby was removed
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'ok'
    assert data.get('lobby_removed') == True
    
    # Verify lobby is removed from LOBBIES
    assert lobby_code not in server.LOBBIES
    
    # Verify lobby is tracked in RECENTLY_REMOVED_LOBBIES
    assert lobby_code in server.RECENTLY_REMOVED_LOBBIES
    
    # Now try to access the removed lobby - should get 404, not recreate it
    resp = app.get(f'/lobby/{lobby_code}/state', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 404
    
    # Verify lobby is still not in LOBBIES (wasn't recreated)
    assert lobby_code not in server.LOBBIES
    
    # Try POST request too
    resp = app.post(f'/lobby/{lobby_code}/state',
                   json={},
                   environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 404
    
    # Verify lobby is still not in LOBBIES
    assert lobby_code not in server.LOBBIES


def test_removed_lobby_not_in_network_list():
    """Test that removed lobbies don't appear in the network lobbies list."""
    # Setup test app
    app = server.app.test_client()
    
    # Clear existing lobbies
    server.LOBBIES = {'DEFAULT': server.get_lobby('DEFAULT')}
    server.RECENTLY_REMOVED_LOBBIES = {}
    
    # Create a lobby
    resp = app.post('/lobby', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 200
    data = resp.get_json()
    lobby_code = data['id']
    
    # Add a player to the lobby
    app.post(f'/lobby/{lobby_code}/emoji', 
             json={'emoji': '🐶', 'player_id': 'player1'},
             environ_base={'REMOTE_ADDR': '127.0.0.1'})
    
    # Check that lobby appears in network list
    resp = app.get('/lobbies/network', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data['lobbies']) == 1
    assert data['lobbies'][0]['id'] == lobby_code
    assert data['lobbies'][0]['players'] == 1
    
    # Have the player leave (last player)
    resp = app.post(f'/lobby/{lobby_code}/leave',
                   json={'emoji': '🐶', 'player_id': 'player1'},
                   environ_base={'REMOTE_ADDR': '127.0.0.1'})
    
    # Verify the leave was successful and lobby was removed
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'ok'
    assert data.get('lobby_removed') == True
    
    # Check that lobby no longer appears in network list
    resp = app.get('/lobbies/network', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data['lobbies']) == 0


def test_lobby_recreation_allowed_after_cooldown():
    """Test that lobbies can be recreated after the cooldown period."""
    # Setup test app  
    app = server.app.test_client()
    
    # Clear existing lobbies
    server.LOBBIES = {'DEFAULT': server.get_lobby('DEFAULT')}
    server.RECENTLY_REMOVED_LOBBIES = {}
    
    # Create a lobby
    resp = app.post('/lobby', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 200
    data = resp.get_json()
    lobby_code = data['id']
    
    # Add a player to the lobby
    app.post(f'/lobby/{lobby_code}/emoji', 
             json={'emoji': '🐶', 'player_id': 'player1'},
             environ_base={'REMOTE_ADDR': '127.0.0.1'})
    
    # Have the player leave (last player)
    resp = app.post(f'/lobby/{lobby_code}/leave',
                   json={'emoji': '🐶', 'player_id': 'player1'},
                   environ_base={'REMOTE_ADDR': '127.0.0.1'})
    
    # Verify lobby was removed
    assert lobby_code not in server.LOBBIES
    assert lobby_code in server.RECENTLY_REMOVED_LOBBIES
    
    # Simulate cooldown period passing by directly setting the removal time
    server.RECENTLY_REMOVED_LOBBIES[lobby_code] = time.time() - server.REMOVAL_COOLDOWN - 1
    
    # Now accessing the lobby should recreate it
    resp = app.get(f'/lobby/{lobby_code}/state', environ_base={'REMOTE_ADDR': '127.0.0.1'})
    assert resp.status_code == 200
    
    # Verify lobby was recreated
    assert lobby_code in server.LOBBIES


if __name__ == "__main__":
    test_removed_lobby_not_recreated_by_subsequent_requests()
    test_removed_lobby_not_in_network_list()
    test_lobby_recreation_allowed_after_cooldown()
    print("All tests passed!")