"""Basic functionality test for WordSquad application."""

import pytest
from backend.server import app


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_app_responds(client):
    """Test that the app responds to basic requests."""
    # Test that the root endpoint responds
    response = client.get('/')
    assert response.status_code == 200
    
    # Test that the health endpoint responds if it exists
    response = client.get('/health')
    # Health endpoint should either return 200 or 404 (if not implemented)
    assert response.status_code in [200, 404]


def test_lobby_creation(client):
    """Test basic lobby creation functionality."""
    # Test POST to create lobby
    response = client.post('/lobby')
    assert response.status_code == 200
    
    # Response should contain a lobby ID
    data = response.get_json()
    assert 'id' in data
    assert len(data['id']) == 6  # Lobby codes should be 6 characters
    assert data['id'].isalnum()  # Should be alphanumeric