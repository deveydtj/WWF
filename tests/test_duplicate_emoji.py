"""Tests for duplicate emoji handling functionality."""

import requests
import pytest


def test_duplicate_emoji_variants_integration():
    """Test that duplicate emoji selection now assigns variants instead of rejecting."""
    # This is an integration test that requires the server to be running
    # Skip if server is not available
    try:
        base_url = 'http://localhost:5001'
        
        # Create a lobby
        resp = requests.post(f'{base_url}/lobby', json={}, timeout=2)
        if resp.status_code != 200:
            pytest.skip("Server not available for integration test")
        
        lobby_data = resp.json()
        lobby_code = lobby_data['id']
        
        # First player selects an emoji
        resp1 = requests.post(f'{base_url}/lobby/{lobby_code}/emoji', json={
            'emoji': '🐶',
            'player_id': 'test_player1'
        }, timeout=2)
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1['status'] == 'ok'
        assert data1['emoji'] == '🐶'  # First player gets base emoji
        
        # Second player tries same emoji - should get variant
        resp2 = requests.post(f'{base_url}/lobby/{lobby_code}/emoji', json={
            'emoji': '🐶',
            'player_id': 'test_player2'
        }, timeout=2)
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2['status'] == 'ok'
        assert data2['emoji'] == '🐶-red'  # Second player gets red variant
        assert data2['base_emoji'] == '🐶'
        
        # Third player tries same emoji - should get different variant
        resp3 = requests.post(f'{base_url}/lobby/{lobby_code}/emoji', json={
            'emoji': '🐶',
            'player_id': 'test_player3'
        }, timeout=2)
        assert resp3.status_code == 200
        data3 = resp3.json()
        assert data3['status'] == 'ok'
        assert data3['emoji'] == '🐶-blue'  # Third player gets blue variant
        assert data3['base_emoji'] == '🐶'
        
        # Verify lobby state shows all variants
        resp4 = requests.get(f'{base_url}/lobby/{lobby_code}/state', timeout=2)
        assert resp4.status_code == 200
        state = resp4.json()
        
        active_emojis = state.get('active_emojis', [])
        assert '🐶' in active_emojis
        assert '🐶-red' in active_emojis
        assert '🐶-blue' in active_emojis
        assert len([e for e in active_emojis if e.startswith('🐶')]) == 3
        
    except requests.exceptions.RequestException:
        pytest.skip("Server not available for integration test")