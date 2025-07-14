"""Tests for server update notification functionality."""

import json
import time
import threading
import queue
from unittest.mock import patch

import pytest
from backend.server import app, LOBBIES, GameState, broadcast_server_update_notification


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_broadcast_server_update_notification():
    """Test that server update notifications are broadcast to all lobbies."""
    # Create test lobbies with mock listeners
    test_queues = []
    
    # Create a couple of test lobbies
    for lobby_id in ['TEST01', 'TEST02']:
        lobby = GameState()
        q1 = queue.Queue()
        q2 = queue.Queue()
        lobby.listeners = {q1, q2}
        LOBBIES[lobby_id] = lobby
        test_queues.extend([q1, q2])
    
    try:
        # Broadcast server update notification
        test_message = "Test server update message"
        test_delay = 10
        
        broadcast_server_update_notification(test_message, test_delay)
        
        # Check that all queues received the message
        for q in test_queues:
            assert not q.empty(), "Queue should have received a message"
            data = json.loads(q.get_nowait())
            assert data['type'] == 'server_update'
            assert data['message'] == test_message
            assert data['delay_seconds'] == test_delay
            assert 'timestamp' in data
    
    finally:
        # Clean up test lobbies
        for lobby_id in ['TEST01', 'TEST02']:
            LOBBIES.pop(lobby_id, None)


def test_notify_server_update_endpoint_success(client):
    """Test the /admin/notify-update endpoint with valid request."""
    response = client.post(
        '/admin/notify-update',
        json={
            'message': 'Custom update message',
            'delay_seconds': 8
        }
    )
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'ok'
    assert data['message'] == 'Custom update message'
    assert data['delay_seconds'] == 8
    assert 'lobbies_notified' in data


def test_notify_server_update_endpoint_defaults(client):
    """Test the /admin/notify-update endpoint with default values."""
    response = client.post('/admin/notify-update')
    
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['status'] == 'ok'
    assert data['message'] == 'Server is being updated. Please save your progress.'
    assert data['delay_seconds'] == 5


def test_notify_server_update_endpoint_invalid_delay(client):
    """Test the /admin/notify-update endpoint with invalid delay."""
    response = client.post(
        '/admin/notify-update',
        json={'delay_seconds': 100}  # Too high
    )
    
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['status'] == 'error'
    assert 'delay_seconds must be an integer between 1 and 60' in data['msg']


def test_notify_server_update_endpoint_invalid_delay_too_low(client):
    """Test the /admin/notify-update endpoint with delay too low."""
    response = client.post(
        '/admin/notify-update',
        json={'delay_seconds': 0}
    )
    
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['status'] == 'error'


def test_notify_server_update_endpoint_invalid_delay_type(client):
    """Test the /admin/notify-update endpoint with invalid delay type."""
    response = client.post(
        '/admin/notify-update',
        json={'delay_seconds': 'invalid'}
    )
    
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data['status'] == 'error'


def test_server_update_with_active_lobby():
    """Test server update notification with an actual lobby with listeners."""
    # Create a real lobby with listeners
    lobby = GameState()
    q = queue.Queue()
    lobby.listeners.add(q)
    LOBBIES['ACTIVE'] = lobby
    
    try:
        broadcast_server_update_notification("Test message", 3)
        
        # Verify the message was received
        assert not q.empty()
        data = json.loads(q.get_nowait())
        assert data['type'] == 'server_update'
        assert data['message'] == "Test message"
        assert data['delay_seconds'] == 3
        
    finally:
        LOBBIES.pop('ACTIVE', None)


def test_server_update_with_no_lobbies():
    """Test server update notification when no lobbies exist."""
    # Temporarily clear all lobbies
    original_lobbies = LOBBIES.copy()
    LOBBIES.clear()
    
    try:
        # This should not raise an error even with no lobbies
        broadcast_server_update_notification("Test message", 5)
        
    finally:
        # Restore original lobbies
        LOBBIES.update(original_lobbies)